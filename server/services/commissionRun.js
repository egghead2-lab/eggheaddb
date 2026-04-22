/**
 * Commission run orchestration — creates runs, persists engine output, moves through the lifecycle.
 * Lifecycle (spec §6.1): draft → pending_approval → approved → finalized.
 * Reopen: finalized → new draft linked via rerun_of; old marked superseded on re-finalize.
 */
const pool = require('../db/pool');
const { calcRun, getPlanForDate } = require('./commissionEngine');

async function logAudit(runId, lineId, action, actorId, before, after, reason) {
  await pool.query(
    `INSERT INTO commission_run_audit (commission_run_id, commission_run_line_id, action, actor_user_id, before_value, after_value, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [runId, lineId || null, action, actorId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, reason || null]
  );
}

/**
 * Create a new run (draft) for (userId, periodStart..periodEnd).
 * If there's already an active non-superseded run for this (user_id, period), return it instead.
 */
async function createRun(userId, periodStart, periodEnd, actorId) {
  const [[existing]] = await pool.query(
    `SELECT id FROM commission_run
     WHERE user_id = ? AND period_start = ? AND active = 1 AND status != 'superseded'
     LIMIT 1`,
    [userId, periodStart]
  );
  if (existing) return { id: existing.id, existed: true };

  const plan = await getPlanForDate(userId, periodEnd);
  if (!plan) throw new Error(`No commission plan in effect for user ${userId} on ${periodEnd}`);

  const [result] = await pool.query(
    `INSERT INTO commission_run (user_id, period_start, period_end, plan_id, status)
     VALUES (?, ?, ?, ?, 'draft')`,
    [userId, periodStart, periodEnd, plan.id]
  );
  await logAudit(result.insertId, null, 'created', actorId);
  return { id: result.insertId, existed: false };
}

/**
 * Build lines + totals via the engine and persist.
 * Preserves admin decisions (approved, excluded, overrides, notes) on lines where program_id matches.
 */
async function calculateRun(runId, actorId) {
  const [[run]] = await pool.query(`SELECT * FROM commission_run WHERE id = ?`, [runId]);
  if (!run) throw new Error('Run not found');
  if (run.status === 'finalized' || run.status === 'superseded') {
    throw new Error(`Cannot recalculate a ${run.status} run — reopen first`);
  }

  // Snapshot existing admin decisions keyed by program_id
  const [existingLines] = await pool.query(
    `SELECT program_id, approved, excluded, exclusion_reason,
            booking_type_effective AS override_booking_type,
            booking_type_override_reason, notes
     FROM commission_run_line WHERE commission_run_id = ?`,
    [runId]
  );
  const prior = {};
  existingLines.forEach(l => { prior[l.program_id] = l; });

  // Wipe lines, compute fresh
  await pool.query(`DELETE FROM commission_run_line WHERE commission_run_id = ?`, [runId]);
  const out = await calcRun(run.user_id, run.period_start, run.period_end);

  for (const line of out.lines) {
    const p = prior[line.program_id] || {};
    // Preserve admin override of booking_type_effective if there was one
    const effective = p.override_booking_type && p.override_booking_type !== line.booking_type_effective
      ? p.override_booking_type
      : line.booking_type_effective;

    await pool.query(
      `INSERT INTO commission_run_line
        (commission_run_id, program_id, contractor_id, location_id,
         line_type, booking_type_original, booking_type_effective, booking_type_override_reason,
         non_initial_client_applied, parent_cost, number_enrolled, session_count,
         sessions_run_in_period, first_session_date, program_booked_at,
         program_revenue, adjustment_source, adjustment_multiplier, adjusted_revenue,
         split_pct, line_revenue,
         req_enrollment_hit, req_margin_hit, req_booked_3wk_hit, req_min_weeks_hit, req_program_ran,
         requirements_met, non_retained_commission,
         approved, excluded, exclusion_reason, notes)
       VALUES (?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?, ?,?, ?,?,?,?,?, ?,?, ?,?,?,?)`,
      [runId, line.program_id, line.contractor_id, line.location_id,
       line.line_type, line.booking_type_original, effective, p.booking_type_override_reason || null,
       line.non_initial_client_applied, line.parent_cost, line.number_enrolled, line.session_count,
       line.sessions_run_in_period, line.first_session_date, line.program_booked_at,
       line.program_revenue, line.adjustment_source, line.adjustment_multiplier, line.adjusted_revenue,
       line.split_pct, line.line_revenue,
       line.req_enrollment_hit || 0, line.req_margin_hit || 0, line.req_booked_3wk_hit || 0, line.req_min_weeks_hit || 0, line.req_program_ran || 0,
       line.requirements_met || 0, line.non_retained_commission || 0,
       p.approved != null ? p.approved : (line.line_type === 'retained' ? 1 : 0),
       p.excluded || 0, p.exclusion_reason || null, p.notes || null]
    );
  }

  // Re-compute totals from stored lines so they match exactly what's persisted
  await recomputeRunTotals(runId);
  await logAudit(runId, null, 'recalculated', actorId);
  return out.totals;
}

/**
 * Recompute the run-level totals from current lines (respecting approved + excluded flags).
 * Excluded lines contribute 0. Unapproved non-retained lines contribute 0 to payout.
 */
async function recomputeRunTotals(runId) {
  const [[run]] = await pool.query(`SELECT * FROM commission_run WHERE id = ?`, [runId]);
  const plan = (await pool.query(`SELECT * FROM salesperson_commission_plan WHERE id = ?`, [run.plan_id]))[0][0];

  const [lines] = await pool.query(
    `SELECT * FROM commission_run_line WHERE commission_run_id = ?`, [runId]
  );

  let totalRevenue = 0, initialRevenue = 0, nonRetainedCommission = 0;
  for (const l of lines) {
    if (l.excluded) continue;
    if (l.line_type === 'retained') {
      totalRevenue += parseFloat(l.line_revenue);
      if (l.booking_type_effective === 'initial') initialRevenue += parseFloat(l.line_revenue);
    } else if (l.approved) {
      nonRetainedCommission += parseFloat(l.non_retained_commission);
    }
  }

  const initialSplit = totalRevenue > 0 ? initialRevenue / totalRevenue : 0;
  const aboveQuota = totalRevenue - parseFloat(plan.monthly_quota);
  let initialCommission = 0, rebookCommission = 0, retainedCommission = 0;
  if (aboveQuota > 0) {
    initialCommission = Math.round(aboveQuota * initialSplit * parseFloat(plan.initial_rate) * 100) / 100;
    rebookCommission = Math.round(aboveQuota * (1 - initialSplit) * parseFloat(plan.rebook_rate) * 100) / 100;
    retainedCommission = Math.round((initialCommission + rebookCommission) * 100) / 100;
  }
  const rebookRevenue = Math.round((totalRevenue - initialRevenue) * 100) / 100;
  const subtotal = Math.round((retainedCommission + nonRetainedCommission) * 100) / 100;
  const total = Math.round((subtotal + parseFloat(run.prior_month_adjustment || 0)) * 100) / 100;

  await pool.query(
    `UPDATE commission_run SET
       total_revenue = ?, initial_revenue = ?, rebook_revenue = ?, initial_split = ?,
       above_quota = ?, initial_commission = ?, rebook_commission = ?,
       retained_commission = ?, non_retained_commission = ?, subtotal_commission = ?,
       total_payout = ?
     WHERE id = ?`,
    [Math.round(totalRevenue * 100) / 100, Math.round(initialRevenue * 100) / 100, rebookRevenue,
     Math.round(initialSplit * 10000) / 10000, Math.round(Math.max(0, aboveQuota) * 100) / 100,
     initialCommission, rebookCommission, retainedCommission,
     Math.round(nonRetainedCommission * 100) / 100, subtotal, total, runId]
  );
}

async function transitionStatus(runId, from, to, actorId) {
  const [[run]] = await pool.query(`SELECT status FROM commission_run WHERE id = ?`, [runId]);
  if (!run) throw new Error('Run not found');
  if (run.status !== from) throw new Error(`Expected status '${from}' but got '${run.status}'`);
  const col = to === 'pending_approval' ? 'submitted' : to; // submitted_* columns
  await pool.query(
    `UPDATE commission_run SET status = ?, ${col}_by_user_id = ?, ${col}_at = NOW() WHERE id = ?`,
    [to, actorId, runId]
  );
  await logAudit(runId, null, to === 'pending_approval' ? 'submitted' : to, actorId);
}

async function updateLine(runId, lineId, patch, actorId) {
  const [[line]] = await pool.query(
    `SELECT * FROM commission_run_line WHERE id = ? AND commission_run_id = ?`, [lineId, runId]
  );
  if (!line) throw new Error('Line not found');
  const [[run]] = await pool.query(`SELECT status FROM commission_run WHERE id = ?`, [runId]);
  if (run.status === 'finalized' || run.status === 'superseded') throw new Error(`Cannot edit a ${run.status} run`);

  const fields = [], vals = [], actions = [];
  if (patch.approved !== undefined) {
    fields.push('approved = ?', 'approved_by_user_id = ?', 'approved_at = NOW()');
    vals.push(patch.approved ? 1 : 0, patch.approved ? actorId : null);
    actions.push(patch.approved ? 'line_approved' : 'line_unapproved');
  }
  if (patch.excluded !== undefined) {
    fields.push('excluded = ?', 'exclusion_reason = ?');
    vals.push(patch.excluded ? 1 : 0, patch.exclusion_reason || null);
    actions.push(patch.excluded ? 'line_excluded' : 'line_included');
  }
  if (patch.booking_type_effective !== undefined && patch.booking_type_effective !== line.booking_type_effective) {
    if (!patch.override_reason) throw new Error('override_reason required when changing booking_type_effective');
    fields.push('booking_type_effective = ?', 'booking_type_override_reason = ?');
    vals.push(patch.booking_type_effective, patch.override_reason);
    actions.push('line_override_booking_type');
  }
  if (patch.notes !== undefined) {
    fields.push('notes = ?'); vals.push(patch.notes || null); actions.push('note_added');
  }
  if (!fields.length) return;

  await pool.query(`UPDATE commission_run_line SET ${fields.join(', ')} WHERE id = ?`, [...vals, lineId]);
  for (const a of actions) await logAudit(runId, lineId, a, actorId, line, patch);
  await recomputeRunTotals(runId);
}

/**
 * Reopen a finalized run — creates a new draft linked via rerun_of.
 * On re-finalize, the orig run should be marked superseded (not implemented in finalize yet — see below).
 */
async function reopenRun(runId, actorId) {
  const [[orig]] = await pool.query(`SELECT * FROM commission_run WHERE id = ?`, [runId]);
  if (!orig) throw new Error('Run not found');
  if (orig.status !== 'finalized') throw new Error('Only finalized runs can be reopened');

  const [result] = await pool.query(
    `INSERT INTO commission_run (user_id, period_start, period_end, plan_id, status, rerun_of)
     VALUES (?, ?, ?, ?, 'draft', ?)`,
    [orig.user_id, orig.period_start, orig.period_end, orig.plan_id, orig.id]
  );
  await logAudit(result.insertId, null, 'reopened', actorId, null, null, `Reopened from run #${orig.id}`);
  return { id: result.insertId };
}

/**
 * On finalize: if this run has rerun_of, mark the referenced run superseded.
 */
async function finalizeRun(runId, actorId) {
  const [[run]] = await pool.query(`SELECT * FROM commission_run WHERE id = ?`, [runId]);
  if (!run) throw new Error('Run not found');
  if (run.status !== 'approved') throw new Error(`Expected status 'approved' but got '${run.status}'`);
  await pool.query(
    `UPDATE commission_run SET status = 'finalized', finalized_by_user_id = ?, finalized_at = NOW() WHERE id = ?`,
    [actorId, runId]
  );
  if (run.rerun_of) {
    await pool.query(`UPDATE commission_run SET status = 'superseded' WHERE id = ?`, [run.rerun_of]);
    await logAudit(run.rerun_of, null, 'finalized', actorId, null, null, `Superseded by rerun #${runId}`);
  }
  await logAudit(runId, null, 'finalized', actorId);
}

module.exports = {
  createRun, calculateRun, recomputeRunTotals, transitionStatus, updateLine, reopenRun, finalizeRun, logAudit,
};
