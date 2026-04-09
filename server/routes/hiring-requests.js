const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/hiring-requests — list all requests
router.get('/', async (req, res, next) => {
  try {
    const { status, area_id } = req.query;
    let where = 'WHERE hr.active = 1';
    const params = [];
    if (status) { where += ' AND hr.status = ?'; params.push(status); }
    if (area_id) { where += ' AND hr.geographic_area_id = ?'; params.push(area_id); }

    const [rows] = await pool.query(
      `SELECT hr.*,
              ga.geographic_area_name,
              CONCAT(u.first_name, ' ', u.last_name) AS submitted_by_name,
              c.full_name AS candidate_name,
              (SELECT COUNT(*) FROM hiring_request_program hrp WHERE hrp.hiring_request_id = hr.id) AS program_count
       FROM hiring_request hr
       LEFT JOIN geographic_area ga ON ga.id = hr.geographic_area_id
       LEFT JOIN user u ON u.id = hr.submitted_by_user_id
       LEFT JOIN candidate c ON c.id = hr.candidate_id
       ${where}
       ORDER BY FIELD(hr.status, 'open', 'in_progress', 'filled', 'cancelled'), hr.ts_inserted DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/hiring-requests/area-defaults/:areaId (must be before /:id)
router.get('/area-defaults/:areaId', async (req, res, next) => {
  try {
    const [[area]] = await pool.query(
      'SELECT id, geographic_area_name, base_pay_rate, party_pay_rate FROM geographic_area WHERE id = ?',
      [req.params.areaId]
    );
    res.json({ success: true, data: area || {} });
  } catch (err) { next(err); }
});

// GET /api/hiring-requests/:id — detail with programs
router.get('/:id', async (req, res, next) => {
  try {
    const [[hr]] = await pool.query(
      `SELECT hr.*,
              ga.geographic_area_name, ga.base_pay_rate, ga.party_pay_rate,
              CONCAT(u.first_name, ' ', u.last_name) AS submitted_by_name,
              c.full_name AS candidate_name, c.status AS candidate_status
       FROM hiring_request hr
       LEFT JOIN geographic_area ga ON ga.id = hr.geographic_area_id
       LEFT JOIN user u ON u.id = hr.submitted_by_user_id
       LEFT JOIN candidate c ON c.id = hr.candidate_id
       WHERE hr.id = ?`, [req.params.id]
    );
    if (!hr) return res.status(404).json({ success: false, error: 'Not found' });

    const [programs] = await pool.query(
      `SELECT hrp.id AS link_id, hrp.program_id,
              prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.first_session_date, prog.last_session_date,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday,
              loc.nickname AS location_nickname, loc.livescan_required, loc.virtus_required, loc.tb_required
       FROM hiring_request_program hrp
       JOIN program prog ON prog.id = hrp.program_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       WHERE hrp.hiring_request_id = ?`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...hr, programs } });
  } catch (err) { next(err); }
});

// POST /api/hiring-requests — create new request
router.post('/', async (req, res, next) => {
  try {
    const d = req.body;
    const [result] = await pool.query(
      `INSERT INTO hiring_request (submitted_by_user_id, geographic_area_id, city_detail,
        avail_mon_am, avail_mon_pm, avail_tue_am, avail_tue_pm,
        avail_wed_am, avail_wed_pm, avail_thu_am, avail_thu_pm,
        avail_fri_am, avail_fri_pm,
        fulfillment_date, earliest_start_date, fulfillment_notes,
        requires_livescan, requires_virtus, requires_tb,
        experience_level, training_type, class_types, program_types,
        base_pay, special_notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.userId, d.geographic_area_id, d.city_detail || null,
        d.avail_mon_am ? 1 : 0, d.avail_mon_pm ? 1 : 0,
        d.avail_tue_am ? 1 : 0, d.avail_tue_pm ? 1 : 0,
        d.avail_wed_am ? 1 : 0, d.avail_wed_pm ? 1 : 0,
        d.avail_thu_am ? 1 : 0, d.avail_thu_pm ? 1 : 0,
        d.avail_fri_am ? 1 : 0, d.avail_fri_pm ? 1 : 0,
        d.fulfillment_date || null, d.earliest_start_date || null, d.fulfillment_notes || null,
        d.requires_livescan ? 1 : 0, d.requires_virtus ? 1 : 0, d.requires_tb ? 1 : 0,
        d.experience_level || null, d.training_type || 'in_person',
        JSON.stringify(d.class_types || []), JSON.stringify(d.program_types || []),
        d.base_pay || null, d.special_notes || null,
      ]
    );

    // Link programs
    if (d.program_ids?.length) {
      for (const pid of d.program_ids) {
        await pool.query('INSERT INTO hiring_request_program (hiring_request_id, program_id) VALUES (?,?)', [result.insertId, pid]);
      }
    }

    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/hiring-requests/:id — update status, link candidate, etc
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['status', 'candidate_id', 'fulfillment_notes', 'special_notes'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields' });

    const sets = updates.map(f => `${f} = ?`);
    const vals = updates.map(f => req.body[f] === '' ? null : req.body[f]);

    if (req.body.status === 'filled') { sets.push('filled_at = NOW()'); }

    await pool.query(`UPDATE hiring_request SET ${sets.join(', ')}, ts_updated = NOW() WHERE id = ?`, [...vals, id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/hiring-requests/:id/link-candidate — link candidate and push programs to their schedule
router.post('/:id/link-candidate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { candidate_id } = req.body;
    if (!candidate_id) return res.status(400).json({ success: false, error: 'Candidate required' });

    // Link candidate
    await pool.query("UPDATE hiring_request SET candidate_id = ?, status = 'in_progress', ts_updated = NOW() WHERE id = ?", [candidate_id, id]);

    // Get programs from this request
    const [programs] = await pool.query('SELECT program_id FROM hiring_request_program WHERE hiring_request_id = ?', [id]);

    // Push each to candidate's tentative schedule
    let added = 0;
    for (const p of programs) {
      const [existing] = await pool.query(
        'SELECT id FROM candidate_schedule WHERE candidate_id = ? AND program_id = ? AND active = 1', [candidate_id, p.program_id]
      );
      if (existing.length === 0) {
        await pool.query(
          "INSERT INTO candidate_schedule (candidate_id, program_id, role, assigned_by_user_id, status) VALUES (?, ?, 'Lead', ?, 'pending')",
          [candidate_id, p.program_id, req.user.userId]
        );
        added++;
      }
    }

    res.json({ success: true, programs_added: added });
  } catch (err) { next(err); }
});

module.exports = router;
