const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/schedule/:professorId — full schedule view for a professor
router.get('/:professorId', authenticate, async (req, res, next) => {
  try {
    const { professorId } = req.params;

    // Professor info
    const [[prof]] = await pool.query(
      `SELECT p.*, ps.professor_status_name,
              c.city_name, ga.geographic_area_name,
              os.onboard_status_name,
              CONCAT(fm.first_name, ' ', fm.last_name) AS field_manager_name,
              CONCAT(sc.first_name, ' ', sc.last_name) AS scheduler_name
       FROM professor p
       LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN onboard_status os ON os.id = p.onboard_status_id
       LEFT JOIN user fm ON fm.id = ga.field_manager_user_id
       LEFT JOIN user sc ON sc.id = p.scheduling_coordinator_owner_id
       WHERE p.id = ? AND p.active = 1`,
      [professorId]
    );

    if (!prof) return res.status(404).json({ success: false, error: 'Professor not found' });

    // Active programs where this professor is lead or assistant
    const [programs] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              prog.lead_professor_id, prog.assistant_professor_id,
              prog.lead_professor_pay, prog.assistant_professor_pay,
              prog.first_session_date, prog.last_session_date,
              cs.class_status_name,
              loc.nickname AS location_nickname, loc.school_name, loc.address,
              loc.point_of_contact AS location_contact,
              cl.class_name, cl.class_code,
              pt.program_type_name,
              ct.class_type_name
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id AND cs.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN class_type ct ON ct.id = cl.class_type_id
       WHERE prog.active = 1
         AND cs.class_status_name NOT LIKE 'Cancelled%'
         AND (prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)
       ORDER BY prog.first_session_date DESC`,
      [professorId, professorId]
    );

    // Sessions for this professor
    const [sessions] = await pool.query(
      `SELECT s.id, s.session_date, s.session_time, s.professor_pay, s.assistant_pay,
              s.not_billed, s.specific_notes,
              s.professor_id AS session_professor_id,
              s.assistant_id AS session_assistant_id,
              prog.program_nickname, prog.lead_professor_id, prog.assistant_professor_id,
              prog.id AS program_id,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              cl.class_name,
              l.lesson_name
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.active = 1
         AND (s.professor_id = ? OR s.assistant_id = ? OR prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)
       ORDER BY s.session_date ASC, s.session_time ASC`,
      [professorId, professorId, professorId, professorId]
    );

    // Upcoming parties
    const [parties] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.start_time,
              prog.class_length_minutes, prog.party_location_text,
              prog.lead_professor_pay, prog.assistant_professor_pay,
              prog.lead_professor_id,
              cs.class_status_name,
              pf.party_format_name,
              cl.class_name AS party_theme
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       WHERE prog.active = 1
         AND pt.program_type_name = 'Party'
         AND (prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)
         AND prog.first_session_date >= CURDATE()
       ORDER BY prog.first_session_date ASC`,
      [professorId, professorId]
    );

    // Unique locations
    const locationIds = [...new Set(programs.map(p => p.location_nickname).filter(Boolean))];

    // Availability
    const [availability] = await pool.query(
      `SELECT a.*, w.weekday_name FROM availability a
       LEFT JOIN weekday w ON w.id = a.weekday_id
       WHERE a.professor_id = ? AND a.active = 1 ORDER BY a.weekday_id`,
      [professorId]
    );

    // Substitute dates
    const [subDates] = await pool.query(
      `SELECT d.id, d.date_requested, d.substitute_reason_id, d.notes, sr.reason_name
       FROM day_off d
       LEFT JOIN substitute_reason sr ON sr.id = d.substitute_reason_id
       WHERE d.professor_id = ? AND d.active = 1
       ORDER BY d.date_requested DESC`,
      [professorId]
    );

    // Observations
    const [observations] = await pool.query(
      `SELECT po.id, po.observation_date, po.observation_type, po.pay_amount, po.is_paid, po.status, po.notes,
              prog.program_nickname, prog.start_time, prog.class_length_minutes,
              loc.nickname AS location_nickname, loc.address,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_name,
              lp.phone_number AS lead_professor_phone
       FROM professor_observation po
       JOIN program prog ON prog.id = po.program_id AND prog.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       WHERE po.professor_id = ? AND po.active = 1
       ORDER BY po.observation_date ASC`,
      [professorId]
    );

    res.json({
      success: true,
      data: {
        professor: prof,
        programs,
        sessions,
        parties,
        availability,
        subDates,
        observations,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════
// PROFESSOR PORTAL — Today/Tomorrow + Confirmation
// ═══════════════════════════════════════════════════════════════════

// GET /api/schedule/my-today — professor's sessions for today and tomorrow
router.get('/my-today', authenticate, async (req, res, next) => {
  try {
    // Get professor ID from user
    const [[prof]] = await pool.query('SELECT id, professor_nickname, last_name FROM professor WHERE user_id = ? AND active = 1', [req.user.userId]);
    if (!prof) return res.status(404).json({ success: false, error: 'No professor profile found' });

    const [sessions] = await pool.query(
      `SELECT s.id, s.session_date, s.session_time, s.professor_pay, s.assistant_pay,
              s.professor_confirmed, s.professor_confirmed_at, s.specific_notes,
              prog.id AS program_id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.lead_professor_id,
              cs.class_status_name,
              loc.nickname AS location_nickname, loc.school_name, loc.address,
              loc.parking_information, loc.school_procedure_Info, loc.point_of_contact, loc.poc_phone,
              l.lesson_name, l.trainual_link
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.active = 1
         AND s.session_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 1 DAY)
         AND (s.professor_id = ? OR s.assistant_id = ? OR prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)
       ORDER BY s.session_date ASC, s.session_time ASC`,
      [prof.id, prof.id, prof.id, prof.id]
    );

    res.json({ success: true, data: { professor: prof, sessions } });
  } catch (err) { next(err); }
});

// POST /api/schedule/confirm-session/:sessionId — professor confirms a session
router.post('/confirm-session/:sessionId', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE session SET professor_confirmed = 1, professor_confirmed_at = NOW() WHERE id = ?',
      [req.params.sessionId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/schedule/my-pay — professor's pay history
router.get('/my-pay', authenticate, async (req, res, next) => {
  try {
    const [[prof]] = await pool.query('SELECT id FROM professor WHERE user_id = ? AND active = 1', [req.user.userId]);
    if (!prof) return res.status(404).json({ success: false, error: 'No professor profile found' });

    const { search } = req.query;
    let where = 'WHERE psp.professor_id = ?';
    const params = [prof.id];
    if (search) {
      where += ' AND prog.program_nickname LIKE ?';
      params.push(`%${search}%`);
    }

    const [rows] = await pool.query(
      `SELECT psp.id, psp.session_date, psp.pay_amount, psp.role, psp.is_substitute,
              psp.regular_pay_component, psp.bonus_component,
              prog.program_nickname, prog.start_time,
              loc.nickname AS location_nickname
       FROM program_session_pay psp
       JOIN program prog ON prog.id = psp.program_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       ${where}
       ORDER BY psp.session_date DESC
       LIMIT 200`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/schedule/my-attendance — professor's programs for attendance/classroom
router.get('/my-attendance', authenticate, async (req, res, next) => {
  try {
    const [[prof]] = await pool.query('SELECT id FROM professor WHERE user_id = ? AND active = 1', [req.user.userId]);
    if (!prof) return res.status(404).json({ success: false, error: 'No professor profile found' });

    const [programs] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday,
              prog.first_session_date, prog.last_session_date,
              prog.lead_professor_id,
              cs.class_status_name,
              loc.nickname AS location_nickname
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       WHERE prog.active = 1
         AND cs.class_status_name NOT LIKE 'Cancelled%'
         AND (prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)
         AND (prog.last_session_date >= CURDATE() OR prog.last_session_date IS NULL)
       ORDER BY prog.program_nickname`,
      [prof.id, prof.id]
    );

    res.json({ success: true, data: programs });
  } catch (err) { next(err); }
});

module.exports = router;
