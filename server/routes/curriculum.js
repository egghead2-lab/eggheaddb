const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ════════════════════════════════════════════════════════════════
// CURRICULUM SETTING — Grid data
// ════════════════════════════════════════════════════════════════

// GET /api/curriculum/programs — programs with session/lesson data for the grid
router.get('/programs', async (req, res, next) => {
  try {
    const { class_type_id, class_id, contractor_id, area_id, show_unset_only } = req.query;

    let where = `prog.active = 1 AND prog.live = 1 AND cs.confirmed = 1`;
    const params = [];

    if (class_type_id) { where += ' AND cl.class_type_id = ?'; params.push(class_type_id); }
    if (class_id) { where += ' AND prog.class_id = ?'; params.push(class_id); }
    if (contractor_id) { where += ' AND loc.contractor_id = ?'; params.push(contractor_id); }
    if (area_id) { where += ' AND COALESCE(loc.geographic_area_id_online, ci.geographic_area_id) = ?'; params.push(area_id); }

    // Only programs with at least one future session or recent session
    where += ` AND EXISTS (SELECT 1 FROM session s WHERE s.program_id = prog.id AND s.active = 1 AND s.session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY))`;

    const [programs] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.class_id, prog.session_count,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              cl.class_name, cl.class_code,
              ct.class_type_name,
              loc.nickname AS location_nickname,
              con.contractor_name,
              ga.geographic_area_name,
              (SELECT COUNT(*) FROM session s WHERE s.program_id = prog.id AND s.active = 1 AND s.lesson_id IS NULL AND s.no_lesson_taught = 0 AND s.not_billed = 0) AS unscheduled_count
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN class_type ct ON ct.id = cl.class_type_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN city ci ON ci.id = loc.city_id
       LEFT JOIN contractor con ON con.id = loc.contractor_id
       LEFT JOIN geographic_area ga ON ga.id = COALESCE(loc.geographic_area_id_online, ci.geographic_area_id)
       WHERE ${where}
       ORDER BY con.contractor_name, loc.nickname, prog.program_nickname`,
      params
    );

    if (show_unset_only === 'true') {
      const filtered = programs.filter(p => p.unscheduled_count > 0);
      return res.json({ success: true, data: filtered });
    }

    res.json({ success: true, data: programs });
  } catch (err) { next(err); }
});

// GET /api/curriculum/programs/:id/sessions — sessions for a program with lesson info
router.get('/programs/:id/sessions', async (req, res, next) => {
  try {
    const [sessions] = await pool.query(
      `SELECT s.id, s.session_date, s.session_time, s.lesson_id, s.not_billed, s.no_lesson_taught,
              l.lesson_name
       FROM session s
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.program_id = ? AND s.active = 1
       ORDER BY s.session_date ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: sessions });
  } catch (err) { next(err); }
});

// GET /api/curriculum/lessons — lessons for a class_id (for dropdowns)
router.get('/lessons', async (req, res, next) => {
  try {
    const { class_id } = req.query;
    let where = 'active = 1';
    const params = [];
    if (class_id) { where += ' AND class_id = ?'; params.push(class_id); }
    const [lessons] = await pool.query(
      `SELECT id, lesson_name, class_id, sort_order FROM lesson WHERE ${where} ORDER BY sort_order, lesson_name`,
      params
    );
    res.json({ success: true, data: lessons });
  } catch (err) { next(err); }
});

// POST /api/curriculum/bulk-sessions — fetch sessions for multiple programs at once
router.post('/bulk-sessions', async (req, res, next) => {
  try {
    const { program_ids } = req.body;
    if (!program_ids?.length) return res.json({ success: true, data: {} });

    const [sessions] = await pool.query(
      `SELECT s.id, s.program_id, s.session_date, s.lesson_id, s.not_billed, s.no_lesson_taught,
              l.lesson_name
       FROM session s
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.program_id IN (?) AND s.active = 1
       ORDER BY s.session_date ASC`,
      [program_ids]
    );

    // Group by program_id
    const grouped = {};
    sessions.forEach(s => {
      if (!grouped[s.program_id]) grouped[s.program_id] = [];
      grouped[s.program_id].push(s);
    });

    res.json({ success: true, data: grouped });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════════
// SAVE & BACKUP
// ════════════════════════════════════════════════════════════════

// POST /api/curriculum/save — save lesson assignments with backup
router.post('/save', async (req, res, next) => {
  try {
    const { changes, label } = req.body;
    // changes = [{ session_id, lesson_id, no_lesson_taught }]
    if (!changes?.length) return res.status(400).json({ success: false, error: 'No changes' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Create backup
      const [backupResult] = await conn.query(
        'INSERT INTO curriculum_backup (backup_label, created_by_user_id) VALUES (?, ?)',
        [label || `Curriculum update ${new Date().toISOString().split('T')[0]}`, req.user.userId]
      );
      const backupId = backupResult.insertId;

      // Get current values and save to backup, then update
      for (const change of changes) {
        const [[current]] = await conn.query(
          'SELECT lesson_id FROM session WHERE id = ?', [change.session_id]
        );

        await conn.query(
          'INSERT INTO curriculum_backup_session (backup_id, session_id, previous_lesson_id, new_lesson_id) VALUES (?,?,?,?)',
          [backupId, change.session_id, current?.lesson_id || null, change.lesson_id || null]
        );

        if (change.no_lesson_taught) {
          await conn.query(
            'UPDATE session SET lesson_id = NULL, no_lesson_taught = 1, ts_updated = NOW() WHERE id = ?',
            [change.session_id]
          );
        } else {
          await conn.query(
            'UPDATE session SET lesson_id = ?, no_lesson_taught = 0, ts_updated = NOW() WHERE id = ?',
            [change.lesson_id || null, change.session_id]
          );
        }
      }

      await conn.commit();
      res.json({ success: true, backup_id: backupId, sessions_updated: changes.length });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) { next(err); }
});

// GET /api/curriculum/backups — recent backups
router.get('/backups', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT cb.*, u.first_name AS created_by_name,
              (SELECT COUNT(*) FROM curriculum_backup_session cbs WHERE cbs.backup_id = cb.id) AS session_count
       FROM curriculum_backup cb
       LEFT JOIN user u ON u.id = cb.created_by_user_id
       WHERE cb.active = 1
       ORDER BY cb.created_at DESC LIMIT 5`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/curriculum/revert/:backupId — restore a backup
router.post('/revert/:backupId', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT session_id, previous_lesson_id FROM curriculum_backup_session WHERE backup_id = ?',
      [req.params.backupId]
    );

    for (const row of rows) {
      await pool.query(
        'UPDATE session SET lesson_id = ?, no_lesson_taught = 0, ts_updated = NOW() WHERE id = ?',
        [row.previous_lesson_id, row.session_id]
      );
    }

    // Deactivate the backup
    await pool.query('UPDATE curriculum_backup SET active = 0 WHERE id = ?', [req.params.backupId]);

    res.json({ success: true, sessions_reverted: rows.length });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════════
// BULK SET — apply a lesson sequence to selected programs
// ════════════════════════════════════════════════════════════════

// POST /api/curriculum/bulk-set — apply lesson sequence to multiple programs
router.post('/bulk-set', async (req, res, next) => {
  try {
    const { program_ids, lesson_sequence, start_at_week } = req.body;
    // lesson_sequence = [lesson_id, lesson_id, ...] in order
    if (!program_ids?.length || !lesson_sequence?.length) {
      return res.status(400).json({ success: false, error: 'Program IDs and lesson sequence required' });
    }

    const startOffset = Math.max(0, (parseInt(start_at_week) || 1) - 1);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Create backup
      const [backupResult] = await conn.query(
        'INSERT INTO curriculum_backup (backup_label, created_by_user_id) VALUES (?, ?)',
        [`Bulk set ${program_ids.length} programs ${new Date().toISOString().split('T')[0]}`, req.user.userId]
      );
      const backupId = backupResult.insertId;

      let totalUpdated = 0;

      for (const progId of program_ids) {
        // Get assignable sessions (active, not OFF, ordered by date)
        const [sessions] = await conn.query(
          `SELECT id, lesson_id FROM session
           WHERE program_id = ? AND active = 1 AND not_billed = 0
           ORDER BY session_date ASC`,
          [progId]
        );

        for (let i = 0; i < lesson_sequence.length; i++) {
          const sessionIdx = i + startOffset;
          if (sessionIdx >= sessions.length) break;

          const session = sessions[sessionIdx];
          const newLessonId = lesson_sequence[i];
          if (newLessonId === undefined || newLessonId === null) continue;

          // Backup current value
          await conn.query(
            'INSERT INTO curriculum_backup_session (backup_id, session_id, previous_lesson_id, new_lesson_id) VALUES (?,?,?,?)',
            [backupId, session.id, session.lesson_id, newLessonId]
          );

          // Update
          await conn.query(
            'UPDATE session SET lesson_id = ?, no_lesson_taught = 0, ts_updated = NOW() WHERE id = ?',
            [newLessonId, session.id]
          );
          totalUpdated++;
        }
      }

      await conn.commit();
      res.json({ success: true, backup_id: backupId, sessions_updated: totalUpdated });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════════
// UNSCHEDULED PROGRAMS
// ════════════════════════════════════════════════════════════════

router.get('/unscheduled', async (req, res, next) => {
  try {
    const { class_type_id, contractor_id, area_id } = req.query;

    let where = '1=1';
    const params = [];
    if (class_type_id) { where += ' AND cl.class_type_id = ?'; params.push(class_type_id); }
    if (contractor_id) { where += ' AND loc.contractor_id = ?'; params.push(contractor_id); }
    if (area_id) { where += ' AND COALESCE(loc.geographic_area_id_online, ci.geographic_area_id) = ?'; params.push(area_id); }

    const [rows] = await pool.query(
      `SELECT
        p.id, p.program_nickname, p.class_id,
        loc.nickname AS location_nickname,
        cl.class_name, cl.class_code,
        ct.class_type_name,
        con.contractor_name,
        ga.geographic_area_name,
        MIN(s.session_date) AS next_unscheduled_date,
        COUNT(s.id) AS unscheduled_count
       FROM session s
       JOIN program p ON s.program_id = p.id AND p.active = 1 AND p.live = 1
       JOIN class_status cs ON cs.id = p.class_status_id AND cs.confirmed = 1
       LEFT JOIN class cl ON cl.id = p.class_id
       LEFT JOIN class_type ct ON ct.id = cl.class_type_id
       LEFT JOIN location loc ON loc.id = p.location_id
       LEFT JOIN city ci ON ci.id = loc.city_id
       LEFT JOIN contractor con ON con.id = loc.contractor_id
       LEFT JOIN geographic_area ga ON ga.id = COALESCE(loc.geographic_area_id_online, ci.geographic_area_id)
       WHERE s.lesson_id IS NULL
         AND s.no_lesson_taught = 0
         AND s.active = 1
         AND s.not_billed = 0
         AND s.session_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)
         AND ${where}
       GROUP BY p.id
       ORDER BY next_unscheduled_date ASC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
