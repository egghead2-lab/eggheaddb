const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const QRCode = require('qrcode');

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

// ═══════════════════════════════════════════════════════════════════
// TAB 1: CREATE STRIPE LINKS
// ═══════════════════════════════════════════════════════════════════

// GET /api/lab-fees/create-links — programs needing a Stripe payment link
router.get('/create-links', authenticate, async (req, res, next) => {
  try {
    const leadDays = parseInt(req.query.lead_days) || parseInt(process.env.LAB_FEE_LEAD_DAYS) || 15;
    const [rows] = await pool.query(
      `SELECT p.id, p.program_nickname, p.first_session_date, p.lab_fee,
              (SELECT COUNT(*) FROM program_roster pr WHERE pr.program_id = p.id
               AND pr.active = 1 AND pr.date_dropped IS NULL) AS roster_count
       FROM program p
       JOIN class_status cs ON cs.id = p.class_status_id AND cs.confirmed = 1
       LEFT JOIN location loc ON loc.id = p.location_id
       WHERE p.active = 1
         AND p.lab_fee > 0
         AND (loc.school_collects_lab_fee = 0 OR loc.school_collects_lab_fee IS NULL OR p.location_id IS NULL)
         AND p.stripe_payment_link_id IS NULL
         AND p.lab_fee_link_not_needed = 0
         AND p.first_session_date IS NOT NULL
         AND p.first_session_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY p.first_session_date ASC`,
      [leadDays]
    );
    res.json({ success: true, data: rows, lead_days: leadDays });
  } catch (err) { next(err); }
});

// POST /api/lab-fees/create-link/:id — create Stripe Payment Link for a program
router.post('/create-link/:id', authenticate, async (req, res, next) => {
  try {
    const [[program]] = await pool.query(
      'SELECT id, program_nickname, lab_fee, stripe_payment_link_id FROM program WHERE id = ?',
      [req.params.id]
    );
    if (!program) return res.status(404).json({ success: false, error: 'Program not found' });
    if (program.stripe_payment_link_id) return res.status(400).json({ success: false, error: 'Link already created' });
    if (!stripe) return res.status(503).json({ success: false, error: 'Stripe not configured — add STRIPE_SECRET_KEY to environment' });

    let price, paymentLink, qrDataUrl;
    try {
      // Create a one-time price
      price = await stripe.prices.create({
        unit_amount: Math.round(program.lab_fee * 100),
        currency: 'usd',
        product_data: { name: program.program_nickname },
      });

      // Create the payment link
      paymentLink = await stripe.paymentLinks.create({
        line_items: [{
          price: price.id,
          quantity: 1,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: 10 },
        }],
        custom_text: {
          submit: { message: 'Please submit one lab fee per child attending class or camp' },
        },
        custom_fields: [{
          key: 'studentnames',
          label: { type: 'custom', custom: 'Student name(s)' },
          type: 'text',
        }],
        metadata: {
          program_id: String(program.id),
          program_nickname: program.program_nickname,
        },
        after_completion: {
          type: 'hosted_confirmation',
          hosted_confirmation: { custom_message: 'Thank you for your lab fee payment!' },
        },
      });
    } catch (stripeErr) {
      console.error('Stripe error:', stripeErr.message);
      return res.status(500).json({ success: false, error: 'Stripe error: ' + stripeErr.message });
    }

    // Generate QR code
    qrDataUrl = await QRCode.toDataURL(paymentLink.url, { width: 300, margin: 2 });

    // Save to program
    await pool.query(
      `UPDATE program SET stripe_payment_link_id = ?, stripe_payment_link_url = ?,
       stripe_payment_link_qr_url = ?, ts_updated = NOW() WHERE id = ?`,
      [paymentLink.id, paymentLink.url, qrDataUrl, program.id]
    );

    res.json({ success: true, data: { url: paymentLink.url, qr: qrDataUrl, link_id: paymentLink.id } });
  } catch (err) { next(err); }
});

// POST /api/lab-fees/mark-not-needed/:id — mark a program's lab fee link as not needed
router.post('/mark-not-needed/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE program SET lab_fee_link_not_needed = 1, ts_updated = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/lab-fees/unmark-not-needed/:id — undo not-needed marking
router.post('/unmark-not-needed/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE program SET lab_fee_link_not_needed = 0, ts_updated = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// TAB 2: LAB FEE STATUS
// ═══════════════════════════════════════════════════════════════════

// GET /api/lab-fees/status — overview of all lab fee programs
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const showAll = req.query.show_all === '1';
    const [rows] = await pool.query(
      `SELECT p.id, p.program_nickname, p.lab_fee, p.first_session_date, p.last_session_date,
              p.stripe_payment_link_id, p.stripe_payment_link_url, p.stripe_payment_link_qr_url,
              cs.class_status_name,
              (SELECT COUNT(*) FROM program_roster pr WHERE pr.program_id = p.id
               AND pr.active = 1 AND pr.date_dropped IS NULL) AS enrolled_count,
              (SELECT COUNT(*) FROM program_roster pr WHERE pr.program_id = p.id
               AND pr.active = 1 AND pr.date_dropped IS NULL
               AND pr.lab_fee_payment_status IN ('paid_stripe', 'received')) AS paid_count
       FROM program p
       JOIN class_status cs ON cs.id = p.class_status_id AND cs.cancelled = 0
       LEFT JOIN location loc ON loc.id = p.location_id
       WHERE p.active = 1
         AND p.lab_fee > 0
         AND (loc.school_collects_lab_fee = 0 OR loc.school_collects_lab_fee IS NULL OR p.location_id IS NULL)
       ORDER BY p.first_session_date DESC`
    );

    const data = showAll ? rows : rows.filter(r => r.paid_count < r.enrolled_count || r.enrolled_count === 0);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// TAB 3: MARK PAYMENTS
// ═══════════════════════════════════════════════════════════════════

// GET /api/lab-fees/unresolved — unresolved Stripe webhook events
router.get('/unresolved', authenticate, async (req, res, next) => {
  try {
    const [events] = await pool.query(
      `SELECT e.*, p.program_nickname
       FROM lab_fee_stripe_event e
       LEFT JOIN program p ON p.id = e.program_id
       WHERE e.resolved = 0
       ORDER BY e.paid_at DESC`
    );

    // For each event, find recommended roster matches
    for (const evt of events) {
      if (!evt.program_id) { evt.recommendations = []; continue; }
      const [recs] = await pool.query(
        `SELECT pr.id AS roster_id, s.first_name, s.last_name,
                par.email AS parent_email, par.first_name AS parent_first_name, par.last_name AS parent_last_name
         FROM program_roster pr
         JOIN student s ON s.id = pr.student_id
         LEFT JOIN student_parent sp ON sp.student_id = s.id AND sp.active = 1
         LEFT JOIN parent par ON par.id = sp.parent_id AND par.active = 1
         WHERE pr.program_id = ? AND pr.active = 1 AND pr.date_dropped IS NULL
           AND pr.lab_fee_payment_status IS NULL
           AND (par.email = ? OR LOWER(CONCAT(s.first_name, ' ', s.last_name)) LIKE ?)
         GROUP BY pr.id, s.first_name, s.last_name, par.email, par.first_name, par.last_name`,
        [evt.program_id, evt.customer_email || '', `%${(evt.student_name_field || '').toLowerCase()}%`]
      );
      evt.recommendations = recs;
    }

    res.json({ success: true, data: events });
  } catch (err) { next(err); }
});

// GET /api/lab-fees/roster/:programId — roster with payment status
router.get('/roster/:programId', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT pr.id, pr.lab_fee_payment_status, pr.lab_fee_paid_date, pr.lab_fee_payment_notes,
              s.first_name, s.last_name,
              par.email AS parent_email, par.first_name AS parent_first_name, par.last_name AS parent_last_name
       FROM program_roster pr
       JOIN student s ON s.id = pr.student_id
       LEFT JOIN student_parent sp ON sp.student_id = s.id AND sp.active = 1
       LEFT JOIN parent par ON par.id = sp.parent_id AND par.active = 1
       WHERE pr.program_id = ? AND pr.active = 1 AND pr.date_dropped IS NULL
       GROUP BY pr.id, pr.lab_fee_payment_status, pr.lab_fee_paid_date, pr.lab_fee_payment_notes,
                s.first_name, s.last_name, par.email, par.first_name, par.last_name
       ORDER BY s.last_name, s.first_name`,
      [req.params.programId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/lab-fees/match-payment/:eventId — match Stripe event to roster entry
router.post('/match-payment/:eventId', authenticate, async (req, res, next) => {
  try {
    const { roster_id } = req.body;
    if (!roster_id) return res.status(400).json({ success: false, error: 'roster_id required' });

    const [[evt]] = await pool.query('SELECT * FROM lab_fee_stripe_event WHERE id = ? AND resolved = 0', [req.params.eventId]);
    if (!evt) return res.status(404).json({ success: false, error: 'Event not found or already resolved' });

    await pool.query(
      `UPDATE lab_fee_stripe_event
       SET matched_roster_id = ?, resolved = 1, resolved_by_user_id = ?, resolved_at = NOW()
       WHERE id = ?`,
      [roster_id, req.user.userId, req.params.eventId]
    );

    await pool.query(
      `UPDATE program_roster SET lab_fee_payment_status = 'paid_stripe', lab_fee_paid_date = CURDATE()
       WHERE id = ?`,
      [roster_id]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/lab-fees/manual-payment — manual payment entry
router.post('/manual-payment', authenticate, async (req, res, next) => {
  try {
    const { roster_id, payment_status, notes } = req.body;
    const validStatuses = ['paid_stripe', 'professor_has', 'received'];
    if (!roster_id || !validStatuses.includes(payment_status)) {
      return res.status(400).json({ success: false, error: 'roster_id and valid payment_status required' });
    }

    await pool.query(
      `UPDATE program_roster
       SET lab_fee_payment_status = ?, lab_fee_paid_date = CURDATE(), lab_fee_payment_notes = ?
       WHERE id = ?`,
      [payment_status, notes || null, roster_id]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/lab-fees/clear-payment — clear a payment (reset to unpaid)
router.post('/clear-payment', authenticate, async (req, res, next) => {
  try {
    const { roster_id } = req.body;
    if (!roster_id) return res.status(400).json({ success: false, error: 'roster_id required' });

    await pool.query(
      `UPDATE program_roster
       SET lab_fee_payment_status = NULL, lab_fee_paid_date = NULL, lab_fee_payment_notes = NULL
       WHERE id = ?`,
      [roster_id]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// TAB 4: FOLLOW UP EMAILS
// ═══════════════════════════════════════════════════════════════════

// GET /api/lab-fees/followup — programs with outstanding lab fees
router.get('/followup', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.program_nickname, p.lab_fee, p.lab_fee_followup_date,
              p.stripe_payment_link_url, p.first_session_date,
              (SELECT COUNT(*) FROM program_roster pr WHERE pr.program_id = p.id
               AND pr.active = 1 AND pr.date_dropped IS NULL) AS enrolled_count,
              (SELECT COUNT(*) FROM program_roster pr WHERE pr.program_id = p.id
               AND pr.active = 1 AND pr.date_dropped IS NULL
               AND pr.lab_fee_payment_status IN ('paid_stripe', 'received')) AS paid_count
       FROM program p
       JOIN class_status cs ON cs.id = p.class_status_id AND cs.cancelled = 0
       LEFT JOIN location loc ON loc.id = p.location_id
       WHERE p.active = 1
         AND p.lab_fee > 0
         AND (loc.school_collects_lab_fee = 0 OR loc.school_collects_lab_fee IS NULL OR p.location_id IS NULL)
       HAVING paid_count < enrolled_count
       ORDER BY p.first_session_date ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/lab-fees/followup-parents/:programId — unpaid parents with merge data
router.get('/followup-parents/:programId', authenticate, async (req, res, next) => {
  try {
    const [[prog]] = await pool.query(
      'SELECT program_nickname, lab_fee, stripe_payment_link_url, first_session_date FROM program WHERE id = ?',
      [req.params.programId]
    );
    const [rows] = await pool.query(
      `SELECT pr.id AS roster_id,
              s.first_name AS student_first, s.last_name AS student_last,
              par.id AS parent_id, par.first_name AS parent_first, par.last_name AS parent_last, par.email
       FROM program_roster pr
       JOIN student s ON s.id = pr.student_id AND s.active = 1
       LEFT JOIN student_parent sp ON sp.student_id = s.id AND sp.active = 1
       LEFT JOIN parent par ON par.id = sp.parent_id AND par.active = 1
       WHERE pr.program_id = ? AND pr.active = 1 AND pr.date_dropped IS NULL
         AND (pr.lab_fee_payment_status IS NULL OR pr.lab_fee_payment_status NOT IN ('paid_stripe', 'received'))
         AND par.email IS NOT NULL AND par.email != ''`,
      [req.params.programId]
    );
    res.json({ success: true, data: rows, program: prog });
  } catch (err) { next(err); }
});

// POST /api/lab-fees/send-followup — send individual follow-up emails to each unpaid parent
router.post('/send-followup', authenticate, async (req, res, next) => {
  try {
    const { program_id, subject, body, test_mode, test_email } = req.body;
    if (!program_id || !subject || !body) {
      return res.status(400).json({ success: false, error: 'program_id, subject, and body required' });
    }

    // Get program info for merge fields
    const [[prog]] = await pool.query(
      'SELECT program_nickname, lab_fee, stripe_payment_link_url, first_session_date FROM program WHERE id = ?',
      [program_id]
    );

    // Get unpaid parents with student info
    const [parents] = await pool.query(
      `SELECT pr.id AS roster_id,
              s.first_name AS student_first, s.last_name AS student_last,
              par.first_name AS parent_first, par.last_name AS parent_last, par.email
       FROM program_roster pr
       JOIN student s ON s.id = pr.student_id AND s.active = 1
       LEFT JOIN student_parent sp ON sp.student_id = s.id AND sp.active = 1
       LEFT JOIN parent par ON par.id = sp.parent_id AND par.active = 1
       WHERE pr.program_id = ? AND pr.active = 1 AND pr.date_dropped IS NULL
         AND (pr.lab_fee_payment_status IS NULL OR pr.lab_fee_payment_status NOT IN ('paid_stripe', 'received'))
         AND par.email IS NOT NULL AND par.email != ''`,
      [program_id]
    );

    if (!parents.length && !test_mode) {
      return res.status(400).json({ success: false, error: 'No unpaid parent emails found' });
    }

    const { sendEmail } = require('../lib/gmail');
    const [[user]] = await pool.query('SELECT google_refresh_token, email_signature FROM user WHERE id = ?', [req.user.userId]);
    if (!user?.google_refresh_token) return res.status(400).json({ success: false, error: 'Gmail not connected' });

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US') : '';

    // Send individually to each parent with personalized merge fields
    let sent = 0, failed = 0;
    const targets = test_mode ? [{ email: test_email || 'test@professoregghead.com', parent_first: 'Test', parent_last: 'Parent', student_first: 'Test', student_last: 'Student' }] : parents;

    for (const p of targets) {
      const mergeData = {
        parent_name: [p.parent_first, p.parent_last].filter(Boolean).join(' '),
        student_name: [p.student_first, p.student_last].filter(Boolean).join(' '),
        class_name: prog?.program_nickname || '',
        lab_fee_amount: prog?.lab_fee ? Number(prog.lab_fee).toFixed(2) : '',
        payment_link: prog?.stripe_payment_link_url || '',
        start_date: formatDate(prog?.first_session_date),
      };

      let mergedSubject = subject;
      let mergedBody = body;
      for (const [key, val] of Object.entries(mergeData)) {
        mergedSubject = mergedSubject.replaceAll(`{{${key}}}`, val || '');
        mergedBody = mergedBody.replaceAll(`{{${key}}}`, val || '');
      }

      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">${mergedBody.replace(/\n/g, '<br>')}</div>`;

      try {
        await sendEmail({
          refreshToken: user.google_refresh_token,
          to: p.email,
          subject: mergedSubject,
          htmlBody,
          signature: user.email_signature,
        });
        sent++;
      } catch (e) {
        console.error(`Lab fee email failed for ${p.email}:`, e.message);
        failed++;
      }
    }

    // Log follow-up date
    if (!test_mode) {
      await pool.query('UPDATE program SET lab_fee_followup_date = CURDATE() WHERE id = ?', [program_id]);
      for (const p of parents) {
        await pool.query(
          `INSERT INTO client_email_log (tool_category, program_id, sent_by_user_id, recipient_email, test_mode)
           VALUES ('lab_fee_followup', ?, ?, ?, 0)`,
          [program_id, req.user.userId, p.email]
        );
      }
    }

    res.json({ success: true, sent, failed });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// BADGE COUNTS
// ═══════════════════════════════════════════════════════════════════

router.get('/counts', authenticate, async (req, res, next) => {
  try {
    const leadDays = parseInt(process.env.LAB_FEE_LEAD_DAYS) || 15;

    const [[{ create_count }]] = await pool.query(
      `SELECT COUNT(*) AS create_count FROM program p
       JOIN class_status cs ON cs.id = p.class_status_id AND cs.confirmed = 1
       LEFT JOIN location loc ON loc.id = p.location_id
       WHERE p.active = 1 AND p.lab_fee > 0
         AND (loc.school_collects_lab_fee = 0 OR loc.school_collects_lab_fee IS NULL OR p.location_id IS NULL)
         AND p.stripe_payment_link_id IS NULL
         AND p.lab_fee_link_not_needed = 0
         AND p.first_session_date IS NOT NULL
         AND p.first_session_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)`,
      [leadDays]
    );

    const [[{ unresolved_count }]] = await pool.query(
      'SELECT COUNT(*) AS unresolved_count FROM lab_fee_stripe_event WHERE resolved = 0'
    );

    const [outstandingRows] = await pool.query(
      `SELECT p.id,
              (SELECT COUNT(*) FROM program_roster pr WHERE pr.program_id = p.id
               AND pr.active = 1 AND pr.date_dropped IS NULL) AS enrolled,
              (SELECT COUNT(*) FROM program_roster pr WHERE pr.program_id = p.id
               AND pr.active = 1 AND pr.date_dropped IS NULL
               AND pr.lab_fee_payment_status IN ('paid_stripe', 'received')) AS paid
       FROM program p
       JOIN class_status cs ON cs.id = p.class_status_id AND cs.cancelled = 0
       LEFT JOIN location loc ON loc.id = p.location_id
       WHERE p.active = 1 AND p.lab_fee > 0
         AND (loc.school_collects_lab_fee = 0 OR loc.school_collects_lab_fee IS NULL OR p.location_id IS NULL)`
    );
    const outstanding_count = outstandingRows.filter(r => r.paid < r.enrolled).length;

    res.json({
      success: true,
      data: { create_count, unresolved_count, outstanding_count },
    });
  } catch (err) { next(err); }
});

module.exports = router;
