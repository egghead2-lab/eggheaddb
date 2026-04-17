const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/permits — all active permit requests grouped by stage
router.get('/', async (req, res, next) => {
  try {
    // Get configurable lead days
    const [settings] = await pool.query("SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('permit_flag_days', 'permit_approval_flag_days', 'permit_payment_flag_days')");
    const cfg = {};
    settings.forEach(s => { cfg[s.setting_key] = parseInt(s.setting_value) || 0; });

    const [rows] = await pool.query(
      `SELECT pr.*,
              prog.program_nickname, prog.first_session_date, prog.last_session_date,
              prog.start_time, prog.class_length_minutes, prog.parent_cost, prog.our_cut,
              prog.number_enrolled, prog.minimum_students, prog.session_count,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              cs.class_status_name,
              loc.nickname AS location_nickname, loc.contract_permit_notes,
              cl.formal_class_name, cl.class_name,
              prog.grade_range,
              CONCAT(sent_u.first_name, ' ', sent_u.last_name) AS sent_by_name,
              CONCAT(app_u.first_name, ' ', app_u.last_name) AS approved_by_name,
              CONCAT(pay_u.first_name, ' ', pay_u.last_name) AS payment_requested_by_name,
              CONCAT(payto_u.first_name, ' ', payto_u.last_name) AS payment_request_to_name,
              CONCAT(paid_u.first_name, ' ', paid_u.last_name) AS payment_made_by_name
       FROM permit_request pr
       JOIN program prog ON prog.id = pr.program_id
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = pr.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN user sent_u ON sent_u.id = pr.sent_by_user_id
       LEFT JOIN user app_u ON app_u.id = pr.approved_by_user_id
       LEFT JOIN user pay_u ON pay_u.id = pr.payment_requested_by_user_id
       LEFT JOIN user payto_u ON payto_u.id = pr.payment_request_to_user_id
       LEFT JOIN user paid_u ON paid_u.id = pr.payment_made_by_user_id
       WHERE pr.active = 1 AND pr.resolved = 0
       ORDER BY prog.first_session_date ASC`
    );

    // For each permit, get other programs at the same location starting within 30 days
    for (const pr of rows) {
      if (pr.location_id && pr.stage === 'needs_permit') {
        const [related] = await pool.query(
          `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.start_time,
                  prog.parent_cost, cl.formal_class_name, prog.grade_range,
                  prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday
           FROM program prog
           LEFT JOIN class cl ON cl.id = prog.class_id
           LEFT JOIN class_status cs ON cs.id = prog.class_status_id
           WHERE prog.location_id = ? AND prog.id != ? AND prog.active = 1
             AND cs.class_status_name NOT LIKE 'Cancelled%'
             AND prog.first_session_date BETWEEN ? AND DATE_ADD(?, INTERVAL 30 DAY)
           ORDER BY prog.first_session_date`,
          [pr.location_id, pr.program_id, pr.first_session_date, pr.first_session_date]
        );
        pr.related_programs = related;
      }
    }

    // Get session dates for each permit's program
    for (const pr of rows) {
      const [sessions] = await pool.query(
        'SELECT session_date FROM session WHERE program_id = ? AND active = 1 ORDER BY session_date',
        [pr.program_id]
      );
      pr.session_dates = sessions.map(s => s.session_date);
    }

    res.json({ success: true, data: rows, config: cfg });
  } catch (err) { next(err); }
});

// GET /api/permits/flagged — programs needing permits that don't have one yet
router.get('/flagged', async (req, res, next) => {
  try {
    const [[flagDaysSetting]] = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'permit_flag_days'");
    const flagDays = parseInt(flagDaysSetting?.setting_value) || 30;

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.location_id,
              loc.nickname AS location_nickname, loc.contract_permit_notes,
              cs.class_status_name
       FROM program prog
       JOIN location loc ON loc.id = prog.location_id AND loc.contract_permit_required = 1
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       WHERE prog.active = 1 AND cs.class_status_name NOT LIKE 'Cancelled%'
         AND prog.first_session_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND NOT EXISTS (SELECT 1 FROM permit_request pr WHERE pr.program_id = prog.id AND pr.active = 1)
       ORDER BY prog.first_session_date ASC`,
      [flagDays]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/permits — create permit request
router.post('/', async (req, res, next) => {
  try {
    const { program_id } = req.body;
    if (!program_id) return res.status(400).json({ success: false, error: 'program_id required' });

    const [[prog]] = await pool.query('SELECT location_id FROM program WHERE id = ?', [program_id]);
    const [result] = await pool.query(
      'INSERT INTO permit_request (program_id, location_id, stage) VALUES (?, ?, ?)',
      [program_id, prog?.location_id || null, 'needs_permit']
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// POST /api/permits/bulk-create — create permits for multiple programs
router.post('/bulk-create', async (req, res, next) => {
  try {
    const { program_ids } = req.body;
    if (!Array.isArray(program_ids) || program_ids.length === 0) return res.status(400).json({ success: false, error: 'program_ids required' });
    let created = 0;
    for (const pid of program_ids) {
      const [[existing]] = await pool.query('SELECT id FROM permit_request WHERE program_id = ? AND active = 1', [pid]);
      if (existing) continue;
      const [[prog]] = await pool.query('SELECT location_id FROM program WHERE id = ?', [pid]);
      await pool.query('INSERT INTO permit_request (program_id, location_id, stage) VALUES (?, ?, ?)',
        [pid, prog?.location_id || null, 'needs_permit']);
      created++;
    }
    res.json({ success: true, created });
  } catch (err) { next(err); }
});

// PATCH /api/permits/:id/advance — move to next stage
router.patch('/:id/advance', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[pr]] = await pool.query('SELECT stage FROM permit_request WHERE id = ?', [id]);
    if (!pr) return res.status(404).json({ success: false, error: 'Not found' });

    const transitions = {
      needs_permit: { next: 'pending_approval', field: 'sent_at', userField: 'sent_by_user_id' },
      pending_approval: { next: 'confirm_payment', field: 'approved_at', userField: 'approved_by_user_id' },
      confirm_payment: { next: 'payment_processing', field: 'payment_requested_at', userField: 'payment_requested_by_user_id' },
    };
    const t = transitions[pr.stage];
    if (!t) return res.status(400).json({ success: false, error: 'Cannot advance from this stage' });

    const sets = [`stage = ?`, `${t.field} = NOW()`, `${t.userField} = ?`];
    const vals = [t.next, req.user.userId];

    // For payment stage, include request_to user
    if (pr.stage === 'confirm_payment' && req.body.payment_request_to_user_id) {
      sets.push('payment_request_to_user_id = ?');
      vals.push(req.body.payment_request_to_user_id);
    }

    await pool.query(`UPDATE permit_request SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/permits/:id/revert — move back one stage
router.patch('/:id/revert', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[pr]] = await pool.query('SELECT stage FROM permit_request WHERE id = ?', [id]);
    if (!pr) return res.status(404).json({ success: false, error: 'Not found' });

    const revertMap = {
      pending_approval: 'needs_permit',
      confirm_payment: 'pending_approval',
      payment_processing: 'confirm_payment',
    };
    const prev = revertMap[pr.stage];
    if (!prev) return res.status(400).json({ success: false, error: 'Cannot revert from this stage' });

    await pool.query('UPDATE permit_request SET stage = ? WHERE id = ?', [prev, id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/permits/:id/payment — mark payment made + optionally add to program
router.patch('/:id/payment', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { payment_amount, add_to_program, payment_cut_type } = req.body;

    await pool.query(
      `UPDATE permit_request SET payment_amount = ?, payment_made_at = NOW(), payment_made_by_user_id = ?,
        payment_added_to_program = ?, payment_cut_type = ?, resolved = 1
       WHERE id = ?`,
      [payment_amount || 0, req.user.userId, add_to_program ? 1 : 0, payment_cut_type || null, id]
    );

    // Add to program's admin cut if requested
    if (add_to_program && payment_amount) {
      const [[pr]] = await pool.query('SELECT program_id FROM permit_request WHERE id = ?', [id]);
      if (pr) {
        if (payment_cut_type === 'per_session') {
          // Add per-session cost to our_cut
          const [[prog]] = await pool.query('SELECT our_cut, session_count FROM program WHERE id = ?', [pr.program_id]);
          const perSession = prog?.session_count > 0 ? parseFloat(payment_amount) / prog.session_count : parseFloat(payment_amount);
          await pool.query('UPDATE program SET our_cut = COALESCE(our_cut, 0) + ? WHERE id = ?', [perSession, pr.program_id]);
        } else {
          // Fixed: add full amount to our_cut
          await pool.query('UPDATE program SET our_cut = COALESCE(our_cut, 0) + ? WHERE id = ?', [parseFloat(payment_amount), pr.program_id]);
        }
      }
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/permits/:id/cancel — mark permit for cancellation/refund
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const { cancel_permit, refund_requested } = req.body;
    const sets = [];
    const vals = [];
    if (cancel_permit !== undefined) { sets.push('cancel_permit = ?'); vals.push(cancel_permit ? 1 : 0); }
    if (refund_requested !== undefined) { sets.push('refund_requested = ?'); vals.push(refund_requested ? 1 : 0); }
    if (sets.length) await pool.query(`UPDATE permit_request SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/permits/settings
router.get('/settings', async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'permit_%'");
    const settings = {};
    rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

// PATCH /api/permits/settings
router.patch('/settings', async (req, res, next) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      if (key.startsWith('permit_')) {
        await pool.query('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?', [value, key]);
      }
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
