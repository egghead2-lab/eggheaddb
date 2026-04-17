const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════
// GET /api/daily-tasks/my — resolved tasks for current user
// Merges: own role tasks + delegated-to-me − delegated-away
// Runs count_query for each task to get badge numbers
// ═══════════════════════════════════════════════════════════════
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    // Get user's role
    const [[user]] = await pool.query('SELECT id, role_id FROM user WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const roleId = user.role_id;

    // 1. Tasks for my role + team-wide tasks (role_id IS NULL)
    const [ownTasks] = await pool.query(
      `SELECT * FROM daily_task_definition WHERE active = 1 AND (role_id = ? OR role_id IS NULL) ORDER BY team, sort_order`,
      [roleId]
    );

    // 2. Tasks delegated TO me for today
    const [delegatedToMe] = await pool.query(
      `SELECT dtd.task_definition_id, dtd.from_user_id,
              u.first_name AS from_first, u.last_name AS from_last
       FROM daily_task_delegation dtd
       JOIN user u ON u.id = dtd.from_user_id
       WHERE dtd.to_user_id = ? AND dtd.active = 1
         AND dtd.start_date <= ? AND (dtd.end_date IS NULL OR dtd.end_date >= ?)`,
      [userId, today, today]
    );

    // 3. Tasks delegated AWAY from me for today
    const [delegatedAway] = await pool.query(
      `SELECT dtd.task_definition_id FROM daily_task_delegation dtd
       WHERE dtd.from_user_id = ? AND dtd.active = 1
         AND dtd.start_date <= ? AND (dtd.end_date IS NULL OR dtd.end_date >= ?)`,
      [userId, today, today]
    );

    // Build delegated-to-me: if task_definition_id is NULL, it means ALL tasks from that user's role
    const delegatedToMeTaskIds = new Set();
    const delegatedToMeAllFromUsers = [];
    for (const d of delegatedToMe) {
      if (d.task_definition_id) {
        delegatedToMeTaskIds.add(d.task_definition_id);
      } else {
        delegatedToMeAllFromUsers.push(d.from_user_id);
      }
    }

    // Get additional tasks if we're covering someone's entire role
    let extraTasks = [];
    if (delegatedToMeAllFromUsers.length > 0) {
      const [fromUsers] = await pool.query(
        `SELECT id, role_id FROM user WHERE id IN (${delegatedToMeAllFromUsers.map(() => '?').join(',')})`,
        delegatedToMeAllFromUsers
      );
      const extraRoleIds = [...new Set(fromUsers.map(u => u.role_id).filter(Boolean))];
      if (extraRoleIds.length > 0) {
        const [extra] = await pool.query(
          `SELECT * FROM daily_task_definition WHERE active = 1 AND role_id IN (${extraRoleIds.map(() => '?').join(',')})`,
          extraRoleIds
        );
        extraTasks = extra;
      }
    }

    // Also get individually delegated tasks
    let individualDelegatedTasks = [];
    if (delegatedToMeTaskIds.size > 0) {
      const ids = [...delegatedToMeTaskIds];
      const [indiv] = await pool.query(
        `SELECT * FROM daily_task_definition WHERE active = 1 AND id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      individualDelegatedTasks = indiv;
    }

    // Build delegated-away set
    const delegatedAwayTaskIds = new Set();
    let delegatedAwayAll = false;
    for (const d of delegatedAway) {
      if (d.task_definition_id) {
        delegatedAwayTaskIds.add(d.task_definition_id);
      } else {
        delegatedAwayAll = true;
      }
    }

    // Merge: own tasks + extra delegated tasks, minus delegated away
    const taskMap = new Map();
    const addTask = (t, delegatedFrom) => {
      const key = t.id;
      if (taskMap.has(key)) return; // dedup
      if (delegatedAwayAll && !delegatedFrom) return; // all my tasks are delegated away
      if (delegatedAwayTaskIds.has(key) && !delegatedFrom) return; // this specific task delegated away
      taskMap.set(key, { ...t, delegated_from: delegatedFrom || null });
    };

    // Own tasks (not delegated away)
    if (!delegatedAwayAll) {
      ownTasks.forEach(t => addTask(t, null));
    }

    // Delegated-to-me tasks
    extraTasks.forEach(t => {
      const fromUser = delegatedToMeAllFromUsers[0]; // simplified — could be multiple
      const from = delegatedToMe.find(d => !d.task_definition_id);
      addTask(t, from ? `${from.from_first} ${from.from_last}` : null);
    });
    individualDelegatedTasks.forEach(t => {
      const from = delegatedToMe.find(d => d.task_definition_id === t.id);
      addTask(t, from ? `${from.from_first} ${from.from_last}` : null);
    });

    // Run count queries for badge numbers
    const tasks = [...taskMap.values()];
    for (const task of tasks) {
      if (task.count_query) {
        try {
          const [[result]] = await pool.query(task.count_query);
          task.count = result?.cnt ?? null;
        } catch (err) {
          task.count = null;
          task.count_error = err.message;
        }
      }
    }

    // Group by team
    const grouped = {};
    for (const t of tasks) {
      if (!grouped[t.team]) grouped[t.team] = [];
      grouped[t.team].push(t);
    }

    // Sort within groups
    for (const team of Object.keys(grouped)) {
      grouped[team].sort((a, b) => a.sort_order - b.sort_order);
    }

    res.json({ success: true, data: { tasks, grouped, delegations_active: delegatedToMe.length + delegatedAway.length } });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/daily-tasks/team — admin view: all tasks for all teams, or a specific team
// ═══════════════════════════════════════════════════════════════
router.get('/team', authenticate, async (req, res, next) => {
  try {
    const { team } = req.query;
    let q = 'SELECT dtd.*, r.role_name FROM daily_task_definition dtd LEFT JOIN role r ON r.id = dtd.role_id WHERE dtd.active = 1';
    const params = [];
    if (team) { q += ' AND dtd.team = ?'; params.push(team); }
    q += ' ORDER BY dtd.team, dtd.sort_order';
    const [rows] = await pool.query(q, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// TASK DEFINITIONS CRUD (admin)
// ═══════════════════════════════════════════════════════════════
router.get('/definitions', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT dtd.*, r.role_name FROM daily_task_definition dtd LEFT JOIN role r ON r.id = dtd.role_id WHERE dtd.active = 1 ORDER BY dtd.team, dtd.sort_order`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/definitions', authenticate, async (req, res, next) => {
  try {
    const { name, description, role_id, team, task_type, page_path, report_id, count_query, count_label, sort_order } = req.body;
    if (!name || !team) return res.status(400).json({ success: false, error: 'Name and team required' });
    const [result] = await pool.query(
      `INSERT INTO daily_task_definition (name, description, role_id, team, task_type, page_path, report_id, count_query, count_label, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || null, role_id || null, team, task_type || 'manual', page_path || null, report_id || null, count_query || null, count_label || 'items', sort_order || 0]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

router.put('/definitions/:id', authenticate, async (req, res, next) => {
  try {
    const allowed = ['name', 'description', 'role_id', 'team', 'task_type', 'page_path', 'report_id', 'count_query', 'count_label', 'sort_order', 'active'];
    const fields = []; const values = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { fields.push(`${k} = ?`); values.push(v); }
    }
    if (fields.length) await pool.query(`UPDATE daily_task_definition SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/definitions/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE daily_task_definition SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// DELEGATIONS CRUD
// ═══════════════════════════════════════════════════════════════
router.get('/delegations', authenticate, async (req, res, next) => {
  try {
    const { active_only } = req.query;
    const today = new Date().toISOString().split('T')[0];
    let q = `SELECT d.*,
                    fu.first_name AS from_first, fu.last_name AS from_last, fr.role_name AS from_role,
                    tu.first_name AS to_first, tu.last_name AS to_last, tr.role_name AS to_role,
                    dtd.name AS task_name
             FROM daily_task_delegation d
             JOIN user fu ON fu.id = d.from_user_id
             LEFT JOIN role fr ON fr.id = fu.role_id
             JOIN user tu ON tu.id = d.to_user_id
             LEFT JOIN role tr ON tr.id = tu.role_id
             LEFT JOIN daily_task_definition dtd ON dtd.id = d.task_definition_id
             WHERE d.active = 1`;
    const params = [];
    if (active_only === 'true') {
      q += ' AND d.start_date <= ? AND (d.end_date IS NULL OR d.end_date >= ?)';
      params.push(today, today);
    }
    q += ' ORDER BY d.start_date DESC';
    const [rows] = await pool.query(q, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/delegations', authenticate, async (req, res, next) => {
  try {
    const { from_user_id, to_user_id, start_date, end_date, task_definition_id, notes } = req.body;
    if (!from_user_id || !to_user_id || !start_date) {
      return res.status(400).json({ success: false, error: 'from_user, to_user, and start_date required' });
    }
    const [result] = await pool.query(
      `INSERT INTO daily_task_delegation (from_user_id, to_user_id, start_date, end_date, task_definition_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [from_user_id, to_user_id, start_date, end_date || null, task_definition_id || null, notes || null, req.user.userId]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

router.put('/delegations/:id', authenticate, async (req, res, next) => {
  try {
    const allowed = ['from_user_id', 'to_user_id', 'start_date', 'end_date', 'task_definition_id', 'notes', 'active'];
    const fields = []; const values = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { fields.push(`${k} = ?`); values.push(v); }
    }
    if (fields.length) await pool.query(`UPDATE daily_task_delegation SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/delegations/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE daily_task_delegation SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
