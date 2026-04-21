const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { sendSms, getInboundMessages, normalizePhone, isConfirmResponse } = require('../lib/twilio');

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function fmtEnd(start, mins) {
  if (!start || !mins) return '';
  const [h, m] = start.split(':').map(Number);
  const tot = h * 60 + m + mins;
  const eh = Math.floor(tot / 60) % 24;
  const em = tot % 60;
  return `${eh % 12 || 12}:${String(em).padStart(2, '0')} ${eh >= 12 ? 'PM' : 'AM'}`;
}

function fmtArrival(start, before = 10) {
  if (!start) return '';
  const [h, m] = start.split(':').map(Number);
  const tot = h * 60 + m - before;
  const ah = Math.floor(tot / 60) % 24;
  const am = tot % 60;
  return `${ah % 12 || 12}:${String(am).padStart(2, '0')} ${ah >= 12 ? 'PM' : 'AM'}`;
}

function dayName(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }); }
function shortDate(d) { const x = new Date(d + 'T12:00:00'); return `${x.getMonth() + 1}/${x.getDate()}`; }

/** Fill template merge variables */
function mergeTemplate(template, vars) {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val ?? '');
  }
  // Clean up unreplaced variables
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  // Unescape newlines
  result = result.replace(/\\n/g, '\n');
  return result;
}

function buildMergeVars(row) {
  const date = row.session_date ? row.session_date.split('T')[0] : '';
  return {
    program_nickname: row.program_nickname || '',
    day_name: date ? dayName(date) : '',
    short_date: date ? shortDate(date) : '',
    start_time: fmt12(row.start_time || row.session_time),
    end_time: fmtEnd(row.start_time || row.session_time, row.class_length_minutes),
    arrival_time: fmtArrival(row.start_time || row.session_time),
    address: row.address || '',
    contact_name: row.point_of_contact || row.contact_name || '',
    contact_phone: row.poc_phone || row.contact_phone ? ` - ${row.poc_phone || row.contact_phone}` : '',
    class_type: row.class_type_name || '',
    lesson_name: row.lesson_name || '',
    num_enrolled: row.number_enrolled || '',
    lead_professor_name: row.lead_professor_name || '',
    lead_phone: row.lead_phone || '',
    assistant_professor_name: row.assistant_professor_name || '',
    party_format: row.party_format_name || '',
    child_info: [row.child_name, row.child_age ? `turning ${row.child_age}` : ''].filter(Boolean).join(' ') || '',
    notes: row.specific_notes ? `\nNotes: ${row.specific_notes}` : '',
    reminder_number: row._reminder_number || '1',
    total_reminders: row._total_reminders || '1',
    coordinator_name: row.coordinator_name || '',
  };
}

// ═══════════════════════════════════════════════════════════════
// SMS TEMPLATES CRUD
// ═══════════════════════════════════════════════════════════════

router.get('/sms-templates', authenticate, async (req, res, next) => {
  try {
    const { category } = req.query;
    let q = 'SELECT * FROM sms_template WHERE active = 1';
    const params = [];
    if (category) { q += ' AND category = ?'; params.push(category); }
    q += ' ORDER BY category, is_default DESC, name';
    const [rows] = await pool.query(q, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/sms-templates', authenticate, async (req, res, next) => {
  try {
    const { name, category, body, is_default } = req.body;
    if (!name || !category || !body) return res.status(400).json({ success: false, error: 'Name, category, and body required' });
    const [result] = await pool.query(
      'INSERT INTO sms_template (name, category, body, is_default) VALUES (?, ?, ?, ?)',
      [name, category, body, is_default ? 1 : 0]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

router.put('/sms-templates/:id', authenticate, async (req, res, next) => {
  try {
    const { name, body, is_default } = req.body;
    const fields = []; const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (body !== undefined) { fields.push('body = ?'); values.push(body); }
    if (is_default !== undefined) { fields.push('is_default = ?'); values.push(is_default ? 1 : 0); }
    if (fields.length) await pool.query(`UPDATE sms_template SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/sms-templates/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE sms_template SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/notifications/sessions
// Returns one row per professor per session (lead + assistant as separate rows)
// ═══════════════════════════════════════════════════════════════
router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const { date, type = 'class' } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    if (type === 'class') {
      // Get all sessions for date with lead + assistant info
      const [rows] = await pool.query(
        `SELECT s.id AS session_id, s.session_date, s.session_time, s.specific_notes,
                s.professor_id, s.assistant_id,
                s.notification_sent, s.notification_sent_at,
                prog.id AS program_id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
                prog.number_enrolled, prog.lead_professor_id, prog.assistant_professor_id,
                lp.professor_nickname AS lead_professor_name, lp.phone_number AS lead_phone,
                ap.professor_nickname AS assistant_professor_name, ap.phone_number AS assistant_phone,
                loc.nickname AS location_nickname, loc.address, loc.point_of_contact, loc.poc_phone,
                ct.class_type_name, l.lesson_name,
                COALESCE(ga_lp.geographic_area_name, ga_loc.geographic_area_name) AS lead_area,
                COALESCE(ga_ap.geographic_area_name, ga_loc.geographic_area_name) AS assist_area,
                COALESCE(CONCAT(sc_lp.first_name, ' ', sc_lp.last_name), CONCAT(sc_loc.first_name, ' ', sc_loc.last_name)) AS lead_coordinator,
                COALESCE(CONCAT(sc_ap.first_name, ' ', sc_ap.last_name), CONCAT(sc_loc.first_name, ' ', sc_loc.last_name)) AS assist_coordinator
         FROM session s
         JOIN program prog ON prog.id = s.program_id AND prog.active = 1
         LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
         LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id
         LEFT JOIN class_status cs ON cs.id = prog.class_status_id
         LEFT JOIN location loc ON loc.id = prog.location_id
         LEFT JOIN class cl ON cl.id = prog.class_id
         LEFT JOIN class_type ct ON ct.id = cl.class_type_id
         LEFT JOIN lesson l ON l.id = s.lesson_id
         LEFT JOIN geographic_area ga_lp ON ga_lp.id = lp.geographic_area_id
         LEFT JOIN geographic_area ga_ap ON ga_ap.id = ap.geographic_area_id
         LEFT JOIN geographic_area ga_loc ON ga_loc.id = loc.geographic_area_id_online
         LEFT JOIN user sc_lp ON sc_lp.id = lp.scheduling_coordinator_owner_id
         LEFT JOIN user sc_ap ON sc_ap.id = ap.scheduling_coordinator_owner_id
         LEFT JOIN user sc_loc ON sc_loc.id = ga_loc.scheduling_coordinator_user_id
         WHERE s.active = 1 AND s.session_date = ?
           AND cs.class_status_name NOT LIKE 'Cancelled%'
         ORDER BY ga_lp.geographic_area_name, prog.program_nickname, s.session_time`,
        [targetDate]
      );

      // Flatten: one row per professor (lead row + optional assistant row)
      // Count reminders per professor
      const profCount = {};
      rows.forEach(r => {
        if (r.lead_professor_id) { profCount[r.lead_professor_id] = (profCount[r.lead_professor_id] || 0) + 1; }
        if (r.assistant_professor_id) { profCount[r.assistant_professor_id] = (profCount[r.assistant_professor_id] || 0) + 1; }
      });
      const profIdx = {};

      const flat = [];
      for (const r of rows) {
        // Lead professor row
        if (r.lead_professor_id && r.lead_professor_name) {
          profIdx[r.lead_professor_id] = (profIdx[r.lead_professor_id] || 0) + 1;
          flat.push({
            ...r,
            row_key: `${r.session_id}-lead`,
            role: 'lead',
            template_category: 'class_lead',
            professor_id: r.lead_professor_id,
            professor_nickname: r.lead_professor_name,
            phone_number: r.lead_phone,
            phone_formatted: normalizePhone(r.lead_phone),
            geographic_area_name: r.lead_area,
            coordinator_name: r.lead_coordinator,
            _reminder_number: String(profIdx[r.lead_professor_id]),
            _total_reminders: String(profCount[r.lead_professor_id]),
          });
        }
        // Assistant professor row
        if (r.assistant_professor_id && r.assistant_professor_name) {
          profIdx[r.assistant_professor_id] = (profIdx[r.assistant_professor_id] || 0) + 1;
          flat.push({
            ...r,
            row_key: `${r.session_id}-assist`,
            role: 'assistant',
            template_category: 'class_assistant',
            professor_id: r.assistant_professor_id,
            professor_nickname: r.assistant_professor_name,
            phone_number: r.assistant_phone,
            phone_formatted: normalizePhone(r.assistant_phone),
            geographic_area_name: r.assist_area,
            coordinator_name: r.assist_coordinator,
            _reminder_number: String(profIdx[r.assistant_professor_id]),
            _total_reminders: String(profCount[r.assistant_professor_id]),
          });
        }
      }

      // Attach notification log status
      if (flat.length > 0) {
        const sessionIds = [...new Set(flat.map(r => r.session_id))];
        const [logs] = await pool.query(
          `SELECT id, session_id, professor_id, send_status, confirm_status, sent_at
           FROM notification_log
           WHERE notification_date = ? AND notification_type IN ('class','class_lead','class_assistant') AND active = 1
             AND session_id IN (${sessionIds.map(() => '?').join(',')})`,
          [targetDate, ...sessionIds]
        );
        const logMap = {};
        logs.forEach(l => { logMap[`${l.session_id}-${l.professor_id}`] = l; });
        flat.forEach(r => {
          const log = logMap[`${r.session_id}-${r.professor_id}`];
          r.notif_log_id = log?.id || null;
          r.send_status = log?.send_status || null;
          r.confirm_status = log?.confirm_status || null;
          r.notif_sent_at = log?.sent_at || null;
        });
      }

      return res.json({ success: true, data: flat });
    }

    if (type === 'party') {
      const [rows] = await pool.query(
        `SELECT prog.id AS program_id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
                prog.number_enrolled, prog.contact_name, prog.contact_phone, prog.child_name, prog.child_age,
                s.id AS session_id, s.session_date,
                s.professor_id,
                p.professor_nickname, p.phone_number,
                loc.address,
                pf.party_format_name,
                ga.geographic_area_name,
                CONCAT(sc.first_name, ' ', sc.last_name) AS coordinator_name
         FROM session s
         JOIN program prog ON prog.id = s.program_id AND prog.active = 1
         JOIN class cl ON cl.id = prog.class_id
         JOIN program_type pt ON pt.id = cl.program_type_id AND pt.program_type_name = 'Party'
         JOIN professor p ON p.id = s.professor_id
         LEFT JOIN location loc ON loc.id = prog.location_id
         LEFT JOIN party_format pf ON pf.id = prog.party_format_id
         LEFT JOIN class_status cs ON cs.id = prog.class_status_id
         LEFT JOIN geographic_area ga ON ga.id = p.geographic_area_id
         LEFT JOIN user sc ON sc.id = p.scheduling_coordinator_owner_id
         WHERE s.active = 1 AND s.session_date = ?
           AND cs.class_status_name NOT LIKE 'Cancelled%'
         ORDER BY prog.program_nickname`,
        [targetDate]
      );
      // Attach log
      const enriched = [];
      for (const r of rows) {
        const [[log]] = await pool.query(
          `SELECT id, send_status, confirm_status, sent_at FROM notification_log
           WHERE session_id = ? AND professor_id = ? AND notification_date = ? AND notification_type = 'party' AND active = 1
           ORDER BY id DESC LIMIT 1`,
          [r.session_id, r.professor_id, targetDate]
        );
        enriched.push({
          ...r,
          row_key: `${r.session_id}-party`,
          role: 'lead',
          template_category: 'party_lead',
          phone_formatted: normalizePhone(r.phone_number),
          lead_professor_name: r.professor_nickname,
          send_status: log?.send_status || null,
          confirm_status: log?.confirm_status || null,
          notif_sent_at: log?.sent_at || null,
        });
      }
      return res.json({ success: true, data: enriched });
    }

    if (type === 'observation') {
      const [rows] = await pool.query(
        `SELECT po.id AS observation_id, po.professor_id, po.program_id, po.observation_date AS session_date,
                po.observation_type, po.status AS obs_status,
                p.professor_nickname, p.phone_number,
                prog.program_nickname, prog.start_time, prog.class_length_minutes,
                loc.address,
                ct.class_type_name,
                lp.professor_nickname AS lead_professor_name, lp.phone_number AS lead_phone,
                ga.geographic_area_name,
                CONCAT(sc.first_name, ' ', sc.last_name) AS coordinator_name
         FROM professor_observation po
         JOIN professor p ON p.id = po.professor_id
         JOIN program prog ON prog.id = po.program_id AND prog.active = 1
         LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
         LEFT JOIN location loc ON loc.id = prog.location_id
         LEFT JOIN class cl ON cl.id = prog.class_id
         LEFT JOIN class_type ct ON ct.id = cl.class_type_id
         LEFT JOIN geographic_area ga ON ga.id = p.geographic_area_id
         LEFT JOIN user sc ON sc.id = p.scheduling_coordinator_owner_id
         WHERE po.active = 1 AND po.observation_date = ?
           AND po.status != 'deleted'
         ORDER BY prog.program_nickname`,
        [targetDate]
      );
      const enriched = [];
      for (const r of rows) {
        const [[log]] = await pool.query(
          `SELECT id, send_status, confirm_status, sent_at FROM notification_log
           WHERE professor_id = ? AND notification_date = ? AND notification_type = 'observation' AND active = 1
           ORDER BY id DESC LIMIT 1`,
          [r.professor_id, targetDate]
        );
        enriched.push({
          ...r,
          row_key: `obs-${r.observation_id}`,
          session_id: null,
          role: 'observer',
          template_category: 'observation',
          phone_formatted: normalizePhone(r.phone_number),
          send_status: log?.send_status || null,
          confirm_status: log?.confirm_status || null,
          notif_sent_at: log?.sent_at || null,
        });
      }
      return res.json({ success: true, data: enriched });
    }

    res.json({ success: true, data: [] });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/notifications/send — bulk send SMS
// ═══════════════════════════════════════════════════════════════
router.post('/send', authenticate, async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No items to send' });
    }

    // Check if sending is disabled
    const [[sendingSetting]] = await pool.query("SELECT setting_value FROM app_setting WHERE setting_key = 'sms_sending_enabled'");
    const sendingEnabled = !sendingSetting || sendingSetting.setting_value !== 'false';
    if (!sendingEnabled) {
      return res.status(400).json({ success: false, error: 'SMS sending is currently disabled by admin' });
    }

    const validTypes = new Set(['class', 'party', 'observation', 'party_observation', 'custom']);
    const typeMap = { class_lead: 'class', class_assistant: 'class', party_lead: 'party', party_assistant: 'party' };
    const results = [];
    for (const item of items) {
      const phone = normalizePhone(item.phone);
      if (!phone) { results.push({ ...item, status: 'failed', error: 'Invalid phone' }); continue; }
      const dbType = validTypes.has(item.type) ? item.type : (typeMap[item.type] || 'class');

      try {
        const { sid } = await sendSms(phone, item.message);
        await pool.query(
          `INSERT INTO notification_log
           (notification_type, professor_id, session_id, phone_number, message_body,
            twilio_sid, send_status, notification_date, sent_at, sent_by)
           VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, NOW(), ?)`,
          [dbType, item.professor_id, item.session_id || null,
           phone, item.message, sid, item.notification_date || new Date().toISOString().split('T')[0],
           req.user.userId]
        );
        if (item.session_id) {
          await pool.query('UPDATE session SET notification_sent = 1, notification_sent_at = NOW() WHERE id = ?', [item.session_id]);
        }
        results.push({ ...item, status: 'sent', twilio_sid: sid });
      } catch (err) {
        await pool.query(
          `INSERT INTO notification_log
           (notification_type, professor_id, session_id, phone_number, message_body,
            send_status, notification_date, sent_by)
           VALUES (?, ?, ?, ?, ?, 'failed', ?, ?)`,
          [dbType, item.professor_id, item.session_id || null,
           phone, item.message, item.notification_date || new Date().toISOString().split('T')[0],
           req.user.userId]
        );
        results.push({ ...item, status: 'failed', error: err.message });
      }
    }
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/notifications/send-custom
// ═══════════════════════════════════════════════════════════════
router.post('/send-custom', authenticate, async (req, res, next) => {
  try {
    const { professor_id, phone, message } = req.body;
    const normalized = normalizePhone(phone);
    if (!normalized) return res.status(400).json({ success: false, error: 'Invalid phone number' });
    if (!message) return res.status(400).json({ success: false, error: 'Message is required' });
    const { sid } = await sendSms(normalized, message);
    await pool.query(
      `INSERT INTO notification_log (notification_type, professor_id, phone_number, message_body, twilio_sid, send_status, notification_date, sent_at, sent_by)
       VALUES ('custom', ?, ?, ?, ?, 'sent', CURDATE(), NOW(), ?)`,
      [professor_id || null, normalized, message, sid, req.user.userId]
    );
    res.json({ success: true, data: { sid, status: 'sent' } });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/notifications/confirm/:sessionId — manual confirm/unconfirm
// ═══════════════════════════════════════════════════════════════
router.post('/confirm/:sessionId', authenticate, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { confirmed, date, type = 'class', professor_id } = req.body;
    const targetDate = date || new Date().toISOString().split('T')[0];
    // Normalize type to valid enum values
    const validTypes = new Set(['class', 'party', 'observation', 'party_observation', 'custom']);
    const typeMap = { class_lead: 'class', class_assistant: 'class', party_lead: 'party', party_assistant: 'party' };
    const dbType = validTypes.has(type) ? type : (typeMap[type] || 'class');

    const [[existing]] = await pool.query(
      `SELECT id FROM notification_log WHERE session_id = ? AND professor_id = ? AND notification_date = ? AND active = 1 ORDER BY id DESC LIMIT 1`,
      [sessionId, professor_id, targetDate]
    );
    if (existing) {
      await pool.query(
        `UPDATE notification_log SET confirm_status = ?, confirmed_at = ${confirmed ? 'NOW()' : 'NULL'} WHERE id = ?`,
        [confirmed ? 'confirmed' : 'unconfirmed', existing.id]
      );
    } else {
      await pool.query(
        `INSERT INTO notification_log (notification_type, professor_id, session_id, phone_number, message_body, send_status, confirm_status, confirmed_at, notification_date, sent_by)
         VALUES (?, ?, ?, '', 'Manual confirmation', 'pending', ?, ${confirmed ? 'NOW()' : 'NULL'}, ?, ?)`,
        [dbType, professor_id, sessionId, confirmed ? 'confirmed' : 'unconfirmed', targetDate, req.user.userId]
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Confirm for observations (no session_id)
router.post('/confirm-observation/:observationId', authenticate, async (req, res, next) => {
  try {
    const { observationId } = req.params;
    const { confirmed, date, professor_id } = req.body;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const [[existing]] = await pool.query(
      `SELECT id FROM notification_log WHERE professor_id = ? AND notification_date = ? AND notification_type = 'observation' AND active = 1 ORDER BY id DESC LIMIT 1`,
      [professor_id, targetDate]
    );
    if (existing) {
      await pool.query(
        `UPDATE notification_log SET confirm_status = ?, confirmed_at = ${confirmed ? 'NOW()' : 'NULL'} WHERE id = ?`,
        [confirmed ? 'confirmed' : 'unconfirmed', existing.id]
      );
    } else {
      await pool.query(
        `INSERT INTO notification_log (notification_type, professor_id, phone_number, message_body, send_status, confirm_status, confirmed_at, notification_date, sent_by)
         VALUES ('observation', ?, '', 'Manual confirmation', 'pending', ?, ${confirmed ? 'NOW()' : 'NULL'}, ?, ?)`,
        [professor_id, confirmed ? 'confirmed' : 'unconfirmed', targetDate, req.user.userId]
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/notifications/process-responses — check Twilio inbound and auto-match
// ═══════════════════════════════════════════════════════════════
router.post('/process-responses', authenticate, async (req, res, next) => {
  try {
    const messages = await getInboundMessages(200);
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // last 24 hours

    // Load confirm phrases from DB (or use defaults)
    const [phraseRows] = await pool.query("SELECT setting_value FROM app_setting WHERE setting_key = 'confirm_phrases'");
    let confirmPhrases = ['yes', 'yes!', 'yes.', 'yep', 'yeah', 'yea', 'confirmed', 'confirm', 'y', 'yes to all', 'yes to both', 'yup', 'si', 'ok', 'okay'];
    if (phraseRows.length > 0 && phraseRows[0].setting_value) {
      try { confirmPhrases = JSON.parse(phraseRows[0].setting_value); } catch (e) {}
    }
    const confirmSet = new Set(confirmPhrases.map(p => p.toLowerCase().trim()));

    // Build phone → professor map
    const [professors] = await pool.query(
      'SELECT id, phone_number, professor_nickname FROM professor WHERE active = 1 AND phone_number IS NOT NULL'
    );
    const phoneMap = {};
    professors.forEach(p => { const n = normalizePhone(p.phone_number); if (n) phoneMap[n] = p; });

    // Already-processed SIDs (avoid duplicates)
    const [existingSids] = await pool.query(
      "SELECT DISTINCT response_sid FROM twilio_response WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)"
    );
    const processedSids = new Set(existingSids.map(r => r.response_sid));

    const results = [];
    for (const msg of messages) {
      if (!msg.dateSent || new Date(msg.dateSent) < cutoff) continue;
      if (processedSids.has(msg.sid)) continue;

      const professor = phoneMap[msg.from];
      const bodyNorm = (msg.body || '').trim().toLowerCase();
      const isConfirm = confirmSet.has(bodyNorm);
      const profName = professor?.professor_nickname || null;
      const profId = professor?.id || null;

      let matchStatus = 'unknown_sender';
      let matchedCount = 0;

      if (professor) {
        if (isConfirm) {
          // Find outstanding unconfirmed notifications for this professor (today or upcoming)
          const [logs] = await pool.query(
            `SELECT id, notification_date FROM notification_log
             WHERE professor_id = ? AND active = 1
             AND (confirm_status IS NULL OR confirm_status = 'unconfirmed')
             AND send_status = 'sent'
             AND notification_date >= CURDATE()
             ORDER BY notification_date ASC`,
            [profId]
          );
          if (logs.length > 0) {
            let actualConfirmed = 0;
            for (const log of logs) {
              // Double-check it's still unconfirmed (another message in this batch may have already confirmed it)
              const [[check]] = await pool.query(
                "SELECT confirm_status FROM notification_log WHERE id = ? AND (confirm_status IS NULL OR confirm_status = 'unconfirmed')",
                [log.id]
              );
              if (check) {
                await pool.query(
                  "UPDATE notification_log SET confirm_status = 'confirmed', confirmed_at = NOW(), response_message = ? WHERE id = ?",
                  [msg.body, log.id]
                );
                actualConfirmed++;
              }
            }
            matchStatus = actualConfirmed > 0 ? 'confirmed' : 'no_outstanding';
            matchedCount = actualConfirmed;
          } else {
            matchStatus = 'no_outstanding';
          }
        } else {
          matchStatus = 'unrecognized_response';
        }
      }

      // Store all responses
      await pool.query(
        `INSERT INTO twilio_response (twilio_sid, response_sid, from_phone, professor_id, professor_name, body, match_status, matched_count, received_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [msg.sid, msg.sid, msg.from, profId, profName, msg.body, matchStatus, matchedCount, msg.dateSent]
      );

      results.push({ sid: msg.sid, professor: profName, from: msg.from, body: msg.body, status: matchStatus, count: matchedCount });
    }

    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// GET /api/notifications/responses — recent Twilio responses (last 24h)
router.get('/responses', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM twilio_response WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY received_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/notifications/sending-enabled
router.get('/sending-enabled', authenticate, async (req, res, next) => {
  try {
    const [[row]] = await pool.query("SELECT setting_value FROM app_setting WHERE setting_key = 'sms_sending_enabled'");
    res.json({ success: true, enabled: !row || row.setting_value !== 'false' });
  } catch (err) { next(err); }
});

// PUT /api/notifications/sending-enabled
router.put('/sending-enabled', authenticate, async (req, res, next) => {
  try {
    const { enabled } = req.body;
    await pool.query(
      "INSERT INTO app_setting (setting_key, setting_value) VALUES ('sms_sending_enabled', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [enabled ? 'true' : 'false', enabled ? 'true' : 'false']
    );
    res.json({ success: true, enabled });
  } catch (err) { next(err); }
});

// GET /api/notifications/confirm-phrases — get custom confirm phrases
router.get('/confirm-phrases', authenticate, async (req, res, next) => {
  try {
    const [[row]] = await pool.query("SELECT setting_value FROM app_setting WHERE setting_key = 'confirm_phrases'");
    const phrases = row?.setting_value ? JSON.parse(row.setting_value) : ['yes', 'yes!', 'yep', 'yeah', 'yea', 'confirmed', 'confirm', 'y', 'yes to all', 'yes to both', 'yup', 'ok', 'okay'];
    res.json({ success: true, data: phrases });
  } catch (err) { next(err); }
});

// PUT /api/notifications/confirm-phrases — update confirm phrases
router.put('/confirm-phrases', authenticate, async (req, res, next) => {
  try {
    const { phrases } = req.body;
    if (!Array.isArray(phrases)) return res.status(400).json({ success: false, error: 'phrases array required' });
    await pool.query(
      "INSERT INTO app_setting (setting_key, setting_value) VALUES ('confirm_phrases', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [JSON.stringify(phrases), JSON.stringify(phrases)]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/notifications/unconfirmed
// ═══════════════════════════════════════════════════════════════
router.get('/unconfirmed', authenticate, async (req, res, next) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const [rows] = await pool.query(
      `SELECT s.id AS session_id, s.session_time, s.notification_sent,
              prog.program_nickname, prog.start_time, prog.lead_professor_id,
              lp.professor_nickname, lp.phone_number,
              ga.geographic_area_name,
              CONCAT(sc.first_name, ' ', sc.last_name) AS coordinator_name,
              nl.confirm_status
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN geographic_area ga ON ga.id = lp.geographic_area_id
       LEFT JOIN user sc ON sc.id = lp.scheduling_coordinator_owner_id
       JOIN notification_log nl ON nl.session_id = s.id AND nl.professor_id = lp.id
         AND nl.notification_date = ? AND nl.active = 1 AND nl.send_status = 'sent'
       WHERE s.active = 1 AND s.session_date = ?
         AND (nl.confirm_status IS NULL OR nl.confirm_status = 'unconfirmed')
         AND cs.class_status_name NOT LIKE 'Cancelled%'
       ORDER BY s.session_time ASC`,
      [targetDate, targetDate]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/notifications/log
// ═══════════════════════════════════════════════════════════════
router.get('/log', authenticate, async (req, res, next) => {
  try {
    const { date, type } = req.query;
    let where = 'nl.active = 1';
    const params = [];
    if (date) { where += ' AND nl.notification_date = ?'; params.push(date); }
    if (type) { where += ' AND nl.notification_type = ?'; params.push(type); }
    const [rows] = await pool.query(
      `SELECT nl.*, p.professor_nickname, u.first_name AS sent_by_name
       FROM notification_log nl
       LEFT JOIN professor p ON p.id = nl.professor_id
       LEFT JOIN user u ON u.id = nl.sent_by
       WHERE ${where} ORDER BY nl.sent_at DESC LIMIT 500`, params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
