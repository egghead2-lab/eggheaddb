const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/programs (exclude party program types)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status, location, professor, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [
      'prog.active = 1',
      `pt.program_type_name != 'Party'`,
    ];
    let params = [];

    if (search) {
      whereClauses.push(`(prog.program_nickname LIKE ? OR loc.nickname LIKE ? OR cl.class_name LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (status) {
      whereClauses.push(`prog.class_status_id = ?`);
      params.push(status);
    }
    if (location) {
      whereClauses.push(`prog.location_id = ?`);
      params.push(location);
    }
    if (professor) {
      whereClauses.push(`(prog.lead_professor_id = ? OR prog.assistant_professor_id = ?)`);
      params.push(professor, professor);
    }

    const where = `WHERE ${whereClauses.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.live, prog.start_time, prog.class_length_minutes,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday,
              prog.saturday, prog.sunday, prog.number_enrolled, prog.minimum_students,
              prog.maximum_students, prog.payment_through_us, prog.first_session_date,
              prog.last_session_date, prog.parent_cost, prog.lab_fee,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              cl.class_name, cl.class_code,
              pt.program_type_name,
              CONCAT(lp.first_name, ' ', lp.last_name) AS lead_professor_name,
              lp.professor_nickname AS lead_professor_nickname,
              CONCAT(ap.first_name, ' ', ap.last_name) AS assistant_professor_name
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id AND cs.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id AND pt.active = 1
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id AND lp.active = 1
       LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id AND ap.active = 1
       ${where}
       ORDER BY prog.first_session_date DESC, prog.program_nickname
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM program prog
       LEFT JOIN class cl ON cl.id = prog.class_id AND cl.active = 1
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id AND pt.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
       ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/programs/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[program]] = await pool.query(
      `SELECT prog.*,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              cl.class_name, cl.class_code, cl.formal_class_name,
              pt.program_type_name,
              lp.professor_nickname AS lead_professor_nickname,
              ap.professor_nickname AS assistant_professor_nickname,
              dp.professor_nickname AS demo_professor_nickname
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id
       LEFT JOIN professor dp ON dp.id = prog.demo_professor_id
       WHERE prog.id = ? AND prog.active = 1`,
      [id]
    );

    if (!program) {
      return res.status(404).json({ success: false, error: 'Program not found' });
    }

    const [sessions] = await pool.query(
      `SELECT s.*,
              p.professor_nickname AS professor_nickname,
              ap.professor_nickname AS assistant_nickname,
              l.lesson_name
       FROM session s
       LEFT JOIN professor p ON p.id = s.professor_id
       LEFT JOIN professor ap ON ap.id = s.assistant_id
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.program_id = ? AND s.active = 1
       ORDER BY s.session_date, s.session_time`,
      [id]
    );

    const [roster] = await pool.query(
      `SELECT pr.*,
              st.first_name, st.last_name, st.birthday,
              g.grade_name
       FROM program_roster pr
       LEFT JOIN student st ON st.id = pr.student_id AND st.active = 1
       LEFT JOIN grade g ON g.id = pr.grade_id AND g.active = 1
       WHERE pr.program_id = ? AND pr.active = 1
       ORDER BY st.last_name, st.first_name`,
      [id]
    );

    res.json({ success: true, data: { ...program, sessions, roster } });
  } catch (err) {
    next(err);
  }
});

// POST /api/programs
router.post('/', authenticate, async (req, res, next) => {
  try {
    const data = req.body;

    const fields = [
      'program_nickname', 'class_status_id', 'location_id', 'live', 'class_id',
      'start_time', 'class_length_minutes', 'monday', 'tuesday', 'wednesday', 'thursday',
      'friday', 'saturday', 'sunday', 'general_notes', 'parent_cost', 'lab_fee',
      'number_enrolled', 'minimum_students', 'maximum_students', 'roster_received',
      'roster_confirmed', 'roster_notes', 'degrees_printed', 'payment_through_us',
      'lead_professor_id', 'lead_professor_pay', 'tb_required', 'livescan_required',
      'virtus_required', 'roster_link', 'demo_required', 'demo_date', 'demo_start_time',
      'demo_end_time', 'demo_type_id', 'demo_pay', 'demo_professor_id', 'demo_notes',
      'flyer_required', 'flyer_made', 'flyer_sent_electronic', 'flyer_dropped_physical',
      'flyer_dropped_physical_notes', 'registration_opened_online', 'open_blast_sent',
      'two_week_blast_sent', 'one_week_blast_sent', 'final_blast_sent',
      'parent_feedback_requested', 'glow_slime_amount_needed', 'calendar_event',
      'materials_prepared', 'details_confirmed', 'invoice_needed', 'how_heard',
      'lead_professor_drive_fee', 'lead_professor_tip', 'lead_professor_dry_ice',
      'lead_reimbursements_paid', 'assistant_required', 'assistant_professor_id',
      'assistant_professor_pay', 'assistant_professor_drive_fee', 'assistant_professor_tip',
      'assistant_professor_dry_ice', 'assistant_reimbursements_paid',
      'first_session_date', 'last_session_date', 'invoice_date_sent', 'invoice_paid',
      'invoice_notes', 'contract_permit_required_id', 'special_info_required',
    ];

    const insertFields = fields.filter(f => data[f] !== undefined);
    const values = insertFields.map(f => data[f] === '' ? null : data[f]);

    const [result] = await pool.query(
      `INSERT INTO program (${insertFields.join(', ')}, active, ts_inserted, ts_updated)
       VALUES (${insertFields.map(() => '?').join(', ')}, 1, NOW(), NOW())`,
      values
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/programs/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const fields = [
      'program_nickname', 'class_status_id', 'location_id', 'live', 'class_id',
      'start_time', 'class_length_minutes', 'monday', 'tuesday', 'wednesday', 'thursday',
      'friday', 'saturday', 'sunday', 'general_notes', 'parent_cost', 'lab_fee',
      'number_enrolled', 'minimum_students', 'maximum_students', 'roster_received',
      'roster_confirmed', 'roster_notes', 'degrees_printed', 'payment_through_us',
      'lead_professor_id', 'lead_professor_pay', 'tb_required', 'livescan_required',
      'virtus_required', 'roster_link', 'demo_required', 'demo_date', 'demo_start_time',
      'demo_end_time', 'demo_type_id', 'demo_pay', 'demo_professor_id', 'demo_notes',
      'flyer_required', 'flyer_made', 'flyer_sent_electronic', 'flyer_dropped_physical',
      'flyer_dropped_physical_notes', 'registration_opened_online', 'open_blast_sent',
      'two_week_blast_sent', 'one_week_blast_sent', 'final_blast_sent',
      'parent_feedback_requested', 'glow_slime_amount_needed', 'calendar_event',
      'materials_prepared', 'details_confirmed', 'invoice_needed', 'how_heard',
      'lead_professor_drive_fee', 'lead_professor_tip', 'lead_professor_dry_ice',
      'lead_reimbursements_paid', 'assistant_required', 'assistant_professor_id',
      'assistant_professor_pay', 'assistant_professor_drive_fee', 'assistant_professor_tip',
      'assistant_professor_dry_ice', 'assistant_reimbursements_paid',
      'first_session_date', 'last_session_date', 'invoice_date_sent', 'invoice_paid',
      'invoice_notes', 'contract_permit_required_id', 'special_info_required', 'active',
    ];

    const updateFields = fields.filter(f => data[f] !== undefined);
    const values = updateFields.map(f => data[f] === '' ? null : data[f]);

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    await pool.query(
      `UPDATE program SET ${updateFields.map(f => `${f} = ?`).join(', ')}, ts_updated = NOW()
       WHERE id = ?`,
      [...values, id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/programs/:id/sessions
router.get('/:id/sessions', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [sessions] = await pool.query(
      `SELECT s.*,
              p.professor_nickname,
              ap.professor_nickname AS assistant_nickname,
              l.lesson_name
       FROM session s
       LEFT JOIN professor p ON p.id = s.professor_id
       LEFT JOIN professor ap ON ap.id = s.assistant_id
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.program_id = ? AND s.active = 1
       ORDER BY s.session_date, s.session_time`,
      [id]
    );
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
});

// PUT /api/programs/:id/sessions (bulk upsert)
router.put('/:id/sessions', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sessions } = req.body;

    if (!Array.isArray(sessions)) {
      return res.status(400).json({ success: false, error: 'Sessions must be an array' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const session of sessions) {
        if (session.id) {
          await conn.query(
            `UPDATE session SET lesson_id=?, professor_id=?, professor_pay=?, assistant_id=?,
             assistant_pay=?, session_date=?, session_time=?, specific_notes=?, ts_updated=NOW()
             WHERE id=? AND program_id=?`,
            [
              session.lesson_id || null, session.professor_id || null, session.professor_pay || null,
              session.assistant_id || null, session.assistant_pay || null,
              session.session_date || null, session.session_time || null,
              session.specific_notes || null, session.id, id,
            ]
          );
        } else {
          await conn.query(
            `INSERT INTO session (program_id, lesson_id, professor_id, professor_pay, assistant_id,
             assistant_pay, session_date, session_time, specific_notes, active, ts_inserted, ts_updated)
             VALUES (?,?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
            [
              id, session.lesson_id || null, session.professor_id || null, session.professor_pay || null,
              session.assistant_id || null, session.assistant_pay || null,
              session.session_date || null, session.session_time || null, session.specific_notes || null,
            ]
          );
        }
      }

      await conn.commit();
      res.json({ success: true });
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

// GET /api/programs/:id/roster
router.get('/:id/roster', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [roster] = await pool.query(
      `SELECT pr.*,
              st.first_name, st.last_name, st.birthday,
              g.grade_name
       FROM program_roster pr
       LEFT JOIN student st ON st.id = pr.student_id AND st.active = 1
       LEFT JOIN grade g ON g.id = pr.grade_id AND g.active = 1
       WHERE pr.program_id = ? AND pr.active = 1
       ORDER BY st.last_name, st.first_name`,
      [id]
    );
    res.json({ success: true, data: roster });
  } catch (err) {
    next(err);
  }
});

// PUT /api/programs/:id/roster (bulk upsert)
router.put('/:id/roster', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { roster } = req.body;

    if (!Array.isArray(roster)) {
      return res.status(400).json({ success: false, error: 'Roster must be an array' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const entry of roster) {
        if (entry.id) {
          await conn.query(
            `UPDATE program_roster SET grade_id=?, age=?, gender=?, date_applied=?,
             date_dropped=?, student_lab_fee=?, notes=?, ts_updated=NOW()
             WHERE id=? AND program_id=?`,
            [
              entry.grade_id || null, entry.age || null, entry.gender || null,
              entry.date_applied || null, entry.date_dropped || null,
              entry.student_lab_fee || null, entry.notes || null, entry.id, id,
            ]
          );
        } else {
          await conn.query(
            `INSERT INTO program_roster (program_id, student_id, grade_id, age, gender,
             date_applied, date_dropped, student_lab_fee, notes, active, ts_inserted, ts_updated)
             VALUES (?,?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
            [
              id, entry.student_id || null, entry.grade_id || null, entry.age || null,
              entry.gender || null, entry.date_applied || null, entry.date_dropped || null,
              entry.student_lab_fee || null, entry.notes || null,
            ]
          );
        }
      }

      await conn.commit();
      res.json({ success: true });
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
