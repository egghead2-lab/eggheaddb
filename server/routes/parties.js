const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/parties (party-type programs only)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status, professor, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [
      'prog.active = 1',
      `pt.program_type_name = 'Party'`,
    ];
    let params = [];

    if (search) {
      whereClauses.push(`(prog.program_nickname LIKE ? OR loc.nickname LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s);
    }
    if (status) {
      whereClauses.push(`prog.class_status_id = ?`);
      params.push(status);
    }
    if (professor) {
      whereClauses.push(`prog.lead_professor_id = ?`);
      params.push(professor);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.demo_date AS party_date, prog.demo_start_time AS party_start,
              prog.demo_end_time AS party_end, prog.base_party_price, prog.total_party_cost,
              prog.total_kids_attended, prog.shirt_size, prog.glow_slime_amount_needed,
              prog.deposit_amount, prog.deposit_date, prog.charge_confirmed, prog.final_charge_date,
              prog.final_charge_type, prog.emailed_follow_up,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              cl.class_name,
              pt.program_type_name,
              CONCAT(lp.first_name, ' ', lp.last_name) AS lead_professor_name,
              lp.professor_nickname AS lead_professor_nickname
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id AND cs.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id AND pt.active = 1
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id AND lp.active = 1
       ${where}
       ORDER BY prog.demo_date DESC, prog.program_nickname
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM program prog
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id AND pt.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
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
      `SELECT prog.*,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              cl.class_name, cl.class_code,
              pt.program_type_name,
              lp.professor_nickname AS lead_professor_nickname,
              ap.professor_nickname AS assistant_professor_nickname
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id
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
      'demo_date', 'demo_start_time', 'demo_end_time', 'demo_type_id', 'demo_pay',
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
      'demo_date', 'demo_start_time', 'demo_end_time', 'demo_type_id', 'demo_pay',
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
