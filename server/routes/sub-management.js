const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { checkProfessorConflicts } = require('../lib/scheduleConflict');

router.use(authenticate);

// GET /api/sub-management/needs — sessions needing subs
// Finds future sessions where the lead/assist professor has a day_off but hasn't been replaced
router.get('/needs', async (req, res, next) => {
  try {
    const { area, days = 14, areas } = req.query;
    const daysInt = Math.min(parseInt(days) || 14, 90);

    let areaClauses = [];
    let areaParams = [];
    if (areas) {
      // Comma-separated area IDs
      const ids = areas.split(',').map(Number).filter(Boolean);
      if (ids.length) { areaClauses.push(`ga.id IN (?)`); areaParams.push(ids); }
    } else if (area) {
      areaClauses.push(`ga.id = ?`);
      areaParams.push(area);
    }
    const areaWhere = areaClauses.length ? `AND ${areaClauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT d.id AS day_off_id, d.date_requested, d.notes AS sub_notes, sr.reason_name,
              d.professor_id AS off_professor_id,
              s.id AS session_id, s.session_date, s.session_time,
              s.professor_id AS session_professor_id, s.assistant_id AS session_assistant_id,
              prog.id AS program_id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.lead_professor_id, prog.assistant_professor_id,
              prog.lead_professor_pay, prog.assistant_professor_pay,
              cs.class_status_name,
              loc.id AS location_id, loc.nickname AS location_nickname, loc.school_name, loc.address,
              loc.virtus_required, loc.livescan_required, loc.tb_required,
              ga.id AS area_id, ga.geographic_area_name,
              p.professor_nickname AS off_professor_name, p.last_name AS off_professor_last,
              CASE WHEN prog.lead_professor_id = d.professor_id THEN 'Lead' ELSE 'Assistant' END AS role_needing_sub
       FROM day_off d
       JOIN session s ON s.session_date = d.date_requested AND s.active = 1
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN substitute_reason sr ON sr.id = d.substitute_reason_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       LEFT JOIN professor p ON p.id = d.professor_id
       WHERE d.active = 1
         AND d.date_requested >= CURDATE()
         AND d.date_requested <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND cs.class_status_name NOT LIKE 'Cancelled%'
         AND prog.party_format_id IS NULL
         AND (prog.lead_professor_id = d.professor_id OR prog.assistant_professor_id = d.professor_id)
         AND (
           (prog.lead_professor_id = d.professor_id AND (s.professor_id IS NULL OR s.professor_id = d.professor_id))
           OR
           (prog.assistant_professor_id = d.professor_id AND (s.assistant_id IS NULL OR s.assistant_id = d.professor_id))
         )
         ${areaWhere}
       ORDER BY d.date_requested ASC, s.session_time ASC`,
      [daysInt, ...areaParams]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/sub-management/available-professors — professors who could sub for a given date + area
router.get('/available-professors', async (req, res, next) => {
  try {
    const { date, area_id, search_areas, show_all } = req.query;
    if (!date) return res.status(400).json({ success: false, error: 'Date required' });

    // Determine day of week (MySQL: 1=Sunday...7=Saturday, our weekday table: 1=Monday...7=Sunday)
    const d = new Date(date + 'T12:00:00');
    const jsDay = d.getDay(); // 0=Sun,1=Mon,...6=Sat
    const weekdayId = jsDay === 0 ? 7 : jsDay; // Convert to 1=Mon...7=Sun

    // Area filter
    let areaIds = [];
    if (search_areas) {
      areaIds = search_areas.split(',').map(Number).filter(Boolean);
    } else if (area_id) {
      areaIds = [parseInt(area_id)];
    }

    // Get all active professors (optionally filtered by area)
    let areaWhere = '';
    let areaParams = [];
    if (areaIds.length && show_all !== 'true') {
      areaWhere = 'AND ga.id IN (?)';
      areaParams = [areaIds];
    }

    const [professors] = await pool.query(
      `SELECT p.id, p.professor_nickname, p.last_name, p.email, p.phone_number,
              p.virtus, p.tb_test,
              p.science_trained_id, p.engineering_trained_id,
              p.base_pay,
              ps.professor_status_name,
              ga.id AS area_id, ga.geographic_area_name,
              c.city_name
       FROM professor p
       JOIN professor_status ps ON ps.id = p.professor_status_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN geographic_area ga ON ga.id = p.geographic_area_id
       WHERE p.active = 1
         AND ps.professor_status_name IN ('Active', 'Substitute', 'Training')
         ${areaWhere}
       ORDER BY p.professor_nickname`,
      [...areaParams]
    );

    if (professors.length === 0) return res.json({ success: true, data: [] });

    const profIds = professors.map(p => p.id);

    // Check general availability for this day of week
    const [avail] = await pool.query(
      `SELECT professor_id, time_from, time_to FROM availability
       WHERE professor_id IN (?) AND weekday_id = ? AND active = 1`,
      [profIds, weekdayId]
    );
    const availMap = {};
    avail.forEach(a => { availMap[a.professor_id] = a; });

    // Check who has their own day_off on this date
    const [daysOff] = await pool.query(
      `SELECT professor_id FROM day_off WHERE professor_id IN (?) AND date_requested = ? AND active = 1`,
      [profIds, date]
    );
    const offSet = new Set(daysOff.map(d => d.professor_id));

    // Check who's already working on this date
    const [working] = await pool.query(
      `SELECT DISTINCT CASE
         WHEN s.professor_id IS NOT NULL THEN s.professor_id
         WHEN prog.lead_professor_id IN (?) THEN prog.lead_professor_id
         ELSE NULL END AS prof_id,
         prog.program_nickname, s.session_time
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       WHERE s.active = 1 AND s.session_date = ?
         AND (s.professor_id IN (?) OR s.assistant_id IN (?) OR prog.lead_professor_id IN (?) OR prog.assistant_professor_id IN (?))`,
      [profIds, date, profIds, profIds, profIds, profIds]
    );
    // Build a map of professor_id -> [{program, time}]
    // Actually let's simplify: just get distinct professor IDs working that day
    const [workingProfs] = await pool.query(
      `SELECT DISTINCT prof_id FROM (
         SELECT COALESCE(s.professor_id, prog.lead_professor_id) AS prof_id
         FROM session s
         JOIN program prog ON prog.id = s.program_id AND prog.active = 1
         WHERE s.active = 1 AND s.session_date = ?
           AND (COALESCE(s.professor_id, prog.lead_professor_id) IN (?))
         UNION
         SELECT COALESCE(s.assistant_id, prog.assistant_professor_id) AS prof_id
         FROM session s
         JOIN program prog ON prog.id = s.program_id AND prog.active = 1
         WHERE s.active = 1 AND s.session_date = ?
           AND (COALESCE(s.assistant_id, prog.assistant_professor_id) IN (?))
       ) AS t WHERE prof_id IS NOT NULL`,
      [date, profIds, date, profIds]
    );
    const workingSet = new Set(workingProfs.map(w => w.prof_id));

    // Annotate professors
    const result = professors.map(p => ({
      ...p,
      generally_available: !!availMap[p.id],
      availability_times: availMap[p.id] ? `${availMap[p.id].time_from || ''} - ${availMap[p.id].time_to || ''}` : null,
      has_day_off: offSet.has(p.id),
      already_working: workingSet.has(p.id),
      in_target_area: areaIds.length ? areaIds.includes(p.area_id) : true,
    }));

    // Sort: available & free first, then available & working, then unavailable
    result.sort((a, b) => {
      const scoreA = (a.has_day_off ? 100 : 0) + (a.already_working ? 10 : 0) + (a.generally_available ? 0 : 1);
      const scoreB = (b.has_day_off ? 100 : 0) + (b.already_working ? 10 : 0) + (b.generally_available ? 0 : 1);
      return scoreA - scoreB;
    });

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/sub-management/assign — assign a professor as sub on a session
router.post('/assign', async (req, res, next) => {
  try {
    const { session_id, professor_id, role, force } = req.body;
    if (!session_id || !professor_id) return res.status(400).json({ success: false, error: 'Session and professor required' });

    // Get session date + program for conflict check
    const [[session]] = await pool.query(
      'SELECT s.session_date, s.program_id, s.session_time, prog.start_time, prog.class_length_minutes FROM session s JOIN program prog ON prog.id = s.program_id WHERE s.id = ?',
      [session_id]
    );
    if (session) {
      const conflicts = await checkProfessorConflicts(professor_id, session.program_id, { checkDate: session.session_date?.toISOString().split('T')[0] });
      if (conflicts.length && !force) {
        return res.status(409).json({ success: false, error: 'Schedule conflicts detected', conflicts });
      }
    }

    if (role === 'Assistant') {
      await pool.query('UPDATE session SET assistant_id = ?, ts_updated = NOW() WHERE id = ?', [professor_id, session_id]);
    } else {
      await pool.query('UPDATE session SET professor_id = ?, ts_updated = NOW() WHERE id = ?', [professor_id, session_id]);
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/sub-management/unassign — remove sub assignment (revert to program default)
router.post('/unassign', async (req, res, next) => {
  try {
    const { session_id, role } = req.body;
    if (!session_id) return res.status(400).json({ success: false, error: 'Session required' });

    if (role === 'Assistant') {
      await pool.query('UPDATE session SET assistant_id = NULL, ts_updated = NOW() WHERE id = ?', [session_id]);
    } else {
      await pool.query('UPDATE session SET professor_id = NULL, ts_updated = NOW() WHERE id = ?', [session_id]);
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/sub-management/claimed — pending/approved sub claims for schedulers
router.get('/claimed', async (req, res, next) => {
  try {
    const { status = 'pending', scheduler_id } = req.query;

    // If scheduler_id is set, show only claims for areas they manage
    let areaFilter = '';
    let areaParams = [];
    if (scheduler_id) {
      areaFilter = `AND ga.scheduling_coordinator_user_id = ?`;
      areaParams = [parseInt(scheduler_id)];
    }

    const [rows] = await pool.query(
      `SELECT sc.id AS claim_id, sc.session_id, sc.professor_id, sc.role, sc.status,
              sc.expected_pay, sc.claimed_at, sc.reject_reason,
              sc.reviewed_by, sc.reviewed_at,
              p.professor_nickname, p.last_name AS professor_last,
              p.phone_number AS professor_phone,
              s.session_date, s.session_time,
              prog.id AS program_id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.lead_professor_id, prog.assistant_professor_id,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              ga.geographic_area_name,
              p_off.professor_nickname AS off_professor_name,
              reviewer.name AS reviewed_by_name
       FROM sub_claim sc
       JOIN session s ON s.id = sc.session_id
       JOIN program prog ON prog.id = s.program_id
       JOIN professor p ON p.id = sc.professor_id
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       LEFT JOIN user reviewer ON reviewer.id = sc.reviewed_by
       LEFT JOIN day_off d ON d.date_requested = s.session_date AND d.active = 1
         AND (d.professor_id = prog.lead_professor_id OR d.professor_id = prog.assistant_professor_id)
       LEFT JOIN professor p_off ON p_off.id = d.professor_id
       WHERE sc.active = 1 AND sc.status = ?
         AND s.session_date >= CURDATE()
         ${areaFilter}
       ORDER BY s.session_date ASC, s.session_time ASC`,
      [status, ...areaParams]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/sub-management/claimed/approve — approve a sub claim (assigns professor to session)
router.post('/claimed/approve', async (req, res, next) => {
  try {
    const { claim_id } = req.body;
    if (!claim_id) return res.status(400).json({ success: false, error: 'claim_id required' });

    const [[claim]] = await pool.query(
      'SELECT * FROM sub_claim WHERE id = ? AND active = 1 AND status = ?',
      [claim_id, 'pending']
    );
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found or already processed' });

    // Assign the professor to the session
    if (claim.role === 'Assistant') {
      await pool.query('UPDATE session SET assistant_id = ?, ts_updated = NOW() WHERE id = ?',
        [claim.professor_id, claim.session_id]);
    } else {
      await pool.query('UPDATE session SET professor_id = ?, ts_updated = NOW() WHERE id = ?',
        [claim.professor_id, claim.session_id]);
    }

    // Mark claim as approved
    await pool.query(
      `UPDATE sub_claim SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
      [req.user.userId, claim_id]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/sub-management/claimed/reject — reject a sub claim (reason required)
router.post('/claimed/reject', async (req, res, next) => {
  try {
    const { claim_id, reason } = req.body;
    if (!claim_id) return res.status(400).json({ success: false, error: 'claim_id required' });
    if (!reason || !reason.trim()) return res.status(400).json({ success: false, error: 'Reason is required when declining a sub claim' });

    await pool.query(
      `UPDATE sub_claim SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ? AND active = 1`,
      [reason.trim(), req.user.userId, claim_id]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// SUB OUTREACH — track who we've asked about a specific sub need
// ═══════════════════════════════════════════════════════════════════

// GET /api/sub-management/outreach?session_id=X — outreach history for a session
router.get('/outreach', async (req, res, next) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ success: false, error: 'session_id required' });

    const [rows] = await pool.query(
      `SELECT so.*,
              p.professor_nickname, p.last_name AS professor_last, p.phone_number, p.email,
              u.first_name AS asked_by_first, u.last_name AS asked_by_last
       FROM sub_outreach so
       JOIN professor p ON p.id = so.professor_id
       LEFT JOIN user u ON u.id = so.asked_by_user_id
       WHERE so.session_id = ? AND so.active = 1
       ORDER BY so.asked_at DESC`,
      [session_id]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/sub-management/outreach — log a new ask
// Body: { session_id, professor_id, method, message_preview?, notes?, send_sms? }
router.post('/outreach', async (req, res, next) => {
  try {
    const { session_id, professor_id, method, message_preview, notes, send_sms, send_email, email_subject } = req.body;
    if (!session_id || !professor_id || !method) {
      return res.status(400).json({ success: false, error: 'session_id, professor_id, and method required' });
    }
    const allowed = ['email', 'sms', 'phone', 'manual_note'];
    if (!allowed.includes(method)) return res.status(400).json({ success: false, error: 'Invalid method' });

    let twilioSid = null;
    // Optionally actually send an email via admin's Gmail
    if (send_email && method === 'email') {
      try {
        const { sendEmail } = require('../lib/gmail');
        const [[prof]] = await pool.query('SELECT email FROM professor WHERE id = ?', [professor_id]);
        const [[sender]] = await pool.query('SELECT google_refresh_token, email_signature FROM user WHERE id = ?', [req.user.userId]);
        if (!prof?.email) return res.status(400).json({ success: false, error: 'Professor has no email' });
        if (!sender?.google_refresh_token) return res.status(400).json({ success: false, error: 'Your Gmail is not connected' });
        if (!message_preview) return res.status(400).json({ success: false, error: 'Message body required' });
        await sendEmail({
          refreshToken: sender.google_refresh_token,
          to: prof.email,
          subject: email_subject || 'Sub opportunity',
          htmlBody: String(message_preview).replace(/\n/g, '<br>'),
          signature: sender.email_signature,
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'Email send failed: ' + err.message });
      }
    }
    // Optionally actually send an SMS
    if (send_sms && method === 'sms') {
      try {
        const { sendSms, normalizePhone } = require('../lib/twilio');
        const [[prof]] = await pool.query('SELECT phone_number FROM professor WHERE id = ?', [professor_id]);
        const phone = normalizePhone(prof?.phone_number);
        if (!phone) return res.status(400).json({ success: false, error: 'Professor has no valid phone number' });
        if (!message_preview) return res.status(400).json({ success: false, error: 'Message body required to send SMS' });
        const result = await sendSms(phone, message_preview);
        twilioSid = result.sid;
      } catch (err) {
        return res.status(500).json({ success: false, error: 'SMS send failed: ' + err.message });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO sub_outreach (session_id, professor_id, asked_by_user_id, method, message_preview, twilio_sid, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [session_id, professor_id, req.user.userId, method, message_preview || null, twilioSid, notes || null]
    );

    res.json({ success: true, id: result.insertId, twilio_sid: twilioSid });
  } catch (err) { next(err); }
});

// PUT /api/sub-management/outreach/:id — update response status/reason/notes
router.put('/outreach/:id', async (req, res, next) => {
  try {
    const allowed = ['response', 'decline_reason', 'notes'];
    const fields = []; const values = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { fields.push(`${k} = ?`); values.push(v); }
    }
    if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update' });

    if (req.body.response && req.body.response !== 'pending') {
      fields.push('response_at = NOW()');
    }

    await pool.query(`UPDATE sub_outreach SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/sub-management/outreach/:id — soft delete
router.delete('/outreach/:id', async (req, res, next) => {
  try {
    await pool.query('UPDATE sub_outreach SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Sub Ask Templates ──────────────────────────────────────────────
const TEMPLATE_KEYS = ['sub_ask_sms_template', 'sub_ask_email_subject', 'sub_ask_email_body'];

router.get('/templates', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?)`,
      [TEMPLATE_KEYS]
    );
    const out = {};
    rows.forEach(r => { out[r.setting_key] = r.setting_value; });
    res.json({ success: true, data: out });
  } catch (err) { next(err); }
});

router.put('/templates', async (req, res, next) => {
  try {
    for (const key of TEMPLATE_KEYS) {
      if (req.body[key] !== undefined) {
        await pool.query(
          `INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
          [key, req.body[key], req.user?.name || 'admin']
        );
      }
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Given a session_id + professor_id, render the templates with merge-field substitution.
// Used by the Ask modal to pre-populate SMS/email bodies.
router.get('/render-ask', async (req, res, next) => {
  try {
    const { session_id, professor_id } = req.query;
    if (!session_id || !professor_id) return res.status(400).json({ success: false, error: 'session_id + professor_id required' });

    const [[need]] = await pool.query(
      `SELECT s.id AS session_id, s.session_date, s.session_time,
              prog.id AS program_id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.lead_professor_id, prog.assistant_professor_id,
              prog.lead_professor_pay, prog.assistant_professor_pay,
              loc.nickname AS location_nickname, loc.school_name, loc.address,
              d.professor_id AS off_professor_id,
              sr.reason_name,
              l.lesson_name,
              ct.class_type_name
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN lesson l ON l.id = s.lesson_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN class_type ct ON ct.id = cl.class_type_id
       LEFT JOIN day_off d ON d.date_requested = s.session_date AND d.active = 1
         AND (d.professor_id = prog.lead_professor_id OR d.professor_id = prog.assistant_professor_id)
       LEFT JOIN substitute_reason sr ON sr.id = d.substitute_reason_id
       WHERE s.id = ?`,
      [session_id]
    );
    if (!need) return res.status(404).json({ success: false, error: 'Session not found' });

    const [[prof]] = await pool.query(
      `SELECT professor_nickname, first_name, last_name, base_pay, assist_pay FROM professor WHERE id = ?`,
      [professor_id]
    );

    // Which role is the sub filling? Whoever is out
    const role = need.off_professor_id === need.lead_professor_id ? 'Lead' : 'Assistant';

    // Pay resolution: session > program > professor base
    let pay = 0;
    if (role === 'Lead') {
      const [[sPay]] = await pool.query(`SELECT professor_pay FROM session WHERE id = ?`, [session_id]);
      pay = parseFloat(sPay?.professor_pay) || parseFloat(need.lead_professor_pay) || parseFloat(prof?.base_pay) || 0;
    } else {
      const [[sPay]] = await pool.query(`SELECT assistant_pay FROM session WHERE id = ?`, [session_id]);
      pay = parseFloat(sPay?.assistant_pay) || parseFloat(need.assistant_professor_pay) || parseFloat(prof?.assist_pay) || 0;
    }

    // Format values
    const dateObj = new Date(need.session_date);
    const session_date = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
    const timeStr = need.session_time || need.start_time;
    let session_time = '';
    if (timeStr) {
      const [h, m] = String(timeStr).split(':');
      const hour = parseInt(h);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const h12 = hour % 12 || 12;
      session_time = `${h12}:${m} ${ampm}`;
    }
    const class_length = need.class_length_minutes ? `${need.class_length_minutes} min` : '';

    const values = {
      professor_nickname: prof?.professor_nickname || prof?.first_name || '',
      role,
      program_name: need.program_nickname || '',
      session_date,
      session_time,
      class_length,
      location_name: need.location_nickname || need.school_name || '',
      location_address: need.address || '',
      pay: pay ? pay.toFixed(2).replace(/\.00$/, '') : '0',
      reason: need.reason_name || '',
      lesson_name: need.lesson_name || '',
      class_type: need.class_type_name || '',
    };

    // Load templates
    const [rows] = await pool.query(
      `SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?)`,
      [TEMPLATE_KEYS]
    );
    const tpl = {};
    rows.forEach(r => { tpl[r.setting_key] = r.setting_value || ''; });

    const fill = (str) => String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (values[k] !== undefined ? values[k] : `{{${k}}}`));

    res.json({
      success: true,
      data: {
        values,
        sms: fill(tpl.sub_ask_sms_template),
        email_subject: fill(tpl.sub_ask_email_subject),
        email_body: fill(tpl.sub_ask_email_body),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/sub-management/outreach/prior-asks?professor_id=X
// Returns most recent sub_outreach row per session for this professor (so UI can warn "asked 2d ago")
router.get('/outreach/prior-asks', async (req, res, next) => {
  try {
    const { professor_id, session_ids } = req.query;
    if (!professor_id) return res.status(400).json({ success: false, error: 'professor_id required' });
    let where = 'WHERE so.professor_id = ? AND so.active = 1';
    const params = [professor_id];
    if (session_ids) {
      const ids = session_ids.split(',').map(Number).filter(Boolean);
      if (ids.length) { where += ` AND so.session_id IN (${ids.map(() => '?').join(',')})`; params.push(...ids); }
    }
    const [rows] = await pool.query(
      `SELECT session_id, method, asked_at, response FROM sub_outreach so ${where} ORDER BY asked_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
