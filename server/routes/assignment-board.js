const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { checkProfessorConflicts } = require('../lib/scheduleConflict');

// GET /api/assignment-board/data — load board data filtered by areas and date range
router.get('/data', authenticate, async (req, res, next) => {
  try {
    const { areas, start_date, end_date } = req.query;
    if (!areas || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'areas, start_date, end_date required' });
    }

    const areaList = areas.split(',').map(a => a.trim()).filter(Boolean);
    if (!areaList.length) return res.json({ success: true, data: { programs: [], professors: [] } });

    const areaPlaceholders = areaList.map(() => '?').join(',');

    // Programs in selected areas within date range, not cancelled
    const [programs] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              prog.lead_professor_id, prog.first_session_date, prog.last_session_date,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              cl.class_name,
              pt.program_type_name,
              lp.professor_nickname AS lead_professor_nickname,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_display
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id AND cs.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id AND lp.active = 1
       WHERE prog.active = 1
         AND cs.class_status_name IN ('Confirmed', 'Unconfirmed')
         AND ga.geographic_area_name IN (${areaPlaceholders})
         AND (prog.last_session_date >= ? OR prog.last_session_date IS NULL)
         AND (prog.first_session_date <= ? OR prog.first_session_date IS NULL)
       ORDER BY prog.program_nickname`,
      [...areaList, start_date, end_date]
    );

    // Get assigned professor IDs to force-include them
    const assignedProfIds = [...new Set(programs.map(p => p.lead_professor_id).filter(Boolean))];

    // Professors: active/training/substitute in selected areas + any assigned professors
    let profQuery = `
      SELECT p.id, p.professor_nickname, p.last_name,
             CONCAT(p.professor_nickname, ' ', p.last_name) AS display_name,
             ps.professor_status_name,
             ga.geographic_area_name AS home_territory
      FROM professor p
      LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
      LEFT JOIN city c ON c.id = p.city_id
      LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
      WHERE p.active = 1
        AND ps.professor_status_name IN ('Active', 'Training', 'Substitute')
        AND ga.geographic_area_name IN (${areaPlaceholders})`;

    const profParams = [...areaList];

    if (assignedProfIds.length) {
      profQuery += ` UNION SELECT p.id, p.professor_nickname, p.last_name,
             CONCAT(p.professor_nickname, ' ', p.last_name) AS display_name,
             ps.professor_status_name,
             ga.geographic_area_name AS home_territory
      FROM professor p
      LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
      LEFT JOIN city c ON c.id = p.city_id
      LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
      WHERE p.id IN (${assignedProfIds.map(() => '?').join(',')})`;
      profParams.push(...assignedProfIds);
    }

    profQuery += ' ORDER BY display_name';
    const [professors] = await pool.query(profQuery, profParams);

    // Availability for all returned professors
    const profIds = professors.map(p => p.id);
    let availability = [];
    if (profIds.length) {
      [availability] = await pool.query(
        `SELECT a.professor_id, w.weekday_name
         FROM availability a
         LEFT JOIN weekday w ON w.id = a.weekday_id
         WHERE a.professor_id IN (${profIds.map(() => '?').join(',')}) AND a.active = 1`,
        profIds
      );
    }

    // Build availability map: prof_id -> { Monday: true, ... }
    const availMap = {};
    availability.forEach(a => {
      if (!availMap[a.professor_id]) availMap[a.professor_id] = {};
      availMap[a.professor_id][a.weekday_name] = true;
    });

    // Determine display day for each program
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const enrichedPrograms = programs.map(p => {
      const progDays = dayNames
        .map((d, i) => p[d] ? dayLabels[i] : null)
        .filter(Boolean);
      return {
        id: p.id,
        nickname: p.program_nickname,
        className: p.class_name,
        programType: (p.program_type_name || '').toLowerCase(),
        professorId: p.lead_professor_id,
        professorName: p.lead_professor_display || '',
        locationNickname: p.location_nickname,
        status: p.class_status_name,
        startTime: p.start_time,
        classLength: p.class_length_minutes,
        firstDate: p.first_session_date,
        lastDate: p.last_session_date,
        days: progDays,
        displayDay: progDays.find(d => ['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(d)) || progDays[0] || '',
      };
    });

    const enrichedProfs = professors.map(p => ({
      id: p.id,
      name: p.display_name,
      nickname: p.professor_nickname,
      status: p.professor_status_name,
      homeTerritory: p.home_territory || '',
      availability: availMap[p.id] || {},
    }));

    res.json({ success: true, data: { programs: enrichedPrograms, professors: enrichedProfs } });
  } catch (err) {
    next(err);
  }
});

// POST /api/assignment-board/assign — bulk reassign professors to programs
router.post('/assign', authenticate, async (req, res, next) => {
  try {
    const { changes } = req.body;
    if (!Array.isArray(changes) || !changes.length) {
      return res.status(400).json({ success: false, error: 'changes array required' });
    }

    // Check conflicts for all assignments
    const allConflicts = [];
    for (const { programId, newProfessorId } of changes) {
      if (!newProfessorId) continue;
      const conflicts = await checkProfessorConflicts(newProfessorId, programId);
      if (conflicts.length) {
        allConflicts.push({ programId, professorId: newProfessorId, conflicts });
      }
    }

    // If force=true in body, proceed despite conflicts; otherwise warn
    if (allConflicts.length > 0 && !req.body.force) {
      return res.status(409).json({ success: false, error: 'Schedule conflicts detected', conflicts: allConflicts });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const { programId, newProfessorId } of changes) {
        await conn.query(
          `UPDATE program SET lead_professor_id = ?, ts_updated = NOW() WHERE id = ?`,
          [newProfessorId || null, programId]
        );
      }

      await conn.commit();
      res.json({ success: true, updated: changes.length, conflicts_overridden: allConflicts.length });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
