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
      prog.session_count, prog.number_enrolled, prog.maximum_students, prog.parent_cost, prog.our_cut,
      prog.invoice_paid, prog.invoice_date_sent, prog.payment_through_us,
      cs.class_status_name AS status, loc.nickname AS location, cl.class_name,
      pt.program_type_name AS program_type, ct.class_type_name AS class_type,
      ga.geographic_area_name AS area,
      CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor,
      CONCAT(sc.first_name, ' ', sc.last_name) AS scheduling_coordinator
    FROM program prog
    LEFT JOIN class_status cs ON cs.id = prog.class_status_id
    LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
    LEFT JOIN class cl ON cl.id = prog.class_id
    LEFT JOIN program_type pt ON pt.id = cl.program_type_id
    LEFT JOIN class_type ct ON ct.id = cl.class_type_id
    LEFT JOIN city c ON c.id = loc.city_id
    LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
    LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
    LEFT JOIN user sc ON sc.id = ga.scheduling_coordinator_user_id
    WHERE prog.active = 1`,
    fields: {
      status: { type: 'select', options: 'class_status' },
      program_type: { type: 'select', options: 'program_type' },
      class_type: { type: 'select', options: 'class_type' },
      area: { type: 'select', options: 'area' },
      class_name: { type: 'text', col: 'cl.class_name' },
      lead_professor: { type: 'text', col: "CONCAT(lp.professor_nickname, ' ', lp.last_name)" },
      scheduling_coordinator: { type: 'text', col: "CONCAT(sc.first_name, ' ', sc.last_name)" },
      location: { type: 'text', col: 'loc.nickname' },
      timeframe: { type: 'timeframe' },
      invoice_status: { type: 'invoice' },
      session_count: { type: 'number', col: 'prog.session_count' },
      enrolled: { type: 'number', col: 'prog.number_enrolled' },
      payment_through_us: { type: 'boolean', col: 'prog.payment_through_us' },
    },
    defaultSort: 'prog.first_session_date DESC',
    countField: 'prog.id',
  },
  professors: {
    label: 'Professors',
    baseQuery: `SELECT p.id, CONCAT(p.professor_nickname, ' ', p.last_name) AS name,
      p.base_pay, p.email, p.phone_number,
      ps.professor_status_name AS status, ga.geographic_area_name AS area,
      CONCAT(sc.first_name, ' ', sc.last_name) AS scheduling_coordinator,
      (SELECT COUNT(*) FROM program pr LEFT JOIN class_status cs2 ON cs2.id = pr.class_status_id
       WHERE pr.active = 1 AND (pr.lead_professor_id = p.id OR pr.assistant_professor_id = p.id)
       AND cs2.class_status_name NOT LIKE 'Cancelled%'
       AND (pr.last_session_date >= CURDATE() OR pr.last_session_date IS NULL)) AS program_count,
      p.science_trained_id, p.engineering_trained_id, p.show_party_trained_id,
      p.camp_trained_id, p.demo_trained_id, p.virtus, p.tb_test
    FROM professor p
    LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
    LEFT JOIN city c ON c.id = p.city_id
    LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
    LEFT JOIN user sc ON sc.id = p.scheduling_coordinator_owner_id
    WHERE p.active = 1`,
    fields: {
      status: { type: 'select', options: 'professor_status' },
      area: { type: 'select', options: 'area' },
      scheduling_coordinator: { type: 'text', col: "CONCAT(sc.first_name, ' ', sc.last_name)" },
      program_count: { type: 'number', col: 'program_count', having: true },
      science_trained: { type: 'boolean', col: 'p.science_trained_id' },
      engineering_trained: { type: 'boolean', col: 'p.engineering_trained_id' },
      party_trained: { type: 'boolean', col: 'p.show_party_trained_id' },
      camp_trained: { type: 'boolean', col: 'p.camp_trained_id' },
      virtus: { type: 'boolean', col: 'p.virtus' },
      tb_test: { type: 'boolean', col: 'p.tb_test' },
    },
    defaultSort: 'p.professor_nickname ASC',
    countField: 'p.id',
  },
  locations: {
    label: 'Locations',
    baseQuery: `SELECT loc.id, loc.nickname AS name, loc.school_name,
      loc.retained, loc.active,
      ga.geographic_area_name AS area, con.contractor_name AS contractor,
      COALESCE(CONCAT(loc_cm.first_name, ' ', loc_cm.last_name), CONCAT(cm.first_name, ' ', cm.last_name)) AS client_manager
    FROM location loc
    LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
    LEFT JOIN contractor con ON con.id = loc.contractor_id
    LEFT JOIN user cm ON cm.id = ga.client_manager_user_id
    LEFT JOIN user loc_cm ON loc_cm.id = loc.client_manager_user_id
    WHERE loc.active = 1 AND (loc.location_type_id IS NULL OR loc.location_type_id != 5)`,
    fields: {
      area: { type: 'select', options: 'area' },
      contractor: { type: 'text', col: 'con.contractor_name' },
      client_manager: { type: 'text', col: "COALESCE(CONCAT(loc_cm.first_name, ' ', loc_cm.last_name), CONCAT(cm.first_name, ' ', cm.last_name))" },
      retained: { type: 'boolean', col: 'loc.retained' },
    },
    defaultSort: 'loc.nickname ASC',
    countField: 'loc.id',
  },
  lessons: {
    label: 'Lessons',
    baseQuery: `SELECT l.id, l.lesson_name AS name, l.review_status, l.next_update_required, l.lesson_type
    FROM lesson l WHERE l.active = 1`,
    fields: {
      review_status: { type: 'select', options: ['okay', 'review', 'overdue'] },
      lesson_type: { type: 'select', options: ['science', 'engineering', 'robotics', 'financial_literacy'] },
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
