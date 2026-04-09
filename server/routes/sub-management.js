const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { checkProfessorConflicts } = require('../lib/scheduleConflict');

router.use(authenticate);

// GET /api/sub-management/needs — sessions needing subs
// Finds future sessions where the lead/assist professor has a day_off but hasn't been replaced
router.get('/needs', async (req, res, next) => {
  try {
    const { area, days = 14, areas } = req.query;
    const daysInt = Math.min(parseInt(days) || 14, 90);

    let areaClauses = [];
    let areaParams = [];
    if (areas) {
      // Comma-separated area IDs
      const ids = areas.split(',').map(Number).filter(Boolean);
      if (ids.length) { areaClauses.push(`ga.id IN (?)`); areaParams.push(ids); }
    } else if (area) {
      areaClauses.push(`ga.id = ?`);
      areaParams.push(area);
    }
    const areaWhere = areaClauses.length ? `AND ${areaClauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT d.id AS day_off_id, d.date_requested, d.notes AS sub_notes, sr.reason_name,
              d.professor_id AS off_professor_id,
              s.id AS session_id, s.session_date, s.session_time,
              s.professor_id AS session_professor_id, s.assistant_id AS session_assistant_id,
              prog.id AS program_id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.lead_professor_id, prog.assistant_professor_id,
              prog.lead_professor_pay, prog.assistant_professor_pay,
              cs.class_status_name,
              loc.id AS location_id, loc.nickname AS location_nickname, loc.school_name, loc.address,
              loc.virtus_required, loc.livescan_required, loc.tb_required,
              ga.id AS area_id, ga.geographic_area_name,
              p.professor_nickname AS off_professor_name, p.last_name AS off_professor_last,
              CASE WHEN prog.lead_professor_id = d.professor_id THEN 'Lead' ELSE 'Assistant' END AS role_needing_sub
       FROM day_off d
       JOIN session s ON s.session_date = d.date_requested AND s.active = 1
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN substitute_reason sr ON sr.id = d.substitute_reason_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       LEFT JOIN professor p ON p.id = d.professor_id
       WHERE d.active = 1
         AND d.date_requested >= CURDATE()
         AND d.date_requested <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND cs.class_status_name NOT LIKE 'Cancelled%'
         AND (prog.lead_professor_id = d.professor_id OR prog.assistant_professor_id = d.professor_id)
         AND (
           (prog.lead_professor_id = d.professor_id AND (s.professor_id IS NULL OR s.professor_id = d.professor_id))
           OR
           (prog.assistant_professor_id = d.professor_id AND (s.assistant_id IS NULL OR s.assistant_id = d.professor_id))
         )
         ${areaWhere}
       ORDER BY d.date_requested ASC, s.session_time ASC`,
      [daysInt, ...areaParams]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/sub-management/available-professors — professors who could sub for a given date + area
router.get('/available-professors', async (req, res, next) => {
  try {
    const { date, area_id, search_areas, show_all } = req.query;
    if (!date) return res.status(400).json({ success: false, error: 'Date required' });

    // Determine day of week (MySQL: 1=Sunday...7=Saturday, our weekday table: 1=Monday...7=Sunday)
    const d = new Date(date + 'T12:00:00');
    const jsDay = d.getDay(); // 0=Sun,1=Mon,...6=Sat
    const weekdayId = jsDay === 0 ? 7 : jsDay; // Convert to 1=Mon...7=Sun

    // Area filter
    let areaIds = [];
    if (search_areas) {
      areaIds = search_areas.split(',').map(Number).filter(Boolean);
    } else if (area_id) {
      areaIds = [parseInt(area_id)];
    }

    // Get all active professors (optionally filtered by area)
    let areaWhere = '';
    let areaParams = [];
    if (areaIds.length && show_all !== 'true') {
      areaWhere = 'AND ga.id IN (?)';
      areaParams = [areaIds];
    }

    const [professors] = await pool.query(
      `SELECT p.id, p.professor_nickname, p.last_name, p.email, p.phone_number,
              p.virtus, p.tb_test,
              p.science_trained_id, p.engineering_trained_id,
              p.base_pay,
              ps.professor_status_name,
              ga.id AS area_id, ga.geographic_area_name,
              c.city_name
       FROM professor p
       JOIN professor_status ps ON ps.id = p.professor_status_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       WHERE p.active = 1
         AND ps.professor_status_name IN ('Active', 'Substitute', 'Training')
         ${areaWhere}
       ORDER BY p.professor_nickname`,
      [...areaParams]
    );

    if (professors.length === 0) return res.json({ success: true, data: [] });

    const profIds = professors.map(p => p.id);

    // Check general availability for this day of week
    const [avail] = await pool.query(
      `SELECT professor_id, time_from, time_to FROM availability
       WHERE professor_id IN (?) AND weekday_id = ? AND active = 1`,
      [profIds, weekdayId]
    );
    const availMap = {};
    avail.forEach(a => { availMap[a.professor_id] = a; });

    // Check who has their own day_off on this date
    const [daysOff] = await pool.query(
      `SELECT professor_id FROM day_off WHERE professor_id IN (?) AND date_requested = ? AND active = 1`,
      [profIds, date]
    );
    const offSet = new Set(daysOff.map(d => d.professor_id));

    // Check who's already working on this date
    const [working] = await pool.query(
      `SELECT DISTINCT CASE
         WHEN s.professor_id IS NOT NULL THEN s.professor_id
         WHEN prog.lead_professor_id IN (?) THEN prog.lead_professor_id
         ELSE NULL END AS prof_id,
         prog.program_nickname, s.session_time
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       WHERE s.active = 1 AND s.session_date = ?
         AND (s.professor_id IN (?) OR s.assistant_id IN (?) OR prog.lead_professor_id IN (?) OR prog.assistant_professor_id IN (?))`,
      [profIds, date, profIds, profIds, profIds, profIds]
    );
    // Build a map of professor_id -> [{program, time}]
    // Actually let's simplify: just get distinct professor IDs working that day
    const [workingProfs] = await pool.query(
      `SELECT DISTINCT prof_id FROM (
         SELECT COALESCE(s.professor_id, prog.lead_professor_id) AS prof_id
         FROM session s
         JOIN program prog ON prog.id = s.program_id AND prog.active = 1
         WHERE s.active = 1 AND s.session_date = ?
           AND (COALESCE(s.professor_id, prog.lead_professor_id) IN (?))
         UNION
         SELECT COALESCE(s.assistant_id, prog.assistant_professor_id) AS prof_id
         FROM session s
         JOIN program prog ON prog.id = s.program_id AND prog.active = 1
         WHERE s.active = 1 AND s.session_date = ?
           AND (COALESCE(s.assistant_id, prog.assistant_professor_id) IN (?))
       ) AS t WHERE prof_id IS NOT NULL`,
      [date, profIds, date, profIds]
    );
    const workingSet = new Set(workingProfs.map(w => w.prof_id));

    // Annotate professors
    const result = professors.map(p => ({
      ...p,
      generally_available: !!availMap[p.id],
      availability_times: availMap[p.id] ? `${availMap[p.id].time_from || ''} - ${availMap[p.id].time_to || ''}` : null,
      has_day_off: offSet.has(p.id),
      already_working: workingSet.has(p.id),
      in_target_area: areaIds.length ? areaIds.includes(p.area_id) : true,
    }));

    // Sort: available & free first, then available & working, then unavailable
    result.sort((a, b) => {
      const scoreA = (a.has_day_off ? 100 : 0) + (a.already_working ? 10 : 0) + (a.generally_available ? 0 : 1);
      const scoreB = (b.has_day_off ? 100 : 0) + (b.already_working ? 10 : 0) + (b.generally_available ? 0 : 1);
      return scoreA - scoreB;
    });

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/sub-management/assign — assign a professor as sub on a session
router.post('/assign', async (req, res, next) => {
  try {
    const { session_id, professor_id, role, force } = req.body;
    if (!session_id || !professor_id) return res.status(400).json({ success: false, error: 'Session and professor required' });

    // Get session date + program for conflict check
    const [[session]] = await pool.query(
      'SELECT s.session_date, s.program_id, s.session_time, prog.start_time, prog.class_length_minutes FROM session s JOIN program prog ON prog.id = s.program_id WHERE s.id = ?',
      [session_id]
    );
    if (session) {
      const conflicts = await checkProfessorConflicts(professor_id, session.program_id, { checkDate: session.session_date?.toISOString().split('T')[0] });
      if (conflicts.length && !force) {
        return res.status(409).json({ success: false, error: 'Schedule conflicts detected', conflicts });
      }
    }

    if (role === 'Assistant') {
      await pool.query('UPDATE session SET assistant_id = ?, ts_updated = NOW() WHERE id = ?', [professor_id, session_id]);
    } else {
      await pool.query('UPDATE session SET professor_id = ?, ts_updated = NOW() WHERE id = ?', [professor_id, session_id]);
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/sub-management/unassign — remove sub assignment (revert to program default)
router.post('/unassign', async (req, res, next) => {
  try {
    const { session_id, role } = req.body;
    if (!session_id) return res.status(400).json({ success: false, error: 'Session required' });

    if (role === 'Assistant') {
      await pool.query('UPDATE session SET assistant_id = NULL, ts_updated = NOW() WHERE id = ?', [session_id]);
    } else {
      await pool.query('UPDATE session SET professor_id = NULL, ts_updated = NOW() WHERE id = ?', [session_id]);
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
