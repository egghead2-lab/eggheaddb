const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_COLS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_ABBR = { Monday: 'M', Tuesday: 'T', Wednesday: 'W', Thursday: 'Th', Friday: 'F', Saturday: 'Sa', Sunday: 'Su' };

function buildDayBadge(dayFlags) {
  const present = DAYS.filter((_, i) => dayFlags[DAY_COLS[i]]);
  if (present.length <= 1) return '';
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (present.length === 5 && present.every(d => weekdays.includes(d))) return 'M\u2013F';
  return present.map(d => DAY_ABBR[d]).join(' ');
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function addMins(timeStr, minutes) {
  if (!timeStr || !minutes) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  const ampm = nh >= 12 ? 'PM' : 'AM';
  const h12 = nh % 12 || 12;
  return `${h12}:${String(nm).padStart(2, '0')} ${ampm}`;
}

function normalizeCategory(classTypeName) {
  const v = (classTypeName || '').toLowerCase();
  if (v.includes('robotic')) return 'robotics';
  if (v.includes('engineer')) return 'engineering';
  if (v.includes('science')) return 'science';
  if (v.includes('financ') || v.includes('finlit')) return 'finlit';
  if (v.includes('mix')) return 'mix';
  return '';
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
}

// GET /api/planner — class planner data grouped by day of week
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { contractor, area, startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
    }

    // Build WHERE clauses for location filtering
    const where = ['prog.active = 1', "cs.class_status_name IN ('Confirmed', 'Unconfirmed')"];
    const params = [];

    if (contractor) {
      where.push('con.contractor_name = ?');
      params.push(contractor);
    }
    if (area) {
      where.push('ga.geographic_area_name = ?');
      params.push(area);
    }

    // Filter programs that overlap the date range
    where.push('(prog.first_session_date <= ? OR prog.first_session_date IS NULL)');
    params.push(endDate);
    where.push('(prog.last_session_date >= ? OR prog.last_session_date IS NULL)');
    params.push(startDate);

    const [programs] = await pool.query(
      `SELECT prog.id, prog.program_nickname, prog.start_time, prog.class_length_minutes,
              prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
              prog.first_session_date, prog.last_session_date,
              prog.number_enrolled, prog.minimum_students, prog.maximum_students,
              cs.class_status_name,
              loc.nickname AS location_nickname,
              cl.class_name,
              pt.program_type_name,
              ct.class_type_name,
              con.contractor_name,
              ga.geographic_area_name,
              CONCAT(lp.professor_nickname, ' ', lp.last_name) AS professor
       FROM program prog
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN city ci ON ci.id = loc.city_id
       LEFT JOIN geographic_area ga ON ga.id = ci.geographic_area_id
       LEFT JOIN contractor con ON con.id = loc.contractor_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       LEFT JOIN class_type ct ON ct.id = cl.class_type_id
       LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
       WHERE ${where.join(' AND ')}
       ORDER BY loc.nickname, prog.start_time, prog.program_nickname`,
      params
    );

    // Build result grouped by day
    const result = {};
    DAYS.forEach(d => { result[d] = []; });

    for (const prog of programs) {
      const startFmt = formatTime(prog.start_time);
      const endFmt = addMins(prog.start_time, prog.class_length_minutes);
      const time = startFmt && endFmt ? `${startFmt} – ${endFmt}` : startFmt;

      const entry = {
        id: prog.id,
        nickname: prog.program_nickname || '',
        category: normalizeCategory(prog.class_type_name),
        dayBadge: buildDayBadge(prog),
        time,
        location: prog.location_nickname || '',
        className: prog.class_name || '',
        professor: prog.professor || '',
        dateRange: `${formatDate(prog.first_session_date)} – ${formatDate(prog.last_session_date)}`,
        status: prog.class_status_name || '',
        enrolled: prog.number_enrolled || 0,
        minimum: prog.minimum_students || 0,
        maximum: prog.maximum_students || 0,
        contractor: prog.contractor_name || '',
        area: prog.geographic_area_name || '',
      };

      // Add to each day the program runs on
      DAY_COLS.forEach((col, i) => {
        if (prog[col]) {
          result[DAYS[i]].push(entry);
        }
      });
    }

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/planner/filters — contractors and areas for dropdowns
router.get('/filters', authenticate, async (req, res, next) => {
  try {
    const [contractors] = await pool.query(
      `SELECT DISTINCT con.contractor_name
       FROM contractor con
       JOIN location loc ON loc.contractor_id = con.id AND loc.active = 1
       WHERE con.active = 1
       ORDER BY con.contractor_name`
    );

    const [areas] = await pool.query(
      `SELECT DISTINCT ga.geographic_area_name
       FROM geographic_area ga
       JOIN city ci ON ci.geographic_area_id = ga.id
       JOIN location loc ON loc.city_id = ci.id AND loc.active = 1
       WHERE ga.active = 1
       ORDER BY ga.geographic_area_name`
    );

    res.json({
      success: true,
      contractors: contractors.map(r => r.contractor_name),
      areas: areas.map(r => r.geographic_area_name),
    });
  } catch (err) { next(err); }
});

module.exports = router;
