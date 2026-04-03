const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/bulk-input/setup — load dropdown data for the wizard
router.get('/setup', authenticate, async (req, res, next) => {
  try {
    const [contractors] = await pool.query(
      `SELECT id, contractor_name FROM contractor WHERE active = 1 ORDER BY contractor_name`
    );
    const [locations] = await pool.query(
      `SELECT l.id, l.nickname, l.contractor_id, l.payment_through_us,
              l.virtus_required, l.tb_required, l.livescan_required,
              l.contract_permit_required, l.special_info_required, l.flyer_required,
              con.contractor_name
       FROM location l
       LEFT JOIN contractor con ON con.id = l.contractor_id AND con.active = 1
       WHERE l.active = 1 AND (l.location_type_id IS NULL OR l.location_type_id != 5)
       ORDER BY l.nickname`
    );
    const [classTypes] = await pool.query(
      `SELECT id, class_type_name FROM class_type WHERE active = 1 ORDER BY class_type_name`
    );
    const [classes] = await pool.query(
      `SELECT c.id, c.class_name, c.class_code, c.program_type_id, c.class_type_id,
              pt.program_type_name, ct.class_type_name
       FROM class c
       LEFT JOIN program_type pt ON pt.id = c.program_type_id
       LEFT JOIN class_type ct ON ct.id = c.class_type_id
       WHERE c.active = 1 ORDER BY c.class_name`
    );
    const [programTypes] = await pool.query(
      `SELECT id, program_type_name FROM program_type WHERE active = 1 ORDER BY program_type_name`
    );
    const [classStatuses] = await pool.query(
      `SELECT id, class_status_name FROM class_status WHERE active = 1 ORDER BY id`
    );
    const [salesUsers] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name FROM user u
       LEFT JOIN role r ON r.id = u.role_id
       WHERE u.active = 1 AND r.role_name = 'Sales' ORDER BY u.last_name`
    );
    const [existingNicknames] = await pool.query(
      `SELECT program_nickname FROM program WHERE active = 1`
    );

    res.json({
      success: true,
      data: {
        contractors,
        locations,
        classTypes,
        classes,
        programTypes,
        classStatuses,
        salesUsers,
        existingNicknames: existingNicknames.map(r => r.program_nickname),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bulk-input/save — save multiple programs with sessions
router.post('/save', authenticate, async (req, res, next) => {
  try {
    const { programs } = req.body;
    if (!Array.isArray(programs) || programs.length === 0) {
      return res.status(400).json({ success: false, error: 'Programs array required' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const createdIds = [];

      for (const prog of programs) {
        // Insert program
        const [result] = await conn.query(
          `INSERT INTO program (
            program_nickname, class_status_id, location_id, class_id,
            start_time, class_length_minutes,
            monday, tuesday, wednesday, thursday, friday, saturday, sunday,
            minimum_students, maximum_students, parent_cost, our_cut,
            first_session_date, last_session_date,
            general_notes, payment_through_us,
            tb_required, livescan_required, virtus_required,
            active, ts_inserted, ts_updated
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
          [
            prog.program_nickname,
            prog.class_status_id || 1,
            prog.location_id || null,
            prog.class_id || null,
            prog.start_time || null,
            prog.class_length_minutes || null,
            prog.day === 'Monday' || prog.day === 'M-F' ? 1 : 0,
            prog.day === 'Tuesday' || prog.day === 'M-F' ? 1 : 0,
            prog.day === 'Wednesday' || prog.day === 'M-F' ? 1 : 0,
            prog.day === 'Thursday' || prog.day === 'M-F' ? 1 : 0,
            prog.day === 'Friday' || prog.day === 'M-F' ? 1 : 0,
            prog.day === 'Saturday' ? 1 : 0,
            prog.day === 'Sunday' ? 1 : 0,
            prog.minimum_students || null,
            prog.maximum_students || null,
            prog.parent_cost || null,
            prog.our_cut || null,
            prog.first_session_date || null,
            prog.last_session_date || null,
            prog.general_notes || null,
            prog.payment_through_us ? 1 : 0,
            prog.tb_required ? 1 : 0,
            prog.livescan_required ? 1 : 0,
            prog.virtus_required ? 1 : 0,
          ]
        );

        const programId = result.insertId;
        createdIds.push(programId);

        // Insert sessions
        if (Array.isArray(prog.session_dates)) {
          for (const dateStr of prog.session_dates) {
            await conn.query(
              `INSERT INTO session (program_id, session_date, session_time, active, ts_inserted, ts_updated)
               VALUES (?, ?, ?, 1, NOW(), NOW())`,
              [programId, dateStr, prog.start_time || null]
            );
          }
        }
      }

      await conn.commit();
      res.json({ success: true, created: createdIds.length, ids: createdIds });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
