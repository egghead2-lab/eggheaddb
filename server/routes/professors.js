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

// GET /api/professors/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[professor]] = await pool.query(
      `SELECT p.*,
              ps.professor_status_name,
              c.city_name, c.zip_code, c.state_id,
              ga.geographic_area_name,
              os.onboard_status_name
       FROM professor p
       LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN onboard_status os ON os.id = p.onboard_status_id
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
      `SELECT * FROM day_off WHERE professor_id = ? ORDER BY date_requested DESC`,
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
      `SELECT s.session_date, s.session_time, prog.program_nickname, loc.nickname AS location_nickname
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id
       WHERE s.active = 1 AND s.session_date >= CURDATE()
         AND (s.professor_id = ? OR s.assistant_id = ? OR prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)
       ORDER BY s.session_date ASC, s.session_time ASC
       LIMIT 10`,
      [id, id, id, id]
    );

    res.json({
      success: true,
      data: { ...professor, availability, livescans, bins, daysOff, incidents, reviews, upcomingSessions },
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
      'phone_number', 'address', 'city_id', 'general_notes', 'emergency_contact',
      'emergency_contact_number', 'birthday', 'hire_date', 'termination_date',
      'termination_rason', 'schedule_link', 'base_pay', 'assist_pay', 'pickup_pay',
      'party_pay', 'camp_pay', 'science_trained_id', 'engineering_trained_id',
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

module.exports = router;
