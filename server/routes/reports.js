const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ============================================================
// ENTITY DEFINITIONS — what's filterable per entity
// ============================================================
const ENTITIES = {
  programs: {
    label: 'Programs',
    baseQuery: `SELECT prog.id, prog.program_nickname AS name, prog.first_session_date, prog.last_session_date,
      prog.session_count, prog.number_enrolled, prog.maximum_students, prog.minimum_students,
      prog.parent_cost, prog.our_cut, prog.lab_fee,
      prog.invoice_paid, prog.invoice_date_sent, prog.invoice_needed, prog.payment_through_us,
      prog.lead_professor_pay, prog.assistant_professor_pay,
      prog.tb_required AS prog_tb_required, prog.livescan_required AS prog_livescan_required, prog.virtus_required AS prog_virtus_required,
      prog.flyer_required, prog.demo_required, prog.registration_opened_online,
      prog.monday, prog.tuesday, prog.wednesday, prog.thursday, prog.friday, prog.saturday, prog.sunday,
      cs.class_status_name AS status, loc.nickname AS location, cl.class_name, cl.class_code,
      pt.program_type_name AS program_type, ct.class_type_name AS class_type,
      ga.geographic_area_name AS area,
      con.contractor_name AS contractor,
      loc.retained AS location_retained,
      CONCAT(lp.professor_nickname, ' ', lp.last_name) AS lead_professor,
      CONCAT(ap.professor_nickname, ' ', ap.last_name) AS assistant_professor,
      CONCAT(sc.first_name, ' ', sc.last_name) AS scheduling_coordinator,
      CONCAT(fm.first_name, ' ', fm.last_name) AS field_manager,
      CONCAT(cmgr.first_name, ' ', cmgr.last_name) AS client_manager,
      lp.virtus AS lead_virtus, lp.tb_test AS lead_tb,
      (SELECT COUNT(*) FROM livescan ls WHERE ls.professor_id = lp.id AND ls.active = 1 AND ls.location_id = loc.id) AS lead_has_livescan_at_location
    FROM program prog
    LEFT JOIN class_status cs ON cs.id = prog.class_status_id
    LEFT JOIN location loc ON loc.id = prog.location_id AND loc.active = 1
    LEFT JOIN class cl ON cl.id = prog.class_id
    LEFT JOIN program_type pt ON pt.id = cl.program_type_id
    LEFT JOIN class_type ct ON ct.id = cl.class_type_id
    LEFT JOIN city c ON c.id = loc.city_id
    LEFT JOIN geographic_area ga ON ga.id = c.geographic_area_id
    LEFT JOIN contractor con ON con.id = loc.contractor_id
    LEFT JOIN professor lp ON lp.id = prog.lead_professor_id
    LEFT JOIN professor ap ON ap.id = prog.assistant_professor_id
    LEFT JOIN user sc ON sc.id = ga.scheduling_coordinator_user_id
    LEFT JOIN user fm ON fm.id = ga.field_manager_user_id
    LEFT JOIN user cmgr ON cmgr.id = ga.client_manager_user_id
    WHERE prog.active = 1`,
    fields: {
      // Core
      status: { label: 'Program Status', type: 'select', options: 'class_status' },
      program_type: { label: 'Program Type', type: 'select', options: 'program_type' },
      class_type: { label: 'Class Type (Subject)', type: 'select', options: 'class_type' },
      area: { label: 'Geographic Area', type: 'select', options: 'area' },
      class_name: { label: 'Class/Module Name', type: 'text', col: 'cl.class_name' },
      class_code: { label: 'Class Code', type: 'text', col: 'cl.class_code' },
      location: { label: 'Location', type: 'text', col: 'loc.nickname' },
      contractor: { label: 'Contractor', type: 'text', col: 'con.contractor_name' },
      live: { label: 'Live (not virtual)', type: 'boolean', col: 'prog.live' },
      timeframe: { label: 'Timeframe', type: 'timeframe' },
      // Dates
      first_session_date: { label: 'First Session Date', type: 'date', col: 'prog.first_session_date' },
      last_session_date: { label: 'Last Session Date', type: 'date', col: 'prog.last_session_date' },
      // People
      lead_professor: { label: 'Lead Professor', type: 'text', col: "CONCAT(lp.professor_nickname, ' ', lp.last_name)", idCol: 'prog.lead_professor_id', idType: 'professor' },
      assistant_professor: { label: 'Assistant Professor', type: 'text', col: "CONCAT(ap.professor_nickname, ' ', ap.last_name)", idCol: 'prog.assistant_professor_id', idType: 'professor' },
      has_assistant: { label: 'Has Assistant', type: 'boolean', col: 'prog.assistant_professor_id IS NOT NULL', raw: true },
      scheduling_coordinator: { label: 'Scheduling Coordinator', type: 'select', options: 'scheduling_coordinator', col: "CONCAT(sc.first_name, ' ', sc.last_name)", idCol: 'ga.scheduling_coordinator_user_id', idType: 'user' },
      field_manager: { label: 'Field Manager', type: 'text', col: "CONCAT(fm.first_name, ' ', fm.last_name)", idCol: 'ga.field_manager_user_id', idType: 'user' },
      client_manager: { label: 'Client Manager', type: 'text', col: "CONCAT(cmgr.first_name, ' ', cmgr.last_name)", idCol: 'loc.client_manager_user_id', idType: 'user' },
      // Financials
      parent_cost: { label: 'Parent Cost', type: 'number', col: 'prog.parent_cost' },
      our_cut: { label: 'Our Cut', type: 'number', col: 'prog.our_cut' },
      lab_fee: { label: 'Lab Fee', type: 'number', col: 'prog.lab_fee' },
      lead_professor_pay: { label: 'Lead Prof Pay', type: 'number', col: 'prog.lead_professor_pay' },
      assistant_professor_pay: { label: 'Asst Prof Pay', type: 'number', col: 'prog.assistant_professor_pay' },
      payment_through_us: { label: 'Payment Through Us', type: 'boolean', col: 'prog.payment_through_us' },
      invoice_status: { label: 'Invoice Status', type: 'invoice' },
      invoice_needed: { label: 'Invoice Needed', type: 'boolean', col: 'prog.invoice_needed' },
      invoice_paid: { label: 'Invoice Paid', type: 'boolean', col: 'prog.invoice_paid' },
      // Enrollment
      session_count: { label: 'Session Count', type: 'number', col: 'prog.session_count' },
      class_length_minutes: { label: 'Class Length (min)', type: 'number', col: 'prog.class_length_minutes' },
      enrolled: { label: 'Students Enrolled', type: 'number', col: 'prog.number_enrolled' },
      min_students: { label: 'Min Students', type: 'number', col: 'prog.minimum_students' },
      max_students: { label: 'Max Students', type: 'number', col: 'prog.maximum_students' },
      // Roster & Prep
      roster_received: { label: 'Roster Received', type: 'boolean', col: 'prog.roster_received' },
      roster_confirmed: { label: 'Roster Confirmed', type: 'boolean', col: 'prog.roster_confirmed' },
      registration_opened: { label: 'Registration Opened', type: 'boolean', col: 'prog.registration_opened_online' },
      location_retained: { label: 'Retained Client', type: 'boolean', col: 'loc.retained' },
      // Compliance
      tb_required: { label: 'TB Required', type: 'boolean', col: 'prog.tb_required' },
      livescan_required: { label: 'Livescan Required', type: 'boolean', col: 'prog.livescan_required' },
      virtus_required: { label: 'Virtus Required', type: 'boolean', col: 'prog.virtus_required' },
      lead_virtus: { label: 'Lead Prof Has Virtus', type: 'boolean', col: 'lp.virtus' },
      lead_tb: { label: 'Lead Prof Has TB', type: 'boolean', col: 'lp.tb_test' },
      lead_has_livescan_at_location: { label: 'Lead Prof Livescanned at Location', type: 'number', col: '(SELECT COUNT(*) FROM livescan ls WHERE ls.professor_id = lp.id AND ls.active = 1 AND ls.location_id = loc.id)' },
      // Marketing
      flyer_required: { label: 'Flyer Required', type: 'boolean', col: 'prog.flyer_required' },
      demo_required: { label: 'Demo Required', type: 'boolean', col: 'prog.demo_required' },
      open_blast_sent: { label: 'Open Blast Sent', type: 'boolean', col: 'prog.open_blast_sent' },
      two_week_blast_sent: { label: '2 Week Blast Sent', type: 'boolean', col: 'prog.two_week_blast_sent' },
      one_week_blast_sent: { label: '1 Week Blast Sent', type: 'boolean', col: 'prog.one_week_blast_sent' },
      final_blast_sent: { label: 'Final Blast Sent', type: 'boolean', col: 'prog.final_blast_sent' },
      parent_feedback_requested: { label: 'Parent Feedback Requested', type: 'boolean', col: 'prog.parent_feedback_requested' },
      // Days
      day_monday: { label: 'Runs Monday', type: 'boolean', col: 'prog.monday' },
      day_tuesday: { label: 'Runs Tuesday', type: 'boolean', col: 'prog.tuesday' },
      day_wednesday: { label: 'Runs Wednesday', type: 'boolean', col: 'prog.wednesday' },
      day_thursday: { label: 'Runs Thursday', type: 'boolean', col: 'prog.thursday' },
      day_friday: { label: 'Runs Friday', type: 'boolean', col: 'prog.friday' },
    },
    defaultSort: 'prog.first_session_date DESC',
    countField: 'prog.id',
  },
  professors: {
    label: 'Professors',
    baseQuery: `SELECT p.id, CONCAT(p.professor_nickname, ' ', p.last_name) AS name,
      p.professor_nickname, p.first_name, p.last_name,
      p.base_pay, p.assist_pay, p.party_pay, p.camp_pay,
      p.email, p.phone_number, p.rating,
      ps.professor_status_name AS status, ga.geographic_area_name AS area,
      c.city_name, os.onboard_status_name AS onboard_status,
      CONCAT(sc.first_name, ' ', sc.last_name) AS scheduling_coordinator,
      p.science_trained_id, p.engineering_trained_id, p.show_party_trained_id,
      p.studysmart_trained_id, p.camp_trained_id, p.robotics_trained_id,
      p.virtus, p.virtus_date, p.tb_test, p.tb_date,
      (SELECT COUNT(*) FROM program pr LEFT JOIN class_status cs2 ON cs2.id = pr.class_status_id
       WHERE pr.active = 1 AND (pr.lead_professor_id = p.id OR pr.assistant_professor_id = p.id)
       AND cs2.class_status_name NOT LIKE 'Cancelled%'
       AND (pr.last_session_date >= CURDATE() OR pr.last_session_date IS NULL)) AS program_count,
      (SELECT COUNT(*) FROM livescan ls WHERE ls.professor_id = p.id AND ls.active = 1) AS livescan_count,
      (SELECT COUNT(*) FROM has_bin hb WHERE hb.professor_id = p.id AND hb.active = 1) AS bin_count,
      (SELECT GROUP_CONCAT(b.bin_name) FROM has_bin hb2 JOIN bin b ON b.id = hb2.bin_id WHERE hb2.professor_id = p.id AND hb2.active = 1) AS bin_names
    FROM professor p
    LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
    LEFT JOIN city c ON c.id = p.city_id
    LEFT JOIN geographic_area ga ON ga.id = p.geographic_area_id
    LEFT JOIN onboard_status os ON os.id = p.onboard_status_id
    LEFT JOIN user sc ON sc.id = p.scheduling_coordinator_owner_id
    WHERE p.active = 1`,
    fields: {
      // Core
      status: { label: 'Professor Status', type: 'select', options: 'professor_status' },
      area: { label: 'Geographic Area', type: 'select', options: 'area' },
      onboard_status: { label: 'Onboard Status', type: 'text', col: 'os.onboard_status_name' },
      scheduling_coordinator: { label: 'Scheduling Coordinator', type: 'select', options: 'scheduling_coordinator', col: "CONCAT(sc.first_name, ' ', sc.last_name)", idCol: 'p.scheduling_coordinator_owner_id', idType: 'user' },
      city: { label: 'City', type: 'text', col: 'c.city_name' },
      email: { label: 'Email', type: 'text', col: 'p.email' },
      phone: { label: 'Phone', type: 'text', col: 'p.phone_number' },
      // Pay
      base_pay: { label: 'Base Pay', type: 'number', col: 'p.base_pay' },
      assist_pay: { label: 'Assist Pay', type: 'number', col: 'p.assist_pay' },
      party_pay: { label: 'Party Pay', type: 'number', col: 'p.party_pay' },
      camp_pay: { label: 'Camp Pay', type: 'number', col: 'p.camp_pay' },
      pickup_pay: { label: 'Pickup Pay', type: 'number', col: 'p.pickup_pay' },
      rating: { label: 'Rating', type: 'number', col: 'p.rating' },
      // Programs
      program_count: { label: 'Active Program Count', type: 'number', col: 'program_count' },
      // Training
      science_trained: { label: 'Science Trained', type: 'boolean', col: 'p.science_trained_id' },
      engineering_trained: { label: 'Engineering Trained', type: 'boolean', col: 'p.engineering_trained_id' },
      party_trained: { label: 'Dry Ice Show Trained', type: 'boolean', col: 'p.show_party_trained_id' },
      studysmart_trained: { label: 'StudySmart Trained', type: 'boolean', col: 'p.studysmart_trained_id' },
      camp_trained: { label: 'Camp Trained', type: 'boolean', col: 'p.camp_trained_id' },
      robotics_trained: { label: 'Robotics Trained', type: 'boolean', col: 'p.robotics_trained_id' },
      // Compliance
      virtus: { label: 'Has Virtus', type: 'boolean', col: 'p.virtus' },
      tb_test: { label: 'Has TB Test', type: 'boolean', col: 'p.tb_test' },
      livescan_count: { label: 'Livescan Count', type: 'number', col: 'livescan_count' },
      bin_count: { label: 'Bin Count', type: 'number', col: 'bin_count' },
      has_bin: { label: 'Has Any Bin', type: 'number', col: 'bin_count' },
      bin_names: { label: 'Bin Names (contains)', type: 'text', col: 'bin_names' },
      // Dates
      hire_date: { label: 'Hire Date', type: 'date', col: 'p.hire_date' },
      birthday: { label: 'Birthday', type: 'date', col: 'p.birthday' },
      number_of_subs: { label: 'Subs Claimed', type: 'number', col: 'p.number_of_subs_claimed' },
    },
    defaultSort: 'p.professor_nickname ASC',
    countField: 'p.id',
  },
  locations: {
    label: 'Locations',
    baseQuery: `SELECT loc.id, loc.nickname AS name, loc.school_name, loc.address,
      loc.retained, loc.active, loc.payment_through_us, loc.location_enrollment,
      loc.virtus_required, loc.tb_required, loc.livescan_required,
      loc.contract_permit_required, loc.flyer_required, loc.demo_allowed,
      ga.geographic_area_name AS area, con.contractor_name AS contractor,
      lt.location_type_name AS location_type,
      COALESCE(CONCAT(loc_cm.first_name, ' ', loc_cm.last_name), CONCAT(cm.first_name, ' ', cm.last_name)) AS client_manager,
      CONCAT(fm.first_name, ' ', fm.last_name) AS field_manager,
      CONCAT(sc.first_name, ' ', sc.last_name) AS scheduling_coordinator,
      (SELECT COUNT(*) FROM program pr LEFT JOIN class_status cs ON cs.id = pr.class_status_id
       WHERE pr.location_id = loc.id AND pr.active = 1 AND cs.class_status_name NOT LIKE 'Cancelled%'
       AND (pr.last_session_date >= CURDATE() OR pr.last_session_date IS NULL)) AS active_program_count,
      (SELECT COUNT(*) FROM program pr2 WHERE pr2.location_id = loc.id AND pr2.active = 1
       AND pr2.invoice_paid = 0 AND pr2.last_session_date < CURDATE()) AS unpaid_invoice_count
    FROM location loc
    LEFT JOIN geographic_area ga ON ga.id = loc.geographic_area_id_online
    LEFT JOIN contractor con ON con.id = loc.contractor_id
    LEFT JOIN location_type lt ON lt.id = loc.location_type_id
    LEFT JOIN user cm ON cm.id = ga.client_manager_user_id
    LEFT JOIN user loc_cm ON loc_cm.id = loc.client_manager_user_id
    LEFT JOIN user fm ON fm.id = ga.field_manager_user_id
    LEFT JOIN user sc ON sc.id = ga.scheduling_coordinator_user_id
    WHERE loc.active = 1 AND (loc.location_type_id IS NULL OR loc.location_type_id != 5)`,
    fields: {
      // Core
      area: { label: 'Geographic Area', type: 'select', options: 'area' },
      location_type: { label: 'Location Type', type: 'text', col: 'lt.location_type_name' },
      contractor: { label: 'Contractor', type: 'text', col: 'con.contractor_name' },
      school_name: { label: 'School Name', type: 'text', col: 'loc.school_name' },
      address: { label: 'Address', type: 'text', col: 'loc.address' },
      phone: { label: 'Location Phone', type: 'text', col: 'loc.location_phone' },
      // People
      client_manager: { label: 'Client Manager', type: 'text', col: "COALESCE(CONCAT(loc_cm.first_name, ' ', loc_cm.last_name), CONCAT(cm.first_name, ' ', cm.last_name))", idCol: 'COALESCE(loc.client_manager_user_id, ga.client_manager_user_id)', idType: 'user' },
      field_manager: { label: 'Field Manager', type: 'text', col: "CONCAT(fm.first_name, ' ', fm.last_name)", idCol: 'ga.field_manager_user_id', idType: 'user' },
      scheduling_coordinator: { label: 'Scheduling Coordinator', type: 'select', options: 'scheduling_coordinator', col: "CONCAT(sc.first_name, ' ', sc.last_name)", idCol: 'ga.scheduling_coordinator_user_id', idType: 'user' },
      point_of_contact: { label: 'Point of Contact', type: 'text', col: 'loc.point_of_contact' },
      poc_email: { label: 'Contact Email', type: 'text', col: 'loc.poc_email' },
      poc_phone: { label: 'Contact Phone', type: 'text', col: 'loc.poc_phone' },
      // Status
      retained: { label: 'Retained Client', type: 'boolean', col: 'loc.retained' },
      payment_through_us: { label: 'Payment Through Us', type: 'boolean', col: 'loc.payment_through_us' },
      jewish: { label: 'Jewish', type: 'boolean', col: 'loc.jewish' },
      set_dates_ourselves: { label: 'Set Dates Ourselves', type: 'boolean', col: 'loc.set_dates_ourselves' },
      observes_allowed: { label: 'Observes Allowed', type: 'boolean', col: 'loc.observes_allowed' },
      // Compliance
      virtus_required: { label: 'Virtus Required', type: 'boolean', col: 'loc.virtus_required' },
      tb_required: { label: 'TB Required', type: 'boolean', col: 'loc.tb_required' },
      livescan_required: { label: 'Livescan Required', type: 'boolean', col: 'loc.livescan_required' },
      contract_required: { label: 'Contract/Permit Required', type: 'boolean', col: 'loc.contract_permit_required' },
      // Marketing
      flyer_required: { label: 'Flyer Required', type: 'boolean', col: 'loc.flyer_required' },
      custom_flyer_required: { label: 'Custom Flyer Required', type: 'boolean', col: 'loc.custom_flyer_required' },
      demo_allowed: { label: 'Demo Allowed', type: 'boolean', col: 'loc.demo_allowed' },
      // Numbers
      enrollment: { label: 'Location Enrollment', type: 'number', col: 'loc.location_enrollment' },
      number_of_weeks: { label: 'Number of Weeks', type: 'number', col: 'loc.number_of_weeks' },
      active_program_count: { label: 'Active Program Count', type: 'number', col: 'active_program_count' },
      unpaid_invoice_count: { label: 'Unpaid Invoices', type: 'number', col: 'unpaid_invoice_count' },
    },
    defaultSort: 'loc.nickname ASC',
    countField: 'loc.id',
  },
  lessons: {
    label: 'Lessons',
    baseQuery: `SELECT l.id, l.lesson_name AS name, l.review_status, l.next_update_required, l.lesson_type,
      l.status_one_sheet, l.status_materials, l.status_video, l.status_trainual, l.status_standards, l.status_science_accuracy
    FROM lesson l WHERE l.active = 1`,
    fields: {
      review_status: { label: 'Review Status', type: 'select', options: ['okay', 'review', 'overdue'] },
      lesson_type: { label: 'Lesson Type', type: 'select', options: ['science', 'engineering', 'robotics', 'financial_literacy'] },
      one_sheet: { label: 'One Sheet Status', type: 'select', col: 'l.status_one_sheet', options: ['up_to_date', 'update_needed'] },
      materials: { label: 'Materials Status', type: 'select', col: 'l.status_materials', options: ['up_to_date', 'update_needed'] },
      video: { label: 'Video Status', type: 'select', col: 'l.status_video', options: ['up_to_date', 'update_needed'] },
      trainual: { label: 'Trainual Status', type: 'select', col: 'l.status_trainual', options: ['up_to_date', 'update_needed'] },
      standards: { label: 'Standards Status', type: 'select', col: 'l.status_standards', options: ['up_to_date', 'update_needed'] },
      science_accuracy: { label: 'Science Accuracy Status', type: 'select', col: 'l.status_science_accuracy', options: ['up_to_date', 'update_needed'] },
    },
    defaultSort: 'l.lesson_name ASC',
    countField: 'l.id',
  },
};

// ============================================================
// FILTER INTERPRETER — converts JSON filters to SQL
// ============================================================
// Subquery alias columns that must use HAVING instead of WHERE
const HAVING_COLS = new Set([
  'program_count', 'livescan_count', 'bin_count', 'bin_names',
  'active_program_count', 'unpaid_invoice_count', 'lead_has_livescan_at_location',
]);

async function buildRuntimeContext(user, pool) {
  const ctx = { userId: user?.userId, role: user?.role, userAreas: [], professorId: null };
  if (ctx.userId) {
    // Get areas this user manages (as SC or FM)
    const [scAreas] = await pool.query(
      'SELECT id FROM geographic_area WHERE (scheduling_coordinator_user_id = ? OR field_manager_user_id = ?) AND active = 1',
      [ctx.userId, ctx.userId]
    );
    ctx.userAreas = scAreas.map(a => a.id);

    // Get professor_id if this user is linked to a professor
    const [[prof]] = await pool.query('SELECT id FROM professor WHERE user_id = ? AND active = 1', [ctx.userId]);
    if (prof) ctx.professorId = prof.id;
  }
  return ctx;
}

function buildFilterClause(fieldDef, f, runtimeContext = {}) {
  const col = fieldDef.col || f.field;
  const op = f.operator || '=';
  const params = [];

  // Resolve dynamic values
  if (f.value === 'CURRENT_USER' && runtimeContext.userId) {
    // Use ID column if available, resolving to professor_id or user_id as appropriate
    if (fieldDef.idCol && fieldDef.idType) {
      const resolvedId = fieldDef.idType === 'professor' ? runtimeContext.professorId : runtimeContext.userId;
      if (resolvedId) return { clause: `${fieldDef.idCol} = ?`, params: [resolvedId] };
      return { clause: '1=0', params: [] }; // no matching ID (e.g. user has no professor record)
    }
    return { clause: `${col} = ?`, params: [runtimeContext.userId] };
  }
  if (f.value === 'CURRENT_USER_AREAS' && runtimeContext.userAreas?.length) {
    return { clause: `${col} IN (${runtimeContext.userAreas.map(() => '?').join(',')})`, params: runtimeContext.userAreas };
  }

  if (fieldDef.type === 'timeframe') {
    if (f.value === 'current') return { clause: `(prog.last_session_date >= CURDATE() OR prog.last_session_date IS NULL)`, params };
    if (f.value === 'past') return { clause: `prog.last_session_date < CURDATE()`, params };
    return null;
  }

  if (fieldDef.type === 'invoice') {
    if (f.value === 'paid') return { clause: `prog.invoice_paid = 1`, params };
    if (f.value === 'sent') return { clause: `prog.invoice_paid = 0 AND prog.invoice_date_sent IS NOT NULL`, params };
    if (f.value === 'not_sent') return { clause: `prog.invoice_paid = 0 AND prog.invoice_date_sent IS NULL`, params };
    return null;
  }

  if (op === 'is_empty') return { clause: `(${col} IS NULL OR ${col} = '' OR ${col} = 0)`, params };
  if (op === 'is_not_empty') return { clause: `(${col} IS NOT NULL AND ${col} != '' AND ${col} != 0)`, params };

  if (fieldDef.type === 'boolean') {
    params.push(f.value ? 1 : 0);
    return { clause: `${col} = ?`, params };
  }

  if (fieldDef.type === 'date') {
    const ops = { '=': '=', '!=': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=' };
    // Resolve dynamic date values
    let dateValue = f.value;
    if (typeof dateValue === 'string' && dateValue.startsWith('DYNAMIC:')) {
      const dynamic = dateValue.replace('DYNAMIC:', '');
      if (dynamic === 'today') return { clause: `${col} ${ops[op] || '='} CURDATE()`, params };
      const match = dynamic.match(/^(\d+)_days_(ago|from_now)$/);
      if (match) {
        const days = parseInt(match[1]);
        const dir = match[2] === 'ago' ? '-' : '+';
        return { clause: `${col} ${ops[op] || '='} DATE_ADD(CURDATE(), INTERVAL ${dir}${days} DAY)`, params };
      }
    }
    params.push(dateValue);
    return { clause: `${col} ${ops[op] || '='} ?`, params };
  }

  if (fieldDef.type === 'number') {
    const ops = { '=': '=', '!=': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=' };
    params.push(parseFloat(f.value));
    return { clause: `${col} ${ops[op] || '='} ?`, params };
  }

  if (op === 'contains') {
    params.push(`%${f.value}%`);
    return { clause: `${col} LIKE ?`, params };
  }

  if (op === 'not') {
    let resolvedCol = col;
    if (fieldDef.type === 'select') {
      if (fieldDef.options === 'class_status') resolvedCol = 'cs.class_status_name';
      else if (fieldDef.options === 'program_type') resolvedCol = 'pt.program_type_name';
      else if (fieldDef.options === 'class_type') resolvedCol = 'ct.class_type_name';
      else if (fieldDef.options === 'area') resolvedCol = 'ga.geographic_area_name';
      else if (fieldDef.options === 'professor_status') resolvedCol = 'ps.professor_status_name';
      else if (fieldDef.options === 'scheduling_coordinator') resolvedCol = "CONCAT(sc.first_name, ' ', sc.last_name)";
    }
    params.push(f.value);
    return { clause: `${resolvedCol} != ?`, params };
  }

  if (op === 'starts_with') {
    params.push(`${f.value}%`);
    return { clause: `${col} LIKE ?`, params };
  }

  // Select or exact match
  if (fieldDef.type === 'select') {
    if (fieldDef.options === 'class_status') { params.push(f.value); return { clause: `cs.class_status_name = ?`, params }; }
    if (fieldDef.options === 'program_type') { params.push(f.value); return { clause: `pt.program_type_name = ?`, params }; }
    if (fieldDef.options === 'class_type') { params.push(f.value); return { clause: `ct.class_type_name = ?`, params }; }
    if (fieldDef.options === 'area') { params.push(f.value); return { clause: `ga.geographic_area_name = ?`, params }; }
    if (fieldDef.options === 'professor_status') { params.push(f.value); return { clause: `ps.professor_status_name = ?`, params }; }
    if (fieldDef.options === 'scheduling_coordinator') { params.push(f.value); return { clause: `CONCAT(sc.first_name, ' ', sc.last_name) = ?`, params }; }
    params.push(f.value);
    return { clause: `${f.field} = ?`, params };
  }

  params.push(f.value);
  return { clause: `${col} = ?`, params };
}

function buildWhereFromFilters(entity, filters, runtimeContext = {}) {
  const def = ENTITIES[entity];
  if (!def || !filters || !Array.isArray(filters)) return { where: '', having: '', params: [], havingParams: [] };

  const whereClauses = [];
  const havingClauses = [];
  const whereParams = [];
  const havingParams = [];

  for (const f of filters) {
    const fieldDef = def.fields[f.field];
    if (!fieldDef) continue;

    const result = buildFilterClause(fieldDef, f, runtimeContext);
    if (!result) continue;

    const col = fieldDef.col || f.field;
    if (HAVING_COLS.has(col)) {
      havingClauses.push(result.clause);
      havingParams.push(...result.params);
    } else {
      whereClauses.push(result.clause);
      whereParams.push(...result.params);
    }
  }

  return {
    where: whereClauses.length ? ' AND ' + whereClauses.join(' AND ') : '',
    having: havingClauses.length ? ' HAVING ' + havingClauses.join(' AND ') : '',
    params: whereParams,
    havingParams,
  };
}

// ============================================================
// API ROUTES
// ============================================================

// GET /api/reports/field-options — get distinct values for a field
router.get('/field-options', authenticate, async (req, res, next) => {
  try {
    const { entity, field } = req.query;
    const def = ENTITIES[entity];
    if (!def) return res.json({ success: true, data: [] });
    const fieldDef = def.fields[field];
    if (!fieldDef) return res.json({ success: true, data: [] });

    // For DB-backed selects, query distinct values
    const optionQueries = {
      'class_status': "SELECT DISTINCT class_status_name AS val FROM class_status WHERE active = 1 ORDER BY val",
      'program_type': "SELECT DISTINCT program_type_name AS val FROM program_type WHERE active = 1 ORDER BY val",
      'class_type': "SELECT DISTINCT class_type_name AS val FROM class_type WHERE active = 1 ORDER BY val",
      'area': "SELECT DISTINCT geographic_area_name AS val FROM geographic_area WHERE active = 1 ORDER BY val",
      'professor_status': "SELECT DISTINCT professor_status_name AS val FROM professor_status WHERE active = 1 ORDER BY val",
      'scheduling_coordinator': "SELECT DISTINCT CONCAT(u.first_name, ' ', u.last_name) AS val FROM user u WHERE u.active = 1 AND u.role_id IN (2, 8) ORDER BY val",
    };

    if (fieldDef.type === 'select' && typeof fieldDef.options === 'string' && optionQueries[fieldDef.options]) {
      const [rows] = await pool.query(optionQueries[fieldDef.options]);
      return res.json({ success: true, data: rows.map(r => r.val) });
    }
    if (fieldDef.type === 'select' && Array.isArray(fieldDef.options)) {
      return res.json({ success: true, data: fieldDef.options });
    }

    // For text fields that have finite values, query distinct from the base query
    const textFieldQueries = {
      // Programs
      'class_name': "SELECT DISTINCT class_name AS val FROM class WHERE active = 1 ORDER BY val",
      'class_code': "SELECT DISTINCT class_code AS val FROM class WHERE active = 1 AND class_code IS NOT NULL ORDER BY val",
      'lead_professor': "SELECT DISTINCT CONCAT(professor_nickname, ' ', last_name) AS val FROM professor p JOIN professor_status ps ON ps.id = p.professor_status_id WHERE p.active = 1 AND ps.professor_status_name IN ('Active','Substitute') ORDER BY val",
      'assistant_professor': "SELECT DISTINCT CONCAT(professor_nickname, ' ', last_name) AS val FROM professor p JOIN professor_status ps ON ps.id = p.professor_status_id WHERE p.active = 1 AND ps.professor_status_name IN ('Active','Substitute') ORDER BY val",
      'scheduling_coordinator': "SELECT DISTINCT CONCAT(u.first_name, ' ', u.last_name) AS val FROM user u JOIN role r ON r.id = u.role_id WHERE u.active = 1 AND r.role_name = 'Scheduling Coordinator' ORDER BY val",
      'field_manager': "SELECT DISTINCT CONCAT(u.first_name, ' ', u.last_name) AS val FROM user u JOIN role r ON r.id = u.role_id WHERE u.active = 1 AND r.role_name = 'Field Manager' ORDER BY val",
      'client_manager': "SELECT DISTINCT CONCAT(u.first_name, ' ', u.last_name) AS val FROM user u JOIN role r ON r.id = u.role_id WHERE u.active = 1 AND r.role_name = 'Client Manager' ORDER BY val",
      'location': "SELECT DISTINCT nickname AS val FROM location WHERE active = 1 AND (location_type_id IS NULL OR location_type_id != 5) ORDER BY val",
      'contractor': "SELECT DISTINCT contractor_name AS val FROM contractor WHERE active = 1 ORDER BY val",
      'city': "SELECT DISTINCT city_name AS val FROM city WHERE city_name IS NOT NULL ORDER BY val",
      'bin_names': "SELECT DISTINCT bin_name AS val FROM bin WHERE active = 1 ORDER BY val",
    };

    if (textFieldQueries[field]) {
      const [rows] = await pool.query(textFieldQueries[field]);
      return res.json({ success: true, data: rows.map(r => r.val).filter(Boolean) });
    }

    res.json({ success: true, data: [] });
  } catch (err) { next(err); }
});

// GET /api/reports/entities — list available entities and their fields (filtered by config)
router.get('/entities', authenticate, async (req, res, next) => {
  try {
    const [configs] = await pool.query('SELECT entity, field_key, enabled FROM report_field_config');
    const configMap = {};
    configs.forEach(c => { configMap[`${c.entity}:${c.field_key}`] = c.enabled; });

    const includeAll = req.query.include_all === 'true'; // admin view shows all fields

    const out = {};
    for (const [key, val] of Object.entries(ENTITIES)) {
      const fields = Object.entries(val.fields).map(([k, v]) => {
        const configKey = `${key}:${k}`;
        const enabled = configMap[configKey] !== undefined ? !!configMap[configKey] : true; // default enabled
        return { key: k, ...v, enabled };
      });
      out[key] = { label: val.label, fields: includeAll ? fields : fields.filter(f => f.enabled) };
    }
    res.json({ success: true, data: out });
  } catch (err) { next(err); }
});

// PUT /api/reports/field-config — toggle field visibility for report builder
router.put('/field-config', authenticate, async (req, res, next) => {
  try {
    const { entity, field_key, enabled } = req.body;
    if (!entity || !field_key) return res.status(400).json({ success: false, error: 'Entity and field_key required' });
    await pool.query(
      `INSERT INTO report_field_config (entity, field_key, enabled) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
      [entity, field_key, enabled ? 1 : 0]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/reports — list saved reports
router.get('/', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, GROUP_CONCAT(DISTINCT rr.role_id) AS role_ids, GROUP_CONCAT(DISTINCT ru.user_id) AS user_ids
       FROM report r
       LEFT JOIN report_role rr ON rr.report_id = r.id
       LEFT JOIN report_user ru ON ru.report_id = r.id
       WHERE r.active = 1 GROUP BY r.id ORDER BY r.sort_order, r.name`
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, role_ids: r.role_ids ? r.role_ids.split(',').map(Number) : [], user_ids: r.user_ids ? r.user_ids.split(',').map(Number) : [], filters: typeof r.filters === 'string' ? JSON.parse(r.filters) : r.filters })) });
  } catch (err) { next(err); }
});

// POST /api/reports — create a report
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { name, description, entity, filters, display_mode, kpi_format, kpi_field, role_ids, user_ids } = req.body;
    if (!name || !entity) return res.status(400).json({ success: false, error: 'Name and entity required' });

    const [result] = await pool.query(
      `INSERT INTO report (name, description, entity, filters, display_mode, kpi_format, kpi_field, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || null, entity, JSON.stringify(filters || []), display_mode || 'task', kpi_format || 'count', kpi_field || null, req.user?.name || null]
    );

    if (Array.isArray(role_ids)) {
      for (const rid of role_ids) await pool.query('INSERT IGNORE INTO report_role (report_id, role_id) VALUES (?, ?)', [result.insertId, rid]);
    }
    if (Array.isArray(user_ids)) {
      for (const uid of user_ids) await pool.query('INSERT IGNORE INTO report_user (report_id, user_id) VALUES (?, ?)', [result.insertId, uid]);
    }

    res.json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/reports/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { name, description, entity, filters, display_mode, kpi_format, kpi_field, role_ids, user_ids, active } = req.body;
    const fields = [], values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (entity !== undefined) { fields.push('entity = ?'); values.push(entity); }
    if (filters !== undefined) { fields.push('filters = ?'); values.push(JSON.stringify(filters)); }
    if (display_mode !== undefined) { fields.push('display_mode = ?'); values.push(display_mode); }
    if (kpi_format !== undefined) { fields.push('kpi_format = ?'); values.push(kpi_format); }
    if (kpi_field !== undefined) { fields.push('kpi_field = ?'); values.push(kpi_field); }
    if (active !== undefined) { fields.push('active = ?'); values.push(active ? 1 : 0); }
    if (fields.length) await pool.query(`UPDATE report SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);

    if (Array.isArray(role_ids)) {
      await pool.query('DELETE FROM report_role WHERE report_id = ?', [req.params.id]);
      for (const rid of role_ids) await pool.query('INSERT IGNORE INTO report_role (report_id, role_id) VALUES (?, ?)', [req.params.id, rid]);
    }
    if (Array.isArray(user_ids)) {
      await pool.query('DELETE FROM report_user WHERE report_id = ?', [req.params.id]);
      for (const uid of user_ids) await pool.query('INSERT IGNORE INTO report_user (report_id, user_id) VALUES (?, ?)', [req.params.id, uid]);
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/reports/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query('UPDATE report SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/reports/:id/run — execute a report and return results
router.get('/:id/run', authenticate, async (req, res, next) => {
  try {
    const [[report]] = await pool.query('SELECT * FROM report WHERE id = ? AND active = 1', [req.params.id]);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    const entity = ENTITIES[report.entity];
    if (!entity) return res.status(400).json({ success: false, error: 'Unknown entity' });

    let filters = typeof report.filters === 'string' ? JSON.parse(report.filters) : (report.filters || []);
    // If show_all=true, strip out CURRENT_USER filters so you see everything
    if (req.query.show_all === 'true') {
      filters = filters.filter(f => f.value !== 'CURRENT_USER' && f.value !== 'CURRENT_USER_AREAS');
    }
    const runtimeCtx = await buildRuntimeContext(req.user, pool);
    const { where, having, params, havingParams } = buildWhereFromFilters(report.entity, filters, runtimeCtx);

    const query = `${entity.baseQuery}${where}${having} ORDER BY ${entity.defaultSort} LIMIT 500`;
    const [rows] = await pool.query(query, [...params, ...havingParams]);

    // Also get count
    const countQuery = `SELECT COUNT(*) as cnt FROM (${entity.baseQuery}${where}${having}) AS sub`;
    const [[{ cnt }]] = await pool.query(countQuery, [...params, ...havingParams]);

    res.json({ success: true, data: rows, count: cnt, report });
  } catch (err) { next(err); }
});

// GET /api/reports/dashboard — get all reports for the current user's role, with counts
router.get('/dashboard/my', authenticate, async (req, res, next) => {
  try {
    const role = req.user?.role;
    const adminRoles = ['Admin', 'CEO'];

    let reports;
    if (adminRoles.includes(role)) {
      [reports] = await pool.query('SELECT * FROM report WHERE active = 1 ORDER BY sort_order, name');
    } else {
      const [[userRole]] = await pool.query('SELECT id FROM role WHERE role_name = ? AND active = 1', [role]);
      const userId = req.user?.userId;
      [reports] = await pool.query(
        `SELECT DISTINCT r.* FROM report r
         LEFT JOIN report_role rr ON rr.report_id = r.id
         LEFT JOIN report_user ru ON ru.report_id = r.id
         WHERE r.active = 1 AND (rr.role_id = ? OR ru.user_id = ?)
         ORDER BY r.sort_order, r.name`,
        [userRole?.id || 0, userId || 0]
      );
    }

    // Execute each report to get counts
    const runtimeCtx = await buildRuntimeContext(req.user, pool);
    const results = [];
    for (const report of reports) {
      const entity = ENTITIES[report.entity];
      if (!entity) continue;
      const filters = typeof report.filters === 'string' ? JSON.parse(report.filters) : (report.filters || []);
      const { where, having, params, havingParams } = buildWhereFromFilters(report.entity, filters, runtimeCtx);
      try {
        const countQuery = `SELECT COUNT(*) as cnt FROM (${entity.baseQuery}${where}${having}) AS sub`;
        const [[{ cnt }]] = await pool.query(countQuery, [...params, ...havingParams]);
        results.push({ ...report, filters, count: cnt });
      } catch {
        results.push({ ...report, filters, count: 0, error: true });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// GET /api/reports/dashboard/user/:userId — admin view: see a specific user's reports
router.get('/dashboard/user/:userId', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const [[user]] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, r.role_name FROM user u LEFT JOIN role r ON r.id = u.role_id WHERE u.id = ?`, [userId]
    );
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const [[userRole]] = await pool.query('SELECT id FROM role WHERE role_name = ? AND active = 1', [user.role_name]);

    const [reports] = await pool.query(
      `SELECT DISTINCT r.* FROM report r
       LEFT JOIN report_role rr ON rr.report_id = r.id
       LEFT JOIN report_user ru ON ru.report_id = r.id
       WHERE r.active = 1 AND (rr.role_id = ? OR ru.user_id = ?)
       ORDER BY r.sort_order, r.name`,
      [userRole?.id || 0, userId]
    );

    const runtimeCtx = await buildRuntimeContext({ userId: parseInt(userId), role: user.role_name }, pool);
    const results = [];
    for (const report of reports) {
      const entity = ENTITIES[report.entity];
      if (!entity) continue;
      const filters = typeof report.filters === 'string' ? JSON.parse(report.filters) : (report.filters || []);
      const { where, having, params, havingParams } = buildWhereFromFilters(report.entity, filters, runtimeCtx);
      try {
        const countQuery = `SELECT COUNT(*) as cnt FROM (${entity.baseQuery}${where}${having}) AS sub`;
        const [[{ cnt }]] = await pool.query(countQuery, [...params, ...havingParams]);
        results.push({ ...report, filters, count: cnt });
      } catch {
        results.push({ ...report, filters, count: 0, error: true });
      }
    }

    res.json({ success: true, user, data: results });
  } catch (err) { next(err); }
});

module.exports = router;
