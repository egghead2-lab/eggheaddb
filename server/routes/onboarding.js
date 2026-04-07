const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

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
    if (assignee) { clauses.push('(c.onboarder_user_id = ? OR c.trainer_user_id = ? OR c.recruiter_user_id = ?)'); params.push(assignee, assignee, assignee); }

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
              CONCAT(onb.first_name, ' ', onb.last_name) AS onboarder_name,
              CONCAT(tr.first_name, ' ', tr.last_name) AS trainer_name,
              CONCAT(rec.first_name, ' ', rec.last_name) AS recruiter_name,
              cu.user_name AS login_username,
              cu.active AS login_active,
              r.role_name AS login_role
       FROM candidate c
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN user onb ON onb.id = c.onboarder_user_id
       LEFT JOIN user tr ON tr.id = c.trainer_user_id
       LEFT JOIN user rec ON rec.id = c.recruiter_user_id
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

    res.json({ success: true, data: { ...candidate, requirements, tasks, appliedTemplates } });
  } catch (err) { next(err); }
});

// POST /api/onboarding/candidates
router.post('/candidates', async (req, res, next) => {
  try {
    const { full_name, email, phone, geographic_area_id, onboarder_user_id, trainer_user_id, recruiter_user_id, notes } = req.body;
    if (!full_name || !email) return res.status(400).json({ success: false, error: 'Name and email are required' });
    const [result] = await pool.query(
      `INSERT INTO candidate (full_name, email, phone, geographic_area_id, onboarder_user_id, trainer_user_id, recruiter_user_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [full_name, email, phone || null, geographic_area_id || null, onboarder_user_id || null, trainer_user_id || null, recruiter_user_id || null, notes || null]
    );
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
      'trainer_user_id', 'recruiter_user_id', 'first_class_date', 'accepted_at', 'notes', 'active'];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    const setClauses = updates.map(f => `${f} = ?`).join(', ');
    const values = updates.map(f => req.body[f] === '' ? null : req.body[f]);
    await pool.query(`UPDATE candidate SET ${setClauses} WHERE id = ?`, [...values, id]);
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
      `INSERT INTO user (first_name, last_name, email, user_name, password, role_id, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [first, last, candidate.email, username, hashedPassword, CANDIDATE_ROLE_ID]
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

    await pool.query('UPDATE user SET password = ?, ts_updated = NOW() WHERE id = ?', [hashedPassword, candidate.user_id]);

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
        geographic_area_id, professor_status_id, active, ts_inserted, ts_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [nickname, firstName, lastName, candidate.email, candidate.phone, candidate.geographic_area_id,
       req.body.professor_status_id || 1]
    );

    // Link candidate to professor and mark as hired
    await pool.query('UPDATE candidate SET professor_id = ?, status = ? WHERE id = ?',
      [profResult.insertId, 'hired', id]);

    // If candidate has a user account, upgrade role from Candidate to Professor (role_id 15)
    if (candidate.user_id) {
      await pool.query('UPDATE user SET role_id = 15, ts_updated = NOW() WHERE id = ?', [candidate.user_id]);
    }

    res.json({ success: true, professor_id: profResult.insertId });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE REQUIREMENTS (checklist)
// ═══════════════════════════════════════════════════════════════════

// PUT /api/onboarding/candidate-requirements/:id
router.put('/candidate-requirements/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['completed', 'status', 'due_date', 'assigned_to_user_id', 'notes'];
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
    const { title, description, category, type, requires_document, sort_order } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title required' });
    const [result] = await pool.query(
      'INSERT INTO onboarding_requirement (title, description, category, type, requires_document, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description || null, category || null, type || 'task', requires_document ? 1 : 0, sort_order || 0]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/onboarding/requirements/:id
router.put('/requirements/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['title', 'description', 'category', 'type', 'requires_document', 'sort_order', 'active'];
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

    // Get candidate's accepted date for due_date calculation
    const [[candidate]] = await pool.query('SELECT accepted_at FROM candidate WHERE id = ?', [id]);
    const baseDate = candidate?.accepted_at ? new Date(candidate.accepted_at) : new Date();

    let added = 0;
    for (const item of items) {
      if (existingSet.has(item.requirement_id)) continue;
      let dueDate = null;
      if (item.due_offset_days) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + item.due_offset_days);
        dueDate = d.toISOString().split('T')[0];
      }
      await pool.query(
        'INSERT INTO candidate_requirement (candidate_id, requirement_id, due_date) VALUES (?, ?, ?)',
        [id, item.requirement_id, dueDate]
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

    res.json({ success: true, data: {
      pending: pending.cnt, inProgress: inProgress.cnt,
      openReqs: openReqs.cnt, overdueReqs: overdueReqs.cnt,
      openTasks: openTasks.cnt, overdueTasks: overdueTasks.cnt,
    }});
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// CANDIDATE PORTAL (self-service for logged-in candidates)
// ═══════════════════════════════════════════════════════════════════

// GET /api/onboarding/my-portal — candidate views their own data
router.get('/my-portal', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Find candidate linked to this user
    const [[candidate]] = await pool.query(
      `SELECT c.id, c.full_name, c.email, c.phone, c.status, c.first_class_date,
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

    // Requirements
    const [requirements] = await pool.query(
      `SELECT cr.id, cr.completed, cr.status, cr.due_date, cr.notes,
              r.title, r.description, r.category, r.type
       FROM candidate_requirement cr
       JOIN onboarding_requirement r ON r.id = cr.requirement_id
       WHERE cr.candidate_id = ?
       ORDER BY cr.completed, r.sort_order, r.title`, [candidate.id]
    );

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

    res.json({ success: true, data: { ...candidate, requirements, tasks, messages } });
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

module.exports = router;
