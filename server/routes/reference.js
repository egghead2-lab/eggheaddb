const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/search?q=
router.get('/search', authenticate, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });
    const s = `%${q}%`;

    const [programs] = await pool.query(
      `SELECT id, program_nickname AS name, 'program' AS type FROM program WHERE active = 1 AND program_nickname LIKE ? LIMIT 5`, [s]
    );
    const [professors] = await pool.query(
      `SELECT id, CONCAT(professor_nickname, ' ', last_name) AS name, 'professor' AS type FROM professor WHERE active = 1 AND (professor_nickname LIKE ? OR first_name LIKE ? OR last_name LIKE ?) LIMIT 5`, [s, s, s]
    );
    const [locations] = await pool.query(
      `SELECT id, nickname AS name, 'location' AS type FROM location WHERE active = 1 AND (nickname LIKE ? OR school_name LIKE ?) AND (location_type_id IS NULL OR location_type_id != 5) LIMIT 5`, [s, s]
    );
    const [students] = await pool.query(
      `SELECT id, CONCAT(first_name, ' ', last_name) AS name, 'student' AS type FROM student WHERE active = 1 AND (first_name LIKE ? OR last_name LIKE ?) LIMIT 5`, [s, s]
    );
    const [contractors] = await pool.query(
      `SELECT id, contractor_name AS name, 'contractor' AS type FROM contractor WHERE active = 1 AND contractor_name LIKE ? LIMIT 5`, [s]
    );

    res.json({ success: true, data: [...programs, ...professors, ...locations, ...students, ...contractors] });
  } catch (err) { next(err); }
});

// GET /api/dashboard-kpis
router.get('/dashboard-kpis', authenticate, async (req, res, next) => {
  try {
    const [[active]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM program p JOIN class_status cs ON cs.id = p.class_status_id
       WHERE p.active = 1 AND cs.class_status_name NOT LIKE 'Cancelled%'
       AND (p.last_session_date >= CURDATE() OR p.last_session_date IS NULL)`
    );
    const [[unconfirmed]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM program p JOIN class_status cs ON cs.id = p.class_status_id
       WHERE p.active = 1 AND cs.class_status_name = 'Unconfirmed'
       AND (p.last_session_date >= CURDATE() OR p.last_session_date IS NULL)`
    );
    const [[upcoming]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM session s
       JOIN program p ON p.id = s.program_id AND p.active = 1
       WHERE s.active = 1 AND s.session_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`
    );
    const [[overdue]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM lesson WHERE active = 1 AND review_status = 'overdue'`
    );
    const [[activeProfessors]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM professor p JOIN professor_status ps ON ps.id = p.professor_status_id
       WHERE p.active = 1 AND ps.professor_status_name = 'Active'`
    );
    const [[activeLocations]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM location WHERE active = 1 AND (location_type_id IS NULL OR location_type_id != 5)`
    );
    res.json({ success: true, data: {
      activePrograms: active.cnt,
      unconfirmedPrograms: unconfirmed.cnt,
      upcomingSessions7d: upcoming.cnt,
      overdueLessons: overdue.cnt,
      activeProfessors: activeProfessors.cnt,
      activeLocations: activeLocations.cnt,
    }});
  } catch (err) { next(err); }
});

// GET /api/sidebar-counts
router.get('/sidebar-counts', authenticate, async (req, res, next) => {
  try {
    const [[unconfirmed]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM program p JOIN class_status cs ON cs.id = p.class_status_id
       WHERE p.active = 1 AND cs.class_status_name = 'Unconfirmed'
       AND (p.last_session_date >= CURDATE() OR p.last_session_date IS NULL)`
    );
    const [[overdueLessons]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM lesson WHERE active = 1 AND review_status = 'overdue'`
    );
    res.json({ success: true, data: {
      unconfirmedPrograms: unconfirmed.cnt,
      overdueLessons: overdueLessons.cnt,
    }});
  } catch (err) { next(err); }
});

// GET /api/regions
router.get('/regions', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, (SELECT COUNT(*) FROM geographic_area ga WHERE ga.region_id = r.id AND ga.active = 1) AS area_count
       FROM region r WHERE r.active = 1 ORDER BY r.sort_order, r.region_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/regions
router.post('/regions', authenticate, async (req, res, next) => {
  try {
    const { region_name, sort_order } = req.body;
    if (!region_name) return res.status(400).json({ success: false, error: 'Name is required' });
    const [result] = await pool.query(
      'INSERT INTO region (region_name, sort_order, active) VALUES (?, ?, 1)',
      [region_name, sort_order || 0]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/regions/:id
router.put('/regions/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['region_name', 'sort_order'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => req.body[f] === '' ? null : req.body[f]);
    await pool.query(`UPDATE region SET ${setClauses} WHERE id = ?`, [...values, id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/regions/:id
router.delete('/regions/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE region SET active = 0 WHERE id = ?', [id]);
    await pool.query('UPDATE geographic_area SET region_id = NULL WHERE region_id = ?', [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/areas
router.get('/areas', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ga.*,
              r.region_name, s.state_name, s.state_code,
              CONCAT(u_sc.first_name, ' ', u_sc.last_name) AS scheduling_coordinator_name,
              CONCAT(u_fm.first_name, ' ', u_fm.last_name) AS field_manager_name,
              CONCAT(u_cm.first_name, ' ', u_cm.last_name) AS client_manager_name,
              CONCAT(u_sales.first_name, ' ', u_sales.last_name) AS sales_name,
              CONCAT(u_rec.first_name, ' ', u_rec.last_name) AS recruiter_name,
              CONCAT(u_onb.first_name, ' ', u_onb.last_name) AS onboarder_name,
              CONCAT(u_cs.first_name, ' ', u_cs.last_name) AS client_specialist_name,
              CONCAT(u_ss.first_name, ' ', u_ss.last_name) AS scheduling_specialist_name,
              CONCAT(u_tr.first_name, ' ', u_tr.last_name) AS trainer_name,
              (SELECT COUNT(*) FROM location l WHERE l.geographic_area_id_online = ga.id AND l.active = 1) AS location_count
       FROM geographic_area ga
       LEFT JOIN region r ON r.id = ga.region_id
       LEFT JOIN state s ON s.id = ga.state_id
       LEFT JOIN user u_sc ON u_sc.id = ga.scheduling_coordinator_user_id
       LEFT JOIN user u_fm ON u_fm.id = ga.field_manager_user_id
       LEFT JOIN user u_cm ON u_cm.id = ga.client_manager_user_id
       LEFT JOIN user u_sales ON u_sales.id = ga.sales_user_id
       LEFT JOIN user u_rec ON u_rec.id = ga.recruiter_user_id
       LEFT JOIN user u_onb ON u_onb.id = ga.onboarder_user_id
       LEFT JOIN user u_cs ON u_cs.id = ga.client_specialist_user_id
       LEFT JOIN user u_ss ON u_ss.id = ga.scheduling_specialist_user_id
       LEFT JOIN user u_tr ON u_tr.id = ga.trainer_user_id
       WHERE ga.active = 1
       ORDER BY r.sort_order, r.region_name, ga.geographic_area_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/areas
router.post('/areas', authenticate, async (req, res, next) => {
  try {
    const { geographic_area_name } = req.body;
    if (!geographic_area_name) return res.status(400).json({ success: false, error: 'Name is required' });
    const roleFields = ['scheduling_coordinator_user_id', 'field_manager_user_id', 'client_manager_user_id',
      'sales_user_id', 'recruiter_user_id', 'onboarder_user_id',
      'client_specialist_user_id', 'scheduling_specialist_user_id', 'trainer_user_id',
      'region_id', 'state_id'];
    const cols = ['geographic_area_name', ...roleFields.filter(f => req.body[f] !== undefined)];
    const vals = [geographic_area_name, ...roleFields.filter(f => req.body[f] !== undefined).map(f => req.body[f] || null)];
    const [result] = await pool.query(
      `INSERT INTO geographic_area (${cols.join(', ')}, active) VALUES (${cols.map(() => '?').join(', ')}, 1)`,
      vals
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/areas/:id
router.put('/areas/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['geographic_area_name',
      'scheduling_coordinator_user_id', 'field_manager_user_id', 'client_manager_user_id',
      'sales_user_id', 'recruiter_user_id', 'onboarder_user_id',
      'client_specialist_user_id', 'scheduling_specialist_user_id', 'trainer_user_id',
      'region_id', 'state_id'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => req.body[f] === '' ? null : req.body[f]);
    await pool.query(`UPDATE geographic_area SET ${setClauses} WHERE id = ?`, [...values, id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/areas/:id (soft delete)
router.delete('/areas/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE geographic_area SET active = 0 WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/general-data
router.get('/general-data', authenticate, async (req, res, next) => {
  try {
    const queries = [
      pool.query(`SELECT id, holiday_name, holiday_date, generic, jewish FROM holiday ORDER BY holiday_date`),
      pool.query(`SELECT id, class_type_name FROM class_type WHERE active = 1 ORDER BY class_type_name`),
      pool.query(`SELECT id, program_type_name FROM program_type WHERE active = 1 ORDER BY program_type_name`),
      pool.query(`SELECT id, class_status_name, cancelled, confirmed, unconfirmed FROM class_status WHERE active = 1 ORDER BY class_status_name`),
      pool.query(`SELECT id, weekday_name FROM weekday ORDER BY id`),
      pool.query(`SELECT id, professor_status_name, professor_active FROM professor_status WHERE active = 1 ORDER BY professor_status_name`),
      pool.query(`SELECT id, location_type_name FROM location_type WHERE active = 1 ORDER BY location_type_name`),
      pool.query(`SELECT id, demo_type_name FROM demo_type WHERE active = 1 ORDER BY demo_type_name`),
      pool.query(`SELECT id, contractor_name FROM contractor WHERE active = 1 ORDER BY contractor_name`),
      pool.query(`SELECT id, poc_title_name FROM poc_title WHERE active = 1 ORDER BY poc_title_name`),
      pool.query(`SELECT id, lab_fee_type_name FROM lab_fee_type WHERE active = 1 ORDER BY lab_fee_type_name`),
      pool.query(`SELECT id, parking_difficulty_name FROM parking_difficulty WHERE active = 1 ORDER BY parking_difficulty_name`),
      pool.query(`SELECT id, onboard_status_name FROM onboard_status WHERE active = 1 ORDER BY onboard_status_name`),
      pool.query(`SELECT id, grade_name FROM grade WHERE active = 1 ORDER BY id`),
      pool.query(`SELECT id, bin_name FROM bin WHERE active = 1 ORDER BY bin_name`),
      pool.query(`SELECT id, class_pricing_type_name FROM class_pricing_type WHERE active = 1 ORDER BY class_pricing_type_name`),
      pool.query(`SELECT id, geographic_area_name FROM geographic_area WHERE active = 1 ORDER BY geographic_area_name`),
      pool.query(`SELECT id, city_name, zip_code, state_id, geographic_area_id FROM city ORDER BY city_name`),
      pool.query(`SELECT id, state_name, state_code FROM state ORDER BY state_name`),
      pool.query(`SELECT id, party_format_name FROM party_format WHERE active = 1 ORDER BY party_format_name`),
      pool.query(`SELECT id, class_name FROM class WHERE active = 1 AND program_type_id = 4 AND class_name NOT LIKE 'Party / %' ORDER BY class_name`),
      pool.query(`SELECT p.id, p.professor_nickname, p.last_name, CONCAT(p.professor_nickname, ' ', p.last_name) AS display_name FROM professor p JOIN professor_status ps ON ps.id = p.professor_status_id WHERE p.active = 1 AND p.show_party_trained_id = 1 AND ps.professor_status_name IN ('Active', 'Substitute') ORDER BY p.professor_nickname`),
      pool.query(`SELECT p.id, p.professor_nickname, p.last_name, CONCAT(p.professor_nickname, ' ', p.last_name) AS display_name FROM professor p JOIN professor_status ps ON ps.id = p.professor_status_id WHERE p.active = 1 AND ps.professor_status_name IN ('Active', 'Substitute') ORDER BY p.professor_nickname`),
    ];

    const results = await Promise.all(queries);

    res.json({
      success: true,
      data: {
        holidays: results[0][0],
        classTypes: results[1][0],
        programTypes: results[2][0],
        classStatuses: results[3][0],
        weekdays: results[4][0],
        professorStatuses: results[5][0],
        locationTypes: results[6][0],
        demoTypes: results[7][0],
        contractors: results[8][0],
        pocTitles: results[9][0],
        labFeeTypes: results[10][0],
        parkingDifficulties: results[11][0],
        onboardStatuses: results[12][0],
        grades: results[13][0],
        bins: results[14][0],
        classPricingTypes: results[15][0],
        areas: results[16][0],
        cities: results[17][0],
        states: results[18][0],
        partyFormats: results[19][0],
        partyThemes: results[20][0],
        partyLeadProfessors: results[21][0],
        partyAssistProfessors: results[22][0],
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/roles
router.get('/roles', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, role_name FROM role WHERE active = 1 ORDER BY role_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/roles
router.post('/roles', authenticate, async (req, res, next) => {
  try {
    const { role_name } = req.body;
    if (!role_name) return res.status(400).json({ success: false, error: 'Role name is required' });
    const [result] = await pool.query(
      `INSERT INTO role (role_name, active) VALUES (?, 1)`,
      [role_name]
    );
    res.json({ success: true, id: result.insertId, role_name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, error: 'Role already exists' });
    }
    next(err);
  }
});

// PUT /api/roles/:id
router.put('/roles/:id', authenticate, async (req, res, next) => {
  try {
    const { role_name } = req.body;
    if (!role_name) return res.status(400).json({ success: false, error: 'Role name is required' });
    await pool.query(`UPDATE role SET role_name = ? WHERE id = ?`, [role_name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, error: 'Role name already exists' });
    }
    next(err);
  }
});

// GET /api/lessons
router.get('/lessons', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, lesson_name, class_id FROM lesson WHERE active = 1 ORDER BY lesson_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/professors/list
router.get('/professors/list', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, professor_nickname, first_name, last_name, CONCAT(professor_nickname, ' ', last_name) AS display_name FROM professor WHERE active = 1 ORDER BY professor_nickname`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/locations/list
router.get('/locations/list', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nickname FROM location WHERE active = 1 AND (location_type_id IS NULL OR location_type_id != 5) ORDER BY nickname`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/classes
router.get('/classes', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.class_name, c.class_code, c.formal_class_name, c.program_type_id, c.class_type_id,
              pt.program_type_name, ct.class_type_name
       FROM class c
       LEFT JOIN program_type pt ON pt.id = c.program_type_id AND pt.active = 1
       LEFT JOIN class_type ct ON ct.id = c.class_type_id AND ct.active = 1
       WHERE c.active = 1
       ORDER BY c.class_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

