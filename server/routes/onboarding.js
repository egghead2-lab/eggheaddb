const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { searchThreads, sendEmail, getGmailAddress } = require('../lib/gmail');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { checkCandidateScheduleConflicts } = require('../lib/scheduleConflict');

const CANDIDATE_ROLE_ID = 16;

router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════
// CANDIDATES
// ═══════════════════════════════════════════════════════════════════

// GET /api/onboarding/candidates
router.get('/candidates', async (req, res, next) => {
  try {
    const { search, status, area, assignee, sort, dir, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const clauses = ['c.active = 1'];
    const params = [];

    if (search) { clauses.push('(c.full_name LIKE ? OR c.email LIKE ?)'); const s = `%${search}%`; params.push(s, s); }
    if (status) { clauses.push('c.status = ?'); params.push(status); }
    if (area) { clauses.push('c.geographic_area_id = ?'); params.push(area); }
    if (assignee) {
      const uid = assignee === 'me' ? req.user.userId : assignee;
      clauses.push('(c.onboarder_user_id = ? OR c.trainer_user_id = ? OR c.recruiter_user_id = ? OR c.scheduling_coordinator_user_id = ? OR c.field_manager_user_id = ?)');
      params.push(uid, uid, uid, uid, uid);
    }

    const where = `WHERE ${clauses.join(' AND ')}`;
    const sortMap = { name: 'c.full_name', status: 'c.status', area: 'ga.geographic_area_name', first_class: 'c.first_class_date', created: 'c.ts_inserted' };
    const sortCol = sortMap[sort] || 'c.ts_inserted';
    const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

    const [rows] = await pool.query(
      `SELECT c.*,
              ga.geographic_area_name,
              CONCAT(onb.first_name, ' ', onb.last_name) AS onboarder_name,
              CONCAT(tr.first_name, ' ', tr.last_name) AS trainer_name,
              CONCAT(rec.first_name, ' ', rec.last_name) AS recruiter_name,
              (SELECT COUNT(*) FROM candidate_requirement cr WHERE cr.candidate_id = c.id AND cr.completed = 0) AS open_reqs,
              (SELECT COUNT(*) FROM candidate_requirement cr WHERE cr.candidate_id = c.id) AS total_reqs,
              (SELECT COUNT(*) FROM candidate_task ct WHERE ct.candidate_id = c.id AND ct.completed = 0) AS open_tasks,
              IF(c.user_id IS NOT NULL, 1, 0) AS has_login,
              cu.user_name AS login_username,
              cu.last_login_at,
              (SELECT COUNT(*) FROM candidate_message cm WHERE cm.candidate_id = c.id AND cm.is_from_candidate = 1) AS candidate_messages
       FROM candidate c
       LEFT JOIN user cu ON cu.id = c.user_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN user onb ON onb.id = c.onboarder_user_id
       LEFT JOIN user tr ON tr.id = c.trainer_user_id
       LEFT JOIN user rec ON rec.id = c.recruiter_user_id
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM candidate c LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/onboarding/candidates/:id
router.get('/candidates/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[candidate]] = await pool.query(
      `SELECT c.*,
              ga.geographic_area_name,
              CONCAT(onb.first_name, ' ', onb.last_name) AS onboarder_name, onb.email AS onboarder_email,
              CONCAT(tr.first_name, ' ', tr.last_name) AS trainer_name, tr.email AS trainer_email,
              CONCAT(rec.first_name, ' ', rec.last_name) AS recruiter_name, rec.email AS recruiter_email,
              CONCAT(sc.first_name, ' ', sc.last_name) AS scheduling_coordinator_name, sc.email AS sc_email,
              CONCAT(fm.first_name, ' ', fm.last_name) AS field_manager_name, fm.email AS fm_email,
              cu.user_name AS login_username,
              cu.password_plain AS login_password,
              cu.active AS login_active,
              r.role_name AS login_role
       FROM candidate c
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN user onb ON onb.id = c.onboarder_user_id
       LEFT JOIN user tr ON tr.id = c.trainer_user_id
       LEFT JOIN user rec ON rec.id = c.recruiter_user_id
       LEFT JOIN user sc ON sc.id = c.scheduling_coordinator_user_id
       LEFT JOIN user fm ON fm.id = c.field_manager_user_id
       LEFT JOIN user cu ON cu.id = c.user_id
       LEFT JOIN role r ON r.id = cu.role_id
       WHERE c.id = ?`, [id]
    );
    if (!candidate) return res.status(404).json({ success: false, error: 'Candidate not found' });

    const [requirements] = await pool.query(
      `SELECT cr.*, r.title, r.description, r.category, r.type, r.requires_document,
              CONCAT(u.first_name, ' ', u.last_name) AS assigned_to_name,
              CONCAT(cb.first_name, ' ', cb.last_name) AS completed_by_name
       FROM candidate_requirement cr
       JOIN onboarding_requirement r ON r.id = cr.requirement_id
       LEFT JOIN user u ON u.id = cr.assigned_to_user_id
       LEFT JOIN user cb ON cb.id = cr.completed_by_user_id
       WHERE cr.candidate_id = ?
       ORDER BY r.sort_order, r.title`, [id]
    );

    const [tasks] = await pool.query(
      `SELECT ct.*,
              CONCAT(u.first_name, ' ', u.last_name) AS assigned_to_name,
              CONCAT(cb.first_name, ' ', cb.last_name) AS created_by_name
       FROM candidate_task ct
       LEFT JOIN user u ON u.id = ct.assigned_to_user_id
       LEFT JOIN user cb ON cb.id = ct.created_by_user_id
       WHERE ct.candidate_id = ?
       ORDER BY ct.completed, ct.due_date, ct.ts_inserted`, [id]
    );

    const [appliedTemplates] = await pool.query(
      `SELECT cat.*, t.name AS template_name
       FROM candidate_applied_template cat
       JOIN onboarding_template t ON t.id = cat.template_id
       WHERE cat.candidate_id = ?`, [id]
    );

    const [[availability]] = await pool.query('SELECT * FROM candidate_availability WHERE candidate_id = ?', [id]);

    const [documents] = await pool.query(
      `SELECT d.*, CONCAT(u.first_name, ' ', u.last_name) AS uploaded_by_name
       FROM candidate_document d LEFT JOIN user u ON u.id = d.uploaded_by_user_id
       WHERE d.candidate_id = ? ORDER BY d.ts_inserted DESC`, [id]
    );

    // Tentative schedule with current staffing info and pay data
    const [schedule] = await pool.query(
      `SELECT cs.*, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.first_session_date, prog.last_session_date,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              prog.lead_professor_id, prog.assistant_professor_id,
              prog.lead_professor_pay AS program_lead_pay, prog.assistant_professor_pay AS program_assist_pay,
              prog.session_count,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS current_lead_name,
              CONCAT(ap.professor_nickname, ' ', ap.last_name) AS current_assist_name,
              loc.nickname AS location_nickname, loc.address,
              ga2.geographic_area_name AS program_area,
              CONCAT(u.first_name, ' ', u.last_name) AS assigned_by_name
       FROM candidate_schedule cs
       JOIN program prog ON prog.id = cs.program_id AND prog.active = 1
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN geographic_area ga2 ON ga2.id = loc.geographic_area_id_online
       LEFT JOIN user u ON u.id = cs.assigned_by_user_id
       WHERE cs.candidate_id = ? AND cs.active = 1
       ORDER BY prog.first_session_date, prog.program_nickname`, [id]
    );

    res.json({ success: true, data: { ...candidate, requirements, tasks, appliedTemplates, availability: availability || null, documents, schedule } });
  } catch (err) { next(err); }
});

// Helper: auto-assign team from area
async function autoAssignTeamFromArea(pool, candidateId, areaId) {
  if (!areaId) return;
  const [[area]] = await pool.query(
    `SELECT onboarder_user_id, trainer_user_id, recruiter_user_id,
            scheduling_coordinator_user_id, field_manager_user_id, sales_user_id
     FROM geographic_area WHERE id = ?`, [areaId]
  );
  if (!area) return;
  await pool.query(
    `UPDATE candidate SET
      onboarder_user_id = COALESCE(onboarder_user_id, ?),
      trainer_user_id = COALESCE(trainer_user_id, ?),
      recruiter_user_id = COALESCE(recruiter_user_id, ?),
      scheduling_coordinator_user_id = COALESCE(scheduling_coordinator_user_id, ?),
      field_manager_user_id = COALESCE(field_manager_user_id, ?)
     WHERE id = ?`,
    [area.onboarder_user_id, area.trainer_user_id, area.recruiter_user_id,
     area.scheduling_coordinator_user_id, area.field_manager_user_id, candidateId]
  );
}

// POST /api/onboarding/candidates
router.post('/candidates', async (req, res, next) => {
  try {
    const { full_name, email, phone, geographic_area_id, notes } = req.body;
    if (!full_name || !email) return res.status(400).json({ success: false, error: 'Name and email are required' });
    const [result] = await pool.query(
      `INSERT INTO candidate (full_name, email, phone, geographic_area_id, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [full_name, email, phone || null, geographic_area_id || null, notes || null]
    );
    // Auto-assign team from area
    if (geographic_area_id) await autoAssignTeamFromArea(pool, result.insertId, geographic_area_id);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'Email already exists' });
    next(err);
  }
});

// PUT /api/onboarding/candidates/:id
router.put('/candidates/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['full_name', 'email', 'phone', 'status', 'geographic_area_id', 'onboarder_user_id',
      'trainer_user_id', 'recruiter_user_id', 'scheduling_coordinator_user_id', 'field_manager_user_id',
      'first_class_date', 'accepted_at', 'notes', 'active',
      'address', 'city', 'state', 'zip', 'shirt_size',
      'availability_notes', 'how_heard', 'resume_link', 'lead_pay', 'assist_pay'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => req.body[f] === '' ? null : req.body[f]);
    await pool.query(`UPDATE candidate SET ${setClauses} WHERE id = ?`, [...values, id]);
    // Auto-assign team when area changes
    if (req.body.geographic_area_id) {
      // Clear existing assignments first so auto-assign fills them
      await pool.query(
        `UPDATE candidate SET onboarder_user_id = NULL, trainer_user_id = NULL, recruiter_user_id = NULL,
          scheduling_coordinator_user_id = NULL, field_manager_user_id = NULL WHERE id = ?`, [id]
      );
      await autoAssignTeamFromArea(pool, id, req.body.geographic_area_id);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/onboarding/candidates/:id — soft-delete candidate and deactivate their user account
router.delete('/candidates/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[candidate]] = await pool.query('SELECT * FROM candidate WHERE id = ?', [id]);
    if (!candidate) return res.status(404).json({ success: false, error: 'Candidate not found' });

    // Deactivate the candidate
    await pool.query('UPDATE candidate SET active = 0, status = ? WHERE id = ?',
      [candidate.status === 'hired' ? 'hired' : 'rejected', id]);

    // Deactivate their user account if one exists
    if (candidate.user_id) {
      await pool.query('UPDATE user SET active = 0, ts_updated = NOW() WHERE id = ?', [candidate.user_id]);
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Candidate Notes (status updates) ────────────────────────────────

// GET /api/onboarding/candidates/:id/notes
router.get('/candidates/:id/notes', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT n.*, CONCAT(u.first_name, ' ', u.last_name) AS author_name
       FROM candidate_note n
       LEFT JOIN user u ON u.id = n.user_id
       WHERE n.candidate_id = ?
       ORDER BY n.ts_inserted DESC`, [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/onboarding/candidates/:id/notes
router.post('/candidates/:id/notes', async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ success: false, error: 'Note body required' });
    const [result] = await pool.query(
      'INSERT INTO candidate_note (candidate_id, user_id, body) VALUES (?, ?, ?)',
      [req.params.id, req.user.userId, body.trim()]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// DELETE /api/onboarding/candidate-notes/:id
router.delete('/candidate-notes/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM candidate_note WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Availability ────────────────────────────────────────────────────

// GET /api/onboarding/candidates/:id/availability
router.get('/candidates/:id/availability', async (req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM candidate_availability WHERE candidate_id = ?', [req.params.id]);
    res.json({ success: true, data: row || null });
  } catch (err) { next(err); }
});

// PUT /api/onboarding/candidates/:id/availability (upsert)
router.put('/candidates/:id/availability', async (req, res, next) => {
  try {
    const { monday, monday_notes, tuesday, tuesday_notes, wednesday, wednesday_notes,
            thursday, thursday_notes, friday, friday_notes, saturday, saturday_notes,
            sunday, sunday_notes, additional_notes } = req.body;
    await pool.query(
      `INSERT INTO candidate_availability (candidate_id, monday, monday_notes, tuesday, tuesday_notes,
        wednesday, wednesday_notes, thursday, thursday_notes, friday, friday_notes,
        saturday, saturday_notes, sunday, sunday_notes, additional_notes, personal_info_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE monday=VALUES(monday), monday_notes=VALUES(monday_notes),
        tuesday=VALUES(tuesday), tuesday_notes=VALUES(tuesday_notes),
        wednesday=VALUES(wednesday), wednesday_notes=VALUES(wednesday_notes),
        thursday=VALUES(thursday), thursday_notes=VALUES(thursday_notes),
        friday=VALUES(friday), friday_notes=VALUES(friday_notes),
        saturday=VALUES(saturday), saturday_notes=VALUES(saturday_notes),
        sunday=VALUES(sunday), sunday_notes=VALUES(sunday_notes),
        additional_notes=VALUES(additional_notes), personal_info_completed=1`,
      [req.params.id, monday?1:0, monday_notes||null, tuesday?1:0, tuesday_notes||null,
       wednesday?1:0, wednesday_notes||null, thursday?1:0, thursday_notes||null,
       friday?1:0, friday_notes||null, saturday?1:0, saturday_notes||null,
       sunday?1:0, sunday_notes||null, additional_notes||null]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/candidates/:id/generate-login — create user account for candidate
router.post('/candidates/:id/generate-login', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[candidate]] = await pool.query('SELECT * FROM candidate WHERE id = ?', [id]);
    if (!candidate) return res.status(404).json({ success: false, error: 'Candidate not found' });
    if (candidate.user_id) return res.status(400).json({ success: false, error: 'Login already exists' });

    // Generate username from name: first.last (lowercase, no spaces)
    const nameParts = candidate.full_name.trim().toLowerCase().split(/\s+/);
    let baseUsername = nameParts.length > 1
      ? `${nameParts[0]}.${nameParts[nameParts.length - 1]}`
      : nameParts[0];
    baseUsername = baseUsername.replace(/[^a-z0-9.]/g, '');

    // Check for duplicates and append number if needed
    let username = baseUsername;
    let suffix = 1;
    while (true) {
      const [existing] = await pool.query('SELECT id FROM user WHERE user_name = ?', [username]);
      if (existing.length === 0) break;
      username = `${baseUsername}${suffix}`;
      suffix++;
    }

    // Generate random password (8 chars, readable)
    const rawPassword = crypto.randomBytes(4).toString('hex'); // e.g. "a3f1b2c4"
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    // Split name for user record
    const first = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
    const last = nameParts.length > 1
      ? nameParts.slice(1).map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(' ')
      : '';

    // Create user with Candidate role
    const [userResult] = await pool.query(
      `INSERT INTO user (first_name, last_name, email, user_name, password, password_plain, role_id, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [first, last, candidate.email, username, hashedPassword, rawPassword, CANDIDATE_ROLE_ID]
    );

    // Link user to candidate
    await pool.query('UPDATE candidate SET user_id = ? WHERE id = ?', [userResult.insertId, id]);

    res.json({ success: true, user_id: userResult.insertId, username, password: rawPassword });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'A user with this email already exists' });
    next(err);
  }
});

// POST /api/onboarding/candidates/:id/regenerate-password — reset candidate password
router.post('/candidates/:id/regenerate-password', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[candidate]] = await pool.query('SELECT user_id FROM candidate WHERE id = ?', [id]);
    if (!candidate) return res.status(404).json({ success: false, error: 'Candidate not found' });
    if (!candidate.user_id) return res.status(400).json({ success: false, error: 'No login exists yet' });

    const rawPassword = crypto.randomBytes(4).toString('hex');
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    await pool.query('UPDATE user SET password = ?, password_plain = ?, ts_updated = NOW() WHERE id = ?', [hashedPassword, rawPassword, candidate.user_id]);

    res.json({ success: true, password: rawPassword });
  } catch (err) { next(err); }
});

// POST /api/onboarding/candidates/:id/hire — convert candidate to professor
router.post('/candidates/:id/hire', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[candidate]] = await pool.query('SELECT * FROM candidate WHERE id = ?', [id]);
    if (!candidate) return res.status(404).json({ success: false, error: 'Candidate not found' });

    // Create professor from candidate
    const nameParts = candidate.full_name.split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';
    const nickname = req.body.professor_nickname || candidate.full_name;

    const [profResult] = await pool.query(
      `INSERT INTO professor (professor_nickname, first_name, last_name, email, phone_number,
        geographic_area_id, professor_status_id, base_pay, assist_pay, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [nickname, firstName, lastName, candidate.email, candidate.phone, candidate.geographic_area_id,
       req.body.professor_status_id || 1, candidate.lead_pay || null, candidate.assist_pay || null]
    );

    // Link candidate to professor and mark as hired
    await pool.query('UPDATE candidate SET professor_id = ?, status = ? WHERE id = ?',
      [profResult.insertId, 'hired', id]);

    // If candidate has a user account, upgrade role from Candidate to Professor
    if (candidate.user_id) {
      await pool.query('UPDATE user SET role_id = 17, ts_updated = NOW() WHERE id = ?', [candidate.user_id]);
      // Link professor to user
      await pool.query('UPDATE professor SET user_id = ? WHERE id = ?', [candidate.user_id, profResult.insertId]);
    }

    // Resolve confirmed schedule — assign programs to the new professor
    const { assign_programs } = req.body; // array of { program_id, role } to assign
    if (assign_programs && Array.isArray(assign_programs)) {
      for (const ap of assign_programs) {
        if (ap.role === 'Assistant') {
          await pool.query('UPDATE program SET assistant_professor_id = ?, ts_updated = NOW() WHERE id = ?',
            [profResult.insertId, ap.program_id]);
        } else {
          await pool.query('UPDATE program SET lead_professor_id = ?, ts_updated = NOW() WHERE id = ?',
            [profResult.insertId, ap.program_id]);
        }
      }
    }

    res.json({ success: true, professor_id: profResult.insertId });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE REQUIREMENTS (checklist)
// ═══════════════════════════════════════════════════════════════════

// POST /api/onboarding/candidate-requirements-add — add a single requirement to a candidate
router.post('/candidate-requirements-add', async (req, res, next) => {
  try {
    const { candidate_id, requirement_id } = req.body;
    if (!candidate_id || !requirement_id) return res.status(400).json({ success: false, error: 'candidate_id and requirement_id required' });

    // Get requirement details
    const [[reqDef]] = await pool.query('SELECT assigned_role, needs_approval, due_basis, due_days FROM onboarding_requirement WHERE id = ?', [requirement_id]);
    if (!reqDef) return res.status(404).json({ success: false, error: 'Requirement not found' });

    // Get candidate for role mapping and dates
    const [[candidate]] = await pool.query(
      'SELECT accepted_at, first_class_date, onboarder_user_id, trainer_user_id, recruiter_user_id, scheduling_coordinator_user_id, field_manager_user_id FROM candidate WHERE id = ?',
      [candidate_id]
    );
    const roleToUser = {
      onboarder: candidate?.onboarder_user_id, trainer: candidate?.trainer_user_id,
      recruiter: candidate?.recruiter_user_id, scheduler: candidate?.scheduling_coordinator_user_id,
      field_manager: candidate?.field_manager_user_id,
    };

    // Calculate due date
    let dueDate = null;
    if (reqDef.due_days && reqDef.due_basis) {
      const hireDate = candidate?.accepted_at ? new Date(candidate.accepted_at) : new Date();
      const startDate = candidate?.first_class_date ? new Date(candidate.first_class_date) : null;
      let ref = null;
      if (reqDef.due_basis === 'days_after_hire') { ref = new Date(hireDate); ref.setDate(ref.getDate() + reqDef.due_days); }
      else if (reqDef.due_basis === 'days_before_hire') { ref = new Date(hireDate); ref.setDate(ref.getDate() - reqDef.due_days); }
      else if (reqDef.due_basis === 'days_after_start' && startDate) { ref = new Date(startDate); ref.setDate(ref.getDate() + reqDef.due_days); }
      else if (reqDef.due_basis === 'days_before_start' && startDate) { ref = new Date(startDate); ref.setDate(ref.getDate() - reqDef.due_days); }
      if (ref) dueDate = ref.toISOString().split('T')[0];
    }

    const assignedUserId = reqDef.assigned_role ? roleToUser[reqDef.assigned_role] || null : null;

    await pool.query(
      'INSERT INTO candidate_requirement (candidate_id, requirement_id, due_date, assigned_role, assigned_to_user_id, needs_approval, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [candidate_id, requirement_id, dueDate, reqDef.assigned_role, assignedUserId, reqDef.needs_approval ? 1 : 0, 'not_needed']
    );
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.json({ success: true, skipped: true });
    next(err);
  }
});

// PUT /api/onboarding/candidate-requirements/:id
router.put('/candidate-requirements/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['completed', 'status', 'due_date', 'assigned_to_user_id', 'assigned_role', 'notes', 'approval_status'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields' });

    // Auto-set completed_at and completed_by
    if (req.body.completed === 1 || req.body.completed === true) {
      updates.push('completed_at', 'completed_by_user_id');
      req.body.completed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      req.body.completed_by_user_id = req.user.id;
    }
    if (req.body.completed === 0 || req.body.completed === false) {
      updates.push('completed_at', 'completed_by_user_id');
      req.body.completed_at = null;
      req.body.completed_by_user_id = null;
    }

    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => req.body[f] === '' ? null : req.body[f]);
    await pool.query(`UPDATE candidate_requirement SET ${setClauses} WHERE id = ?`, [...values, id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE TASKS
// ═══════════════════════════════════════════════════════════════════

// POST /api/onboarding/candidate-tasks
router.post('/candidate-tasks', async (req, res, next) => {
  try {
    const { candidate_id, title, description, due_date, assigned_to_user_id } = req.body;
    if (!candidate_id || !title) return res.status(400).json({ success: false, error: 'Candidate and title required' });
    const [result] = await pool.query(
      'INSERT INTO candidate_task (candidate_id, title, description, due_date, assigned_to_user_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [candidate_id, title, description || null, due_date || null, assigned_to_user_id || null, req.user.id]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/onboarding/candidate-tasks/:id
router.put('/candidate-tasks/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['title', 'description', 'due_date', 'assigned_to_user_id', 'completed'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (req.body.completed === 1) { updates.push('completed_at'); req.body.completed_at = new Date().toISOString().slice(0, 19).replace('T', ' '); }
    if (req.body.completed === 0) { updates.push('completed_at'); req.body.completed_at = null; }
    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => req.body[f] === '' ? null : req.body[f]);
    await pool.query(`UPDATE candidate_task SET ${setClauses} WHERE id = ?`, [...values, id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/onboarding/candidate-tasks/:id
router.delete('/candidate-tasks/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM candidate_task WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════════

const docUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads/candidate-docs')),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// POST /api/onboarding/candidates/:id/documents
router.post('/candidates/:id/documents', docUpload.single('file'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { candidate_requirement_id } = req.body;
    if (!req.file) return res.status(400).json({ success: false, error: 'No file' });

    const [result] = await pool.query(
      `INSERT INTO candidate_document (candidate_id, candidate_requirement_id, file_name, file_size, mime_type, storage_path, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, candidate_requirement_id || null, req.file.originalname, req.file.size, req.file.mimetype,
       req.file.filename, req.user.userId]
    );

    // If this requirement needs approval, set status to pending_approval
    if (candidate_requirement_id) {
      const [[cr]] = await pool.query('SELECT needs_approval FROM candidate_requirement WHERE id = ?', [candidate_requirement_id]);
      if (cr?.needs_approval) {
        await pool.query("UPDATE candidate_requirement SET approval_status = 'pending_approval' WHERE id = ? AND approval_status != 'approved'",
          [candidate_requirement_id]);
      }
    }

    res.json({ success: true, id: result.insertId, file_name: req.file.originalname });
  } catch (err) { next(err); }
});

// GET /api/onboarding/candidates/:id/documents
router.get('/candidates/:id/documents', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, CONCAT(u.first_name, ' ', u.last_name) AS uploaded_by_name
       FROM candidate_document d
       LEFT JOIN user u ON u.id = d.uploaded_by_user_id
       WHERE d.candidate_id = ?
       ORDER BY d.ts_inserted DESC`, [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/onboarding/documents/:id/download
router.get('/documents/:id/download', async (req, res, next) => {
  try {
    const [[doc]] = await pool.query('SELECT * FROM candidate_document WHERE id = ?', [req.params.id]);
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    const filePath = path.join(__dirname, '../../uploads/candidate-docs', doc.storage_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found on disk' });
    res.download(filePath, doc.file_name);
  } catch (err) { next(err); }
});

// DELETE /api/onboarding/documents/:id
router.delete('/documents/:id', async (req, res, next) => {
  try {
    const [[doc]] = await pool.query('SELECT storage_path FROM candidate_document WHERE id = ?', [req.params.id]);
    if (doc) {
      const filePath = path.join(__dirname, '../../uploads/candidate-docs', doc.storage_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await pool.query('DELETE FROM candidate_document WHERE id = ?', [req.params.id]);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/candidate-requirements/:id/approve
router.post('/candidate-requirements/:id/approve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve' or 'reject'
    if (action === 'approve') {
      await pool.query(
        "UPDATE candidate_requirement SET approval_status = 'approved', completed = 1, completed_at = NOW(), completed_by_user_id = ?, status = 'complete', approved_by_user_id = ?, approved_at = NOW() WHERE id = ?",
        [req.user.userId, req.user.userId, id]
      );
    } else {
      await pool.query(
        "UPDATE candidate_requirement SET approval_status = 'rejected' WHERE id = ?", [id]
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// REQUIREMENTS (global definitions)
// ═══════════════════════════════════════════════════════════════════

// GET /api/onboarding/requirements
router.get('/requirements', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM onboarding_requirement WHERE active = 1 ORDER BY sort_order, title'
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/onboarding/requirements
router.post('/requirements', async (req, res, next) => {
  try {
    const { title, description, category, type, requires_document, sort_order, assigned_role, email_template_id, needs_approval, due_basis, due_days } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title required' });
    const [result] = await pool.query(
      'INSERT INTO onboarding_requirement (title, description, category, type, requires_document, sort_order, assigned_role, email_template_id, needs_approval, due_basis, due_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title, description || null, category || null, type || 'task', requires_document ? 1 : 0, sort_order || 0, assigned_role || null, email_template_id || null, needs_approval ? 1 : 0, due_basis || null, due_days || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/onboarding/requirements/:id
router.put('/requirements/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['title', 'description', 'category', 'type', 'requires_document', 'sort_order', 'active', 'assigned_role', 'email_template_id', 'needs_approval', 'due_basis', 'due_days'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => req.body[f] === '' ? null : req.body[f]);
    await pool.query(`UPDATE onboarding_requirement SET ${setClauses} WHERE id = ?`, [...values, id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/onboarding/requirements/:id (soft)
router.delete('/requirements/:id', async (req, res, next) => {
  try {
    await pool.query('UPDATE onboarding_requirement SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════════

// GET /api/onboarding/templates
router.get('/templates', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.*, (SELECT COUNT(*) FROM onboarding_template_item ti WHERE ti.template_id = t.id) AS item_count
       FROM onboarding_template t WHERE t.active = 1 ORDER BY t.name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/onboarding/templates/:id
router.get('/templates/:id', async (req, res, next) => {
  try {
    const [[template]] = await pool.query('SELECT * FROM onboarding_template WHERE id = ?', [req.params.id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    const [items] = await pool.query(
      `SELECT ti.*, r.title, r.description, r.category, r.type
       FROM onboarding_template_item ti
       JOIN onboarding_requirement r ON r.id = ti.requirement_id
       WHERE ti.template_id = ?
       ORDER BY ti.sort_order, r.title`, [req.params.id]
    );
    res.json({ success: true, data: { ...template, items } });
  } catch (err) { next(err); }
});

// POST /api/onboarding/templates
router.post('/templates', async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const [result] = await pool.query('INSERT INTO onboarding_template (name, description) VALUES (?, ?)', [name, description || null]);
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/onboarding/templates/:id
router.put('/templates/:id', async (req, res, next) => {
  try {
    const fields = ['name', 'description', 'active'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => req.body[f] === '' ? null : req.body[f]);
    await pool.query(`UPDATE onboarding_template SET ${setClauses} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/templates/:id/items — add requirement to template
router.post('/templates/:id/items', async (req, res, next) => {
  try {
    const { requirement_id, due_offset_days, sort_order } = req.body;
    await pool.query(
      'INSERT INTO onboarding_template_item (template_id, requirement_id, due_offset_days, sort_order) VALUES (?, ?, ?, ?)',
      [req.params.id, requirement_id, due_offset_days || null, sort_order || 0]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/onboarding/template-items/:id
router.delete('/template-items/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM onboarding_template_item WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/onboarding/templates/:id
router.delete('/templates/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM onboarding_template_item WHERE template_id = ?', [req.params.id]);
    await pool.query('DELETE FROM onboarding_template WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/candidates/:id/apply-template
router.post('/candidates/:id/apply-template', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { template_id } = req.body;

    // Check if already applied
    const [existing] = await pool.query(
      'SELECT id FROM candidate_applied_template WHERE candidate_id = ? AND template_id = ?', [id, template_id]
    );
    if (existing.length > 0) return res.json({ success: true, added: 0, alreadyApplied: true });

    // Get template items
    const [items] = await pool.query(
      'SELECT * FROM onboarding_template_item WHERE template_id = ?', [template_id]
    );

    // Get candidate's existing requirements
    const [existingReqs] = await pool.query(
      'SELECT requirement_id FROM candidate_requirement WHERE candidate_id = ?', [id]
    );
    const existingSet = new Set(existingReqs.map(r => r.requirement_id));

    // Get candidate info for due_date calculation and role-based assignment
    const [[candidate]] = await pool.query(
      'SELECT accepted_at, onboarder_user_id, trainer_user_id, recruiter_user_id, scheduling_coordinator_user_id, field_manager_user_id FROM candidate WHERE id = ?', [id]
    );
    const baseDate = candidate?.accepted_at ? new Date(candidate.accepted_at) : new Date();

    // Map roles to candidate's assigned users
    const roleToUser = {
      onboarder: candidate?.onboarder_user_id,
      trainer: candidate?.trainer_user_id,
      recruiter: candidate?.recruiter_user_id,
      scheduler: candidate?.scheduling_coordinator_user_id,
      field_manager: candidate?.field_manager_user_id,
    };

    // Get requirement details for role, approval, and due date calculation
    const reqIds = items.map(i => i.requirement_id);
    const [reqDetails] = reqIds.length > 0
      ? await pool.query('SELECT id, assigned_role, needs_approval, due_basis, due_days FROM onboarding_requirement WHERE id IN (?)', [reqIds])
      : [[]];
    const reqMap = {};
    reqDetails.forEach(r => { reqMap[r.id] = r; });

    // Get candidate's first class date for due date calculations
    const [[candDates]] = await pool.query('SELECT accepted_at, first_class_date FROM candidate WHERE id = ?', [id]);
    const hireDate = candDates?.accepted_at ? new Date(candDates.accepted_at) : new Date();
    const startDate = candDates?.first_class_date ? new Date(candDates.first_class_date) : null;

    let added = 0;
    for (const item of items) {
      if (existingSet.has(item.requirement_id)) continue;
      const reqDef = reqMap[item.requirement_id] || {};

      // Calculate due date from requirement definition or template override
      let dueDate = null;
      const dueDays = item.due_offset_days || reqDef.due_days;
      const dueBasis = reqDef.due_basis;
      if (dueDays && dueBasis) {
        let refDate = null;
        if (dueBasis === 'days_after_hire') { refDate = new Date(hireDate); refDate.setDate(refDate.getDate() + dueDays); }
        else if (dueBasis === 'days_before_hire') { refDate = new Date(hireDate); refDate.setDate(refDate.getDate() - dueDays); }
        else if (dueBasis === 'days_after_start' && startDate) { refDate = new Date(startDate); refDate.setDate(refDate.getDate() + dueDays); }
        else if (dueBasis === 'days_before_start' && startDate) { refDate = new Date(startDate); refDate.setDate(refDate.getDate() - dueDays); }
        if (refDate) dueDate = refDate.toISOString().split('T')[0];
      } else if (dueDays) {
        const d = new Date(hireDate);
        d.setDate(d.getDate() + dueDays);
        dueDate = d.toISOString().split('T')[0];
      }

      const role = reqDef.assigned_role || null;
      const assignedUserId = role ? roleToUser[role] || null : null;
      const needsApproval = reqDef.needs_approval ? 1 : 0;

      await pool.query(
        'INSERT INTO candidate_requirement (candidate_id, requirement_id, due_date, assigned_role, assigned_to_user_id, needs_approval, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, item.requirement_id, dueDate, role, assignedUserId, needsApproval, needsApproval ? 'not_needed' : 'not_needed']
      );
      added++;
    }

    // Record that template was applied
    await pool.query(
      'INSERT INTO candidate_applied_template (candidate_id, template_id, applied_by_user_id) VALUES (?, ?, ?)',
      [id, template_id, req.user.id]
    );

    res.json({ success: true, added });
  } catch (err) { next(err); }
});

// GET /api/onboarding/pending-approvals — items needing approval
router.get('/pending-approvals', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const showAll = req.query.all === 'true';
    const userFilter = showAll ? '' : 'AND cr.assigned_to_user_id = ?';
    const userParams = showAll ? [] : [userId];

    const [rows] = await pool.query(
      `SELECT cr.id, cr.due_date, cr.assigned_role, cr.notes AS req_notes,
              r.title, r.type,
              c.id AS candidate_id, c.full_name AS candidate_name,
              CONCAT(u.first_name, ' ', u.last_name) AS assigned_to_name
       FROM candidate_requirement cr
       JOIN onboarding_requirement r ON r.id = cr.requirement_id
       JOIN candidate c ON c.id = cr.candidate_id AND c.active = 1
       LEFT JOIN user u ON u.id = cr.assigned_to_user_id
       WHERE cr.approval_status = 'pending_approval' ${userFilter}
       ORDER BY cr.due_date IS NULL, cr.due_date`, userParams
    );

    // Attach documents to each
    for (const row of rows) {
      const [docs] = await pool.query(
        'SELECT id, file_name, file_size, mime_type, ts_inserted FROM candidate_document WHERE candidate_requirement_id = ? ORDER BY ts_inserted DESC',
        [row.id]
      );
      row.documents = docs;
    }

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/onboarding/my-tasks — all open requirements + tasks assigned to the logged-in user
router.get('/my-tasks', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const showAll = req.query.all === 'true';
    const userFilter = showAll ? '' : 'AND cr.assigned_to_user_id = ?';
    const userParams = showAll ? [] : [userId];

    const [reqs] = await pool.query(
      `SELECT cr.id, cr.completed, cr.status, cr.due_date, cr.assigned_role, cr.notes,
              r.title, r.description, r.type,
              c.id AS candidate_id, c.full_name AS candidate_name, c.first_class_date,
              CONCAT(u.first_name, ' ', u.last_name) AS assigned_to_name
       FROM candidate_requirement cr
       JOIN onboarding_requirement r ON r.id = cr.requirement_id
       JOIN candidate c ON c.id = cr.candidate_id AND c.active = 1
       LEFT JOIN user u ON u.id = cr.assigned_to_user_id
       WHERE cr.completed = 0 ${userFilter}
       ORDER BY cr.due_date IS NULL, cr.due_date, c.first_class_date`, userParams
    );

    const taskFilter = showAll ? '' : 'AND ct.assigned_to_user_id = ?';
    const taskParams = showAll ? [] : [userId];

    const [tasks] = await pool.query(
      `SELECT ct.id, ct.title, ct.description, ct.due_date, ct.completed,
              c.id AS candidate_id, c.full_name AS candidate_name,
              CONCAT(u.first_name, ' ', u.last_name) AS assigned_to_name
       FROM candidate_task ct
       JOIN candidate c ON c.id = ct.candidate_id AND c.active = 1
       LEFT JOIN user u ON u.id = ct.assigned_to_user_id
       WHERE ct.completed = 0 ${taskFilter}
       ORDER BY ct.due_date IS NULL, ct.due_date`, taskParams
    );

    res.json({ success: true, data: { requirements: reqs, tasks } });
  } catch (err) { next(err); }
});

// GET /api/onboarding/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [[pending]] = await pool.query('SELECT COUNT(*) as cnt FROM candidate WHERE active = 1 AND accepted_at IS NULL');
    const [[inProgress]] = await pool.query("SELECT COUNT(*) as cnt FROM candidate WHERE active = 1 AND status = 'in_progress'");
    const [[openReqs]] = await pool.query('SELECT COUNT(*) as cnt FROM candidate_requirement WHERE completed = 0');
    const [[overdueReqs]] = await pool.query('SELECT COUNT(*) as cnt FROM candidate_requirement WHERE completed = 0 AND due_date < ?', [today]);
    const [[openTasks]] = await pool.query('SELECT COUNT(*) as cnt FROM candidate_task WHERE completed = 0');
    const [[overdueTasks]] = await pool.query('SELECT COUNT(*) as cnt FROM candidate_task WHERE completed = 0 AND due_date < ?', [today]);
    const [[pendingApprovals]] = await pool.query("SELECT COUNT(*) as cnt FROM candidate_requirement WHERE approval_status = 'pending_approval'");

    res.json({ success: true, data: {
      pending: pending.cnt, inProgress: inProgress.cnt,
      openReqs: openReqs.cnt, overdueReqs: overdueReqs.cnt,
      openTasks: openTasks.cnt, overdueTasks: overdueTasks.cnt,
      pendingApprovals: pendingApprovals.cnt,
    }});
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE PORTAL (self-service for logged-in candidates)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// EMAIL (Gmail integration)
// ═══════════════════════════════════════════════════════════════════

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// GET /api/onboarding/candidates/:id/emails — fetch Gmail threads for a candidate
router.get('/candidates/:id/emails', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Get user's refresh token
    const [[user]] = await pool.query('SELECT google_refresh_token FROM user WHERE id = ?', [userId]);
    if (!user?.google_refresh_token) {
      return res.json({ success: true, data: { threads: [], connected: false } });
    }

    // Get candidate email and created date
    const [[candidate]] = await pool.query('SELECT email, ts_inserted FROM candidate WHERE id = ?', [id]);
    if (!candidate) return res.status(404).json({ success: false, error: 'Candidate not found' });

    const threads = await searchThreads(
      user.google_refresh_token,
      candidate.email,
      new Date(candidate.ts_inserted)
    );

    let connectedEmail = null;
    try { connectedEmail = await getGmailAddress(user.google_refresh_token); } catch {}

    res.json({ success: true, data: { threads, connected: true, connectedEmail } });
  } catch (err) {
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
      return res.json({ success: true, data: { threads: [], connected: false, expired: true } });
    }
    next(err);
  }
});

// POST /api/onboarding/candidates/:id/emails — send an email to a candidate (with optional attachments)
router.post('/candidates/:id/emails', upload.array('attachments', 10), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { subject, body, threadId } = req.body;
    const userId = req.user.userId;

    if (!subject || !body) return res.status(400).json({ success: false, error: 'Subject and body required' });

    const [[user]] = await pool.query('SELECT google_refresh_token, email_signature FROM user WHERE id = ?', [userId]);
    if (!user?.google_refresh_token) {
      return res.status(400).json({ success: false, error: 'Gmail not connected. Sign out and sign back in with Google.' });
    }

    const [[candidate]] = await pool.query('SELECT email FROM candidate WHERE id = ?', [id]);
    if (!candidate) return res.status(404).json({ success: false, error: 'Candidate not found' });

    // Process attachments from multer
    const attachments = (req.files || []).map(f => ({
      name: f.originalname,
      mimeType: f.mimetype || 'application/octet-stream',
      data: f.buffer,
    }));

    const result = await sendEmail({
      refreshToken: user.google_refresh_token,
      to: candidate.email,
      subject,
      htmlBody: body,
      threadId: threadId || null,
      attachments,
      signature: user.email_signature,
    });

    // Store in our DB
    let fromEmail = null;
    try { fromEmail = await getGmailAddress(user.google_refresh_token); } catch {}

    await pool.query(
      `INSERT INTO candidate_email (candidate_id, gmail_thread_id, gmail_message_id, subject, from_email, to_email, body_html, body_text, direction, sent_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)`,
      [id, result.threadId, result.id, subject, fromEmail, candidate.email, body,
       body.replace(/<[^>]+>/g, '').trim().substring(0, 1000), userId]
    );

    res.json({ success: true, threadId: result.threadId, messageId: result.id });
  } catch (err) {
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
      return res.status(400).json({ success: false, error: 'Gmail token expired. Sign out and sign back in.' });
    }
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════

const templateUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads/email-template-attachments')),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// GET /api/onboarding/email-templates
router.get('/email-templates', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM email_template WHERE active = 1 ORDER BY sort_order, name');
    rows.forEach(r => { r.attachments = r.attachments ? (typeof r.attachments === 'string' ? JSON.parse(r.attachments) : r.attachments) : []; });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/onboarding/email-templates
router.post('/email-templates', async (req, res, next) => {
  try {
    const { name, subject, body_html, category } = req.body;
    if (!name || !subject || !body_html) return res.status(400).json({ success: false, error: 'Name, subject, and body required' });
    const [result] = await pool.query(
      'INSERT INTO email_template (name, subject, body_html, category) VALUES (?, ?, ?, ?)',
      [name, subject, body_html, category || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/onboarding/email-templates/:id
router.put('/email-templates/:id', async (req, res, next) => {
  try {
    const fields = ['name', 'subject', 'body_html', 'category', 'sort_order', 'active', 'attachments'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => {
      const v = req.body[f];
      if (f === 'attachments') return JSON.stringify(v);
      return v === '' ? null : v;
    });
    await pool.query(`UPDATE email_template SET ${setClauses} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/email-templates/:id/upload — add attachment file
router.post('/email-templates/:id/upload', templateUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file' });
    const [[template]] = await pool.query('SELECT attachments FROM email_template WHERE id = ?', [req.params.id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const existing = template.attachments ? (typeof template.attachments === 'string' ? JSON.parse(template.attachments) : template.attachments) : [];
    existing.push({ filename: req.file.originalname, storageName: req.file.filename, size: req.file.size });
    await pool.query('UPDATE email_template SET attachments = ? WHERE id = ?', [JSON.stringify(existing), req.params.id]);
    res.json({ success: true, attachments: existing });
  } catch (err) { next(err); }
});

// DELETE /api/onboarding/email-templates/:id/attachment/:filename — remove attachment
router.delete('/email-templates/:id/attachment/:filename', async (req, res, next) => {
  try {
    const [[template]] = await pool.query('SELECT attachments FROM email_template WHERE id = ?', [req.params.id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const existing = template.attachments ? (typeof template.attachments === 'string' ? JSON.parse(template.attachments) : template.attachments) : [];
    const updated = existing.filter(a => a.storageName !== req.params.filename);

    // Delete file from disk
    const filePath = path.join(__dirname, '../../uploads/email-template-attachments', req.params.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('UPDATE email_template SET attachments = ? WHERE id = ?', [JSON.stringify(updated), req.params.id]);
    res.json({ success: true, attachments: updated });
  } catch (err) { next(err); }
});

// GET /api/onboarding/email-templates/attachment/:filename — serve attachment file
router.get('/email-templates/attachment/:filename', async (req, res, next) => {
  try {
    const filePath = path.join(__dirname, '../../uploads/email-template-attachments', req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found' });
    res.download(filePath);
  } catch (err) { next(err); }
});

// DELETE /api/onboarding/email-templates/:id
router.delete('/email-templates/:id', async (req, res, next) => {
  try {
    await pool.query('UPDATE email_template SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/onboarding/my-portal — candidate views their own data
router.get('/my-portal', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Find candidate linked to this user
    const [[candidate]] = await pool.query(
      `SELECT c.id, c.full_name, c.email, c.phone, c.status, c.first_class_date,
              c.lead_pay, c.assist_pay,
              c.schedule_ready, c.schedule_confirmed_at, c.schedule_changed_since_confirm,
              ga.geographic_area_name,
              CONCAT(onb.first_name, ' ', onb.last_name) AS onboarder_name,
              CONCAT(tr.first_name, ' ', tr.last_name) AS trainer_name
       FROM candidate c
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN user onb ON onb.id = c.onboarder_user_id
       LEFT JOIN user tr ON tr.id = c.trainer_user_id
       WHERE c.user_id = ? AND c.active = 1`, [userId]
    );
    if (!candidate) return res.status(404).json({ success: false, error: 'No candidate profile found' });

    // Auto-activate on first portal visit
    if (candidate.status === 'pending') {
      await pool.query(
        "UPDATE candidate SET status = 'in_progress', accepted_at = NOW() WHERE id = ? AND status = 'pending'",
        [candidate.id]
      );
      candidate.status = 'in_progress';
    }

    // Requirements
    const [requirements] = await pool.query(
      `SELECT cr.id, cr.completed, cr.status, cr.due_date, cr.notes, cr.needs_approval, cr.approval_status,
              r.title, r.description, r.category, r.type, r.requires_document
       FROM candidate_requirement cr
       JOIN onboarding_requirement r ON r.id = cr.requirement_id
       WHERE cr.candidate_id = ?
       ORDER BY cr.completed, r.sort_order, r.title`, [candidate.id]
    );

    // Availability
    const [[availability]] = await pool.query('SELECT * FROM candidate_availability WHERE candidate_id = ?', [candidate.id]);

    // Tasks
    const [tasks] = await pool.query(
      `SELECT ct.id, ct.title, ct.description, ct.due_date, ct.completed, ct.completed_at,
              CONCAT(u.first_name, ' ', u.last_name) AS assigned_to_name
       FROM candidate_task ct
       LEFT JOIN user u ON u.id = ct.assigned_to_user_id
       WHERE ct.candidate_id = ?
       ORDER BY ct.completed, ct.due_date, ct.ts_inserted`, [candidate.id]
    );

    // Messages
    const [messages] = await pool.query(
      `SELECT cm.id, cm.body, cm.sent_by_user_id, cm.is_from_candidate, cm.ts_inserted,
              CONCAT(u.first_name, ' ', u.last_name) AS sender_name
       FROM candidate_message cm
       LEFT JOIN user u ON u.id = cm.sent_by_user_id
       WHERE cm.candidate_id = ?
       ORDER BY cm.ts_inserted ASC`, [candidate.id]
    );

    // Tentative schedule with pay
    const [schedule] = await pool.query(
      `SELECT cs.id, cs.program_id, cs.role, cs.status, cs.confirmed_at, cs.notes,
              prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.first_session_date, prog.last_session_date,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              prog.lead_professor_pay AS program_lead_pay, prog.assistant_professor_pay AS program_assist_pay,
              prog.session_count,
              loc.nickname AS location_nickname, loc.address
       FROM candidate_schedule cs
       JOIN program prog ON prog.id = cs.program_id AND prog.active = 1
       LEFT JOIN location loc ON loc.id = prog.location_id
       WHERE cs.candidate_id = ? AND cs.active = 1
       ORDER BY prog.first_session_date, prog.program_nickname`, [candidate.id]
    );

    res.json({ success: true, data: { ...candidate, requirements, tasks, messages, availability: availability || null, schedule } });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE MESSAGES
// ═══════════════════════════════════════════════════════════════════

// GET /api/onboarding/candidates/:id/messages
router.get('/candidates/:id/messages', async (req, res, next) => {
  try {
    const [messages] = await pool.query(
      `SELECT cm.id, cm.body, cm.sent_by_user_id, cm.is_from_candidate, cm.ts_inserted,
              CONCAT(u.first_name, ' ', u.last_name) AS sender_name
       FROM candidate_message cm
       LEFT JOIN user u ON u.id = cm.sent_by_user_id
       WHERE cm.candidate_id = ?
       ORDER BY cm.ts_inserted ASC`, [req.params.id]
    );
    res.json({ success: true, data: messages });
  } catch (err) { next(err); }
});

// POST /api/onboarding/candidates/:id/messages — staff sends a message
router.post('/candidates/:id/messages', async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ success: false, error: 'Message body required' });
    const [result] = await pool.query(
      `INSERT INTO candidate_message (candidate_id, sent_by_user_id, body, is_from_candidate) VALUES (?, ?, ?, 0)`,
      [req.params.id, req.user.userId, body.trim()]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/onboarding/my-portal/profile — candidate updates their own profile info
router.put('/my-portal/profile', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [[candidate]] = await pool.query('SELECT id FROM candidate WHERE user_id = ? AND active = 1', [userId]);
    if (!candidate) return res.status(404).json({ success: false, error: 'No candidate profile found' });

    const allowed = ['phone', 'address', 'city', 'state', 'zip', 'shirt_size',
      'availability_notes'];
    const updates = allowed.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => req.body[f] === '' ? null : req.body[f]);
    await pool.query(`UPDATE candidate SET ${setClauses} WHERE id = ?`, [...values, candidate.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/onboarding/my-portal/availability — candidate saves their availability
router.put('/my-portal/availability', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [[candidate]] = await pool.query('SELECT id FROM candidate WHERE user_id = ? AND active = 1', [userId]);
    if (!candidate) return res.status(404).json({ success: false, error: 'No candidate profile found' });

    const { monday, monday_notes, tuesday, tuesday_notes, wednesday, wednesday_notes,
            thursday, thursday_notes, friday, friday_notes, additional_notes } = req.body;
    await pool.query(
      `INSERT INTO candidate_availability (candidate_id, monday, monday_notes, tuesday, tuesday_notes,
        wednesday, wednesday_notes, thursday, thursday_notes, friday, friday_notes, additional_notes, personal_info_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE monday=VALUES(monday), monday_notes=VALUES(monday_notes),
        tuesday=VALUES(tuesday), tuesday_notes=VALUES(tuesday_notes),
        wednesday=VALUES(wednesday), wednesday_notes=VALUES(wednesday_notes),
        thursday=VALUES(thursday), thursday_notes=VALUES(thursday_notes),
        friday=VALUES(friday), friday_notes=VALUES(friday_notes),
        additional_notes=VALUES(additional_notes), personal_info_completed=1`,
      [candidate.id, monday?1:0, monday_notes||null, tuesday?1:0, tuesday_notes||null,
       wednesday?1:0, wednesday_notes||null, thursday?1:0, thursday_notes||null,
       friday?1:0, friday_notes||null, additional_notes||null]
    );

    // Auto-complete "Complete Profile Information" requirement if it exists
    await pool.query(
      `UPDATE candidate_requirement cr
       JOIN onboarding_requirement r ON r.id = cr.requirement_id
       SET cr.completed = 1, cr.completed_at = NOW(), cr.status = 'complete'
       WHERE cr.candidate_id = ? AND cr.completed = 0
         AND (LOWER(r.title) LIKE '%complete%profile%' OR LOWER(r.title) LIKE '%fill out%info%' OR LOWER(r.title) LIKE '%personal info%')`,
      [candidate.id]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/my-portal/documents — candidate uploads documents (up to 3)
router.post('/my-portal/documents', docUpload.array('files', 3), async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [[candidate]] = await pool.query('SELECT id FROM candidate WHERE user_id = ? AND active = 1', [userId]);
    if (!candidate) return res.status(404).json({ success: false, error: 'No candidate profile found' });
    if (!req.files?.length) return res.status(400).json({ success: false, error: 'No files' });

    const { candidate_requirement_id } = req.body;
    const ids = [];
    for (const file of req.files) {
      const [result] = await pool.query(
        `INSERT INTO candidate_document (candidate_id, candidate_requirement_id, file_name, file_size, mime_type, storage_path, uploaded_by_candidate)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [candidate.id, candidate_requirement_id || null, file.originalname, file.size, file.mimetype, file.filename]
      );
      ids.push(result.insertId);
    }
    res.json({ success: true, ids });
  } catch (err) { next(err); }
});

// POST /api/onboarding/my-portal/submit-requirement — candidate submits requirement for approval (after uploading docs)
router.post('/my-portal/submit-requirement', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [[candidate]] = await pool.query('SELECT id FROM candidate WHERE user_id = ? AND active = 1', [userId]);
    if (!candidate) return res.status(404).json({ success: false, error: 'No candidate profile found' });

    const { candidate_requirement_id } = req.body;
    const [[cr]] = await pool.query('SELECT needs_approval, candidate_id FROM candidate_requirement WHERE id = ?', [candidate_requirement_id]);
    if (!cr || cr.candidate_id !== candidate.id) return res.status(403).json({ success: false, error: 'Not your requirement' });

    if (cr.needs_approval) {
      await pool.query("UPDATE candidate_requirement SET approval_status = 'pending_approval' WHERE id = ?", [candidate_requirement_id]);
    } else {
      await pool.query("UPDATE candidate_requirement SET completed = 1, completed_at = NOW(), status = 'complete' WHERE id = ?", [candidate_requirement_id]);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/my-portal/complete-requirement — candidate marks non-approval item complete
router.post('/my-portal/complete-requirement', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [[candidate]] = await pool.query('SELECT id FROM candidate WHERE user_id = ? AND active = 1', [userId]);
    if (!candidate) return res.status(404).json({ success: false, error: 'No candidate profile found' });

    const { candidate_requirement_id } = req.body;
    const [[cr]] = await pool.query('SELECT needs_approval, candidate_id FROM candidate_requirement WHERE id = ?', [candidate_requirement_id]);
    if (!cr || cr.candidate_id !== candidate.id) return res.status(403).json({ success: false, error: 'Not your requirement' });

    if (cr.needs_approval) {
      // Can't self-complete — just mark as pending approval
      await pool.query("UPDATE candidate_requirement SET approval_status = 'pending_approval' WHERE id = ?", [candidate_requirement_id]);
    } else {
      // Self-complete
      await pool.query(
        "UPDATE candidate_requirement SET completed = 1, completed_at = NOW(), status = 'complete' WHERE id = ?",
        [candidate_requirement_id]
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/my-portal/messages — candidate sends a message
router.post('/my-portal/messages', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [[candidate]] = await pool.query('SELECT id FROM candidate WHERE user_id = ? AND active = 1', [userId]);
    if (!candidate) return res.status(404).json({ success: false, error: 'No candidate profile found' });

    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ success: false, error: 'Message body required' });
    const [result] = await pool.query(
      `INSERT INTO candidate_message (candidate_id, sent_by_user_id, body, is_from_candidate) VALUES (?, ?, ?, 1)`,
      [candidate.id, userId, body.trim()]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE PHASE + PAY
// ═══════════════════════════════════════════════════════════════════

// POST /api/onboarding/candidates/:id/move-to-training
router.post('/candidates/:id/move-to-training', async (req, res, next) => {
  try {
    await pool.query("UPDATE candidate SET phase = 'training' WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/candidates/:id/move-to-onboarding
router.post('/candidates/:id/move-to-onboarding', async (req, res, next) => {
  try {
    await pool.query("UPDATE candidate SET phase = 'onboarding' WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/onboarding/candidates/:id/pay-status
router.get('/candidates/:id/pay-status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[candidate]] = await pool.query('SELECT professor_id, onboarding_pay_submitted FROM candidate WHERE id = ?', [id]);
    const [byCandidate] = await pool.query('SELECT id, total_training_pay, is_reviewed FROM onboarding_pay_entries WHERE candidate_id = ? LIMIT 1', [id]);
    let payEntry = byCandidate[0] || null;
    if (!payEntry && candidate?.professor_id) {
      const [byProf] = await pool.query('SELECT id, total_training_pay, is_reviewed FROM onboarding_pay_entries WHERE professor_id = ? ORDER BY training_date DESC LIMIT 1', [candidate.professor_id]);
      payEntry = byProf[0] || null;
    }
    res.json({ success: true, data: {
      has_pay_entry: !!payEntry,
      pay_amount: payEntry?.total_training_pay || 0,
      is_reviewed: payEntry?.is_reviewed || false,
      onboarding_pay_submitted: candidate?.onboarding_pay_submitted || false,
    }});
  } catch (err) { next(err); }
});

// GET /api/onboarding/missing-pay — hired candidates without onboarding pay submitted
router.get('/missing-pay', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id AS candidate_id, c.full_name, c.professor_id, c.trainer_user_id,
              c.onboarding_pay_submitted, c.status, c.phase,
              CONCAT(tr.first_name, ' ', tr.last_name) AS trainer_name
       FROM candidate c
       LEFT JOIN user tr ON tr.id = c.trainer_user_id
       LEFT JOIN onboarding_pay_entries ope ON (ope.candidate_id = c.id OR ope.professor_id = c.professor_id)
       WHERE c.active = 1
         AND (c.status = 'hired' OR (c.status IN ('complete','in_progress') AND c.phase = 'training'))
         AND c.onboarding_pay_submitted = 0
         AND ope.id IS NULL
       ORDER BY c.full_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE SCHEDULE
// ═══════════════════════════════════════════════════════════════════

// POST /api/onboarding/candidates/:id/schedule — assign a program to candidate
router.post('/candidates/:id/schedule', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { program_id, role, notes, force } = req.body;
    if (!program_id) return res.status(400).json({ success: false, error: 'Program required' });

    // Check schedule conflicts
    const conflicts = await checkCandidateScheduleConflicts(id, program_id);
    if (conflicts.length && !force) {
      return res.status(409).json({ success: false, error: 'Schedule conflicts detected', conflicts });
    }

    const [result] = await pool.query(
      `INSERT INTO candidate_schedule (candidate_id, program_id, role, assigned_by_user_id, notes, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [id, program_id, role || 'Lead', req.user.userId, notes || null]
    );

    // If candidate had previously confirmed, flag that schedule changed
    const [[cand]] = await pool.query('SELECT schedule_confirmed_at FROM candidate WHERE id = ?', [id]);
    if (cand?.schedule_confirmed_at) {
      await pool.query('UPDATE candidate SET schedule_changed_since_confirm = 1 WHERE id = ?', [id]);
      // Mark all confirmed items as changed
      await pool.query("UPDATE candidate_schedule SET status = 'changed' WHERE candidate_id = ? AND status = 'confirmed' AND active = 1", [id]);
    }

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'Program already assigned' });
    next(err);
  }
});

// DELETE /api/onboarding/candidates/:id/schedule/:schedId — remove program from candidate
router.delete('/candidates/:id/schedule/:schedId', async (req, res, next) => {
  try {
    const { id, schedId } = req.params;
    await pool.query('UPDATE candidate_schedule SET active = 0, ts_updated = NOW() WHERE id = ? AND candidate_id = ?', [schedId, id]);

    // Flag schedule changed if previously confirmed
    const [[cand]] = await pool.query('SELECT schedule_confirmed_at FROM candidate WHERE id = ?', [id]);
    if (cand?.schedule_confirmed_at) {
      await pool.query('UPDATE candidate SET schedule_changed_since_confirm = 1 WHERE id = ?', [id]);
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/onboarding/candidates/:id/schedule/:schedId — update role/notes
router.put('/candidates/:id/schedule/:schedId', async (req, res, next) => {
  try {
    const { schedId } = req.params;
    const { role, notes } = req.body;
    const sets = []; const vals = [];
    if (role !== undefined) { sets.push('role = ?'); vals.push(role); }
    if (notes !== undefined) { sets.push('notes = ?'); vals.push(notes); }
    if (sets.length) {
      await pool.query(`UPDATE candidate_schedule SET ${sets.join(', ')}, ts_updated = NOW() WHERE id = ?`, [...vals, schedId]);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/candidates/:id/schedule-ready — scheduler marks schedule as ready for candidate review
router.post('/candidates/:id/schedule-ready', async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE candidate SET schedule_ready = 1 WHERE id = ?', [id]);
    await pool.query("UPDATE candidate_schedule SET status = 'ready' WHERE candidate_id = ? AND status = 'pending' AND active = 1", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/candidates/:id/schedule-unready — revert to editing
router.post('/candidates/:id/schedule-unready', async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE candidate SET schedule_ready = 0 WHERE id = ?', [id]);
    await pool.query("UPDATE candidate_schedule SET status = 'pending' WHERE candidate_id = ? AND status = 'ready' AND active = 1", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/my-portal/confirm-schedule — candidate confirms their schedule
router.post('/my-portal/confirm-schedule', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [[candidate]] = await pool.query('SELECT id FROM candidate WHERE user_id = ? AND active = 1', [userId]);
    if (!candidate) return res.status(404).json({ success: false, error: 'No candidate profile found' });

    await pool.query('UPDATE candidate SET schedule_confirmed_at = NOW(), schedule_changed_since_confirm = 0 WHERE id = ?', [candidate.id]);
    await pool.query("UPDATE candidate_schedule SET status = 'confirmed', confirmed_at = NOW() WHERE candidate_id = ? AND active = 1 AND status IN ('ready', 'changed')", [candidate.id]);

    // Auto-complete the Confirm Schedule requirement if it exists
    const [[req_row]] = await pool.query(
      `SELECT cr.id FROM candidate_requirement cr
       JOIN onboarding_requirement r ON r.id = cr.requirement_id
       WHERE cr.candidate_id = ? AND r.title = 'Confirm Schedule' AND cr.completed = 0`,
      [candidate.id]
    );
    if (req_row) {
      await pool.query(
        'UPDATE candidate_requirement SET completed = 1, completed_at = NOW(), completed_by_user_id = ?, status = ? WHERE id = ?',
        [userId, 'complete', req_row.id]
      );
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/onboarding/candidate-requirements/:id/waive — waive a requirement
router.post('/candidate-requirements/:id/waive', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { waived, waived_reason } = req.body;
    await pool.query(
      'UPDATE candidate_requirement SET waived = ?, waived_reason = ?, completed = IF(? = 1, 1, completed), status = IF(? = 1, ?, status), ts_updated = NOW() WHERE id = ?',
      [waived ? 1 : 0, waived_reason || null, waived ? 1 : 0, waived ? 1 : 0, 'waived', id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/onboarding/pending-schedules — for assignment board: candidates needing schedule
router.get('/pending-schedules', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.full_name, c.status, c.geographic_area_id,
              ga.geographic_area_name,
              c.schedule_ready, c.schedule_confirmed_at, c.schedule_changed_since_confirm,
              (SELECT COUNT(*) FROM candidate_schedule cs WHERE cs.candidate_id = c.id AND cs.active = 1) AS schedule_count
       FROM candidate c
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       WHERE c.active = 1 AND c.status IN ('pending', 'in_progress', 'complete')
         AND c.professor_id IS NULL
       ORDER BY c.full_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
