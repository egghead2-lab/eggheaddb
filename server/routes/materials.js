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
    const { cycle_type, start_date, end_date, ship_date, approval_date, notes } = req.body;
    if (!cycle_type || !start_date || !end_date || !ship_date) {
      return res.status(400).json({ success: false, error: 'Type, start, end, and ship dates required' });
    }
    // Check no other draft/approved cycle of same type
    const [existing] = await pool.query(
      "SELECT id FROM shipment_cycle WHERE cycle_type = ? AND status IN ('draft','approved')", [cycle_type]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: `An active ${cycle_type} cycle already exists` });
    }
    const [result] = await pool.query(
      'INSERT INTO shipment_cycle (cycle_type, start_date, end_date, ship_date, approval_date, notes, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cycle_type, start_date, end_date, ship_date, approval_date || null, notes || null, req.user.userId]
    );
    res.json({ success: true, id: result.insertId });
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

// POST /api/materials/cycles/:id/generate-orders — the big one
router.post('/cycles/:id/generate-orders', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[cycle]] = await pool.query('SELECT * FROM shipment_cycle WHERE id = ?', [id]);
    if (!cycle) return res.status(404).json({ success: false, error: 'Cycle not found' });
    if (cycle.status !== 'draft') return res.status(400).json({ success: false, error: 'Cycle must be in draft status' });

    const cycleStart = cycle.start_date;
    const cycleEnd = cycle.end_date;
    const source = cycle.cycle_type === 'mid_cycle' ? 'mid_cycle' : 'standard_cycle';

    // Load exclusion rules
    const [exclusionRules] = await pool.query('SELECT * FROM shipment_exclusion_rule WHERE active = 1');
    const roboticsSkipTypeId = exclusionRules.find(r => r.rule_type === 'class_type_skip')?.class_type_id;
    const minWeeksStart = exclusionRules.find(r => r.rule_type === 'min_weeks_id_card')?.min_weeks || 4;
    const minWeeksDegree = exclusionRules.find(r => r.rule_type === 'min_weeks_degree')?.min_weeks || 4;

    // Query qualifying programs
    const [programs] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.lead_professor_id, prog.number_enrolled,
              prog.session_count, prog.first_session_date, prog.last_session_date, prog.class_length_minutes,
              cl.class_name, cl.class_type_id, cl.has_id_card,
              ct.class_type_name,
              cs.confirmed
       FROM program prog
       JOIN class cl ON cl.id = prog.class_id
       JOIN class_type ct ON ct.id = cl.class_type_id
       JOIN class_status cs ON cs.id = prog.class_status_id
       WHERE prog.active = 1 AND prog.live = 1 AND cs.confirmed = 1
         AND prog.lead_professor_id IS NOT NULL
         AND prog.party_format_id IS NULL
         AND EXISTS (
           SELECT 1 FROM session s
           WHERE s.program_id = prog.id AND s.active = 1
             AND s.session_date BETWEEN ? AND ?
         )`,
      [cycleStart, cycleEnd]
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

    // Bin type mapping: class_type_id -> bin_type_id
    // Science=1->1, Engineering=2->2(Eng Bin), Robotics=3->3, Financial=5->? (we'll use a mapping)
    const classTypeToBin = { 1: 1, 2: 2, 3: 3, 5: null }; // No specific bin for financial literacy yet

    // Group programs by professor
    const byProfessor = {};
    for (const prog of programs) {
      if (!byProfessor[prog.lead_professor_id]) byProfessor[prog.lead_professor_id] = [];
      byProfessor[prog.lead_professor_id].push(prog);
    }

    // Clear existing orders for this cycle (regenerate)
    await pool.query('DELETE FROM shipment_order WHERE cycle_id = ?', [id]);

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

    res.json({ success: true, ordersCreated, linesCreated, warnings, programCount: programs.length });
  } catch (err) { next(err); }
});

// GET /api/materials/cycles/:id/export-csv — Inflow CSV export
router.get('/cycles/:id/export-csv', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[cycle]] = await pool.query('SELECT * FROM shipment_cycle WHERE id = ?', [id]);
    if (!cycle) return res.status(404).json({ success: false, error: 'Cycle not found' });

    const [orders] = await pool.query(
      `SELECT so.*, p.professor_nickname, p.first_name, p.last_name, p.email, p.phone_number, p.address,
              c.city_name, c.zip_code, s.state_name,
              ga.geographic_area_name AS area
       FROM shipment_order so
       JOIN professor p ON p.id = so.professor_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN state s ON s.id = c.state_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       WHERE so.cycle_id = ? AND so.status != 'cancelled'
       ORDER BY p.professor_nickname`, [id]
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
// MARK SHIPPED
// ═══════════════════════════════════════════════════════════════════

router.patch('/orders/:id/ship', async (req, res, next) => {
  try {
    const { inflow_order_number, bin_number_entries } = req.body;
    await pool.query(
      'UPDATE shipment_order SET status = ?, shipped_at = NOW(), shipped_by_user_id = ?, inflow_order_number = ? WHERE id = ?',
      ['shipped', req.user.userId, inflow_order_number || null, req.params.id]
    );

    // Update professor bins if provided
    if (bin_number_entries && Array.isArray(bin_number_entries)) {
      for (const entry of bin_number_entries) {
        if (entry.bin_id && entry.bin_number) {
          const [[order]] = await pool.query('SELECT professor_id FROM shipment_order WHERE id = ?', [req.params.id]);
          if (order) {
            await pool.query(
              'INSERT INTO has_bin (professor_id, bin_id, bin_number, active) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE bin_number = VALUES(bin_number), active = 1',
              [order.professor_id, entry.bin_id, entry.bin_number]
            );
          }
        }
      }
    }

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
// RESOLUTIONS
// ═══════════════════════════════════════════════════════════════════

router.get('/resolutions', async (req, res, next) => {
  try {
    const { cycle_id, area_id } = req.query;
    let where = 'WHERE sol.skip_flag = 0';
    const params = [];
    if (cycle_id) { where += ' AND so.cycle_id = ?'; params.push(cycle_id); }
    if (area_id) { where += ' AND ga.id = ?'; params.push(area_id); }

    const [rows] = await pool.query(
      `SELECT sol.*, so.order_name, so.professor_id,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              ga.geographic_area_name AS area,
              sr.id AS resolution_id, sr.resolution, sr.quantity_resolved, sr.notes AS resolution_notes
       FROM shipment_order_line sol
       JOIN shipment_order so ON so.id = sol.order_id
       JOIN professor p ON p.id = so.professor_id
       LEFT JOIN city c ON c.id = p.city_id
       LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
       LEFT JOIN shipment_resolution sr ON sr.order_line_id = sol.id
       ${where} AND sol.source = 'mid_cycle' AND sol.quantity = 0
       ORDER BY ga.geographic_area_name, p.professor_nickname`, params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/resolutions', async (req, res, next) => {
  try {
    const { order_line_id, resolution, quantity_resolved, notes } = req.body;
    if (!order_line_id || !resolution) return res.status(400).json({ success: false, error: 'Line and resolution required' });
    await pool.query(
      'INSERT INTO shipment_resolution (order_line_id, resolution, quantity_resolved, notes, resolved_by_user_id) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE resolution = VALUES(resolution), quantity_resolved = VALUES(quantity_resolved), notes = VALUES(notes), resolved_by_user_id = VALUES(resolved_by_user_id), resolved_at = NOW()',
      [order_line_id, resolution, quantity_resolved || null, notes || null, req.user.userId]
    );
    res.json({ success: true });
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
           AND prog.party_format_id IS NULL
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
    const [result] = await pool.query(
      'INSERT INTO has_bin (professor_id, bin_id, bin_number, comment, active) VALUES (?, ?, ?, ?, 1)',
      [professor_id, bin_id, bin_number, comment || null]
    );
    res.json({ success: true, id: result.insertId });
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

module.exports = router;
