const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ============================================================
// EMAIL TEMPLATES (by category)
// ============================================================

// GET /api/client-management/templates?category=starting_email
router.get('/templates', authenticate, async (req, res, next) => {
  try {
    const { category } = req.query;
    let where = 'active = 1';
    const params = [];
    if (category) { where += ' AND category = ?'; params.push(category); }
    const [rows] = await pool.query(`SELECT * FROM email_template WHERE ${where} ORDER BY category, sort_order, name`, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/client-management/templates
router.post('/templates', authenticate, async (req, res, next) => {
  try {
    const { name, subject, body_html, category } = req.body;
    if (!name || !subject || !body_html || !category) return res.status(400).json({ success: false, error: 'Name, subject, body, and category required' });
    const [result] = await pool.query(
      'INSERT INTO email_template (name, subject, body_html, category) VALUES (?,?,?,?)',
      [name, subject, body_html, category]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/client-management/templates/:id
router.put('/templates/:id', authenticate, async (req, res, next) => {
  try {
    const { name, subject, body_html, category } = req.body;
    const fields = []; const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (subject !== undefined) { fields.push('subject = ?'); values.push(subject); }
    if (body_html !== undefined) { fields.push('body_html = ?'); values.push(body_html); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category); }
    if (!fields.length) return res.status(400).json({ success: false, error: 'No fields' });
    fields.push('ts_updated = NOW()');
    values.push(req.params.id);
    await pool.query(`UPDATE email_template SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/client-management/templates/:id (soft)
router.delete('/templates/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE email_template SET active = 0, ts_updated = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// SENT LOG
// ============================================================

// GET /api/client-management/sent-log?category=starting_email&date_from=&date_to=
router.get('/sent-log', authenticate, async (req, res, next) => {
  try {
    const { category, program_id, location_id, date_from, date_to } = req.query;
    let where = '1=1';
    const params = [];
    if (category) { where += ' AND cel.tool_category = ?'; params.push(category); }
    if (program_id) { where += ' AND cel.program_id = ?'; params.push(program_id); }
    if (location_id) { where += ' AND cel.location_id = ?'; params.push(location_id); }
    if (date_from) { where += ' AND cel.sent_at >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND cel.sent_at <= ?'; params.push(date_to + ' 23:59:59'); }
    const [rows] = await pool.query(
      `SELECT cel.*, CONCAT(u.first_name, ' ', u.last_name) AS sent_by_name
       FROM client_email_log cel
       LEFT JOIN user u ON u.id = cel.sent_by_user_id
       WHERE ${where} ORDER BY cel.sent_at DESC LIMIT 500`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/client-management/send — universal send endpoint
router.post('/send', authenticate, async (req, res, next) => {
  try {
    const { category, program_id, location_id, template_id, recipient_email, subject, body, test_mode, test_email } = req.body;
    if (!category || !subject || !body) return res.status(400).json({ success: false, error: 'Category, subject, and body required' });

    const actualRecipient = test_mode ? (test_email || 'test@professoregghead.com') : recipient_email;
    if (!actualRecipient) return res.status(400).json({ success: false, error: 'No recipient' });

    // Send via Gmail
    try {
      const { sendEmail } = require('../lib/gmail');
      const [[user]] = await pool.query('SELECT google_refresh_token, email_signature FROM user WHERE id = ?', [req.user.userId]);
      if (!user?.google_refresh_token) return res.status(400).json({ success: false, error: 'Gmail not connected' });
      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">${body.replace(/\n/g, '<br>')}</div>`;
      await sendEmail({ refreshToken: user.google_refresh_token, to: actualRecipient, subject, htmlBody, signature: user.email_signature });
    } catch (emailErr) {
      return res.status(500).json({ success: false, error: 'Email failed: ' + emailErr.message });
    }

    // Log it
    await pool.query(
      `INSERT INTO client_email_log (tool_category, program_id, location_id, sent_by_user_id, recipient_email, template_id, test_mode)
       VALUES (?,?,?,?,?,?,?)`,
      [category, program_id || null, location_id || null, req.user.userId, actualRecipient, template_id || null, test_mode ? 1 : 0]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/client-management/bulk-mark-done — mark multiple items done
router.post('/bulk-mark-done', authenticate, async (req, res, next) => {
  try {
    const { category, items, id_field } = req.body;
    if (!category || !items?.length) return res.status(400).json({ success: false, error: 'Category and items required' });
    for (const id of items) {
      const data = { tool_category: category, sent_by_user_id: req.user.userId, notes: 'Bulk marked done', test_mode: 0 };
      if (id_field === 'location_id') data.location_id = id; else data.program_id = id;
      await pool.query(
        `INSERT INTO client_email_log (tool_category, program_id, location_id, sent_by_user_id, notes, test_mode) VALUES (?,?,?,?,?,?)`,
        [data.tool_category, data.program_id || null, data.location_id || null, data.sent_by_user_id, data.notes, 0]
      );
    }
    res.json({ success: true, count: items.length });
  } catch (err) { next(err); }
});

// POST /api/client-management/mark-done — log as done without sending email
router.post('/mark-done', authenticate, async (req, res, next) => {
  try {
    const { category, program_id, location_id, notes } = req.body;
    if (!category) return res.status(400).json({ success: false, error: 'Category required' });
    await pool.query(
      `INSERT INTO client_email_log (tool_category, program_id, location_id, sent_by_user_id, notes, test_mode)
       VALUES (?,?,?,?,?,0)`,
      [category, program_id || null, location_id || null, req.user.userId, notes || 'Marked done (no email)']
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// TOOL-SPECIFIC DATA ENDPOINTS
// ============================================================

// Helper: get sent status for a category within date range
async function getSentMap(category, dateFrom, dateTo) {
  const [rows] = await pool.query(
    `SELECT program_id, location_id FROM client_email_log
     WHERE tool_category = ? AND test_mode = 0 AND sent_at BETWEEN ? AND ?`,
    [category, dateFrom || '2000-01-01', (dateTo || '2099-12-31') + ' 23:59:59']
  );
  const progSet = new Set(rows.filter(r => r.program_id).map(r => r.program_id));
  const locSet = new Set(rows.filter(r => r.location_id).map(r => r.location_id));
  return { progSet, locSet };
}

// Helper: get parent emails for a program via roster
async function getParentEmails(programId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT par.email
     FROM program_roster pr
     JOIN student s ON s.id = pr.student_id AND s.active = 1
     LEFT JOIN student_parent sp ON sp.student_id = s.id
     LEFT JOIN parent par ON par.id = sp.parent_id AND par.active = 1
     WHERE pr.program_id = ? AND pr.active = 1 AND pr.date_dropped IS NULL
       AND par.email IS NOT NULL AND par.email != ''`,
    [programId]
  );
  return rows.map(r => r.email);
}

// GET /api/client-management/starting-emails?date_from=&date_to=
router.get('/starting-emails', authenticate, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const sent = await getSentMap('starting_email', date_from, date_to);
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.payment_through_us,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              loc.id AS location_id, loc.school_name, loc.nickname AS location_nickname,
              loc.poc_email, loc.site_coordinator_email, loc.tb_required, loc.livescan_required, loc.virtus_required,
              CONCAT(lp.first_name, ' ', lp.last_name) AS professor_name,
              cs.class_status_name,
              cl.formal_class_name AS class_name
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       WHERE prog.active = 1 AND prog.live = 1 AND prog.party_format_id IS NULL
         AND prog.lead_professor_id IS NOT NULL
         AND prog.first_session_date BETWEEN ? AND ?
       ORDER BY prog.first_session_date ASC`,
      [date_from || '2000-01-01', date_to || '2099-12-31']
    );
    const data = rows.map(r => ({ ...r, sent: sent.progSet.has(r.id) }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/client-management/first-day-parent?date_from=&date_to=
router.get('/first-day-parent', authenticate, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const sent = await getSentMap('first_day_parent', date_from, date_to);
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.payment_through_us,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              loc.id AS location_id, loc.school_name, loc.poc_email, loc.site_coordinator_email,
              cs.class_status_name,
              cl.formal_class_name AS class_name,
              pt.program_type_name,
              (SELECT COUNT(DISTINCT par.email) FROM program_roster pr2
               JOIN student s2 ON s2.id = pr2.student_id LEFT JOIN student_parent sp2 ON sp2.student_id = s2.id
               LEFT JOIN parent par ON par.id = sp2.parent_id
               WHERE pr2.program_id = prog.id AND pr2.active = 1 AND pr2.date_dropped IS NULL
                 AND par.email IS NOT NULL AND par.email != '') AS parent_email_count
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       WHERE prog.active = 1 AND prog.live = 1 AND prog.party_format_id IS NULL
         AND prog.first_session_date BETWEEN ? AND ?
       ORDER BY prog.first_session_date ASC`,
      [date_from || '2000-01-01', date_to || '2099-12-31']
    );
    const data = rows.map(r => ({ ...r, sent: sent.progSet.has(r.id), has_parent_emails: r.parent_email_count > 0 }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/client-management/second-week?date_from=&date_to=
router.get('/second-week', authenticate, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const sent = await getSentMap('second_week_email', date_from, date_to);
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.payment_through_us, prog.number_enrolled,
              loc.id AS location_id, loc.school_name, loc.poc_email, loc.site_coordinator_email,
              cs.class_status_name,
              cl.formal_class_name AS class_name,
              (SELECT s2.session_date FROM session s2 WHERE s2.program_id = prog.id AND s2.active = 1
               ORDER BY s2.session_date ASC LIMIT 1 OFFSET 1) AS second_session_date
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       WHERE prog.active = 1 AND prog.live = 1 AND prog.party_format_id IS NULL
       HAVING second_session_date BETWEEN ? AND ?
       ORDER BY second_session_date ASC`,
      [date_from || '2000-01-01', date_to || '2099-12-31']
    );
    const data = rows.map(r => ({ ...r, sent: sent.progSet.has(r.id) }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/client-management/sub-emails?date_from=&date_to=
router.get('/sub-emails', authenticate, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const sent = await getSentMap('sub_email', date_from, date_to);
    const [rows] = await pool.query(
      `SELECT s.id AS session_id, s.session_date, s.program_id,
              prog.program_nickname, prog.payment_through_us,
              loc.id AS location_id, loc.school_name, loc.poc_email, loc.site_coordinator_email,
              loc.tb_required, loc.livescan_required, loc.virtus_required,
              CONCAT(sub.professor_nickname, ' ', sub.last_name) AS sub_name,
              CONCAT(lead.professor_nickname, ' ', lead.last_name) AS regular_name,
              cl.formal_class_name AS class_name
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN professor sub ON sub.id = s.professor_id
       LEFT JOIN professor lead ON lead.id = prog.lead_professor_id
       WHERE s.active = 1
         AND s.professor_id IS NOT NULL
         AND s.professor_id != prog.lead_professor_id
         AND s.session_date BETWEEN ? AND ?
       ORDER BY s.session_date ASC`,
      [date_from || '2000-01-01', date_to || '2099-12-31']
    );
    const data = rows.map(r => ({ ...r, sent: sent.progSet.has(r.program_id) }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/client-management/new-professor?date_from=&date_to=
router.get('/new-professor', authenticate, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const sent = await getSentMap('new_professor_email', date_from, date_to);
    // Find programs where the current lead has never taught a past session
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.payment_through_us, prog.lead_professor_id,
              loc.id AS location_id, loc.school_name, loc.poc_email, loc.site_coordinator_email,
              loc.tb_required, loc.livescan_required, loc.virtus_required,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS new_professor_name,
              cl.formal_class_name AS class_name
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       WHERE prog.active = 1 AND prog.live = 1 AND prog.party_format_id IS NULL
         AND prog.lead_professor_id IS NOT NULL
         AND prog.first_session_date BETWEEN ? AND ?
         AND NOT EXISTS (
           SELECT 1 FROM session s2
           WHERE s2.program_id = prog.id AND s2.active = 1
             AND s2.professor_id = prog.lead_professor_id
             AND s2.session_date < CURDATE()
         )
       ORDER BY prog.first_session_date ASC`,
      [date_from || '2000-01-01', date_to || '2099-12-31']
    );
    const data = rows.map(r => ({ ...r, sent: sent.progSet.has(r.id) }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/client-management/last-day?date_from=&date_to=&tab=school|parent
router.get('/last-day', authenticate, async (req, res, next) => {
  try {
    const { date_from, date_to, tab } = req.query;
    const category = tab === 'parent' ? 'last_day_parent' : 'last_day_school';
    const sent = await getSentMap(category, date_from, date_to);
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.payment_through_us, prog.registration_link_for_flyer,
              loc.id AS location_id, loc.school_name, loc.poc_email, loc.site_coordinator_email,
              loc.registration_link_for_flyer AS loc_reg_link,
              cs.class_status_name,
              cl.formal_class_name AS class_name,
              (SELECT MAX(s2.session_date) FROM session s2 WHERE s2.program_id = prog.id AND s2.active = 1) AS last_session_date,
              (SELECT MIN(p2.first_session_date) FROM program p2
               WHERE p2.location_id = prog.location_id AND p2.active = 1
                 AND p2.first_session_date > (SELECT MAX(s3.session_date) FROM session s3 WHERE s3.program_id = prog.id AND s3.active = 1)
              ) AS next_session_start_date
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       WHERE prog.active = 1 AND prog.live = 1 AND prog.party_format_id IS NULL
       HAVING last_session_date BETWEEN ? AND ?
       ORDER BY last_session_date ASC`,
      [date_from || '2000-01-01', date_to || '2099-12-31']
    );
    // For parent tab, get parent email counts
    if (tab === 'parent') {
      for (const r of rows) {
        const emails = await getParentEmails(r.id);
        r.parent_email_count = emails.length;
        r.parent_emails = emails;
      }
    }
    const data = rows.map(r => ({ ...r, sent: sent.progSet.has(r.id) }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/client-management/parent-feedback?date_from=&date_to=
router.get('/parent-feedback', authenticate, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const sent = await getSentMap('parent_feedback', date_from, date_to);
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.payment_through_us,
              loc.id AS location_id, loc.school_name,
              cl.formal_class_name AS class_name,
              CONCAT(lp.first_name, ' ', lp.last_name) AS professor_name,
              (SELECT s2.session_date FROM session s2 WHERE s2.program_id = prog.id AND s2.active = 1
               ORDER BY s2.session_date ASC LIMIT 1 OFFSET 3) AS fourth_session_date,
              (SELECT COUNT(DISTINCT par.email) FROM program_roster pr2
               JOIN student s2 ON s2.id = pr2.student_id LEFT JOIN student_parent sp2 ON sp2.student_id = s2.id
               LEFT JOIN parent par ON par.id = sp2.parent_id
               WHERE pr2.program_id = prog.id AND pr2.active = 1 AND pr2.date_dropped IS NULL
                 AND par.email IS NOT NULL AND par.email != '') AS parent_email_count
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       WHERE prog.active = 1 AND prog.live = 1 AND prog.party_format_id IS NULL
       HAVING fourth_session_date BETWEEN ? AND ?
       ORDER BY fourth_session_date ASC`,
      [date_from || '2000-01-01', date_to || '2099-12-31']
    );
    const data = rows.map(r => ({ ...r, sent: sent.progSet.has(r.id), has_parent_emails: r.parent_email_count > 0 }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/client-management/site-check-ins?date_from=&date_to=
router.get('/site-check-ins', authenticate, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const sent = await getSentMap('site_check_in', date_from, date_to);
    const [rows] = await pool.query(
      `SELECT loc.id, loc.nickname, loc.school_name, loc.point_of_contact,
              loc.poc_email, loc.poc_phone, loc.site_coordinator_name, loc.site_coordinator_email,
              loc.internal_notes,
              ga.geographic_area_name,
              (SELECT COUNT(*) FROM program p WHERE p.location_id = loc.id AND p.active = 1
               AND p.first_session_date <= ? AND (p.last_session_date >= ? OR p.last_session_date IS NULL)) AS active_program_count
       FROM location loc
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       WHERE loc.active = 1 AND loc.retained = 1
       HAVING active_program_count > 0
       ORDER BY loc.school_name`,
      [date_to || '2099-12-31', date_from || '2000-01-01']
    );
    const data = rows.map(r => ({ ...r, sent: sent.locSet.has(r.id) }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /api/client-management/site-check-ins/:id/log — log a contact attempt
router.post('/site-check-ins/:id/log', authenticate, async (req, res, next) => {
  try {
    const { contact_type, notes } = req.body;
    const timestamp = new Date().toISOString().split('T')[0];
    const logEntry = `[${timestamp}] ${contact_type || 'Contact'}: ${notes || 'Contacted'}`;
    await pool.query(
      `UPDATE location SET internal_notes = CONCAT(COALESCE(internal_notes, ''), '\n', ?), ts_updated = NOW() WHERE id = ?`,
      [logEntry, req.params.id]
    );
    // Also log as sent
    await pool.query(
      `INSERT INTO client_email_log (tool_category, location_id, sent_by_user_id, notes, test_mode)
       VALUES ('site_check_in', ?, ?, ?, 0)`,
      [req.params.id, req.user.userId, `${contact_type}: ${notes || ''}`]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/client-management/nps-emails?date_from=&date_to=
router.get('/nps-emails', authenticate, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const sent = await getSentMap('nps_email', date_from, date_to);
    // Group by location — one email per school
    const [rows] = await pool.query(
      `SELECT loc.id, loc.nickname, loc.school_name, loc.poc_email, loc.site_coordinator_email,
              loc.point_of_contact,
              ga.geographic_area_name,
              COUNT(prog.id) AS program_count
       FROM location loc
       JOIN program prog ON prog.location_id = loc.id AND prog.active = 1 AND prog.live = 1
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       WHERE loc.active = 1
         AND EXISTS (
           SELECT 1 FROM session s2 WHERE s2.program_id = prog.id AND s2.active = 1
             AND s2.session_date BETWEEN ? AND ?
         )
       GROUP BY loc.id
       ORDER BY loc.school_name`,
      [date_from || '2000-01-01', date_to || '2099-12-31']
    );
    const data = rows.map(r => ({ ...r, sent: sent.locSet.has(r.id) }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/client-management/roster-emails?date_from=&date_to=
router.get('/roster-emails', authenticate, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const sent = await getSentMap('roster_email', date_from, date_to);
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.number_enrolled, prog.payment_through_us,
              loc.id AS location_id, loc.school_name, loc.poc_email, loc.site_coordinator_email,
              cl.formal_class_name AS class_name,
              cpt.class_pricing_type_name AS cost_type,
              (SELECT COUNT(*) FROM program_roster pr2 WHERE pr2.program_id = prog.id AND pr2.active = 1 AND pr2.date_dropped IS NULL) AS roster_count
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN class_pricing_type cpt ON cpt.id = prog.class_pricing_type_id
       WHERE prog.active = 1 AND prog.live = 1 AND prog.party_format_id IS NULL
         AND prog.payment_through_us = 0
         AND prog.first_session_date BETWEEN ? AND ?
       HAVING roster_count != prog.number_enrolled OR (roster_count > 0 AND prog.number_enrolled IS NULL)
       ORDER BY prog.program_nickname`,
      [date_from || '2000-01-01', date_to || '2099-12-31']
    );
    const data = rows.map(r => ({
      ...r,
      discrepancy: (r.roster_count || 0) - (r.number_enrolled || 0),
      sent: sent.progSet.has(r.id),
    }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/client-management/rebooking/locations — locations needing rebooking (active but no future class booked)
router.get('/rebooking/locations', authenticate, async (req, res, next) => {
  try {
    const { area } = req.query;
    let areaWhere = '';
    const params = [];
    if (area) { areaWhere = ' AND ga.geographic_area_name = ?'; params.push(area); }
    const [rows] = await pool.query(
      `SELECT loc.id, loc.nickname, loc.school_name, loc.point_of_contact, loc.poc_email, loc.site_coordinator_email,
              ga.geographic_area_name,
              (SELECT MAX(p2.last_session_date) FROM program p2 WHERE p2.location_id = loc.id AND p2.active = 1) AS last_program_end,
              (SELECT COUNT(*) FROM program p3 WHERE p3.location_id = loc.id AND p3.active = 1
               AND p3.first_session_date > CURDATE()) AS future_program_count
       FROM location loc
       LEFT JOIN geographic_area ga ON ga.id = COALESCE(loc.geographic_area_id_online, loc.city_id)
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga2 ON ga2.id = c.geographic_area_id
       WHERE loc.active = 1 AND (loc.location_type_id IS NULL OR loc.location_type_id NOT IN (2, 5))${areaWhere}
       HAVING future_program_count = 0
       ORDER BY loc.school_name`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/client-management/rebooking/location/:id — programs at location for rebooking
router.get('/rebooking/location/:id', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.last_session_date,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday,
              prog.start_time, prog.parent_cost, prog.number_enrolled,
              prog.minimum_students, prog.maximum_students,
              cs.class_status_name,
              cl.formal_class_name, cl.long_blurb AS class_description,
              pt.program_type_name,
              (SELECT s2.session_date FROM session s2 WHERE s2.program_id = prog.id AND s2.active = 1 ORDER BY s2.session_date ASC LIMIT 1) AS actual_start
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       WHERE prog.location_id = ? AND prog.active = 1
       ORDER BY prog.first_session_date DESC`,
      [req.params.id]
    );
    // Get location info
    const [[loc]] = await pool.query(
      `SELECT loc.*, loc.point_of_contact, loc.poc_email, loc.site_coordinator_email,
              loc.set_dates_ourselves, loc.flyer_required_for_location
       FROM location loc WHERE loc.id = ?`,
      [req.params.id]
    );
    res.json({ success: true, data: { programs: rows, location: loc } });
  } catch (err) { next(err); }
});

// GET /api/client-management/parent-emails/:programId — get parent email list
router.get('/parent-emails/:programId', authenticate, async (req, res, next) => {
  try {
    const emails = await getParentEmails(req.params.programId);
    res.json({ success: true, data: emails });
  } catch (err) { next(err); }
});

// GET /api/client-management/session-dates/:programId — all session dates for a program
router.get('/session-dates/:programId', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT session_date FROM session WHERE program_id = ? AND active = 1 ORDER BY session_date ASC',
      [req.params.programId]
    );
    res.json({ success: true, data: rows.map(r => r.session_date) });
  } catch (err) { next(err); }
});

// GET /api/client-management/counts — badge counts for each tool
router.get('/counts', authenticate, async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const ws = weekStart.toISOString().split('T')[0];
    const we = weekEnd.toISOString().split('T')[0];

    // Count unsent items per tool (simplified — counts programs in each endpoint's date range that haven't been emailed)
    const queries = await Promise.all([
      pool.query(`SELECT COUNT(*) as cnt FROM program p JOIN class_status cs ON cs.id = p.class_status_id LEFT JOIN client_email_log cel ON cel.program_id = p.id AND cel.category = 'starting_email' WHERE p.active = 1 AND cs.confirmed = 1 AND p.first_session_date BETWEEN ? AND ? AND cel.id IS NULL`, [today, today]),
      pool.query(`SELECT COUNT(*) as cnt FROM program p JOIN class_status cs ON cs.id = p.class_status_id LEFT JOIN client_email_log cel ON cel.program_id = p.id AND cel.category = 'first_day_parent' WHERE p.active = 1 AND cs.confirmed = 1 AND p.first_session_date BETWEEN ? AND ? AND cel.id IS NULL`, [today, today]),
      pool.query(`SELECT COUNT(*) as cnt FROM program p JOIN class_status cs ON cs.id = p.class_status_id JOIN session s2 ON s2.program_id = p.id AND s2.active = 1 AND s2.session_date BETWEEN ? AND ? LEFT JOIN client_email_log cel ON cel.program_id = p.id AND cel.category = 'second_week_email' WHERE p.active = 1 AND cs.confirmed = 1 AND cel.id IS NULL AND (SELECT COUNT(*) FROM session sx WHERE sx.program_id = p.id AND sx.active = 1 AND sx.session_date <= ?) = 2`, [today, today, today]),
      pool.query(`SELECT COUNT(DISTINCT s.id) as cnt FROM session s JOIN program p ON p.id = s.program_id AND p.active = 1 LEFT JOIN client_email_log cel ON cel.program_id = p.id AND cel.category = 'sub_email' AND DATE(cel.created_at) = s.session_date WHERE s.active = 1 AND s.session_date BETWEEN ? AND ? AND s.professor_id IS NOT NULL AND s.professor_id != p.lead_professor_id AND cel.id IS NULL`, [today, today]),
      pool.query(`SELECT COUNT(*) as cnt FROM program p JOIN class_status cs ON cs.id = p.class_status_id LEFT JOIN client_email_log cel ON cel.program_id = p.id AND cel.category = 'new_professor_email' WHERE p.active = 1 AND cs.confirmed = 1 AND p.first_session_date BETWEEN ? AND ? AND cel.id IS NULL`, [today, today]),
      pool.query(`SELECT COUNT(*) as cnt FROM program p JOIN class_status cs ON cs.id = p.class_status_id LEFT JOIN client_email_log cel ON cel.program_id = p.id AND cel.category LIKE 'last_day%' WHERE p.active = 1 AND cs.confirmed = 1 AND p.last_session_date BETWEEN ? AND ? AND cel.id IS NULL`, [today, today]),
      pool.query(`SELECT COUNT(*) as cnt FROM program p JOIN class_status cs ON cs.id = p.class_status_id LEFT JOIN client_email_log cel ON cel.program_id = p.id AND cel.category = 'roster_email' WHERE p.active = 1 AND cs.confirmed = 1 AND p.first_session_date BETWEEN ? AND ? AND cel.id IS NULL`, [ws, we]),
    ]);

    res.json({
      success: true,
      data: {
        starting: queries[0][0][0]?.cnt || 0,
        first_day: queries[1][0][0]?.cnt || 0,
        second_week: queries[2][0][0]?.cnt || 0,
        sub: queries[3][0][0]?.cnt || 0,
        new_professor: queries[4][0][0]?.cnt || 0,
        last_day: queries[5][0][0]?.cnt || 0,
        roster: queries[6][0][0]?.cnt || 0,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
