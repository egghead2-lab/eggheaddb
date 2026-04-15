const pool = require('../db/pool');

/**
 * Check if a professor has any scheduling conflicts for a given program's schedule.
 * Returns conflicts array (empty = no conflicts).
 *
 * @param {number} professorId
 * @param {number} programId - the program being assigned
 * @param {object} options - { excludeProgramId, checkDate }
 */
async function checkProfessorConflicts(professorId, programId, options = {}) {
  const conflicts = [];

  // Get the program being assigned
  const [[newProg]] = await pool.query(
    `SELECT prog.id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
            prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
            prog.first_session_date, prog.last_session_date, prog.location_id
     FROM program prog WHERE prog.id = ?`, [programId]
  );
  if (!newProg || !newProg.start_time) return conflicts;

  const newStart = timeToMinutes(newProg.start_time);
  const newEnd = newStart + (newProg.class_length_minutes || 60);
  const newDays = getDays(newProg);

  if (newDays.length === 0) return conflicts;

  // Get all programs this professor is currently on (excluding the one being assigned)
  const [existingProgs] = await pool.query(
    `SELECT prog.id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
            prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
            prog.first_session_date, prog.last_session_date,
            prog.location_id
     FROM program prog
     LEFT JOIN class_status cs ON cs.id = prog.class_status_id
     WHERE prog.active = 1
       AND cs.class_status_name NOT LIKE 'Cancelled%'
       AND (prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)
       AND prog.id != ?
       AND (prog.last_session_date >= CURDATE() OR prog.last_session_date IS NULL)`,
    [professorId, professorId, options.excludeProgramId || programId]
  );

  // Load actual session dates for the new program and existing ones
  const allIds = [programId, ...existingProgs.map(p => p.id)];
  const [sessionRows] = await pool.query(
    `SELECT program_id, session_date FROM session WHERE program_id IN (?) AND active = 1`,
    [allIds]
  );
  const sessionDateMap = {};
  sessionRows.forEach(s => {
    if (!sessionDateMap[s.program_id]) sessionDateMap[s.program_id] = new Set();
    sessionDateMap[s.program_id].add(s.session_date.toISOString().split('T')[0]);
  });
  const newDates = sessionDateMap[programId] || new Set();

  // Check actual session date + time overlaps
  for (const existing of existingProgs) {
    if (!existing.start_time) continue;

    const exStart = timeToMinutes(existing.start_time);
    const exEnd = exStart + (existing.class_length_minutes || 60);

    // Back-to-back at same location is NOT a conflict
    const sameLocation = existing.location_id === newProg.location_id;
    const backToBack = (newStart === exEnd || newEnd === exStart);
    if (sameLocation && backToBack) continue;

    // Check time overlap
    if (newStart >= exEnd || exStart >= newEnd) continue;

    // Check actual session date overlap
    const exDates = sessionDateMap[existing.id] || new Set();
    let hasDateOverlap = false;
    for (const d of newDates) {
      if (exDates.has(d)) { hasDateOverlap = true; break; }
    }
    if (!hasDateOverlap) continue;

    const overlappingDays = newDays.filter(d => getDays(existing).includes(d));
    conflicts.push({
      type: 'program',
      conflicting_program: existing.program_nickname,
      conflicting_id: existing.id,
      days: overlappingDays,
      time: `${existing.start_time} (${existing.class_length_minutes}m)`,
    });
  }

  // Check observation conflicts on specific date if provided
  if (options.checkDate) {
    const [obs] = await pool.query(
      `SELECT po.observation_date, prog.program_nickname, prog.start_time
       FROM professor_observation po
       JOIN program prog ON prog.id = po.program_id
       WHERE po.active = 1 AND po.status = 'scheduled'
         AND (po.professor_id = ? OR po.evaluator_professor_id = ?)
         AND po.observation_date = ?`,
      [professorId, professorId, options.checkDate]
    );
    obs.forEach(o => {
      conflicts.push({
        type: 'observation',
        conflicting_program: o.program_nickname,
        date: o.observation_date,
        time: o.start_time,
      });
    });
  }

  return conflicts;
}

/**
 * Check if a candidate's tentative schedule has conflicts with a new program.
 */
async function checkCandidateScheduleConflicts(candidateId, programId) {
  const conflicts = [];

  const [[newProg]] = await pool.query(
    `SELECT prog.id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
            prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday
     FROM program prog WHERE prog.id = ?`, [programId]
  );
  if (!newProg || !newProg.start_time) return conflicts;

  const newStart = timeToMinutes(newProg.start_time);
  const newEnd = newStart + (newProg.class_length_minutes || 60);
  const newDays = getDays(newProg);

  const [existing] = await pool.query(
    `SELECT prog.id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
            prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
            prog.location_id
     FROM candidate_schedule cs
     JOIN program prog ON prog.id = cs.program_id AND prog.active = 1
     WHERE cs.candidate_id = ? AND cs.active = 1 AND cs.program_id != ?`,
    [candidateId, programId]
  );

  // Load session dates
  const candProgIds = [programId, ...existing.map(p => p.id)];
  const [candSessionRows] = await pool.query(
    `SELECT program_id, session_date FROM session WHERE program_id IN (?) AND active = 1`,
    [candProgIds]
  );
  const candDateMap = {};
  candSessionRows.forEach(s => {
    if (!candDateMap[s.program_id]) candDateMap[s.program_id] = new Set();
    candDateMap[s.program_id].add(s.session_date.toISOString().split('T')[0]);
  });
  const candNewDates = candDateMap[programId] || new Set();

  for (const ex of existing) {
    if (!ex.start_time) continue;

    const exStart = timeToMinutes(ex.start_time);
    const exEnd = exStart + (ex.class_length_minutes || 60);

    // Back-to-back at same location is not a conflict
    if (ex.location_id === newProg.location_id && (newStart === exEnd || newEnd === exStart)) continue;

    if (newStart >= exEnd || exStart >= newEnd) continue;

    // Check actual date overlap
    const exDates = candDateMap[ex.id] || new Set();
    let hasOverlap = false;
    for (const d of candNewDates) {
      if (exDates.has(d)) { hasOverlap = true; break; }
    }
    if (!hasOverlap) continue;

    conflicts.push({
      type: 'schedule',
      conflicting_program: ex.program_nickname,
      conflicting_id: ex.id,
      days: newDays.filter(d => getDays(ex).includes(d)),
    });
  }

  return conflicts;
}

function timeToMinutes(t) {
  if (!t) return 0;
  const parts = String(t).split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
}

function getDays(prog) {
  const days = [];
  if (prog.monday) days.push('Monday');
  if (prog.tuesday) days.push('Tuesday');
  if (prog.wednesday) days.push('Wednesday');
  if (prog.thursday) days.push('Thursday');
  if (prog.friday) days.push('Friday');
  if (prog.saturday) days.push('Saturday');
  if (prog.sunday) days.push('Sunday');
  return days;
}

module.exports = { checkProfessorConflicts, checkCandidateScheduleConflicts };
