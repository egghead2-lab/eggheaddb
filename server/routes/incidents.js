const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// POST /api/incidents — professor submits an incident report
router.post('/', authenticate, async (req, res, next) => {
  try {
    const d = req.body;

    // Get professor id from user
    let professorId = d.professor_id;
    if (!professorId) {
      const [[prof]] = await pool.query('SELECT id FROM professor WHERE user_id = ? AND active = 1', [req.user.userId]);
      if (prof) professorId = prof.id;
    }
    if (!professorId) return res.status(400).json({ success: false, error: 'Professor not found' });

    const [result] = await pool.query(
      `INSERT INTO incident_report (professor_id, program_id, location_id, site_name,
        incident_date, incident_time, severity,
        category_physical, category_verbal, category_accident, category_behavior,
        category_illness, category_injury, category_bullying,
        professors_involved, students_involved, description)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        professorId, d.program_id || null, d.location_id || null, d.site_name || null,
        d.incident_date, d.incident_time || null, d.severity || 'minor',
        d.category_physical ? 1 : 0, d.category_verbal ? 1 : 0,
        d.category_accident ? 1 : 0, d.category_behavior ? 1 : 0,
        d.category_illness ? 1 : 0, d.category_injury ? 1 : 0,
        d.category_bullying ? 1 : 0,
        d.professors_involved || null, d.students_involved || null, d.description,
      ]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// GET /api/incidents — list all (admin/scheduler) or own (professor)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const role = req.user.role || '';
    const ADMIN_ROLES = ['Admin', 'CEO', 'Scheduling Coordinator', 'Field Manager', 'Client Manager'];
    const isAdmin = ADMIN_ROLES.includes(role);
    const { reviewed, professor_id } = req.query;

    let where = 'ir.active = 1';
    const params = [];

    if (!isAdmin) {
      // Professors see only their own
      const [[prof]] = await pool.query('SELECT id FROM professor WHERE user_id = ? AND active = 1', [req.user.userId]);
      if (!prof) return res.json({ success: true, data: [] });
      where += ' AND ir.professor_id = ?';
      params.push(prof.id);
    } else if (professor_id) {
      where += ' AND ir.professor_id = ?';
      params.push(professor_id);
    }

    if (reviewed === 'true') { where += ' AND ir.reviewed = 1'; }
    else if (reviewed === 'false') { where += ' AND ir.reviewed = 0'; }

    const [rows] = await pool.query(
      `SELECT ir.*,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              prog.program_nickname,
              loc.nickname AS location_nickname,
              CONCAT(ru.first_name, ' ', ru.last_name) AS reviewed_by_name
       FROM incident_report ir
       JOIN professor p ON p.id = ir.professor_id
       LEFT JOIN program prog ON prog.id = ir.program_id
       LEFT JOIN location loc ON loc.id = ir.location_id
       LEFT JOIN user ru ON ru.id = ir.reviewed_by_user_id
       WHERE ${where}
       ORDER BY ir.incident_date DESC, ir.ts_inserted DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// PATCH /api/incidents/:id/review — admin acknowledges/resolves
router.patch('/:id/review', authenticate, async (req, res, next) => {
  try {
    const { review_notes, resolution } = req.body;
    await pool.query(
      `UPDATE incident_report SET reviewed = 1, reviewed_by_user_id = ?, reviewed_at = NOW(),
              review_notes = ?, resolution = ?, ts_updated = NOW() WHERE id = ?`,
      [req.user.userId, review_notes || null, resolution || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
