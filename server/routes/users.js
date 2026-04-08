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
    } else if (req.query.include_candidates !== 'true') {
      // By default exclude Candidate-role users from staff lists
      whereClauses.push(`(u.role_id IS NULL OR u.role_id != 16)`);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;
    const sortMap = {
      name: 'u.last_name', role: 'r.role_name', email: 'u.email', username: 'u.user_name',
    };
    const sortCol = sortMap[sort] || 'u.last_name';
    const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

    const [rows] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.user_name,
              r.role_name, u.ts_inserted, u.ts_updated
       FROM user u
       LEFT JOIN role r ON r.id = u.role_id
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

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[user]] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.user_name, u.role_id,
              r.role_name, u.ts_inserted, u.ts_updated
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
    console.log('[POST /users] body:', JSON.stringify(req.body));

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
    console.log('[PUT /users/' + id + '] body:', JSON.stringify(req.body));

    const fields = [];
    const values = [];

    if (first_name !== undefined) { fields.push('first_name = ?'); values.push(first_name); }
    if (last_name !== undefined) { fields.push('last_name = ?'); values.push(last_name); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (user_name !== undefined) { fields.push('user_name = ?'); values.push(user_name); }
    if (role_id !== undefined && role_id !== '') { fields.push('role_id = ?'); values.push(role_id); }
    if (active !== undefined && active !== '') { fields.push('active = ?'); values.push(active); }
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
