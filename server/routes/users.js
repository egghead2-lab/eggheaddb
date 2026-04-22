const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const { authenticate, requireRole } = require('../middleware/auth');

// All user routes require admin
router.use(authenticate, requireRole(['Admin']));

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const { search, role, sort, dir, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = ['u.active = 1'];
    let params = [];

    if (search) {
      whereClauses.push(`(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.user_name LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (role) {
      whereClauses.push(`r.role_name = ?`);
      params.push(role);
    } else if (req.query.type === 'professors') {
      whereClauses.push(`r.role_name = 'Professor'`);
    } else if (req.query.type === 'staff' || !req.query.include_candidates) {
      // Exclude Candidate and Professor roles from staff view
      whereClauses.push(`(u.role_id IS NULL OR r.role_name NOT IN ('Candidate', 'Professor'))`);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;
    const sortMap = {
      name: 'u.last_name', role: 'r.role_name', email: 'u.email', username: 'u.user_name', last_login: 'u.last_login_at',
    };
    const sortCol = sortMap[sort] || 'u.last_name';
    const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

    const [rows] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.user_name,
              r.role_name, u.last_login_at, u.ts_inserted, u.ts_updated,
              tu.avg_completion AS trainual_completion, tu.status AS trainual_status
       FROM user u
       LEFT JOIN role r ON r.id = u.role_id
       LEFT JOIN professor p_link ON p_link.user_id = u.id AND p_link.active = 1
       LEFT JOIN trainual_user tu ON tu.email = LOWER(COALESCE(NULLIF(p_link.trainual_email, ''), p_link.email, u.email))
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM user u LEFT JOIN role r ON r.id = u.role_id ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/fm-missing-professor — Field Managers without a linked active professor profile
// Each row includes `matching_professor` if a professor with the same email exists (unlinked)
router.get('/fm-missing-professor', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id AS user_id, u.first_name, u.last_name, u.email,
              mp.id AS matching_professor_id,
              mp.professor_nickname AS matching_professor_nickname,
              mp.last_name AS matching_professor_last_name
       FROM user u
       JOIN role r ON r.id = u.role_id
       LEFT JOIN professor p ON p.user_id = u.id AND p.active = 1
       LEFT JOIN professor mp ON mp.email = u.email AND mp.active = 1 AND mp.user_id IS NULL
       WHERE r.role_name = 'Field Manager' AND u.active = 1 AND p.id IS NULL
       ORDER BY u.last_name, u.first_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/users/:id/link-professor — link an FM (or any user) to an existing professor record
// Body: { professor_id }  — sets professor.user_id = :id
router.post('/:id/link-professor', async (req, res, next) => {
  try {
    const { professor_id } = req.body;
    if (!professor_id) return res.status(400).json({ success: false, error: 'professor_id required' });
    // Fail if the professor is already linked to a different user
    const [[prof]] = await pool.query('SELECT id, user_id FROM professor WHERE id = ? AND active = 1', [professor_id]);
    if (!prof) return res.status(404).json({ success: false, error: 'Professor not found' });
    if (prof.user_id && String(prof.user_id) !== String(req.params.id)) {
      return res.status(400).json({ success: false, error: `Professor is already linked to user #${prof.user_id}` });
    }
    await pool.query('UPDATE professor SET user_id = ? WHERE id = ?', [req.params.id, professor_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/users/:id/create-professor — create a new professor record for a user (by email)
// Creates minimal professor, copies first/last/email from user, status = Active, links user_id.
router.post('/:id/create-professor', async (req, res, next) => {
  try {
    const [[user]] = await pool.query('SELECT id, first_name, last_name, email FROM user WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Resolve Active status id
    const [[status]] = await pool.query("SELECT id FROM professor_status WHERE professor_status_name = 'Active' LIMIT 1");
    const statusId = status?.id || null;

    const nickname = (user.first_name || '').trim() || (user.email ? user.email.split('@')[0] : 'User');
    const [r] = await pool.query(
      `INSERT INTO professor (user_id, professor_nickname, first_name, last_name, email, professor_status_id, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [user.id, nickname, user.first_name || null, user.last_name || null, user.email || null, statusId]
    );
    res.json({ success: true, professor_id: r.insertId });
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[user]] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.user_name, u.role_id,
              r.role_name, u.email_signature, u.ts_inserted, u.ts_updated
       FROM user u
       LEFT JOIN role r ON r.id = u.role_id
       WHERE u.id = ? AND u.active = 1`,
      [id]
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post('/', async (req, res, next) => {
  try {
    const { first_name, last_name, email, user_name, password, role_id } = req.body;

    if (!first_name || !last_name || !email || !user_name || !password || !role_id || role_id === 'undefined') {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO user (first_name, last_name, email, user_name, password, role_id, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [first_name, last_name, email, user_name, hashedPassword, parseInt(role_id)]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, error: 'Username or email already exists' });
    }
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, user_name, password, role_id, active } = req.body;

    const fields = [];
    const values = [];

    if (first_name !== undefined) { fields.push('first_name = ?'); values.push(first_name); }
    if (last_name !== undefined) { fields.push('last_name = ?'); values.push(last_name); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (user_name !== undefined) { fields.push('user_name = ?'); values.push(user_name); }
    if (role_id !== undefined && role_id !== '') { fields.push('role_id = ?'); values.push(role_id); }
    if (active !== undefined && active !== '') { fields.push('active = ?'); values.push(active); }
    if (req.body.email_signature !== undefined) { fields.push('email_signature = ?'); values.push(req.body.email_signature || null); }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      fields.push('password = ?');
      values.push(hashedPassword);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    await pool.query(
      `UPDATE user SET ${fields.join(', ')}, ts_updated = NOW() WHERE id = ?`,
      [...values, id]
    );

    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, error: 'Username or email already exists' });
    }
    next(err);
  }
});

// DELETE /api/users/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    // Don't let admin delete themselves
    if (String(id) === String(req.user.userId)) {
      return res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
    }
    await pool.query('UPDATE user SET active = 0, ts_updated = NOW() WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
