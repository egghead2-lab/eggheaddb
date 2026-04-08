const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════
// EVALUATION SCHEDULE CONFIG (admin)
// ═══════════════════════════════════════════════════════════════════

// GET /api/evaluations/schedule-config
router.get('/schedule-config', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM evaluation_schedule WHERE active = 1 ORDER BY sort_order');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// PUT /api/evaluations/schedule-config/:id
router.put('/schedule-config/:id', async (req, res, next) => {
  try {
    const { tier_name, min_days_on_staff, max_days_on_staff, frequency_days } = req.body;
    const sets = []; const vals = [];
    if (tier_name !== undefined) { sets.push('tier_name = ?'); vals.push(tier_name); }
    if (min_days_on_staff !== undefined) { sets.push('min_days_on_staff = ?'); vals.push(min_days_on_staff); }
    if (max_days_on_staff !== undefined) { sets.push('max_days_on_staff = ?'); vals.push(max_days_on_staff === '' ? null : max_days_on_staff); }
    if (frequency_days !== undefined) { sets.push('frequency_days = ?'); vals.push(frequency_days); }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
    await pool.query(`UPDATE evaluation_schedule SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/evaluations/schedule-config
router.post('/schedule-config', async (req, res, next) => {
  try {
    const { tier_name, min_days_on_staff, max_days_on_staff, frequency_days } = req.body;
    if (!tier_name || frequency_days === undefined) return res.status(400).json({ success: false, error: 'Name and frequency required' });
    const [result] = await pool.query(
      'INSERT INTO evaluation_schedule (tier_name, min_days_on_staff, max_days_on_staff, frequency_days, sort_order) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(s.sort_order),0)+1 FROM evaluation_schedule s))',
      [tier_name, min_days_on_staff || 0, max_days_on_staff || null, frequency_days]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// DELETE /api/evaluations/schedule-config/:id
router.delete('/schedule-config/:id', async (req, res, next) => {
  try {
    await pool.query('UPDATE evaluation_schedule SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// PROFESSOR EVALUATION LOG
// ═══════════════════════════════════════════════════════════════════

// GET /api/evaluations/professor/:profId
router.get('/professor/:profId', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT pe.*,
              CONCAT(ep.professor_nickname, ' ', ep.last_name) AS evaluator_name,
              CONCAT(u.first_name, ' ', u.last_name) AS logged_by_name
       FROM professor_evaluation pe
       LEFT JOIN professor ep ON ep.id = pe.evaluator_professor_id
       LEFT JOIN user u ON u.id = pe.evaluator_user_id
       WHERE pe.professor_id = ? AND pe.active = 1
       ORDER BY pe.evaluation_date DESC`,
      [req.params.profId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/evaluations/professor/:profId — log a new evaluation
router.post('/professor/:profId', async (req, res, next) => {
  try {
    const { profId } = req.params;
    const { evaluation_date, evaluator_professor_id, evaluation_type, result, form_link, notes } = req.body;
    if (!evaluation_date) return res.status(400).json({ success: false, error: 'Date required' });

    const [insertResult] = await pool.query(
      `INSERT INTO professor_evaluation (professor_id, evaluation_date, evaluator_professor_id, evaluator_user_id, evaluation_type, result, form_link, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [profId, evaluation_date, evaluator_professor_id || null, req.user.userId, evaluation_type || 'routine', result || null, form_link || null, notes || null]
    );

    // Update professor's last evaluation date/result
    await pool.query(
      'UPDATE professor SET last_evaluation_date = ?, last_evaluation_result = ? WHERE id = ?',
      [evaluation_date, result || null, profId]
    );

    res.json({ success: true, id: insertResult.insertId });
  } catch (err) { next(err); }
});

// PUT /api/evaluations/:id
router.put('/:id', async (req, res, next) => {
  try {
    const fields = ['evaluation_date', 'evaluator_professor_id', 'evaluation_type', 'result', 'form_link', 'notes'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => req.body[f] === '' ? null : req.body[f]);
    await pool.query(`UPDATE professor_evaluation SET ${setClauses}, ts_updated = NOW() WHERE id = ?`, [...values, req.params.id]);

    // If result changed, update professor's last eval
    if (req.body.result !== undefined || req.body.evaluation_date !== undefined) {
      const [[eval_row]] = await pool.query('SELECT professor_id, evaluation_date, result FROM professor_evaluation WHERE id = ?', [req.params.id]);
      if (eval_row) {
        // Check if this is still the latest evaluation
        const [[latest]] = await pool.query(
          'SELECT id FROM professor_evaluation WHERE professor_id = ? AND active = 1 ORDER BY evaluation_date DESC LIMIT 1',
          [eval_row.professor_id]
        );
        if (latest && latest.id === parseInt(req.params.id)) {
          await pool.query('UPDATE professor SET last_evaluation_date = ?, last_evaluation_result = ? WHERE id = ?',
            [eval_row.evaluation_date, req.body.result || eval_row.result, eval_row.professor_id]);
        }
      }
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/evaluations/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('UPDATE professor_evaluation SET active = 0, ts_updated = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// FM DASHBOARD — professors needing evaluations
// ═══════════════════════════════════════════════════════════════════

// GET /api/evaluations/dashboard — returns professors grouped by evaluation urgency
router.get('/dashboard', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { area_id } = req.query;

    // Get evaluation schedule tiers
    const [tiers] = await pool.query('SELECT * FROM evaluation_schedule WHERE active = 1 ORDER BY sort_order');

    // Get field manager's areas (or all if admin/specified)
    let areaWhere = '';
    let areaParams = [];
    // Admin/CEO see all areas; FM sees their assigned areas
    const role = req.user.role || '';
    const isAdmin = ['Admin', 'CEO'].includes(role);

    if (area_id) {
      areaWhere = 'AND p.geographic_area_id = ?';
      areaParams = [area_id];
    } else if (!isAdmin) {
      // Get areas this FM manages
      const [fmAreas] = await pool.query(
        'SELECT id FROM geographic_area WHERE field_manager_user_id = ? AND active = 1', [userId]
      );
      if (fmAreas.length > 0) {
        areaWhere = 'AND p.geographic_area_id IN (?)';
        areaParams = [fmAreas.map(a => a.id)];
      }
    }
    // If isAdmin and no area_id filter, areaWhere stays empty = all areas

    // Get all active professors in these areas
    const [professors] = await pool.query(
      `SELECT p.id, p.professor_nickname, p.last_name, p.hire_date,
              p.last_evaluation_date, p.last_evaluation_result,
              ps.professor_status_name,
              ga.geographic_area_name, ga.id AS area_id
       FROM professor p
       JOIN professor_status ps ON ps.id = p.professor_status_id
       LEFT JOIN geographic_area ga ON ga.id = p.geographic_area_id
       WHERE p.active = 1
         AND ps.professor_status_name IN ('Active', 'Training')
         ${areaWhere}
       ORDER BY p.last_evaluation_date ASC NULLS FIRST, p.hire_date ASC`,
      [...areaParams]
    );

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Compute evaluation status for each professor
    const results = professors.map(p => {
      const hireDate = p.hire_date ? new Date(p.hire_date) : null;
      const daysOnStaff = hireDate ? Math.floor((today - hireDate) / 86400000) : null;

      // Find applicable tier
      let tier = null;
      for (const t of tiers) {
        if (daysOnStaff === null) break;
        if (daysOnStaff >= t.min_days_on_staff && (t.max_days_on_staff === null || daysOnStaff <= t.max_days_on_staff)) {
          tier = t;
          break;
        }
      }

      const lastEvalDate = p.last_evaluation_date ? new Date(p.last_evaluation_date) : null;
      const daysSinceEval = lastEvalDate ? Math.floor((today - lastEvalDate) / 86400000) : null;
      const neverEvaluated = !p.last_evaluation_date;
      const frequencyDays = tier?.frequency_days || 120;

      let daysUntilDue = null;
      let overdueDays = null;
      if (neverEvaluated) {
        // Due immediately if hired
        if (hireDate) {
          // First eval due after frequency_days from hire
          const firstDue = new Date(hireDate);
          firstDue.setDate(firstDue.getDate() + Math.min(frequencyDays, 45));
          daysUntilDue = Math.floor((firstDue - today) / 86400000);
          if (daysUntilDue < 0) overdueDays = Math.abs(daysUntilDue);
        }
      } else {
        const nextDue = new Date(lastEvalDate);
        nextDue.setDate(nextDue.getDate() + frequencyDays);
        daysUntilDue = Math.floor((nextDue - today) / 86400000);
        if (daysUntilDue < 0) overdueDays = Math.abs(daysUntilDue);
      }

      return {
        ...p,
        days_on_staff: daysOnStaff,
        tier_name: tier?.tier_name || 'Unknown',
        frequency_days: frequencyDays,
        days_since_eval: daysSinceEval,
        never_evaluated: neverEvaluated,
        days_until_due: daysUntilDue,
        overdue_days: overdueDays,
        is_overdue: overdueDays !== null && overdueDays > 0,
      };
    });

    // Sort: overdue first (most overdue at top), then never evaluated, then by days until due
    results.sort((a, b) => {
      if (a.is_overdue && !b.is_overdue) return -1;
      if (!a.is_overdue && b.is_overdue) return 1;
      if (a.is_overdue && b.is_overdue) return (b.overdue_days || 0) - (a.overdue_days || 0);
      if (a.never_evaluated && !b.never_evaluated) return -1;
      if (!a.never_evaluated && b.never_evaluated) return 1;
      return (a.days_until_due || 999) - (b.days_until_due || 999);
    });

    res.json({ success: true, data: results, tiers });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// OBSERVATION LOOKUP — outstanding observations needing forms
// ═══════════════════════════════════════════════════════════════════

// GET /api/evaluations/observations/outstanding — observations/evaluations with no form completed
router.get('/observations/outstanding', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { area_id, type } = req.query; // type: 'observation' | 'evaluation' | 'all'

    // Get FM's areas
    let areaWhere = '';
    let areaParams = [];
    const role = req.user.role || '';
    const isAdmin = ['Admin', 'CEO'].includes(role);

    if (area_id) {
      areaWhere = 'AND ga.id = ?';
      areaParams = [area_id];
    } else if (!isAdmin) {
      const [fmAreas] = await pool.query(
        'SELECT id FROM geographic_area WHERE field_manager_user_id = ? AND active = 1', [userId]
      );
      if (fmAreas.length > 0) {
        areaWhere = 'AND ga.id IN (?)';
        areaParams = [fmAreas.map(a => a.id)];
      }
    }

    // Outstanding observations (past date, form not completed, not deleted)
    const [observations] = await pool.query(
      `SELECT po.id, po.professor_id, po.program_id, po.observation_date, po.observation_type,
              po.pay_amount, po.is_paid, po.status, po.form_status, po.notes,
              'observation' AS record_type,
              prog.program_nickname, prog.start_time,
              loc.nickname AS location_nickname, loc.address,
              ga.geographic_area_name,
              CONCAT(obs.professor_nickname, ' ', obs.last_name) AS observer_name,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_name,
              lp.phone_number AS lead_professor_phone
       FROM professor_observation po
       JOIN program prog ON prog.id = po.program_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       LEFT JOIN professor obs ON obs.id = po.professor_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       WHERE po.active = 1
         AND po.observation_date <= CURDATE()
         AND po.form_status = 'pending'
         ${type === 'evaluation' ? "AND po.observation_type = 'evaluation'" : ''}
         ${type === 'observation' ? "AND po.observation_type = 'observation'" : ''}
         ${areaWhere}
       ORDER BY po.observation_date DESC`,
      [...areaParams]
    );

    // Outstanding evaluations (from professor_evaluation table)
    const [evaluations] = await pool.query(
      `SELECT pe.id, pe.professor_id, pe.evaluation_date AS observation_date, pe.evaluation_type AS observation_type,
              pe.result, pe.form_status, pe.notes,
              'evaluation' AS record_type,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS lead_professor_name,
              p.phone_number AS lead_professor_phone,
              ga.geographic_area_name,
              CONCAT(ep.professor_nickname, ' ', ep.last_name) AS observer_name
       FROM professor_evaluation pe
       JOIN professor p ON p.id = pe.professor_id
       LEFT JOIN geographic_area ga ON ga.id = p.geographic_area_id
       LEFT JOIN professor ep ON ep.id = pe.evaluator_professor_id
       WHERE pe.active = 1
         AND pe.evaluation_date <= CURDATE()
         AND (pe.form_status = 'pending' OR pe.form_status IS NULL)
         ${areaWhere.replace(/ga\.id/g, 'ga.id')}
       ORDER BY pe.evaluation_date DESC`,
      [...areaParams]
    );

    const all = [...observations, ...evaluations].sort((a, b) =>
      (a.observation_date || '').localeCompare(b.observation_date || '')
    );

    res.json({ success: true, data: all });
  } catch (err) { next(err); }
});

// GET /api/evaluations/observations/delete-reasons
router.get('/observations/delete-reasons', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM observation_delete_reason WHERE active = 1 ORDER BY sort_order');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/evaluations/observations/delete-reasons (admin)
router.post('/observations/delete-reasons', async (req, res, next) => {
  try {
    const { reason_name } = req.body;
    if (!reason_name?.trim()) return res.status(400).json({ success: false, error: 'Reason required' });
    const [result] = await pool.query(
      'INSERT INTO observation_delete_reason (reason_name, sort_order) VALUES (?, (SELECT COALESCE(MAX(s.sort_order),0)+1 FROM observation_delete_reason s))',
      [reason_name.trim()]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// DELETE /api/evaluations/observations/delete-reasons/:id (admin)
router.delete('/observations/delete-reasons/:id', async (req, res, next) => {
  try {
    await pool.query('UPDATE observation_delete_reason SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/evaluations/observations/:id/delete-with-reason — mark observation as deleted with reason
router.post('/observations/:id/delete-with-reason', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { record_type, delete_reason_id, delete_notes } = req.body;
    if (!delete_reason_id) return res.status(400).json({ success: false, error: 'Reason required' });

    const table = record_type === 'evaluation' ? 'professor_evaluation' : 'professor_observation';
    await pool.query(
      `UPDATE ${table} SET form_status = 'deleted', delete_reason_id = ?, delete_notes = ?, status = 'cancelled', ts_updated = NOW() WHERE id = ?`,
      [delete_reason_id, delete_notes || null, id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/evaluations/observations/:id/submit-form — save the observation form
router.post('/observations/:id/submit-form', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { record_type, form_data, result, notes, observation_type, remediation_followup } = req.body;

    const table = record_type === 'evaluation' ? 'professor_evaluation' : 'professor_observation';
    const sets = ["form_status = 'completed'", "form_data = ?", "status = 'completed'", "completed_at = NOW()"];
    const vals = [JSON.stringify(form_data)];

    if (result) { sets.push('result = ?'); vals.push(result); }
    if (notes) { sets.push('notes = ?'); vals.push(notes); }
    if (remediation_followup) {
      sets.push('remediation_followup = ?');
      vals.push(remediation_followup);
      // Calculate remediation due date
      if (remediation_followup === 'within_2_weeks') {
        sets.push('remediation_due_date = DATE_ADD(CURDATE(), INTERVAL 14 DAY)');
      } else if (remediation_followup === 'within_1_month') {
        sets.push('remediation_due_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY)');
      }
    }

    await pool.query(`UPDATE ${table} SET ${sets.join(', ')}, ts_updated = NOW() WHERE id = ?`, [...vals, id]);

    // Get professor_id for this record
    const [[row]] = await pool.query(`SELECT professor_id, ${table === 'professor_evaluation' ? 'evaluation_date' : 'observation_date'} AS obs_date FROM ${table} WHERE id = ?`, [id]);

    // Only Formal and Peer to Peer count toward official evaluation tracking
    const countsAsOfficial = observation_type === 'formal' || observation_type === 'peer_to_peer';

    if (row && countsAsOfficial) {
      await pool.query('UPDATE professor SET last_evaluation_date = ?, last_evaluation_result = ? WHERE id = ?',
        [row.obs_date, result || null, row.professor_id]);
    }

    // If remediation needed, schedule a follow-up observation
    if (row && remediation_followup && remediation_followup !== 'none') {
      const daysOut = remediation_followup === 'within_2_weeks' ? 14 : 30;
      await pool.query(
        `INSERT INTO professor_observation (professor_id, program_id, observation_date, observation_type, is_paid, assigned_by_user_id, notes, status)
         SELECT ?, COALESCE((SELECT program_id FROM ${table} WHERE id = ?), 0), DATE_ADD(CURDATE(), INTERVAL ? DAY),
                'evaluation', 0, ?, 'Follow-up from remediation', 'scheduled'`,
        [row.professor_id, id, daysOut, req.user.userId]
      );
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
