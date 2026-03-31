const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    // Find user by email or user_name
    const [users] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.user_name, u.password, u.role_id, u.active,
              r.role_name
       FROM user u
       LEFT JOIN role r ON r.id = u.role_id AND r.active = 1
       WHERE (u.email = ? OR u.user_name = ?) AND u.active = 1
       LIMIT 1`,
      [username, username]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = users[0];

    // Verify password — DB stores plain text; try bcrypt first for future compatibility
    let passwordMatch = false;
    const looksLikeHash = user.password && user.password.startsWith('$2');
    if (looksLikeHash) {
      passwordMatch = await bcrypt.compare(password, user.password);
    } else {
      passwordMatch = (password === user.password);
    }
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Get geographic areas based on role
    let areas = [];
    const roleName = (user.role_name || '').toLowerCase();

    if (roleName.includes('scheduling') || roleName.includes('coordinator')) {
      const [rows] = await pool.query(
        `SELECT geographic_area_name FROM geographic_area WHERE scheduling_coordinator_user_id = ? AND active = 1`,
        [user.id]
      );
      areas = rows.map(r => r.geographic_area_name);
    } else if (roleName.includes('field') || roleName.includes('manager')) {
      const [rows] = await pool.query(
        `SELECT geographic_area_name FROM geographic_area WHERE field_manager_user_id = ? AND active = 1`,
        [user.id]
      );
      areas = rows.map(r => r.geographic_area_name);
    } else if (roleName.includes('client')) {
      const [rows] = await pool.query(
        `SELECT geographic_area_name FROM geographic_area WHERE client_manager_user_id = ? AND active = 1`,
        [user.id]
      );
      areas = rows.map(r => r.geographic_area_name);
    } else {
      // Admin or other roles get all areas
      const [rows] = await pool.query(
        `SELECT geographic_area_name FROM geographic_area WHERE active = 1`
      );
      areas = rows.map(r => r.geographic_area_name);
    }

    const fullName = `${user.first_name} ${user.last_name}`.trim();

    const payload = {
      userId: user.id,
      name: fullName,
      role: user.role_name || 'user',
      areas,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      data: { id: user.id, name: fullName, role: user.role_name, areas },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, data: req.user });
});

module.exports = router;
