const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ============================================================
// ENTITY DEFINITIONS — what's filterable per entity
// ============================================================
const ENTITIES = {
  programs: {
    label: 'Programs',
    baseQuery: `SELECT prog.id, prog.program_nickname AS name, prog.first_session_date, prog.last_session_date,
      prog.session_count, prog.number_enrolled, prog.maximum_students, prog.minimum_students,
      prog.parent_cost, prog.our_cut, prog.lab_fee,
      prog.invoice_paid, prog.invoice_date_sent, prog.invoice_needed, prog.payment_through_us,
      prog.lead_professor_pay, prog.assistant_professor_pay,
      prog.tb_required AS prog_tb_required, prog.livescan_required AS prog_livescan_required, prog.virtus_required AS prog_virtus_required,
      prog.flyer_required, prog.demo_required, prog.registration_opened_online,
      prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
      cs.class_status_name AS status, loc.nickname AS location, cl.class_name, cl.class_code,
      pt.program_type_name AS program_type, ct.class_type_name AS class_type,
      ga.geographic_area_name AS area,
      con.contractor_name AS contractor,
      loc.retained AS location_retained,
      CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor,
      CONCAT(ap.professor_nickname, ' ', ap.last_name) AS assistant_professor,
      CONCAT(sc.first_name, ' ', sc.last_name) AS scheduling_coordinator,
      CONCAT(fm.first_name, ' ', fm.last_name) AS field_manager,
      CONCAT(cmgr.first_name, ' ', cmgr.last_name) AS client_manager,
      lp.virtus AS lead_virtus, lp.tb_test AS lead_tb,
      (SELECT COUNT(*) FROM livescan ls WHERE ls.professor_id = lp.id AND ls.active = 1 AND ls.location_id = loc.id) AS lead_has_livescan_at_location
    FROM program prog
    LEFT JOIN class_status cs ON cs.id = prog.class_status_id
    LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
    LEFT JOIN class cl ON cl.id = prog.class_id
    LEFT JOIN program_type pt ON pt.id = cl.program_type_id
    LEFT JOIN class_type ct ON ct.id = cl.class_type_id
    LEFT JOIN city c ON c.id = loc.city_id
    LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
    LEFT JOIN contractor con ON con.id = loc.contractor_id
    LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
    LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id
    LEFT JOIN user sc ON sc.id = ga.scheduling_coordinator_user_id
    LEFT JOIN user fm ON fm.id = ga.field_manager_user_id
    LEFT JOIN user cmgr ON cmgr.id = ga.client_manager_user_id
    WHERE prog.active = 1`,
    fields: {
      status: { label: 'Program Status', type: 'select', options: 'class_status' },
      program_type: { label: 'Program Type', type: 'select', options: 'program_type' },
      class_type: { label: 'Class Type (Subject)', type: 'select', options: 'class_type' },
      area: { label: 'Geographic Area', type: 'select', options: 'area' },
      class_name: { label: 'Class/Module Name', type: 'text', col: 'cl.class_name' },
      class_code: { label: 'Class Code', type: 'text', col: 'cl.class_code' },
      lead_professor: { label: 'Lead Professor', type: 'text', col: "CONCAT(lp.professor_nickname, ' ', lp.last_name)" },
      assistant_professor: { label: 'Assistant Professor', type: 'text', col: "CONCAT(ap.professor_nickname, ' ', ap.last_name)" },
      has_assistant: { label: 'Has Assistant', type: 'boolean', col: 'prog.assistant_professor_id IS NOT NULL', raw: true },
      scheduling_coordinator: { label: 'Scheduling Coordinator', type: 'text', col: "CONCAT(sc.first_name, ' ', sc.last_name)" },
      field_manager: { label: 'Field Manager', type: 'text', col: "CONCAT(fm.first_name, ' ', fm.last_name)" },
      client_manager: { label: 'Client Manager', type: 'text', col: "CONCAT(cmgr.first_name, ' ', cmgr.last_name)" },
      location: { label: 'Location', type: 'text', col: 'loc.nickname' },
      contractor: { label: 'Contractor', type: 'text', col: 'con.contractor_name' },
      timeframe: { label: 'Timeframe', type: 'timeframe' },
      invoice_status: { label: 'Invoice Status', type: 'invoice' },
      session_count: { label: 'Session Count', type: 'number', col: 'prog.session_count' },
      enrolled: { label: 'Students Enrolled', type: 'number', col: 'prog.number_enrolled' },
      max_students: { label: 'Max Students', type: 'number', col: 'prog.maximum_students' },
      parent_cost: { label: 'Parent Cost', type: 'number', col: 'prog.parent_cost' },
      our_cut: { label: 'Our Cut', type: 'number', col: 'prog.our_cut' },
      payment_through_us: { label: 'Payment Through Us', type: 'boolean', col: 'prog.payment_through_us' },
      registration_opened: { label: 'Registration Opened', type: 'boolean', col: 'prog.registration_opened_online' },
      location_retained: { label: 'Retained Client', type: 'boolean', col: 'loc.retained' },
      tb_required: { label: 'TB Required', type: 'boolean', col: 'prog.tb_required' },
      livescan_required: { label: 'Livescan Required', type: 'boolean', col: 'prog.livescan_required' },
      virtus_required: { label: 'Virtus Required', type: 'boolean', col: 'prog.virtus_required' },
      flyer_required: { label: 'Flyer Required', type: 'boolean', col: 'prog.flyer_required' },
      demo_required: { label: 'Demo Required', type: 'boolean', col: 'prog.demo_required' },
      lead_virtus: { label: 'Lead Prof Has Virtus', type: 'boolean', col: 'lp.virtus' },
      lead_tb: { label: 'Lead Prof Has TB', type: 'boolean', col: 'lp.tb_test' },
      lead_has_livescan_at_location: { label: 'Lead Prof Livescanned at Location', type: 'number', col: 'lead_has_livescan_at_location' },
      day_monday: { label: 'Runs Monday', type: 'boolean', col: 'prog.monday' },
      day_tuesday: { label: 'Runs Tuesday', type: 'boolean', col: 'prog.tuesday' },
      day_wednesday: { label: 'Runs Wednesday', type: 'boolean', col: 'prog.wednesday' },
      day_thursday: { label: 'Runs Thursday', type: 'boolean', col: 'prog.thursday' },
      day_friday: { label: 'Runs Friday', type: 'boolean', col: 'prog.friday' },
    },
    defaultSort: 'prog.first_session_date DESC',
    countField: 'prog.id',
  },
  professors: {
    label: 'Professors',
    baseQuery: `SELECT p.id, CONCAT(p.professor_nickname, ' ', p.last_name) AS name,
      p.professor_nickname, p.first_name, p.last_name,
      p.base_pay, p.assist_pay, p.party_pay, p.camp_pay,
      p.email, p.phone_number, p.rating,
      ps.professor_status_name AS status, ga.geographic_area_name AS area,
      c.city_name, os.onboard_status_name AS onboard_status,
      CONCAT(sc.first_name, ' ', sc.last_name) AS scheduling_coordinator,
      p.science_trained_id, p.engineering_trained_id, p.show_party_trained_id,
      p.slime_party_trained_id, p.demo_trained_id, p.studysmart_trained_id, p.camp_trained_id,
      p.virtus, p.virtus_date, p.tb_test, p.tb_date,
      (SELECT COUNT(*) FROM program pr LEFT JOIN class_status cs2 ON cs2.id = pr.class_status_id
       WHERE pr.active = 1 AND (pr.lead_professor_id = p.id OR pr.assistant_professor_id = p.id)
       AND cs2.class_status_name NOT LIKE 'Cancelled%'
       AND (pr.last_session_date >= CURDATE() OR pr.last_session_date IS NULL)) AS program_count,
      (SELECT COUNT(*) FROM livescan ls WHERE ls.professor_id = p.id AND ls.active = 1) AS livescan_count,
      (SELECT COUNT(*) FROM has_bin hb WHERE hb.professor_id = p.id AND hb.active = 1) AS bin_count,
      (SELECT GROUP_CONCAT(b.bin_name) FROM has_bin hb2 JOIN bin b ON b.id = hb2.bin_id WHERE hb2.professor_id = p.id AND hb2.active = 1) AS bin_names
    FROM professor p
    LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
    LEFT JOIN city c ON c.id = p.city_id
    LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
    LEFT JOIN onboard_status os ON os.id = p.onboard_status_id
    LEFT JOIN user sc ON sc.id = p.scheduling_coordinator_owner_id
    WHERE p.active = 1`,
    fields: {
      status: { label: 'Professor Status', type: 'select', options: 'professor_status' },
      area: { label: 'Geographic Area', type: 'select', options: 'area' },
      scheduling_coordinator: { label: 'Scheduling Coordinator', type: 'text', col: "CONCAT(sc.first_name, ' ', sc.last_name)" },
      city: { label: 'City', type: 'text', col: 'c.city_name' },
      program_count: { label: 'Active Program Count', type: 'number', col: 'program_count' },
      base_pay: { label: 'Base Pay', type: 'number', col: 'p.base_pay' },
      rating: { label: 'Rating', type: 'number', col: 'p.rating' },
      science_trained: { label: 'Science Trained', type: 'boolean', col: 'p.science_trained_id' },
      engineering_trained: { label: 'Engineering Trained', type: 'boolean', col: 'p.engineering_trained_id' },
      party_trained: { label: 'Show Party Trained', type: 'boolean', col: 'p.show_party_trained_id' },
      slime_party_trained: { label: 'Slime Party Trained', type: 'boolean', col: 'p.slime_party_trained_id' },
      demo_trained: { label: 'Demo Trained', type: 'boolean', col: 'p.demo_trained_id' },
      studysmart_trained: { label: 'StudySmart Trained', type: 'boolean', col: 'p.studysmart_trained_id' },
      camp_trained: { label: 'Camp Trained', type: 'boolean', col: 'p.camp_trained_id' },
      virtus: { label: 'Has Virtus', type: 'boolean', col: 'p.virtus' },
      tb_test: { label: 'Has TB Test', type: 'boolean', col: 'p.tb_test' },
      livescan_count: { label: 'Livescan Count', type: 'number', col: 'livescan_count' },
      bin_count: { label: 'Bin Count', type: 'number', col: 'bin_count' },
      has_bin: { label: 'Has Any Bin', type: 'number', col: 'bin_count' },
      bin_names: { label: 'Bin Names (contains)', type: 'text', col: 'bin_names' },
    },
    defaultSort: 'p.professor_nickname ASC',
    countField: 'p.id',
  },
  locations: {
    label: 'Locations',
    baseQuery: `SELECT loc.id, loc.nickname AS name, loc.school_name, loc.address,
      loc.retained, loc.active, loc.payment_through_us, loc.location_enrollment,
      loc.virtus_required, loc.tb_required, loc.livescan_required,
      loc.contract_permit_required, loc.flyer_required, loc.demo_allowed,
      ga.geographic_area_name AS area, con.contractor_name AS contractor,
      lt.location_type_name AS location_type,
      COALESCE(CONCAT(loc_cm.first_name, ' ', loc_cm.last_name), CONCAT(cm.first_name, ' ', cm.last_name)) AS client_manager,
      CONCAT(fm.first_name, ' ', fm.last_name) AS field_manager,
      CONCAT(sc.first_name, ' ', sc.last_name) AS scheduling_coordinator,
      (SELECT COUNT(*) FROM program pr LEFT JOIN class_status cs ON cs.id = pr.class_status_id
       WHERE pr.location_id = loc.id AND pr.active = 1 AND cs.class_status_name NOT LIKE 'Cancelled%'
       AND (pr.last_session_date >= CURDATE() OR pr.last_session_date IS NULL)) AS active_program_count,
      (SELECT COUNT(*) FROM program pr2 WHERE pr2.location_id = loc.id AND pr2.active = 1
       AND pr2.invoice_paid = 0 AND pr2.last_session_date < CURDATE()) AS unpaid_invoice_count
    FROM location loc
    LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
    LEFT JOIN contractor con ON con.id = loc.contractor_id
    LEFT JOIN location_type lt ON lt.id = loc.location_type_id
    LEFT JOIN user cm ON cm.id = ga.client_manager_user_id
    LEFT JOIN user loc_cm ON loc_cm.id = loc.client_manager_user_id
    LEFT JOIN user fm ON fm.id = ga.field_manager_user_id
    LEFT JOIN user sc ON sc.id = ga.scheduling_coordinator_user_id
    WHERE loc.active = 1 AND (loc.location_type_id IS NULL OR loc.location_type_id != 5)`,
    fields: {
      area: { label: 'Geographic Area', type: 'select', options: 'area' },
      contractor: { label: 'Contractor', type: 'text', col: 'con.contractor_name' },
      client_manager: { label: 'Client Manager', type: 'text', col: "COALESCE(CONCAT(loc_cm.first_name, ' ', loc_cm.last_name), CONCAT(cm.first_name, ' ', cm.last_name))" },
      field_manager: { label: 'Field Manager', type: 'text', col: "CONCAT(fm.first_name, ' ', fm.last_name)" },
      scheduling_coordinator: { label: 'Scheduling Coordinator', type: 'text', col: "CONCAT(sc.first_name, ' ', sc.last_name)" },
      retained: { label: 'Retained Client', type: 'boolean', col: 'loc.retained' },
      payment_through_us: { label: 'Payment Through Us', type: 'boolean', col: 'loc.payment_through_us' },
      virtus_required: { label: 'Virtus Required', type: 'boolean', col: 'loc.virtus_required' },
      tb_required: { label: 'TB Required', type: 'boolean', col: 'loc.tb_required' },
      livescan_required: { label: 'Livescan Required', type: 'boolean', col: 'loc.livescan_required' },
      contract_required: { label: 'Contract/Permit Required', type: 'boolean', col: 'loc.contract_permit_required' },
      flyer_required: { label: 'Flyer Required', type: 'boolean', col: 'loc.flyer_required' },
      demo_allowed: { label: 'Demo Allowed', type: 'boolean', col: 'loc.demo_allowed' },
      active_program_count: { label: 'Active Program Count', type: 'number', col: 'active_program_count' },
      unpaid_invoice_count: { label: 'Unpaid Invoices', type: 'number', col: 'unpaid_invoice_count' },
      enrollment: { label: 'Location Enrollment', type: 'number', col: 'loc.location_enrollment' },
    },
    defaultSort: 'loc.nickname ASC',
    countField: 'loc.id',
  },
  lessons: {
    label: 'Lessons',
    baseQuery: `SELECT l.id, l.lesson_name AS name, l.review_status, l.next_update_required, l.lesson_type,
      l.status_one_sheet, l.status_materials, l.status_video, l.status_trainual, l.status_standards, l.status_science_accuracy
    FROM lesson l WHERE l.active = 1`,
    fields: {
      review_status: { label: 'Review Status', type: 'select', options: ['okay', 'review', 'overdue'] },
      lesson_type: { label: 'Lesson Type', type: 'select', options: ['science', 'engineering', 'robotics', 'financial_literacy'] },
      one_sheet: { label: 'One Sheet Status', type: 'select', col: 'l.status_one_sheet', options: ['up_to_date', 'update_needed'] },
      materials: { label: 'Materials Status', type: 'select', col: 'l.status_materials', options: ['up_to_date', 'update_needed'] },
      video: { label: 'Video Status', type: 'select', col: 'l.status_video', options: ['up_to_date', 'update_needed'] },
      trainual: { label: 'Trainual Status', type: 'select', col: 'l.status_trainual', options: ['up_to_date', 'update_needed'] },
      standards: { label: 'Standards Status', type: 'select', col: 'l.status_standards', options: ['up_to_date', 'update_needed'] },
      science_accuracy: { label: 'Science Accuracy Status', type: 'select', col: 'l.status_science_accuracy', options: ['up_to_date', 'update_needed'] },
    },
    defaultSort: 'l.lesson_name ASC',
    countField: 'l.id',
  },
};

// ============================================================
// FILTER INTERPRETER — converts JSON filters to SQL
// ============================================================
function buildWhereFromFilters(entity, filters) {
  const def = ENTITIES[entity];
  if (!def || !filters || !Array.isArray(filters)) return { where: '', params: [] };

  const clauses = [];
  const params = [];

  for (const f of filters) {
    const fieldDef = def.fields[f.field];
    if (!fieldDef) continue;

    if (fieldDef.type === 'timeframe') {
      if (f.value === 'current') clauses.push(`(prog.last_session_date >= CURDATE() OR prog.last_session_date IS NULL)`);
      else if (f.value === 'past') clauses.push(`prog.last_session_date < CURDATE()`);
      continue;
    }

    if (fieldDef.type === 'invoice') {
      if (f.value === 'paid') clauses.push(`prog.invoice_paid = 1`);
      else if (f.value === 'sent') clauses.push(`prog.invoice_paid = 0 AND prog.invoice_date_sent IS NOT NULL`);
      else if (f.value === 'not_sent') clauses.push(`prog.invoice_paid = 0 AND prog.invoice_date_sent IS NULL`);
      continue;
    }

    const col = fieldDef.col || f.field;
    const op = f.operator || '=';

    if (fieldDef.type === 'boolean') {
      clauses.push(`${col} = ?`);
      params.push(f.value ? 1 : 0);
    } else if (fieldDef.type === 'number') {
      const ops = { '=': '=', '>': '>', '<': '<', '>=': '>=', '<=': '<=' };
      clauses.push(`${col} ${ops[op] || '='} ?`);
      params.push(parseFloat(f.value));
    } else if (op === 'contains') {
      clauses.push(`${col} LIKE ?`);
      params.push(`%${f.value}%`);
    } else if (op === 'not') {
      clauses.push(`${col} != ?`);
      params.push(f.value);
    } else if (op === 'starts_with') {
      clauses.push(`${col} LIKE ?`);
      params.push(`${f.value}%`);
    } else {
      // Select or exact match
      if (fieldDef.type === 'select') {
        if (fieldDef.options === 'class_status') clauses.push(`cs.class_status_name = ?`);
        else if (fieldDef.options === 'program_type') clauses.push(`pt.program_type_name = ?`);
        else if (fieldDef.options === 'class_type') clauses.push(`ct.class_type_name = ?`);
        else if (fieldDef.options === 'area') clauses.push(`ga.geographic_area_name = ?`);
        else if (fieldDef.options === 'professor_status') clauses.push(`ps.professor_status_name = ?`);
        else clauses.push(`${f.field} = ?`);
        params.push(f.value);
      } else {
        clauses.push(`${col} = ?`);
        params.push(f.value);
      }
    }
  }

  return { where: clauses.length ? ' AND ' + clauses.join(' AND ') : '', params };
}

// ============================================================
// API ROUTES
// ============================================================

// GET /api/reports/entities — list available entities and their fields
router.get('/entities', authenticate, (req, res) => {
  const out = {};
  for (const [key, val] of Object.entries(ENTITIES)) {
    out[key] = { label: val.label, fields: Object.entries(val.fields).map(([k, v]) => ({ key: k, ...v })) };
  }
  res.json({ success: true, data: out });
});

// GET /api/reports — list saved reports
router.get('/', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, GROUP_CONCAT(rr.role_id) AS role_ids
       FROM report r LEFT JOIN report_role rr ON rr.report_id = r.id
       WHERE r.active = 1 GROUP BY r.id ORDER BY r.sort_order, r.name`
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, role_ids: r.role_ids ? r.role_ids.split(',').map(Number) : [], filters: typeof r.filters === 'string' ? JSON.parse(r.filters) : r.filters })) });
  } catch (err) { next(err); }
});

// POST /api/reports — create a report
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { name, description, entity, filters, display_mode, kpi_format, kpi_field, role_ids } = req.body;
    if (!name || !entity) return res.status(400).json({ success: false, error: 'Name and entity required' });

    const [result] = await pool.query(
      `INSERT INTO report (name, description, entity, filters, display_mode, kpi_format, kpi_field, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || null, entity, JSON.stringify(filters || []), display_mode || 'task', kpi_format || 'count', kpi_field || null, req.user?.name || null]
    );

    if (Array.isArray(role_ids)) {
      for (const rid of role_ids) {
        await pool.query('INSERT IGNORE INTO report_role (report_id, role_id) VALUES (?, ?)', [result.insertId, rid]);
      }
    }

    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/reports/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { name, description, entity, filters, display_mode, kpi_format, kpi_field, role_ids, active } = req.body;
    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (entity !== undefined) { fields.push('entity = ?'); values.push(entity); }
    if (filters !== undefined) { fields.push('filters = ?'); values.push(JSON.stringify(filters)); }
    if (display_mode !== undefined) { fields.push('display_mode = ?'); values.push(display_mode); }
    if (kpi_format !== undefined) { fields.push('kpi_format = ?'); values.push(kpi_format); }
    if (kpi_field !== undefined) { fields.push('kpi_field = ?'); values.push(kpi_field); }
    if (active !== undefined) { fields.push('active = ?'); values.push(active ? 1 : 0); }
    if (fields.length) await pool.query(`UPDATE report SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);

    if (Array.isArray(role_ids)) {
      await pool.query('DELETE FROM report_role WHERE report_id = ?', [req.params.id]);
      for (const rid of role_ids) await pool.query('INSERT IGNORE INTO report_role (report_id, role_id) VALUES (?, ?)', [req.params.id, rid]);
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/reports/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE report SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/reports/:id/run — execute a report and return results
router.get('/:id/run', authenticate, async (req, res, next) => {
  try {
    const [[report]] = await pool.query('SELECT * FROM report WHERE id = ? AND active = 1', [req.params.id]);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    const entity = ENTITIES[report.entity];
    if (!entity) return res.status(400).json({ success: false, error: 'Unknown entity' });

    const filters = typeof report.filters === 'string' ? JSON.parse(report.filters) : (report.filters || []);
    const { where, params } = buildWhereFromFilters(report.entity, filters);

    const query = `${entity.baseQuery}${where} ORDER BY ${entity.defaultSort} LIMIT 500`;
    const [rows] = await pool.query(query, params);

    // Also get count
    const countQuery = `SELECT COUNT(*) as cnt FROM (${entity.baseQuery}${where}) AS sub`;
    const [[{ cnt }]] = await pool.query(countQuery, params);

    res.json({ success: true, data: rows, count: cnt, report });
  } catch (err) { next(err); }
});

// GET /api/reports/dashboard — get all reports for the current user's role, with counts
router.get('/dashboard/my', authenticate, async (req, res, next) => {
  try {
    const role = req.user?.role;
    const adminRoles = ['Admin', 'CEO'];

    let reports;
    if (adminRoles.includes(role)) {
      [reports] = await pool.query('SELECT * FROM report WHERE active = 1 ORDER BY sort_order, name');
    } else {
      const [[userRole]] = await pool.query('SELECT id FROM role WHERE role_name = ? AND active = 1', [role]);
      if (!userRole) return res.json({ success: true, data: [] });
      [reports] = await pool.query(
        `SELECT r.* FROM report r JOIN report_role rr ON rr.report_id = r.id
         WHERE r.active = 1 AND rr.role_id = ? ORDER BY r.sort_order, r.name`,
        [userRole.id]
      );
    }

    // Execute each report to get counts
    const results = [];
    for (const report of reports) {
      const entity = ENTITIES[report.entity];
      if (!entity) continue;
      const filters = typeof report.filters === 'string' ? JSON.parse(report.filters) : (report.filters || []);
      const { where, params } = buildWhereFromFilters(report.entity, filters);
      try {
        const countQuery = `SELECT COUNT(*) as cnt FROM (${entity.baseQuery}${where}) AS sub`;
        const [[{ cnt }]] = await pool.query(countQuery, params);
        results.push({ ...report, filters, count: cnt });
      } catch {
        results.push({ ...report, filters, count: 0, error: true });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

module.exports = router;
