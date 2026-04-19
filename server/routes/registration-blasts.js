const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/registration-blasts — all programs grouped by blast stage
router.get('/', async (req, res, next) => {
  try {
    const { days_override } = req.query;

    // Get configurable settings
    const [settings] = await pool.query("SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('registration_link_days', 'open_blast_days', 'final_blast_days')");
    const cfg = {};
    settings.forEach(s => { cfg[s.setting_key] = parseInt(s.setting_value) || 0; });
    const regDays = parseInt(days_override) || cfg.registration_link_days || 30;
    const openDays = cfg.open_blast_days || 21;
    const finalDays = cfg.final_blast_days || 3;

    // Base query: programs with payment_through_us, not cancelled, starting within range
    const [programs] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.last_session_date,
              prog.payment_through_us, prog.registration_opened_online,
              prog.open_blast_sent, prog.two_week_blast_sent, prog.one_week_blast_sent, prog.final_blast_sent,
              prog.number_enrolled, prog.maximum_students, prog.session_count,
              cs.class_status_name,
              loc.nickname AS location_nickname, loc.poc_email,
              ga.geographic_area_name AS area
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
       WHERE prog.active = 1 AND prog.payment_through_us = 1
         AND cs.class_status_name NOT LIKE 'Cancelled%'
         AND prog.party_format_id IS NULL
         AND prog.first_session_date IS NOT NULL
         AND prog.first_session_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND (prog.last_session_date >= CURDATE() OR prog.last_session_date IS NULL)
       ORDER BY prog.first_session_date ASC`,
      [regDays]
    );

    // Categorize
    const isFull = (p) => p.maximum_students && p.number_enrolled >= p.maximum_students;

    const needsLink = programs.filter(p => !p.registration_opened_online);
    const needsOpen = programs.filter(p => p.registration_opened_online && !p.open_blast_sent && !isFull(p) && daysUntil(p.first_session_date) <= openDays);
    const needs2Week = programs.filter(p => p.registration_opened_online && p.open_blast_sent && !p.two_week_blast_sent && !isFull(p) && daysUntil(p.first_session_date) <= 14);
    const needs1Week = programs.filter(p => p.registration_opened_online && p.two_week_blast_sent && !p.one_week_blast_sent && !isFull(p) && daysUntil(p.first_session_date) <= 7);
    const needsFinal = programs.filter(p => p.registration_opened_online && p.one_week_blast_sent && !p.final_blast_sent && !isFull(p) && daysUntil(p.first_session_date) <= finalDays);

    res.json({
      success: true,
      data: { needsLink, needsOpen, needs2Week, needs1Week, needsFinal },
      config: { regDays, openDays, finalDays },
    });
  } catch (err) { next(err); }
});

function daysUntil(date) {
  if (!date) return 999;
  const d = new Date(date);
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((d - now) / (1000*60*60*24));
}

// POST /api/registration-blasts/mark — mark a stage complete for a program
router.post('/mark', async (req, res, next) => {
  try {
    const { program_id, field } = req.body;
    const allowed = ['registration_opened_online', 'open_blast_sent', 'two_week_blast_sent', 'one_week_blast_sent', 'final_blast_sent'];
    if (!program_id || !allowed.includes(field)) {
      return res.status(400).json({ success: false, error: 'Invalid field' });
    }
    const value = field === 'registration_opened_online' ? 'CURDATE()' : '1';
    await pool.query(`UPDATE program SET ${field} = ${value}, ts_updated = NOW() WHERE id = ?`, [program_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/registration-blasts/unmark — undo a stage
router.post('/unmark', async (req, res, next) => {
  try {
    const { program_id, field } = req.body;
    const allowed = ['registration_opened_online', 'open_blast_sent', 'two_week_blast_sent', 'one_week_blast_sent', 'final_blast_sent'];
    if (!program_id || !allowed.includes(field)) {
      return res.status(400).json({ success: false, error: 'Invalid field' });
    }
    const value = field === 'registration_opened_online' ? 'NULL' : '0';
    await pool.query(`UPDATE program SET ${field} = ${value}, ts_updated = NOW() WHERE id = ?`, [program_id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/registration-blasts/bulk-mark — mark multiple at once
router.post('/bulk-mark', async (req, res, next) => {
  try {
    const { program_ids, field } = req.body;
    const allowed = ['registration_opened_online', 'open_blast_sent', 'two_week_blast_sent', 'one_week_blast_sent', 'final_blast_sent'];
    if (!Array.isArray(program_ids) || !allowed.includes(field)) {
      return res.status(400).json({ success: false, error: 'Invalid' });
    }
    const value = field === 'registration_opened_online' ? 'CURDATE()' : '1';
    const placeholders = program_ids.map(() => '?').join(',');
    await pool.query(`UPDATE program SET ${field} = ${value}, ts_updated = NOW() WHERE id IN (${placeholders})`, program_ids);
    res.json({ success: true, marked: program_ids.length });
  } catch (err) { next(err); }
});

// PATCH /api/registration-blasts/settings
router.patch('/settings', async (req, res, next) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      if (['registration_link_days', 'open_blast_days', 'final_blast_days'].includes(key)) {
        await pool.query('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?', [value, key]);
      }
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
