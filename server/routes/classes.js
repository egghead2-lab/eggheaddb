const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/classes — already exists in reference.js for the list, this adds detail + update

// GET /api/classes/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const [[cls]] = await pool.query(
      `SELECT c.*, pt.program_type_name, ct.class_type_name
       FROM class c
       LEFT JOIN program_type pt ON pt.id = c.program_type_id
       LEFT JOIN class_type ct ON ct.id = c.class_type_id
       WHERE c.id = ? AND c.active = 1`,
      [req.params.id]
    );
    if (!cls) return res.status(404).json({ success: false, error: 'Class not found' });

    // Get lessons for this class
    const [lessons] = await pool.query(
      `SELECT * FROM lesson WHERE class_id = ? AND active = 1 ORDER BY lesson_name`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...cls, lessons } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/classes/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const data = req.body;
    const fields = [
      'class_name', 'formal_class_name', 'class_code', 'description', 'keywords',
      'standards', 'trainual_link', 'parent_portal_link', 'parent_portal_qr_path',
      'program_type_id', 'class_type_id',
    ];

    const updateFields = fields.filter(f => data[f] !== undefined);
    const values = updateFields.map(f => data[f] === '' ? null : data[f]);

    if (updateFields.length === 0) return res.status(400).json({ success: false, error: 'No fields' });

    await pool.query(
      `UPDATE class SET ${updateFields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`,
      [...values, req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
