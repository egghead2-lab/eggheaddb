const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Class type prefix for start kits
const CLASS_TYPE_PREFIX = { 1: 'Sci', 2: 'Eng', 3: 'Rob', 4: 'Mix', 5: 'Fin' };
// Bin names per class type
const BIN_NAMES = { 1: 'Science Professor Bin', 2: 'Engineering Professor Bin', 3: 'Robotics Professor Bin', 5: 'Financial Literacy Bin' };

// ═══════════════════════════════════════════════════════════════════
// CYCLES
// ═══════════════════════════════════════════════════════════════════

router.get('/cycles', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT sc.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name,
              (SELECT COUNT(*) FROM shipment_order so WHERE so.cycle_id = sc.id) AS order_count
       FROM shipment_cycle sc
       LEFT JOIN user u ON u.id = sc.created_by_user_id
       ORDER BY sc.start_date DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/cycles', async (req, res, next) => {
  try {
    const { start_date, end_date, ship_date, approval_date, notes } = req.body;
    if (!start_date || !end_date || !ship_date) {
      return res.status(400).json({ success: false, error: 'Start, end, and ship dates required' });
    }
    // Check no other draft/approved standard cycle
    const [existing] = await pool.query(
      "SELECT id FROM shipment_cycle WHERE cycle_type = 'standard' AND status IN ('draft','approved')"
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: 'An active standard cycle already exists' });
    }
    const [result] = await pool.query(
      'INSERT INTO shipment_cycle (cycle_type, start_date, end_date, ship_date, approval_date, notes, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['standard', start_date, end_date, ship_date, approval_date || null, notes || null, req.user.userId]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// DELETE cycle and all its orders/lines
router.delete('/cycles/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[cycle]] = await pool.query('SELECT id, status FROM shipment_cycle WHERE id = ?', [id]);
    if (!cycle) return res.status(404).json({ success: false, error: 'Cycle not found' });
    // Delete resolutions, lines, orders, then cycle
    await pool.query(
      `DELETE sr FROM shipment_resolution sr
       JOIN shipment_order_line sol ON sol.id = sr.order_line_id
       JOIN shipment_order so ON so.id = sol.order_id
       WHERE so.cycle_id = ?`, [id]
    );
    await pool.query(
      `DELETE sol FROM shipment_order_line sol
       JOIN shipment_order so ON so.id = sol.order_id
       WHERE so.cycle_id = ?`, [id]
    );
    await pool.query('DELETE FROM shipment_order WHERE cycle_id = ?', [id]);
    await pool.query('DELETE FROM shipment_cycle WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.patch('/cycles/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const validTransitions = { draft: 'approved', approved: 'shipped', shipped: 'complete' };
    const [[cycle]] = await pool.query('SELECT status FROM shipment_cycle WHERE id = ?', [req.params.id]);
    if (!cycle) return res.status(404).json({ success: false, error: 'Cycle not found' });
    if (validTransitions[cycle.status] !== status) {
      return res.status(400).json({ success: false, error: `Cannot transition from ${cycle.status} to ${status}` });
    }
    await pool.query('UPDATE shipment_cycle SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// ORDER GENERATION
// ═══════════════════════════════════════════════════════════════════

router.get('/cycles/:id/orders', async (req, res, next) => {
  try {
    const [orders] = await pool.query(
      `SELECT so.*, CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              ga.geographic_area_name AS area,
              (SELECT COUNT(*) FROM shipment_order_line sol WHERE sol.order_id = so.id) AS line_count,
              (SELECT COUNT(*) FROM shipment_order_line sol WHERE sol.order_id = so.id AND sol.skip_flag = 1) AS skip_count
       FROM shipment_order so
       JOIN professor p ON p.id = so.professor_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       WHERE so.cycle_id = ?
       ORDER BY p.professor_nickname`, [req.params.id]
    );

    // Get line items for each order
    for (const order of orders) {
      const [lines] = await pool.query(
        'SELECT * FROM shipment_order_line WHERE order_id = ? ORDER BY item_type, item_name', [order.id]
      );
      order.lines = lines;
    }

    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
});

// GET /api/materials/cycles/:id/area-status — area build status for a cycle
router.get('/cycles/:id/area-status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[cycle]] = await pool.query('SELECT * FROM shipment_cycle WHERE id = ?', [id]);
    if (!cycle) return res.status(404).json({ success: false, error: 'Cycle not found' });

    // Get all active areas with shipping config
    const [areas] = await pool.query(
      'SELECT id, geographic_area_name, shipping_lead_days FROM geographic_area WHERE active = 1 ORDER BY geographic_area_name'
    );

    // Count orders per area for this cycle (non-supplemental only)
    const [orderCounts] = await pool.query(
      `SELECT ga.id AS area_id, COUNT(so.id) AS order_count,
              SUM(CASE WHEN so.status = 'shipped' THEN 1 ELSE 0 END) AS shipped_count,
              SUM(CASE WHEN so.status = 'pending' THEN 1 ELSE 0 END) AS pending_count
       FROM shipment_order so
       JOIN professor p ON p.id = so.professor_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       WHERE so.cycle_id = ? AND so.order_name NOT LIKE 'SUPP%'
       GROUP BY ga.id`, [id]
    );
    const countMap = {};
    orderCounts.forEach(r => { countMap[r.area_id] = r; });

    // Count professors per area with sessions in this cycle window
    const [progCounts] = await pool.query(
      `SELECT COALESCE(ga.id, 0) AS area_id, COUNT(DISTINCT prog.lead_professor_id) AS professor_count
       FROM program prog
       JOIN class cl ON cl.id = prog.class_id
       JOIN class_status cs ON cs.id = prog.class_status_id
       JOIN professor p ON p.id = prog.lead_professor_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       WHERE prog.active = 1 AND prog.live = 1 AND cs.confirmed = 1
         AND prog.lead_professor_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM session s WHERE s.program_id = prog.id AND s.active = 1
           AND s.session_date BETWEEN ? AND ?)
       GROUP BY COALESCE(ga.id, 0)`,
      [cycle.start_date, cycle.end_date]
    );
    const progMap = {};
    progCounts.forEach(r => { progMap[r.area_id] = r.professor_count; });

    const result = areas.map(a => {
      const counts = countMap[a.id] || { order_count: 0, shipped_count: 0, pending_count: 0 };
      const profCount = progMap[a.id] || 0;
      let status = 'no_programs';
      if (profCount > 0 && counts.order_count === 0) status = 'not_built';
      else if (counts.order_count > 0 && counts.shipped_count === counts.order_count) status = 'shipped';
      else if (counts.order_count > 0) status = 'generated';
      return {
        area_id: a.id,
        area_name: a.geographic_area_name,
        shipping_lead_days: a.shipping_lead_days,
        professor_count: profCount,
        order_count: counts.order_count,
        shipped_count: counts.shipped_count,
        pending_count: counts.pending_count,
        status,
      };
    });

    // Add unassigned professors (no area) if any
    const unassignedCount = progMap[0] || 0;
    if (unassignedCount > 0) {
      result.push({
        area_id: 0, area_name: 'Unassigned (No Area)',
        shipping_lead_days: 7, professor_count: unassignedCount,
        order_count: 0, shipped_count: 0, pending_count: 0,
        status: 'not_built',
      });
    }

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/materials/cycles/:id/generate-orders — generate orders for selected areas
router.post('/cycles/:id/generate-orders', async (req, res, next) => {
  try {
    const { id } = req.params;
    let { area_ids } = req.body;
    // Support legacy single area_id
    if (!area_ids && req.body.area_id) area_ids = [req.body.area_id];
    const [[cycle]] = await pool.query('SELECT * FROM shipment_cycle WHERE id = ?', [id]);
    if (!cycle) return res.status(404).json({ success: false, error: 'Cycle not found' });

    if (!area_ids || !Array.isArray(area_ids) || area_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'area_ids required' });
    }

    // Check which areas already have orders — skip those
    const [existingAreas] = await pool.query(
      `SELECT DISTINCT COALESCE(c.geographic_area_id, 0) AS area_id FROM shipment_order so
       JOIN professor p ON p.id = so.professor_id
       LEFT JOIN city c ON c.id = p.city_id
       WHERE so.cycle_id = ? AND so.order_name NOT LIKE 'SUPP%'`,
      [id]
    );
    const alreadyBuilt = new Set(existingAreas.map(r => r.area_id));
    const newAreaIds = area_ids.filter(a => !alreadyBuilt.has(a));
    if (newAreaIds.length === 0) {
      return res.status(400).json({ success: false, error: 'All selected areas already have orders in this cycle' });
    }

    const cycleStart = cycle.start_date;
    const cycleEnd = cycle.end_date;
    const source = 'standard_cycle';

    // Load exclusion rules
    const [exclusionRules] = await pool.query('SELECT * FROM shipment_exclusion_rule WHERE active = 1');
    const roboticsSkipTypeId = exclusionRules.find(r => r.rule_type === 'class_type_skip')?.class_type_id;
    const minWeeksStart = exclusionRules.find(r => r.rule_type === 'min_weeks_id_card')?.min_weeks || 4;
    const minWeeksDegree = exclusionRules.find(r => r.rule_type === 'min_weeks_degree')?.min_weeks || 4;

    // Query qualifying programs for selected areas (area_id=0 means unassigned/no area)
    const hasUnassigned = newAreaIds.includes(0);
    const realAreaIds = newAreaIds.filter(a => a !== 0);
    let areaWhere = '';
    const areaParams = [];
    if (realAreaIds.length > 0 && hasUnassigned) {
      areaWhere = `AND (c.geographic_area_id IN (${realAreaIds.map(() => '?').join(',')}) OR c.geographic_area_id IS NULL OR p.city_id IS NULL)`;
      areaParams.push(...realAreaIds);
    } else if (realAreaIds.length > 0) {
      areaWhere = `AND c.geographic_area_id IN (${realAreaIds.map(() => '?').join(',')})`;
      areaParams.push(...realAreaIds);
    } else if (hasUnassigned) {
      areaWhere = 'AND (c.geographic_area_id IS NULL OR p.city_id IS NULL)';
    }

    const [programs] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.lead_professor_id, prog.number_enrolled,
              prog.session_count, prog.first_session_date, prog.last_session_date, prog.class_length_minutes,
              cl.class_name, cl.class_type_id, cl.has_id_card,
              ct.class_type_name
       FROM program prog
       JOIN class cl ON cl.id = prog.class_id
       JOIN class_type ct ON ct.id = cl.class_type_id
       JOIN class_status cs ON cs.id = prog.class_status_id
       JOIN professor p ON p.id = prog.lead_professor_id
       LEFT JOIN city c ON c.id = p.city_id
       WHERE prog.active = 1 AND prog.live = 1 AND cs.confirmed = 1
         AND prog.lead_professor_id IS NOT NULL
         ${areaWhere}
         AND EXISTS (
           SELECT 1 FROM session s
           WHERE s.program_id = prog.id AND s.active = 1
             AND s.session_date BETWEEN ? AND ?
         )`,
      [...areaParams, cycleStart, cycleEnd]
    );

    // Get sessions in this window for each program (for lesson lookup)
    const [sessions] = await pool.query(
      `SELECT s.program_id, s.session_date, s.lesson_id, l.lesson_name
       FROM session s
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.active = 1 AND s.session_date BETWEEN ? AND ?`,
      [cycleStart, cycleEnd]
    );
    const sessionsByProgram = {};
    sessions.forEach(s => {
      if (!sessionsByProgram[s.program_id]) sessionsByProgram[s.program_id] = [];
      sessionsByProgram[s.program_id].push(s);
    });

    // Get professor bin data
    const [profBins] = await pool.query(
      'SELECT hb.professor_id, b.bin_name, b.id AS bin_type_id FROM has_bin hb JOIN bin b ON b.id = hb.bin_id WHERE hb.active = 1'
    );
    const profBinMap = {};
    profBins.forEach(pb => {
      if (!profBinMap[pb.professor_id]) profBinMap[pb.professor_id] = new Set();
      profBinMap[pb.professor_id].add(pb.bin_type_id);
    });

    const classTypeToBin = { 1: 1, 2: 2, 3: 3, 5: null };

    // Group programs by professor
    const byProfessor = {};
    for (const prog of programs) {
      if (!byProfessor[prog.lead_professor_id]) byProfessor[prog.lead_professor_id] = [];
      byProfessor[prog.lead_professor_id].push(prog);
    }

    const shipDateStr = cycle.ship_date instanceof Date
      ? cycle.ship_date.toISOString().split('T')[0]
      : String(cycle.ship_date).split('T')[0];

    let ordersCreated = 0;
    let linesCreated = 0;
    const warnings = [];

    for (const [profIdStr, progs] of Object.entries(byProfessor)) {
      const profId = Number(profIdStr);
      const [[prof]] = await pool.query(
        'SELECT professor_nickname, last_name FROM professor WHERE id = ?', [profId]
      );
      if (!prof) continue;

      const orderName = `${prof.professor_nickname} - ${shipDateStr.replace(/-/g, '/').slice(5)}`;

      const [orderResult] = await pool.query(
        'INSERT INTO shipment_order (cycle_id, professor_id, order_name) VALUES (?, ?, ?)',
        [id, profId, orderName]
      );
      const orderId = orderResult.insertId;
      ordersCreated++;

      const profBinSet = profBinMap[profId] || new Set();
      const neededBinTypes = new Set();

      for (const prog of progs) {
        const isRobotics = prog.class_type_id === roboticsSkipTypeId;
        const for20 = prog.number_enrolled > 20;
        const progSessions = sessionsByProgram[prog.id] || [];
        const prefix = CLASS_TYPE_PREFIX[prog.class_type_id] || 'Sci';

        // Track bin need
        const binTypeId = classTypeToBin[prog.class_type_id];
        if (binTypeId && !profBinSet.has(binTypeId)) neededBinTypes.add(binTypeId);

        if (isRobotics) {
          // Skip all lesson/start items for robotics
          continue;
        }

        // Lesson items — one per session in the window
        for (const sess of progSessions) {
          if (!sess.lesson_name) {
            warnings.push({ program: prog.program_nickname, issue: 'Session missing lesson', date: sess.session_date });
            continue;
          }
          const itemName = for20 ? `${sess.lesson_name} For 20` : sess.lesson_name;
          await pool.query(
            'INSERT INTO shipment_order_line (order_id, program_id, lesson_id, item_name, item_type, quantity, source) VALUES (?, ?, ?, ?, ?, 1, ?)',
            [orderId, prog.id, sess.lesson_id, itemName, 'lesson', source]
          );
          linesCreated++;
        }

        // Start kit — if first session is in this window AND has_id_card AND session_count >= min weeks
        const firstSessionInWindow = prog.first_session_date &&
          prog.first_session_date >= cycleStart && prog.first_session_date <= cycleEnd;
        if (firstSessionInWindow && prog.has_id_card && prog.session_count >= minWeeksStart) {
          const startName = for20
            ? `${prefix} Start for 20 - ${prog.class_name}`
            : `${prefix} Start - ${prog.class_name}`;
          await pool.query(
            'INSERT INTO shipment_order_line (order_id, program_id, item_name, item_type, quantity, source) VALUES (?, ?, ?, ?, 1, ?)',
            [orderId, prog.id, startName, 'start_kit', source]
          );
          linesCreated++;
        }

        // Degree — if last session is in this window AND session_count >= min weeks
        const lastSessionInWindow = prog.last_session_date &&
          prog.last_session_date >= cycleStart && prog.last_session_date <= cycleEnd;
        if (lastSessionInWindow && prog.session_count >= minWeeksDegree) {
          await pool.query(
            'INSERT INTO shipment_order_line (order_id, program_id, item_name, item_type, quantity, source, notes) VALUES (?, ?, ?, ?, 1, ?, ?)',
            [orderId, prog.id, 'Degrees', 'degree', source, prog.program_nickname]
          );
          linesCreated++;
        }
      }

      // Bin items
      for (const binTypeId of neededBinTypes) {
        const binName = BIN_NAMES[binTypeId] || `Bin Type ${binTypeId}`;
        await pool.query(
          'INSERT INTO shipment_order_line (order_id, item_name, item_type, quantity, source) VALUES (?, ?, ?, 1, ?)',
          [orderId, binName, 'bin', source]
        );
        linesCreated++;
      }
    }

    res.json({ success: true, ordersCreated, linesCreated, warnings, programCount: programs.length,
      areasBuilt: newAreaIds.length, areasSkipped: alreadyBuilt.size });
  } catch (err) { next(err); }
});

// GET /api/materials/cycles/:id/export-csv — Inflow CSV export (optional area_id filter)
router.get('/cycles/:id/export-csv', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { area_id } = req.query;
    const [[cycle]] = await pool.query('SELECT * FROM shipment_cycle WHERE id = ?', [id]);
    if (!cycle) return res.status(404).json({ success: false, error: 'Cycle not found' });

    const areaFilter = area_id ? ' AND c.geographic_area_id = ?' : '';
    const areaParams = area_id ? [area_id] : [];

    const [orders] = await pool.query(
      `SELECT so.*, p.professor_nickname, p.first_name, p.last_name, p.email, p.phone_number, p.address,
              c.city_name, c.zip_code, s.state_name,
              ga.geographic_area_name AS area
       FROM shipment_order so
       JOIN professor p ON p.id = so.professor_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN state s ON s.id = c.state_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       WHERE so.cycle_id = ? AND so.status != 'cancelled'${areaFilter}
       ORDER BY p.professor_nickname`, [id, ...areaParams]
    );

    const shipDateStr = cycle.ship_date instanceof Date
      ? cycle.ship_date.toISOString().split('T')[0]
      : String(cycle.ship_date).split('T')[0];

    const csvRows = [
      'OrderNumber,Customer,ItemName,ItemQuantity,OrderRemarks,OrderDate,ContactName,Email,Phone,Address,City,State,Zip,Country,ShipmentStatus,Area'
    ];

    for (const order of orders) {
      const [lines] = await pool.query(
        'SELECT * FROM shipment_order_line WHERE order_id = ? AND skip_flag = 0 ORDER BY item_type, item_name',
        [order.id]
      );

      for (const line of lines) {
        const qty = line.quantity_override ?? line.quantity;
        const remarks = line.notes || '';
        const row = [
          `"${order.order_name}"`,
          `"${order.professor_nickname}"`,
          `"${line.item_name}"`,
          qty,
          `"${remarks.replace(/"/g, '""')}"`,
          `"${shipDateStr}"`,
          `"${(order.first_name || '') + ' ' + (order.last_name || '')}"`,
          `"${order.email || ''}"`,
          `"${order.phone_number || ''}"`,
          `"${order.address || ''}"`,
          `"${order.city_name || ''}"`,
          `"${order.state_name || ''}"`,
          `"${order.zip_code || ''}"`,
          `"United States"`,
          `"${order.status === 'shipped' ? 'Shipped' : ''}"`,
          `"${order.area || ''}"`,
        ];
        csvRows.push(row.join(','));
      }
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inflow-${cycle.cycle_type}-${shipDateStr}.csv"`);
    res.send(csvRows.join('\n'));
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// MID-CYCLE DETECTION — find items that should exist but weren't shipped
// ═══════════════════════════════════════════════════════════════════

router.get('/cycles/:id/mid-cycle-flags', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[cycle]] = await pool.query('SELECT * FROM shipment_cycle WHERE id = ?', [id]);
    if (!cycle) return res.status(404).json({ success: false, error: 'Cycle not found' });

    const cycleStart = cycle.start_date;
    const cycleEnd = cycle.end_date;

    // Load exclusion rules
    const [exclusionRules] = await pool.query('SELECT * FROM shipment_exclusion_rule WHERE active = 1');
    const roboticsSkipTypeId = exclusionRules.find(r => r.rule_type === 'class_type_skip')?.class_type_id;
    const minWeeksStart = exclusionRules.find(r => r.rule_type === 'min_weeks_id_card')?.min_weeks || 4;
    const minWeeksDegree = exclusionRules.find(r => r.rule_type === 'min_weeks_degree')?.min_weeks || 4;

    // What SHOULD exist: all qualifying programs with sessions in this window
    const [programs] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.lead_professor_id, prog.number_enrolled,
              prog.session_count, prog.first_session_date, prog.last_session_date,
              cl.class_name, cl.class_type_id, cl.has_id_card, ct.class_type_name
       FROM program prog
       JOIN class cl ON cl.id = prog.class_id
       JOIN class_type ct ON ct.id = cl.class_type_id
       JOIN class_status cs ON cs.id = prog.class_status_id
       WHERE prog.active = 1 AND prog.live = 1 AND cs.confirmed = 1
         AND prog.lead_professor_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM session s
           WHERE s.program_id = prog.id AND s.active = 1
             AND s.session_date BETWEEN ? AND ?
         )`,
      [cycleStart, cycleEnd]
    );

    const [sessions] = await pool.query(
      `SELECT s.program_id, s.session_date, s.lesson_id, l.lesson_name
       FROM session s LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.active = 1 AND s.session_date BETWEEN ? AND ?`,
      [cycleStart, cycleEnd]
    );
    const sessionsByProgram = {};
    sessions.forEach(s => {
      if (!sessionsByProgram[s.program_id]) sessionsByProgram[s.program_id] = [];
      sessionsByProgram[s.program_id].push(s);
    });

    // What DOES exist: all non-cancelled order lines in this cycle (any source)
    const [existingLines] = await pool.query(
      `SELECT sol.item_name, sol.item_type, sol.program_id, sol.lesson_id, so.professor_id, so.status AS order_status,
              sol.source, sol.id AS line_id, sol.skip_flag,
              sr.resolution, sr.id AS resolution_id
       FROM shipment_order_line sol
       JOIN shipment_order so ON so.id = sol.order_id
       LEFT JOIN shipment_resolution sr ON sr.order_line_id = sol.id
       WHERE so.cycle_id = ? AND so.status != 'cancelled'`,
      [id]
    );

    // Build a set of what's already covered (shipped standard items + any mid_cycle items already flagged)
    const coveredKey = (profId, progId, itemName, itemType) => `${profId}|${progId || ''}|${itemName}|${itemType}`;
    const coveredSet = new Set();
    const existingMidCycleFlags = []; // already-flagged mid-cycle items to return

    for (const line of existingLines) {
      coveredSet.add(coveredKey(line.professor_id, line.program_id, line.item_name, line.item_type));
      if (line.source === 'mid_cycle') {
        existingMidCycleFlags.push(line);
      }
    }

    // Compute what's missing
    const missingItems = []; // items that should exist but don't
    const prefix = CLASS_TYPE_PREFIX;

    for (const prog of programs) {
      const profId = prog.lead_professor_id;
      const isRobotics = prog.class_type_id === roboticsSkipTypeId;
      const for20 = prog.number_enrolled > 20;
      const progSessions = sessionsByProgram[prog.id] || [];
      const pfx = prefix[prog.class_type_id] || 'Sci';

      if (isRobotics) continue;

      // Lesson items
      for (const sess of progSessions) {
        if (!sess.lesson_name) continue;
        const itemName = for20 ? `${sess.lesson_name} For 20` : sess.lesson_name;
        const key = coveredKey(profId, prog.id, itemName, 'lesson');
        if (!coveredSet.has(key)) {
          missingItems.push({
            professor_id: profId, program_id: prog.id, program_nickname: prog.program_nickname,
            lesson_id: sess.lesson_id, item_name: itemName, item_type: 'lesson',
            class_type_name: prog.class_type_name,
          });
        }
      }

      // Start kit
      const firstSessionInWindow = prog.first_session_date &&
        prog.first_session_date >= cycleStart && prog.first_session_date <= cycleEnd;
      if (firstSessionInWindow && prog.has_id_card && prog.session_count >= minWeeksStart) {
        const startName = for20
          ? `${pfx} Start for 20 - ${prog.class_name}`
          : `${pfx} Start - ${prog.class_name}`;
        const key = coveredKey(profId, prog.id, startName, 'start_kit');
        if (!coveredSet.has(key)) {
          missingItems.push({
            professor_id: profId, program_id: prog.id, program_nickname: prog.program_nickname,
            item_name: startName, item_type: 'start_kit', class_type_name: prog.class_type_name,
          });
        }
      }

      // Degree
      const lastSessionInWindow = prog.last_session_date &&
        prog.last_session_date >= cycleStart && prog.last_session_date <= cycleEnd;
      if (lastSessionInWindow && prog.session_count >= minWeeksDegree) {
        const key = coveredKey(profId, prog.id, 'Degrees', 'degree');
        if (!coveredSet.has(key)) {
          missingItems.push({
            professor_id: profId, program_id: prog.id, program_nickname: prog.program_nickname,
            item_name: 'Degrees', item_type: 'degree', class_type_name: prog.class_type_name,
          });
        }
      }
    }

    // Insert missing items as mid-cycle flagged lines on supplemental orders
    let newFlags = 0;
    if (missingItems.length > 0) {
      // Group by professor
      const byProf = {};
      for (const item of missingItems) {
        if (!byProf[item.professor_id]) byProf[item.professor_id] = [];
        byProf[item.professor_id].push(item);
      }

      const shipDateStr = cycle.ship_date instanceof Date
        ? cycle.ship_date.toISOString().split('T')[0]
        : String(cycle.ship_date).split('T')[0];

      for (const [profIdStr, items] of Object.entries(byProf)) {
        const profId = Number(profIdStr);
        const [[prof]] = await pool.query('SELECT professor_nickname FROM professor WHERE id = ?', [profId]);
        if (!prof) continue;

        // Find or create supplemental order for this professor in this cycle
        const [[existingOrder]] = await pool.query(
          "SELECT id FROM shipment_order WHERE cycle_id = ? AND professor_id = ? AND order_name LIKE 'SUPP%'",
          [id, profId]
        );
        let orderId;
        if (existingOrder) {
          orderId = existingOrder.id;
        } else {
          const orderName = `SUPP - ${prof.professor_nickname} - ${shipDateStr.replace(/-/g, '/').slice(5)}`;
          const [orderResult] = await pool.query(
            'INSERT INTO shipment_order (cycle_id, professor_id, order_name) VALUES (?, ?, ?)',
            [id, profId, orderName]
          );
          orderId = orderResult.insertId;
        }

        for (const item of items) {
          await pool.query(
            'INSERT INTO shipment_order_line (order_id, program_id, lesson_id, item_name, item_type, quantity, source) VALUES (?, ?, ?, ?, ?, 1, ?)',
            [orderId, item.program_id, item.lesson_id || null, item.item_name, item.item_type, 'mid_cycle']
          );
          newFlags++;
        }
      }
    }

    // Return all mid-cycle flagged items for this cycle (existing + newly created)
    // Include area lead time and earliest session date for urgency warnings
    const [allFlags] = await pool.query(
      `SELECT sol.id AS line_id, sol.item_name, sol.item_type, sol.program_id, sol.quantity,
              so.id AS order_id, so.order_name, so.professor_id, so.status AS order_status,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              ga.geographic_area_name AS area,
              ga.shipping_lead_days,
              prog.program_nickname,
              (SELECT MIN(s.session_date) FROM session s WHERE s.program_id = sol.program_id AND s.active = 1
                AND s.session_date BETWEEN ? AND ?) AS earliest_session_date,
              sr.id AS resolution_id, sr.resolution, sr.quantity_resolved, sr.notes AS resolution_notes,
              sr.resolved_at
       FROM shipment_order_line sol
       JOIN shipment_order so ON so.id = sol.order_id
       JOIN professor p ON p.id = so.professor_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN program prog ON prog.id = sol.program_id
       LEFT JOIN shipment_resolution sr ON sr.order_line_id = sol.id
       WHERE so.cycle_id = ? AND sol.source = 'mid_cycle' AND so.status != 'cancelled'
       ORDER BY ga.geographic_area_name, p.professor_nickname, sol.item_name`,
      [cycleStart, cycleEnd, id]
    );

    res.json({ success: true, data: allFlags, newFlags });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// MARK SHIPPED
// ═══════════════════════════════════════════════════════════════════

router.patch('/orders/:id/ship', async (req, res, next) => {
  try {
    const { inflow_order_number, bin_number_entries } = req.body;

    // Check if order has bin items — require bin assignments if so
    const [binLines] = await pool.query(
      "SELECT id FROM shipment_order_line WHERE order_id = ? AND item_type = 'bin' AND skip_flag = 0", [req.params.id]
    );
    if (binLines.length > 0 && (!bin_number_entries || bin_number_entries.length === 0)) {
      return res.status(400).json({ success: false, error: 'This order has bin items — assign bin numbers before shipping' });
    }

    // Update professor bins if provided
    if (bin_number_entries && Array.isArray(bin_number_entries)) {
      const [[order]] = await pool.query('SELECT professor_id FROM shipment_order WHERE id = ?', [req.params.id]);
      for (const entry of bin_number_entries) {
        if (entry.bin_id && entry.bin_number && order) {
          await pool.query(
            'INSERT INTO has_bin (professor_id, bin_id, bin_number, active) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE bin_number = VALUES(bin_number), active = 1',
            [order.professor_id, entry.bin_id, entry.bin_number]
          );
        }
      }
    }

    await pool.query(
      'UPDATE shipment_order SET status = ?, shipped_at = NOW(), shipped_by_user_id = ?, inflow_order_number = ? WHERE id = ?',
      ['shipped', req.user.userId, inflow_order_number || null, req.params.id]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// Search shipments across all cycles
router.get('/shipments', async (req, res, next) => {
  try {
    const { start_date, end_date, area_id, search, status, limit = 50, page = 1 } = req.query;
    let where = ['1=1'];
    const params = [];

    if (start_date) { where.push('sc.start_date >= ?'); params.push(start_date); }
    if (end_date) { where.push('sc.end_date <= ?'); params.push(end_date); }
    if (area_id) { where.push('c.geographic_area_id = ?'); params.push(area_id); }
    if (status) { where.push('so.status = ?'); params.push(status); }
    if (search) {
      where.push('(p.professor_nickname LIKE ? OR so.order_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM shipment_order so
       JOIN professor p ON p.id = so.professor_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN shipment_cycle sc ON sc.id = so.cycle_id
       WHERE ${where.join(' AND ')}`, params
    );

    const [rows] = await pool.query(
      `SELECT so.*, CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              ga.geographic_area_name AS area,
              sc.start_date AS cycle_start, sc.end_date AS cycle_end, sc.ship_date AS cycle_ship_date,
              (SELECT COUNT(*) FROM shipment_order_line sol WHERE sol.order_id = so.id) AS line_count,
              (SELECT COUNT(*) FROM shipment_order_line sol WHERE sol.order_id = so.id AND sol.item_type = 'bin' AND sol.skip_flag = 0) AS bin_count
       FROM shipment_order so
       JOIN professor p ON p.id = so.professor_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN shipment_cycle sc ON sc.id = so.cycle_id
       WHERE ${where.join(' AND ')}
       ORDER BY so.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    // Attach bin line items to orders that have them
    for (const order of rows) {
      if (order.bin_count > 0) {
        const [binLines] = await pool.query(
          "SELECT sol.id, sol.item_name, sol.item_type FROM shipment_order_line sol WHERE sol.order_id = ? AND sol.item_type = 'bin' AND sol.skip_flag = 0",
          [order.id]
        );
        order.bin_lines = binLines;
      }
    }

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// Unship — revert shipped order back to pending (allowed until tracking CSV imported)
router.patch('/orders/:id/unship', async (req, res, next) => {
  try {
    const [[order]] = await pool.query('SELECT status, tracking_number FROM shipment_order WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.tracking_number) return res.status(400).json({ success: false, error: 'Cannot unship — tracking number already imported' });
    await pool.query(
      'UPDATE shipment_order SET status = ?, shipped_at = NULL, shipped_by_user_id = NULL WHERE id = ?',
      ['pending', req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/orders/bulk-ship', async (req, res, next) => {
  try {
    const { order_ids } = req.body;
    if (!Array.isArray(order_ids) || order_ids.length === 0) return res.status(400).json({ success: false, error: 'No orders selected' });
    const placeholders = order_ids.map(() => '?').join(',');
    await pool.query(
      `UPDATE shipment_order SET status = 'shipped', shipped_at = NOW(), shipped_by_user_id = ? WHERE id IN (${placeholders}) AND status = 'pending'`,
      [req.user.userId, ...order_ids]
    );
    res.json({ success: true, shipped: order_ids.length });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// RESOLUTIONS — acknowledge and ship mid-cycle flagged items
// ═══════════════════════════════════════════════════════════════════

// Acknowledge a flagged item (scheduler confirms they've seen it)
router.post('/resolutions/acknowledge', async (req, res, next) => {
  try {
    const { order_line_id, notes } = req.body;
    if (!order_line_id) return res.status(400).json({ success: false, error: 'order_line_id required' });
    await pool.query(
      `INSERT INTO shipment_resolution (order_line_id, resolution, notes, resolved_by_user_id)
       VALUES (?, 'acknowledged', ?, ?)
       ON DUPLICATE KEY UPDATE resolution = 'acknowledged', notes = VALUES(notes),
         resolved_by_user_id = VALUES(resolved_by_user_id), resolved_at = NOW()`,
      [order_line_id, notes || null, req.user.userId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Mark individual flagged item as shipped
router.post('/resolutions/ship', async (req, res, next) => {
  try {
    const { order_line_id } = req.body;
    if (!order_line_id) return res.status(400).json({ success: false, error: 'order_line_id required' });
    // Update the resolution to 'shipped'
    await pool.query(
      `INSERT INTO shipment_resolution (order_line_id, resolution, resolved_by_user_id)
       VALUES (?, 'shipped', ?)
       ON DUPLICATE KEY UPDATE resolution = 'shipped', resolved_by_user_id = VALUES(resolved_by_user_id), resolved_at = NOW()`,
      [order_line_id, req.user.userId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Bulk mark flagged items as shipped
router.post('/resolutions/bulk-ship', async (req, res, next) => {
  try {
    const { order_line_ids } = req.body;
    if (!Array.isArray(order_line_ids) || order_line_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No items selected' });
    }
    for (const lineId of order_line_ids) {
      await pool.query(
        `INSERT INTO shipment_resolution (order_line_id, resolution, resolved_by_user_id)
         VALUES (?, 'shipped', ?)
         ON DUPLICATE KEY UPDATE resolution = 'shipped', resolved_by_user_id = VALUES(resolved_by_user_id), resolved_at = NOW()`,
        [lineId, req.user.userId]
      );
    }
    res.json({ success: true, shipped: order_line_ids.length });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// STOCK LEVELS
// ═══════════════════════════════════════════════════════════════════

router.get('/stock', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM stock_level ORDER BY item_name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.patch('/stock/:id', async (req, res, next) => {
  try {
    const { qty_on_hand } = req.body;
    await pool.query('UPDATE stock_level SET qty_on_hand = ?, updated_by_user_id = ? WHERE id = ?',
      [qty_on_hand, req.user.userId, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/stock/import', async (req, res, next) => {
  try {
    const { items } = req.body; // [{item_name, sku, qty_on_hand}]
    if (!Array.isArray(items)) return res.status(400).json({ success: false, error: 'Items array required' });
    let imported = 0;
    for (const item of items) {
      if (!item.sku || !item.item_name) continue;
      await pool.query(
        'INSERT INTO stock_level (item_name, sku, qty_on_hand, updated_by_user_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE item_name = VALUES(item_name), qty_on_hand = VALUES(qty_on_hand), updated_by_user_id = VALUES(updated_by_user_id)',
        [item.item_name, item.sku, item.qty_on_hand || 0, req.user.userId]
      );
      imported++;
    }
    res.json({ success: true, imported });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// WEEKLY REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════

router.get('/weekly-requirements', async (req, res, next) => {
  try {
    const { week_start, weeks = 5 } = req.query;
    const startDate = week_start || new Date().toISOString().split('T')[0];
    const results = [];

    for (let w = 0; w < parseInt(weeks); w++) {
      const wStart = new Date(startDate);
      wStart.setDate(wStart.getDate() + w * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);
      const wStartStr = wStart.toISOString().split('T')[0];
      const wEndStr = wEnd.toISOString().split('T')[0];

      const [items] = await pool.query(
        `SELECT l.lesson_name, ct.class_type_name,
                COUNT(*) AS session_count,
                SUM(CASE WHEN prog.number_enrolled > 20 THEN 1 ELSE 0 END) AS for_20_count,
                SUM(CASE WHEN prog.number_enrolled <= 20 OR prog.number_enrolled IS NULL THEN 1 ELSE 0 END) AS standard_count
         FROM session s
         JOIN program prog ON prog.id = s.program_id AND prog.active = 1 AND prog.live = 1
         JOIN class_status cs ON cs.id = prog.class_status_id AND cs.confirmed = 1
         JOIN lesson l ON l.id = s.lesson_id
         LEFT JOIN class cl ON cl.id = prog.class_id
         LEFT JOIN class_type ct ON ct.id = cl.class_type_id
         WHERE s.active = 1 AND s.session_date BETWEEN ? AND ?
           AND (cl.class_type_id IS NULL OR cl.class_type_id != 3)
         GROUP BY l.lesson_name, ct.class_type_name
         ORDER BY ct.class_type_name, l.lesson_name`,
        [wStartStr, wEndStr]
      );

      results.push({ week_start: wStartStr, week_end: wEndStr, items });
    }

    // Get current stock
    const [stock] = await pool.query('SELECT item_name, qty_on_hand FROM stock_level');
    const stockMap = {};
    stock.forEach(s => { stockMap[s.item_name.toLowerCase()] = s.qty_on_hand; });

    res.json({ success: true, data: { weeks: results, stock: stockMap } });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// BINS
// ═══════════════════════════════════════════════════════════════════

router.get('/bins/professor/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT hb.*, b.bin_name FROM has_bin hb JOIN bin b ON b.id = hb.bin_id
       WHERE hb.professor_id = ? AND hb.active = 1`, [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/bins', async (req, res, next) => {
  try {
    const { professor_id, bin_id, bin_number, comment } = req.body;
    if (!professor_id || !bin_id || !bin_number) return res.status(400).json({ success: false, error: 'Professor, bin type, and number required' });

    // Check if this bin number is already assigned to someone else
    const [existing] = await pool.query(
      'SELECT hb.id, CONCAT(p.professor_nickname, " ", p.last_name) AS professor_name FROM has_bin hb JOIN professor p ON p.id = hb.professor_id WHERE hb.bin_id = ? AND hb.bin_number = ? AND hb.active = 1',
      [bin_id, bin_number]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: `Bin #${bin_number} is already assigned to ${existing[0].professor_name}`, current_holder: existing[0] });
    }

    const [result] = await pool.query(
      'INSERT INTO has_bin (professor_id, bin_id, bin_number, comment, active) VALUES (?, ?, ?, ?, 1)',
      [professor_id, bin_id, bin_number, comment || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// POST /api/materials/bins/transfer — transfer a bin from one professor to another
router.post('/bins/transfer', async (req, res, next) => {
  try {
    const { has_bin_id, to_professor_id, comment } = req.body;
    if (!has_bin_id || !to_professor_id) return res.status(400).json({ success: false, error: 'Bin assignment and target professor required' });

    const [[bin]] = await pool.query('SELECT * FROM has_bin WHERE id = ? AND active = 1', [has_bin_id]);
    if (!bin) return res.status(404).json({ success: false, error: 'Bin assignment not found' });

    // Deactivate old assignment
    await pool.query('UPDATE has_bin SET active = 0 WHERE id = ?', [has_bin_id]);

    // Create new assignment
    const [result] = await pool.query(
      'INSERT INTO has_bin (professor_id, bin_id, bin_number, comment, active) VALUES (?, ?, ?, ?, 1)',
      [to_professor_id, bin.bin_id, bin.bin_number, comment || `Transferred from professor #${bin.professor_id}`]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// GET /api/materials/bins/check — check if a bin number is available
router.get('/bins/check', async (req, res, next) => {
  try {
    const { bin_id, bin_number } = req.query;
    const [existing] = await pool.query(
      'SELECT hb.id, CONCAT(p.professor_nickname, " ", p.last_name) AS professor_name, p.id AS professor_id FROM has_bin hb JOIN professor p ON p.id = hb.professor_id WHERE hb.bin_id = ? AND hb.bin_number = ? AND hb.active = 1',
      [bin_id, bin_number]
    );
    res.json({ success: true, available: existing.length === 0, current_holder: existing[0] || null });
  } catch (err) { next(err); }
});

router.patch('/bins/:id', async (req, res, next) => {
  try {
    const { bin_number, comment, active } = req.body;
    const sets = []; const vals = [];
    if (bin_number !== undefined) { sets.push('bin_number = ?'); vals.push(bin_number); }
    if (comment !== undefined) { sets.push('comment = ?'); vals.push(comment); }
    if (active !== undefined) { sets.push('active = ?'); vals.push(active); }
    if (sets.length) {
      await pool.query(`UPDATE has_bin SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/bins/lookup', async (req, res, next) => {
  try {
    const { type, number, professor_id } = req.query;
    if (professor_id) {
      const [rows] = await pool.query(
        `SELECT hb.*, b.bin_name, CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name
         FROM has_bin hb JOIN bin b ON b.id = hb.bin_id JOIN professor p ON p.id = hb.professor_id
         WHERE hb.professor_id = ? AND hb.active = 1`, [professor_id]
      );
      return res.json({ success: true, data: rows });
    }
    if (type && number) {
      const [rows] = await pool.query(
        `SELECT hb.*, b.bin_name, CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name
         FROM has_bin hb JOIN bin b ON b.id = hb.bin_id JOIN professor p ON p.id = hb.professor_id
         WHERE b.bin_name LIKE ? AND hb.bin_number = ? AND hb.active = 1`, [`%${type}%`, number]
      );
      return res.json({ success: true, data: rows });
    }
    res.status(400).json({ success: false, error: 'Provide type+number or professor_id' });
  } catch (err) { next(err); }
});

// Bin types list
router.get('/bin-types', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM bin WHERE active = 1 ORDER BY bin_name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// TRACKING IMPORT
// ═══════════════════════════════════════════════════════════════════

router.post('/tracking/import', async (req, res, next) => {
  try {
    const { rows } = req.body; // [{OrderNumber, TrackingNumber}]
    if (!Array.isArray(rows)) return res.status(400).json({ success: false, error: 'Rows array required' });
    let matched = 0, unmatched = 0;
    const unmatchedOrders = [];
    for (const row of rows) {
      if (!row.OrderNumber || !row.TrackingNumber) continue;
      const [result] = await pool.query(
        'UPDATE shipment_order SET tracking_number = ?, tracking_imported_at = NOW() WHERE order_name = ? AND tracking_number IS NULL',
        [row.TrackingNumber, row.OrderNumber]
      );
      if (result.affectedRows > 0) matched++;
      else { unmatched++; unmatchedOrders.push(row.OrderNumber); }
    }
    res.json({ success: true, matched, unmatched, unmatchedOrders });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// EXCLUSION RULES
// ═══════════════════════════════════════════════════════════════════

router.get('/exclusion-rules', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ser.*, ct.class_type_name FROM shipment_exclusion_rule ser
       LEFT JOIN class_type ct ON ct.id = ser.class_type_id
       ORDER BY ser.rule_name`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// PARTY KIT TYPES
// ═══════════════════════════════════════════════════════════════════

router.get('/party-kit-types', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM party_kit_type WHERE active = 1 ORDER BY kit_name');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/party-kit-types', async (req, res, next) => {
  try {
    const { kit_name, event_type, sku, description } = req.body;
    const [result] = await pool.query(
      'INSERT INTO party_kit_type (kit_name, event_type, sku, description) VALUES (?, ?, ?, ?)',
      [kit_name, event_type || 'party', sku || null, description || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// LESSON SKU MAPPER
// ═══════════════════════════════════════════════════════════════════

router.get('/lesson-skus', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, lesson_name, sku, sku_for_20 FROM lesson WHERE active = 1 ORDER BY lesson_name'
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.patch('/lesson-skus/:id', async (req, res, next) => {
  try {
    const { sku, sku_for_20 } = req.body;
    const sets = []; const vals = [];
    if (sku !== undefined) { sets.push('sku = ?'); vals.push(sku || null); }
    if (sku_for_20 !== undefined) { sets.push('sku_for_20 = ?'); vals.push(sku_for_20 || null); }
    if (sets.length) {
      await pool.query(`UPDATE lesson SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// CLASS ID CARD CONFIG
// ═══════════════════════════════════════════════════════════════════

router.get('/class-id-cards', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT c.id, c.class_name, c.class_code, c.has_id_card, ct.class_type_name FROM class c LEFT JOIN class_type ct ON ct.id = c.class_type_id WHERE c.active = 1 ORDER BY ct.class_type_name, c.class_name'
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.patch('/class-id-cards/:id', async (req, res, next) => {
  try {
    const { has_id_card } = req.body;
    await pool.query('UPDATE class SET has_id_card = ? WHERE id = ?', [has_id_card ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// AREA SHIPPING CONFIG
// ═══════════════════════════════════════════════════════════════════

router.get('/area-shipping', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, geographic_area_name, shipping_lead_days FROM geographic_area WHERE active = 1 ORDER BY geographic_area_name'
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.patch('/area-shipping/:id', async (req, res, next) => {
  try {
    const { shipping_lead_days } = req.body;
    if (shipping_lead_days == null || shipping_lead_days < 1) {
      return res.status(400).json({ success: false, error: 'shipping_lead_days must be >= 1' });
    }
    await pool.query('UPDATE geographic_area SET shipping_lead_days = ? WHERE id = ?',
      [shipping_lead_days, req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
