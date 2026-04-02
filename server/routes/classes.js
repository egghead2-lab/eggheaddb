const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// POST /api/classes — create a new module
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { class_name, program_type_id, description } = req.body;
    if (!class_name) return res.status(400).json({ success: false, error: 'Module name is required' });

    const code = class_name.toUpperCase().replace(/\s+/g, '_').substring(0, 20);
    const [result] = await pool.query(
      `INSERT INTO class (class_name, class_code, formal_class_name, program_type_id, class_type_id, description, active)
       VALUES (?, ?, ?, ?, 1, ?, 1)`,
      [class_name, code, class_name, program_type_id || 1, description || null]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

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

    // Get lessons via junction table, ordered by sort_order
    const [lessons] = await pool.query(
      `SELECT l.*, lc.sort_order, lc.camp_type
       FROM lesson_class lc
       JOIN lesson l ON l.id = lc.lesson_id AND l.active = 1
       WHERE lc.class_id = ? AND lc.active = 1
       ORDER BY lc.sort_order ASC, l.lesson_name ASC`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...cls, lessons } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/classes/:id/reorder — reorder lessons in a module
router.put('/:id/reorder', authenticate, async (req, res, next) => {
  try {
    const { lesson_ids } = req.body; // ordered array of lesson IDs
    if (!Array.isArray(lesson_ids)) return res.status(400).json({ success: false, error: 'lesson_ids array required' });

    for (let i = 0; i < lesson_ids.length; i++) {
      await pool.query(
        `UPDATE lesson_class SET sort_order = ?, ts_updated = NOW() WHERE class_id = ? AND lesson_id = ? AND active = 1`,
        [i, req.params.id, lesson_ids[i]]
      );
    }

    res.json({ success: true });
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
