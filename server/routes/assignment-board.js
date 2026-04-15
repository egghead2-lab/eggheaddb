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
              ct.class_type_name,
              lp.professor_nickname AS lead_professor_nickname,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_display,
              prog.lead_professor_pay,
              loc.retained
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id AND cs.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN class_type ct ON ct.id = cl.class_type_id
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

    const enrichedPrograms = [];
    for (const p of programs) {
      const progDays = dayNames
        .map((d, i) => p[d] ? dayLabels[i] : null)
        .filter(Boolean);
      const isMultiDay = progDays.filter(d => ['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(d)).length > 1;
      const weekdayDays = progDays.filter(d => ['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(d));
      const displayDays = weekdayDays.length > 0 ? weekdayDays : [progDays[0] || ''];

      const base = {
        id: p.id,
        nickname: p.program_nickname,
        className: p.class_name,
        programType: (p.class_type_name || p.program_type_name || '').toLowerCase(),
        professorId: p.lead_professor_id,
        professorName: p.lead_professor_display || '',
        locationNickname: p.location_nickname,
        status: p.class_status_name,
        startTime: p.start_time,
        classLength: p.class_length_minutes,
        firstDate: p.first_session_date,
        lastDate: p.last_session_date,
        days: progDays,
        isMultiDay,
        pay: p.lead_professor_pay,
        retained: !!p.retained,
      };

      // Create one entry per weekday the program runs on
      for (const day of displayDays) {
        enrichedPrograms.push({ ...base, displayDay: day });
      }
    }

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

// ═══════════════════════════════════════════════════════════════
// AUTO-SCHEDULER — suggest optimal professor assignments
// ═══════════════════════════════════════════════════════════════

router.post('/auto-schedule', authenticate, async (req, res, next) => {
  try {
    const { areas, start_date, end_date, only_unassigned = true } = req.body;
    if (!areas?.length || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'areas, start_date, end_date required' });
    }

    const areaPlaceholders = areas.map(() => '?').join(',');

    // ── Load programs ──────────────────────────────────────────
    const [programs] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              prog.lead_professor_id, prog.lead_professor_pay,
              prog.location_id,
              cs.class_status_name,
              loc.nickname AS location_nickname, loc.contractor_id,
              loc.livescan_required, loc.virtus_required, loc.tb_required, loc.retained,
              cl.class_name, cl.class_type_id,
              ct.class_type_name,
              ga.id AS area_id
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN class_type ct ON ct.id = cl.class_type_id
       WHERE prog.active = 1
         AND cs.class_status_name IN ('Confirmed', 'Unconfirmed')
         AND ga.geographic_area_name IN (${areaPlaceholders})
         AND (prog.last_session_date >= ? OR prog.last_session_date IS NULL)
         AND (prog.first_session_date <= ? OR prog.first_session_date IS NULL)
       ORDER BY loc.livescan_required DESC, loc.virtus_required DESC, prog.program_nickname`,
      [...areas, start_date, end_date]
    );

    // Filter to unassigned if requested
    const toAssign = only_unassigned
      ? programs.filter(p => !p.lead_professor_id)
      : programs;

    if (toAssign.length === 0) {
      return res.json({ success: true, data: { suggestions: [], unassignable: [], stats: { total: 0, suggested: 0, unassignable: 0 } } });
    }

    // ── Load professors ────────────────────────────────────────
    const [professors] = await pool.query(
      `SELECT p.id, p.professor_nickname, p.last_name,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS display_name,
              p.science_trained_id, p.engineering_trained_id, p.robotics_trained_id,
              p.studysmart_trained_id, p.camp_trained_id,
              p.virtus, p.tb_test, p.rating, p.base_pay,
              ps.professor_status_name,
              COALESCE(c.geographic_area_id, p.geographic_area_id) AS area_id
       FROM professor p
       JOIN professor_status ps ON ps.id = p.professor_status_id
       LEFT JOIN city c ON c.id = p.city_id
       WHERE p.active = 1
         AND ps.professor_status_name IN ('Active', 'Substitute', 'Training')
       ORDER BY p.professor_nickname`
    );

    // ── Load availability ──────────────────────────────────────
    const profIds = professors.map(p => p.id);
    if (profIds.length === 0) {
      return res.json({ success: true, data: { suggestions: [], unassignable: toAssign.map(p => ({ program_id: p.id, program_nickname: p.program_nickname, reason: 'No eligible professors' })), stats: { total: toAssign.length, suggested: 0, unassignable: toAssign.length } } });
    }

    const [availability] = await pool.query(
      `SELECT professor_id, weekday_id FROM availability WHERE professor_id IN (?) AND active = 1`,
      [profIds]
    );
    const availMap = {}; // prof_id -> Set of weekday_ids
    availability.forEach(a => {
      if (!availMap[a.professor_id]) availMap[a.professor_id] = new Set();
      availMap[a.professor_id].add(a.weekday_id);
    });

    // ── Load livescans ─────────────────────────────────────────
    const [livescans] = await pool.query(
      `SELECT professor_id, location_id, contractor_id FROM livescan WHERE professor_id IN (?) AND active = 1`,
      [profIds]
    );
    const livescanMap = {}; // prof_id -> { locations: Set, contractors: Set }
    livescans.forEach(ls => {
      if (!livescanMap[ls.professor_id]) livescanMap[ls.professor_id] = { locations: new Set(), contractors: new Set() };
      if (ls.location_id) livescanMap[ls.professor_id].locations.add(ls.location_id);
      if (ls.contractor_id) livescanMap[ls.professor_id].contractors.add(ls.contractor_id);
    });

    // ── Load day_offs ──────────────────────────────────────────
    const [dayOffs] = await pool.query(
      `SELECT professor_id, date_requested FROM day_off WHERE professor_id IN (?) AND active = 1 AND date_requested BETWEEN ? AND ?`,
      [profIds, start_date, end_date]
    );
    const dayOffMap = {}; // prof_id -> Set of date strings
    dayOffs.forEach(d => {
      if (!dayOffMap[d.professor_id]) dayOffMap[d.professor_id] = new Set();
      dayOffMap[d.professor_id].add(d.date_requested.toISOString().split('T')[0]);
    });

    // ── Load historical teaching ───────────────────────────────
    const [history] = await pool.query(
      `SELECT DISTINCT lead_professor_id, location_id, class_id FROM program
       WHERE active = 1 AND lead_professor_id IS NOT NULL AND location_id IS NOT NULL`
    );
    const historyMap = {}; // prof_id -> { locations: Set, classes: Set }
    history.forEach(h => {
      if (!historyMap[h.lead_professor_id]) historyMap[h.lead_professor_id] = { locations: new Set(), classes: new Set() };
      historyMap[h.lead_professor_id].locations.add(h.location_id);
      if (h.class_id) historyMap[h.lead_professor_id].classes.add(h.class_id);
    });

    // ── Current assignments (track as we assign) ───────────────
    const currentAssignments = {}; // prof_id -> [{ location_id, class_type_id, day }]
    programs.forEach(p => {
      if (p.lead_professor_id) {
        if (!currentAssignments[p.lead_professor_id]) currentAssignments[p.lead_professor_id] = [];
        currentAssignments[p.lead_professor_id].push({
          location_id: p.location_id,
          class_type_id: p.class_type_id,
        });
      }
    });

    // ── Weekday mapping ────────────────────────────────────────
    const dayNameToId = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    function getProgramDayIds(prog) {
      return dayNames.filter(d => prog[d]).map(d => dayNameToId[d]);
    }

    // Training check
    function hasTraining(prof, classTypeName) {
      const t = (classTypeName || '').toLowerCase();
      if (t.includes('science')) return !!prof.science_trained_id;
      if (t.includes('engineering')) return !!prof.engineering_trained_id;
      if (t.includes('robotics')) return !!prof.robotics_trained_id;
      if (t.includes('financial')) return !!prof.studysmart_trained_id;
      return true; // unknown type, allow
    }

    // Time overlap check
    function timeToMin(t) {
      if (!t) return 0;
      const s = t.toString();
      const parts = s.split(':');
      return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
    }

    // ── Scoring function ───────────────────────────────────────
    function scoreProf(prof, prog) {
      let score = 0;
      const reasons = [];
      const breakdown = {};

      // Livescan match
      const ls = livescanMap[prof.id];
      if (prog.livescan_required) {
        if (ls?.locations.has(prog.location_id) || ls?.contractors.has(prog.contractor_id)) {
          score += 50; breakdown.livescan = 50; reasons.push('Has livescan');
        } else {
          return null; // Hard fail if livescan required but not cleared
        }
      } else if (ls?.locations.has(prog.location_id)) {
        score += 50; breakdown.livescan = 50; reasons.push('Has livescan (bonus)');
      }

      // Virtus
      if (prog.virtus_required && prof.virtus) {
        score += 20; breakdown.virtus = 20; reasons.push('Virtus cleared');
      } else if (prog.virtus_required && !prof.virtus) {
        return null; // Hard fail
      }

      // TB
      if (prog.tb_required && prof.tb_test) {
        score += 20; breakdown.tb = 20; reasons.push('TB cleared');
      } else if (prog.tb_required && !prof.tb_test) {
        return null; // Hard fail
      }

      // Already at same location
      const profAssignments = currentAssignments[prof.id] || [];
      if (profAssignments.some(a => a.location_id === prog.location_id)) {
        score += 30; breakdown.same_location = 30; reasons.push('Already at this location');
      }

      // Same class type consistency
      if (profAssignments.some(a => a.class_type_id === prog.class_type_id)) {
        score += 25; breakdown.same_type = 25; reasons.push('Already teaching this type');
      }

      // Taught at location before
      if (historyMap[prof.id]?.locations.has(prog.location_id)) {
        score += 15; breakdown.taught_here = 15; reasons.push('Taught here before');
      }

      // In home territory
      if (prof.area_id === prog.area_id) {
        score += 10; breakdown.in_territory = 10; reasons.push('Home territory');
      }

      // Load balance (fewer = better)
      const loadPenalty = Math.max(0, profAssignments.length - 4) * -5;
      if (loadPenalty) { score += loadPenalty; breakdown.load = loadPenalty; }

      // Status penalty
      if (prof.professor_status_name === 'Substitute') { score -= 10; breakdown.status = -10; }
      if (prof.professor_status_name === 'Training') { score -= 20; breakdown.status = -20; }

      // Rating bonus
      if (prof.rating) {
        const rBonus = Math.round(parseFloat(prof.rating) * 3);
        score += rBonus; breakdown.rating = rBonus;
      }

      return { score, breakdown, reasons };
    }

    // ── Greedy assignment ──────────────────────────────────────
    const suggestions = [];
    const unassignable = [];

    // Sort programs: hardest first (livescan required, multi-day, etc.)
    toAssign.sort((a, b) => {
      const aHard = (a.livescan_required ? 100 : 0) + (a.virtus_required ? 50 : 0);
      const bHard = (b.livescan_required ? 100 : 0) + (b.virtus_required ? 50 : 0);
      return bHard - aHard;
    });

    const assignedTimeSlots = {}; // prof_id -> [{ dayId, startMin, endMin }]

    for (const prog of toAssign) {
      const progDayIds = getProgramDayIds(prog);
      const startMin = timeToMin(prog.start_time);
      const endMin = startMin + (prog.class_length_minutes || 60);

      let bestProf = null;
      let bestResult = null;

      for (const prof of professors) {
        // Hard: availability on ALL program days
        const profAvail = availMap[prof.id];
        if (!profAvail || !progDayIds.every(d => profAvail.has(d))) continue;

        // Hard: training
        if (!hasTraining(prof, prog.class_type_name)) continue;

        // Hard: time conflict
        const slots = assignedTimeSlots[prof.id] || [];
        const hasConflict = progDayIds.some(dayId =>
          slots.some(s => s.dayId === dayId && startMin < s.endMin && endMin > s.startMin)
        );
        if (hasConflict) continue;

        // Score
        const result = scoreProf(prof, prog);
        if (!result) continue; // hard fail from scoring (livescan/virtus/tb)

        if (!bestResult || result.score > bestResult.score) {
          bestProf = prof;
          bestResult = result;
        }
      }

      if (bestProf && bestResult) {
        suggestions.push({
          program_id: prog.id,
          program_nickname: prog.program_nickname,
          location_nickname: prog.location_nickname,
          class_type: prog.class_type_name,
          suggested_professor_id: bestProf.id,
          suggested_professor_name: bestProf.display_name,
          score: bestResult.score,
          score_breakdown: bestResult.breakdown,
          reasons: bestResult.reasons,
          current_professor_id: prog.lead_professor_id,
        });

        // Update tracking
        if (!currentAssignments[bestProf.id]) currentAssignments[bestProf.id] = [];
        currentAssignments[bestProf.id].push({ location_id: prog.location_id, class_type_id: prog.class_type_id });

        if (!assignedTimeSlots[bestProf.id]) assignedTimeSlots[bestProf.id] = [];
        progDayIds.forEach(dayId => {
          assignedTimeSlots[bestProf.id].push({ dayId, startMin, endMin });
        });
      } else {
        unassignable.push({
          program_id: prog.id,
          program_nickname: prog.program_nickname,
          location_nickname: prog.location_nickname,
          reason: 'No eligible professor with availability and required qualifications',
        });
      }
    }

    res.json({
      success: true,
      data: {
        suggestions: suggestions.sort((a, b) => b.score - a.score),
        unassignable,
        stats: {
          total: toAssign.length,
          suggested: suggestions.length,
          unassignable: unassignable.length,
          avg_score: suggestions.length > 0 ? Math.round(suggestions.reduce((s, r) => s + r.score, 0) / suggestions.length) : 0,
        },
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
