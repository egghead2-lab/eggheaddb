const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { calcCycle, calcProfessorReimbursement } = require('../services/gasReimbursementService');

router.use(authenticate);

// GET /cycles — list all cycles
router.get('/cycles', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM gas_reimbursement_cycle ORDER BY cycle_year DESC, start_date DESC');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /cycles — create
router.post('/cycles', async (req, res, next) => {
  try {
    const { cycle_name, cycle_year, start_date, end_date } = req.body;
    if (!cycle_name || !cycle_year || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'cycle_name, cycle_year, start_date, end_date required' });
    }
    const [r] = await pool.query(
      `INSERT INTO gas_reimbursement_cycle (cycle_name, cycle_year, start_date, end_date) VALUES (?,?,?,?)`,
      [cycle_name, cycle_year, start_date, end_date]
    );
    res.json({ success: true, id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'Cycle for that name/year already exists' });
    next(err);
  }
});

// PATCH /cycles/:id — update dates
router.patch('/cycles/:id', async (req, res, next) => {
  try {
    const { start_date, end_date } = req.body;
    const fields = [], values = [];
    if (start_date) { fields.push('start_date = ?'); values.push(start_date); }
    if (end_date) { fields.push('end_date = ?'); values.push(end_date); }
    if (!fields.length) return res.status(400).json({ success: false, error: 'No fields' });
    await pool.query(`UPDATE gas_reimbursement_cycle SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /cycles/:id — only if no pushed entries
router.delete('/cycles/:id', async (req, res, next) => {
  try {
    const [[pushed]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM gas_reimbursement_entry WHERE cycle_id = ? AND status = 'Pushed'`,
      [req.params.id]
    );
    if (pushed.cnt > 0) return res.status(400).json({ success: false, error: 'Cannot delete — some entries already pushed to payroll' });
    await pool.query(
      `DELETE gl FROM gas_reimbursement_line gl JOIN gas_reimbursement_entry ge ON ge.id = gl.entry_id WHERE ge.cycle_id = ?`,
      [req.params.id]
    );
    await pool.query('DELETE FROM gas_reimbursement_entry WHERE cycle_id = ?', [req.params.id]);
    await pool.query('DELETE FROM gas_reimbursement_cycle WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /cycles/:id/calculate
router.post('/cycles/:id/calculate', async (req, res, next) => {
  try {
    const result = await calcCycle(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /cycles/:id/entries — list entries (summary per professor)
router.get('/cycles/:id/entries', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ge.*, p.professor_nickname, p.last_name, p.first_name,
              ga.geographic_area_name AS area
       FROM gas_reimbursement_entry ge
       LEFT JOIN professor p ON p.id = ge.professor_id
       LEFT JOIN geographic_area ga ON ga.id = p.geographic_area_id
       WHERE ge.cycle_id = ?
       ORDER BY p.last_name`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /entries/:id — detail with line items
router.get('/entries/:id', async (req, res, next) => {
  try {
    const [[entry]] = await pool.query(
      `SELECT ge.*, p.professor_nickname, p.last_name, p.first_name, p.address AS home_address
       FROM gas_reimbursement_entry ge
       LEFT JOIN professor p ON p.id = ge.professor_id
       WHERE ge.id = ?`,
      [req.params.id]
    );
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
    const [lines] = await pool.query(
      `SELECT gl.*, prog.program_nickname, loc.nickname AS location_nickname
       FROM gas_reimbursement_line gl
       LEFT JOIN program prog ON prog.id = gl.program_id
       LEFT JOIN location loc ON loc.id = gl.location_id
       WHERE gl.entry_id = ?
       ORDER BY gl.session_date, gl.leg_type`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...entry, lines } });
  } catch (err) { next(err); }
});

// POST /entries/:id/push — push to payroll as misc pay entry
router.post('/entries/:id/push', async (req, res, next) => {
  try {
    const [[entry]] = await pool.query(
      `SELECT ge.*, c.cycle_name, c.cycle_year
       FROM gas_reimbursement_entry ge
       JOIN gas_reimbursement_cycle c ON c.id = ge.cycle_id
       WHERE ge.id = ?`,
      [req.params.id]
    );
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
    if (entry.status === 'Pushed') return res.status(400).json({ success: false, error: 'Already pushed' });
    if (entry.total_amount <= 0) return res.status(400).json({ success: false, error: 'Nothing to push — zero reimbursement' });

    const description = `Gas Reimbursement — ${entry.cycle_name} ${entry.cycle_year} (${entry.num_sessions} sessions)`;
    const [mpResult] = await pool.query(
      `INSERT INTO misc_pay_entries (professor_id, pay_date, submitted_by, pay_type, description, manual_total_override, total_reimbursement)
       VALUES (?, CURDATE(), ?, 'Miscellaneous Work', ?, ?, ?)`,
      [entry.professor_id, req.user?.name || 'system', description, entry.total_amount, entry.total_amount]
    );
    await pool.query(
      `UPDATE gas_reimbursement_entry SET status = 'Pushed', misc_pay_entry_id = ?, pushed_at = NOW(), pushed_by = ? WHERE id = ?`,
      [mpResult.insertId, req.user?.name || 'system', req.params.id]
    );
    res.json({ success: true, misc_pay_entry_id: mpResult.insertId });
  } catch (err) { next(err); }
});

// POST /cycles/:id/push-all — push all non-zero draft entries
router.post('/cycles/:id/push-all', async (req, res, next) => {
  try {
    const [entries] = await pool.query(
      `SELECT id FROM gas_reimbursement_entry WHERE cycle_id = ? AND status = 'Draft' AND total_amount > 0`,
      [req.params.id]
    );
    let pushed = 0, errors = 0;
    for (const e of entries) {
      try {
        await new Promise((resolve, reject) => {
          const fakeReq = { params: { id: e.id }, user: req.user };
          const fakeRes = { status: () => fakeRes, json: () => resolve() };
          const fakeNext = (err) => err ? reject(err) : resolve();
          // Reuse logic by calling the push route handler directly
          (async () => {
            try {
              const [[entry]] = await pool.query(
                `SELECT ge.*, c.cycle_name, c.cycle_year FROM gas_reimbursement_entry ge
                 JOIN gas_reimbursement_cycle c ON c.id = ge.cycle_id WHERE ge.id = ?`,
                [e.id]
              );
              if (!entry || entry.status === 'Pushed' || entry.total_amount <= 0) return resolve();
              const description = `Gas Reimbursement — ${entry.cycle_name} ${entry.cycle_year} (${entry.num_sessions} sessions)`;
              const [mpResult] = await pool.query(
                `INSERT INTO misc_pay_entries (professor_id, pay_date, submitted_by, pay_type, description, manual_total_override, total_reimbursement)
                 VALUES (?, CURDATE(), ?, 'Miscellaneous Work', ?, ?, ?)`,
                [entry.professor_id, req.user?.name || 'system', description, entry.total_amount, entry.total_amount]
              );
              await pool.query(
                `UPDATE gas_reimbursement_entry SET status = 'Pushed', misc_pay_entry_id = ?, pushed_at = NOW(), pushed_by = ? WHERE id = ?`,
                [mpResult.insertId, req.user?.name || 'system', e.id]
              );
              pushed++;
              resolve();
            } catch (err) { errors++; resolve(); }
          })();
        });
      } catch (err) { errors++; }
    }
    await pool.query(`UPDATE gas_reimbursement_cycle SET status = 'Pushed' WHERE id = ?`, [req.params.id]);
    res.json({ success: true, pushed, errors });
  } catch (err) { next(err); }
});

// POST /entries/:id/recalculate — recalc a single professor
router.post('/entries/:id/recalculate', async (req, res, next) => {
  try {
    const [[entry]] = await pool.query(
      `SELECT ge.*, c.start_date, c.end_date FROM gas_reimbursement_entry ge
       JOIN gas_reimbursement_cycle c ON c.id = ge.cycle_id WHERE ge.id = ?`,
      [req.params.id]
    );
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
    if (entry.status === 'Pushed') return res.status(400).json({ success: false, error: 'Cannot recalc a pushed entry' });

    const { total, lines, numSessions } = await calcProfessorReimbursement(entry.professor_id, entry.start_date, entry.end_date);
    await pool.query(`DELETE FROM gas_reimbursement_line WHERE entry_id = ?`, [entry.id]);
    await pool.query(
      `UPDATE gas_reimbursement_entry SET total_amount = ?, num_sessions = ?, calculated_at = NOW() WHERE id = ?`,
      [total, numSessions, entry.id]
    );
    for (const line of lines) {
      await pool.query(
        `INSERT INTO gas_reimbursement_line (entry_id, session_date, session_id, program_id, location_id, role, miles, leg_type, amount, calc_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.id, line.session_date, line.session_id, line.program_id, line.location_id, line.role,
         line.miles, line.leg_type, line.amount, line.calc_method]
      );
    }
    res.json({ success: true, total, numSessions });
  } catch (err) { next(err); }
});

module.exports = router;
