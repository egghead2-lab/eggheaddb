const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

// GET /api/locations
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, active, area, client_manager, contractor, sort, dir, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [];
    let params = [];

    if (active !== undefined && active !== '') {
      whereClauses.push(`loc.active = ?`);
      params.push(active === 'true' ? 1 : 0);
    } else {
      whereClauses.push(`loc.active = 1`);
    }
    whereClauses.push(`(loc.location_type_id IS NULL OR loc.location_type_id != 5)`);

    if (search) {
      whereClauses.push(`(loc.nickname LIKE ? OR loc.school_name LIKE ? OR loc.address LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (area) {
      whereClauses.push(`ga.geographic_area_name = ?`);
      params.push(area);
    }
    if (client_manager) {
      whereClauses.push(`ga.client_manager_user_id = ?`);
      params.push(client_manager);
    }
    if (contractor) {
      whereClauses.push(`con.contractor_name = ?`);
      params.push(contractor);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const sortMap = {
      nickname: 'loc.nickname', school_name: 'loc.school_name',
      area: 'ga.geographic_area_name', contractor: 'con.contractor_name',
    };
    const sortCol = sortMap[sort] || 'loc.nickname';
    const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

    const [rows] = await pool.query(
      `SELECT loc.id, loc.nickname, loc.school_name, loc.address, loc.active,
              loc.payment_through_us, loc.school_collects_lab_fee, loc.virtus_required, loc.tb_required, loc.livescan_required,
              loc.location_enrollment, loc.demo_allowed, loc.tbd, loc.retained,
              loc.client_manager_user_id, loc.location_phone, loc.point_of_contact,
              loc.poc_email, loc.poc_phone, loc.school_calendar_link,
              c.city_name,
              ga.geographic_area_name,
              loc.contractor_id, con.contractor_name,
              COALESCE(CONCAT(loc_cm.first_name, ' ', loc_cm.last_name), CONCAT(cm_user.first_name, ' ', cm_user.last_name)) AS client_manager,
              lt.location_type_name,
              (SELECT COUNT(*) FROM default_location_class_type dlct
               WHERE dlct.location_id = loc.id AND dlct.active = 1) AS class_count
       FROM location loc
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online AND ga.active = 1
       LEFT JOIN user cm_user ON cm_user.id = ga.client_manager_user_id
       LEFT JOIN user loc_cm ON loc_cm.id = loc.client_manager_user_id AND loc_cm.active = 1
       LEFT JOIN contractor con ON con.id = loc.contractor_id AND con.active = 1
       LEFT JOIN location_type lt ON lt.id = loc.location_type_id AND lt.active = 1
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM location loc
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online AND ga.active = 1
       LEFT JOIN contractor con ON con.id = loc.contractor_id AND con.active = 1
       ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/locations/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[location]] = await pool.query(
      `SELECT loc.*,
              c.city_name, c.zip_code, c.state_id,
              ga.geographic_area_name,
              con.contractor_name,
              lt.location_type_name
       FROM location loc
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       LEFT JOIN contractor con ON con.id = loc.contractor_id
       LEFT JOIN location_type lt ON lt.id = loc.location_type_id
       WHERE loc.id = ?`,
      [id]
    );

    if (!location) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    const [classTypes] = await pool.query(
      `SELECT dlct.*,
              ct.class_type_name,
              lft.lab_fee_type_name
       FROM default_location_class_type dlct
       LEFT JOIN class_type ct ON ct.id = dlct.class_type_id AND ct.active = 1
       LEFT JOIN lab_fee_type lft ON lft.id = dlct.lab_fee_type_id AND lft.active = 1
       WHERE dlct.location_id = ? AND dlct.active = 1
       ORDER BY dlct.id`,
      [id]
    );

    const [cutTypes] = await pool.query(
      `SELECT lct.*, ct.cut_type_name, ct.cut_type_unit
       FROM location_cut_type lct
       LEFT JOIN cut_type ct ON ct.id = lct.cut_type_id
       WHERE lct.location_id = ? AND lct.active = 1
       ORDER BY lct.id`,
      [id]
    );

    const [programs] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.last_session_date,
              prog.session_count, prog.parent_cost, prog.our_cut, prog.invoice_paid, prog.invoice_date_sent,
              prog.invoice_needed, prog.invoice_notes,
              cs.class_status_name,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       WHERE prog.location_id = ? AND prog.active = 1 AND cs.class_status_name NOT LIKE 'Cancelled%'
       ORDER BY prog.first_session_date DESC`,
      [id]
    );

    res.json({
      success: true,
      data: { ...location, classTypes, cutTypes, programs },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/locations
router.post('/', authenticate, async (req, res, next) => {
  try {
    const data = req.body;

    const fields = [
      'nickname', 'school_name', 'payment_through_us', 'school_collects_lab_fee', 'location_type_id', 'location_phone',
      'address', 'city_id', 'geographic_area_id_online', 'point_of_contact', 'poc_title',
      'poc_phone', 'poc_email', 'contractor_id', 'location_enrollment', 'demo_allowed',
      'demo_type_id', 'demo_pay', 'demo_notes', 'class_pricing_type_id', 'virtus_required',
      'tb_required', 'livescan_required', 'livescan_info', 'contract_permit_required',
      'contract_permit_notes', 'special_info_required', 'flyer_required',
      'registration_link_for_flyer', 'custom_flyer_required', 'custom_flyer_items_required',
      'flyer_quantity', 'flyer_instructions', 'parking_difficulty_id', 'parking_information', 'school_procedure_Info',
      'internal_notes', 'observes_allowed', 'jewish', 'set_dates_ourselves', 'number_of_weeks',
      'school_calendar_link', 'invoicing_notes', 'tbd', 'tbd_notes',
    ];

    const insertFields = fields.filter(f => data[f] !== undefined);
    const values = insertFields.map(f => data[f] === '' ? null : data[f]);

    const [result] = await pool.query(
      `INSERT INTO location (${insertFields.join(', ')}, active, ts_inserted, ts_updated)
       VALUES (${insertFields.map(() => '?').join(', ')}, 1, NOW(), NOW())`,
      values
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/locations/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const fields = [
      'nickname', 'school_name', 'payment_through_us', 'school_collects_lab_fee', 'location_type_id', 'location_phone',
      'address', 'city_id', 'geographic_area_id_online', 'point_of_contact', 'poc_title',
      'poc_phone', 'poc_email', 'contractor_id', 'location_enrollment', 'demo_allowed',
      'demo_type_id', 'demo_pay', 'demo_notes', 'class_pricing_type_id', 'virtus_required',
      'tb_required', 'livescan_required', 'livescan_info', 'contract_permit_required',
      'contract_permit_notes', 'special_info_required', 'flyer_required',
      'registration_link_for_flyer', 'custom_flyer_required', 'custom_flyer_items_required',
      'flyer_quantity', 'flyer_instructions', 'parking_difficulty_id', 'parking_information', 'school_procedure_Info',
      'internal_notes', 'observes_allowed', 'jewish', 'set_dates_ourselves', 'number_of_weeks',
      'school_calendar_link', 'invoicing_notes', 'tbd', 'tbd_notes', 'retained',
      'client_manager_user_id',
      'site_coordinator_name', 'site_coordinator_email', 'site_coordinator_phone', 'site_coordinator_role',
      'invoice_type', 'invoice_contact_name', 'invoice_contact_email', 'invoice_contact_phone', 'invoice_at_district',
      'classroom_location', 'attendance_required', 'attendance_directions',
      'arrival_checkin_procedures', 'student_pickup_procedures', 'dismissal_procedures',
      'emergency_procedures', 'egghead_tips',
      'active',
    ];

    const updateFields = fields.filter(f => data[f] !== undefined);
    const values = updateFields.map(f => data[f] === '' ? null : data[f]);

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    const [[oldRow]] = await pool.query('SELECT * FROM location WHERE id = ?', [id]);

    await pool.query(
      `UPDATE location SET ${updateFields.map(f => `${f} = ?`).join(', ')}, ts_updated = NOW()
       WHERE id = ?`,
      [...values, id]
    );

    if (oldRow) logAudit('location', id, req.user, oldRow, data);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/locations/:id/past-programs — history of programs at this location
router.get('/:id/past-programs', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.last_session_date,
              prog.parent_cost, prog.our_cut, prog.lab_fee, prog.number_enrolled,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              cs.class_status_name,
              pt.program_type_name,
              cl.class_name
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       WHERE prog.location_id = ? AND prog.active = 1
       ORDER BY prog.first_session_date DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/locations/:id/info-sheet — public-facing info for professors
router.get('/:id/info-sheet', authenticate, async (req, res, next) => {
  try {
    const [[loc]] = await pool.query(
      `SELECT l.nickname, l.school_name, l.address, l.location_phone, l.retained,
              l.classroom_location, l.parking_information,
              l.attendance_required, l.attendance_directions,
              l.arrival_checkin_procedures, l.student_pickup_procedures,
              l.dismissal_procedures, l.emergency_procedures, l.egghead_tips,
              l.point_of_contact, l.site_coordinator_name,
              l.ts_updated,
              lt.location_type_name,
              pd.parking_difficulty_name,
              con.contractor_name
       FROM location l
       LEFT JOIN location_type lt ON lt.id = l.location_type_id
       LEFT JOIN parking_difficulty pd ON pd.id = l.parking_difficulty_id
       LEFT JOIN contractor con ON con.id = l.contractor_id
       WHERE l.id = ?`, [req.params.id]
    );
    if (!loc) return res.status(404).json({ success: false, error: 'Location not found' });
    res.json({ success: true, data: loc });
  } catch (err) { next(err); }
});

module.exports = router;
