/**
 * Sales Commission routes — mounted at /api/commission.
 * V1 scope: admin cleanup + data health. Run/engine/salesperson endpoints come next.
 */
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const ADMIN_ROLES = ['Admin', 'CEO'];
const SALES_MGR_ROLES = ['Admin', 'CEO'];
const SALES_ROLES = ['Admin', 'CEO', 'Sales', 'Bidding Specialist'];

function requireAdmin(req, res, next) {
  if (!ADMIN_ROLES.includes(req.user?.role)) return res.status(403).json({ success: false, error: 'Admin only' });
  next();
}

// ─── Data Health ─────────────────────────────────────────────────────
// Every signal listed in spec §3.5, plus counts for the cleanup UI.
router.get('/data-health', requireAdmin, async (req, res, next) => {
  try {
    // 1. Contractors missing retained flag
    const [missingContractorRetained] = await pool.query(
      `SELECT c.id, c.contractor_name,
              (SELECT COUNT(*) FROM program pr
                 JOIN location lo ON lo.id = pr.location_id
                 WHERE lo.contractor_id = c.id AND pr.active = 1
                   AND pr.first_session_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)) AS recent_programs
       FROM contractor c
       WHERE c.active = 1 AND c.retained IS NULL
       ORDER BY recent_programs DESC, c.contractor_name`
    );

    // 2. Standalone locations missing retained_commission flag
    const [missingLocationRetained] = await pool.query(
      `SELECT l.id, l.nickname, l.school_name,
              (SELECT COUNT(*) FROM program pr WHERE pr.location_id = l.id AND pr.active = 1
                 AND pr.first_session_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)) AS recent_programs
       FROM location l
       WHERE l.active = 1 AND l.contractor_id IS NULL AND l.retained_commission IS NULL
       ORDER BY recent_programs DESC, l.nickname`
    );

    // 3. Contractors with no active salesperson
    const [contractorsNoRep] = await pool.query(
      `SELECT c.id, c.contractor_name,
              (SELECT COUNT(*) FROM program pr
                 JOIN location lo ON lo.id = pr.location_id
                 WHERE lo.contractor_id = c.id AND pr.active = 1
                   AND pr.first_session_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)) AS recent_programs
       FROM contractor c
       LEFT JOIN contractor_salesperson cs ON cs.contractor_id = c.id AND cs.active = 1
         AND (cs.effective_to IS NULL OR cs.effective_to >= CURDATE())
       WHERE c.active = 1 AND cs.id IS NULL
       ORDER BY recent_programs DESC, c.contractor_name`
    );

    // 4. Contractors where splits don't sum to 100
    const [splitMismatch] = await pool.query(
      `SELECT c.id, c.contractor_name, ROUND(SUM(cs.split_pct), 4) AS total_split
       FROM contractor c
       JOIN contractor_salesperson cs ON cs.contractor_id = c.id AND cs.active = 1
         AND (cs.effective_to IS NULL OR cs.effective_to >= CURDATE())
       WHERE c.active = 1
       GROUP BY c.id, c.contractor_name
       HAVING ABS(total_split - 1.0000) > 0.0001
       ORDER BY c.contractor_name`
    );

    // 5. Standalone locations with no active salesperson
    const [locationsNoRep] = await pool.query(
      `SELECT l.id, l.nickname, l.school_name,
              (SELECT COUNT(*) FROM program pr WHERE pr.location_id = l.id AND pr.active = 1
                 AND pr.first_session_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)) AS recent_programs
       FROM location l
       LEFT JOIN location_salesperson ls ON ls.location_id = l.id AND ls.active = 1
         AND (ls.effective_to IS NULL OR ls.effective_to >= CURDATE())
       WHERE l.active = 1 AND l.contractor_id IS NULL AND ls.id IS NULL
       ORDER BY recent_programs DESC, l.nickname`
    );

    res.json({
      success: true,
      data: {
        missingContractorRetained,
        missingLocationRetained,
        contractorsNoRep,
        splitMismatch,
        locationsNoRep,
      },
    });
  } catch (err) { next(err); }
});

// ─── Contractor commission settings ─────────────────────────────────
// PATCH /api/commission/contractors/:id  { retained, non_initial_client }
router.patch('/contractors/:id', requireAdmin, async (req, res, next) => {
  try {
    const { retained, non_initial_client } = req.body;
    const fields = [], vals = [];
    if (retained !== undefined) {
      if (retained === null) return res.status(400).json({ success: false, error: 'retained cannot be set back to NULL' });
      fields.push('retained = ?'); vals.push(retained ? 1 : 0);
    }
    if (non_initial_client !== undefined) { fields.push('non_initial_client = ?'); vals.push(non_initial_client ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update' });
    await pool.query(`UPDATE contractor SET ${fields.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Contractor salespeople list
router.get('/contractors/:id/salespeople', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT cs.id, cs.user_id, cs.split_pct, cs.effective_from, cs.effective_to, cs.notes, cs.active,
              u.first_name, u.last_name, u.email
       FROM contractor_salesperson cs
       JOIN user u ON u.id = cs.user_id
       WHERE cs.contractor_id = ?
       ORDER BY cs.active DESC, cs.effective_from DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Replace entire active salesperson set for a contractor with new rows (transactional)
// Body: { salespeople: [{ user_id, split_pct, effective_from?, notes? }, ...] }
router.post('/contractors/:id/salespeople', requireAdmin, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { salespeople } = req.body;
    if (!Array.isArray(salespeople) || salespeople.length === 0) {
      return res.status(400).json({ success: false, error: 'salespeople array required (at least one)' });
    }
    const totalSplit = salespeople.reduce((s, sp) => s + parseFloat(sp.split_pct || 0), 0);
    if (Math.abs(totalSplit - 1) > 0.0001) {
      return res.status(400).json({ success: false, error: `Splits must sum to 1.0 (got ${totalSplit.toFixed(4)})` });
    }
    const today = new Date().toISOString().split('T')[0];
    // Close existing active rows
    await conn.query(
      `UPDATE contractor_salesperson SET effective_to = ?, active = 0
       WHERE contractor_id = ? AND active = 1 AND (effective_to IS NULL OR effective_to >= CURDATE())`,
      [today, req.params.id]
    );
    for (const sp of salespeople) {
      await conn.query(
        `INSERT INTO contractor_salesperson (contractor_id, user_id, split_pct, effective_from, notes, created_by_user_id, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [req.params.id, sp.user_id, sp.split_pct, sp.effective_from || today, sp.notes || null, req.user.userId]
      );
    }
    // Legacy field — store the user_id of the highest-split rep
    const primary = salespeople.slice().sort((a, b) => b.split_pct - a.split_pct)[0];
    await conn.query(`UPDATE contractor SET salesperson_user_id = ? WHERE id = ?`, [primary.user_id, req.params.id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
});

// ─── Location commission settings (standalone only) ─────────────────
router.patch('/locations/:id', requireAdmin, async (req, res, next) => {
  try {
    const { retained_commission, non_initial_client } = req.body;
    // Enforce: location must be standalone (no contractor)
    const [[loc]] = await pool.query('SELECT contractor_id FROM location WHERE id = ?', [req.params.id]);
    if (!loc) return res.status(404).json({ success: false, error: 'Location not found' });
    if (loc.contractor_id) {
      return res.status(400).json({ success: false, error: 'Location has a contractor — commission settings inherit from there' });
    }
    const fields = [], vals = [];
    if (retained_commission !== undefined) {
      if (retained_commission === null) return res.status(400).json({ success: false, error: 'retained_commission cannot be NULL' });
      fields.push('retained_commission = ?'); vals.push(retained_commission ? 1 : 0);
    }
    if (non_initial_client !== undefined) { fields.push('non_initial_client = ?'); vals.push(non_initial_client ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update' });
    await pool.query(`UPDATE location SET ${fields.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/locations/:id/salespeople', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ls.id, ls.user_id, ls.split_pct, ls.effective_from, ls.effective_to, ls.notes, ls.active,
              u.first_name, u.last_name, u.email
       FROM location_salesperson ls
       JOIN user u ON u.id = ls.user_id
       WHERE ls.location_id = ?
       ORDER BY ls.active DESC, ls.effective_from DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/locations/:id/salespeople', requireAdmin, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Enforce standalone
    const [[loc]] = await conn.query('SELECT contractor_id FROM location WHERE id = ?', [req.params.id]);
    if (!loc) return res.status(404).json({ success: false, error: 'Location not found' });
    if (loc.contractor_id) {
      return res.status(400).json({ success: false, error: 'Contractor-backed locations inherit salespeople from the contractor' });
    }
    const { salespeople } = req.body;
    if (!Array.isArray(salespeople) || salespeople.length === 0) {
      return res.status(400).json({ success: false, error: 'salespeople array required' });
    }
    const totalSplit = salespeople.reduce((s, sp) => s + parseFloat(sp.split_pct || 0), 0);
    if (Math.abs(totalSplit - 1) > 0.0001) {
      return res.status(400).json({ success: false, error: `Splits must sum to 1.0 (got ${totalSplit.toFixed(4)})` });
    }
    const today = new Date().toISOString().split('T')[0];
    await conn.query(
      `UPDATE location_salesperson SET effective_to = ?, active = 0
       WHERE location_id = ? AND active = 1 AND (effective_to IS NULL OR effective_to >= CURDATE())`,
      [today, req.params.id]
    );
    for (const sp of salespeople) {
      await conn.query(
        `INSERT INTO location_salesperson (location_id, user_id, split_pct, effective_from, notes, created_by_user_id, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [req.params.id, sp.user_id, sp.split_pct, sp.effective_from || today, sp.notes || null, req.user.userId]
      );
    }
    await conn.commit();
    res.json({ success: true });
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
});

// Available salespeople (to pick from in the UI)
router.get('/salespeople', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, r.role_name
       FROM user u JOIN role r ON r.id = u.role_id
       WHERE u.active = 1 AND r.role_name IN (?)
       ORDER BY u.first_name, u.last_name`,
      [SALES_ROLES]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ─── Admin: Run management ──────────────────────────────────────────
const run = require('../services/commissionRun');

function periodBounds(periodStart) {
  const d = new Date(periodStart);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

// GET /api/commission/admin/runs — list with filters
router.get('/admin/runs', requireAdmin, async (req, res, next) => {
  try {
    const { user_id, period_start, status } = req.query;
    const where = ['cr.active = 1'];
    const params = [];
    if (user_id) { where.push('cr.user_id = ?'); params.push(user_id); }
    if (period_start) { where.push('cr.period_start = ?'); params.push(period_start); }
    if (status) { where.push('cr.status = ?'); params.push(status); }
    const [rows] = await pool.query(
      `SELECT cr.*, u.first_name, u.last_name, u.email
       FROM commission_run cr JOIN user u ON u.id = cr.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY cr.period_start DESC, u.last_name`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/commission/admin/runs — create single run
router.post('/admin/runs', requireAdmin, async (req, res, next) => {
  try {
    const { user_id, period_start } = req.body;
    if (!user_id || !period_start) return res.status(400).json({ success: false, error: 'user_id + period_start required' });
    const { start, end } = periodBounds(period_start);
    const out = await run.createRun(user_id, start, end, req.user.userId);
    if (!out.existed) await run.calculateRun(out.id, req.user.userId);
    res.json({ success: true, id: out.id, existed: out.existed });
  } catch (err) { next(err); }
});

// POST /api/commission/admin/runs/batch — create + calc for every active salesperson in Sales role + plan users
router.post('/admin/runs/batch', requireAdmin, async (req, res, next) => {
  try {
    const { period_start } = req.body;
    if (!period_start) return res.status(400).json({ success: false, error: 'period_start required' });
    const { start, end } = periodBounds(period_start);

    // Everyone with an active plan covering the period
    const [users] = await pool.query(
      `SELECT DISTINCT user_id FROM salesperson_commission_plan
       WHERE active = 1 AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`,
      [end, end]
    );

    const results = [];
    for (const u of users) {
      try {
        const out = await run.createRun(u.user_id, start, end, req.user.userId);
        if (!out.existed) await run.calculateRun(out.id, req.user.userId);
        results.push({ user_id: u.user_id, run_id: out.id, existed: out.existed });
      } catch (e) {
        results.push({ user_id: u.user_id, error: e.message });
      }
    }
    res.json({ success: true, results });
  } catch (err) { next(err); }
});

// GET /api/commission/admin/runs/:id — detail + lines
router.get('/admin/runs/:id', requireAdmin, async (req, res, next) => {
  try {
    const [[r]] = await pool.query(
      `SELECT cr.*, u.first_name, u.last_name, u.email,
              p.monthly_quota, p.initial_rate, p.rebook_rate, p.non_retained_flat_fee
       FROM commission_run cr
       JOIN user u ON u.id = cr.user_id
       JOIN salesperson_commission_plan p ON p.id = cr.plan_id
       WHERE cr.id = ?`, [req.params.id]
    );
    if (!r) return res.status(404).json({ success: false, error: 'Not found' });
    const [lines] = await pool.query(
      `SELECT crl.*, prog.program_nickname, loc.nickname AS location_nickname,
              con.contractor_name
       FROM commission_run_line crl
       LEFT JOIN program prog ON prog.id = crl.program_id
       LEFT JOIN location loc ON loc.id = crl.location_id
       LEFT JOIN contractor con ON con.id = crl.contractor_id
       WHERE crl.commission_run_id = ?
       ORDER BY crl.line_type, con.contractor_name, prog.program_nickname`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...r, lines } });
  } catch (err) { next(err); }
});

// POST /api/commission/admin/runs/:id/recalculate
router.post('/admin/runs/:id/recalculate', requireAdmin, async (req, res, next) => {
  try {
    await run.calculateRun(req.params.id, req.user.userId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/commission/admin/runs/:id/lines/:lineId
router.patch('/admin/runs/:id/lines/:lineId', requireAdmin, async (req, res, next) => {
  try {
    await run.updateLine(req.params.id, req.params.lineId, req.body, req.user.userId);
    res.json({ success: true });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// Status transitions
router.post('/admin/runs/:id/submit', requireAdmin, async (req, res, next) => {
  try { await run.transitionStatus(req.params.id, 'draft', 'pending_approval', req.user.userId); res.json({ success: true }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});
router.post('/admin/runs/:id/approve', requireAdmin, async (req, res, next) => {
  try { await run.transitionStatus(req.params.id, 'pending_approval', 'approved', req.user.userId); res.json({ success: true }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});
router.post('/admin/runs/:id/finalize', requireAdmin, async (req, res, next) => {
  try { await run.finalizeRun(req.params.id, req.user.userId); res.json({ success: true }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});
router.post('/admin/runs/:id/reopen', requireAdmin, async (req, res, next) => {
  try { const out = await run.reopenRun(req.params.id, req.user.userId); res.json({ success: true, ...out }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// Audit log
router.get('/admin/runs/:id/audit', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, u.first_name AS actor_first, u.last_name AS actor_last
       FROM commission_run_audit a LEFT JOIN user u ON u.id = a.actor_user_id
       WHERE a.commission_run_id = ?
       ORDER BY a.ts_inserted DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
