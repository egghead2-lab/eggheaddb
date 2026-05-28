const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/party-assign/unassigned — parties needing a lead professor
router.get('/unassigned', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.start_time,
              prog.class_length_minutes, prog.party_location_text, prog.party_city, prog.lead_professor_id,
              prog.lead_professor_pay, prog.assistant_professor_id,
              prog.birthday_kid_name, prog.birthday_kid_age, prog.total_kids_attended,
              prog.general_notes,
              cs.class_status_name,
              pf.party_format_name,
              cl.class_name AS party_theme,
              loc.nickname AS location_nickname, loc.address,
              CONCAT(par.first_name, ' ', par.last_name) AS contact_name,
              par.email AS contact_email, par.phone AS contact_phone,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor_name,
              (SELECT COUNT(*) FROM party_assignment_ask paa WHERE paa.program_id = prog.id AND paa.active = 1) AS ask_count,
              (SELECT COUNT(*) FROM party_assignment_ask paa WHERE paa.program_id = prog.id AND paa.active = 1 AND paa.response = 'pending') AS pending_count,
              (SELECT paa2.ask_type FROM party_assignment_ask paa2 WHERE paa2.program_id = prog.id AND paa2.active = 1 AND paa2.response = 'pending' ORDER BY paa2.asked_at DESC LIMIT 1) AS latest_pending_type
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN parent par ON par.id = prog.parent_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       WHERE prog.active = 1
         AND pt.program_type_name = 'Party'
         AND (cs.class_status_name IS NULL OR cs.class_status_name NOT LIKE 'Cancelled%')
         AND prog.first_session_date >= CURDATE()
       ORDER BY prog.first_session_date ASC`
    );

    // Compute status for each party
    const parties = rows.map(p => {
      let assignment_status = 'Unassigned';
      if (p.lead_professor_id) {
        // Check if there's a pending assign ask (professor hasn't confirmed yet)
        const hasPendingAssign = p.latest_pending_type === 'assign';
        assignment_status = hasPendingAssign ? 'Assigned - Pending Confirmation' : 'Confirmed';
      } else if (p.pending_count > 0) {
        assignment_status = `Ask Sent (${p.pending_count})`;
      } else if (p.ask_count > 0) {
        assignment_status = 'Declined';
      }
      const daysUntil = Math.ceil((new Date(p.first_session_date) - new Date()) / 86400000);
      return { ...p, assignment_status, days_until: daysUntil };
    });

    res.json({ success: true, data: parties });
  } catch (err) { next(err); }
});

// GET /api/party-assign/:partyId/available-professors — filtered professor pool
router.get('/:partyId/available-professors', authenticate, async (req, res, next) => {
  try {
    const { partyId } = req.params;

    // Get the party info for filtering
    const [[party]] = await pool.query(
      `SELECT prog.id, prog.first_session_date, prog.party_format_id,
              pf.party_format_name
       FROM program prog
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       WHERE prog.id = ?`,
      [partyId]
    );
    if (!party) return res.status(404).json({ success: false, error: 'Party not found' });

    const partyDate = party.first_session_date?.toISOString?.().split('T')[0]
      || (typeof party.first_session_date === 'string' ? party.first_session_date.split('T')[0] : null);

    // Booth and Workshop allow non-show-trained professors; everything else requires show-trained
    const noTrainFormats = ['booth', 'workshop'];
    const formatName = (party.party_format_name || '').toLowerCase();
    const allowUntrained = noTrainFormats.some(f => formatName === f);

    // Get all active professors with relevant data
    let profWhere = `p.active = 1 AND ps.professor_status_name = 'Active'`;
    if (!allowUntrained) profWhere += ' AND p.show_party_trained_id = 1';

    const [professors] = await pool.query(
      `SELECT p.id, CONCAT(p.professor_nickname, ' ', p.last_name) AS name,
              p.show_party_trained_id, p.base_pay,
              p.email, p.phone_number,
              ga.geographic_area_name
       FROM professor p
       JOIN professor_status ps ON ps.id = p.professor_status_id
       LEFT JOIN geographic_area ga ON ga.id = p.geographic_area_id
       WHERE ${profWhere}
       ORDER BY p.professor_nickname`
    );

    if (!professors.length) return res.json({ success: true, data: [] });

    const profIds = professors.map(p => p.id);

    // Day off on party date
    const [dayOffs] = partyDate ? await pool.query(
      `SELECT professor_id FROM day_off WHERE date_requested = ? AND active = 1 AND professor_id IN (?)`,
      [partyDate, profIds]
    ) : [[]];
    const dayOffSet = new Set(dayOffs.map(d => d.professor_id));

    // Day offs within 2 days of party date
    const [nearbyDayOffs] = partyDate ? await pool.query(
      `SELECT DISTINCT professor_id FROM day_off
       WHERE active = 1 AND professor_id IN (?)
         AND date_requested BETWEEN DATE_SUB(?, INTERVAL 2 DAY) AND DATE_ADD(?, INTERVAL 2 DAY)
         AND date_requested != ?`,
      [profIds, partyDate, partyDate, partyDate]
    ) : [[]];
    const nearbyDayOffSet = new Set(nearbyDayOffs.map(d => d.professor_id));

    // Existing party assignments on that date (conflict check)
    const [conflicts] = partyDate ? await pool.query(
      `SELECT DISTINCT prog.lead_professor_id AS professor_id
       FROM program prog
       JOIN class cl ON cl.id = prog.class_id
       JOIN program_type pt ON pt.id = cl.program_type_id AND pt.program_type_name = 'Party'
       WHERE prog.active = 1 AND prog.first_session_date = ? AND prog.lead_professor_id IN (?)
       UNION
       SELECT DISTINCT prog.assistant_professor_id
       FROM program prog
       JOIN class cl ON cl.id = prog.class_id
       JOIN program_type pt ON pt.id = cl.program_type_id AND pt.program_type_name = 'Party'
       WHERE prog.active = 1 AND prog.first_session_date = ? AND prog.assistant_professor_id IN (?)`,
      [partyDate, profIds, partyDate, profIds]
    ) : [[]];
    const conflictSet = new Set(conflicts.map(c => c.professor_id).filter(Boolean));

    // Session conflicts on that date (regular classes)
    const [sessionConflicts] = partyDate ? await pool.query(
      `SELECT DISTINCT COALESCE(s.professor_id, prog.lead_professor_id) AS professor_id
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       WHERE s.active = 1 AND s.session_date = ?
         AND COALESCE(s.professor_id, prog.lead_professor_id) IN (?)`,
      [partyDate, profIds]
    ) : [[]];
    sessionConflicts.forEach(c => { if (c.professor_id) conflictSet.add(c.professor_id); });

    // Party count in next 30 days per professor
    const [partyCounts] = await pool.query(
      `SELECT prog.lead_professor_id AS professor_id, COUNT(*) AS party_count
       FROM program prog
       JOIN class cl ON cl.id = prog.class_id
       JOIN program_type pt ON pt.id = cl.program_type_id AND pt.program_type_name = 'Party'
       WHERE prog.active = 1 AND prog.lead_professor_id IN (?)
         AND prog.first_session_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       GROUP BY prog.lead_professor_id`,
      [profIds]
    );
    const partyCountMap = {};
    partyCounts.forEach(pc => { partyCountMap[pc.professor_id] = pc.party_count; });

    // Decline counts from party_assignment_ask
    const [declines] = await pool.query(
      `SELECT professor_id, COUNT(*) AS decline_count
       FROM party_assignment_ask
       WHERE professor_id IN (?) AND response = 'declined' AND active = 1
       GROUP BY professor_id`,
      [profIds]
    );
    const declineMap = {};
    declines.forEach(d => { declineMap[d.professor_id] = d.decline_count; });

    // Existing asks for this party
    const [existingAsks] = await pool.query(
      `SELECT professor_id, ask_type, response FROM party_assignment_ask
       WHERE program_id = ? AND active = 1`,
      [partyId]
    );
    const askMap = {};
    existingAsks.forEach(a => { askMap[a.professor_id] = a; });

    // Build result
    const result = professors
      .filter(p => !dayOffSet.has(p.id)) // exclude day off
      .map(p => ({
        ...p,
        has_conflict: conflictSet.has(p.id),
        parties_next_30: partyCountMap[p.id] || 0,
        decline_count: declineMap[p.id] || 0,
        day_off_nearby: nearbyDayOffSet.has(p.id),
        show_trained: !!p.show_party_trained_id,
        existing_ask: askMap[p.id] || null,
      }))
      .sort((a, b) => {
        // Available first, then fewest conflicts, then fewest declines
        if (a.has_conflict !== b.has_conflict) return a.has_conflict ? 1 : -1;
        if (a.parties_next_30 !== b.parties_next_30) return a.parties_next_30 - b.parties_next_30;
        return a.decline_count - b.decline_count;
      });

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/party-assign/:partyId/asks — ask history for a party
router.get('/:partyId/asks', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT paa.*, CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              CONCAT(u.first_name, ' ', u.last_name) AS asked_by_name
       FROM party_assignment_ask paa
       JOIN professor p ON p.id = paa.professor_id
       LEFT JOIN user u ON u.id = paa.asked_by_user_id
       WHERE paa.program_id = ? AND paa.active = 1
       ORDER BY paa.asked_at DESC`,
      [req.params.partyId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/party-assign/:partyId/ask — send ask to professor(s)
router.post('/:partyId/ask', authenticate, async (req, res, next) => {
  try {
    const { partyId } = req.params;
    const { professor_ids, notes, send_email, email_subject, email_body } = req.body;
    if (!professor_ids?.length) return res.status(400).json({ success: false, error: 'Select at least one professor' });

    const results = [];
    for (const profId of professor_ids) {
      const [result] = await pool.query(
        `INSERT INTO party_assignment_ask (program_id, professor_id, ask_type, asked_by_user_id, notes)
         VALUES (?, ?, 'ask', ?, ?)`,
        [partyId, profId, req.user.userId, notes || null]
      );

      // Send email if requested
      if (send_email && email_subject && email_body) {
        try {
          const { sendEmail } = require('../lib/gmail');
          const [[user]] = await pool.query('SELECT google_refresh_token, email_signature FROM user WHERE id = ?', [req.user.userId]);
          const [[prof]] = await pool.query('SELECT email FROM professor WHERE id = ?', [profId]);
          if (user?.google_refresh_token && prof?.email) {
            const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">${email_body.replace(/\n/g, '<br>')}</div>`;
            await sendEmail({ refreshToken: user.google_refresh_token, to: prof.email, subject: email_subject, htmlBody, signature: user.email_signature });
            await pool.query('UPDATE party_assignment_ask SET email_sent = 1 WHERE id = ?', [result.insertId]);
          }
        } catch (emailErr) {
          // Log but don't fail the ask
          console.error('Party ask email failed:', emailErr.message);
        }
      }
      results.push({ id: result.insertId, professor_id: profId });
    }

    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// POST /api/party-assign/:partyId/assign — assign professor (pending their confirmation)
router.post('/:partyId/assign', authenticate, async (req, res, next) => {
  try {
    const { partyId } = req.params;
    const { professor_id, notes, send_email, email_subject, email_body } = req.body;
    if (!professor_id) return res.status(400).json({ success: false, error: 'Professor required' });

    // Cancel any other pending assigns for this party
    await pool.query(
      `UPDATE party_assignment_ask SET response = 'declined', response_at = NOW(), decline_reason = 'Superseded by new assignment'
       WHERE program_id = ? AND ask_type = 'assign' AND response = 'pending' AND active = 1`,
      [partyId]
    );

    const [result] = await pool.query(
      `INSERT INTO party_assignment_ask (program_id, professor_id, ask_type, asked_by_user_id, notes)
       VALUES (?, ?, 'assign', ?, ?)`,
      [partyId, professor_id, req.user.userId, notes || null]
    );

    // Send email if requested
    if (send_email && email_subject && email_body) {
      try {
        const { sendEmail } = require('../lib/gmail');
        const [[user]] = await pool.query('SELECT google_refresh_token, email_signature FROM user WHERE id = ?', [req.user.userId]);
        const [[prof]] = await pool.query('SELECT email FROM professor WHERE id = ?', [professor_id]);
        if (user?.google_refresh_token && prof?.email) {
          const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">${email_body.replace(/\n/g, '<br>')}</div>`;
          await sendEmail({ refreshToken: user.google_refresh_token, to: prof.email, subject: email_subject, htmlBody, signature: user.email_signature });
          await pool.query('UPDATE party_assignment_ask SET email_sent = 1 WHERE id = ?', [result.insertId]);
        }
      } catch (emailErr) {
        console.error('Party assign email failed:', emailErr.message);
      }
    }

    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// POST /api/party-assign/:partyId/force-confirm — scheduler manually confirms
router.post('/:partyId/force-confirm', authenticate, async (req, res, next) => {
  try {
    const { partyId } = req.params;
    const { professor_id } = req.body;
    if (!professor_id) return res.status(400).json({ success: false, error: 'Professor required' });

    // Set lead professor on the party
    await pool.query('UPDATE program SET lead_professor_id = ?, ts_updated = NOW() WHERE id = ?', [professor_id, partyId]);

    // Mark any pending asks/assigns as accepted
    await pool.query(
      `UPDATE party_assignment_ask SET response = 'accepted', response_at = NOW()
       WHERE program_id = ? AND professor_id = ? AND response = 'pending' AND active = 1`,
      [partyId, professor_id]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/party-assign/responses — Party Scheduler review panel
router.get('/responses/dashboard', authenticate, async (req, res, next) => {
  try {
    // Pending confirmations
    const [pending] = await pool.query(
      `SELECT paa.id, paa.program_id, paa.professor_id, paa.ask_type, paa.asked_at, paa.notes,
              prog.program_nickname, prog.first_session_date,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              pf.party_format_name
       FROM party_assignment_ask paa
       JOIN program prog ON prog.id = paa.program_id
       JOIN professor p ON p.id = paa.professor_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       WHERE paa.active = 1 AND paa.response = 'pending'
       ORDER BY prog.first_session_date ASC`
    );

    // Recent responses (last 7 days)
    const [recent] = await pool.query(
      `SELECT paa.id, paa.program_id, paa.professor_id, paa.ask_type, paa.response,
              paa.response_at, paa.decline_reason,
              prog.program_nickname, prog.first_session_date,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              pf.party_format_name
       FROM party_assignment_ask paa
       JOIN program prog ON prog.id = paa.program_id
       JOIN professor p ON p.id = paa.professor_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       WHERE paa.active = 1 AND paa.response IN ('accepted', 'declined')
         AND paa.response_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ORDER BY paa.response_at DESC`
    );

    // Urgent: unassigned within 14 days
    const [urgent] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date,
              pf.party_format_name,
              DATEDIFF(prog.first_session_date, CURDATE()) AS days_until,
              (SELECT COUNT(*) FROM party_assignment_ask paa WHERE paa.program_id = prog.id AND paa.response = 'declined' AND paa.active = 1) AS decline_count
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       WHERE prog.active = 1
         AND pt.program_type_name = 'Party'
         AND (cs.class_status_name IS NULL OR cs.class_status_name NOT LIKE 'Cancelled%')
         AND prog.lead_professor_id IS NULL
         AND prog.first_session_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY)
       ORDER BY prog.first_session_date ASC`
    );

    res.json({ success: true, data: { pending, recent, urgent } });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════════
// PROFESSOR-SIDE PARTY CLAIMING
// ════════════════════════════════════════════════════════════════

// GET /api/party-assign/available-to-claim — upcoming unassigned parties
// a party-trained professor can claim. Filtered to their area if set.
router.get('/available-to-claim', authenticate, async (req, res, next) => {
  try {
    const professorId = req.query.professor_id;
    if (!professorId) return res.status(400).json({ success: false, error: 'professor_id required' });

    // Get professor's area so we can flag cross-area parties
    const [[prof]] = await pool.query(
      'SELECT geographic_area_id, show_party_trained_id FROM professor WHERE id = ? AND active = 1',
      [professorId]
    );
    if (!prof) return res.status(404).json({ success: false, error: 'Professor not found' });
    if (!prof.show_party_trained_id) return res.json({ success: true, data: [] });

    // Check for an existing pending claim by this professor
    const [myPendingClaims] = await pool.query(
      'SELECT program_id FROM party_claim WHERE professor_id = ? AND status = \'pending\' AND active = 1',
      [professorId]
    );
    const alreadyClaimed = new Set(myPendingClaims.map(r => r.program_id));

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.first_session_date, prog.start_time,
              prog.class_length_minutes, prog.party_location_text, prog.party_city,
              prog.party_state, prog.lead_professor_id, prog.assistant_professor_id,
              prog.lead_professor_pay, prog.assistant_professor_pay,
              prog.birthday_kid_name, prog.birthday_kid_age,
              prog.general_notes,
              cl.class_name AS party_theme,
              pf.party_format_name,
              loc.nickname AS location_nickname,
              loc.geographic_area_id_online AS location_area_id,
              DATEDIFF(prog.first_session_date, CURDATE()) AS days_until,
              (SELECT COUNT(*) FROM party_claim pc2 WHERE pc2.program_id = prog.id AND pc2.status = 'pending' AND pc2.active = 1) AS pending_claims
       FROM program prog
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       WHERE prog.active = 1
         AND pt.program_type_name = 'Party'
         AND (cs.class_status_name IS NULL OR cs.class_status_name NOT LIKE 'Cancelled%')
         AND prog.lead_professor_id IS NULL
         AND prog.first_session_date >= CURDATE()
       ORDER BY prog.first_session_date ASC
       LIMIT 30`,
    );

    const data = rows.map(r => ({
      ...r,
      already_claimed: alreadyClaimed.has(r.id),
      same_area: !prof.geographic_area_id || r.location_area_id === prof.geographic_area_id,
    }));

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /api/party-assign/:partyId/claim — professor claims a party
router.post('/:partyId/claim', authenticate, async (req, res, next) => {
  try {
    const { partyId } = req.params;
    const { professor_id, role = 'Lead' } = req.body;
    if (!professor_id) return res.status(400).json({ success: false, error: 'professor_id required' });

    // Validate party is still unassigned (for Lead claims)
    const [[party]] = await pool.query(
      'SELECT lead_professor_id, first_session_date FROM program WHERE id = ? AND active = 1',
      [partyId]
    );
    if (!party) return res.status(404).json({ success: false, error: 'Party not found' });
    if (role === 'Lead' && party.lead_professor_id) {
      return res.status(409).json({ success: false, error: 'This party already has a lead professor assigned' });
    }

    // Check for duplicate pending claim
    const [[existing]] = await pool.query(
      'SELECT id FROM party_claim WHERE program_id = ? AND professor_id = ? AND role = ? AND status = \'pending\' AND active = 1',
      [partyId, professor_id, role]
    );
    if (existing) return res.status(409).json({ success: false, error: 'You already have a pending claim for this party' });

    const [[prof]] = await pool.query(
      'SELECT base_pay, party_pay FROM professor WHERE id = ?',
      [professor_id]
    );
    const expectedPay = prof?.party_pay || prof?.base_pay || null;

    const [result] = await pool.query(
      'INSERT INTO party_claim (program_id, professor_id, role, expected_pay) VALUES (?, ?, ?, ?)',
      [partyId, professor_id, role, expectedPay]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// DELETE /api/party-assign/claims/:claimId — professor withdraws a pending claim
router.delete('/claims/:claimId', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE party_claim SET active = 0 WHERE id = ? AND status = \'pending\'',
      [req.params.claimId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/party-assign/claims — all pending claims (for Party Scheduler)
router.get('/claims', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT pc.id, pc.program_id, pc.professor_id, pc.role, pc.status,
              pc.expected_pay, pc.claimed_at, pc.reject_reason,
              prog.program_nickname, prog.first_session_date, prog.start_time,
              prog.party_city, prog.party_location_text,
              DATEDIFF(prog.first_session_date, CURDATE()) AS days_until,
              CONCAT(p.professor_nickname, ' ', p.last_name) AS professor_name,
              p.phone_number AS professor_phone,
              pf.party_format_name,
              cl.class_name AS party_theme
       FROM party_claim pc
       JOIN program prog ON prog.id = pc.program_id
       JOIN professor p ON p.id = pc.professor_id
       LEFT JOIN party_format pf ON pf.id = prog.party_format_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       WHERE pc.active = 1 AND pc.status = 'pending'
       ORDER BY prog.first_session_date ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/party-assign/claims/:claimId/approve — scheduler approves claim → assigns professor
router.post('/claims/:claimId/approve', authenticate, async (req, res, next) => {
  try {
    const [[claim]] = await pool.query(
      'SELECT * FROM party_claim WHERE id = ? AND active = 1 AND status = \'pending\'',
      [req.params.claimId]
    );
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found or already reviewed' });

    // Assign professor to party
    const field = claim.role === 'Lead' ? 'lead_professor_id' : 'assistant_professor_id';
    await pool.query(`UPDATE program SET ${field} = ?, ts_updated = NOW() WHERE id = ?`, [claim.professor_id, claim.program_id]);

    // Approve this claim, reject all other pending claims for same party+role
    await pool.query(
      'UPDATE party_claim SET status = \'approved\', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      [req.user.userId, req.params.claimId]
    );
    await pool.query(
      'UPDATE party_claim SET status = \'rejected\', reject_reason = \'Another professor was approved\', reviewed_by = ?, reviewed_at = NOW() WHERE program_id = ? AND role = ? AND status = \'pending\' AND id != ? AND active = 1',
      [req.user.userId, claim.program_id, claim.role, req.params.claimId]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/party-assign/claims/:claimId/reject
router.post('/claims/:claimId/reject', authenticate, async (req, res, next) => {
  try {
    const { reason } = req.body;
    await pool.query(
      'UPDATE party_claim SET status = \'rejected\', reject_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ? AND active = 1',
      [reason || null, req.user.userId, req.params.claimId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
