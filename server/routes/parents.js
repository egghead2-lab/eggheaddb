const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/parents
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, active, sort, dir, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [];
    let params = [];

    if (active !== undefined) {
      whereClauses.push('p.active = ?');
      params.push(active === 'true' ? 1 : 0);
    } else {
      whereClauses.push('p.active = 1');
    }

    if (search) {
      whereClauses.push(`(p.first_name LIKE ? OR p.last_name LIKE ? OR CONCAT(p.first_name, ' ', p.last_name) LIKE ? OR p.email LIKE ? OR p.phone LIKE ?)`);
      const q = `%${search}%`;
      params.push(q, q, q, q, q);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;
    const sortMap = {
      last_name: 'p.last_name',
      first_name: 'p.first_name',
      email: 'p.email',
      students: 'student_count',
      parties: 'party_count',
    };
    const sortCol = sortMap[sort] || 'p.last_name';
    const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

    const [rows] = await pool.query(
      `SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.active,
              COUNT(DISTINCT sp.student_id) AS student_count,
              COUNT(DISTINCT prog.id) AS party_count
       FROM parent p
       LEFT JOIN student_parent sp ON sp.parent_id = p.id AND sp.active = 1
       LEFT JOIN program prog ON prog.parent_id = p.id AND prog.active = 1
       ${where}
       GROUP BY p.id
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM parent p ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/parents/search — lightweight for SearchSelect
router.get('/search', authenticate, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });

    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, email, phone
       FROM parent
       WHERE active = 1 AND (first_name LIKE ? OR last_name LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ? OR email LIKE ?)
       ORDER BY last_name, first_name
       LIMIT 20`,
      [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/parents/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[parent]] = await pool.query(
      `SELECT p.* FROM parent p WHERE p.id = ?`,
      [id]
    );

    if (!parent) return res.status(404).json({ success: false, error: 'Parent not found' });

    const [students] = await pool.query(
      `SELECT s.id, s.first_name, s.last_name, s.birthday, s.location_id, s.current_grade_id,
              loc.nickname AS location_nickname,
              g.grade_name AS current_grade_name,
              sp.parent_role_id, sp.notes AS relationship_notes
       FROM student_parent sp
       JOIN student s ON s.id = sp.student_id AND s.active = 1
       LEFT JOIN location loc ON loc.id = s.location_id AND loc.active = 1
       LEFT JOIN grade g ON g.id = s.current_grade_id AND g.active = 1
       WHERE sp.parent_id = ? AND sp.active = 1
       ORDER BY s.last_name, s.first_name`,
      [id]
    );

    // Fetch co-parents for each student (other parents linked to the same students)
    // This powers both "see shared parents" and future email-all-parents-for-a-program feature
    let coParents = [];
    if (students.length > 0) {
      const studentIds = students.map(s => s.id);
      const [coParentRows] = await pool.query(
        `SELECT sp.student_id, p.id, p.first_name, p.last_name, p.email, p.phone
         FROM student_parent sp
         JOIN parent p ON p.id = sp.parent_id AND p.active = 1
         WHERE sp.student_id IN (?) AND sp.parent_id != ? AND sp.active = 1
         ORDER BY p.last_name, p.first_name`,
        [studentIds, id]
      );
      coParents = coParentRows;
    }
    // Merge co-parents onto each student
    students.forEach(s => {
      s.co_parents = coParents.filter(cp => cp.student_id === s.id);
    });

    const [parties] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.party_location_text,
              cs.class_status_name, pf.party_format_name, cl.class_name AS party_theme
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       WHERE prog.parent_id = ? AND prog.active = 1
       ORDER BY prog.first_session_date DESC`,
      [id]
    );

    res.json({ success: true, data: { ...parent, students, parties } });
  } catch (err) {
    next(err);
  }
});

// POST /api/parents
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { first_name, last_name, email, phone } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ success: false, error: 'First and last name are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO parent (first_name, last_name, email, phone, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
      [first_name, last_name, email || null, phone || null]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/parents/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['first_name', 'last_name', 'email', 'phone', 'active'];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key] === '' ? null : req.body[key]);
      }
    }

    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    await pool.query(
      `UPDATE parent SET ${fields.join(', ')}, ts_updated = NOW() WHERE id = ?`,
      [...values, id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/parents/:id/students/:studentId — update student's primary location
router.put('/:id/students/:studentId', authenticate, async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { location_id } = req.body;

    await pool.query(
      `UPDATE student SET location_id = ?, ts_updated = NOW() WHERE id = ?`,
      [location_id || null, studentId]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/parents/:id/students — link a student to this parent
router.post('/:id/students', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { student_id, parent_role_id, notes } = req.body;

    if (!student_id) return res.status(400).json({ success: false, error: 'student_id is required' });

    const [[existing]] = await pool.query(
      `SELECT id FROM student_parent WHERE student_id = ? AND parent_id = ?`,
      [student_id, id]
    );

    if (existing) {
      await pool.query(
        `UPDATE student_parent SET active = 1, parent_role_id = ?, notes = ?, ts_updated = NOW()
         WHERE student_id = ? AND parent_id = ?`,
        [parent_role_id || 1, notes || null, student_id, id]
      );
    } else {
      await pool.query(
        `INSERT INTO student_parent (student_id, parent_id, parent_role_id, notes, active, ts_inserted, ts_updated)
         VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
        [student_id, id, parent_role_id || 1, notes || null]
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/parents/:id/students/:studentId — unlink student
router.delete('/:id/students/:studentId', authenticate, async (req, res, next) => {
  try {
    const { id, studentId } = req.params;
    await pool.query(
      `UPDATE student_parent SET active = 0, ts_updated = NOW() WHERE parent_id = ? AND student_id = ?`,
      [id, studentId]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/parents/:id — soft delete
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query(`UPDATE parent SET active = 0, ts_updated = NOW() WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
