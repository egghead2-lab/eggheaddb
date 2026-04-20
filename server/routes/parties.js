const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// Auto-generate party nickname from current data
// Format: M/D/YY - H:MM AM/PM - Professor [name] - [contact name] - [format] - [theme]
async function regeneratePartyNickname(partyId) {
  const [[p]] = await pool.query(
    `SELECT prog.first_session_date, prog.start_time,
            CONCAT(lp.professor_nickname) AS lead_name,
            CONCAT(par.first_name, IF(par.last_name IS NOT NULL AND par.last_name != '', CONCAT(' ', par.last_name), '')) AS contact_name,
            pf.party_format_name,
            cl.class_name AS theme_name
     FROM program prog
     LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
     LEFT JOIN parent par ON par.id = prog.parent_id
     LEFT JOIN party_format pf ON pf.id = prog.party_format_id
     LEFT JOIN class cl ON cl.id = prog.class_id
     WHERE prog.id = ?`, [partyId]
  );
  if (!p) return;

  const parts = [];
  // Date M/D/YY
  if (p.first_session_date) {
    const d = p.first_session_date instanceof Date ? p.first_session_date : new Date(p.first_session_date);
    parts.push(`${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(-2)}`);
  }
  // Time H:MM AM/PM
  if (p.start_time) {
    const t = String(p.start_time);
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (m) {
      let h = parseInt(m[1]);
      const mins = m[2];
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12; if (h === 0) h = 12;
      parts.push(`${h}:${mins} ${ampm}`);
    }
  }
  if (p.lead_name) parts.push(`Professor ${p.lead_name}`);
  if (p.contact_name && p.contact_name.trim()) parts.push(p.contact_name.trim());
  if (p.party_format_name) parts.push(p.party_format_name);
  if (p.theme_name) parts.push(p.theme_name);

  if (parts.length === 0) return;
  const nickname = parts.join(' - ').substring(0, 255);
  await pool.query('UPDATE program SET program_nickname = ? WHERE id = ?', [nickname, partyId]);
}

// GET /api/parties/professors — professors with current/future parties
router.get('/professors', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT p.id, CONCAT(p.professor_nickname, ' ', p.last_name) AS display_name
       FROM program prog
       JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       JOIN program_type pt ON pt.id = cl.program_type_id AND pt.program_type_name = 'Party'
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       JOIN professor p ON p.active = 1 AND (p.id = prog.lead_professor_id OR p.id = prog.assistant_professor_id)
       WHERE prog.active = 1
         AND (prog.first_session_date >= CURDATE() OR prog.first_session_date IS NULL)
       ORDER BY display_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/parties (party-type programs only)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status, professor, date_from, date_to, sort, dir, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [
      'prog.active = 1',
      `pt.program_type_name = 'Party'`,
    ];
    let params = [];

    if (search) {
      whereClauses.push(`(prog.program_nickname LIKE ? OR CONCAT(lp.first_name, ' ', lp.last_name) LIKE ? OR CONCAT(par.first_name, ' ', par.last_name) LIKE ? OR par.email LIKE ? OR DATE_FORMAT(prog.first_session_date, '%m/%d/%Y') LIKE ? OR DATE_FORMAT(prog.first_session_date, '%Y-%m-%d') LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s);
    }
    if (status) {
      whereClauses.push(`cs.class_status_name = ?`);
      params.push(status);
    } else {
      whereClauses.push(`cs.class_status_name NOT LIKE 'Cancelled%'`);
    }
    if (professor) {
      whereClauses.push(`(prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)`);
      params.push(professor, professor);
    }
    // Timeframe filter: 'current' (default), 'past', 'all'
    const timeframe = req.query.timeframe || 'current';
    if (timeframe === 'current') {
      whereClauses.push(`(prog.first_session_date >= CURDATE() OR prog.first_session_date IS NULL)`);
    } else if (timeframe === 'past') {
      whereClauses.push(`prog.first_session_date < CURDATE()`);
    }

    if (date_from) {
      whereClauses.push(`prog.first_session_date >= ?`);
      params.push(date_from);
    }
    if (date_to) {
      whereClauses.push(`prog.first_session_date <= ?`);
      params.push(date_to);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;
    const sortMap = {
      date: 'prog.first_session_date', status: 'cs.class_status_name',
      type: 'pf.party_format_name', theme: 'cl.class_name', contact: 'par.last_name',
      location: 'loc.nickname', professor: 'lp.professor_nickname',
    };
    const sortCol = sortMap[sort] || 'prog.first_session_date';
    const sortDir = dir === 'desc' ? 'DESC' : dir === 'asc' ? 'ASC' : 'ASC';

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname,
              prog.first_session_date AS party_date,
              prog.start_time AS party_start,
              prog.class_length_minutes,
              prog.party_location_text, prog.party_address, prog.party_city, prog.party_state, prog.party_zip, prog.geographic_area_id,
              prog.total_party_cost, prog.total_kids_attended, prog.maximum_students AS kids_expected,
              prog.charge_confirmed,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              c.city_name, c.zip_code, ga.geographic_area_name,
              pf.party_format_name,
              cl.class_name AS party_theme,
              lp.id AS lead_professor_id,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_nickname,
              ap.id AS assistant_professor_id,
              CONCAT(ap.professor_nickname, ' ', ap.last_name) AS assistant_professor_nickname,
              par.id AS contact_id,
              CONCAT(par.first_name, ' ', par.last_name) AS contact_name,
              par.email AS contact_email
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id AND cs.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id AND pt.active = 1
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id AND lp.active = 1
       LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id AND ap.active = 1
       LEFT JOIN parent par ON par.id = prog.parent_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       ${where}
       ORDER BY ${sortCol} ${sortDir}, prog.program_nickname ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM program prog
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id AND pt.active = 1
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id AND cs.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
       LEFT JOIN parent par ON par.id = prog.parent_id
       ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/parties/follow-up — past parties needing/received follow-up email (MUST be before /:id)
router.get('/follow-up', authenticate, async (req, res, next) => {
  try {
    const { days = 14 } = req.query;
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date,
              prog.start_time, prog.class_length_minutes,
              prog.party_location_text, prog.party_address, prog.party_city, prog.party_state, prog.party_zip,
              prog.emailed_follow_up, prog.final_charge_date, prog.final_charge_type, prog.charge_confirmed,
              prog.total_party_cost, prog.deposit_amount, prog.deposit_date, prog.base_party_price,
              prog.maximum_students AS kids_expected, prog.total_kids_attended,
              prog.invoice_needed, prog.invoice_notes,
              cs.class_status_name,
              pf.party_format_name,
              cl.class_name AS party_theme,
              loc.nickname AS location_nickname, loc.address,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_name,
              lp.phone_number AS lead_phone,
              CONCAT(par.first_name, ' ', par.last_name) AS contact_name,
              par.email AS contact_email, par.phone AS contact_phone
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN parent par ON par.id = prog.parent_id
       WHERE prog.active = 1
         AND pt.program_type_name = 'Party'
         AND (cs.class_status_name IS NULL OR cs.class_status_name NOT LIKE 'Cancelled%')
         AND prog.first_session_date < CURDATE()
         AND prog.first_session_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY prog.first_session_date DESC`,
      [parseInt(days)]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/parties/charge-pending — past parties missing final charge data (MUST be before /:id)
router.get('/charge-pending', authenticate, async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date,
              prog.start_time, prog.class_length_minutes,
              prog.emailed_follow_up, prog.final_charge_date, prog.final_charge_type, prog.charge_confirmed,
              prog.total_party_cost, prog.deposit_amount, prog.deposit_date, prog.base_party_price,
              prog.maximum_students AS kids_expected, prog.total_kids_attended,
              prog.invoice_needed, prog.invoice_notes,
              cs.class_status_name,
              pf.party_format_name,
              cl.class_name AS party_theme,
              loc.nickname AS location_nickname,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_name,
              CONCAT(par.first_name, ' ', par.last_name) AS contact_name,
              par.email AS contact_email
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN parent par ON par.id = prog.parent_id
       WHERE prog.active = 1
         AND pt.program_type_name = 'Party'
         AND (cs.class_status_name IS NULL OR cs.class_status_name NOT LIKE 'Cancelled%')
         AND prog.first_session_date < CURDATE()
         AND prog.first_session_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY prog.first_session_date DESC`,
      [parseInt(days)]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/parties/unconfirmed — MUST be before /:id
router.get('/unconfirmed', authenticate, async (req, res, next) => {
  try {
    const { days = 14 } = req.query;
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date,
              prog.start_time, prog.class_length_minutes,
              prog.party_location_text, prog.party_address, prog.party_city, prog.party_state, prog.party_zip, prog.geographic_area_id, prog.party_confirmation_sent,
              prog.party_confirmation_sent_at,
              cs.class_status_name,
              pf.party_format_name,
              cl.class_name AS party_theme,
              loc.nickname AS location_nickname, loc.address,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_name,
              lp.phone_number AS lead_phone,
              CONCAT(par.first_name, ' ', par.last_name) AS contact_name,
              par.email AS contact_email, par.phone AS contact_phone
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN parent par ON par.id = prog.parent_id
       WHERE prog.active = 1
         AND pt.program_type_name = 'Party'
         AND (cs.class_status_name IS NULL OR cs.class_status_name NOT LIKE 'Cancelled%')
         AND prog.first_session_date >= CURDATE()
         AND prog.first_session_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY prog.first_session_date ASC`,
      [parseInt(days)]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/parties/email-templates — MUST be before /:id (optional ?category= filter)
router.get('/email-templates', authenticate, async (req, res, next) => {
  try {
    const { category } = req.query;
    const params = [];
    let where = 'WHERE active = 1';
    if (category) { where += ' AND category = ?'; params.push(category); }
    const [rows] = await pool.query(`SELECT * FROM party_email_template ${where} ORDER BY is_default DESC, name`, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/parties/calendar/pending — MUST be before /:id
router.get('/calendar/pending', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.start_time,
              prog.class_length_minutes, prog.party_location_text, prog.calendar_event_id,
              prog.calendar_event, prog.birthday_kid_name, prog.birthday_kid_age,
              cs.class_status_name,
              pf.party_format_name,
              cl.class_name AS party_theme,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_name,
              CONCAT(par.first_name, ' ', par.last_name) AS contact_name
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN parent par ON par.id = prog.parent_id
       WHERE prog.active = 1
         AND pt.program_type_name = 'Party'
         AND cs.confirmed = 1
         AND prog.first_session_date >= CURDATE()
         AND prog.calendar_event_id IS NULL
       ORDER BY prog.first_session_date ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/parties/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[party]] = await pool.query(
      `SELECT prog.*, pf.party_format_name, cl2.class_name AS party_theme_name,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              cl.class_name, cl.class_code,
              pt.program_type_name,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_nickname,
              CONCAT(ap.professor_nickname, ' ', ap.last_name) AS assistant_professor_nickname,
              CONCAT(par.first_name, ' ', par.last_name) AS contact_name,
              par.email AS contact_email, par.phone AS contact_phone
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       LEFT JOIN class cl2 ON cl2.id = prog.class_id AND cl2.program_type_id = 4
       LEFT JOIN parent par ON par.id = prog.parent_id
       WHERE prog.id = ? AND prog.active = 1 AND pt.program_type_name = 'Party'`,
      [id]
    );

    if (!party) {
      return res.status(404).json({ success: false, error: 'Party not found' });
    }

    res.json({ success: true, data: party });
  } catch (err) {
    next(err);
  }
});

// POST /api/parties
router.post('/', authenticate, async (req, res, next) => {
  try {
    const data = req.body;

    const fields = [
      'program_nickname', 'class_status_id', 'location_id', 'class_id',
      'general_notes', 'payment_through_us', 'lead_professor_id', 'lead_professor_pay',
      'lead_professor_drive_fee', 'lead_professor_tip', 'lead_professor_dry_ice',
      'lead_reimbursements_paid', 'assistant_required', 'assistant_professor_id',
      'assistant_professor_pay', 'assistant_professor_drive_fee', 'assistant_professor_tip',
      'assistant_professor_dry_ice', 'assistant_reimbursements_paid',
      'base_party_price', 'drive_fee', 'late_booking_fee', 'total_kids_attended',
      'extra_kids_fee', 'extra_time_fee', 'deposit_date', 'deposit_amount',
      'total_party_cost', 'emailed_follow_up', 'charge_confirmed', 'final_charge_date',
      'final_charge_type', 'shirt_size', 'glow_slime_amount_needed',
      'first_session_date', 'start_time', 'class_length_minutes',
      'party_format_id', 'party_location_text', 'party_address', 'party_city', 'party_state', 'party_zip', 'geographic_area_id', 'demo_date', 'demo_start_time', 'demo_end_time', 'demo_type_id', 'demo_pay',
      'demo_professor_id', 'demo_notes', 'parent_id', 'birthday_kid_name', 'birthday_kid_age',
      'invoice_needed', 'invoice_notes',
    ];

    const insertFields = fields.filter(f => data[f] !== undefined);
    const values = insertFields.map(f => data[f] === '' ? null : data[f]);

    // program_nickname is NOT NULL — insert a placeholder if the client didn't supply one;
    // regeneratePartyNickname overwrites it after insert with the proper auto-generated value.
    if (!insertFields.includes('program_nickname')) {
      insertFields.push('program_nickname');
      values.push(`Party (pending) ${Date.now()}`);
    }

    const [result] = await pool.query(
      `INSERT INTO program (${insertFields.join(', ')}, active, ts_inserted, ts_updated)
       VALUES (${insertFields.map(() => '?').join(', ')}, 1, NOW(), NOW())`,
      values
    );

    // Auto-generate the nickname from current fields
    try { await regeneratePartyNickname(result.insertId); } catch (e) { console.warn('regeneratePartyNickname failed:', e.message); }

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/parties/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const fields = [
      'program_nickname', 'class_status_id', 'location_id', 'class_id',
      'general_notes', 'payment_through_us', 'lead_professor_id', 'lead_professor_pay',
      'lead_professor_drive_fee', 'lead_professor_tip', 'lead_professor_dry_ice',
      'lead_reimbursements_paid', 'assistant_required', 'assistant_professor_id',
      'assistant_professor_pay', 'assistant_professor_drive_fee', 'assistant_professor_tip',
      'assistant_professor_dry_ice', 'assistant_reimbursements_paid',
      'base_party_price', 'drive_fee', 'late_booking_fee', 'total_kids_attended',
      'extra_kids_fee', 'extra_time_fee', 'deposit_date', 'deposit_amount',
      'total_party_cost', 'emailed_follow_up', 'charge_confirmed', 'final_charge_date',
      'final_charge_type', 'shirt_size', 'glow_slime_amount_needed',
      'first_session_date', 'start_time', 'class_length_minutes',
      'party_format_id', 'party_location_text', 'party_address', 'party_city', 'party_state', 'party_zip', 'geographic_area_id', 'demo_date', 'demo_start_time', 'demo_end_time', 'demo_type_id', 'demo_pay',
      'demo_professor_id', 'demo_notes', 'parent_id', 'birthday_kid_name', 'birthday_kid_age', 'active',
      'invoice_needed', 'invoice_notes',
    ];

    // Skip program_nickname from updates — it's auto-regenerated below; never let it be set to empty/null
    const updateFields = fields.filter(f => data[f] !== undefined && f !== 'program_nickname');
    const values = updateFields.map(f => data[f] === '' ? null : data[f]);

    if (updateFields.length === 0) {
      // Still regenerate nickname so a no-op PUT doesn't fail
      try { await regeneratePartyNickname(id); } catch (e) { console.warn('regeneratePartyNickname failed:', e.message); }
      return res.json({ success: true });
    }

    await pool.query(
      `UPDATE program SET ${updateFields.map(f => `${f} = ?`).join(', ')}, ts_updated = NOW()
       WHERE id = ?`,
      [...values, id]
    );

    // Auto-regenerate the nickname from current fields
    try { await regeneratePartyNickname(id); } catch (e) { console.warn('regeneratePartyNickname failed:', e.message); }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════
// PARTY CONFIRMS + EMAIL
// ═══════════════════════════════════════════════════════════════════

// POST /api/parties/:id/mark-confirmed — mark confirmation sent (without email)
router.post('/:id/mark-confirmed', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE program SET party_confirmation_sent = 1, party_confirmation_sent_at = NOW(), party_confirmation_sent_by = ? WHERE id = ?',
      [req.user.userId, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/parties/:id/send-confirmation — send email + mark confirmed
router.post('/:id/send-confirmation', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { template_id, recipient_email, subject, body } = req.body;
    if (!recipient_email || !body) return res.status(400).json({ success: false, error: 'Email and body required' });

    // Send via Gmail
    try {
      const { sendEmail } = require('../lib/gmail');
      const [[user]] = await pool.query('SELECT google_refresh_token, email_signature FROM user WHERE id = ?', [req.user.userId]);
      if (!user?.google_refresh_token) return res.status(400).json({ success: false, error: 'No Google account linked — sign in with Google first' });
      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">${body.replace(/\n/g, '<br>')}</div>`;
      await sendEmail({ refreshToken: user.google_refresh_token, to: recipient_email, subject, htmlBody, signature: user.email_signature });
    } catch (emailErr) {
      return res.status(500).json({ success: false, error: 'Failed to send email: ' + emailErr.message });
    }

    // Log it
    await pool.query(
      'INSERT INTO party_email_log (program_id, template_id, recipient_email, subject, sent_by_user_id) VALUES (?,?,?,?,?)',
      [id, template_id || null, recipient_email, subject, req.user.userId]
    );

    // Mark confirmed
    await pool.query(
      'UPDATE program SET party_confirmation_sent = 1, party_confirmation_sent_at = NOW(), party_confirmation_sent_by = ? WHERE id = ?',
      [req.user.userId, id]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/parties/:id/mark-followed-up — mark follow-up sent (without email)
router.post('/:id/mark-followed-up', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE program SET emailed_follow_up = CURDATE(), ts_updated = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/parties/:id/send-follow-up — send follow-up email + mark
router.post('/:id/send-follow-up', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { template_id, recipient_email, subject, body } = req.body;
    if (!recipient_email || !body) return res.status(400).json({ success: false, error: 'Email and body required' });

    try {
      const { sendEmail } = require('../lib/gmail');
      const [[user]] = await pool.query('SELECT google_refresh_token, email_signature FROM user WHERE id = ?', [req.user.userId]);
      if (!user?.google_refresh_token) return res.status(400).json({ success: false, error: 'No Google account linked — sign in with Google first' });
      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">${body.replace(/\n/g, '<br>')}</div>`;
      await sendEmail({ refreshToken: user.google_refresh_token, to: recipient_email, subject, htmlBody, signature: user.email_signature });
    } catch (emailErr) {
      return res.status(500).json({ success: false, error: 'Failed to send email: ' + emailErr.message });
    }

    await pool.query(
      'INSERT INTO party_email_log (program_id, template_id, recipient_email, subject, sent_by_user_id) VALUES (?,?,?,?,?)',
      [id, template_id || null, recipient_email, subject, req.user.userId]
    );
    await pool.query('UPDATE program SET emailed_follow_up = CURDATE(), ts_updated = NOW() WHERE id = ?', [id]);

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/parties/:id/log-charge — set final_charge_date / final_charge_type
router.post('/:id/log-charge', authenticate, async (req, res, next) => {
  try {
    const { final_charge_date, final_charge_type } = req.body;
    if (!final_charge_date || !final_charge_type) {
      return res.status(400).json({ success: false, error: 'final_charge_date and final_charge_type required' });
    }
    await pool.query(
      'UPDATE program SET final_charge_date = ?, final_charge_type = ?, charge_confirmed = 1, ts_updated = NOW() WHERE id = ?',
      [final_charge_date, final_charge_type, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PARTY EMAIL TEMPLATES (POST/PUT/DELETE — GET is above /:id)

router.post('/email-templates', authenticate, async (req, res, next) => {
  try {
    const { name, subject, body, category } = req.body;
    if (!name || !subject || !body) return res.status(400).json({ success: false, error: 'Name, subject, and body required' });
    const [result] = await pool.query(
      'INSERT INTO party_email_template (name, subject, body, category) VALUES (?,?,?,?)',
      [name, subject, body, category || 'confirmation']
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

router.put('/email-templates/:id', authenticate, async (req, res, next) => {
  try {
    const { name, subject, body, is_default, category } = req.body;
    const sets = []; const vals = [];
    if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
    if (subject !== undefined) { sets.push('subject = ?'); vals.push(subject); }
    if (body !== undefined) { sets.push('body = ?'); vals.push(body); }
    if (is_default !== undefined) { sets.push('is_default = ?'); vals.push(is_default ? 1 : 0); }
    if (category !== undefined) { sets.push('category = ?'); vals.push(category || 'confirmation'); }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
    await pool.query(`UPDATE party_email_template SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/email-templates/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE party_email_template SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// PARTY CALENDAR
// ═══════════════════════════════════════════════════════════════════

const { addPartyToCalendar, syncPartyCalendarEvent, deletePartyCalendarEvent } = require('../lib/partyCalendar');

// POST /api/parties/:id/calendar — create calendar event
router.post('/:id/calendar', authenticate, async (req, res, next) => {
  try {
    const dryRun = req.query.dry_run === 'true' || req.body?.dry_run === true;
    const result = await addPartyToCalendar(req.params.id, { dryRun });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Calendar error: ' + err.message });
  }
});

// POST /api/parties/:id/calendar/sync — update existing calendar event
router.post('/:id/calendar/sync', authenticate, async (req, res, next) => {
  try {
    const result = await syncPartyCalendarEvent(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Calendar sync error: ' + err.message });
  }
});

// DELETE /api/parties/:id/calendar — remove calendar event
router.delete('/:id/calendar', authenticate, async (req, res, next) => {
  try {
    const result = await deletePartyCalendarEvent(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Calendar delete error: ' + err.message });
  }
});

module.exports = router;
