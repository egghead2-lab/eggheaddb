const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ============================================================
// GUSTO EMPLOYEE CODES
// ============================================================
router.get('/gusto-codes', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT g.*, CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name
       FROM gusto_employee_codes g
       LEFT JOIN professor p ON p.id = g.professor_id
       ORDER BY g.company, g.gusto_last_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/gusto-codes', authenticate, async (req, res, next) => {
  try {
    const { professor_id, company, gusto_employee_id, gusto_last_name, gusto_first_name, nickname } = req.body;
    if (!professor_id || !company || !gusto_employee_id) return res.status(400).json({ success: false, error: 'Professor, company, and Gusto ID required' });
    const [result] = await pool.query(
      `INSERT INTO gusto_employee_codes (professor_id, company, gusto_employee_id, gusto_last_name, gusto_first_name, nickname)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [professor_id, company, gusto_employee_id, gusto_last_name || '', gusto_first_name || '', nickname || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'Duplicate Gusto ID or professor/company combo' });
    next(err);
  }
});

router.put('/gusto-codes/:id', authenticate, async (req, res, next) => {
  try {
    const { gusto_employee_id, gusto_last_name, gusto_first_name, nickname, is_active } = req.body;
    const fields = [], values = [];
    if (gusto_employee_id !== undefined) { fields.push('gusto_employee_id = ?'); values.push(gusto_employee_id); }
    if (gusto_last_name !== undefined) { fields.push('gusto_last_name = ?'); values.push(gusto_last_name); }
    if (gusto_first_name !== undefined) { fields.push('gusto_first_name = ?'); values.push(gusto_first_name); }
    if (nickname !== undefined) { fields.push('nickname = ?'); values.push(nickname); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ success: false, error: 'No fields' });
    await pool.query(`UPDATE gusto_employee_codes SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// PAYROLL RUNS
// ============================================================
// Biweekly anchor: 3/23/26. Every period is 14 days from this anchor.
const BIWEEKLY_ANCHOR = new Date('2026-03-23');

function getBiweeklyPeriods(count = 10) {
  const periods = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  // Find the current period: how many 14-day cycles since anchor
  const msPerDay = 86400000;
  const daysSinceAnchor = Math.floor((now - BIWEEKLY_ANCHOR) / msPerDay);
  const currentCycle = Math.floor(daysSinceAnchor / 14);
  // Generate periods around current (a few past + future)
  for (let i = currentCycle - count + 1; i <= currentCycle + 2; i++) {
    if (i < 0) continue;
    const start = new Date(BIWEEKLY_ANCHOR.getTime() + i * 14 * msPerDay);
    const end = new Date(start.getTime() + 13 * msPerDay);
    periods.push({
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
    });
  }
  return periods;
}

function payrollRunRoutes(tableName, summaryTable) {
  const r = express.Router();

  // GET / — list runs + available biweekly periods
  r.get('/', authenticate, async (req, res, next) => {
    try {
      const [rows] = await pool.query(`SELECT * FROM ${tableName} ORDER BY start_date DESC`);
      const periods = getBiweeklyPeriods();
      // Filter out periods that already have a run
      const existingPeriods = new Set(rows.map(r => `${r.start_date?.toISOString?.()?.split('T')[0] || r.start_date}`));
      const available = periods.filter(p => !existingPeriods.has(p.start_date));
      res.json({ success: true, data: rows, availablePeriods: available });
    } catch (err) { next(err); }
  });

  r.get('/:id', authenticate, async (req, res, next) => {
    try {
      const [[run]] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [req.params.id]);
      if (!run) return res.status(404).json({ success: false, error: 'Run not found' });
      const [summary] = await pool.query(`SELECT * FROM ${summaryTable} WHERE payroll_run_id = ? ORDER BY last_name`, [req.params.id]);
      res.json({ success: true, data: { ...run, summary } });
    } catch (err) { next(err); }
  });

  r.post('/', authenticate, async (req, res, next) => {
    try {
      const { start_date, end_date, notes } = req.body;
      if (!start_date || !end_date) return res.status(400).json({ success: false, error: 'Start and end date required' });
      const [result] = await pool.query(
        `INSERT INTO ${tableName} (start_date, end_date, notes) VALUES (?, ?, ?)`,
        [start_date, end_date, notes || null]
      );
      res.json({ success: true, id: result.insertId });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'Run with these dates already exists' });
      next(err);
    }
  });

  r.patch('/:id', authenticate, async (req, res, next) => {
    try {
      const { notes } = req.body;
      // Only allow notes update (status changes via /commit)
      if (notes === undefined) return res.status(400).json({ success: false, error: 'No fields' });
      await pool.query(`UPDATE ${tableName} SET notes = ? WHERE id = ?`, [notes, req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // POST /:id/commit — lock the run permanently
  r.post('/:id/commit', authenticate, async (req, res, next) => {
    try {
      const [[run]] = await pool.query(`SELECT status FROM ${tableName} WHERE id = ?`, [req.params.id]);
      if (!run) return res.status(404).json({ success: false, error: 'Run not found' });
      if (run.status === 'Committed') return res.status(400).json({ success: false, error: 'Already committed' });
      // Must have summary data
      const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt FROM ${summaryTable} WHERE payroll_run_id = ?`, [req.params.id]);
      if (cnt === 0) return res.status(400).json({ success: false, error: 'Calculate payroll before committing' });
      // Block if any professors are missing Gusto codes
      const [missingGusto] = await pool.query(`SELECT first_name, last_name FROM ${summaryTable} WHERE payroll_run_id = ? AND missing_gusto = 1`, [req.params.id]);
      if (missingGusto.length > 0) {
        const names = missingGusto.map(m => `${m.first_name} ${m.last_name}`).join(', ');
        return res.status(400).json({ success: false, error: `Cannot commit — missing Gusto codes for: ${names}` });
      }
      await pool.query(
        `UPDATE ${tableName} SET status = 'Committed', committed_at = NOW(), committed_by = ? WHERE id = ?`,
        [req.user?.name || 'admin', req.params.id]
      );
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // DELETE /:id — only if not committed
  r.delete('/:id', authenticate, async (req, res, next) => {
    try {
      const [[run]] = await pool.query(`SELECT status FROM ${tableName} WHERE id = ?`, [req.params.id]);
      if (!run) return res.status(404).json({ success: false, error: 'Run not found' });
      if (run.status === 'Committed') return res.status(400).json({ success: false, error: 'Cannot delete a committed payroll run' });
      await pool.query(`DELETE FROM ${summaryTable} WHERE payroll_run_id = ?`, [req.params.id]);
      await pool.query(`DELETE FROM ${tableName} WHERE id = ?`, [req.params.id]);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  return r;
}

router.use('/runs/rocketology', payrollRunRoutes('payroll_runs_rocketology', 'payroll_summary_rocketology'));
router.use('/runs/pes', payrollRunRoutes('payroll_runs_pes', 'payroll_summary_pes'));

// ============================================================
// PROGRAM SESSION PAY
// ============================================================
router.get('/session-pay', authenticate, async (req, res, next) => {
  try {
    const { start, end, flag, professor_id } = req.query;
    let where = ['1=1'];
    const params = [];
    if (start) { where.push('psp.session_date >= ?'); params.push(start); }
    if (end) { where.push('psp.session_date <= ?'); params.push(end); }
    if (flag) { where.push('psp.assist_pay_flag = ?'); params.push(flag); }
    if (professor_id) { where.push('psp.professor_id = ?'); params.push(professor_id); }

    const [rows] = await pool.query(
      `SELECT psp.*, prog.program_nickname,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name
       FROM program_session_pay psp
       LEFT JOIN program prog ON prog.id = psp.program_id
       LEFT JOIN professor p ON p.id = psp.professor_id
       WHERE ${where.join(' AND ')}
       ORDER BY psp.session_date DESC, psp.role`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.patch('/session-pay/:id', authenticate, async (req, res, next) => {
  try {
    const { pay_amount, pay_source, assist_pay_flag, reimbursement_amount, edited_by } = req.body;
    const fields = [], values = [];
    if (pay_amount !== undefined) { fields.push('pay_amount = ?'); values.push(pay_amount); }
    if (pay_source) { fields.push('pay_source = ?'); values.push(pay_source); }
    if (assist_pay_flag) { fields.push('assist_pay_flag = ?'); values.push(assist_pay_flag); }
    if (reimbursement_amount !== undefined) { fields.push('reimbursement_amount = ?'); values.push(reimbursement_amount); }
    fields.push('edited_at = NOW()');
    fields.push('edited_by = ?'); values.push(edited_by || req.user?.name || 'admin');
    await pool.query(`UPDATE program_session_pay SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// MISC PAY
// ============================================================
router.get('/misc-pay', authenticate, async (req, res, next) => {
  try {
    const { reviewed, professor_id, start, end } = req.query;
    let where = ['1=1'];
    const params = [];
    if (reviewed === 'false') where.push('mp.is_reviewed = 0');
    if (reviewed === 'true') where.push('mp.is_reviewed = 1');
    if (professor_id) { where.push('mp.professor_id = ?'); params.push(professor_id); }
    if (start) { where.push('mp.pay_date >= ?'); params.push(start); }
    if (end) { where.push('mp.pay_date <= ?'); params.push(end); }
    const [rows] = await pool.query(
      `SELECT mp.*, CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              prog.program_nickname AS class_name
       FROM misc_pay_entries mp
       LEFT JOIN professor p ON p.id = mp.professor_id
       LEFT JOIN program prog ON prog.id = mp.program_id
       WHERE ${where.join(' AND ')} ORDER BY mp.pay_date DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/misc-pay', authenticate, async (req, res, next) => {
  try {
    const d = req.body;
    const [result] = await pool.query(
      `INSERT INTO misc_pay_entries (professor_id, professor_name_raw, pay_date, submitted_by, pay_type, subtype, description, location, program_id, hourly_pay, hours, manual_total_override, dollar_amount, total_reimbursement)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.professor_id||null, d.professor_name_raw||null, d.pay_date, d.submitted_by||req.user?.name||'', d.pay_type, d.subtype||null, d.description||null, d.location||null, d.program_id||null, d.hourly_pay||null, d.hours||null, d.manual_total_override||null, d.dollar_amount||null, d.total_reimbursement||0]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

router.patch('/misc-pay/:id/review', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE misc_pay_entries SET is_reviewed = 1, reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?`,
      [req.body.reviewed_by || req.user?.name || 'admin', req.body.review_notes || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// ONBOARDING PAY
// ============================================================
router.get('/onboarding-pay', authenticate, async (req, res, next) => {
  try {
    const { reviewed } = req.query;
    let where = '1=1';
    if (reviewed === 'false') where = 'op.is_reviewed = 0';
    const [rows] = await pool.query(
      `SELECT op.*, CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name
       FROM onboarding_pay_entries op LEFT JOIN professor p ON p.id = op.professor_id
       WHERE ${where} ORDER BY op.training_date DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/onboarding-pay', authenticate, async (req, res, next) => {
  try {
    const d = req.body;
    const [result] = await pool.query(
      `INSERT INTO onboarding_pay_entries (professor_id, professor_name_raw, training_date, trainer, submitted_by, trainual_completed, modules_completed, trainual_pay, virtual_training_completed, virtual_training_pay, bg_check_completed, bg_check_cost, training_outcome, terminate_upon_payment, is_rehire, candidate_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.professor_id||null, d.professor_name_raw||null, d.training_date, d.trainer||null, d.submitted_by||req.user?.name||'', d.trainual_completed?1:0, d.modules_completed||null, d.trainual_pay||35, d.virtual_training_completed?1:0, d.virtual_training_pay||40, d.bg_check_completed?1:0, d.bg_check_cost||55, d.training_outcome, d.terminate_upon_payment?1:0, d.is_rehire?1:0, d.candidate_id||null]
    );

    // Mark candidate pay as submitted
    if (d.candidate_id) {
      await pool.query('UPDATE candidate SET onboarding_pay_submitted = 1 WHERE id = ?', [d.candidate_id]);
    }

    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

router.patch('/onboarding-pay/:id/review', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE onboarding_pay_entries SET is_reviewed = 1, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
      [req.body.reviewed_by || req.user?.name || 'admin', req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// FIELD MANAGER TIME
// ============================================================
router.get('/fm-time', authenticate, async (req, res, next) => {
  try {
    const { professor_id, user_id, start, end } = req.query;
    let where = ['1=1'];
    const params = [];
    if (user_id) { where.push('ft.user_id = ?'); params.push(user_id); }
    else if (professor_id) { where.push('ft.professor_id = ?'); params.push(professor_id); }
    if (start) { where.push('ft.work_date >= ?'); params.push(start); }
    if (end) { where.push('ft.work_date <= ?'); params.push(end); }
    const [rows] = await pool.query(
      `SELECT ft.*, CONCAT(u.first_name, ' ', u.last_name) AS user_name,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name
       FROM field_manager_time_entries ft
       LEFT JOIN user u ON u.id = ft.user_id
       LEFT JOIN professor p ON p.id = ft.professor_id
       WHERE ${where.join(' AND ')} ORDER BY ft.work_date DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/fm-time', authenticate, async (req, res, next) => {
  try {
    const d = req.body;
    if (!d.work_date || !d.time_in || !d.time_out) return res.status(400).json({ success: false, error: 'Date, time in/out required' });
    if (!d.user_id && !d.professor_id) return res.status(400).json({ success: false, error: 'user_id or professor_id required' });
    const [result] = await pool.query(
      `INSERT INTO field_manager_time_entries (user_id, professor_id, work_date, time_in, time_out, break_minutes, work_location, field_activities, wfh_activities, professors_contacted, concerns, description)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.user_id||null, d.professor_id||null, d.work_date, d.time_in, d.time_out, d.break_minutes||0, d.work_location||null, d.field_activities||null, d.wfh_activities||null, d.professors_contacted||null, d.concerns||null, d.description||null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

router.patch('/fm-time/:id/approve', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE field_manager_time_entries SET is_approved = 1, approved_by = ?, approved_at = NOW() WHERE id = ?`,
      [req.body.approved_by || req.user?.name || 'admin', req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// MILEAGE
// ============================================================
router.get('/mileage', authenticate, async (req, res, next) => {
  try {
    const { professor_id } = req.query;
    let where = '1=1';
    const params = [];
    if (professor_id) { where = 'ms.professor_id = ?'; params.push(professor_id); }
    const [rows] = await pool.query(
      `SELECT ms.*, CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name
       FROM mileage_submissions ms LEFT JOIN professor p ON p.id = ms.professor_id
       WHERE ${where} ORDER BY ms.submission_date DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/mileage', authenticate, async (req, res, next) => {
  try {
    const d = req.body;
    if (!d.professor_id || !d.submission_date || !d.miles_claimed) return res.status(400).json({ success: false, error: 'Professor, date, and miles required' });
    const [result] = await pool.query(
      `INSERT INTO mileage_submissions (professor_id, submission_date, miles_claimed, reimbursement_total, pdf_link, submitted_by)
       VALUES (?,?,?,?,?,?)`,
      [d.professor_id, d.submission_date, d.miles_claimed, d.reimbursement_total||0, d.pdf_link||null, d.submitted_by||req.user?.name||'']
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

router.patch('/mileage/:id/process', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE mileage_submissions SET is_processed = 1, processed_at = NOW() WHERE id = ?`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// WEEKLY MILEAGE (new odometer-based system)
// ============================================================

// GET /mileage-weeks — list weekly submissions (admin: all, FM: own)
router.get('/mileage-weeks', authenticate, async (req, res, next) => {
  try {
    const { professor_id, user_id, status } = req.query;
    let where = ['1=1'];
    const params = [];
    if (user_id) { where.push('mw.user_id = ?'); params.push(user_id); }
    else if (professor_id) { where.push('mw.professor_id = ?'); params.push(professor_id); }
    if (status) { where.push('mw.status = ?'); params.push(status); }
    const [rows] = await pool.query(
      `SELECT mw.*, CONCAT(u.first_name, ' ', u.last_name) AS user_name,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name
       FROM mileage_weeks mw
       LEFT JOIN user u ON u.id = mw.user_id
       LEFT JOIN professor p ON p.id = mw.professor_id
       WHERE ${where.join(' AND ')} ORDER BY mw.week_start DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /mileage-weeks/:id — single week with daily entries
router.get('/mileage-weeks/:id', authenticate, async (req, res, next) => {
  try {
    const [[week]] = await pool.query(
      `SELECT mw.*, CONCAT(u.first_name, ' ', u.last_name) AS user_name,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name
       FROM mileage_weeks mw
       LEFT JOIN user u ON u.id = mw.user_id
       LEFT JOIN professor p ON p.id = mw.professor_id WHERE mw.id = ?`, [req.params.id]
    );
    if (!week) return res.status(404).json({ success: false, error: 'Not found' });
    const [entries] = await pool.query(
      'SELECT * FROM mileage_daily_entries WHERE mileage_week_id = ? ORDER BY entry_date', [req.params.id]
    );
    res.json({ success: true, data: { ...week, entries } });
  } catch (err) { next(err); }
});

// POST /mileage-weeks — create or get draft week for a professor
router.post('/mileage-weeks', authenticate, async (req, res, next) => {
  try {
    const { professor_id, user_id, week_start } = req.body;
    if (!week_start) return res.status(400).json({ success: false, error: 'week_start required' });
    if (!user_id && !professor_id) return res.status(400).json({ success: false, error: 'user_id or professor_id required' });

    // Calculate week_end (Sunday)
    const ws = new Date(week_start);
    const we = new Date(ws); we.setDate(ws.getDate() + 6);
    const weekEnd = we.toISOString().split('T')[0];

    // Get current rate
    const [[rateSetting]] = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'mileage_reimbursement_rate'");
    const rate = parseFloat(rateSetting?.setting_value) || 0.70;

    // Upsert — return existing draft if one exists (check by user_id first, then professor_id)
    const lookupCol = user_id ? 'user_id' : 'professor_id';
    const lookupVal = user_id || professor_id;
    const [[existing]] = await pool.query(
      `SELECT id FROM mileage_weeks WHERE ${lookupCol} = ? AND week_start = ?`, [lookupVal, week_start]
    );
    if (existing) return res.json({ success: true, id: existing.id, existing: true });

    const [result] = await pool.query(
      'INSERT INTO mileage_weeks (user_id, professor_id, week_start, week_end, reimbursement_rate) VALUES (?,?,?,?,?)',
      [user_id||null, professor_id||null, week_start, weekEnd, rate]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// POST /mileage-weeks/:id/entries — add daily entry
router.post('/mileage-weeks/:id/entries', authenticate, async (req, res, next) => {
  try {
    const { entry_date, odometer_start, odometer_end, description } = req.body;
    if (!entry_date || odometer_start == null || odometer_end == null || !description) {
      return res.status(400).json({ success: false, error: 'Date, odometer start/end, and description required' });
    }
    if (parseFloat(odometer_end) <= parseFloat(odometer_start)) {
      return res.status(400).json({ success: false, error: 'Odometer end must be greater than start' });
    }

    // Verify week is still draft
    const [[week]] = await pool.query('SELECT status, reimbursement_rate FROM mileage_weeks WHERE id = ?', [req.params.id]);
    if (!week) return res.status(404).json({ success: false, error: 'Week not found' });
    if (week.status !== 'draft') return res.status(400).json({ success: false, error: 'Cannot edit a submitted week' });

    const [result] = await pool.query(
      'INSERT INTO mileage_daily_entries (mileage_week_id, entry_date, odometer_start, odometer_end, description) VALUES (?,?,?,?,?)',
      [req.params.id, entry_date, odometer_start, odometer_end, description]
    );

    // Recalculate totals
    await recalcMileageWeek(req.params.id, week.reimbursement_rate);
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// DELETE /mileage-weeks/:weekId/entries/:entryId — remove daily entry
router.delete('/mileage-weeks/:weekId/entries/:entryId', authenticate, async (req, res, next) => {
  try {
    const [[week]] = await pool.query('SELECT status, reimbursement_rate FROM mileage_weeks WHERE id = ?', [req.params.weekId]);
    if (!week) return res.status(404).json({ success: false, error: 'Week not found' });
    if (week.status !== 'draft') return res.status(400).json({ success: false, error: 'Cannot edit a submitted week' });

    await pool.query('DELETE FROM mileage_daily_entries WHERE id = ? AND mileage_week_id = ?', [req.params.entryId, req.params.weekId]);
    await recalcMileageWeek(req.params.weekId, week.reimbursement_rate);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /mileage-weeks/:id/submit — FM submits the week
router.patch('/mileage-weeks/:id/submit', authenticate, async (req, res, next) => {
  try {
    const [[week]] = await pool.query('SELECT status FROM mileage_weeks WHERE id = ?', [req.params.id]);
    if (!week) return res.status(404).json({ success: false, error: 'Not found' });
    if (week.status !== 'draft') return res.status(400).json({ success: false, error: 'Already submitted' });

    // Must have at least one entry
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM mileage_daily_entries WHERE mileage_week_id = ?', [req.params.id]);
    if (cnt === 0) return res.status(400).json({ success: false, error: 'Add at least one daily entry before submitting' });

    await pool.query("UPDATE mileage_weeks SET status = 'submitted', submitted_at = NOW() WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /mileage-weeks/:id/approve — admin approves
router.patch('/mileage-weeks/:id/approve', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      "UPDATE mileage_weeks SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?",
      [req.body.approved_by || req.user?.name || 'admin', req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /mileage-weeks/:id/reject — admin rejects with note
router.patch('/mileage-weeks/:id/reject', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      "UPDATE mileage_weeks SET status = 'rejected', rejection_note = ? WHERE id = ?",
      [req.body.note || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /mileage-weeks/:id/reopen — reopen rejected week back to draft
router.patch('/mileage-weeks/:id/reopen', authenticate, async (req, res, next) => {
  try {
    await pool.query("UPDATE mileage_weeks SET status = 'draft', rejection_note = NULL WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Helper: recalculate week totals
async function recalcMileageWeek(weekId, rate) {
  const [[{ total }]] = await pool.query(
    'SELECT COALESCE(SUM(odometer_end - odometer_start), 0) as total FROM mileage_daily_entries WHERE mileage_week_id = ?', [weekId]
  );
  await pool.query(
    'UPDATE mileage_weeks SET total_miles = ?, reimbursement_total = ? WHERE id = ?',
    [total, (total * rate).toFixed(2), weekId]
  );
}

// ============================================================
// APP SETTINGS (mileage rate, etc.)
// ============================================================
router.get('/settings', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM app_settings');
    const settings = {};
    rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

router.put('/settings/:key', authenticate, async (req, res, next) => {
  try {
    const adminRoles = ['Admin', 'CEO'];
    if (!adminRoles.includes(req.user?.role)) return res.status(403).json({ success: false, error: 'Admin only' });
    await pool.query(
      'INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)',
      [req.params.key, req.body.value, req.user?.name || 'admin']
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// PAYROLL SUMMARY CALCULATION
// ============================================================
router.post('/runs/rocketology/:id/calculate', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[run]] = await pool.query(`SELECT * FROM payroll_runs_rocketology WHERE id = ?`, [id]);
    if (!run) return res.status(404).json({ success: false, error: 'Run not found' });
    if (run.status === 'Committed') return res.status(400).json({ success: false, error: 'Cannot recalculate a committed payroll run' });

    // Clear existing summary for recalculation
    await pool.query(`DELETE FROM payroll_summary_rocketology WHERE payroll_run_id = ?`, [id]);

    // Find ALL professors who have any pay in this period (session pay, misc, onboarding, party, mileage)
    const [profIds] = await pool.query(
      `SELECT DISTINCT professor_id FROM (
        SELECT professor_id FROM program_session_pay WHERE session_date BETWEEN ? AND ?
        UNION SELECT professor_id FROM misc_pay_entries WHERE pay_date BETWEEN ? AND ?
        UNION SELECT professor_id FROM onboarding_pay_entries WHERE training_date BETWEEN ? AND ?
        UNION SELECT professor_id FROM party_session_pay WHERE created_at BETWEEN ? AND ?
        UNION SELECT professor_id FROM mileage_submissions WHERE submission_date BETWEEN ? AND ?
      ) AS all_profs WHERE professor_id IS NOT NULL`,
      [run.start_date, run.end_date, run.start_date, run.end_date, run.start_date, run.end_date,
       run.start_date, run.end_date, run.start_date, run.end_date]
    );

    // Get Gusto codes lookup
    const [gustoCodes] = await pool.query(
      `SELECT * FROM gusto_employee_codes WHERE is_active = 1`
    );
    const gustoByProfessor = {};
    gustoCodes.forEach(gc => { gustoByProfessor[gc.professor_id] = gc; });

    // Get FM user IDs to exclude their class/party pay from payroll
    const [fmUsers] = await pool.query("SELECT u.id FROM user u JOIN role r ON r.id = u.role_id WHERE r.role_name = 'Field Manager'");
    const fmUserIds = new Set(fmUsers.map(u => u.id));

    for (const { professor_id } of profIds) {
      const gc = gustoByProfessor[professor_id];

      // Get professor info for name display
      const [[prof]] = await pool.query(
        'SELECT professor_nickname, last_name, first_name, user_id FROM professor WHERE id = ?',
        [professor_id]
      );
      if (!prof) continue;
      const isFM = prof.user_id && fmUserIds.has(prof.user_id);

      // Session pay (skip for Field Managers — they are not paid for class sessions)
      const sessionPay = isFM
        ? { total_hours_pay: 0, total_bonus: 0, total_hours: 0, total_reimb: 0, total_pay: 0, has_missing: 0 }
        : (await pool.query(
        `SELECT COALESCE(SUM(regular_pay_component), 0) AS total_hours_pay,
                COALESCE(SUM(bonus_component), 0) AS total_bonus,
                COALESCE(SUM(class_hours), 0) AS total_hours,
                COALESCE(SUM(reimbursement_amount), 0) AS total_reimb,
                COALESCE(SUM(pay_amount), 0) AS total_pay,
                MAX(assist_pay_flag = 'MISSING') AS has_missing
         FROM program_session_pay
         WHERE professor_id = ? AND session_date BETWEEN ? AND ?`,
        [professor_id, run.start_date, run.end_date]
      ))[0][0];

      // Party pay (skip for Field Managers)
      const partyPay = isFM
        ? { total_pay: 0, total_reimb: 0 }
        : (await pool.query(
        `SELECT COALESCE(SUM(pay_amount), 0) AS total_pay,
                COALESCE(SUM(total_reimbursement), 0) AS total_reimb
         FROM party_session_pay
         WHERE professor_id = ? AND created_at BETWEEN ? AND ?`,
        [professor_id, run.start_date, run.end_date]
      ))[0][0];

      // Misc pay
      const [[miscPay]] = await pool.query(
        `SELECT COALESCE(SUM(COALESCE(manual_total_override, total_pay)), 0) AS total_pay,
                COALESCE(SUM(total_reimbursement), 0) AS total_reimb
         FROM misc_pay_entries
         WHERE professor_id = ? AND pay_date BETWEEN ? AND ? AND is_reviewed = 1`,
        [professor_id, run.start_date, run.end_date]
      );

      // Onboarding pay
      const [[onboardPay]] = await pool.query(
        `SELECT COALESCE(SUM(total_training_pay), 0) AS total_pay
         FROM onboarding_pay_entries
         WHERE professor_id = ? AND training_date BETWEEN ? AND ? AND is_reviewed = 1`,
        [professor_id, run.start_date, run.end_date]
      );

      // Mileage
      const [[mileage]] = await pool.query(
        `SELECT COALESCE(SUM(reimbursement_total), 0) AS total_reimb
         FROM mileage_submissions
         WHERE professor_id = ? AND submission_date BETWEEN ? AND ?`,
        [professor_id, run.start_date, run.end_date]
      );

      // parseFloat all MySQL decimal strings to avoid string concatenation
      const pf = (v) => parseFloat(v) || 0;
      const spPay = pf(sessionPay.total_pay), spReimb = pf(sessionPay.total_reimb), spHours = pf(sessionPay.total_hours);
      const spBonus = pf(sessionPay.total_bonus);
      const ppPay = pf(partyPay.total_pay), ppReimb = pf(partyPay.total_reimb);
      const mpPay = pf(miscPay.total_pay), mpReimb = pf(miscPay.total_reimb);
      const opPay = pf(onboardPay.total_pay);
      const mlReimb = pf(mileage.total_reimb);

      const totalGross = spPay + ppPay + mpPay + opPay;
      const totalReimb = spReimb + ppReimb + mpReimb + mlReimb;

      if (totalGross === 0 && totalReimb === 0) continue;

      const hasGusto = !!gc;
      await pool.query(
        `INSERT INTO payroll_summary_rocketology (payroll_run_id, professor_id, gusto_employee_id, last_name, first_name, employment_title, regular_hours, bonus, reimbursement, live_program_pay, party_pay, misc_pay, onboarding_pay, total_gross_pay, total_reimbursement, has_missing_assist_pay, missing_gusto)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, professor_id,
         hasGusto ? gc.gusto_employee_id : null,
         hasGusto ? gc.gusto_last_name : prof.last_name,
         hasGusto ? gc.gusto_first_name : (prof.first_name || prof.professor_nickname),
         'Live Teaching (Primary)',
         spHours, spBonus + mpPay + opPay + ppPay,
         totalReimb, spPay, ppPay, mpPay, opPay,
         totalGross, totalReimb, sessionPay.has_missing ? 1 : 0, hasGusto ? 0 : 1]
      );
    }

    await pool.query(`UPDATE payroll_runs_rocketology SET status = 'Calculated' WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Summary calculated' });
  } catch (err) { next(err); }
});

// ============================================================
// GUSTO CSV EXPORT
// ============================================================
router.get('/runs/rocketology/:id/csv', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM payroll_summary_rocketology WHERE payroll_run_id = ? ORDER BY last_name`,
      [req.params.id]
    );
    const header = 'last_name,first_name,gusto_employee_id,title,regular_hours,bonus,reimbursement,PTO,Sick Time';
    const lines = rows.map(r =>
      `${r.last_name},${r.first_name},${r.gusto_employee_id},${r.employment_title},${r.regular_hours},${r.bonus},${r.reimbursement},${r.pto_hours},${r.sick_hours}`
    );
    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payroll_rocketology_${req.params.id}.csv`);
    res.send(csv);
  } catch (err) { next(err); }
});

router.get('/runs/pes/:id/csv', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM payroll_summary_pes WHERE payroll_run_id = ? ORDER BY last_name`,
      [req.params.id]
    );
    const header = 'last_name,first_name,gusto_employee_id,title,regular_hours,bonus,reimbursement,PTO,Sick Time';
    const lines = rows.map(r =>
      `${r.last_name},${r.first_name},${r.gusto_employee_id},${r.employment_title},${r.regular_hours},${r.bonus},${r.reimbursement},${r.pto_hours},${r.sick_hours}`
    );
    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payroll_pes_${req.params.id}.csv`);
    res.send(csv);
  } catch (err) { next(err); }
});

// ============================================================
// MISSING GUSTO CODES — professors with pay but no Gusto ID
// ============================================================
router.get('/missing-gusto-codes', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT p.id, CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name, p.email
       FROM program_session_pay psp
       JOIN professor p ON p.id = psp.professor_id
       LEFT JOIN gusto_employee_codes gc ON gc.professor_id = p.id AND gc.is_active = 1
       WHERE gc.id IS NULL
       ORDER BY p.last_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ============================================================
// CSV PREVIEW (JSON, not download)
// ============================================================
router.get('/runs/rocketology/:id/csv-preview', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ps.*, p.professor_nickname
       FROM payroll_summary_rocketology ps
       LEFT JOIN professor p ON p.id = ps.professor_id
       WHERE ps.payroll_run_id = ? ORDER BY ps.last_name`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ============================================================
// SEED TEST DATA
// ============================================================
router.post('/seed-test-data', authenticate, async (req, res, next) => {
  try {
    // Get a few active professors
    const [profs] = await pool.query(
      `SELECT p.id, p.professor_nickname, p.last_name, p.first_name, p.base_pay, p.assist_pay
       FROM professor p
       LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
       WHERE p.active = 1 AND ps.professor_status_name = 'Active'
       LIMIT 5`
    );

    if (!profs.length) return res.status(400).json({ success: false, error: 'No active professors found' });

    let created = { gustoCodes: 0, sessionPay: 0, miscPay: 0 };

    // Create Gusto codes for test professors
    for (const p of profs) {
      const gustoId = p.last_name.toLowerCase().slice(0, 6).padEnd(6, 'x');
      try {
        await pool.query(
          `INSERT IGNORE INTO gusto_employee_codes (professor_id, company, gusto_employee_id, gusto_last_name, gusto_first_name, nickname)
           VALUES (?, 'Rocketology', ?, ?, ?, ?)`,
          [p.id, gustoId, p.last_name, p.first_name || p.professor_nickname, p.professor_nickname]
        );
        created.gustoCodes++;
      } catch (e) { /* ignore dupe */ }
    }

    // Create some session pay entries for today and recent days
    const today = new Date();
    for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
      const date = new Date(today);
      date.setDate(date.getDate() - dayOffset);
      const dateStr = date.toISOString().split('T')[0];

      for (const p of profs.slice(0, 3)) {
        const pay = parseFloat(p.base_pay) || 50;
        const hours = 1;
        const regular = Math.round(hours * 25 * 100) / 100;
        const bonus = Math.round((pay - regular) * 100) / 100;

        try {
          await pool.query(
            `INSERT IGNORE INTO program_session_pay (program_id, session_date, role, professor_id, pay_amount, pay_source, class_hours, regular_pay_component, bonus_component)
             VALUES (1, ?, 'Lead', ?, ?, 'professor_base', ?, ?, ?)`,
            [dateStr, p.id, pay, hours, regular, Math.max(0, bonus)]
          );
          created.sessionPay++;
        } catch (e) { /* ignore dupe */ }
      }
    }

    // Create a misc pay entry
    try {
      await pool.query(
        `INSERT INTO misc_pay_entries (professor_id, pay_date, submitted_by, pay_type, description, hourly_pay, hours)
         VALUES (?, CURDATE(), 'Test Seed', 'Miscellaneous Work', 'Test miscellaneous entry', 25, 2)`,
        [profs[0].id]
      );
      created.miscPay++;
    } catch (e) { /* ignore */ }

    res.json({ success: true, message: 'Test data seeded', created });
  } catch (err) { next(err); }
});

// ============================================================
// PAYROLL RECONCILIATION CHECKS
// ============================================================
router.get('/reconciliation', authenticate, async (req, res, next) => {
  try {
    const { start, end } = req.query;
    // Default to current pay period or last 14 days
    const endDate = end || new Date().toISOString().split('T')[0];
    const startDate = start || (() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().split('T')[0]; })();

    // 1. MISSING PAY: Professor assigned to a session but pay resolves to $0 or NULL
    const [missingPay] = await pool.query(
      `SELECT s.id AS session_id, s.session_date, s.session_time,
              prog.id AS program_id, prog.program_nickname,
              'Lead' AS role,
              COALESCE(s.professor_id, prog.lead_professor_id) AS professor_id,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              s.professor_pay AS session_pay, prog.lead_professor_pay AS program_pay, p.base_pay
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name = 'Confirmed'
       LEFT JOIN professor p ON p.id = COALESCE(s.professor_id, prog.lead_professor_id)
       WHERE s.active = 1 AND s.session_date BETWEEN ? AND ?
         AND s.not_billed != 1
         AND COALESCE(s.professor_id, prog.lead_professor_id) IS NOT NULL
         AND COALESCE(s.professor_pay, 0) = 0
         AND COALESCE(prog.lead_professor_pay, 0) = 0
         AND COALESCE(p.base_pay, 0) = 0
       UNION ALL
       SELECT s.id AS session_id, s.session_date, s.session_time,
              prog.id AS program_id, prog.program_nickname,
              'Assistant' AS role,
              COALESCE(s.assistant_id, prog.assistant_professor_id) AS professor_id,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              s.assistant_pay AS session_pay, prog.assistant_professor_pay AS program_pay, p.assist_pay AS base_pay
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name = 'Confirmed'
       LEFT JOIN professor p ON p.id = COALESCE(s.assistant_id, prog.assistant_professor_id)
       WHERE s.active = 1 AND s.session_date BETWEEN ? AND ?
         AND s.not_billed != 1
         AND COALESCE(s.assistant_id, prog.assistant_professor_id) IS NOT NULL
         AND COALESCE(s.assistant_pay, 0) = 0
         AND COALESCE(prog.assistant_professor_pay, 0) = 0
         AND COALESCE(p.assist_pay, 0) = 0
       ORDER BY session_date, program_nickname`,
      [startDate, endDate, startDate, endDate]
    );

    // 2. ORPHAN PAY: Session has pay set but no professor (someone deleted?)
    const [orphanPay] = await pool.query(
      `SELECT s.id AS session_id, s.session_date, s.session_time,
              prog.id AS program_id, prog.program_nickname,
              'Lead' AS role,
              s.professor_pay AS pay_amount
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name = 'Confirmed'
       WHERE s.active = 1 AND s.session_date BETWEEN ? AND ?
         AND s.not_billed != 1
         AND COALESCE(s.professor_pay, 0) > 0
         AND s.professor_id IS NULL AND prog.lead_professor_id IS NULL
       UNION ALL
       SELECT s.id AS session_id, s.session_date, s.session_time,
              prog.id AS program_id, prog.program_nickname,
              'Assistant' AS role,
              s.assistant_pay AS pay_amount
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name = 'Confirmed'
       WHERE s.active = 1 AND s.session_date BETWEEN ? AND ?
         AND s.not_billed != 1
         AND COALESCE(s.assistant_pay, 0) > 0
         AND s.assistant_id IS NULL AND prog.assistant_professor_id IS NULL
       ORDER BY session_date, program_nickname`,
      [startDate, endDate, startDate, endDate]
    );

    // 3. GHOST SESSIONS: Billable session with no professor AND no pay — needs a teacher
    const [ghostSessions] = await pool.query(
      `SELECT s.id AS session_id, s.session_date, s.session_time,
              prog.id AS program_id, prog.program_nickname,
              loc.nickname AS location_nickname
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name = 'Confirmed'
       LEFT JOIN location loc ON loc.id = prog.location_id
       WHERE s.active = 1 AND s.session_date BETWEEN ? AND ?
         AND s.not_billed != 1
         AND s.professor_id IS NULL AND prog.lead_professor_id IS NULL
         AND COALESCE(s.professor_pay, 0) = 0
       ORDER BY s.session_date, prog.program_nickname`,
      [startDate, endDate]
    );

    // 4. SUM TOTALS: Category sums for the date range (from source tables)
    const [[sessionSums]] = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN role = 'Lead' THEN pay_amount ELSE 0 END), 0) AS lead_pay,
              COALESCE(SUM(CASE WHEN role = 'Assistant' THEN pay_amount ELSE 0 END), 0) AS assist_pay,
              COALESCE(SUM(pay_amount), 0) AS total_session_pay
       FROM program_session_pay WHERE session_date BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    const [[miscSums]] = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(manual_total_override, total_pay)), 0) AS total_misc_pay
       FROM misc_pay_entries WHERE pay_date BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    const [[onboardSums]] = await pool.query(
      `SELECT COALESCE(SUM(total_training_pay), 0) AS total_onboarding_pay
       FROM onboarding_pay_entries WHERE training_date BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    const [[partySums]] = await pool.query(
      `SELECT COALESCE(SUM(pay_amount), 0) AS total_party_pay
       FROM party_session_pay WHERE created_at BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    res.json({
      success: true,
      dateRange: { start: startDate, end: endDate },
      issues: {
        missingPay,
        orphanPay,
        ghostSessions,
      },
      totals: {
        leadPay: parseFloat(sessionSums.lead_pay),
        assistPay: parseFloat(sessionSums.assist_pay),
        totalSessionPay: parseFloat(sessionSums.total_session_pay),
        miscPay: parseFloat(miscSums.total_misc_pay),
        onboardingPay: parseFloat(onboardSums.total_onboarding_pay),
        partyPay: parseFloat(partySums.total_party_pay),
      },
    });
  } catch (err) { next(err); }
});

// ============================================================
// NIGHTLY JOB — Manual trigger + logs
// ============================================================
router.post('/nightly-job/run', authenticate, async (req, res, next) => {
  try {
    const { runNightlyPayJob } = require('../services/payrollNightlyJob');
    const result = await runNightlyPayJob();
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/nightly-job/logs', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM nightly_job_logs ORDER BY run_date DESC LIMIT 30`);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /nightly-job/backfill — run nightly job logic for a historical date range
router.post('/nightly-job/backfill', authenticate, async (req, res, next) => {
  try {
    const { start_date, end_date } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ success: false, error: 'start_date and end_date required' });

    const STANDARD_HOURLY = 25.00;
    let totalWritten = 0;
    let totalSkipped = 0;
    let errors = 0;
    const errorDetails = [];

    // Get all sessions in the date range
    const [sessions] = await pool.query(
      `SELECT s.id AS session_id, s.program_id, s.session_date, s.session_time,
              s.professor_id AS session_professor_id, s.professor_pay AS session_professor_pay,
              s.assistant_id AS session_assistant_id, s.assistant_pay AS session_assistant_pay,
              s.not_billed,
              prog.program_nickname, prog.class_length_minutes,
              prog.lead_professor_id, prog.lead_professor_pay,
              prog.assistant_professor_id, prog.assistant_professor_pay,
              l.lesson_name
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name = 'Confirmed'
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.active = 1 AND s.session_date BETWEEN ? AND ?`,
      [start_date, end_date]
    );

    for (const s of sessions) {
      try {
        // 45+ minutes counts as a full hour for pay
        const mins = s.class_length_minutes || 60;
        const classHours = mins >= 45 ? Math.ceil(mins / 60) : mins / 60;

        // === LEAD ===
        const leadProfId = s.session_professor_id || s.lead_professor_id;
        if (leadProfId) {
          let payAmount = 0, paySource = 'professor_base';
          if (s.session_professor_pay && s.session_professor_pay > 0) {
            payAmount = parseFloat(s.session_professor_pay); paySource = 'session';
          } else if (s.lead_professor_pay && s.lead_professor_pay > 0) {
            payAmount = parseFloat(s.lead_professor_pay); paySource = 'professor_base';
          } else {
            const [[prof]] = await pool.query('SELECT base_pay FROM professor WHERE id = ?', [leadProfId]);
            if (prof?.base_pay) { payAmount = parseFloat(prof.base_pay); paySource = 'professor_base'; }
          }

          if (payAmount > 0) {
            const isSubstitute = s.session_professor_id && s.session_professor_id !== s.lead_professor_id;
            const regularPay = Math.round(classHours * STANDARD_HOURLY * 100) / 100;
            const bonus = Math.round((payAmount - regularPay) * 100) / 100;

            const [[existing]] = await pool.query(
              `SELECT id FROM program_session_pay WHERE program_id = ? AND session_date = ? AND role = 'Lead' AND professor_id = ?`,
              [s.program_id, s.session_date, leadProfId]
            );
            if (!existing) {
              await pool.query(
                `INSERT INTO program_session_pay (program_id, session_id, session_date, lesson_name, role, professor_id, is_substitute, pay_amount, pay_source, class_hours, regular_pay_component, bonus_component)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                [s.program_id, s.session_id, s.session_date, s.lesson_name || null, 'Lead', leadProfId, isSubstitute ? 1 : 0, payAmount, paySource, classHours, regularPay, bonus]
              );
              totalWritten++;
            } else { totalSkipped++; }
          }
        }

        // === ASSISTANT ===
        const asstProfId = s.session_assistant_id || s.assistant_professor_id;
        if (asstProfId) {
          let payAmount = 0, paySource = 'professor_base', assistFlag = 'OK';
          if (s.session_assistant_pay && s.session_assistant_pay > 0) {
            payAmount = parseFloat(s.session_assistant_pay); paySource = 'session';
          } else if (s.assistant_professor_pay && s.assistant_professor_pay > 0) {
            payAmount = parseFloat(s.assistant_professor_pay); paySource = 'professor_base';
          } else {
            const [[prof]] = await pool.query('SELECT assist_pay FROM professor WHERE id = ?', [asstProfId]);
            if (prof?.assist_pay) { payAmount = parseFloat(prof.assist_pay); paySource = 'professor_base'; }
            else { assistFlag = 'MISSING'; }
          }

          const regularPay = Math.round(classHours * STANDARD_HOURLY * 100) / 100;
          const bonus = Math.round((payAmount - regularPay) * 100) / 100;

          const [[existing]] = await pool.query(
            `SELECT id FROM program_session_pay WHERE program_id = ? AND session_date = ? AND role = 'Assistant' AND professor_id = ?`,
            [s.program_id, s.session_date, asstProfId]
          );
          if (!existing) {
            await pool.query(
              `INSERT INTO program_session_pay (program_id, session_id, session_date, lesson_name, role, professor_id, is_substitute, pay_amount, pay_source, assist_pay_flag, class_hours, regular_pay_component, bonus_component)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [s.program_id, s.session_id, s.session_date, s.lesson_name || null, 'Assistant', asstProfId, 0, payAmount, paySource, assistFlag, classHours, regularPay, Math.max(0, bonus)]
            );
            totalWritten++;
          } else { totalSkipped++; }
        }
      } catch (err) {
        errors++;
        errorDetails.push(`Session ${s.session_id} (${s.program_nickname}): ${err.message}`);
      }
    }

    res.json({
      success: true,
      sessionsFound: sessions.length,
      recordsWritten: totalWritten,
      skipped: totalSkipped,
      errors,
      errorDetails: errorDetails.length ? errorDetails : undefined,
    });
  } catch (err) { next(err); }
});

module.exports = router;
