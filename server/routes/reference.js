const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/areas
router.get('/areas', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ga.id, ga.geographic_area_name,
              CONCAT(sc.first_name, ' ', sc.last_name) AS scheduling_coordinator,
              CONCAT(fm.first_name, ' ', fm.last_name) AS field_manager,
              CONCAT(cm.first_name, ' ', cm.last_name) AS client_manager,
              ga.scheduling_coordinator_user_id,
              ga.field_manager_user_id,
              ga.client_manager_user_id,
              ga.active
       FROM geographic_area ga
       LEFT JOIN user sc ON sc.id = ga.scheduling_coordinator_user_id
       LEFT JOIN user fm ON fm.id = ga.field_manager_user_id
       LEFT JOIN user cm ON cm.id = ga.client_manager_user_id
       WHERE ga.active = 1
       ORDER BY ga.geographic_area_name`
    );
    res.json({ success: true, data: rows });
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
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/professors/list
router.get('/professors/list', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, professor_nickname FROM professor WHERE active = 1 ORDER BY professor_nickname`
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
      `SELECT id, nickname FROM location WHERE active = 1 ORDER BY nickname`
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
