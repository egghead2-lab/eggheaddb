const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/tools — returns all tools with their role assignments
router.get('/', authenticate, async (req, res, next) => {
  try {
    const [tools] = await pool.query(
      `SELECT t.*, GROUP_CONCAT(tr.role_id) AS role_ids
       FROM tool t
       LEFT JOIN tool_role tr ON tr.tool_id = t.id
       WHERE t.active = 1
       GROUP BY t.id
       ORDER BY t.nav_group, t.sort_order, t.label`
    );

    const [roles] = await pool.query('SELECT id, role_name FROM role WHERE active = 1 ORDER BY role_name');

    res.json({
      success: true,
      data: tools.map(t => ({
        ...t,
        role_ids: t.role_ids ? t.role_ids.split(',').map(Number) : [],
      })),
      roles,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/tools/my-permissions — returns tools accessible by the current user's role
router.get('/my-permissions', authenticate, async (req, res, next) => {
  try {
    const { role } = req.user;
    const adminRoles = ['Admin', 'CEO'];

    let tools;
    const restrictedRoles = ['Professor', 'Candidate'];

    if (adminRoles.includes(role)) {
      // Admin/CEO see everything except professor-only "My Classes" section
      [tools] = await pool.query(
        `SELECT path, label, nav_group, sort_order FROM tool WHERE active = 1 AND nav_group != 'My Classes' ORDER BY nav_group, sort_order, label`
      );
    } else {
      // Get the user's role_id
      const [[userRole]] = await pool.query('SELECT id FROM role WHERE role_name = ? AND active = 1', [role]);
      if (!userRole) return res.json({ success: true, data: [] });

      if (restrictedRoles.includes(role)) {
        // Restricted roles ONLY see tools explicitly assigned to their role (no universal)
        [tools] = await pool.query(
          `SELECT t.path, t.label, t.nav_group, t.sort_order FROM tool t
           JOIN tool_role tr ON tr.tool_id = t.id AND tr.role_id = ?
           WHERE t.active = 1
           ORDER BY t.nav_group, t.sort_order, t.label`,
          [userRole.id]
        );
      } else {
        [tools] = await pool.query(
          `SELECT t.path, t.label, t.nav_group, t.sort_order FROM tool t
           LEFT JOIN tool_role tr ON tr.tool_id = t.id AND tr.role_id = ?
           WHERE t.active = 1 AND (t.universal = 1 OR tr.id IS NOT NULL) AND t.nav_group != 'My Classes'
           ORDER BY t.nav_group, t.sort_order, t.label`,
          [userRole.id]
        );
      }
    }

    // Group by nav_group
    const groups = {};
    tools.forEach(t => {
      const g = t.nav_group || 'Other';
      if (!groups[g]) groups[g] = [];
      groups[g].push({ path: t.path, label: t.label });
    });

    res.json({ success: true, data: tools, groups });
  } catch (err) {
    next(err);
  }
});

// POST /api/tools — create a new tool
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { path, label, nav_group, universal } = req.body;
    if (!path || !label) return res.status(400).json({ success: false, error: 'Path and label required' });

    const [result] = await pool.query(
      'INSERT INTO tool (path, label, nav_group, universal, active) VALUES (?,?,?,?,1)',
      [path, label, nav_group || null, universal ? 1 : 0]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, error: 'Path already exists' });
    next(err);
  }
});

// PUT /api/tools/:id — update tool settings
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { label, nav_group, universal, sort_order, active } = req.body;
    const fields = [], values = [];
    if (label !== undefined) { fields.push('label = ?'); values.push(label); }
    if (nav_group !== undefined) { fields.push('nav_group = ?'); values.push(nav_group || null); }
    if (universal !== undefined) { fields.push('universal = ?'); values.push(universal ? 1 : 0); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (active !== undefined) { fields.push('active = ?'); values.push(active ? 1 : 0); }
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No fields' });

    await pool.query(`UPDATE tool SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/tools/rename-group — rename a nav_group across all tools
router.post('/rename-group', authenticate, async (req, res, next) => {
  try {
    const { old_name, new_name } = req.body;
    if (!old_name || !new_name) return res.status(400).json({ success: false, error: 'Both old and new name required' });
    const [result] = await pool.query('UPDATE tool SET nav_group = ? WHERE nav_group = ?', [new_name.trim(), old_name]);
    res.json({ success: true, updated: result.affectedRows });
  } catch (err) { next(err); }
});

// PUT /api/tools/:id/roles — set role assignments (replaces all)
router.put('/:id/roles', authenticate, async (req, res, next) => {
  try {
    const { role_ids } = req.body;
    if (!Array.isArray(role_ids)) return res.status(400).json({ success: false, error: 'role_ids array required' });

    await pool.query('DELETE FROM tool_role WHERE tool_id = ?', [req.params.id]);
    for (const rid of role_ids) {
      await pool.query('INSERT INTO tool_role (tool_id, role_id) VALUES (?,?)', [req.params.id, rid]);
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/tools/group-order — get sidebar group order
router.get('/group-order', authenticate, async (req, res, next) => {
  try {
    const [[row]] = await pool.query("SELECT setting_value FROM app_setting WHERE setting_key = 'sidebar_group_order'");
    res.json({ success: true, data: row ? JSON.parse(row.setting_value) : null });
  } catch (err) { next(err); }
});

// PUT /api/tools/group-order — save sidebar group order
router.put('/group-order', authenticate, async (req, res, next) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ success: false, error: 'order array required' });
    await pool.query(
      "INSERT INTO app_setting (setting_key, setting_value) VALUES ('sidebar_group_order', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [JSON.stringify(order), JSON.stringify(order)]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
