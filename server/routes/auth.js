const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { google } = require('googleapis');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// GET /api/auth/google — redirect to Google consent screen
router.get('/google', (req, res) => {
  const oauth2Client = makeOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/forms.body.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/admin.directory.user.readonly',
      'https://www.googleapis.com/auth/contacts.readonly',
    ],
  });
  res.redirect(url);
});

// GET /api/auth/google/callback — handle Google response
router.get('/google/callback', async (req, res, next) => {
  try {
    const { code, error } = req.query;
    if (error) return res.redirect(`${process.env.CLIENT_URL}/login?error=${error}`);

    const oauth2Client = makeOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: googleUser } = await oauth2.userinfo.get();
    const { id: googleId, email, given_name, family_name } = googleUser;

    // Find existing user by google_id or email
    const [users] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role_id, u.active,
              r.role_name, u.google_refresh_token
       FROM user u
       LEFT JOIN role r ON r.id = u.role_id AND r.active = 1
       WHERE (u.google_id = ? OR u.email = ?) AND u.active = 1
       LIMIT 1`,
      [googleId, email]
    );

    if (users.length === 0) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=unauthorized`);
    }

    const user = users[0];

    // Store google_id and refresh token (refresh token only sent on first consent)
    await pool.query(
      `UPDATE user SET google_id = ?, google_refresh_token = COALESCE(?, google_refresh_token) WHERE id = ?`,
      [googleId, tokens.refresh_token || null, user.id]
    );

    // Get geographic areas for user
    const roleName = (user.role_name || '').toLowerCase();
    let areas = [];
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
    } else {
      const [rows] = await pool.query(
        `SELECT geographic_area_name FROM geographic_area WHERE active = 1`
      );
      areas = rows.map(r => r.geographic_area_name);
    }

    const fullName = `${user.first_name || given_name} ${user.last_name || family_name}`.trim();
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
      secure: process.env.NODE_ENV === 'production' ? true : false,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login — professor/contractor username+password login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password required' });

    const [users] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.user_name, u.password, u.role_id, u.active,
              r.role_name
       FROM user u
       LEFT JOIN role r ON r.id = u.role_id AND r.active = 1
       WHERE (u.email = ? OR u.user_name = ?) AND u.active = 1
       LIMIT 1`,
      [username, username]
    );

    if (users.length === 0) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const user = users[0];
    const looksLikeHash = user.password?.startsWith('$2');
    const passwordMatch = looksLikeHash
      ? await bcrypt.compare(password, user.password)
      : password === user.password;

    if (!passwordMatch) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const fullName = `${user.first_name} ${user.last_name}`.trim();
    const payload = { userId: user.id, name: fullName, role: user.role_name || 'user', areas: [] };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' ? true : false,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, data: { id: user.id, name: fullName, role: user.role_name, areas: [] } });
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
