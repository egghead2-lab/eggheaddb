const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const {
  createRemoteObservationEvent,
  deleteEvent,
  formatShortDate,
} = require('../lib/userCalendar');

router.use(authenticate);

// ═══════════════════════════════════════════════════════════════
// PROFESSOR LOOKUP
// ═══════════════════════════════════════════════════════════════
//
// GET /api/remote-observe/professors?q=<search>
// Active / Substitute / Training professors matching the query.
// Returns last_evaluation_date so the scheduler can highlight who's
// most overdue. The picker for step 1 of the scheduling flow.
router.get('/professors', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const like = `%${q}%`;
    const params = [];
    let nameFilter = '';
    if (q.length >= 2) {
      nameFilter = ' AND (prof.professor_nickname LIKE ? OR prof.first_name LIKE ? OR prof.last_name LIKE ? OR prof.email LIKE ?)';
      params.push(like, like, like, like);
    }
    // Statuses we care about: Active (1), Substitute (3), Training (5).
    const [rows] = await pool.query(
      `SELECT
         prof.id                AS professor_id,
         prof.professor_nickname,
         prof.first_name,
         prof.last_name,
         prof.email             AS professor_email,
         prof.last_evaluation_date,
         prof.last_evaluation_result,
         ps.professor_status_name
       FROM professor prof
       JOIN professor_status ps ON ps.id = prof.professor_status_id
       WHERE prof.active = 1
         AND prof.professor_status_id IN (1, 3, 5)
         ${nameFilter}
       ORDER BY prof.last_evaluation_date IS NULL DESC,
                prof.last_evaluation_date ASC,
                prof.last_name, prof.first_name
       LIMIT 25`,
      params,
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// CLASS LOOKUP
// ═══════════════════════════════════════════════════════════════
//
// GET /api/remote-observe/classes
// Either:
//   ?professor_id=N           → all current programs where they're the lead
//   ?q=<search>               → typeahead across all confirmed programs
// Each returned row has the contractor allowed-flag + the next 3
// future non-OFF sessions, so the UI doesn't need a second round-trip.
router.get('/classes', async (req, res, next) => {
  try {
    const professorId = req.query.professor_id ? parseInt(req.query.professor_id) : null;
    const q = (req.query.q || '').trim();
    if (!professorId && q.length < 2) return res.json({ success: true, data: [] });

    const params = [];
    let filter = '';
    if (professorId) {
      filter = ' AND prog.lead_professor_id = ?';
      params.push(professorId);
    } else {
      const like = `%${q}%`;
      filter = ` AND (
        prog.program_nickname LIKE ?
        OR cl.class_name LIKE ?
        OR loc.nickname LIKE ?
        OR con.contractor_name LIKE ?
      )`;
      params.push(like, like, like, like);
    }

    const [programs] = await pool.query(
      `SELECT
         prog.id            AS program_id,
         prog.program_nickname,
         prog.start_time    AS class_start_time,
         prog.class_length_minutes,
         cl.id              AS class_id,
         cl.class_name,
         prof.id            AS professor_id,
         CONCAT(COALESCE(prof.professor_nickname, prof.first_name), ' ', prof.last_name) AS professor_name,
         prof.email         AS professor_email,
         loc.id             AS location_id,
         loc.nickname       AS location_name,
         con.id             AS contractor_id,
         con.contractor_name,
         con.remote_observe_allowed,
         con.remote_observe_notes
       FROM program prog
       JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl   ON cl.id = prog.class_id
       LEFT JOIN professor prof ON prof.id = prog.lead_professor_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN contractor con ON con.id = loc.contractor_id
       WHERE prog.active = 1
         AND prog.live = 1
         AND cs.confirmed = 1
         ${filter}
       ORDER BY prog.program_nickname
       LIMIT 50`,
      params,
    );

    if (programs.length === 0) return res.json({ success: true, data: [] });

    // Fetch the next 3 future non-OFF sessions for each program in one query.
    const progIds = programs.map(p => p.program_id);
    const [sessions] = await pool.query(
      `SELECT id AS session_id, program_id, session_date
       FROM session
       WHERE program_id IN (?)
         AND active = 1
         AND not_billed = 0
         AND session_date >= CURDATE()
       ORDER BY program_id, session_date ASC`,
      [progIds],
    );
    const byProg = {};
    for (const s of sessions) {
      const list = (byProg[s.program_id] = byProg[s.program_id] || []);
      if (list.length < 3) list.push({ session_id: s.session_id, session_date: s.session_date });
    }

    // When scoping by professor, only return programs that actually have
    // upcoming sessions (no point scheduling on an empty program).
    const filtered = programs
      .map(p => ({ ...p, next_3_sessions: byProg[p.program_id] || [] }))
      .filter(p => !professorId || p.next_3_sessions.length > 0);

    res.json({ success: true, data: filtered });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════

router.get('/templates', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT meeting_type, body, updated_at, updated_by_user_id FROM remote_observe_template',
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.put('/templates/:meeting_type', async (req, res, next) => {
  try {
    const { meeting_type } = req.params;
    if (!['initial', 'follow_up'].includes(meeting_type)) {
      return res.status(400).json({ success: false, error: 'Invalid meeting_type' });
    }
    const { body } = req.body;
    if (!body || typeof body !== 'string') {
      return res.status(400).json({ success: false, error: 'body required' });
    }
    await pool.query(
      'UPDATE remote_observe_template SET body = ?, updated_by_user_id = ? WHERE meeting_type = ?',
      [body, req.user.userId, meeting_type],
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// PREVIEW — render a populated description without scheduling
// ═══════════════════════════════════════════════════════════════
//
// POST /api/remote-observe/preview
// Body: { session_id, meeting_type }
// Returns the event title, attendees, computed start/end, and the
// interpolated description body. Used by the UI's sticky bottom
// preview panel so FMs see exactly what's about to be sent.
router.post('/preview', async (req, res, next) => {
  try {
    const { session_id, meeting_type } = req.body;
    if (!session_id || !meeting_type) return res.status(400).json({ success: false, error: 'session_id and meeting_type required' });
    const ctx = await loadScheduleContext(session_id, meeting_type, req.user.userId);
    res.json({ success: true, data: buildPreview(ctx) });
  } catch (err) {
    if (err.code === 'BAD_INPUT') return res.status(400).json({ success: false, error: err.message });
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// SCHEDULE
// ═══════════════════════════════════════════════════════════════
//
// POST /api/remote-observe/schedule
// Body: { session_id, meeting_type: 'initial'|'follow_up', acknowledge_unknown?: boolean }
//
// Validates the contractor's remote_observe_allowed flag, computes the
// event window, creates a Meet-enabled calendar event on the FM's primary
// calendar, and inserts a professor_evaluation row with form_status='pending'.
// The FM later fills out the evaluation form via the existing eval UI.
router.post('/schedule', async (req, res, next) => {
  try {
    const { session_id, meeting_type, acknowledge_unknown } = req.body;
    if (!session_id || !meeting_type) {
      return res.status(400).json({ success: false, error: 'session_id and meeting_type required' });
    }

    const ctx = await loadScheduleContext(session_id, meeting_type, req.user.userId);

    // Gate on the contractor's remote_observe_allowed flag.
    if (ctx.remote_observe_allowed === 0) {
      return res.status(409).json({
        success: false,
        error: 'Remote observations are not allowed for this contractor',
        contractor: ctx.contractor_name,
        notes: ctx.remote_observe_notes,
      });
    }
    if (ctx.remote_observe_allowed === null && !acknowledge_unknown) {
      return res.status(409).json({
        success: false,
        error: 'Unknown whether this contractor allows remote observations — confirm to proceed',
        contractor: ctx.contractor_name,
        notes: ctx.remote_observe_notes,
        requires_acknowledge: true,
      });
    }

    const preview = buildPreview(ctx);

    // Create the calendar event.
    let calendarResult;
    try {
      calendarResult = await createRemoteObservationEvent({
        userId: req.user.userId,
        title: preview.title,
        description: preview.description,
        sessionDate: ctx.session.session_date,
        classStartTime: ctx.program.class_start_time,
        classLengthMinutes: ctx.program.class_length_minutes,
        attendeeEmails: preview.attendees,
      });
    } catch (err) {
      if (err.code === 'NO_GOOGLE_TOKEN') {
        return res.status(409).json({ success: false, error: err.message, requires_google_connect: true });
      }
      throw err;
    }

    // Persist the evaluation row.
    const [insertResult] = await pool.query(
      `INSERT INTO professor_evaluation
         (professor_id, program_id, session_id, evaluation_date, evaluator_user_id,
          evaluation_type, is_remote, gcal_event_id, gcal_calendar_id, meet_link,
          event_start_at, event_end_at, form_status)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'pending')`,
      [
        ctx.professor.id,
        ctx.program.program_id,
        ctx.session.session_id,
        ctx.session.session_date,
        req.user.userId,
        meeting_type,
        calendarResult.eventId,
        calendarResult.calendarId,
        calendarResult.meetLink,
        calendarResult.eventStart,
        calendarResult.eventEnd,
      ],
    );

    res.json({
      success: true,
      data: {
        evaluation_id: insertResult.insertId,
        gcal_event_id: calendarResult.eventId,
        meet_link: calendarResult.meetLink,
        event_start_at: calendarResult.eventStart,
        event_end_at: calendarResult.eventEnd,
      },
    });
  } catch (err) {
    if (err.code === 'BAD_INPUT') return res.status(400).json({ success: false, error: err.message });
    next(err);
  }
});

// DELETE /api/remote-observe/:id — cancel.
// Removes the calendar event, deactivates the evaluation row.
router.delete('/:id', async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT id, evaluator_user_id, gcal_event_id, active
       FROM professor_evaluation WHERE id = ? AND is_remote = 1`,
      [req.params.id],
    );
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    if (!row.active) return res.json({ success: true, alreadyCancelled: true });

    if (row.gcal_event_id) {
      try {
        await deleteEvent(row.evaluator_user_id, row.gcal_event_id);
      } catch (err) {
        // Don't block cancellation if the Calendar side errors — still flip active=0.
        console.error('Calendar event delete failed during cancel:', err.message);
      }
    }
    await pool.query('UPDATE professor_evaluation SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── helpers ─────────────────────────────────────────────────────

// Loads everything needed to schedule or preview a remote-observation.
// Throws { code:'BAD_INPUT' } when the session is missing required fields.
async function loadScheduleContext(sessionId, meetingType, userId) {
  if (!['initial', 'follow_up'].includes(meetingType)) {
    const err = new Error('meeting_type must be "initial" or "follow_up"');
    err.code = 'BAD_INPUT';
    throw err;
  }

  const [[row]] = await pool.query(
    `SELECT
       s.id              AS session_id,
       s.session_date,
       s.not_billed,
       prog.id            AS program_id,
       prog.program_nickname,
       prog.start_time    AS class_start_time,
       prog.class_length_minutes,
       cl.class_name,
       prof.id            AS professor_id,
       prof.first_name    AS professor_first_name,
       prof.last_name     AS professor_last_name,
       prof.professor_nickname,
       prof.email         AS professor_email,
       loc.nickname       AS location_name,
       con.contractor_name,
       con.remote_observe_allowed,
       con.remote_observe_notes,
       u.email            AS fm_email,
       u.first_name       AS fm_first_name,
       u.last_name        AS fm_last_name
     FROM session s
     JOIN program prog   ON prog.id = s.program_id
     LEFT JOIN class cl  ON cl.id = prog.class_id
     LEFT JOIN professor prof ON prof.id = prog.lead_professor_id
     LEFT JOIN location loc ON loc.id = prog.location_id
     LEFT JOIN contractor con ON con.id = loc.contractor_id
     LEFT JOIN user u    ON u.id = ?
     WHERE s.id = ?`,
    [userId, sessionId],
  );

  if (!row) {
    const err = new Error('Session not found'); err.code = 'BAD_INPUT'; throw err;
  }
  if (row.not_billed) {
    const err = new Error('Cannot schedule a remote observation on an OFF session'); err.code = 'BAD_INPUT'; throw err;
  }
  if (!row.professor_email) {
    const err = new Error('Lead Professor has no email on file — cannot send the Calendar invite'); err.code = 'BAD_INPUT'; throw err;
  }
  if (!row.class_start_time || !row.class_length_minutes) {
    const err = new Error('Program is missing start_time or class_length_minutes'); err.code = 'BAD_INPUT'; throw err;
  }

  const [[tpl]] = await pool.query(
    'SELECT body FROM remote_observe_template WHERE meeting_type = ?',
    [meetingType],
  );
  if (!tpl) {
    const err = new Error(`No template found for meeting_type=${meetingType}`); err.code = 'BAD_INPUT'; throw err;
  }

  return {
    meetingType,
    session: { session_id: row.session_id, session_date: String(row.session_date).split('T')[0], not_billed: row.not_billed },
    program: {
      program_id: row.program_id,
      program_nickname: row.program_nickname,
      class_name: row.class_name,
      class_start_time: row.class_start_time,
      class_length_minutes: row.class_length_minutes,
    },
    professor: {
      id: row.professor_id,
      name: `${row.professor_nickname || row.professor_first_name} ${row.professor_last_name}`,
      email: row.professor_email,
    },
    location_name: row.location_name,
    contractor_name: row.contractor_name,
    remote_observe_allowed: row.remote_observe_allowed,    // 0 / 1 / null
    remote_observe_notes: row.remote_observe_notes,
    fm: { email: row.fm_email, name: `${row.fm_first_name || ''} ${row.fm_last_name || ''}`.trim() },
    template_body: tpl.body,
  };
}

function buildPreview(ctx) {
  const className = ctx.program.class_name || ctx.program.program_nickname || 'Class';
  const classDate = formatShortDate(ctx.session.session_date);
  const description = ctx.template_body
    .replaceAll('{{class_name}}', className)
    .replaceAll('{{class_date}}', classDate);
  const titlePrefix = ctx.meetingType === 'follow_up'
    ? 'Follow-Up Remote Observation'
    : 'Remote Observation';
  return {
    title: `${titlePrefix} - ${className}`,
    description,
    attendees: [ctx.fm.email, ctx.professor.email].filter(Boolean),
    professor_name: ctx.professor.name,
    professor_email: ctx.professor.email,
    fm_email: ctx.fm.email,
    fm_name: ctx.fm.name,
    location_name: ctx.location_name,
    contractor_name: ctx.contractor_name,
    remote_observe_allowed: ctx.remote_observe_allowed,
    remote_observe_notes: ctx.remote_observe_notes,
  };
}

module.exports = router;
