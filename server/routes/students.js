const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/students
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, sort, dir, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = ['s.active = 1'];
    let params = [];

    if (search) {
      whereClauses.push(`(s.first_name LIKE ? OR s.last_name LIKE ? OR CONCAT(s.first_name, ' ', s.last_name) LIKE ?)`);
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;
    const sortMap = {
      name: 's.last_name', first_name: 's.first_name', age: 'pr_age.age',
    };
    const sortCol = sortMap[sort] || 's.last_name';
    const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

    const [rows] = await pool.query(
      `SELECT s.id, s.first_name, s.last_name, s.birthday, s.location_id, s.current_grade_id,
              p.id AS parent_id, p.first_name AS parent_first_name, p.last_name AS parent_last_name, p.email AS parent_email, p.phone AS parent_phone,
              loc.nickname AS location_nickname,
              g.grade_name AS current_grade_name
       FROM student s
       LEFT JOIN student_parent sp ON sp.student_id = s.id AND sp.active = 1
       LEFT JOIN parent p ON p.id = sp.parent_id AND p.active = 1
       LEFT JOIN location loc ON loc.id = s.location_id AND loc.active = 1
       LEFT JOIN grade g ON g.id = s.current_grade_id AND g.active = 1
       ${where}
       ORDER BY ${sortCol} ${sortDir}, s.first_name ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM student s ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/students/search — lightweight search for adding to roster
router.get('/search', authenticate, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });

    const [rows] = await pool.query(
      `SELECT s.id, s.first_name, s.last_name,
              p.first_name AS parent_first_name, p.last_name AS parent_last_name, p.email AS parent_email
       FROM student s
       LEFT JOIN student_parent sp ON sp.student_id = s.id AND sp.active = 1
       LEFT JOIN parent p ON p.id = sp.parent_id AND p.active = 1
       WHERE s.active = 1 AND (s.first_name LIKE ? OR s.last_name LIKE ? OR CONCAT(s.first_name, ' ', s.last_name) LIKE ?)
       ORDER BY s.last_name, s.first_name
       LIMIT 20`,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/students/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[student]] = await pool.query(
      `SELECT s.*
       FROM student s
       WHERE s.id = ? AND s.active = 1`,
      [id]
    );

    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    // Get parent(s)
    const [parents] = await pool.query(
      `SELECT p.*, sp.parent_role_id, sp.notes AS relationship_notes
       FROM student_parent sp
       JOIN parent p ON p.id = sp.parent_id AND p.active = 1
       WHERE sp.student_id = ? AND sp.active = 1`,
      [id]
    );

    // Get program history
    const [programs] = await pool.query(
      `SELECT pr.*, prog.program_nickname, pr.age, pr.notes,
              cs.class_status_name, loc.nickname AS location_nickname
       FROM program_roster pr
       JOIN program prog ON prog.id = pr.program_id AND prog.active = 1
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       WHERE pr.student_id = ? AND pr.active = 1
       ORDER BY prog.first_session_date DESC`,
      [id]
    );

    res.json({ success: true, data: { ...student, parents, programs } });
  } catch (err) {
    next(err);
  }
});

// POST /api/students
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { first_name, last_name, birthday, address, city_id, location_id, parent_id } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ success: false, error: 'First and last name are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO student (first_name, last_name, birthday, address, city_id, location_id, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [first_name, last_name, birthday || null, address || null, city_id || null, location_id || null]
    );

    // Link parent if provided
    if (parent_id) {
      await pool.query(
        `INSERT INTO student_parent (student_id, parent_id, active, ts_inserted, ts_updated)
         VALUES (?, ?, 1, NOW(), NOW())`,
        [result.insertId, parent_id]
      );
    }

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/students/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, birthday, address, city_id, active, current_grade_id } = req.body;

    const fields = [];
    const values = [];

    if (first_name !== undefined) { fields.push('first_name = ?'); values.push(first_name); }
    if (last_name !== undefined) { fields.push('last_name = ?'); values.push(last_name); }
    if (birthday !== undefined) { fields.push('birthday = ?'); values.push(birthday || null); }
    if (address !== undefined) { fields.push('address = ?'); values.push(address || null); }
    if (city_id !== undefined) { fields.push('city_id = ?'); values.push(city_id || null); }
    if (req.body.location_id !== undefined) { fields.push('location_id = ?'); values.push(req.body.location_id || null); }
    if (current_grade_id !== undefined) { fields.push('current_grade_id = ?'); values.push(current_grade_id || null); }
    if (active !== undefined) { fields.push('active = ?'); values.push(active); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    await pool.query(
      `UPDATE student SET ${fields.join(', ')}, ts_updated = NOW() WHERE id = ?`,
      [...values, id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
