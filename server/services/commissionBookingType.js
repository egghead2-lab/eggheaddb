/**
 * Auto booking-type assignment + nightly reconciler (spec §5).
 *
 * Rule: a program is `initial` if it belongs to a sibling cluster (programs at
 * the same client with first_session_dates within 30 days of each other) where
 * NO session has yet run. Once any session in the cluster runs, every future
 * program at that client is `rebook` until the next cluster forms.
 *
 * "Same client" = same contractor (if any) OR same location (standalone).
 * Programs with `booking_type_manual_override = 1` are skipped.
 * Clients with `non_initial_client = 1` force all programs to `rebook`.
 */
const pool = require('../db/pool');
const CFG = require('../config/commission');

/**
 * Identify a program's "client key" — either `contractor:ID` or `location:ID`.
 */
async function getClientKey(programId) {
  const [[prog]] = await pool.query(
    `SELECT loc.id AS location_id, loc.contractor_id
     FROM program prog JOIN location loc ON loc.id = prog.location_id
     WHERE prog.id = ?`,
    [programId]
  );
  if (!prog) return null;
  return prog.contractor_id ? `contractor:${prog.contractor_id}` : `location:${prog.location_id}`;
}

/**
 * Is the client marked non_initial_client? If so, all programs are rebook regardless.
 */
async function clientIsNonInitial(clientKey) {
  if (!clientKey) return false;
  const [type, id] = clientKey.split(':');
  if (type === 'contractor') {
    const [[row]] = await pool.query(`SELECT non_initial_client FROM contractor WHERE id = ?`, [id]);
    return !!row?.non_initial_client;
  }
  const [[row]] = await pool.query(`SELECT non_initial_client FROM location WHERE id = ?`, [id]);
  return !!row?.non_initial_client;
}

/**
 * Pull all active programs belonging to this client, with fields needed for clustering.
 * Excludes manual-override programs (they opt out of auto-assignment).
 */
async function getClientPrograms(clientKey) {
  if (!clientKey) return [];
  const [type, id] = clientKey.split(':');
  const where = type === 'contractor' ? 'loc.contractor_id = ?' : 'loc.id = ? AND loc.contractor_id IS NULL';
  const [rows] = await pool.query(
    `SELECT prog.id, prog.first_session_date, prog.booking_type, prog.booking_type_manual_override,
            (SELECT COUNT(*) FROM session s
               WHERE s.program_id = prog.id AND s.active = 1
                 AND s.session_date <= CURDATE()) AS sessions_ran
     FROM program prog
     JOIN location loc ON loc.id = prog.location_id
     LEFT JOIN class_status cs ON cs.id = prog.class_status_id
     WHERE prog.active = 1
       AND (cs.class_status_name IS NULL OR cs.class_status_name NOT LIKE 'Cancelled%')
       AND ${where}
       AND prog.first_session_date IS NOT NULL
       AND prog.booking_type_manual_override = 0
     ORDER BY prog.first_session_date`,
    [id]
  );
  return rows;
}

/**
 * Greedy transitive clustering. Programs cluster if their first_session_dates
 * are within SIBLING_GROUPING_WINDOW_DAYS of each other (transitively).
 * Input rows must be sorted by first_session_date ascending.
 * Returns array of clusters (each cluster is an array of program rows).
 */
function cluster(programs) {
  if (programs.length === 0) return [];
  const msWindow = CFG.SIBLING_GROUPING_WINDOW_DAYS * 86400000;
  const clusters = [];
  let current = [programs[0]];
  let currentLastMs = new Date(programs[0].first_session_date).getTime();
  for (let i = 1; i < programs.length; i++) {
    const p = programs[i];
    const pMs = new Date(p.first_session_date).getTime();
    if (pMs - currentLastMs <= msWindow) {
      current.push(p);
      currentLastMs = pMs;
    } else {
      clusters.push(current);
      current = [p];
      currentLastMs = pMs;
    }
  }
  clusters.push(current);
  return clusters;
}

/**
 * Write a log row if the type is changing.
 */
async function logChange(programId, fromVal, toVal, reason, clusterIds, actorId) {
  await pool.query(
    `INSERT INTO program_booking_type_log (program_id, from_value, to_value, reason, cluster_program_ids, actor_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [programId, fromVal || null, toVal, reason, clusterIds ? JSON.stringify(clusterIds) : null, actorId || null]
  );
}

/**
 * Apply the auto rule to a single client's programs.
 * Within each cluster: if any member has sessions_ran > 0 → whole cluster is rebook.
 * Else → whole cluster is initial.
 * Updates only rows that actually change; logs each change.
 * Returns count of changes made.
 */
async function reconcileClient(clientKey, reason = 'auto_sibling_added', actorId = null) {
  if (!clientKey) return 0;
  if (await clientIsNonInitial(clientKey)) {
    // Force everything in this client to rebook
    const [type, id] = clientKey.split(':');
    const where = type === 'contractor' ? 'loc.contractor_id = ?' : 'loc.id = ? AND loc.contractor_id IS NULL';
    const [progs] = await pool.query(
      `SELECT prog.id, prog.booking_type FROM program prog
       JOIN location loc ON loc.id = prog.location_id
       WHERE prog.active = 1 AND prog.booking_type_manual_override = 0 AND ${where}
         AND prog.booking_type = 'initial'`,
      [id]
    );
    for (const p of progs) {
      await pool.query(`UPDATE program SET booking_type = 'rebook' WHERE id = ?`, [p.id]);
      await logChange(p.id, 'initial', 'rebook', reason, null, actorId);
    }
    return progs.length;
  }

  const progs = await getClientPrograms(clientKey);
  const clusters = cluster(progs);
  let changes = 0;
  for (const c of clusters) {
    const anyRan = c.some(p => p.sessions_ran > 0);
    const target = anyRan ? 'rebook' : 'initial';
    const clusterIds = c.map(p => p.id);
    for (const p of c) {
      if (p.booking_type !== target) {
        await pool.query(`UPDATE program SET booking_type = ? WHERE id = ?`, [target, p.id]);
        await logChange(p.id, p.booking_type, target, reason, clusterIds, actorId);
        changes++;
      }
    }
  }
  return changes;
}

/**
 * Recompute a single program's booking_type.
 * Called when a program is created or its first_session_date changes.
 */
async function reconcileProgram(programId, actorId = null) {
  const [[prog]] = await pool.query(
    `SELECT booking_type_manual_override FROM program WHERE id = ?`, [programId]
  );
  if (!prog || prog.booking_type_manual_override) return 0;
  const key = await getClientKey(programId);
  return reconcileClient(key, 'auto_sibling_added', actorId);
}

/**
 * Nightly job: run the auto-rule across ALL clients. Idempotent.
 */
async function runNightlyReconciler() {
  const [contractors] = await pool.query(
    `SELECT DISTINCT c.id FROM contractor c
     JOIN location l ON l.contractor_id = c.id
     JOIN program p ON p.location_id = l.id
     WHERE c.active = 1 AND p.active = 1 AND p.booking_type_manual_override = 0`
  );
  const [locations] = await pool.query(
    `SELECT DISTINCT l.id FROM location l
     JOIN program p ON p.location_id = l.id
     WHERE l.active = 1 AND l.contractor_id IS NULL
       AND p.active = 1 AND p.booking_type_manual_override = 0`
  );

  let totalChanges = 0;
  for (const c of contractors) {
    totalChanges += await reconcileClient(`contractor:${c.id}`, 'auto_cluster_member_ran');
  }
  for (const l of locations) {
    totalChanges += await reconcileClient(`location:${l.id}`, 'auto_cluster_member_ran');
  }
  console.log(`[commissionBookingType] Nightly reconcile: ${contractors.length} contractors + ${locations.length} locations, ${totalChanges} changes`);
  return { contractors: contractors.length, locations: locations.length, changes: totalChanges };
}

module.exports = {
  reconcileProgram, reconcileClient, runNightlyReconciler, cluster,
  getClientKey, clientIsNonInitial,
};
