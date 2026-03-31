const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/locations
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, active, area, client_manager, contractor, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [];
    let params = [];

    if (active !== undefined && active !== '') {
      whereClauses.push(`loc.active = ?`);
      params.push(parseInt(active));
    } else {
      whereClauses.push(`loc.active = 1`);
    }

    if (search) {
      whereClauses.push(`(loc.nickname LIKE ? OR loc.school_name LIKE ? OR loc.address LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (area) {
      whereClauses.push(`loc.geographic_area_id_online = ?`);
      params.push(area);
    }
    if (client_manager) {
      whereClauses.push(`ga.client_manager_user_id = ?`);
      params.push(client_manager);
    }
    if (contractor) {
      whereClauses.push(`loc.contractor_id = ?`);
      params.push(contractor);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT loc.id, loc.nickname, loc.school_name, loc.address, loc.active,
              loc.payment_through_us, loc.virtus_required, loc.tb_required, loc.livescan_required,
              loc.location_enrollment, loc.demo_allowed, loc.tbd,
              c.city_name,
              ga.geographic_area_name,
              con.contractor_name,
              CONCAT(cm_user.first_name, ' ', cm_user.last_name) AS client_manager,
              lt.location_type_name,
              (SELECT COUNT(*) FROM default_location_class_type dlct
               WHERE dlct.location_id = loc.id AND dlct.active = 1) AS class_count
       FROM location loc
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online AND ga.active = 1
       LEFT JOIN user cm_user ON cm_user.id = ga.client_manager_user_id
       LEFT JOIN contractor con ON con.id = loc.contractor_id AND con.active = 1
       LEFT JOIN location_type lt ON lt.id = loc.location_type_id AND lt.active = 1
       ${where}
       ORDER BY loc.nickname
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM location loc
       LEFT JOIN city c ON c.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online AND ga.active = 1
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

    res.json({
      success: true,
      data: { ...location, classTypes, cutTypes },
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
      'nickname', 'school_name', 'payment_through_us', 'location_type_id', 'location_phone',
      'address', 'city_id', 'geographic_area_id_online', 'point_of_contact', 'poc_title_id',
      'poc_phone', 'poc_email', 'contractor_id', 'location_enrollment', 'demo_allowed',
      'demo_type_id', 'demo_pay', 'demo_notes', 'class_pricing_type_id', 'virtus_required',
      'tb_required', 'livescan_required', 'livescan_info', 'contract_permit_required',
      'contract_permit_notes', 'special_info_required', 'flyer_required',
      'registration_link_for_flyer', 'custom_flyer_required', 'custom_flyer_items_required',
      'flyer_quantity', 'parking_difficulty_id', 'parking_information', 'school_procedure_Info',
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
      'nickname', 'school_name', 'payment_through_us', 'location_type_id', 'location_phone',
      'address', 'city_id', 'geographic_area_id_online', 'point_of_contact', 'poc_title_id',
      'poc_phone', 'poc_email', 'contractor_id', 'location_enrollment', 'demo_allowed',
      'demo_type_id', 'demo_pay', 'demo_notes', 'class_pricing_type_id', 'virtus_required',
      'tb_required', 'livescan_required', 'livescan_info', 'contract_permit_required',
      'contract_permit_notes', 'special_info_required', 'flyer_required',
      'registration_link_for_flyer', 'custom_flyer_required', 'custom_flyer_items_required',
      'flyer_quantity', 'parking_difficulty_id', 'parking_information', 'school_procedure_Info',
      'internal_notes', 'observes_allowed', 'jewish', 'set_dates_ourselves', 'number_of_weeks',
      'school_calendar_link', 'invoicing_notes', 'tbd', 'tbd_notes', 'active',
    ];

    const updateFields = fields.filter(f => data[f] !== undefined);
    const values = updateFields.map(f => data[f] === '' ? null : data[f]);

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    await pool.query(
      `UPDATE location SET ${updateFields.map(f => `${f} = ?`).join(', ')}, ts_updated = NOW()
       WHERE id = ?`,
      [...values, id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
