const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// PUT /api/bulk-update
router.put('/bulk-update', authenticate, async (req, res, next) => {
  try {
    const { table, ids, updates } = req.body;
    const allowedTables = ['location', 'program', 'professor'];
    if (!allowedTables.includes(table)) return res.status(400).json({ success: false, error: 'Invalid table' });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, error: 'No rows selected' });
    if (!updates || Object.keys(updates).length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    // Whitelist fields per table
    const fieldWhitelist = {
      location: ['active', 'geographic_area_id_online', 'client_manager_user_id', 'contractor_id', 'retained',
        'payment_through_us', 'virtus_required', 'tb_required', 'livescan_required', 'demo_allowed',
        'flyer_required', 'custom_flyer_required', 'contract_permit_required', 'location_type_id',
        'class_pricing_type_id', 'parking_difficulty_id', 'set_dates_ourselves', 'jewish', 'observes_allowed'],
      program: ['class_status_id', 'lead_professor_id', 'lead_professor_pay', 'live', 'payment_through_us',
        'roster_received', 'roster_confirmed', 'flyer_required', 'demo_required', 'active',
        'tb_required', 'livescan_required', 'virtus_required', 'invoice_needed',
        'open_blast_sent', 'two_week_blast_sent', 'one_week_blast_sent', 'final_blast_sent', 'parent_feedback_requested'],
      professor: ['professor_status_id', 'geographic_area_id', 'scheduling_coordinator_user_id',
        'base_pay', 'active', 'science_trained_id', 'engineering_trained_id',
        'show_party_trained_id', 'camp_trained_id', 'studysmart_trained_id', 'robotics_trained_id'],
    };

    const allowed = fieldWhitelist[table] || [];
    const setClauses = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      if (!allowed.includes(key)) continue;
      setClauses.push(`${key} = ?`);
      values.push(val);
    }
    if (setClauses.length === 0) return res.status(400).json({ success: false, error: 'No valid fields' });

    const placeholders = ids.map(() => '?').join(', ');
    await pool.query(
      `UPDATE ${table} SET ${setClauses.join(', ')}, ts_updated = NOW() WHERE id IN (${placeholders})`,
      [...values, ...ids]
    );

    res.json({ success: true, updated: ids.length });
  } catch (err) { next(err); }
});

// GET /api/column-prefs/:pageKey
router.get('/column-prefs/:pageKey', authenticate, async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      'SELECT visible_columns FROM user_column_preference WHERE user_id = ? AND page_key = ?',
      [req.user.id, req.params.pageKey]
    );
    res.json({ success: true, data: row ? JSON.parse(row.visible_columns) : null });
  } catch (err) { next(err); }
});

// PUT /api/column-prefs/:pageKey
router.put('/column-prefs/:pageKey', authenticate, async (req, res, next) => {
  try {
    const { columns } = req.body;
    if (!Array.isArray(columns)) return res.status(400).json({ success: false, error: 'columns must be an array' });
    await pool.query(
      `INSERT INTO user_column_preference (user_id, page_key, visible_columns)
       VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE visible_columns = VALUES(visible_columns)`,
      [req.user.id, req.params.pageKey, JSON.stringify(columns)]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

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
       AND p.first_session_date <= CURDATE()
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
    // Overdue evaluations: professors whose last eval + tier frequency < today
    const [[overdueEvals]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM professor p
       JOIN professor_status ps ON ps.id = p.professor_status_id
       WHERE p.active = 1 AND ps.professor_status_name IN ('Active', 'Training')
         AND (p.last_evaluation_date IS NULL OR p.last_evaluation_date < DATE_SUB(CURDATE(), INTERVAL 120 DAY))`
    );
    res.json({ success: true, data: {
      activePrograms: active.cnt,
      unconfirmedPrograms: unconfirmed.cnt,
      upcomingSessions7d: upcoming.cnt,
      overdueLessons: overdue.cnt,
      activeProfessors: activeProfessors.cnt,
      activeLocations: activeLocations.cnt,
      overdueEvals: overdueEvals.cnt,
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
      pool.query(`SELECT id, reason_name FROM substitute_reason WHERE active = 1 ORDER BY sort_order, reason_name`),
      pool.query(`SELECT id, first_name, last_name, CONCAT(first_name, ' ', last_name) AS display_name FROM user WHERE active = 1 AND role_id IN (2, 8) ORDER BY first_name`),
      pool.query(`SELECT ur.id, ur.user_id, ur.responsibility, ur.geographic_area_id, CONCAT(u.first_name, ' ', u.last_name) AS user_name, ga.geographic_area_name FROM user_responsibility ur JOIN user u ON u.id = ur.user_id AND u.active = 1 LEFT JOIN geographic_area ga ON ga.id = ur.geographic_area_id WHERE ur.active = 1 ORDER BY ur.responsibility, ga.geographic_area_name`),
      pool.query(`SELECT id, class_name, class_code, class_type_id, program_type_id FROM class WHERE active = 1 ORDER BY class_name`),
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
        substituteReasons: results[23][0],
        staffUsers: results[24][0],
        userResponsibilities: results[25][0],
        classes: results[26][0],
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

router.delete('/roles/:id', authenticate, async (req, res, next) => {
  try {
    // Check if any users are assigned to this role
    const [[{ cnt }]] = await pool.query(
      'SELECT COUNT(*) as cnt FROM user WHERE role_id = ? AND active = 1', [req.params.id]
    );
    if (cnt > 0) return res.status(400).json({ success: false, error: `Cannot delete — ${cnt} user${cnt > 1 ? 's' : ''} assigned to this role` });

    // Check tool_role assignments
    await pool.query('DELETE FROM tool_role WHERE role_id = ?', [req.params.id]);
    await pool.query('UPDATE role SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
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
      `SELECT p.id, p.professor_nickname, p.first_name, p.last_name, p.phone_number,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS display_name,
              ps.professor_status_name
       FROM professor p
       LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
       WHERE p.active = 1 ORDER BY p.professor_nickname`
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

// ═══════════════════════════════════════════════════════════════════
// SUBSTITUTE REASONS
// ═══════════════════════════════════════════════════════════════════

// GET /api/substitute-reasons
router.get('/substitute-reasons', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM substitute_reason WHERE active = 1 ORDER BY sort_order, reason_name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/substitute-reasons
router.post('/substitute-reasons', authenticate, async (req, res, next) => {
  try {
    const { reason_name } = req.body;
    if (!reason_name?.trim()) return res.status(400).json({ success: false, error: 'Reason name required' });
    const [result] = await pool.query(
      'INSERT INTO substitute_reason (reason_name, sort_order) VALUES (?, (SELECT COALESCE(MAX(s.sort_order), 0) + 1 FROM substitute_reason s))',
      [reason_name.trim()]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/substitute-reasons/:id
router.put('/substitute-reasons/:id', authenticate, async (req, res, next) => {
  try {
    const { reason_name, sort_order } = req.body;
    const sets = [];
    const vals = [];
    if (reason_name !== undefined) { sets.push('reason_name = ?'); vals.push(reason_name.trim()); }
    if (sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(sort_order); }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'Nothing to update' });
    await pool.query(`UPDATE substitute_reason SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/substitute-reasons/:id (soft)
router.delete('/substitute-reasons/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE substitute_reason SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/audit/:table/:recordId — fetch audit history
router.get('/audit/:table/:recordId', authenticate, async (req, res, next) => {
  try {
    const { table, recordId } = req.params;
    const allowed = ['professor', 'program', 'location'];
    if (!allowed.includes(table)) return res.status(400).json({ success: false, error: 'Invalid table' });

    const [rows] = await pool.query(
      'SELECT id, user_name, action, changes, ts_inserted FROM audit_log WHERE table_name = ? AND record_id = ? ORDER BY ts_inserted DESC LIMIT 100',
      [table, recordId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// AREA PAY RATES
// ═══════════════════════════════════════════════════════════════════

// GET /api/area-pay-rates — all areas with pay rates + professor counts
router.get('/area-pay-rates', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ga.id, ga.geographic_area_name,
              ga.base_pay_rate, ga.assist_pay_rate, ga.party_pay_rate, ga.pickup_pay_rate, ga.camp_pay_rate,
              (SELECT COUNT(*) FROM professor p WHERE p.geographic_area_id = ga.id AND p.active = 1) AS professor_count
       FROM geographic_area ga
       WHERE ga.active = 1
       ORDER BY ga.geographic_area_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/area-pay-rates/impact — check how many professors would be affected
router.get('/area-pay-rates/impact', authenticate, async (req, res, next) => {
  try {
    const { area_id, field, new_rate } = req.query;
    if (!area_id || !field) return res.json({ success: true, data: { total: 0, would_update: 0, already_higher: 0 } });

    const rate = parseFloat(new_rate) || 0;
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) as total FROM professor WHERE geographic_area_id = ? AND active = 1', [area_id]
    );
    const [[{ would_update }]] = await pool.query(
      `SELECT COUNT(*) as would_update FROM professor WHERE geographic_area_id = ? AND active = 1 AND (${pool.escapeId(field)} IS NULL OR ${pool.escapeId(field)} <= ?)`,
      [area_id, rate]
    );
    const already_higher = total - would_update;

    res.json({ success: true, data: { total, would_update, already_higher } });
  } catch (err) { next(err); }
});

// PUT /api/area-pay-rates/:id — update pay rates, optionally cascade to professors
router.put('/area-pay-rates/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { base_pay_rate, assist_pay_rate, party_pay_rate, camp_pay_rate, cascade, protect_higher } = req.body;

    // Update area rates
    const sets = []; const vals = [];
    if (base_pay_rate !== undefined) { sets.push('base_pay_rate = ?'); vals.push(base_pay_rate || null); }
    if (assist_pay_rate !== undefined) { sets.push('assist_pay_rate = ?'); vals.push(assist_pay_rate || null); }
    if (party_pay_rate !== undefined) { sets.push('party_pay_rate = ?'); vals.push(party_pay_rate || null); }
    if (camp_pay_rate !== undefined) { sets.push('camp_pay_rate = ?'); vals.push(camp_pay_rate || null); }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields' });

    await pool.query(`UPDATE geographic_area SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);

    // Cascade to professors if requested — protect those with higher pay
    let cascaded = 0;
    if (cascade) {
      const rateMap = { base_pay_rate: 'base_pay', assist_pay_rate: 'assist_pay', party_pay_rate: 'party_pay', camp_pay_rate: 'camp_pay' };
      const updates = { base_pay_rate, assist_pay_rate, party_pay_rate, camp_pay_rate };

      for (const [areaField, profField] of Object.entries(rateMap)) {
        const newRate = updates[areaField];
        if (newRate === undefined) continue;
        const rate = parseFloat(newRate) || 0;
        // Only update professors whose current pay is <= new rate (don't lower anyone)
        const condition = protect_higher ? `AND (${profField} IS NULL OR ${profField} <= ?)` : '';
        const params = protect_higher ? [rate, id, rate] : [rate, id];
        const [result] = await pool.query(
          `UPDATE professor SET ${profField} = ?, ts_updated = NOW() WHERE geographic_area_id = ? AND active = 1 ${condition}`,
          params
        );
        cascaded += result.affectedRows;
      }
    }

    res.json({ success: true, cascaded });
  } catch (err) { next(err); }
});

// GET /api/weekly-overview — sessions for a given week
router.get('/weekly-overview', authenticate, async (req, res, next) => {
  try {
    let { start_date, areas } = req.query;

    // Default to this Monday
    if (!start_date) {
      const today = new Date();
      const day = today.getDay();
      const diff = day === 0 ? -6 : 1 - day; // Monday
      const monday = new Date(today);
      monday.setDate(today.getDate() + diff);
      start_date = monday.toISOString().split('T')[0];
    }

    // End = start + 4 days (Friday)
    const startD = new Date(start_date + 'T12:00:00');
    const endD = new Date(startD);
    endD.setDate(endD.getDate() + 4);
    const end_date = endD.toISOString().split('T')[0];

    let areaWhere = '';
    let areaParams = [];
    if (areas) {
      const ids = areas.split(',').map(Number).filter(Boolean);
      if (ids.length) { areaWhere = 'AND ga.id IN (?)'; areaParams = [ids]; }
    }

    const [rows] = await pool.query(
      `SELECT s.id AS session_id, s.session_date, s.session_time,
              s.professor_id AS session_professor_id, s.assistant_id AS session_assistant_id,
              prog.id AS program_id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.lead_professor_id, prog.assistant_professor_id,
              prog.first_session_date, prog.last_session_date,
              cs.class_status_name,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_name,
              lp.id AS lead_id,
              CONCAT(ap.professor_nickname, ' ', ap.last_name) AS assist_name,
              ap.id AS assist_id,
              l.lesson_name, l.trainual_link,
              loc.nickname AS location_nickname,
              ga.id AS area_id, ga.geographic_area_name,
              CASE WHEN doff.id IS NOT NULL AND s.professor_id IS NULL THEN 1 ELSE 0 END AS needs_sub
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN professor lp ON lp.id = COALESCE(s.professor_id, prog.lead_professor_id)
       LEFT JOIN professor ap ON ap.id = COALESCE(s.assistant_id, prog.assistant_professor_id)
       LEFT JOIN lesson l ON l.id = s.lesson_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       LEFT JOIN day_off doff ON doff.professor_id = prog.lead_professor_id
         AND doff.date_requested = s.session_date AND doff.active = 1
       WHERE s.active = 1
         AND s.session_date >= ? AND s.session_date <= ?
         AND cs.class_status_name NOT LIKE 'Cancelled%'
         ${areaWhere}
       ORDER BY s.session_date ASC, s.session_time ASC, prog.program_nickname ASC`,
      [start_date, end_date, ...areaParams]
    );

    res.json({ success: true, data: rows, start_date, end_date });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// BUG REPORTS
// ═══════════════════════════════════════════════════════════════════

router.post('/bug-reports', authenticate, async (req, res, next) => {
  try {
    const { description, page_url, page_name } = req.body;
    if (!description?.trim()) return res.status(400).json({ success: false, error: 'Description required' });
    const [result] = await pool.query(
      'INSERT INTO bug_report (description, page_url, page_name, submitted_by_user_id, submitted_by_name) VALUES (?,?,?,?,?)',
      [description.trim(), page_url || null, page_name || null, req.user.userId, req.user.name]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

router.get('/bug-reports', authenticate, async (req, res, next) => {
  try {
    const { status } = req.query;
    let where = '1=1';
    const params = [];
    if (status) { where += ' AND status = ?'; params.push(status); }
    const [rows] = await pool.query(`SELECT * FROM bug_report WHERE ${where} ORDER BY ts_inserted DESC LIMIT 500`, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.put('/bug-reports/:id', authenticate, async (req, res, next) => {
  try {
    const { status, admin_notes } = req.body;
    const sets = []; const vals = [];
    if (status !== undefined) { sets.push('status = ?'); vals.push(status); }
    if (admin_notes !== undefined) { sets.push('admin_notes = ?'); vals.push(admin_notes); }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
    await pool.query(`UPDATE bug_report SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/bug-reports/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM bug_report WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Leaderboard
router.get('/bug-reports/leaderboard', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT submitted_by_name AS name, submitted_by_user_id AS user_id,
              SUM(CASE WHEN status = 'approved_minor' THEN 1 ELSE 0 END) AS minor_count,
              SUM(CASE WHEN status = 'approved_major' THEN 1 ELSE 0 END) AS major_count,
              SUM(CASE WHEN status = 'approved_minor' THEN 2 WHEN status = 'approved_major' THEN 4 ELSE 0 END) AS earnings,
              COUNT(*) AS total_submitted
       FROM bug_report
       WHERE MONTH(ts_inserted) = MONTH(CURDATE()) AND YEAR(ts_inserted) = YEAR(CURDATE())
       GROUP BY submitted_by_user_id, submitted_by_name
       ORDER BY earnings DESC`
    );
    // Cap at $100 per person
    rows.forEach(r => { r.earnings = Math.min(r.earnings, 100); });
    const totalPayout = Math.min(rows.reduce((sum, r) => sum + r.earnings, 0), 1000);
    res.json({ success: true, data: rows, totalPayout });
  } catch (err) { next(err); }
});

// Mark unpaid approved/fixed bugs as paid
router.post('/bug-reports/mark-paid', authenticate, async (req, res, next) => {
  try {
    const [result] = await pool.query(
      "UPDATE bug_report SET paid_at = NOW() WHERE status IN ('approved_minor', 'approved_major', 'fixed') AND paid_at IS NULL"
    );
    res.json({ success: true, marked: result.affectedRows });
  } catch (err) { next(err); }
});

// ============================================================
// USER RESPONSIBILITIES (party_scheduler, etc.)
// ============================================================

// GET /api/responsibilities — list all (optionally filter by type)
router.get('/responsibilities', authenticate, async (req, res, next) => {
  try {
    const { responsibility } = req.query;
    let where = 'ur.active = 1';
    const params = [];
    if (responsibility) { where += ' AND ur.responsibility = ?'; params.push(responsibility); }
    const [rows] = await pool.query(
      `SELECT ur.id, ur.user_id, ur.responsibility, ur.geographic_area_id,
              CONCAT(u.first_name, ' ', u.last_name) AS user_name,
              r.role_name,
              ga.geographic_area_name
       FROM user_responsibility ur
       JOIN user u ON u.id = ur.user_id
       LEFT JOIN role rl ON rl.id = u.role_id
       LEFT JOIN role r ON r.id = u.role_id
       LEFT JOIN geographic_area ga ON ga.id = ur.geographic_area_id
       WHERE ${where}
       ORDER BY ur.responsibility, ga.geographic_area_name, u.last_name`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/responsibilities/party-schedulers — convenience: party schedulers by area
router.get('/responsibilities/party-schedulers', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ur.id, ur.user_id, ur.geographic_area_id,
              CONCAT(u.first_name, ' ', u.last_name) AS user_name,
              ga.geographic_area_name
       FROM user_responsibility ur
       JOIN user u ON u.id = ur.user_id AND u.active = 1
       LEFT JOIN geographic_area ga ON ga.id = ur.geographic_area_id
       WHERE ur.active = 1 AND ur.responsibility = 'party_scheduler'
       ORDER BY ga.geographic_area_name, u.last_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/responsibilities — assign a responsibility
router.post('/responsibilities', authenticate, async (req, res, next) => {
  try {
    const { user_id, responsibility, geographic_area_id } = req.body;
    if (!user_id || !responsibility) return res.status(400).json({ success: false, error: 'user_id and responsibility required' });
    const [result] = await pool.query(
      `INSERT INTO user_responsibility (user_id, responsibility, geographic_area_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE active = 1, ts_updated = NOW()`,
      [user_id, responsibility, geographic_area_id || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// DELETE /api/responsibilities/:id — remove a responsibility
router.delete('/responsibilities/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE user_responsibility SET active = 0, ts_updated = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// SYSTEM SETTINGS
// ============================================================

// GET /api/settings — all settings (or filtered by prefix)
router.get('/settings', authenticate, async (req, res, next) => {
  try {
    const { prefix } = req.query;
    let where = '1=1';
    const params = [];
    if (prefix) { where += ' AND setting_key LIKE ?'; params.push(`${prefix}%`); }
    const [rows] = await pool.query(`SELECT * FROM system_setting WHERE ${where} ORDER BY setting_key`, params);
    const map = {};
    rows.forEach(r => { map[r.setting_key] = r.setting_value; });
    res.json({ success: true, data: map });
  } catch (err) { next(err); }
});

// PUT /api/settings — update one or more settings
router.put('/settings', authenticate, async (req, res, next) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `INSERT INTO system_setting (setting_key, setting_value, ts_updated) VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = ?, ts_updated = NOW()`,
        [key, value || null, value || null]
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;

