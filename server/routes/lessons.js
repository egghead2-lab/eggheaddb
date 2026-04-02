const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/lessons (list with class info via junction)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, class_id, sort, dir, page = 1, limit = 200 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = ['l.active = 1'];
    let params = [];

    if (search) {
      whereClauses.push(`(l.lesson_name LIKE ? OR c.class_name LIKE ?)`);
      const q = `%${search}%`;
      params.push(q, q);
    }
    if (class_id) {
      whereClauses.push(`lc.class_id = ?`);
      params.push(class_id);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;
    const sortMap = { name: 'l.lesson_name', class: 'c.class_name' };
    const sortCol = sortMap[sort] || 'c.class_name';
    const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

    const [rows] = await pool.query(
      `SELECT l.id, l.lesson_name, l.review_status, l.last_reviewed, l.next_update_required,
              l.trainual_link AS lesson_trainual_link, l.lesson_type, l.description AS lesson_description,
              lc.class_id, lc.camp_type,
              c.class_name, c.trainual_link, c.parent_portal_link, c.description AS class_description,
              pt.program_type_name
       FROM lesson l
       JOIN lesson_class lc ON lc.lesson_id = l.id AND lc.active = 1
       LEFT JOIN class c ON c.id = lc.class_id AND c.active = 1
       LEFT JOIN program_type pt ON pt.id = c.program_type_id AND pt.active = 1
       ${where}
       ORDER BY ${sortCol} ${sortDir}, lc.sort_order ASC, l.lesson_name ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM lesson l
       JOIN lesson_class lc ON lc.lesson_id = l.id AND lc.active = 1
       LEFT JOIN class c ON c.id = lc.class_id AND c.active = 1
       ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/lessons/:id (detail with all assigned classes)
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const [[lesson]] = await pool.query(
      `SELECT l.*, c.description AS class_description, c.trainual_link AS class_trainual_link,
              c.parent_portal_link AS class_parent_portal_link, c.keywords AS class_keywords
       FROM lesson l
       LEFT JOIN lesson_class lc ON lc.lesson_id = l.id AND lc.active = 1
       LEFT JOIN class c ON c.id = lc.class_id AND c.active = 1
       WHERE l.id = ? AND l.active = 1
       LIMIT 1`,
      [req.params.id]
    );
    if (!lesson) return res.status(404).json({ success: false, error: 'Lesson not found' });

    // Get all assigned classes
    const [classes] = await pool.query(
      `SELECT lc.id AS junction_id, lc.class_id, lc.camp_type,
              c.class_name, pt.program_type_name
       FROM lesson_class lc
       LEFT JOIN class c ON c.id = lc.class_id AND c.active = 1
       LEFT JOIN program_type pt ON pt.id = c.program_type_id
       WHERE lc.lesson_id = ? AND lc.active = 1
       ORDER BY c.class_name`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...lesson, classes } });
  } catch (err) {
    next(err);
  }
});

// POST /api/lessons (create lesson + assign to class)
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { lesson_name, class_id, camp_type } = req.body;
    if (!lesson_name) return res.status(400).json({ success: false, error: 'Name is required' });

    // Check for existing lesson with same name
    const [[existing]] = await pool.query(
      `SELECT id FROM lesson WHERE lesson_name = ? AND active = 1`, [lesson_name]
    );

    let lessonId;
    if (existing) {
      // Lesson exists — just add the class assignment
      lessonId = existing.id;
    } else {
      const [result] = await pool.query(
        `INSERT INTO lesson (lesson_name, active, ts_inserted, ts_updated) VALUES (?, 1, NOW(), NOW())`,
        [lesson_name]
      );
      lessonId = result.insertId;
    }

    // Add class assignment if provided
    if (class_id) {
      await pool.query(
        `INSERT IGNORE INTO lesson_class (lesson_id, class_id, camp_type, active, ts_inserted, ts_updated)
         VALUES (?, ?, ?, 1, NOW(), NOW())`,
        [lessonId, class_id, camp_type || null]
      );
    }

    res.json({ success: true, id: lessonId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/lessons/:id (update lesson — updates everywhere)
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { lesson_name, active,
      status_one_sheet, status_materials, status_video,
      status_trainual, status_standards, status_science_accuracy,
      last_reviewed, next_update_required, review_status } = req.body;

    const fields = [];
    const values = [];
    if (lesson_name !== undefined) { fields.push('lesson_name = ?'); values.push(lesson_name); }
    if (req.body.trainual_link !== undefined) { fields.push('trainual_link = ?'); values.push(req.body.trainual_link || null); }
    if (req.body.description !== undefined) { fields.push('description = ?'); values.push(req.body.description || null); }
    if (req.body.keywords !== undefined) { fields.push('keywords = ?'); values.push(req.body.keywords || null); }
    if (req.body.lesson_type !== undefined) { fields.push('lesson_type = ?'); values.push(req.body.lesson_type || null); }
    if (req.body.parent_portal_link !== undefined) { fields.push('parent_portal_link = ?'); values.push(req.body.parent_portal_link || null); }
    if (active !== undefined) { fields.push('active = ?'); values.push(active); }
    if (status_one_sheet !== undefined) { fields.push('status_one_sheet = ?'); values.push(status_one_sheet || null); }
    if (status_materials !== undefined) { fields.push('status_materials = ?'); values.push(status_materials || null); }
    if (status_video !== undefined) { fields.push('status_video = ?'); values.push(status_video || null); }
    if (status_trainual !== undefined) { fields.push('status_trainual = ?'); values.push(status_trainual || null); }
    if (status_standards !== undefined) { fields.push('status_standards = ?'); values.push(status_standards || null); }
    if (status_science_accuracy !== undefined) { fields.push('status_science_accuracy = ?'); values.push(status_science_accuracy || null); }
    if (last_reviewed !== undefined) { fields.push('last_reviewed = ?'); values.push(last_reviewed || null); }
    if (next_update_required !== undefined) { fields.push('next_update_required = ?'); values.push(next_update_required || null); }
    if (review_status !== undefined) { fields.push('review_status = ?'); values.push(review_status || null); }

    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
    await pool.query(`UPDATE lesson SET ${fields.join(', ')}, ts_updated = NOW() WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/lessons/:id/classes — add a class assignment
router.post('/:id/classes', authenticate, async (req, res, next) => {
  try {
    const { class_id, camp_type } = req.body;
    if (!class_id) return res.status(400).json({ success: false, error: 'Class is required' });
    await pool.query(
      `INSERT IGNORE INTO lesson_class (lesson_id, class_id, camp_type, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, 1, NOW(), NOW())`,
      [req.params.id, class_id, camp_type || null]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/lessons/:id/classes/:classId — remove a class assignment
router.delete('/:id/classes/:classId', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE lesson_class SET active = 0, ts_updated = NOW() WHERE lesson_id = ? AND class_id = ?`,
      [req.params.id, req.params.classId]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/lessons/:id (soft delete)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query(`UPDATE lesson SET active = 0, ts_updated = NOW() WHERE id = ?`, [req.params.id]);
    await pool.query(`UPDATE lesson_class SET active = 0, ts_updated = NOW() WHERE lesson_id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
