const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ============================================================
// HELPERS
// ============================================================

// Get effective invoice type for a location
async function getEffectiveInvoiceType(locationId) {
  const [[loc]] = await pool.query(
    `SELECT l.invoice_type AS loc_type, l.contractor_id,
            c.invoice_type AS con_type, c.invoice_per_location
     FROM location l
     LEFT JOIN contractor c ON c.id = l.contractor_id
     WHERE l.id = ?`,
    [locationId]
  );
  if (!loc) return null;
  if (!loc.contractor_id) return { type: loc.loc_type, per_location: false };
  if (!loc.con_type) return { type: null, error: 'Set invoice type on contractor first' };
  return { type: loc.con_type, per_location: !!loc.invoice_per_location };
}

// Get last QB invoice number from system_setting
async function getLastQbInvoiceNumber() {
  const [[row]] = await pool.query("SELECT setting_value FROM system_setting WHERE setting_key = 'last_qb_invoice_number'");
  return row ? parseInt(row.setting_value) || 0 : 0;
}

// ============================================================
// INVOICE QUEUE (Non-Monthly)
// ============================================================

router.get('/queue', authenticate, async (req, res, next) => {
  try {
    const { contractor_id, location_id, invoice_type, status } = req.query;

    // Get all non-monthly programs that are active, live, not cancelled
    let where = `prog.active = 1 AND prog.live = 1
      AND cs.cancelled = 0`;
    const params = [];

    if (contractor_id) { where += ' AND loc.contractor_id = ?'; params.push(contractor_id); }
    if (location_id) { where += ' AND prog.location_id = ?'; params.push(location_id); }

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.last_session_date,
              prog.session_count, prog.number_enrolled, prog.parent_cost, prog.our_cut, prog.lab_fee,
              prog.invoice_date_sent, prog.invoice_paid, prog.invoice_notes, prog.invoice_needed,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              loc.class_pricing_type_id, prog.payment_through_us,
              loc.id AS location_id, loc.nickname AS location_nickname, loc.school_name,
              loc.contractor_id, loc.invoice_type AS loc_invoice_type,
              con.contractor_name, con.invoice_type AS con_invoice_type, con.invoice_per_location,
              cs.class_status_name,
              cpt.class_pricing_type_name,
              pt.program_type_name,
              cl.formal_class_name,
              (SELECT s2.session_date FROM session s2 WHERE s2.program_id = prog.id AND s2.active = 1
               ORDER BY s2.session_date ASC LIMIT 1 OFFSET 1) AS second_session_date,
              (SELECT MAX(s3.session_date) FROM session s3 WHERE s3.program_id = prog.id AND s3.active = 1) AS actual_last_date,
              (SELECT COUNT(*) FROM session s4 WHERE s4.program_id = prog.id AND s4.active = 1
               AND s4.session_date <= CURDATE()) AS sessions_completed,
              (SELECT COUNT(*) FROM session s5 WHERE s5.program_id = prog.id AND s5.active = 1
               AND s5.not_billed = 0) AS billable_sessions,
              (SELECT GROUP_CONCAT(DATE_FORMAT(s6.session_date, '%m/%d') ORDER BY s6.session_date SEPARATOR ', ')
               FROM session s6 WHERE s6.program_id = prog.id AND s6.active = 1 AND s6.not_billed = 0) AS billable_date_list,
              prog.grade_range
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN contractor con ON con.id = loc.contractor_id
       LEFT JOIN class_pricing_type cpt ON cpt.id = loc.class_pricing_type_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       WHERE ${where}
       ORDER BY prog.last_session_date ASC, con.contractor_name, loc.nickname`,
      params
    );

    // Compute effective invoice type and trigger status for each
    const today = new Date().toISOString().split('T')[0];
    const data = rows.map(r => {
      // Default to '2nd Week' if no invoice type is set anywhere
      const missingInvoiceType = !r.con_invoice_type && !r.loc_invoice_type;
      const effectiveType = r.contractor_id
        ? (r.con_invoice_type || r.loc_invoice_type || '2nd Week')
        : (r.loc_invoice_type || '2nd Week');
      if (effectiveType === 'Monthly') return null; // skip monthly — handled in monthly tool

      const secondDate = r.second_session_date ? r.second_session_date.toISOString().split('T')[0] : null;
      const lastDate = r.actual_last_date ? r.actual_last_date.toISOString().split('T')[0] : null;

      let triggered = false;
      if (effectiveType === '2nd Week' && secondDate && secondDate <= today) triggered = true;
      if (effectiveType === 'After Last Class' && lastDate && lastDate < today) triggered = true;

      const alreadyInvoiced = !!r.invoice_date_sent;
      let rowStatus = alreadyInvoiced ? 'Invoiced' : triggered ? 'Ready' : 'Pending';

      // Calculate total — use billable sessions (excluding not_billed)
      const billableSessions = r.billable_sessions || 0;
      const ourCut = parseFloat(r.our_cut) || 0;
      const enrolled = r.number_enrolled || 0;
      const labFeePerUnit = parseFloat(r.lab_fee) || 0;
      let lineAmount = 0;
      let weeklyRate = 0;
      let labFeeTotal = 0;
      if (r.class_pricing_type_name === 'Flat Fee') {
        lineAmount = ourCut;
        weeklyRate = billableSessions > 0 ? ourCut / billableSessions : ourCut;
        labFeeTotal = labFeePerUnit;
      } else {
        // Per student: our_cut is per-student rate, multiply by enrolled
        lineAmount = ourCut * enrolled;
        weeklyRate = ourCut;
        // Lab fee also per student
        labFeeTotal = labFeePerUnit * enrolled;
      }

      const grades = r.grade_range || '';

      // Day of week from program flags
      const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      const dayFlags = [r.monday, r.tuesday, r.wednesday, r.thursday, r.friday, r.saturday, r.sunday];
      const days = dayNames.filter((_, i) => dayFlags[i]).join(', ');

      // Build text-for-invoice: "Location: Grade X - Class Name, Day: M/D, M/D, ... (N dates)"
      const locationPart = r.school_name || r.location_nickname || '';
      const gradePart = grades ? `Grade ${grades}` : '';
      const header = [locationPart, gradePart].filter(Boolean).join(': ');
      const className = r.formal_class_name || r.program_nickname || '';
      const datesPart = r.billable_date_list || '';
      const countPart = billableSessions > 0 ? `(${billableSessions} date${billableSessions !== 1 ? 's' : ''})` : '';
      const textForInvoice = `${header} - ${className}${days ? ', ' + days : ''}: ${datesPart} ${countPart}`.trim();

      // Map program type to QB product name
      const typeMap = {
        'Science': 'Enrichment Classes:Science Class',
        'Engineering': 'Enrichment Classes:Engineering Class',
        'Robotics': 'Enrichment Classes:Robotics Class',
        'Financial Literacy': 'Enrichment Classes: Financial Literacy Class',
      };
      const qbItemName = typeMap[r.program_type_name] || 'Enrichment Classes:Science Class';

      return {
        ...r, effective_invoice_type: effectiveType, triggered, status: rowStatus,
        missing_invoice_type: missingInvoiceType,
        line_amount: lineAmount, lab_fee_total: labFeeTotal, weekly_rate: weeklyRate,
        total: lineAmount + labFeeTotal, text_for_invoice: textForInvoice, qb_item_name: qbItemName,
        grades, days, billable_sessions: billableSessions,
      };
    }).filter(Boolean);

    // Filter by invoice_type if specified
    let filtered = data;
    if (invoice_type) filtered = filtered.filter(r => r.effective_invoice_type === invoice_type);
    if (status === 'Ready') filtered = filtered.filter(r => r.status === 'Ready');
    else if (status === 'Pending') filtered = filtered.filter(r => r.status === 'Pending' || r.status === 'Ready');
    else if (status !== 'All') filtered = filtered.filter(r => r.status !== 'Invoiced');

    const lastQb = await getLastQbInvoiceNumber();
    res.json({ success: true, data: filtered, lastQbInvoice: lastQb });
  } catch (err) { next(err); }
});

// PUT /api/invoicing/set-invoice-type — set invoice type on location or contractor from queue
router.put('/set-invoice-type', authenticate, async (req, res, next) => {
  try {
    const { location_id, contractor_id, invoice_type } = req.body;
    if (!invoice_type) return res.status(400).json({ success: false, error: 'invoice_type required' });

    if (contractor_id) {
      await pool.query('UPDATE contractor SET invoice_type = ? WHERE id = ?', [invoice_type, contractor_id]);
    } else if (location_id) {
      await pool.query('UPDATE location SET invoice_type = ? WHERE id = ?', [invoice_type, location_id]);
    } else {
      return res.status(400).json({ success: false, error: 'location_id or contractor_id required' });
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/invoicing/queue/siblings/:programId — other programs at same contractor for grouping
router.get('/queue/siblings/:programId', authenticate, async (req, res, next) => {
  try {
    const [[prog]] = await pool.query(
      `SELECT prog.location_id, loc.contractor_id, con.invoice_per_location
       FROM program prog
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN contractor con ON con.id = loc.contractor_id
       WHERE prog.id = ?`,
      [req.params.programId]
    );
    if (!prog || !prog.contractor_id) return res.json({ success: true, data: [] });

    let scopeWhere = prog.invoice_per_location
      ? 'prog.location_id = ?'
      : 'loc.contractor_id = ?';
    const scopeId = prog.invoice_per_location ? prog.location_id : prog.contractor_id;

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.last_session_date, prog.our_cut, prog.number_enrolled,
              prog.lab_fee, loc.class_pricing_type_id, prog.invoice_date_sent,
              cpt.class_pricing_type_name,
              (SELECT MAX(s2.session_date) FROM session s2 WHERE s2.program_id = prog.id AND s2.active = 1) AS actual_last_date
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class_pricing_type cpt ON cpt.id = loc.class_pricing_type_id
       WHERE prog.active = 1 AND prog.live = 1 AND ${scopeWhere}
         AND prog.id != ? AND prog.invoice_date_sent IS NULL
       ORDER BY prog.last_session_date ASC`,
      [scopeId, req.params.programId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ============================================================
// MONTHLY INVOICING
// ============================================================

router.get('/monthly', authenticate, async (req, res, next) => {
  try {
    const { start_date, end_date, contractor_id } = req.query;
    if (!start_date || !end_date) return res.status(400).json({ success: false, error: 'Start and end date required' });

    let conWhere = '';
    const params = [start_date, end_date, start_date, end_date];
    if (contractor_id) { conWhere = ' AND loc.contractor_id = ?'; params.push(contractor_id); }

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.our_cut, prog.lab_fee, prog.number_enrolled,
              prog.first_session_date, prog.last_session_date, loc.class_pricing_type_id,
              prog.invoice_date_sent, prog.invoice_notes, prog.payment_through_us,
              loc.id AS location_id, loc.nickname AS location_nickname, loc.school_name,
              loc.contractor_id,
              con.contractor_name, con.invoice_per_location,
              cpt.class_pricing_type_name,
              pt.program_type_name,
              (SELECT COUNT(*) FROM session s2 WHERE s2.program_id = prog.id AND s2.active = 1
               AND s2.not_billed = 0 AND s2.session_date BETWEEN ? AND ?) AS dates_in_period,
              (SELECT GROUP_CONCAT(DATE_FORMAT(s3.session_date, '%m/%d') ORDER BY s3.session_date SEPARATOR ', ')
               FROM session s3 WHERE s3.program_id = prog.id AND s3.active = 1
               AND s3.not_billed = 0 AND s3.session_date BETWEEN ? AND ?) AS date_list,
              prog.grade_range,
              cl.formal_class_name
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name NOT LIKE 'Cancelled%'
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN contractor con ON con.id = loc.contractor_id AND con.active = 1
       LEFT JOIN class_pricing_type cpt ON cpt.id = loc.class_pricing_type_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       WHERE prog.active = 1 AND prog.live = 1
         AND con.invoice_type = 'Monthly'
         ${conWhere}
       HAVING dates_in_period > 0
       ORDER BY con.contractor_name, loc.nickname, prog.program_nickname`,
      params
    );

    // Calculate amounts per program
    const typeMap = {
      'Science': 'Enrichment Classes:Science Class',
      'Engineering': 'Enrichment Classes:Engineering Class',
      'Robotics': 'Enrichment Classes:Robotics Class',
      'Financial Literacy': 'Enrichment Classes: Financial Literacy Class',
    };

    const data = rows.map(r => {
      const ourCut = parseFloat(r.our_cut) || 0;
      // Weekly rate = total cost / total billable sessions for the program
      // For monthly, we bill: weekly_rate × dates_in_period
      const datesInPeriod = r.dates_in_period || 0;
      const amount = ourCut * datesInPeriod;
      const labFee = parseFloat(r.lab_fee) || 0;
      const qbItemName = typeMap[r.program_type_name] || 'Enrichment Classes:Science Class';

      const textForInvoice = [
        r.school_name || r.location_nickname || '',
        r.grade_range ? `Grades ${r.grade_range}` : '',
        r.formal_class_name || '',
        r.date_list ? `Dates: ${r.date_list}` : '',
        datesInPeriod > 0 ? `${datesInPeriod} sessions` : '',
      ].filter(Boolean).join(' - ');

      return { ...r, weekly_rate: ourCut, invoice_amount: amount, lab_fee_total: labFee,
               qb_item_name: qbItemName, text_for_invoice: textForInvoice };
    });

    // Group by contractor (or location if per_location)
    const groups = {};
    data.forEach(r => {
      const key = r.invoice_per_location ? `loc_${r.location_id}` : `con_${r.contractor_id}`;
      if (!groups[key]) {
        groups[key] = {
          contractor_id: r.contractor_id,
          contractor_name: r.contractor_name,
          location_id: r.invoice_per_location ? r.location_id : null,
          location_name: r.invoice_per_location ? (r.school_name || r.location_nickname) : null,
          customer_name: r.invoice_per_location ? (r.school_name || r.location_nickname) : r.contractor_name,
          programs: [],
          total: 0,
        };
      }
      groups[key].programs.push(r);
      groups[key].total += r.invoice_amount + r.lab_fee_total;
    });

    const lastQb = await getLastQbInvoiceNumber();
    res.json({ success: true, data: Object.values(groups), lastQbInvoice: lastQb });
  } catch (err) { next(err); }
});

// ============================================================
// GENERATE INVOICE (shared for monthly and non-monthly)
// ============================================================

router.post('/generate', authenticate, async (req, res, next) => {
  try {
    const { invoice_number, invoice_type, contractor_id, location_id, billing_month,
            billing_period_start, billing_period_end, invoice_date, due_date, memo,
            customer_name, total_amount, qb_invoice_number, programs, charge_lab_fees } = req.body;

    if (!invoice_number || !invoice_date || !due_date || !customer_name || !programs?.length) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Create invoice record
      const [result] = await conn.query(
        `INSERT INTO invoice_record (invoice_number, invoice_type, contractor_id, location_id,
          billing_month, billing_period_start, billing_period_end, invoice_date, due_date,
          memo, customer_name, total_amount, qb_invoice_number, created_by_user_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [invoice_number, invoice_type, contractor_id || null, location_id || null,
         billing_month || null, billing_period_start || null, billing_period_end || null,
         invoice_date, due_date, memo || null, customer_name, total_amount,
         qb_invoice_number || null, req.user.userId]
      );
      const invoiceId = result.insertId;

      // Add programs
      for (const p of programs) {
        await conn.query(
          `INSERT INTO invoice_record_program (invoice_record_id, program_id, line_amount, include_lab_fee, lab_fee_amount, status, notes)
           VALUES (?,?,?,?,?,?,?)`,
          [invoiceId, p.program_id, p.line_amount, charge_lab_fees ? 1 : 0,
           charge_lab_fees ? (p.lab_fee_amount || 0) : 0, p.status || 'completed', p.notes || null]
        );

        // Mark program as invoiced
        await conn.query(
          'UPDATE program SET invoice_date_sent = ?, ts_updated = NOW() WHERE id = ?',
          [invoice_date, p.program_id]
        );
      }

      // Update last QB invoice number
      if (qb_invoice_number) {
        await conn.query(
          `INSERT INTO system_setting (setting_key, setting_value, ts_updated) VALUES ('last_qb_invoice_number', ?, NOW())
           ON DUPLICATE KEY UPDATE setting_value = ?, ts_updated = NOW()`,
          [String(qb_invoice_number), String(qb_invoice_number)]
        );
      }

      await conn.commit();
      res.json({ success: true, id: invoiceId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) { next(err); }
});

// ============================================================
// INVOICE TRACKER
// ============================================================

router.get('/tracker', authenticate, async (req, res, next) => {
  try {
    const { contractor_id, location_id, paid_status, date_before } = req.query;
    let where = 'ir.active = 1';
    const params = [];
    if (contractor_id) { where += ' AND ir.contractor_id = ?'; params.push(contractor_id); }
    if (location_id) { where += ' AND ir.location_id = ?'; params.push(location_id); }
    if (paid_status === 'Unpaid') where += ' AND ir.amount_paid = 0';
    else if (paid_status === 'Partial') where += ' AND ir.amount_paid > 0 AND ir.amount_paid < ir.total_amount';
    else if (paid_status === 'Paid') where += ' AND ir.is_paid = 1';
    if (date_before) { where += ' AND ir.invoice_date <= ?'; params.push(date_before); }

    const [rows] = await pool.query(
      `SELECT ir.*,
              con.contractor_name,
              loc.nickname AS location_nickname,
              CONCAT(u.first_name, ' ', u.last_name) AS created_by_name,
              (SELECT COUNT(*) FROM invoice_record_program irp WHERE irp.invoice_record_id = ir.id) AS program_count
       FROM invoice_record ir
       LEFT JOIN contractor con ON con.id = ir.contractor_id
       LEFT JOIN location loc ON loc.id = ir.location_id
       LEFT JOIN user u ON u.id = ir.created_by_user_id
       WHERE ${where}
       ORDER BY ir.invoice_date DESC`,
      params
    );

    const totalInvoiced = rows.reduce((s, r) => s + parseFloat(r.total_amount), 0);
    const totalReceived = rows.reduce((s, r) => s + parseFloat(r.amount_paid), 0);

    res.json({ success: true, data: rows, summary: { totalInvoiced, totalReceived, outstanding: totalInvoiced - totalReceived } });
  } catch (err) { next(err); }
});

// GET /api/invoicing/tracker/:id/programs — programs on an invoice
router.get('/tracker/:id/programs', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT irp.*, prog.program_nickname, loc.nickname AS location_nickname
       FROM invoice_record_program irp
       JOIN program prog ON prog.id = irp.program_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       WHERE irp.invoice_record_id = ?`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/invoicing/tracker/:id/payments — payments on an invoice
router.get('/tracker/:id/payments', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ip.*, CONCAT(u.first_name, ' ', u.last_name) AS recorded_by_name
       FROM invoice_payment ip
       LEFT JOIN user u ON u.id = ip.recorded_by_user_id
       WHERE ip.invoice_record_id = ?
       ORDER BY ip.payment_date DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/invoicing/tracker/:id/payment — record a payment
router.post('/tracker/:id/payment', authenticate, async (req, res, next) => {
  try {
    const { payment_date, amount, payment_notes } = req.body;
    if (!payment_date || !amount) return res.status(400).json({ success: false, error: 'Date and amount required' });

    await pool.query(
      `INSERT INTO invoice_payment (invoice_record_id, payment_date, amount, payment_notes, recorded_by_user_id)
       VALUES (?,?,?,?,?)`,
      [req.params.id, payment_date, amount, payment_notes || null, req.user.userId]
    );

    // Recalculate total paid
    const [[totals]] = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM invoice_payment WHERE invoice_record_id = ?',
      [req.params.id]
    );
    const [[invoice]] = await pool.query('SELECT total_amount FROM invoice_record WHERE id = ?', [req.params.id]);
    const isPaid = parseFloat(totals.total_paid) >= parseFloat(invoice.total_amount);

    await pool.query(
      'UPDATE invoice_record SET amount_paid = ?, is_paid = ?, ts_updated = NOW() WHERE id = ?',
      [totals.total_paid, isPaid ? 1 : 0, req.params.id]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// INVOICE RECORD (historical log)
// ============================================================

router.get('/records', authenticate, async (req, res, next) => {
  try {
    const { contractor_id, location_id, invoice_type, month, paid_status } = req.query;
    let where = 'ir.active = 1';
    const params = [];
    if (contractor_id) { where += ' AND ir.contractor_id = ?'; params.push(contractor_id); }
    if (location_id) { where += ' AND ir.location_id = ?'; params.push(location_id); }
    if (invoice_type) { where += ' AND ir.invoice_type = ?'; params.push(invoice_type); }
    if (month) { where += ' AND ir.billing_month = ?'; params.push(month); }
    if (paid_status === 'Paid') where += ' AND ir.is_paid = 1';
    else if (paid_status === 'Unpaid') where += ' AND ir.is_paid = 0';

    const [rows] = await pool.query(
      `SELECT ir.*,
              con.contractor_name,
              loc.nickname AS location_nickname,
              CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
       FROM invoice_record ir
       LEFT JOIN contractor con ON con.id = ir.contractor_id
       LEFT JOIN location loc ON loc.id = ir.location_id
       LEFT JOIN user u ON u.id = ir.created_by_user_id
       WHERE ${where}
       ORDER BY ir.invoice_date DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// PATCH /api/invoicing/records/:id — update memo/notes, void
router.patch('/records/:id', authenticate, async (req, res, next) => {
  try {
    const { memo, notes, active } = req.body;
    const fields = []; const values = [];
    if (memo !== undefined) { fields.push('memo = ?'); values.push(memo); }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes); }
    if (active !== undefined) { fields.push('active = ?'); values.push(active); }
    if (!fields.length) return res.status(400).json({ success: false, error: 'No fields' });
    values.push(req.params.id);
    await pool.query(`UPDATE invoice_record SET ${fields.join(', ')}, ts_updated = NOW() WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/invoicing/records/:id/mark-sent
router.post('/records/:id/mark-sent', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE invoice_record SET sent = 1, sent_at = CURDATE(), ts_updated = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
