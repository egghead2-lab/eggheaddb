const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/contractors
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, sort, dir, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = ['c.active = 1'];
    let params = [];

    if (search) {
      whereClauses.push(`(c.contractor_name LIKE ? OR c.key_contact_name LIKE ?)`);
      const q = `%${search}%`;
      params.push(q, q);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;
    const sortMap = { name: 'c.contractor_name', contact: 'c.key_contact_name', strength: 'c.relationship_strength' };
    const sortCol = sortMap[sort] || 'c.contractor_name';
    const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

    const [rows] = await pool.query(
      `SELECT c.*,
              CONCAT(u.first_name, ' ', u.last_name) AS salesperson_name,
              (SELECT COUNT(*) FROM location l WHERE l.contractor_id = c.id AND l.active = 1) AS location_count
       FROM contractor c
       LEFT JOIN user u ON u.id = c.salesperson_user_id AND u.active = 1
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM contractor c ${where}`, params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/contractors/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const [[contractor]] = await pool.query(
      `SELECT c.*,
              CONCAT(u.first_name, ' ', u.last_name) AS salesperson_name
       FROM contractor c
       LEFT JOIN user u ON u.id = c.salesperson_user_id AND u.active = 1
       WHERE c.id = ? AND c.active = 1`,
      [req.params.id]
    );
    if (!contractor) return res.status(404).json({ success: false, error: 'Contractor not found' });

    // Get assigned locations
    const [locations] = await pool.query(
      `SELECT l.id, l.nickname, l.school_name, l.active,
              ga.geographic_area_name
       FROM location l
       LEFT JOIN geographic_area ga ON ga.id = l.geographic_area_id_online
       WHERE l.contractor_id = ? AND l.active = 1
       ORDER BY l.nickname`,
      [req.params.id]
    );

    // Active programs across all contractor locations
    const locIds = locations.map(l => l.id);
    let programs = [];
    if (locIds.length) {
      [programs] = await pool.query(
        `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.last_session_date,
                prog.session_count, cs.class_status_name, loc.nickname AS location_nickname
         FROM program prog
         LEFT JOIN class_status cs ON cs.id = prog.class_status_id
         LEFT JOIN location loc ON loc.id = prog.location_id
         WHERE prog.location_id IN (${locIds.map(() => '?').join(',')})
           AND prog.active = 1 AND cs.class_status_name NOT LIKE 'Cancelled%'
           AND (prog.last_session_date >= CURDATE() OR prog.last_session_date IS NULL)
         ORDER BY prog.first_session_date DESC`,
        locIds
      );
    }

    res.json({ success: true, data: { ...contractor, locations, programs } });
  } catch (err) {
    next(err);
  }
});

// POST /api/contractors
router.post('/', authenticate, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { contractor_name, retained, non_initial_client, salespeople } = req.body;
    if (!contractor_name) return res.status(400).json({ success: false, error: 'Name is required' });
    // Spec §3.3 hard-blocks
    if (retained !== 0 && retained !== 1) {
      return res.status(400).json({ success: false, error: 'retained is required (0 or 1)' });
    }
    if (!Array.isArray(salespeople) || salespeople.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one salesperson assignment is required' });
    }
    const total = salespeople.reduce((s, sp) => s + parseFloat(sp.split_pct || 0), 0);
    if (Math.abs(total - 1) > 0.0001) {
      return res.status(400).json({ success: false, error: `Salesperson splits must sum to 1.0 (got ${total.toFixed(4)})` });
    }

    await conn.beginTransaction();
    const primary = salespeople.slice().sort((a, b) => b.split_pct - a.split_pct)[0];
    const [result] = await conn.query(
      `INSERT INTO contractor (contractor_name, retained, non_initial_client, salesperson_user_id, active)
       VALUES (?, ?, ?, ?, 1)`,
      [contractor_name, retained, non_initial_client ? 1 : 0, primary.user_id]
    );
    const contractorId = result.insertId;
    const today = new Date().toISOString().split('T')[0];
    for (const sp of salespeople) {
      await conn.query(
        `INSERT INTO contractor_salesperson (contractor_id, user_id, split_pct, effective_from, notes, created_by_user_id, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [contractorId, sp.user_id, sp.split_pct, sp.effective_from || today, sp.notes || null, req.user.userId]
      );
    }
    await conn.commit();
    res.json({ success: true, id: contractorId });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally { conn.release(); }
});

// PUT /api/contractors/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const data = req.body;
    const fields = [
      'contractor_name', 'salesperson_user_id', 'client_since', 'relationship_strength',
      'rebooking_notes', 'minimum_to_run', 'last_price_raise',
      'key_contact_name', 'key_contact_email', 'key_contact_phone',
      'day_of_notifications', 'client_vibe',
      'livescan_multiple', 'livescan_required', 'tb_required', 'professor_misc_notes',
      'behavioral_guidelines', 'area_demographic', 'flexibility_notes',
      'invoice_type', 'invoice_per_location',
      'invoice_contact_name', 'invoice_contact_email', 'invoice_contact_phone',
      'invoice_notes', 'last_updated', 'general_notes', 'active',
      // commission flags
      'retained', 'non_initial_client',
    ];

    // Spec §3.3: can't set retained back to NULL
    if (data.retained === null) {
      return res.status(400).json({ success: false, error: 'retained cannot be cleared once set' });
    }
    // If existing row has retained=NULL, edit must include a valid retained value
    const [[existing]] = await pool.query(`SELECT retained FROM contractor WHERE id = ?`, [req.params.id]);
    if (existing && existing.retained === null && data.retained !== 0 && data.retained !== 1) {
      return res.status(400).json({ success: false, error: 'This contractor is missing its retained flag — please set 0 or 1 in this edit' });
    }

    const updateFields = fields.filter(f => data[f] !== undefined);
    const values = updateFields.map(f => data[f] === '' ? null : data[f]);

    if (updateFields.length === 0) return res.status(400).json({ success: false, error: 'No fields' });

    await pool.query(
      `UPDATE contractor SET ${updateFields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`,
      [...values, req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
