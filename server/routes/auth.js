const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { google } = require('googleapis');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const sigImageUpload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', '..', 'uploads', 'signature-images'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `user-${req.user.userId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files (JPEG, PNG, GIF, WEBP) are allowed'));
  },
});

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
    prompt: 'select_account',
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

    // Store google_id, refresh token, and record login time
    await pool.query(
      `UPDATE user SET google_id = ?, google_refresh_token = COALESCE(?, google_refresh_token), last_login_at = NOW() WHERE id = ?`,
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

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/login?token=${token}`);
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

    // Record last login
    await pool.query('UPDATE user SET last_login_at = NOW() WHERE id = ?', [user.id]);

    const fullName = `${user.first_name} ${user.last_name}`.trim();
    const payload = { userId: user.id, name: fullName, role: user.role_name || 'user', areas: [] };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.json({ success: true, token, data: { id: user.id, name: fullName, role: user.role_name, areas: [] } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, data: req.user });
});

// GET /api/auth/me/signature
router.get('/me/signature', authenticate, async (req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT email_signature FROM user WHERE id = ?', [req.user.userId]);
    res.json({ success: true, data: row?.email_signature || '' });
  } catch (err) { next(err); }
});

// PUT /api/auth/me/signature
router.put('/me/signature', authenticate, async (req, res, next) => {
  try {
    const { email_signature } = req.body;
    await pool.query('UPDATE user SET email_signature = ?, ts_updated = NOW() WHERE id = ?', [email_signature || null, req.user.userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/auth/me/signature/image — upload a photo for email signature
router.post('/me/signature/image', authenticate, sigImageUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image file provided' });
    const imageUrl = `/api/public/signature-images/${req.file.filename}`;
    res.json({ success: true, data: { url: imageUrl, filename: req.file.filename } });
  } catch (err) { next(err); }
});

module.exports = router;
