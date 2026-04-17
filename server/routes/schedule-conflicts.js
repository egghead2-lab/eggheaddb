const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const s = typeof timeStr === 'string' ? timeStr : timeStr.toString();
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

// GET /api/schedule-conflicts — scan all future sessions for conflicts
router.get('/', async (req, res, next) => {
  try {
    const { area_id } = req.query;

    // Get all future sessions with professor assignments
    let areaJoin = '';
    let areaWhere = '';
    const areaParams = [];
    if (area_id) {
      areaJoin = 'LEFT JOIN location loc ON loc.id = prog.location_id';
      areaWhere = 'AND (loc.geographic_area_id_online = ? OR p_lead.geographic_area_id = ?)';
      areaParams.push(area_id, area_id);
    }

    const [sessions] = await pool.query(
      `SELECT s.id AS session_id, s.session_date, s.session_time,
              s.professor_id AS session_prof_override, s.assistant_id AS session_assist_override, s.observer_id,
              prog.id AS program_id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.lead_professor_id, prog.assistant_professor_id, prog.location_id,
              prog.party_format_id
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN professor p_lead ON p_lead.id = prog.lead_professor_id
       ${areaJoin}
       WHERE s.active = 1 AND s.session_date >= CURDATE()
         AND cs.class_status_name NOT LIKE 'Cancelled%'
         ${areaWhere}
       ORDER BY s.session_date, s.session_time`,
      areaParams
    );

    // Get candidate tentative schedules (pending/confirmed)
    const [candidateSessions] = await pool.query(
      `SELECT cs.candidate_id, cs.program_id, cs.role,
              prog.program_nickname, prog.start_time, prog.class_length_minutes, prog.location_id,
              c.full_name AS candidate_name
       FROM candidate_schedule cs
       JOIN program prog ON prog.id = cs.program_id AND prog.active = 1
       JOIN candidate c ON c.id = cs.candidate_id AND c.active = 1 AND c.status NOT IN ('rejected', 'hired')
       LEFT JOIN class_status cls ON cls.id = prog.class_status_id
       WHERE cs.active = 1 AND cls.class_status_name NOT LIKE 'Cancelled%'
         AND (prog.last_session_date >= CURDATE() OR prog.last_session_date IS NULL)`
    );

    // Add candidate sessions — fetch actual session dates
    if (candidateSessions.length > 0) {
      const candProgIds = [...new Set(candidateSessions.map(cs => cs.program_id))];
      const [candSessRows] = await pool.query(
        'SELECT program_id, session_date FROM session WHERE program_id IN (?) AND active = 1 AND session_date >= CURDATE()',
        [candProgIds]
      );
      const candDateMap = {};
      candSessRows.forEach(s => {
        const d = s.session_date instanceof Date ? s.session_date.toISOString().split('T')[0] : String(s.session_date).split('T')[0];
        if (!candDateMap[s.program_id]) candDateMap[s.program_id] = [];
        candDateMap[s.program_id].push(d);
      });

      for (const cs of candidateSessions) {
        const dates = candDateMap[cs.program_id] || [];
        const startMin = timeToMinutes(cs.start_time);
        const endMin = startMin + (cs.class_length_minutes || 60);
        // Use negative candidate ID to avoid collision with professor IDs
        const fakeProfId = -cs.candidate_id;
        for (const date of dates) {
          activities.push({
            profId: fakeProfId, date, startMin, endMin, locId: cs.location_id,
            type: cs.role === 'Assistant' ? 'candidate_assist' : 'candidate_lead',
            label: `${cs.program_nickname} (tentative: ${cs.candidate_name})`,
            id: cs.program_id, programId: cs.program_id, isCandidate: true,
            candidateId: cs.candidate_id, candidateName: cs.candidate_name,
          });
        }
      }
    }

    // Observations are now tracked as observer_id on sessions (already included in sessions query above)

    // Build a map of all scheduled activities per professor per date
    // Each entry: { profId, date, startMin, endMin, locationId, type, label, sessionId/obsId }
    const activities = [];

    for (const s of sessions) {
      const date = s.session_date instanceof Date ? s.session_date.toISOString().split('T')[0] : String(s.session_date).split('T')[0];
      const startTime = s.session_time || s.start_time;
      const startMin = timeToMinutes(startTime);
      const endMin = startMin + (s.class_length_minutes || 60);
      const locId = s.location_id;

      // Lead professor
      const leadId = s.session_prof_override || s.lead_professor_id;
      if (leadId) {
        activities.push({ profId: leadId, date, startMin, endMin, locId, type: s.party_format_id ? 'party_lead' : 'lead', label: s.program_nickname, id: s.session_id, programId: s.program_id });
      }
      // Assistant
      const assistId = s.session_assist_override || s.assistant_professor_id;
      if (assistId) {
        activities.push({ profId: assistId, date, startMin, endMin, locId, type: s.party_format_id ? 'party_assist' : 'assist', label: s.program_nickname, id: s.session_id, programId: s.program_id });
      }
      // Observer
      if (s.observer_id) {
        activities.push({ profId: s.observer_id, date, startMin, endMin, locId, type: 'observing', label: s.program_nickname, id: s.session_id, programId: s.program_id });
      }
    }

    // Observations are now tracked as observer_id on session rows (extracted above)

    // Group by professor + date and find overlaps
    const byProfDate = {};
    activities.forEach(a => {
      const key = `${a.profId}|${a.date}`;
      if (!byProfDate[key]) byProfDate[key] = [];
      byProfDate[key].push(a);
    });

    const conflicts = [];

    for (const [key, acts] of Object.entries(byProfDate)) {
      if (acts.length < 2) continue;

      // Sort by start time
      acts.sort((a, b) => a.startMin - b.startMin);

      for (let i = 0; i < acts.length; i++) {
        for (let j = i + 1; j < acts.length; j++) {
          const a = acts[i];
          const b = acts[j];

          // No overlap if one ends before the other starts
          if (a.endMin <= b.startMin || b.endMin <= a.startMin) continue;

          // Back-to-back at same location is OK
          if (a.locId && a.locId === b.locId && (a.endMin === b.startMin || b.endMin === a.startMin)) continue;

          // Same program is not a conflict (lead + assist on same program = same person)
          if (a.programId && a.programId === b.programId) continue;

          conflicts.push({
            professor_id: acts[0].profId,
            date: a.date,
            activity_a: { type: a.type, label: a.label, start: a.startMin, end: a.endMin, id: a.id, programId: a.programId, candidateName: a.candidateName },
            activity_b: { type: b.type, label: b.label, start: b.startMin, end: b.endMin, id: b.id, programId: b.programId, candidateName: b.candidateName },
          });
        }
      }
    }

    // Enrich with professor names
    if (conflicts.length > 0) {
      const profIds = [...new Set(conflicts.map(c => c.professor_id))];
      const [profs] = await pool.query(
        'SELECT id, professor_nickname, last_name, geographic_area_id FROM professor WHERE id IN (?)', [profIds]
      );
      const profMap = {};
      profs.forEach(p => { profMap[p.id] = p; });

      const [areas] = await pool.query('SELECT id, geographic_area_name FROM geographic_area');
      const areaMap = {};
      areas.forEach(a => { areaMap[a.id] = a.geographic_area_name; });

      conflicts.forEach(c => {
        if (c.professor_id < 0) {
          // Candidate — name is in the activity
          c.professor_name = c.activity_a.candidateName || c.activity_b.candidateName || 'Candidate';
          c.is_candidate = true;
          c.area = '';
        } else {
          const prof = profMap[c.professor_id];
          c.professor_name = prof ? `${prof.professor_nickname} ${prof.last_name || ''}`.trim() : 'Unknown';
          c.area = prof ? areaMap[prof.geographic_area_id] || '' : '';
        }
      });
    }

    // Sort by date, then professor
    conflicts.sort((a, b) => a.date.localeCompare(b.date) || a.professor_name.localeCompare(b.professor_name));

    res.json({ success: true, data: conflicts, total: conflicts.length });
  } catch (err) { next(err); }
});

// GET /api/schedule-conflicts/professor/:id — check conflicts for a specific professor
router.get('/professor/:id', async (req, res, next) => {
  try {
    // Reuse the main scanner but filter to one professor
    // For now, redirect to the main endpoint logic
    res.json({ success: true, data: [] }); // placeholder
  } catch (err) { next(err); }
});

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

module.exports = router;
