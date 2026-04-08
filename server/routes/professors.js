const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/professors
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status, area, training, sort, dir, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = ['p.active = 1'];
    let params = [];

    if (search) {
      whereClauses.push(`(p.professor_nickname LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR p.email LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (status) {
      whereClauses.push(`ps.professor_status_name = ?`);
      params.push(status);
    } else {
      whereClauses.push(`ps.professor_status_name != 'Terminated'`);
    }
    if (area) {
      whereClauses.push(`p.geographic_area = ?`);
      params.push(area);
    }
    if (training) {
      const trainingMap = {
        science_trained_id: 'p.science_trained_id = 1',
        engineering_trained_id: 'p.engineering_trained_id = 1',
        robotics_trained_id: 'p.robotics_trained_id = 1',
        show_party_trained_id: 'p.show_party_trained_id = 1',
        studysmart_trained_id: 'p.studysmart_trained_id = 1',
        camp_trained_id: 'p.camp_trained_id = 1',
      };
      if (trainingMap[training]) {
        whereClauses.push(trainingMap[training]);
      }
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const sortMap = {
      nickname: 'p.professor_nickname', status: 'ps.professor_status_name',
      area: 'p.geographic_area', base_pay: 'p.base_pay', rating: 'p.rating',
      programs: 'active_program_count',
    };
    const sortCol = sortMap[sort] || 'p.professor_nickname';
    const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

    const [rows] = await pool.query(
      `SELECT p.id, p.professor_nickname, p.first_name, p.last_name, p.email, p.phone_number,
              p.base_pay, p.rating, p.virtus, p.tb_test, p.geographic_area,
              p.science_trained_id, p.engineering_trained_id, p.robotics_trained_id,
              p.show_party_trained_id, p.studysmart_trained_id, p.camp_trained_id,
              ps.professor_status_name,
              c.city_name,
              CONCAT(sc_user.first_name, ' ', sc_user.last_name) AS scheduling_coordinator,
              (SELECT COUNT(*) FROM livescan l WHERE l.professor_id = p.id AND l.active = 1) AS livescan_count,
              (SELECT COUNT(*) FROM availability a WHERE a.professor_id = p.id AND a.active = 1) AS availability_count,
              (SELECT COUNT(*) FROM program pr LEFT JOIN class_status cs2 ON cs2.id = pr.class_status_id WHERE pr.active = 1 AND (pr.lead_professor_id = p.id OR pr.assistant_professor_id = p.id) AND cs2.class_status_name NOT LIKE 'Cancelled%' AND (pr.last_session_date >= CURDATE() OR pr.last_session_date IS NULL)) AS active_program_count
       FROM professor p
       LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN user sc_user ON sc_user.id = p.scheduling_coordinator_owner_id
       ${where}
       ORDER BY ${sortCol} ${sortDir}, p.last_name ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM professor p
       LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
       LEFT JOIN city c ON c.id = p.city_id
       ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/professors/my-profile — professor finds their own professor ID from their user ID
router.get('/my-profile', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [[prof]] = await pool.query('SELECT id FROM professor WHERE user_id = ? AND active = 1', [userId]);
    if (!prof) return res.status(404).json({ success: false, error: 'No professor profile found' });
    res.json({ success: true, data: { professor_id: prof.id } });
  } catch (err) { next(err); }
});

// GET /api/professors/observations/search-programs — search programs for observation scheduling
router.get('/observations/search-programs', authenticate, async (req, res, next) => {
  try {
    const { search, area_id } = req.query;
    let where = "WHERE prog.active = 1 AND cs.class_status_name NOT LIKE 'Cancelled%'";
    const params = [];
    if (search) { where += ' AND prog.program_nickname LIKE ?'; params.push(`%${search}%`); }
    if (area_id) { where += ' AND ga.id = ?'; params.push(area_id); }

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday,
              prog.first_session_date, prog.last_session_date,
              loc.nickname AS location_nickname, loc.address,
              ga.id AS area_id, ga.geographic_area_name,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_name,
              lp.phone_number AS lead_professor_phone
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       ${where}
       ORDER BY prog.program_nickname
       LIMIT 30`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/professors/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[professor]] = await pool.query(
      `SELECT p.*,
              ps.professor_status_name,
              c.city_name, c.zip_code, c.state_id,
              ga.geographic_area_name,
              os.onboard_status_name,
              pu.user_name AS login_username,
              pu.active AS login_active,
              pr.role_name AS login_role
       FROM professor p
       LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN onboard_status os ON os.id = p.onboard_status_id
       LEFT JOIN user pu ON pu.id = p.user_id
       LEFT JOIN role pr ON pr.id = pu.role_id
       WHERE p.id = ? AND p.active = 1`,
      [id]
    );

    if (!professor) {
      return res.status(404).json({ success: false, error: 'Professor not found' });
    }

    const [availability] = await pool.query(
      `SELECT a.*, w.weekday_name
       FROM availability a
       LEFT JOIN weekday w ON w.id = a.weekday_id
       WHERE a.professor_id = ? AND a.active = 1
       ORDER BY a.weekday_id`,
      [id]
    );

    const [livescans] = await pool.query(
      `SELECT l.*,
              loc.nickname AS location_nickname,
              c.contractor_name,
              COALESCE(c.contractor_name, loc.nickname) AS display_name
       FROM livescan l
       LEFT JOIN location loc ON loc.id = l.location_id
       LEFT JOIN contractor c ON c.id = l.contractor_id
       WHERE l.professor_id = ? AND l.active = 1
       ORDER BY l.livescan_date DESC`,
      [id]
    );

    const [bins] = await pool.query(
      `SELECT hb.*, b.bin_name
       FROM has_bin hb
       LEFT JOIN bin b ON b.id = hb.bin_id
       WHERE hb.professor_id = ? AND hb.active = 1
       ORDER BY b.bin_name`,
      [id]
    );

    const [daysOff] = await pool.query(
      `SELECT d.*, sr.reason_name
       FROM day_off d
       LEFT JOIN substitute_reason sr ON sr.id = d.substitute_reason_id
       WHERE d.professor_id = ? AND d.active = 1
       ORDER BY d.date_requested DESC`,
      [id]
    );

    const [incidents] = await pool.query(
      `SELECT * FROM incident WHERE professor_id = ? AND active = 1 ORDER BY incident_date DESC`,
      [id]
    );

    const [reviews] = await pool.query(
      `SELECT * FROM review WHERE professor_id = ? AND active = 1 ORDER BY review_date DESC`,
      [id]
    );

    const [upcomingSessions] = await pool.query(
      `SELECT s.session_date, s.session_time,
              s.professor_id AS session_professor_id,
              s.assistant_id AS session_assistant_id,
              prog.program_nickname, prog.location_id,
              prog.lead_professor_id, prog.assistant_professor_id,
              cs.class_status_name,
              loc.nickname AS location_nickname
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       WHERE s.active = 1 AND s.session_date >= CURDATE()
         AND (s.professor_id = ? OR s.assistant_id = ? OR prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)
       ORDER BY s.session_date ASC, s.session_time ASC
       LIMIT 20`,
      [id, id, id, id]
    );

    const [activePrograms] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.last_session_date,
              prog.session_count, cs.class_status_name, loc.nickname AS location_nickname,
              CASE WHEN prog.lead_professor_id = ? THEN 'Lead' ELSE 'Assist' END AS role
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       WHERE prog.active = 1 AND cs.class_status_name NOT LIKE 'Cancelled%'
         AND (prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)
         AND (prog.last_session_date >= CURDATE() OR prog.last_session_date IS NULL)
       ORDER BY prog.first_session_date ASC`,
      [id, id, id]
    );

    // Observations
    const [observations] = await pool.query(
      `SELECT po.*, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              loc.nickname AS location_nickname, loc.address,
              ga2.geographic_area_name AS program_area,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_name,
              lp.phone_number AS lead_professor_phone,
              CONCAT(u.first_name, ' ', u.last_name) AS assigned_by_name
       FROM professor_observation po
       JOIN program prog ON prog.id = po.program_id AND prog.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN geographic_area ga2 ON ga2.id = loc.geographic_area_id_online
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN user u ON u.id = po.assigned_by_user_id
       WHERE po.professor_id = ? AND po.active = 1
       ORDER BY po.observation_date ASC`,
      [id]
    );

    res.json({
      success: true,
      data: { ...professor, availability, livescans, bins, daysOff, incidents, reviews, upcomingSessions, activePrograms, observations },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/professors
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    const data = req.body;

    const fields = [
      'professor_nickname', 'professor_status_id', 'first_name', 'last_name', 'email',
      'phone_number', 'address', 'city_id', 'general_notes', 'emergency_contact',
      'emergency_contact_number', 'birthday', 'hire_date', 'termination_date',
      'termination_rason', 'schedule_link', 'base_pay', 'assist_pay', 'pickup_pay',
      'party_pay', 'camp_pay', 'science_trained_id', 'engineering_trained_id',
      'show_party_trained_id', 'slime_party_trained_id', 'demo_trained_id',
      'scheduling_coordinator_owner_id', 'studysmart_trained_id', 'camp_trained_id',
      'virtus', 'virtus_date', 'tb_test', 'tb_date', 'rating', 'onboard_status_id',
    ];

    const insertFields = fields.filter(f => data[f] !== undefined);
    const values = insertFields.map(f => data[f] === '' ? null : data[f]);

    const [result] = await pool.query(
      `INSERT INTO professor (${insertFields.join(', ')}, active, ts_inserted, ts_updated)
       VALUES (${insertFields.map(() => '?').join(', ')}, 1, NOW(), NOW())`,
      values
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/professors/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;
    const data = req.body;

    const fields = [
      'professor_nickname', 'professor_status_id', 'first_name', 'last_name', 'email',
      'phone_number', 'address', 'city_id', 'general_notes', 'availability_notes',
      'emergency_contact', 'emergency_contact_number', 'birthday', 'hire_date',
      'termination_date', 'termination_rason', 'schedule_link', 'base_pay', 'assist_pay',
      'pickup_pay', 'party_pay', 'camp_pay', 'science_trained_id', 'engineering_trained_id',
      'show_party_trained_id', 'slime_party_trained_id', 'demo_trained_id',
      'scheduling_coordinator_owner_id', 'studysmart_trained_id', 'camp_trained_id',
      'virtus', 'virtus_date', 'tb_test', 'tb_date', 'rating', 'onboard_status_id',
      'active',
    ];

    const updateFields = fields.filter(f => data[f] !== undefined);
    const values = updateFields.map(f => data[f] === '' ? null : data[f]);

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    await pool.query(
      `UPDATE professor SET ${updateFields.map(f => `${f} = ?`).join(', ')}, ts_updated = NOW()
       WHERE id = ?`,
      [...values, id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/professors/:id/livescans
router.post('/:id/livescans', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { contractor_id, location_id, livescan_date, livescan_link, notes, pass } = req.body;
    const [result] = await pool.query(
      `INSERT INTO livescan (professor_id, contractor_id, location_id, livescan_date, livescan_link, notes, pass, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [id, contractor_id || null, location_id || null, livescan_date || null, livescan_link || null, notes || null, pass ? 1 : 0]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/professors/:id/livescans/:lsId
router.put('/:id/livescans/:lsId', authenticate, async (req, res, next) => {
  try {
    const { lsId } = req.params;
    const { contractor_id, location_id, livescan_date, livescan_link, notes, pass } = req.body;
    await pool.query(
      `UPDATE livescan SET contractor_id = ?, location_id = ?, livescan_date = ?, livescan_link = ?, notes = ?, pass = ?, ts_updated = NOW()
       WHERE id = ?`,
      [contractor_id || null, location_id || null, livescan_date || null, livescan_link || null, notes || null, pass ? 1 : 0, lsId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/professors/:id/livescans/:lsId
router.delete('/:id/livescans/:lsId', authenticate, async (req, res, next) => {
  try {
    const { lsId } = req.params;
    await pool.query(`UPDATE livescan SET active = 0, ts_updated = NOW() WHERE id = ?`, [lsId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// AVAILABILITY
// ═══════════════════════════════════════════════════════════════════

// PUT /api/professors/:id/availability — bulk save all 7 days
// Body: { days: [{ weekday_id, available, time_from, time_to, notes }] }
router.put('/:id/availability', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { days } = req.body;
    if (!days || !Array.isArray(days)) return res.status(400).json({ success: false, error: 'days array required' });

    // Deactivate all existing
    await pool.query('UPDATE availability SET active = 0 WHERE professor_id = ?', [id]);

    // Insert active days
    for (const day of days) {
      if (!day.available) continue;
      await pool.query(
        'INSERT INTO availability (professor_id, weekday_id, time_from, time_to, notes, active) VALUES (?, ?, ?, ?, ?, 1)',
        [id, day.weekday_id, day.time_from || null, day.time_to || null, day.notes || '']
      );
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// SUBSTITUTE DATES (day_off)
// ═══════════════════════════════════════════════════════════════════

// POST /api/professors/:id/sub-dates — add single date
router.post('/:id/sub-dates', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { date_requested, substitute_reason_id, notes } = req.body;
    if (!date_requested) return res.status(400).json({ success: false, error: 'Date required' });

    // Check for duplicate
    const [existing] = await pool.query(
      'SELECT id FROM day_off WHERE professor_id = ? AND date_requested = ? AND active = 1', [id, date_requested]
    );
    if (existing.length > 0) return res.status(400).json({ success: false, error: 'Date already exists' });

    const [result] = await pool.query(
      `INSERT INTO day_off (professor_id, date_requested, substitute_reason_id, notes) VALUES (?, ?, ?, ?)`,
      [id, date_requested, substitute_reason_id || null, notes || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// POST /api/professors/:id/sub-dates/range — add a range of dates
router.post('/:id/sub-dates/range', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start_date, end_date, substitute_reason_id, notes } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ success: false, error: 'Start and end dates required' });

    const start = new Date(start_date + 'T12:00:00');
    const end = new Date(end_date + 'T12:00:00');
    if (end < start) return res.status(400).json({ success: false, error: 'End date must be after start date' });

    // Get existing dates to avoid duplicates
    const [existing] = await pool.query(
      'SELECT date_requested FROM day_off WHERE professor_id = ? AND date_requested BETWEEN ? AND ? AND active = 1',
      [id, start_date, end_date]
    );
    const existingSet = new Set(existing.map(e => e.date_requested.toISOString().split('T')[0]));

    let added = 0;
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      // Skip weekends (Sat=6, Sun=0)
      const dow = current.getDay();
      if (dow !== 0 && dow !== 6 && !existingSet.has(dateStr)) {
        await pool.query(
          'INSERT INTO day_off (professor_id, date_requested, substitute_reason_id, notes) VALUES (?, ?, ?, ?)',
          [id, dateStr, substitute_reason_id || null, notes || null]
        );
        added++;
      }
      current.setDate(current.getDate() + 1);
    }

    res.json({ success: true, added });
  } catch (err) { next(err); }
});

// PUT /api/professors/:id/sub-dates/:dateId — update reason/notes
router.put('/:id/sub-dates/:dateId', authenticate, async (req, res, next) => {
  try {
    const { dateId } = req.params;
    const { substitute_reason_id, notes } = req.body;
    await pool.query(
      'UPDATE day_off SET substitute_reason_id = ?, notes = ?, ts_updated = NOW() WHERE id = ?',
      [substitute_reason_id || null, notes || null, dateId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/professors/:id/sub-dates/:dateId — soft delete single
router.delete('/:id/sub-dates/:dateId', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE day_off SET active = 0, ts_updated = NOW() WHERE id = ?', [req.params.dateId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/professors/:id/sub-dates/bulk-delete — delete multiple dates
router.post('/:id/sub-dates/bulk-delete', authenticate, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ success: false, error: 'No IDs provided' });
    await pool.query('UPDATE day_off SET active = 0, ts_updated = NOW() WHERE id IN (?) AND professor_id = ?',
      [ids, req.params.id]);
    res.json({ success: true, deleted: ids.length });
  } catch (err) { next(err); }
});

// GET /api/professors/:id/sub-dates — get all sub dates (for schedule page)
router.get('/:id/sub-dates', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, sr.reason_name
       FROM day_off d
       LEFT JOIN substitute_reason sr ON sr.id = d.substitute_reason_id
       WHERE d.professor_id = ? AND d.active = 1
       ORDER BY d.date_requested DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// PROFESSOR PORTAL LOGIN
// ═══════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PROFESSOR_ROLE_ID = 17;

// POST /api/professors/:id/generate-login
router.post('/:id/generate-login', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[prof]] = await pool.query('SELECT * FROM professor WHERE id = ?', [id]);
    if (!prof) return res.status(404).json({ success: false, error: 'Professor not found' });
    if (prof.user_id) return res.status(400).json({ success: false, error: 'Login already exists' });

    // Generate username from nickname: first.last (lowercase)
    const nickParts = (prof.professor_nickname + ' ' + prof.last_name).trim().toLowerCase().split(/\s+/);
    let baseUsername = nickParts.length > 1
      ? `${nickParts[0]}.${nickParts[nickParts.length - 1]}`
      : nickParts[0];
    baseUsername = baseUsername.replace(/[^a-z0-9.]/g, '');

    let username = baseUsername;
    let suffix = 1;
    while (true) {
      const [existing] = await pool.query('SELECT id FROM user WHERE user_name = ?', [username]);
      if (existing.length === 0) break;
      username = `${baseUsername}${suffix}`;
      suffix++;
    }

    const rawPassword = crypto.randomBytes(4).toString('hex');
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const [userResult] = await pool.query(
      `INSERT INTO user (first_name, last_name, email, user_name, password, role_id, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [prof.first_name || prof.professor_nickname, prof.last_name || '', prof.email, username, hashedPassword, PROFESSOR_ROLE_ID]
    );

    await pool.query('UPDATE professor SET user_id = ? WHERE id = ?', [userResult.insertId, id]);

    res.json({ success: true, user_id: userResult.insertId, username, password: rawPassword });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'A user with this email already exists' });
    next(err);
  }
});

// POST /api/professors/:id/regenerate-password
router.post('/:id/regenerate-password', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[prof]] = await pool.query('SELECT user_id FROM professor WHERE id = ?', [id]);
    if (!prof) return res.status(404).json({ success: false, error: 'Professor not found' });
    if (!prof.user_id) return res.status(400).json({ success: false, error: 'No login exists yet' });

    const rawPassword = crypto.randomBytes(4).toString('hex');
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    await pool.query('UPDATE user SET password = ?, ts_updated = NOW() WHERE id = ?', [hashedPassword, prof.user_id]);

    res.json({ success: true, password: rawPassword });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// OBSERVATIONS
// ═══════════════════════════════════════════════════════════════════

// POST /api/professors/:id/observations — schedule an observation
router.post('/:id/observations', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { program_id, observation_date, observation_type, pay_amount, notes } = req.body;
    if (!program_id || !observation_date) return res.status(400).json({ success: false, error: 'Program and date required' });

    // Determine if observer is a field manager (unpaid by default)
    const [[prof]] = await pool.query(
      `SELECT p.user_id, u.role_id, r.role_name
       FROM professor p
       LEFT JOIN user u ON u.id = p.user_id
       LEFT JOIN role r ON r.id = u.role_id
       WHERE p.id = ?`, [id]
    );
    const isFieldManager = prof?.role_name === 'Field Manager';
    const type = observation_type || 'observation';
    const isPaid = isFieldManager ? 0 : 1;
    const pay = isFieldManager ? 0 : (pay_amount || null);

    const [result] = await pool.query(
      `INSERT INTO professor_observation (professor_id, program_id, observation_date, observation_type, pay_amount, is_paid, assigned_by_user_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, program_id, observation_date, type, pay, isPaid, req.user.userId, notes || null]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/professors/:id/observations/:obsId — update an observation
router.put('/:id/observations/:obsId', authenticate, async (req, res, next) => {
  try {
    const { obsId } = req.params;
    const fields = ['observation_date', 'observation_type', 'pay_amount', 'is_paid', 'status', 'notes'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields' });

    // Auto-set completed_at
    if (req.body.status === 'completed') { updates.push('completed_at'); req.body.completed_at = new Date().toISOString().slice(0, 19).replace('T', ' '); }

    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => req.body[f] === '' ? null : req.body[f]);
    await pool.query(`UPDATE professor_observation SET ${setClauses}, ts_updated = NOW() WHERE id = ?`, [...values, obsId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/professors/:id/observations/:obsId — cancel observation
router.delete('/:id/observations/:obsId', authenticate, async (req, res, next) => {
  try {
    await pool.query("UPDATE professor_observation SET active = 0, status = 'cancelled', ts_updated = NOW() WHERE id = ?", [req.params.obsId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/professors/:id/observations — for schedule page
router.get('/:id/observations', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT po.*, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              loc.nickname AS location_nickname, loc.address,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_name,
              lp.phone_number AS lead_professor_phone
       FROM professor_observation po
       JOIN program prog ON prog.id = po.program_id AND prog.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       WHERE po.professor_id = ? AND po.active = 1
       ORDER BY po.observation_date ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
