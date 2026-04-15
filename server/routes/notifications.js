const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { sendSms, getInboundMessages, normalizePhone, isConfirmResponse } = require('../lib/twilio');

// ═══════════════════════════════════════════════════════════════
// HELPERS — message generation
// ═══════════════════════════════════════════════════════════════

function formatTime12(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatEndTime(startTime, lengthMinutes) {
  if (!startTime || !lengthMinutes) return '';
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + lengthMinutes;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  const ampm = eh >= 12 ? 'PM' : 'AM';
  const h12 = eh % 12 || 12;
  return `${h12}:${String(em).padStart(2, '0')} ${ampm}`;
}

function arrivalTime(startTime, minutesBefore = 10) {
  if (!startTime) return '';
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m - minutesBefore;
  const ah = Math.floor(total / 60) % 24;
  const am = total % 60;
  const ampm = ah >= 12 ? 'PM' : 'AM';
  const h12 = ah % 12 || 12;
  return `${h12}:${String(am).padStart(2, '0')} ${ampm}`;
}

function dayName(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function shortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function buildClassMessage(s, index, total) {
  const start = formatTime12(s.start_time || s.session_time);
  const end = formatEndTime(s.start_time || s.session_time, s.class_length_minutes);
  const arrival = arrivalTime(s.start_time || s.session_time);
  const date = s.session_date ? s.session_date.split('T')[0] : '';

  let msg = `Reminder ${index} of ${total} - you have the following class on ${dayName(date)} ${shortDate(date)}:\n\n`;
  msg += `Class Name: ${s.program_nickname}\n`;
  if (s.point_of_contact) msg += `Contact: ${s.point_of_contact}${s.poc_phone ? ' - ' + s.poc_phone : ''}\n`;
  if (s.address) msg += `Address: ${s.address}\n`;
  msg += `Arrival Time: ${arrival} | Time: ${start}-${end}\n`;
  if (s.class_type_name) msg += `Class Type: Live Class - ${s.class_type_name}\n`;
  if (s.lesson_name) msg += `Lesson: ${s.lesson_name}\n`;
  if (s.number_enrolled) msg += `\nNumber of Students - ${s.number_enrolled}. `;
  msg += `For roster and info, check your schedule.\nHave fun!\nPlease reply Yes to All to confirm.\n`;
  if (s.specific_notes) msg += `\nNotes: ${s.specific_notes}\n`;
  return msg;
}

function buildPartyMessage(p) {
  const start = formatTime12(p.start_time);
  const end = formatEndTime(p.start_time, p.class_length_minutes);
  const arrival = arrivalTime(p.start_time, 20);
  const date = p.party_date ? p.party_date.split('T')[0] : '';

  let msg = `Please confirm your party for the below information. You should have all materials for this party and be invited on the calendar invitation. If for any reason you did not receive materials, call us immediately at 818-856-3996.\n\n`;
  msg += `Nickname: ${p.program_nickname}\n`;
  if (p.party_format_name) msg += `Event type: ${p.party_format_name}\n`;
  msg += `Date: ${shortDate(date)}\n`;
  msg += `LATEST Arrival Time: ${arrival}\n`;
  msg += `Party Start Time: ${start}\n`;
  msg += `End Time: ${end}\n`;
  if (p.address) msg += `Address: ${p.address}\n`;
  if (p.child_name) msg += `Child Info: ${p.child_name}${p.child_age ? ' turning ' + p.child_age : ''}\n`;
  if (p.contact_name) msg += `If you're running late, please be sure to let the party contact know: ${p.contact_name}${p.contact_phone ? ' - ' + p.contact_phone : ''}\n`;
  return msg;
}

function buildObserveMessage(o) {
  const start = formatTime12(o.start_time);
  const end = formatEndTime(o.start_time, o.class_length_minutes);
  const date = o.observation_date ? o.observation_date.split('T')[0] : '';

  let msg = `Reminder - you have the following observation on ${dayName(date)} ${shortDate(date)}:\n\n`;
  msg += `Class Name: ${o.program_nickname}\n`;
  if (o.lead_professor_name) msg += `Lead Professor: ${o.lead_professor_name}\n`;
  if (o.lead_phone) msg += `Professor Phone Number: ${o.lead_phone}\n`;
  if (o.address) msg += `Address: ${o.address}\n`;
  msg += `Time: ${start}-${end}\n`;
  if (o.class_type_name) msg += `Class Type: Live Class - ${o.class_type_name}\n`;
  if (o.lesson_name) msg += `Lesson: ${o.lesson_name}\n`;
  msg += `\nHave fun!\nPlease text 818-856-3996 with any issues you encounter.\n`;
  return msg;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/notifications/sessions — sessions needing notification for a date
// ═══════════════════════════════════════════════════════════════
router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const { date, type = 'class' } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    if (type === 'class') {
      const [rows] = await pool.query(
        `SELECT s.id AS session_id, s.session_date, s.session_time, s.specific_notes,
                s.professor_confirmed, s.professor_confirmed_at,
                s.notification_sent, s.notification_sent_at,
                s.professor_id, s.assistant_id,
                p.professor_nickname, p.phone_number, p.first_name, p.last_name,
                prog.id AS program_id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
                prog.number_enrolled, prog.lead_professor_id, prog.assistant_professor_id,
                lp.professor_nickname AS lead_professor_name, lp.phone_number AS lead_phone,
                ap.professor_nickname AS assistant_professor_name, ap.phone_number AS assistant_phone,
                loc.nickname AS location_nickname, loc.address, loc.point_of_contact, loc.poc_phone,
                ct.class_type_name, l.lesson_name,
                ga.geographic_area_name,
                CONCAT(sc.first_name, ' ', sc.last_name) AS coordinator_name,
                nl.id AS notification_log_id, nl.send_status, nl.confirm_status AS notif_confirm_status,
                nl.sent_at AS notif_sent_at
         FROM session s
         JOIN program prog ON prog.id = s.program_id AND prog.active = 1
         JOIN professor p ON p.id = s.professor_id
         LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
         LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id
         LEFT JOIN class_status cs ON cs.id = prog.class_status_id
         LEFT JOIN location loc ON loc.id = prog.location_id
         LEFT JOIN class cl ON cl.id = prog.class_id
         LEFT JOIN class_type ct ON ct.id = cl.class_type_id
         LEFT JOIN lesson l ON l.id = s.lesson_id
         LEFT JOIN geographic_area ga ON ga.id = p.geographic_area_id
         LEFT JOIN user sc ON sc.id = p.scheduling_coordinator_owner_id
         LEFT JOIN notification_log nl ON nl.session_id = s.id AND nl.notification_type = 'class'
           AND nl.notification_date = ? AND nl.active = 1
         WHERE s.active = 1 AND s.session_date = ?
           AND cs.class_status_name NOT LIKE 'Cancelled%'
         ORDER BY ga.geographic_area_name, prog.program_nickname, s.session_time`,
        [targetDate, targetDate]
      );
      // Generate messages for each
      const profSessions = {};
      rows.forEach(r => {
        const key = r.professor_id;
        if (!profSessions[key]) profSessions[key] = [];
        profSessions[key].push(r);
      });
      const enriched = rows.map(r => {
        const ps = profSessions[r.professor_id];
        const idx = ps.indexOf(r) + 1;
        return {
          ...r,
          phone_formatted: normalizePhone(r.phone_number),
          generated_message: buildClassMessage(r, idx, ps.length),
        };
      });
      return res.json({ success: true, data: enriched });
    }

    if (type === 'party') {
      const [rows] = await pool.query(
        `SELECT prog.id AS program_id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
                prog.number_enrolled,
                prog.contact_name, prog.contact_phone, prog.child_name, prog.child_age,
                s.id AS session_id, s.session_date AS party_date,
                s.professor_id, s.professor_confirmed, s.professor_confirmed_at,
                s.notification_sent, s.notification_sent_at,
                p.professor_nickname, p.phone_number,
                loc.address,
                pf.party_format_name,
                nl.id AS notification_log_id, nl.send_status, nl.confirm_status AS notif_confirm_status
         FROM session s
         JOIN program prog ON prog.id = s.program_id AND prog.active = 1
         JOIN class cl ON cl.id = prog.class_id
         JOIN program_type pt ON pt.id = cl.program_type_id AND pt.program_type_name = 'Party'
         JOIN professor p ON p.id = s.professor_id
         LEFT JOIN location loc ON loc.id = prog.location_id
         LEFT JOIN party_format pf ON pf.id = prog.party_format_id
         LEFT JOIN class_status cs ON cs.id = prog.class_status_id
         LEFT JOIN notification_log nl ON nl.session_id = s.id AND nl.notification_type = 'party'
           AND nl.notification_date = ? AND nl.active = 1
         WHERE s.active = 1 AND s.session_date = ?
           AND cs.class_status_name NOT LIKE 'Cancelled%'
         ORDER BY prog.program_nickname`,
        [targetDate, targetDate]
      );
      const enriched = rows.map(r => ({
        ...r,
        phone_formatted: normalizePhone(r.phone_number),
        generated_message: buildPartyMessage(r),
      }));
      return res.json({ success: true, data: enriched });
    }

    if (type === 'observation') {
      const [rows] = await pool.query(
        `SELECT po.id AS observation_id, po.professor_id, po.program_id, po.observation_date,
                po.observation_type, po.status AS obs_status,
                p.professor_nickname, p.phone_number,
                prog.program_nickname, prog.start_time, prog.class_length_minutes,
                loc.address,
                ct.class_type_name,
                lp.professor_nickname AS lead_professor_name, lp.phone_number AS lead_phone,
                nl.id AS notification_log_id, nl.send_status, nl.confirm_status AS notif_confirm_status
         FROM professor_observation po
         JOIN professor p ON p.id = po.professor_id
         JOIN program prog ON prog.id = po.program_id AND prog.active = 1
         LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
         LEFT JOIN location loc ON loc.id = prog.location_id
         LEFT JOIN class cl ON cl.id = prog.class_id
         LEFT JOIN class_type ct ON ct.id = cl.class_type_id
         LEFT JOIN notification_log nl ON nl.professor_id = po.professor_id AND nl.notification_type = 'observation'
           AND nl.notification_date = ? AND nl.active = 1
         WHERE po.active = 1 AND po.observation_date = ?
           AND po.status != 'deleted'
         ORDER BY prog.program_nickname`,
        [targetDate, targetDate]
      );
      // Get lesson from session on that date if exists
      const enriched = rows.map(r => ({
        ...r,
        phone_formatted: normalizePhone(r.phone_number),
        generated_message: buildObserveMessage(r),
      }));
      return res.json({ success: true, data: enriched });
    }

    res.json({ success: true, data: [] });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/notifications/send — send notifications for selected items
// ═══════════════════════════════════════════════════════════════
router.post('/send', authenticate, async (req, res, next) => {
  try {
    const { items } = req.body;
    // items: [{ session_id, professor_id, phone, message, type, observation_id? }]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No items to send' });
    }

    const results = [];
    for (const item of items) {
      const phone = normalizePhone(item.phone);
      if (!phone) {
        results.push({ ...item, status: 'failed', error: 'Invalid phone number' });
        continue;
      }

      try {
        const { sid, status } = await sendSms(phone, item.message);

        // Log to notification_log
        await pool.query(
          `INSERT INTO notification_log
           (notification_type, professor_id, session_id, phone_number, message_body,
            twilio_sid, send_status, notification_date, sent_at, sent_by)
           VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, NOW(), ?)`,
          [item.type || 'class', item.professor_id, item.session_id || null,
           phone, item.message, sid, item.notification_date || new Date().toISOString().split('T')[0],
           req.user.userId]
        );

        // Mark session as notified
        if (item.session_id) {
          await pool.query(
            'UPDATE session SET notification_sent = 1, notification_sent_at = NOW() WHERE id = ?',
            [item.session_id]
          );
        }

        results.push({ ...item, status: 'sent', twilio_sid: sid });
      } catch (err) {
        // Log failure
        await pool.query(
          `INSERT INTO notification_log
           (notification_type, professor_id, session_id, phone_number, message_body,
            send_status, notification_date, sent_by)
           VALUES (?, ?, ?, ?, ?, 'failed', ?, ?)`,
          [item.type || 'class', item.professor_id, item.session_id || null,
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
// POST /api/notifications/send-custom — send a custom message to a professor
// ═══════════════════════════════════════════════════════════════
router.post('/send-custom', authenticate, async (req, res, next) => {
  try {
    const { professor_id, phone, message } = req.body;
    const normalized = normalizePhone(phone);
    if (!normalized) return res.status(400).json({ success: false, error: 'Invalid phone number' });
    if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

    const { sid } = await sendSms(normalized, message);

    await pool.query(
      `INSERT INTO notification_log
       (notification_type, professor_id, phone_number, message_body,
        twilio_sid, send_status, notification_date, sent_at, sent_by)
       VALUES ('custom', ?, ?, ?, ?, 'sent', CURDATE(), NOW(), ?)`,
      [professor_id || null, normalized, message, sid, req.user.userId]
    );

    res.json({ success: true, data: { sid, status: 'sent' } });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/notifications/confirm/:sessionId — manually confirm/unconfirm for daily notification
// ═══════════════════════════════════════════════════════════════
router.post('/confirm/:sessionId', authenticate, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { confirmed, date, type = 'class', professor_id } = req.body;
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Check if a notification_log row exists for this session+date
    const [[existing]] = await pool.query(
      `SELECT id FROM notification_log WHERE session_id = ? AND notification_date = ? AND notification_type = ? AND active = 1 ORDER BY id DESC LIMIT 1`,
      [sessionId, targetDate, type]
    );

    if (existing) {
      await pool.query(
        `UPDATE notification_log SET confirm_status = ?, confirmed_at = ${confirmed ? 'NOW()' : 'NULL'} WHERE id = ?`,
        [confirmed ? 'confirmed' : 'unconfirmed', existing.id]
      );
    } else {
      // Create a log entry for manual confirm (no SMS sent)
      await pool.query(
        `INSERT INTO notification_log (notification_type, professor_id, session_id, phone_number, message_body, send_status, confirm_status, confirmed_at, notification_date, sent_by)
         VALUES (?, ?, ?, '', 'Manual confirmation', 'pending', ?, ${confirmed ? 'NOW()' : 'NULL'}, ?, ?)`,
        [type, professor_id || null, sessionId, confirmed ? 'confirmed' : 'unconfirmed', targetDate, req.user.userId]
      );
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/notifications/process-responses — poll Twilio for inbound replies, auto-confirm
// ═══════════════════════════════════════════════════════════════
router.post('/process-responses', authenticate, async (req, res, next) => {
  try {
    const messages = await getInboundMessages(200);
    const today = new Date().toISOString().split('T')[0];

    // Get all professors with phone numbers
    const [professors] = await pool.query(
      'SELECT id, phone_number, professor_nickname FROM professor WHERE active = 1 AND phone_number IS NOT NULL'
    );
    const phoneMap = {};
    professors.forEach(p => {
      const normalized = normalizePhone(p.phone_number);
      if (normalized) phoneMap[normalized] = p;
    });

    const processed = [];
    for (const msg of messages) {
      // Only process messages from today
      if (!msg.dateSent) continue;
      const msgDate = new Date(msg.dateSent).toISOString().split('T')[0];
      if (msgDate !== today) continue;

      const professor = phoneMap[msg.from];
      if (!professor) continue;

      // Check if already processed (by twilio SID in log)
      const [[existing]] = await pool.query(
        'SELECT id FROM notification_log WHERE response_message = ? AND professor_id = ? AND notification_date = ?',
        [msg.sid, professor.id, today]
      );
      if (existing) continue;

      if (isConfirmResponse(msg.body)) {
        // Auto-confirm all today's notification_log entries for this professor
        const [logs] = await pool.query(
          `SELECT id, session_id FROM notification_log WHERE professor_id = ? AND notification_date = ? AND active = 1 AND confirm_status = 'unconfirmed'`,
          [professor.id, today]
        );

        for (const log of logs) {
          await pool.query(
            `UPDATE notification_log SET confirm_status = 'confirmed', confirmed_at = NOW(), response_message = ? WHERE id = ?`,
            [msg.sid, log.id]
          );
        }

        processed.push({
          professor: professor.professor_nickname,
          from: msg.from,
          body: msg.body,
          status: 'confirmed',
          sessions_confirmed: logs.length,
        });
      } else {
        processed.push({
          professor: professor.professor_nickname,
          from: msg.from,
          body: msg.body,
          status: 'unrecognized',
        });
      }
    }

    res.json({ success: true, data: processed });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/notifications/log — notification history
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
       WHERE ${where}
       ORDER BY nl.sent_at DESC
       LIMIT 500`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/notifications/unconfirmed — warner: unconfirmed sessions approaching
// ═══════════════════════════════════════════════════════════════
router.get('/unconfirmed', authenticate, async (req, res, next) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const [rows] = await pool.query(
      `SELECT s.id AS session_id, s.session_date, s.session_time,
              s.notification_sent,
              p.professor_nickname, p.phone_number,
              prog.program_nickname, prog.start_time,
              ga.geographic_area_name,
              CONCAT(sc.first_name, ' ', sc.last_name) AS coordinator_name,
              nl.confirm_status AS notif_confirm_status
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN professor p ON p.id = s.professor_id
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN geographic_area ga ON ga.id = p.geographic_area_id
       LEFT JOIN user sc ON sc.id = p.scheduling_coordinator_owner_id
       LEFT JOIN notification_log nl ON nl.session_id = s.id AND nl.notification_date = ? AND nl.active = 1
       WHERE s.active = 1 AND s.session_date = ?
         AND (nl.confirm_status IS NULL OR nl.confirm_status = 'unconfirmed')
         AND cs.class_status_name NOT LIKE 'Cancelled%'
       ORDER BY s.session_time ASC`,
      [targetDate, targetDate]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
