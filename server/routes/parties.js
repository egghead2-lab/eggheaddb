const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/parties/professors — professors with current/future parties
router.get('/professors', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT p.id, CONCAT(p.professor_nickname, ' ', p.last_name) AS display_name
       FROM program prog
       JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       JOIN program_type pt ON pt.id = cl.program_type_id AND pt.program_type_name = 'Party'
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       JOIN professor p ON p.active = 1 AND (p.id = prog.lead_professor_id OR p.id = prog.assistant_professor_id)
       WHERE prog.active = 1
         AND (prog.first_session_date >= CURDATE() OR prog.first_session_date IS NULL)
       ORDER BY display_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/parties (party-type programs only)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status, professor, date_from, date_to, sort, dir, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [
      'prog.active = 1',
      `pt.program_type_name = 'Party'`,
    ];
    let params = [];

    if (search) {
      whereClauses.push(`(prog.program_nickname LIKE ? OR CONCAT(lp.first_name, ' ', lp.last_name) LIKE ? OR CONCAT(par.first_name, ' ', par.last_name) LIKE ? OR par.email LIKE ? OR DATE_FORMAT(prog.first_session_date, '%m/%d/%Y') LIKE ? OR DATE_FORMAT(prog.first_session_date, '%Y-%m-%d') LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s);
    }
    if (status) {
      whereClauses.push(`cs.class_status_name = ?`);
      params.push(status);
    } else {
      whereClauses.push(`cs.class_status_name NOT LIKE 'Cancelled%'`);
    }
    if (professor) {
      whereClauses.push(`(prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)`);
      params.push(professor, professor);
    }
    // Timeframe filter: 'current' (default), 'past', 'all'
    const timeframe = req.query.timeframe || 'current';
    if (timeframe === 'current') {
      whereClauses.push(`(prog.first_session_date >= CURDATE() OR prog.first_session_date IS NULL)`);
    } else if (timeframe === 'past') {
      whereClauses.push(`prog.first_session_date < CURDATE()`);
    }

    if (date_from) {
      whereClauses.push(`prog.first_session_date >= ?`);
      params.push(date_from);
    }
    if (date_to) {
      whereClauses.push(`prog.first_session_date <= ?`);
      params.push(date_to);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;
    const sortMap = {
      date: 'prog.first_session_date', status: 'cs.class_status_name',
      type: 'pf.party_format_name', theme: 'cl.class_name', contact: 'par.last_name',
      location: 'loc.nickname', professor: 'lp.professor_nickname',
    };
    const sortCol = sortMap[sort] || 'prog.demo_date';
    const sortDir = dir === 'desc' ? 'DESC' : dir === 'asc' ? 'ASC' : 'DESC';

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname,
              prog.first_session_date AS party_date,
              prog.start_time AS party_start,
              prog.class_length_minutes,
              prog.party_location_text,
              prog.total_party_cost, prog.total_kids_attended,
              prog.charge_confirmed,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              c.city_name, c.zip_code,
              pf.party_format_name,
              cl.class_name AS party_theme,
              lp.id AS lead_professor_id,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_nickname,
              ap.id AS assistant_professor_id,
              CONCAT(ap.professor_nickname, ' ', ap.last_name) AS assistant_professor_nickname,
              par.id AS contact_id,
              CONCAT(par.first_name, ' ', par.last_name) AS contact_name,
              par.email AS contact_email
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id AND cs.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id AND pt.active = 1
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id AND lp.active = 1
       LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id AND ap.active = 1
       LEFT JOIN parent par ON par.id = prog.parent_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       ${where}
       ORDER BY ${sortCol} ${sortDir}, prog.program_nickname ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM program prog
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id AND pt.active = 1
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id AND cs.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
       LEFT JOIN parent par ON par.id = prog.parent_id
       ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/parties/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[party]] = await pool.query(
      `SELECT prog.*, pf.party_format_name, cl2.class_name AS party_theme_name,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              cl.class_name, cl.class_code,
              pt.program_type_name,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_nickname,
              CONCAT(ap.professor_nickname, ' ', ap.last_name) AS assistant_professor_nickname,
              CONCAT(par.first_name, ' ', par.last_name) AS contact_name,
              par.email AS contact_email
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       LEFT JOIN class cl2 ON cl2.id = prog.class_id AND cl2.program_type_id = 4
       LEFT JOIN parent par ON par.id = prog.parent_id
       WHERE prog.id = ? AND prog.active = 1 AND pt.program_type_name = 'Party'`,
      [id]
    );

    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found' });
    }

    res.json({ success: true, data: party });
  } catch (err) {
    next(err);
  }
});

// POST /api/parties
router.post('/', authenticate, async (req, res, next) => {
  try {
    const data = req.body;

    const fields = [
      'program_nickname', 'class_status_id', 'location_id', 'class_id',
      'general_notes', 'payment_through_us', 'lead_professor_id', 'lead_professor_pay',
      'lead_professor_drive_fee', 'lead_professor_tip', 'lead_professor_dry_ice',
      'lead_reimbursements_paid', 'assistant_required', 'assistant_professor_id',
      'assistant_professor_pay', 'assistant_professor_drive_fee', 'assistant_professor_tip',
      'assistant_professor_dry_ice', 'assistant_reimbursements_paid',
      'base_party_price', 'drive_fee', 'late_booking_fee', 'total_kids_attended',
      'extra_kids_fee', 'extra_time_fee', 'deposit_date', 'deposit_amount',
      'total_party_cost', 'emailed_follow_up', 'charge_confirmed', 'final_charge_date',
      'final_charge_type', 'shirt_size', 'glow_slime_amount_needed',
      'first_session_date', 'start_time', 'class_length_minutes',
      'party_format_id', 'party_location_text', 'demo_date', 'demo_start_time', 'demo_end_time', 'demo_type_id', 'demo_pay',
      'demo_professor_id', 'demo_notes', 'parent_id',
    ];

    const insertFields = fields.filter(f => data[f] !== undefined);
    const values = insertFields.map(f => data[f] === '' ? null : data[f]);

    const [result] = await pool.query(
      `INSERT INTO program (${insertFields.join(', ')}, active, ts_inserted, ts_updated)
       VALUES (${insertFields.map(() => '?').join(', ')}, 1, NOW(), NOW())`,
      values
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/parties/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const fields = [
      'program_nickname', 'class_status_id', 'location_id', 'class_id',
      'general_notes', 'payment_through_us', 'lead_professor_id', 'lead_professor_pay',
      'lead_professor_drive_fee', 'lead_professor_tip', 'lead_professor_dry_ice',
      'lead_reimbursements_paid', 'assistant_required', 'assistant_professor_id',
      'assistant_professor_pay', 'assistant_professor_drive_fee', 'assistant_professor_tip',
      'assistant_professor_dry_ice', 'assistant_reimbursements_paid',
      'base_party_price', 'drive_fee', 'late_booking_fee', 'total_kids_attended',
      'extra_kids_fee', 'extra_time_fee', 'deposit_date', 'deposit_amount',
      'total_party_cost', 'emailed_follow_up', 'charge_confirmed', 'final_charge_date',
      'final_charge_type', 'shirt_size', 'glow_slime_amount_needed',
      'first_session_date', 'start_time', 'class_length_minutes',
      'party_format_id', 'party_location_text', 'demo_date', 'demo_start_time', 'demo_end_time', 'demo_type_id', 'demo_pay',
      'demo_professor_id', 'demo_notes', 'parent_id', 'active',
    ];

    const updateFields = fields.filter(f => data[f] !== undefined);
    const values = updateFields.map(f => data[f] === '' ? null : data[f]);

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    await pool.query(
      `UPDATE program SET ${updateFields.map(f => `${f} = ?`).join(', ')}, ts_updated = NOW()
       WHERE id = ?`,
      [...values, id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
