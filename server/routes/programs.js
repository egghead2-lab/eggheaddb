const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

// GET /api/programs (exclude party program types)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status, area, program_type, date_from, date_to, sort, dir, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [
      'prog.active = 1',
      `pt.program_type_name != 'Party'`,
    ];
    let params = [];

    if (search) {
      whereClauses.push(`(prog.program_nickname LIKE ? OR loc.nickname LIKE ? OR cl.class_name LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (status) {
      whereClauses.push(`cs.class_status_name = ?`);
      params.push(status);
    } else {
      whereClauses.push(`cs.class_status_name NOT LIKE 'Cancelled%'`);
    }
    if (area) {
      whereClauses.push(`ga.geographic_area_name = ?`);
      params.push(area);
    }
    if (req.query.location) {
      whereClauses.push(`prog.location_id = ?`);
      params.push(req.query.location);
    }
    if (program_type) {
      whereClauses.push(`pt.program_type_name = ?`);
      params.push(program_type);
    }
    if (req.query.contractor) {
      whereClauses.push(`loc.contractor_id = ?`);
      params.push(req.query.contractor);
    }
    // Timeframe filter: 'current' (default), 'past', 'all'
    const timeframe = req.query.timeframe || 'current';
    if (timeframe === 'current') {
      whereClauses.push(`(prog.last_session_date >= CURDATE() OR prog.last_session_date IS NULL)`);
    } else if (timeframe === 'past') {
      whereClauses.push(`prog.last_session_date < CURDATE()`);
    }
    // 'all' = no date restriction

    if (date_from) {
      whereClauses.push(`prog.last_session_date >= ?`);
      params.push(date_from);
    }
    if (date_to) {
      whereClauses.push(`prog.first_session_date <= ?`);
      params.push(date_to);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;
    const sortMap = {
      nickname: 'prog.program_nickname', status: 'cs.class_status_name',
      location: 'loc.nickname', type: 'pt.program_type_name',
      start_date: 'prog.first_session_date', end_date: 'prog.last_session_date',
      professor: 'lp.professor_nickname',
    };
    const sortCol = sortMap[sort] || 'prog.first_session_date';
    const sortDir = dir === 'desc' ? 'DESC' : dir === 'asc' ? 'ASC' : 'DESC';

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.live, prog.start_time, prog.class_length_minutes,
              prog.location_id,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday,
              prog.saturday, prog.sunday, prog.number_enrolled, prog.minimum_students,
              prog.maximum_students, prog.payment_through_us, prog.first_session_date,
              prog.last_session_date, prog.parent_cost, prog.lab_fee,
              prog.invoice_paid, prog.invoice_date_sent, prog.invoice_needed,
              cs.class_status_name,
              loc.nickname AS location_nickname, prog.party_city,
              cl.class_name, cl.class_code,
              pt.program_type_name, ct2.class_type_name,
              CONCAT(lp.first_name, ' ', lp.last_name) AS lead_professor_name,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_nickname,
              CONCAT(ap.first_name, ' ', ap.last_name) AS assistant_professor_name,
              prog.lead_professor_id,
              prog.session_count
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id AND cs.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id AND pt.active = 1
       LEFT JOIN class_type ct2 ON ct2.id = cl.class_type_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id AND lp.active = 1
       LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id AND ap.active = 1
       LEFT JOIN contractor con ON con.id = loc.contractor_id AND con.active = 1
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
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
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN contractor con ON con.id = loc.contractor_id AND con.active = 1
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/programs/student-search — search students to add to roster
router.get('/student-search', authenticate, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });
    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, birthday FROM student
       WHERE active = 1 AND (first_name LIKE ? OR last_name LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ?)
       ORDER BY last_name, first_name LIMIT 20`,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/programs/pending-roster — pending roster additions for client managers
// MUST be before /:id wildcard
router.get('/pending-roster', authenticate, async (req, res, next) => {
  try {
    const CM_ROLES = ['Admin', 'CEO', 'Client Manager'];
    if (!CM_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Client managers see only their locations; admins see all (or toggle)
    let locationFilter = '';
    const params = [];
    if (req.user.role === 'Client Manager' && req.query.show_all !== 'true') {
      locationFilter = `AND (loc.client_manager_user_id = ? OR ga.client_manager_user_id = ?)`;
      params.push(req.user.userId, req.user.userId);
    }

    const [rows] = await pool.query(
      `SELECT pr.id AS roster_id, pr.program_id, pr.student_id, pr.date_applied, pr.notes AS roster_notes,
              pr.added_by_user_id,
              st.first_name AS student_first, st.last_name AS student_last,
              prog.program_nickname,
              loc.nickname AS location_nickname, prog.party_city,
              con.contractor_name,
              ga.geographic_area_name,
              CONCAT(u.first_name, ' ', u.last_name) AS added_by_name
       FROM program_roster pr
       JOIN program prog ON prog.id = pr.program_id AND prog.active = 1
       JOIN student st ON st.id = pr.student_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN contractor con ON con.id = loc.contractor_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       LEFT JOIN user u ON u.id = pr.added_by_user_id
       WHERE pr.pending_approval = 1 AND pr.active = 1 AND pr.date_dropped IS NULL
       ${locationFilter}
       ORDER BY pr.date_applied DESC, prog.program_nickname`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/programs/pending-roster/approve — approve roster entries
router.post('/pending-roster/approve', authenticate, async (req, res, next) => {
  try {
    const CM_ROLES = ['Admin', 'CEO', 'Client Manager'];
    if (!CM_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const { roster_ids } = req.body;
    if (!Array.isArray(roster_ids) || roster_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'roster_ids array required' });
    }

    const [result] = await pool.query(
      `UPDATE program_roster
       SET pending_approval = 0, approved_by_user_id = ?, approved_at = NOW(), ts_updated = NOW()
       WHERE id IN (?) AND pending_approval = 1 AND active = 1`,
      [req.user.userId, roster_ids]
    );

    res.json({ success: true, approved: result.affectedRows });
  } catch (err) { next(err); }
});

// POST /api/programs/pending-roster/reject — reject (soft delete) roster entries
router.post('/pending-roster/reject', authenticate, async (req, res, next) => {
  try {
    const CM_ROLES = ['Admin', 'CEO', 'Client Manager'];
    if (!CM_ROLES.includes(req.user.role)) return res.status(403).json({ success: false, error: 'Not authorized' });
    const { roster_ids } = req.body;
    if (!Array.isArray(roster_ids) || roster_ids.length === 0) return res.status(400).json({ success: false, error: 'roster_ids required' });
    await pool.query('UPDATE program_roster SET active = 0, ts_updated = NOW() WHERE id IN (?) AND pending_approval = 1', [roster_ids]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/programs/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[program]] = await pool.query(
      `SELECT prog.*,
              cs.class_status_name,
              loc.nickname AS location_nickname, prog.party_city,
              loc.retained AS location_retained,
              cl.class_name, cl.class_code, cl.formal_class_name,
              pt.program_type_name,
              ct.class_type_name,
              cpt.class_pricing_type_name,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_nickname,
              CONCAT(ap.professor_nickname, ' ', ap.last_name) AS assistant_professor_nickname,
              CONCAT(dp.professor_nickname, ' ', dp.last_name) AS demo_professor_nickname
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN class_type ct ON ct.id = cl.class_type_id
       LEFT JOIN class_pricing_type cpt ON cpt.id = loc.class_pricing_type_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id
       LEFT JOIN professor dp ON dp.id = prog.demo_professor_id
       WHERE prog.id = ? AND prog.active = 1`,
      [id]
    );

    if (!program) {
      return res.status(404).json({ success: false, error: 'Program not found' });
    }

    const [sessions] = await pool.query(
      `SELECT s.*,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_nickname,
              CONCAT(ap.professor_nickname, ' ', ap.last_name) AS assistant_nickname,
              l.lesson_name
       FROM session s
       LEFT JOIN professor p ON p.id = s.professor_id
       LEFT JOIN professor ap ON ap.id = s.assistant_id
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.program_id = ? AND s.active = 1
       ORDER BY s.session_date, s.session_time`,
      [id]
    );

    const [roster] = await pool.query(
      `SELECT pr.*,
              st.first_name, st.last_name, st.birthday,
              g.grade_name,
              p.first_name AS parent_first_name, p.last_name AS parent_last_name,
              p.email AS parent_email, p.phone AS parent_phone
       FROM program_roster pr
       LEFT JOIN student st ON st.id = pr.student_id AND st.active = 1
       LEFT JOIN grade g ON g.id = pr.grade_id AND g.active = 1
       LEFT JOIN student_parent sp ON sp.student_id = st.id AND sp.active = 1
       LEFT JOIN parent p ON p.id = sp.parent_id AND p.active = 1
       WHERE pr.program_id = ? AND pr.active = 1
       ORDER BY pr.date_dropped IS NOT NULL, st.last_name, st.first_name`,
      [id]
    );

    res.json({ success: true, data: { ...program, sessions, roster } });
  } catch (err) {
    next(err);
  }
});

// POST /api/programs
router.post('/', authenticate, async (req, res, next) => {
  try {
    const data = req.body;

    const fields = [
      'program_nickname', 'class_status_id', 'location_id', 'live', 'class_id', 'grade_range',
      'start_time', 'class_length_minutes', 'monday', 'tuesday', 'wednesday', 'thursday',
      'friday', 'saturday', 'sunday', 'general_notes', 'parent_cost', 'our_cut', 'lab_fee',
      'number_enrolled', 'minimum_students', 'maximum_students', 'roster_received',
      'roster_confirmed', 'roster_notes', 'degrees_printed', 'payment_through_us',
      'lead_professor_id', 'lead_professor_pay', 'tb_required', 'livescan_required',
      'virtus_required', 'roster_link', 'demo_required', 'demo_date', 'demo_start_time',
      'demo_end_time', 'demo_type_id', 'demo_pay', 'demo_professor_id', 'demo_notes',
      'flyer_required', 'flyer_made', 'flyer_sent_electronic', 'flyer_dropped_physical',
      'flyer_dropped_physical_notes', 'registration_opened_online', 'open_blast_sent',
      'two_week_blast_sent', 'one_week_blast_sent', 'final_blast_sent',
      'parent_feedback_requested', 'glow_slime_amount_needed', 'calendar_event',
      'materials_prepared', 'details_confirmed', 'invoice_needed', 'how_heard',
      'lead_professor_drive_fee', 'lead_professor_tip', 'lead_professor_dry_ice',
      'lead_reimbursements_paid', 'assistant_required', 'assistant_professor_id',
      'assistant_professor_pay', 'assistant_professor_drive_fee', 'assistant_professor_tip',
      'assistant_professor_dry_ice', 'assistant_reimbursements_paid',
      'first_session_date', 'last_session_date', 'invoice_date_sent', 'invoice_paid',
      'invoice_notes', 'contract_permit_required_id', 'special_info_required',
    ];

    const insertFields = fields.filter(f => data[f] !== undefined);
    const values = insertFields.map(f => data[f] === '' ? null : data[f]);

    // program_nickname is NOT NULL UNIQUE — supply a unique placeholder if missing
    const idx = insertFields.indexOf('program_nickname');
    if (idx === -1 || !values[idx]) {
      const placeholder = `New Program ${Date.now()}`;
      if (idx === -1) { insertFields.push('program_nickname'); values.push(placeholder); }
      else values[idx] = placeholder;
    }

    const [result] = await pool.query(
      `INSERT INTO program (${insertFields.join(', ')}, active, ts_inserted, ts_updated)
       VALUES (${insertFields.map(() => '?').join(', ')}, 1, NOW(), NOW())`,
      values
    );

    // Auto booking-type reconcile (spec §5)
    try {
      const { reconcileProgram } = require('../services/commissionBookingType');
      await reconcileProgram(result.insertId, req.user?.userId);
    } catch (e) { console.warn('[commission] reconcileProgram failed (non-fatal):', e.message); }

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/programs/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const fields = [
      'program_nickname', 'class_status_id', 'location_id', 'live', 'class_id', 'grade_range',
      'start_time', 'class_length_minutes', 'monday', 'tuesday', 'wednesday', 'thursday',
      'friday', 'saturday', 'sunday', 'general_notes', 'parent_cost', 'our_cut', 'lab_fee',
      'number_enrolled', 'minimum_students', 'maximum_students', 'roster_received',
      'roster_confirmed', 'roster_notes', 'degrees_printed', 'payment_through_us',
      'lead_professor_id', 'lead_professor_pay', 'tb_required', 'livescan_required',
      'virtus_required', 'roster_link', 'demo_required', 'demo_date', 'demo_start_time',
      'demo_end_time', 'demo_type_id', 'demo_pay', 'demo_professor_id', 'demo_notes',
      'flyer_required', 'flyer_made', 'flyer_sent_electronic', 'flyer_dropped_physical',
      'flyer_dropped_physical_notes', 'registration_opened_online', 'open_blast_sent',
      'two_week_blast_sent', 'one_week_blast_sent', 'final_blast_sent',
      'parent_feedback_requested', 'glow_slime_amount_needed', 'calendar_event',
      'materials_prepared', 'details_confirmed', 'invoice_needed', 'how_heard',
      'lead_professor_drive_fee', 'lead_professor_tip', 'lead_professor_dry_ice',
      'lead_reimbursements_paid', 'assistant_required', 'assistant_professor_id',
      'assistant_professor_pay', 'assistant_professor_drive_fee', 'assistant_professor_tip',
      'assistant_professor_dry_ice', 'assistant_reimbursements_paid',
      'first_session_date', 'last_session_date', 'invoice_date_sent', 'invoice_paid',
      'invoice_notes', 'contract_permit_required_id', 'special_info_required', 'active',
      'stripe_payment_link_id', 'stripe_payment_link_url', 'stripe_payment_link_qr_url', 'lab_fee_link_not_needed',
    ];

    const updateFields = fields.filter(f => data[f] !== undefined);
    const values = updateFields.map(f => data[f] === '' ? null : data[f]);

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    const [[oldRow]] = await pool.query('SELECT * FROM program WHERE id = ?', [id]);

    await pool.query(
      `UPDATE program SET ${updateFields.map(f => `${f} = ?`).join(', ')}, ts_updated = NOW()
       WHERE id = ?`,
      [...values, id]
    );

    if (oldRow) logAudit('program', id, req.user, oldRow, data);

    // Auto-sync party calendar if this is a confirmed party with a calendar event
    try {
      const { syncPartyCalendarEvent } = require('../lib/partyCalendar');
      await syncPartyCalendarEvent(id);
    } catch (e) { /* calendar sync failure shouldn't break the save */ }

    // Auto booking-type reconcile if location or first_session_date changed (spec §5)
    if (data.location_id !== undefined || data.first_session_date !== undefined) {
      try {
        const { reconcileProgram } = require('../services/commissionBookingType');
        await reconcileProgram(id, req.user?.userId);
      } catch (e) { console.warn('[commission] reconcileProgram failed (non-fatal):', e.message); }
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/programs/:id/sessions
router.get('/:id/sessions', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [sessions] = await pool.query(
      `SELECT s.*,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_nickname,
              CONCAT(ap.professor_nickname, ' ', ap.last_name) AS assistant_nickname,
              l.lesson_name
       FROM session s
       LEFT JOIN professor p ON p.id = s.professor_id
       LEFT JOIN professor ap ON ap.id = s.assistant_id
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.program_id = ? AND s.active = 1
       ORDER BY s.session_date, s.session_time`,
      [id]
    );
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
});

// PUT /api/programs/:id/sessions (bulk upsert)
router.put('/:id/sessions', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sessions } = req.body;

    if (!Array.isArray(sessions)) {
      return res.status(400).json({ success: false, error: 'Sessions must be an array' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const payOrNull = (v) => (v !== null && v !== undefined && v !== '' && Number(v) !== 0) ? v : null;

      for (const session of sessions) {
        if (session.id) {
          await conn.query(
            `UPDATE session SET lesson_id=?, professor_id=?, professor_pay=?, assistant_id=?,
             assistant_pay=?, observer_id=?, observer_pay=?, session_date=?, session_time=?, specific_notes=?, ts_updated=NOW()
             WHERE id=? AND program_id=?`,
            [
              session.lesson_id || null, session.professor_id || null, payOrNull(session.professor_pay),
              session.assistant_id || null, payOrNull(session.assistant_pay),
              session.observer_id || null, payOrNull(session.observer_pay),
              session.session_date || null, session.session_time || null,
              session.specific_notes || null, session.id, id,
            ]
          );
        } else {
          await conn.query(
            `INSERT INTO session (program_id, lesson_id, professor_id, professor_pay, assistant_id,
             assistant_pay, observer_id, observer_pay, session_date, session_time, specific_notes, active, ts_inserted, ts_updated)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
            [
              id, session.lesson_id || null, session.professor_id || null, payOrNull(session.professor_pay),
              session.assistant_id || null, payOrNull(session.assistant_pay),
              session.observer_id || null, payOrNull(session.observer_pay),
              session.session_date || null, session.session_time || null, session.specific_notes || null,
            ]
          );
        }
      }

      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/programs/:id/sessions/bulk — generate sessions from date range + day of week
router.post('/:id/sessions/bulk', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start_date, end_date, skip_dates } = req.body;

    if (!start_date || !end_date) return res.status(400).json({ success: false, error: 'Start and end date required' });

    // Get program to know days of week and defaults
    const [[program]] = await pool.query(
      `SELECT * FROM program WHERE id = ? AND active = 1`, [id]
    );
    if (!program) return res.status(404).json({ success: false, error: 'Program not found' });

    // Determine which days of the week this program runs
    const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const allowedDays = Object.entries(dayMap).filter(([key]) => program[key]).map(([, val]) => val);

    if (allowedDays.length === 0) return res.status(400).json({ success: false, error: 'No days of week set on this program' });

    const skipSet = new Set((skip_dates || []).map(d => d.split('T')[0]));

    // Get existing session dates to avoid duplicates
    const [existing] = await pool.query(
      `SELECT session_date FROM session WHERE program_id = ? AND active = 1`, [id]
    );
    const existingDates = new Set(existing.map(s => s.session_date.toISOString().split('T')[0]));

    // Generate dates
    const start = new Date(start_date + 'T12:00:00');
    const end = new Date(end_date + 'T12:00:00');
    const newDates = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      const key = d.toISOString().split('T')[0];
      if (allowedDays.includes(dow) && !skipSet.has(key) && !existingDates.has(key)) {
        newDates.push(key);
      }
    }

    if (newDates.length === 0) return res.json({ success: true, created: 0, message: 'No new dates to add' });

    // Insert sessions — professor/pay fields left NULL intentionally.
    // Nightly payroll job resolves who taught via: session override → program lead/assistant → professor base pay.
    // This prevents overwriting subs when lead professor changes.
    for (const dateStr of newDates) {
      await pool.query(
        `INSERT INTO session (program_id, session_date, session_time, active, ts_inserted, ts_updated)
         VALUES (?, ?, ?, 1, NOW(), NOW())`,
        [id, dateStr, program.start_time || null]
      );
    }

    // Update first/last session dates
    await pool.query(
      `UPDATE program SET
         first_session_date = (SELECT MIN(session_date) FROM session WHERE program_id = ? AND active = 1),
         last_session_date = (SELECT MAX(session_date) FROM session WHERE program_id = ? AND active = 1),
         session_count = (SELECT COUNT(*) FROM session WHERE program_id = ? AND active = 1),
         ts_updated = NOW()
       WHERE id = ?`,
      [id, id, id, id]
    );

    res.json({ success: true, created: newDates.length, dates: newDates });
  } catch (err) {
    next(err);
  }
});

// POST /api/programs/:id/sessions/add — add a single session
router.post('/:id/sessions/add', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { session_date, session_time, professor_id, professor_pay, assistant_id, assistant_pay, observer_id, observer_pay, lesson_id, specific_notes, not_billed } = req.body;

    if (!session_date) return res.status(400).json({ success: false, error: 'Date is required' });

    const [result] = await pool.query(
      `INSERT INTO session (program_id, session_date, session_time, professor_id, professor_pay, assistant_id, assistant_pay, observer_id, observer_pay, lesson_id, specific_notes, not_billed, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [id, session_date, session_time || null, professor_id || null, professor_pay || null, assistant_id || null, assistant_pay || null, observer_id || null, observer_pay || null, lesson_id || null, specific_notes || null, not_billed ? 1 : 0]
    );

    // Auto-update first/last session dates on the program
    await pool.query(
      `UPDATE program SET
         first_session_date = (SELECT MIN(session_date) FROM session WHERE program_id = ? AND active = 1),
         last_session_date = (SELECT MAX(session_date) FROM session WHERE program_id = ? AND active = 1),
         session_count = (SELECT COUNT(*) FROM session WHERE program_id = ? AND active = 1),
         ts_updated = NOW()
       WHERE id = ?`,
      [id, id, id, id]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/programs/:id/sessions/:sessionId — update a single session
router.put('/:id/sessions/:sessionId', authenticate, async (req, res, next) => {
  try {
    const { id, sessionId } = req.params;
    const { session_date, session_time, professor_id, professor_pay, assistant_id, assistant_pay, observer_id, observer_pay, lesson_id, specific_notes, not_billed } = req.body;

    const fields = [];
    const values = [];
    if (session_date !== undefined) { fields.push('session_date = ?'); values.push(session_date || null); }
    if (session_time !== undefined) { fields.push('session_time = ?'); values.push(session_time || null); }
    if (professor_id !== undefined) { fields.push('professor_id = ?'); values.push(professor_id || null); }
    if (professor_pay !== undefined) { fields.push('professor_pay = ?'); values.push((professor_pay !== '' && professor_pay != null && Number(professor_pay) !== 0) ? professor_pay : null); }
    if (assistant_id !== undefined) { fields.push('assistant_id = ?'); values.push(assistant_id || null); }
    if (assistant_pay !== undefined) { fields.push('assistant_pay = ?'); values.push((assistant_pay !== '' && assistant_pay != null && Number(assistant_pay) !== 0) ? assistant_pay : null); }
    if (observer_id !== undefined) { fields.push('observer_id = ?'); values.push(observer_id || null); }
    if (observer_pay !== undefined) { fields.push('observer_pay = ?'); values.push((observer_pay !== '' && observer_pay != null && Number(observer_pay) !== 0) ? observer_pay : null); }
    if (lesson_id !== undefined) { fields.push('lesson_id = ?'); values.push(lesson_id || null); }
    if (specific_notes !== undefined) { fields.push('specific_notes = ?'); values.push(specific_notes || null); }
    if (not_billed !== undefined) { fields.push('not_billed = ?'); values.push(not_billed ? 1 : 0); }

    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No fields' });

    await pool.query(
      `UPDATE session SET ${fields.join(', ')}, ts_updated = NOW() WHERE id = ? AND program_id = ?`,
      [...values, sessionId, id]
    );

    // Auto-update first/last session dates
    await pool.query(
      `UPDATE program SET
         first_session_date = (SELECT MIN(session_date) FROM session WHERE program_id = ? AND active = 1),
         last_session_date = (SELECT MAX(session_date) FROM session WHERE program_id = ? AND active = 1),
         session_count = (SELECT COUNT(*) FROM session WHERE program_id = ? AND active = 1),
         ts_updated = NOW()
       WHERE id = ?`,
      [id, id, id, id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/programs/:id/sessions/:sessionId — soft delete a session
router.delete('/:id/sessions/:sessionId', authenticate, async (req, res, next) => {
  try {
    const { id, sessionId } = req.params;
    const reason = req.query.reason || null;
    const notes = req.query.notes || null;

    // Get session date before deleting
    const [[session]] = await pool.query('SELECT session_date FROM session WHERE id = ?', [sessionId]);

    await pool.query(
      `UPDATE session SET active = 0, ts_updated = NOW() WHERE id = ? AND program_id = ?`,
      [sessionId, id]
    );

    // Log cancellation if reason provided
    if (reason) {
      await pool.query(
        'INSERT INTO session_cancellation_log (session_id, program_id, session_date, reason, notes, cancelled_by_user_id) VALUES (?,?,?,?,?,?)',
        [sessionId, id, session?.session_date || null, reason, notes, req.user?.userId || null]
      );
    }

    // Auto-update first/last session dates
    await pool.query(
      `UPDATE program SET
         first_session_date = (SELECT MIN(session_date) FROM session WHERE program_id = ? AND active = 1),
         last_session_date = (SELECT MAX(session_date) FROM session WHERE program_id = ? AND active = 1),
         session_count = (SELECT COUNT(*) FROM session WHERE program_id = ? AND active = 1),
         ts_updated = NOW()
       WHERE id = ?`,
      [id, id, id, id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/programs/:id/roster
router.get('/:id/roster', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [roster] = await pool.query(
      `SELECT pr.*,
              st.first_name, st.last_name, st.birthday,
              g.grade_name,
              p.first_name AS parent_first_name, p.last_name AS parent_last_name,
              p.email AS parent_email, p.phone AS parent_phone
       FROM program_roster pr
       LEFT JOIN student st ON st.id = pr.student_id AND st.active = 1
       LEFT JOIN grade g ON g.id = pr.grade_id AND g.active = 1
       LEFT JOIN student_parent sp ON sp.student_id = st.id AND sp.active = 1
       LEFT JOIN parent p ON p.id = sp.parent_id AND p.active = 1
       WHERE pr.program_id = ? AND pr.active = 1
       ORDER BY pr.date_dropped IS NOT NULL, st.last_name, st.first_name`,
      [id]
    );
    res.json({ success: true, data: roster });
  } catch (err) {
    next(err);
  }
});

// PUT /api/programs/:id/roster (bulk upsert)
router.put('/:id/roster', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { roster } = req.body;

    if (!Array.isArray(roster)) {
      return res.status(400).json({ success: false, error: 'Roster must be an array' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const entry of roster) {
        if (entry.id) {
          await conn.query(
            `UPDATE program_roster SET grade_id=?, age=?, gender=?, date_applied=?,
             date_dropped=?, student_lab_fee=?, notes=?, ts_updated=NOW()
             WHERE id=? AND program_id=?`,
            [
              entry.grade_id || null, entry.age || null, entry.gender || null,
              entry.date_applied || null, entry.date_dropped || null,
              entry.student_lab_fee || null, entry.notes || null, entry.id, id,
            ]
          );
        } else {
          await conn.query(
            `INSERT INTO program_roster (program_id, student_id, grade_id, age, gender,
             date_applied, date_dropped, student_lab_fee, notes, active, ts_inserted, ts_updated)
             VALUES (?,?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
            [
              id, entry.student_id || null, entry.grade_id || null, entry.age || null,
              entry.gender || null, entry.date_applied || null, entry.date_dropped || null,
              entry.student_lab_fee || null, entry.notes || null,
            ]
          );
        }
      }

      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/programs/:id/roster/add — add a student to roster (enforces max)
// POST /api/programs/:id/roster/quick-add — professors add students by name (no search required)
router.post('/:id/roster/quick-add', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, age, notes } = req.body;
    if (!first_name?.trim()) return res.status(400).json({ success: false, error: 'First name required' });

    // Create the student record
    const [studentResult] = await pool.query(
      'INSERT INTO student (first_name, last_name, active, ts_inserted, ts_updated) VALUES (?, ?, 1, NOW(), NOW())',
      [first_name.trim(), (last_name || '').trim()]
    );
    const studentId = studentResult.insertId;

    // Add to roster with pending approval for professors
    const isProfessor = req.user.role === 'Professor';
    await pool.query(
      `INSERT INTO program_roster (program_id, student_id, age, notes, date_applied, pending_approval, added_by_user_id, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, CURDATE(), ?, ?, 1, NOW(), NOW())`,
      [id, studentId, age || null, notes || null, isProfessor ? 1 : 0, req.user.userId]
    );

    res.json({ success: true, student_id: studentId });
  } catch (err) { next(err); }
});

router.post('/:id/roster/add', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { student_id, age, notes } = req.body;

    if (!student_id) return res.status(400).json({ success: false, error: 'Student is required' });

    // Check max enrollment
    const [[program]] = await pool.query(
      `SELECT maximum_students FROM program WHERE id = ? AND active = 1`, [id]
    );
    if (!program) return res.status(404).json({ success: false, error: 'Program not found' });

    const [[{ count }]] = await pool.query(
      `SELECT COUNT(*) AS count FROM program_roster WHERE program_id = ? AND active = 1 AND date_dropped IS NULL`, [id]
    );

    if (program.maximum_students && count >= program.maximum_students) {
      return res.status(400).json({ success: false, error: `Cannot add — roster is full (${count}/${program.maximum_students} active students)` });
    }

    // Check if already on roster
    const [[existing]] = await pool.query(
      `SELECT id FROM program_roster WHERE program_id = ? AND student_id = ? AND active = 1`, [id, student_id]
    );
    if (existing) return res.status(400).json({ success: false, error: 'Student is already on this roster' });

    // Professors' additions require client manager approval
    const isProfessor = req.user.role === 'Professor';

    const [result] = await pool.query(
      `INSERT INTO program_roster (program_id, student_id, age, notes, date_applied, pending_approval, added_by_user_id, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, CURDATE(), ?, ?, 1, NOW(), NOW())`,
      [id, student_id, age || null, notes || null, isProfessor ? 1 : 0, req.user.userId]
    );

    // Count active roster (not dropped)
    const [[{ roster_count }]] = await pool.query(
      `SELECT COUNT(*) AS roster_count FROM program_roster WHERE program_id = ? AND active = 1 AND date_dropped IS NULL`, [id]
    );

    res.json({ success: true, id: result.insertId, roster_count });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/programs/:id/roster/:rosterId — remove student from roster
router.delete('/:id/roster/:rosterId', authenticate, async (req, res, next) => {
  try {
    const { id, rosterId } = req.params;

    await pool.query(
      `UPDATE program_roster SET active = 0, ts_updated = NOW() WHERE id = ? AND program_id = ?`,
      [rosterId, id]
    );

    // Count active roster (not dropped)
    const [[{ roster_count }]] = await pool.query(
      `SELECT COUNT(*) AS roster_count FROM program_roster WHERE program_id = ? AND active = 1 AND date_dropped IS NULL`, [id]
    );

    res.json({ success: true, roster_count });
  } catch (err) {
    next(err);
  }
});

// PUT /api/programs/:id/roster/:rosterId — update roster entry (age, notes)
router.put('/:id/roster/:rosterId', authenticate, async (req, res, next) => {
  try {
    const { id, rosterId } = req.params;
    const { age, notes, grade_id, date_dropped, weeks_attended } = req.body;

    const fields = [];
    const values = [];
    if (age !== undefined) { fields.push('age = ?'); values.push(age || null); }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes || null); }
    if (grade_id !== undefined) { fields.push('grade_id = ?'); values.push(grade_id || null); }
    if (date_dropped !== undefined) { fields.push('date_dropped = ?'); values.push(date_dropped || null); }
    if (weeks_attended !== undefined) { fields.push('weeks_attended = ?'); values.push(weeks_attended || null); }

    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No fields' });

    await pool.query(
      `UPDATE program_roster SET ${fields.join(', ')}, ts_updated = NOW() WHERE id = ? AND program_id = ?`,
      [...values, rosterId, id]
    );

    // Return current roster count vs stored number_enrolled so client can detect mismatch
    const [[{ roster_count }]] = await pool.query(
      `SELECT COUNT(*) AS roster_count FROM program_roster WHERE program_id = ? AND active = 1 AND date_dropped IS NULL`, [id]
    );
    const [[{ number_enrolled }]] = await pool.query(
      `SELECT number_enrolled FROM program WHERE id = ?`, [id]
    );

    res.json({ success: true, roster_count, number_enrolled });
  } catch (err) {
    next(err);
  }
});

// POST /api/programs/:id/copy — duplicate a program (no sessions)
router.post('/:id/copy', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[orig]] = await pool.query(`SELECT * FROM program WHERE id = ? AND active = 1`, [id]);
    if (!orig) return res.status(404).json({ success: false, error: 'Program not found' });

    const fields = [
      'class_status_id', 'location_id', 'class_id', 'start_time', 'class_length_minutes',
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
      'general_notes', 'parent_cost', 'our_cut', 'lab_fee', 'minimum_students', 'maximum_students',
      'payment_through_us', 'lead_professor_id', 'lead_professor_pay',
      'assistant_professor_id', 'assistant_professor_pay',
      'tb_required', 'livescan_required', 'virtus_required',
    ];

    const cols = ['program_nickname', ...fields, 'active', 'ts_inserted', 'ts_updated'];
    const vals = [`${orig.program_nickname} (Copy)`, ...fields.map(f => orig[f]), 1, new Date(), new Date()];
    const placeholders = cols.map(() => '?').join(', ');

    const [result] = await pool.query(
      `INSERT INTO program (${cols.join(', ')}) VALUES (${placeholders})`, vals
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// ATTENDANCE
// ============================================================

// GET /api/programs/:id/attendance/:sessionId — attendance for a specific session
router.get('/:id/attendance/:sessionId', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, st.first_name, st.last_name
       FROM attendance a
       LEFT JOIN student st ON st.id = a.student_id
       WHERE a.session_id = ?
       ORDER BY st.last_name, st.first_name`,
      [req.params.sessionId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/programs/:id/attendance-summary — attendance counts per session for a program
router.get('/:id/attendance-summary', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.session_id,
              SUM(a.status = 'present') AS present_count,
              SUM(a.status = 'absent') AS absent_count,
              SUM(a.status = 'late') AS late_count,
              SUM(a.status = 'excused') AS excused_count,
              COUNT(*) AS total_marked
       FROM attendance a
       JOIN session s ON s.id = a.session_id AND s.program_id = ?
       GROUP BY a.session_id`,
      [req.params.id]
    );
    const map = {};
    rows.forEach(r => { map[r.session_id] = r; });
    res.json({ success: true, data: map });
  } catch (err) { next(err); }
});

// POST /api/programs/:id/attendance/:sessionId — bulk save attendance for a session
router.post('/:id/attendance/:sessionId', authenticate, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { entries } = req.body; // [{ student_id, status, notes }]
    if (!Array.isArray(entries)) return res.status(400).json({ success: false, error: 'entries array required' });

    const markedBy = req.user?.userId || null;
    for (const e of entries) {
      await pool.query(
        `INSERT INTO attendance (session_id, student_id, status, notes, marked_by, marked_at)
         VALUES (?,?,?,?,?,NOW())
         ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes), marked_by = VALUES(marked_by), marked_at = NOW()`,
        [sessionId, e.student_id, e.status || 'present', e.notes || null, markedBy]
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/programs/:id/classroom — combined data for the classroom view (roster + sessions + attendance summary)
router.get('/:id/classroom', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Professors can only access classrooms for programs they are assigned to
    if (req.user.role === 'Professor') {
      const [[prof]] = await pool.query('SELECT id FROM professor WHERE user_id = ? AND active = 1', [req.user.userId]);
      if (!prof) return res.status(403).json({ success: false, error: 'No professor profile found' });
      const [[assigned]] = await pool.query(
        `SELECT id FROM program WHERE id = ? AND active = 1 AND (lead_professor_id = ? OR assistant_professor_id = ?)`,
        [id, prof.id, prof.id]
      );
      if (!assigned) return res.status(403).json({ success: false, error: 'You are not assigned to this program' });
    }

    // Program info
    const [[program]] = await pool.query(
      `SELECT prog.*, cs.class_status_name, cl.class_name,
              loc.nickname AS location_nickname, prog.party_city, loc.school_name,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_name,
              CONCAT(ap.professor_nickname, ' ', ap.last_name) AS assistant_professor_name
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id
       WHERE prog.id = ? AND prog.active = 1`, [id]
    );
    if (!program) return res.status(404).json({ success: false, error: 'Program not found' });

    // Roster
    const [roster] = await pool.query(
      `SELECT pr.id AS roster_id, pr.student_id, pr.notes, pr.date_dropped, pr.pending_approval,
              st.first_name, st.last_name, st.birthday,
              g.grade_name
       FROM program_roster pr
       LEFT JOIN student st ON st.id = pr.student_id
       LEFT JOIN grade g ON g.id = pr.grade_id
       WHERE pr.program_id = ? AND pr.active = 1
       ORDER BY pr.date_dropped IS NOT NULL, st.last_name, st.first_name`, [id]
    );

    // Sessions
    const [sessions] = await pool.query(
      `SELECT s.id, s.session_date, s.session_time, s.lesson_id, s.specific_notes,
              l.lesson_name
       FROM session s
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.program_id = ? AND s.active = 1
       ORDER BY s.session_date ASC`, [id]
    );

    // Attendance summary per session
    const [attRows] = await pool.query(
      `SELECT a.session_id, a.student_id, a.status, a.notes AS att_notes
       FROM attendance a
       JOIN session s ON s.id = a.session_id AND s.program_id = ?`, [id]
    );
    // Build map: { session_id: { student_id: { status, notes } } }
    const attendanceMap = {};
    attRows.forEach(r => {
      if (!attendanceMap[r.session_id]) attendanceMap[r.session_id] = {};
      attendanceMap[r.session_id][r.student_id] = { status: r.status, notes: r.att_notes };
    });

    // Available students for adding to roster (search endpoint)
    res.json({ success: true, data: { program, roster, sessions, attendanceMap } });
  } catch (err) { next(err); }
});

module.exports = router;
