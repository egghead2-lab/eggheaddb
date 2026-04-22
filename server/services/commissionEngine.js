/**
 * Commission Engine — pure calc module (spec §2).
 *
 * Produces line items + aggregate totals for a (salesperson, month) given the
 * current state of the source data. Stateless; takes a db-like interface so
 * it can be unit-tested with fixtures, but in production just uses the pool.
 *
 * Output is the snapshot that gets written to commission_run + commission_run_line.
 */
const pool = require('../db/pool');
const CFG = require('../config/commission');

/**
 * Return the plan row in effect on `asOf` date for this user.
 * Spec §4.1: plan where user_id = S AND effective_from <= asOf AND (effective_to IS NULL OR effective_to >= asOf).
 */
async function getPlanForDate(userId, asOfDate) {
  const [[plan]] = await pool.query(
    `SELECT * FROM salesperson_commission_plan
     WHERE user_id = ? AND active = 1
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC LIMIT 1`,
    [userId, asOfDate, asOfDate]
  );
  return plan || null;
}

/**
 * Resolve the effective commission adjustment multiplier for a program (spec §4.3):
 *   1. Active location_commission_adjustment for program.location_id (most specific)
 *   2. Active contractor_commission_adjustment for the location's contractor
 *   3. 1.0000
 * "Active on asOf" = active=1 AND effective_from <= asOf AND (effective_to IS NULL OR effective_to >= asOf)
 */
async function resolveAdjustment(locationId, contractorId, asOfDate) {
  const [locAdj] = await pool.query(
    `SELECT multiplier FROM location_commission_adjustment
     WHERE location_id = ? AND active = 1
       AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC LIMIT 1`,
    [locationId, asOfDate, asOfDate]
  );
  if (locAdj.length) return { source: 'location', multiplier: parseFloat(locAdj[0].multiplier) };

  if (contractorId) {
    const [conAdj] = await pool.query(
      `SELECT multiplier FROM contractor_commission_adjustment
       WHERE contractor_id = ? AND active = 1
         AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from DESC LIMIT 1`,
      [contractorId, asOfDate, asOfDate]
    );
    if (conAdj.length) return { source: 'contractor', multiplier: parseFloat(conAdj[0].multiplier) };
  }

  return { source: 'none', multiplier: 1.0000 };
}

/**
 * Resolve the split_pct for a salesperson on (contractor or location) on asOf.
 * §4.2: contractor_salesperson if location has contractor, else location_salesperson.
 * Returns 0 if not assigned.
 */
async function resolveSplit(userId, locationId, contractorId, asOfDate) {
  if (contractorId) {
    const [rows] = await pool.query(
      `SELECT split_pct FROM contractor_salesperson
       WHERE contractor_id = ? AND user_id = ? AND active = 1
         AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from DESC LIMIT 1`,
      [contractorId, userId, asOfDate, asOfDate]
    );
    return rows.length ? parseFloat(rows[0].split_pct) : 0;
  }
  const [rows] = await pool.query(
    `SELECT split_pct FROM location_salesperson
     WHERE location_id = ? AND user_id = ? AND active = 1
       AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC LIMIT 1`,
    [locationId, userId, asOfDate, asOfDate]
  );
  return rows.length ? parseFloat(rows[0].split_pct) : 0;
}

/**
 * Find all programs assigned to this salesperson whose first session falls
 * in [periodStart, periodEnd] (or any session in that period has already run),
 * regardless of retained status. Caller filters by effective_retained flag.
 *
 * A program belongs to S if S has an active split on the relevant
 * contractor/location on periodEnd.
 */
async function listCandidatePrograms(userId, periodStart, periodEnd) {
  const [rows] = await pool.query(
    `SELECT
       prog.id AS program_id, prog.program_nickname,
       prog.location_id, loc.contractor_id,
       prog.parent_cost, prog.number_enrolled, prog.session_count,
       prog.our_cut, prog.lab_fee,
       prog.first_session_date, prog.ts_inserted AS program_booked_at,
       prog.booking_type,
       loc.class_pricing_type_id,
       -- Effective retained / non_initial — contractor wins when present
       CASE
         WHEN loc.contractor_id IS NOT NULL THEN con.retained
         ELSE loc.retained_commission
       END AS effective_retained,
       CASE
         WHEN loc.contractor_id IS NOT NULL THEN con.non_initial_client
         ELSE loc.non_initial_client
       END AS effective_non_initial,
       loc.location_enrollment,
       -- Count of sessions that ran in the period
       (SELECT COUNT(*) FROM session s
          WHERE s.program_id = prog.id AND s.active = 1
            AND s.session_date BETWEEN ? AND ?) AS sessions_in_period,
       -- Count of sessions that have actually occurred in the period (up to today)
       (SELECT COUNT(*) FROM session s
          WHERE s.program_id = prog.id AND s.active = 1
            AND s.session_date BETWEEN ? AND ?
            AND s.session_date <= CURDATE()) AS sessions_ran_in_period
     FROM program prog
     JOIN location loc ON loc.id = prog.location_id
     LEFT JOIN contractor con ON con.id = loc.contractor_id
     LEFT JOIN class_status cs ON cs.id = prog.class_status_id
     WHERE prog.active = 1
       AND (cs.class_status_name IS NULL OR cs.class_status_name NOT LIKE 'Cancelled%')
       AND (
         (loc.contractor_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM contractor_salesperson cs2
            WHERE cs2.contractor_id = loc.contractor_id AND cs2.user_id = ? AND cs2.active = 1
              AND cs2.effective_from <= ? AND (cs2.effective_to IS NULL OR cs2.effective_to >= ?)
         ))
         OR
         (loc.contractor_id IS NULL AND EXISTS (
            SELECT 1 FROM location_salesperson ls
            WHERE ls.location_id = loc.id AND ls.user_id = ? AND ls.active = 1
              AND ls.effective_from <= ? AND (ls.effective_to IS NULL OR ls.effective_to >= ?)
         ))
       )
       AND EXISTS (
         SELECT 1 FROM session s
         WHERE s.program_id = prog.id AND s.active = 1
           AND s.session_date BETWEEN ? AND ?
       )
     ORDER BY prog.program_nickname`,
    [periodStart, periodEnd, periodStart, periodEnd, userId, periodEnd, periodEnd, userId, periodEnd, periodEnd, periodStart, periodEnd]
  );
  return rows;
}

/**
 * Check non-retained hard requirements (spec §2.2):
 * - location_enrollment >= MIN_ENROLLMENT
 * - margin >= MARGIN_THRESHOLD
 * - booked ahead >= BOOKED_AHEAD_DAYS
 * - program actually ran (>=1 session <= today in period)
 * Plus the flexible min-weeks rule.
 */
function evaluateNonRetainedRequirements(row) {
  const parentCost = parseFloat(row.parent_cost) || 0;
  const ourCut = parseFloat(row.our_cut) || 0;
  const labFee = parseFloat(row.lab_fee) || 0;
  const enrollment = parseInt(row.location_enrollment) || 0;
  const sessionCount = parseInt(row.session_count) || 0;
  const sessionsRan = parseInt(row.sessions_ran_in_period) || 0;

  const req_enrollment_hit = enrollment >= CFG.MIN_ENROLLMENT ? 1 : 0;
  const margin = parentCost > 0 ? (parentCost - ourCut - labFee) / parentCost : 0;
  const req_margin_hit = margin >= CFG.MARGIN_THRESHOLD ? 1 : 0;

  let req_booked_3wk_hit = 0;
  if (row.first_session_date && row.program_booked_at) {
    const first = new Date(row.first_session_date);
    const booked = new Date(row.program_booked_at);
    const daysAhead = Math.floor((first - booked) / 86400000);
    req_booked_3wk_hit = daysAhead >= CFG.BOOKED_AHEAD_DAYS ? 1 : 0;
  }

  const req_program_ran = sessionsRan >= 1 ? 1 : 0;
  const req_min_weeks_hit = sessionCount >= CFG.MIN_WEEKS_FULL ? 1 : 0;

  // Hard requirements must all pass (min_weeks is flexible — prorated instead)
  const requirements_met = req_enrollment_hit && req_margin_hit && req_booked_3wk_hit && req_program_ran ? 1 : 0;

  return {
    req_enrollment_hit, req_margin_hit, req_booked_3wk_hit, req_min_weeks_hit, req_program_ran,
    requirements_met,
    session_count: sessionCount,
  };
}

/**
 * Main entry: build run lines + totals for (userId, periodStart..periodEnd).
 * Does NOT persist — caller writes to commission_run + commission_run_line.
 */
async function calcRun(userId, periodStart, periodEnd) {
  const plan = await getPlanForDate(userId, periodEnd);
  if (!plan) throw new Error(`No commission plan in effect for user ${userId} on ${periodEnd}`);

  const candidates = await listCandidatePrograms(userId, periodStart, periodEnd);

  const lines = [];
  let totalRevenue = 0;
  let initialRevenue = 0;
  let nonRetainedCommission = 0;

  for (const p of candidates) {
    // Skip $0 programs — assistant slots / not separately billed
    const parentCost = parseFloat(p.parent_cost) || 0;
    if (parentCost <= 0) continue;

    const isRetained = !!p.effective_retained;
    const adjustment = await resolveAdjustment(p.location_id, p.contractor_id, periodEnd);
    const splitPct = await resolveSplit(userId, p.location_id, p.contractor_id, periodEnd);

    // Revenue depends on pricing type:
    //   Flat Fee (id=1):  parent_cost is per-session   → monthly rev = parent_cost × sessions_in_period
    //   Per Student (id=2): parent_cost is per-student → monthly rev = parent_cost × number_enrolled × (sessions_in_period / session_count)
    // Default to Flat Fee when not set (matches most classes).
    const totalSessions = parseInt(p.session_count) || 0;
    const sessionsInPeriod = parseInt(p.sessions_in_period) || 0;
    const enrolled = parseInt(p.number_enrolled) || 0;
    const isPerStudent = p.class_pricing_type_id === 2;

    let programRevenue = 0;
    if (isPerStudent) {
      const classTotal = parentCost * enrolled;
      const share = totalSessions > 0 ? (sessionsInPeriod / totalSessions) : 0;
      programRevenue = Math.round(classTotal * share * 100) / 100;
    } else {
      // Flat Fee — parent_cost is per-session
      programRevenue = Math.round(parentCost * sessionsInPeriod * 100) / 100;
    }

    const adjustedRevenue = Math.round(programRevenue * adjustment.multiplier * 100) / 100;
    const lineRevenue = Math.round(adjustedRevenue * splitPct * 100) / 100;

    // Effective booking type. Default NULL to 'initial' (prior code defaulted to 'rebook'
    // which wrongly penalized programs before the nightly reconciler ran).
    // non_initial_client still forces 'rebook'.
    const nonInitialApplied = !!p.effective_non_initial;
    const originalBookingType = p.booking_type || 'initial';
    const effectiveBookingType = nonInitialApplied ? 'rebook' : originalBookingType;

    const baseLine = {
      program_id: p.program_id,
      program_nickname: p.program_nickname,
      contractor_id: p.contractor_id,
      location_id: p.location_id,
      booking_type_original: originalBookingType,
      booking_type_effective: effectiveBookingType,
      non_initial_client_applied: nonInitialApplied ? 1 : 0,
      parent_cost: p.parent_cost || 0,
      number_enrolled: p.number_enrolled || 0,
      session_count: p.session_count || 0,
      sessions_run_in_period: p.sessions_ran_in_period || 0,
      first_session_date: p.first_session_date,
      program_booked_at: p.program_booked_at,
      program_revenue: programRevenue,
      adjustment_source: adjustment.source,
      adjustment_multiplier: adjustment.multiplier,
      adjusted_revenue: adjustedRevenue,
      split_pct: splitPct,
      line_revenue: lineRevenue,
    };

    if (isRetained) {
      lines.push({
        ...baseLine,
        line_type: 'retained',
        req_enrollment_hit: 0, req_margin_hit: 0, req_booked_3wk_hit: 0, req_min_weeks_hit: 0, req_program_ran: 0,
        requirements_met: 0,
        non_retained_commission: 0,
      });
      totalRevenue += lineRevenue;
      if (effectiveBookingType === 'initial') initialRevenue += lineRevenue;
    } else {
      // Non-retained flat-fee path
      const reqs = evaluateNonRetainedRequirements(p);
      let comm = 0;
      if (reqs.requirements_met) {
        const flatFee = parseFloat(plan.non_retained_flat_fee);
        if (reqs.session_count >= CFG.MIN_WEEKS_FULL) {
          comm = flatFee * splitPct;
        } else if (reqs.session_count >= 1) {
          comm = Math.round(flatFee * (reqs.session_count / CFG.MIN_WEEKS_PRORATE_DENOM) * splitPct * 100) / 100;
        }
      }
      lines.push({
        ...baseLine,
        line_type: 'non_retained',
        ...reqs,
        non_retained_commission: comm,
      });
      nonRetainedCommission += comm;
    }
  }

  // Retained commission calc (spec §2.1)
  const initialSplit = totalRevenue > 0 ? initialRevenue / totalRevenue : 0;
  const aboveQuota = totalRevenue - parseFloat(plan.monthly_quota);
  let initialCommission = 0;
  let rebookCommission = 0;
  let retainedCommission = 0;
  if (aboveQuota > 0) {
    initialCommission = Math.round(aboveQuota * initialSplit * parseFloat(plan.initial_rate) * 100) / 100;
    rebookCommission = Math.round(aboveQuota * (1 - initialSplit) * parseFloat(plan.rebook_rate) * 100) / 100;
    retainedCommission = Math.round((initialCommission + rebookCommission) * 100) / 100;
  }

  const rebookRevenue = Math.round((totalRevenue - initialRevenue) * 100) / 100;
  const subtotalCommission = Math.round((retainedCommission + nonRetainedCommission) * 100) / 100;

  return {
    plan,
    totals: {
      total_revenue: Math.round(totalRevenue * 100) / 100,
      initial_revenue: Math.round(initialRevenue * 100) / 100,
      rebook_revenue: rebookRevenue,
      initial_split: Math.round(initialSplit * 10000) / 10000,
      above_quota: Math.round(Math.max(0, aboveQuota) * 100) / 100,
      initial_commission: initialCommission,
      rebook_commission: rebookCommission,
      retained_commission: retainedCommission,
      non_retained_commission: Math.round(nonRetainedCommission * 100) / 100,
      subtotal_commission: subtotalCommission,
    },
    lines,
  };
}

module.exports = { calcRun, getPlanForDate, resolveAdjustment, resolveSplit, listCandidatePrograms, evaluateNonRetainedRequirements };
