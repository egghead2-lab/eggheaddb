const pool = require('../db/pool');
const { getProfessorToLocationMiles, getLocationToLocationMiles } = require('./distanceService');

const TIER_UNDER_10 = 0;
const TIER_10_TO_20 = 5;
const TIER_OVER_20 = 10;

function calcTierPay(miles) {
  if (miles == null) return 0;
  if (miles < 10) return TIER_UNDER_10;
  if (miles <= 20) return TIER_10_TO_20;
  return TIER_OVER_20;
}

async function getIrsRate() {
  const [[r]] = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'mileage_reimbursement_rate'");
  return parseFloat(r?.setting_value) || 0.725;
}

/**
 * Find all sessions a professor actually taught (as lead or assistant) in a date range,
 * excluding camps and parties. Use session-level professor_id so subs are handled correctly.
 */
async function getProfessorSessions(professorId, startDate, endDate) {
  const [sessions] = await pool.query(
    `SELECT s.id AS session_id, s.session_date, s.session_time, s.program_id,
            prog.location_id, prog.program_nickname,
            CASE WHEN s.professor_id = ? THEN 'Lead' ELSE 'Assistant' END AS role
     FROM session s
     JOIN program prog ON prog.id = s.program_id AND prog.active = 1
     JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name = 'Confirmed'
     JOIN program_type pt ON pt.id = prog.program_type_id
     WHERE s.active = 1
       AND s.session_date BETWEEN ? AND ?
       AND s.not_billed != 1
       AND pt.program_type_name NOT IN ('Camp','Party')
       AND prog.party_format_id IS NULL
       AND prog.location_id IS NOT NULL
       AND (s.professor_id = ? OR s.assistant_id = ?)
     ORDER BY s.session_date, s.session_time`,
    [professorId, startDate, endDate, professorId, professorId]
  );
  return sessions;
}

async function calcProfessorReimbursement(professorId, startDate, endDate) {
  const sessions = await getProfessorSessions(professorId, startDate, endDate);
  if (sessions.length === 0) return { total: 0, lines: [] };

  const irsRate = await getIrsRate();

  // Group by date
  const byDate = {};
  for (const s of sessions) {
    const dateKey = s.session_date.toISOString ? s.session_date.toISOString().split('T')[0] : String(s.session_date).split('T')[0];
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(s);
  }

  const lines = [];
  let total = 0;

  for (const [dateKey, daySessions] of Object.entries(byDate)) {
    // Sort by time, nulls last
    daySessions.sort((a, b) => (a.session_time || 'z').localeCompare(b.session_time || 'z'));

    // Dedupe consecutive same-location sessions: only pay for each *unique* location visit
    // First location: tier-based (home → first location)
    // Subsequent distinct locations: IRS × location-to-location
    let prevLocationId = null;
    for (let i = 0; i < daySessions.length; i++) {
      const s = daySessions[i];
      if (s.location_id === prevLocationId) {
        // Same location as previous — no additional reimbursement, record zero-dollar line
        lines.push({
          session_date: dateKey, session_id: s.session_id, program_id: s.program_id,
          location_id: s.location_id, role: s.role, miles: 0, leg_type: 'primary', amount: 0,
          calc_method: 'same_location_skip',
        });
        continue;
      }

      if (prevLocationId === null) {
        // First unique location of the day — tier-based
        try {
          const { miles } = await getProfessorToLocationMiles(professorId, s.location_id);
          const amount = calcTierPay(miles);
          total += amount;
          lines.push({
            session_date: dateKey, session_id: s.session_id, program_id: s.program_id,
            location_id: s.location_id, role: s.role, miles, leg_type: 'primary', amount,
            calc_method: miles < 10 ? 'tier_under_10' : miles <= 20 ? 'tier_10_20' : 'tier_over_20',
          });
        } catch (err) {
          lines.push({
            session_date: dateKey, session_id: s.session_id, program_id: s.program_id,
            location_id: s.location_id, role: s.role, miles: null, leg_type: 'primary', amount: 0,
            calc_method: `error:${err.message.substring(0, 60)}`,
          });
        }
      } else {
        // Secondary location — IRS rate × distance from previous location
        try {
          const { miles } = await getLocationToLocationMiles(prevLocationId, s.location_id);
          const amount = Math.round(miles * irsRate * 100) / 100;
          total += amount;
          lines.push({
            session_date: dateKey, session_id: s.session_id, program_id: s.program_id,
            location_id: s.location_id, role: s.role, miles, leg_type: 'secondary', amount,
            calc_method: `irs_${irsRate}`,
          });
        } catch (err) {
          lines.push({
            session_date: dateKey, session_id: s.session_id, program_id: s.program_id,
            location_id: s.location_id, role: s.role, miles: null, leg_type: 'secondary', amount: 0,
            calc_method: `error:${err.message.substring(0, 60)}`,
          });
        }
      }
      prevLocationId = s.location_id;
    }
  }

  return { total: Math.round(total * 100) / 100, lines, numSessions: sessions.length };
}

async function calcCycle(cycleId) {
  const [[cycle]] = await pool.query('SELECT * FROM gas_reimbursement_cycle WHERE id = ?', [cycleId]);
  if (!cycle) throw new Error('Cycle not found');

  // Find all distinct professors who taught non-camp, non-party sessions in this cycle
  const [profs] = await pool.query(
    `SELECT DISTINCT professor_id FROM (
       SELECT s.professor_id FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name = 'Confirmed'
       JOIN program_type pt ON pt.id = prog.program_type_id
       WHERE s.active = 1 AND s.session_date BETWEEN ? AND ?
         AND s.not_billed != 1
         AND pt.program_type_name NOT IN ('Camp','Party')
         AND prog.party_format_id IS NULL
         AND s.professor_id IS NOT NULL
       UNION
       SELECT s.assistant_id FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name = 'Confirmed'
       JOIN program_type pt ON pt.id = prog.program_type_id
       WHERE s.active = 1 AND s.session_date BETWEEN ? AND ?
         AND s.not_billed != 1
         AND pt.program_type_name NOT IN ('Camp','Party')
         AND prog.party_format_id IS NULL
         AND s.assistant_id IS NOT NULL
     ) AS all_profs WHERE professor_id IS NOT NULL`,
    [cycle.start_date, cycle.end_date, cycle.start_date, cycle.end_date]
  );

  // Wipe existing draft entries for this cycle (skip pushed ones)
  await pool.query(
    `DELETE gl FROM gas_reimbursement_line gl
     JOIN gas_reimbursement_entry ge ON ge.id = gl.entry_id
     WHERE ge.cycle_id = ? AND ge.status = 'Draft'`,
    [cycleId]
  );
  await pool.query(`DELETE FROM gas_reimbursement_entry WHERE cycle_id = ? AND status = 'Draft'`, [cycleId]);

  let processedCount = 0;
  for (const { professor_id } of profs) {
    // Skip if pushed entry exists for this prof+cycle
    const [[existing]] = await pool.query(
      `SELECT id, status FROM gas_reimbursement_entry WHERE cycle_id = ? AND professor_id = ?`,
      [cycleId, professor_id]
    );
    if (existing?.status === 'Pushed') continue;

    const { total, lines, numSessions } = await calcProfessorReimbursement(professor_id, cycle.start_date, cycle.end_date);

    const [insResult] = await pool.query(
      `INSERT INTO gas_reimbursement_entry (cycle_id, professor_id, total_amount, num_sessions, status, calculated_at)
       VALUES (?, ?, ?, ?, 'Draft', NOW())`,
      [cycleId, professor_id, total, numSessions]
    );
    const entryId = insResult.insertId;

    for (const line of lines) {
      await pool.query(
        `INSERT INTO gas_reimbursement_line (entry_id, session_date, session_id, program_id, location_id, role, miles, leg_type, amount, calc_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entryId, line.session_date, line.session_id, line.program_id, line.location_id, line.role,
         line.miles, line.leg_type, line.amount, line.calc_method]
      );
    }
    processedCount++;
  }

  await pool.query(`UPDATE gas_reimbursement_cycle SET status = 'Calculated' WHERE id = ?`, [cycleId]);
  return { processedCount };
}

module.exports = { calcCycle, calcProfessorReimbursement, calcTierPay, getIrsRate };
