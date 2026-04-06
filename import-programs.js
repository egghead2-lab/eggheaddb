const fs = require('fs');
const mysql = require('mysql2/promise');

// ── CSV Parser (handles quoted fields with commas/newlines) ─────────
function parseCSV(text) {
  const rows = [];
  let i = 0;
  while (i < text.length) {
    const row = [];
    while (i < text.length) {
      if (text[i] === '"') {
        i++;
        let field = '';
        while (i < text.length) {
          if (text[i] === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') { field += '"'; i += 2; }
            else { i++; break; }
          } else { field += text[i]; i++; }
        }
        row.push(field);
        if (i < text.length && text[i] === ',') i++;
        else if (i < text.length && (text[i] === '\n' || text[i] === '\r')) {
          if (text[i] === '\r' && i + 1 < text.length && text[i + 1] === '\n') i += 2; else i++;
          break;
        }
      } else {
        let field = '';
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') { field += text[i]; i++; }
        row.push(field);
        if (i < text.length && text[i] === ',') i++;
        else if (i < text.length && (text[i] === '\n' || text[i] === '\r')) {
          if (text[i] === '\r' && i + 1 < text.length && text[i + 1] === '\n') i += 2; else i++;
          break;
        }
      }
    }
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) rows.push(row);
  }
  return rows;
}

// ── Helpers ─────────────────────────────────────────────────────────
function yn(val) {
  if (!val) return 0;
  const v = val.toString().trim().toLowerCase();
  return (v === 'yes' || v === '1' || v === 'true') ? 1 : 0;
}

function numOrNull(val) {
  if (!val || val.trim() === '') return null;
  const n = parseFloat(val.replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}

function intOrNull(val) {
  if (!val || val.trim() === '') return null;
  const n = parseInt(val.replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function strOrNull(val, maxLen) {
  if (!val || val.trim() === '') return null;
  return maxLen ? val.trim().substring(0, maxLen) : val.trim();
}

function parseTime(timeStr) {
  if (!timeStr || timeStr.trim() === '') return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const ampm = (match[3] || '').toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
  }
  return null;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  const d = dateStr.trim();
  // M/D/YYYY format
  const match = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const y = parseInt(match[3]);
    if (y < 2000 || y > 2030) return null; // filter out Excel serial dates like 1/23/1900
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  // YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return null;
}

function parseDays(dayStr) {
  if (!dayStr) return [0, 0, 0, 0, 0, 0, 0];
  const d = dayStr.trim().toLowerCase();
  if (d === 'm-f' || d === 'mon-fri' || d === 'weekdays') return [1, 1, 1, 1, 1, 0, 0];
  const days = [0, 0, 0, 0, 0, 0, 0];
  if (d.includes('monday') || d === 'mon') days[0] = 1;
  if (d.includes('tuesday') || d === 'tue' || d === 'tues') days[1] = 1;
  if (d.includes('wednesday') || d === 'wed') days[2] = 1;
  if (d.includes('thursday') || d === 'thu' || d === 'thur' || d === 'thurs') days[3] = 1;
  if (d.includes('friday') || d === 'fri') days[4] = 1;
  if (d.includes('saturday') || d === 'sat') days[5] = 1;
  if (d.includes('sunday') || d === 'sun') days[6] = 1;
  return days;
}

function parseGradeIds(gradeStr) {
  if (!gradeStr || gradeStr.trim() === '') return [];
  const gradeNameToId = {
    'pk': 2, 'tk': 2, 'prek': 2, 'k': 3,
    '1': 4, '2': 5, '3': 6, '4': 7, '5': 8, '6': 9, '7': 10, '8': 11,
    '9': 12, '10': 13, '11': 14, '12': 15,
  };
  const s = gradeStr.trim().toLowerCase().replace(/\s+/g, '').replace(/(\d+)(?:st|nd|rd|th)/g, '$1');
  const direct = gradeNameToId[s];
  if (direct) return [direct];

  // Handle P1, P2 style
  const pMatch = s.match(/^p(\d+)$/);
  if (pMatch && gradeNameToId[pMatch[1]]) return [gradeNameToId[pMatch[1]]];

  // Ranges like K-3, 1-5, TK-3
  const rangeMatch = s.match(/^([a-z]*\d*)-(\d+|[a-z]+\d*)$/);
  if (rangeMatch) {
    function gradeToNum(g) {
      if (g === 'pk' || g === 'tk') return 2;
      if (g === 'k') return 3;
      const n = parseInt(g);
      if (!isNaN(n) && n >= 1 && n <= 12) return n + 3;
      return null;
    }
    const startId = gradeToNum(rangeMatch[1]);
    const endId = gradeToNum(rangeMatch[2]);
    if (startId && endId && startId <= endId) {
      const ids = [];
      for (let g = startId; g <= endId; g++) ids.push(g);
      return ids;
    }
  }

  // Slash combos: TK/K
  if (s.includes('/')) {
    const parts = s.split('/');
    const ids = [];
    for (const p of parts) { const d = gradeNameToId[p.trim()]; if (d) ids.push(d); }
    if (ids.length > 0) return [...new Set(ids)];
  }

  // Numeric ranges: 1-5
  const numRange = s.match(/^(\d+)-(\d+)$/);
  if (numRange) {
    const start = parseInt(numRange[1]), end = parseInt(numRange[2]);
    if (start >= 1 && end <= 12 && start <= end) {
      const ids = [];
      for (let g = start; g <= end; g++) ids.push(g + 3);
      return ids;
    }
  }

  return [];
}

// ── Main Import ─────────────────────────────────────────────────────
async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) { console.error('Usage: node import-programs.js <csv-file>'); process.exit(1); }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  const headers = rows[0];
  const dataRows = rows.slice(1);
  console.log(`Parsed ${dataRows.length} program rows with ${headers.length} columns`);

  const pool = mysql.createPool({ host: 'egghead.mysql.database.azure.com', port: 3306, user: 'eggheaddb', password: 'Meesterodb1*', database: 'program_data', ssl: { rejectUnauthorized: false }, connectionLimit: 5 });

  // ── Load lookup data ──────────────────────────────────────────────
  const [classStatuses] = await pool.query('SELECT id, class_status_name FROM class_status');
  const statusMap = {};
  classStatuses.forEach(s => { statusMap[s.class_status_name.toLowerCase()] = s.id; });

  const [classes] = await pool.query('SELECT id, class_name FROM class WHERE active = 1');
  const classMap = {};
  classes.forEach(c => { classMap[c.class_name.toLowerCase()] = c.id; });

  const [locations] = await pool.query('SELECT id, nickname FROM location');
  const locMap = {};
  locations.forEach(l => { locMap[l.id] = l.nickname; });

  const [professors] = await pool.query('SELECT id, professor_nickname FROM professor');
  const profMap = {};
  professors.forEach(p => { profMap[p.professor_nickname.toLowerCase()] = p.id; });

  const [lessons] = await pool.query('SELECT id, lesson_name FROM lesson WHERE active = 1');
  const lessonMap = {};
  lessons.forEach(l => { lessonMap[l.lesson_name.toLowerCase()] = l.id; });

  const [students] = await pool.query('SELECT id, first_name, last_name FROM student');
  const studentMap = {};
  students.forEach(s => { studentMap[(s.first_name + ' ' + s.last_name).toLowerCase()] = s.id; });

  // ── Find column indices ───────────────────────────────────────────
  function col(name) { return headers.indexOf(name); }
  function getVal(row, colName) {
    const idx = col(colName);
    if (idx < 0 || idx >= row.length) return '';
    return row[idx] || '';
  }

  // Find the repeating session column blocks (each block is 20 columns apart)
  // Dates starts at col("Dates"), then 2,3,...20 follow
  const datesStart = col('Dates');
  const specialTimeStart = col('Special Time');
  const lessonStart = col('Lesson');
  const professorStart = col('Professor');
  const profPayStart = col('Professor Pay');
  const assistantStart = col('Assistant');
  const assistPayStart = col('Assistant Pay');
  const studentNameStart = col('Student Name');
  const studentGenderStart = col('Student Gender/Age');
  const studentNotesStart = col('Student Notes');
  const studentLabFeeStart = col('Student Lab Fee');
  const dateNotesStart = col('Date Specific Notes');

  console.log('Session column starts: dates=' + datesStart + ' specialTime=' + specialTimeStart +
    ' lesson=' + lessonStart + ' professor=' + professorStart + ' profPay=' + profPayStart +
    ' assistant=' + assistantStart + ' assistPay=' + assistPayStart);
  console.log('Student column starts: name=' + studentNameStart + ' gender=' + studentGenderStart +
    ' notes=' + studentNotesStart + ' labFee=' + studentLabFeeStart);
  console.log('Date notes start:', dateNotesStart);

  // ── Clear existing data ───────────────────────────────────────────
  console.log('\nClearing existing data...');
  const conn = await pool.getConnection();
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['session_roster', 'party_session_pay', 'program_session_pay',
    'program_roster', 'program_grade', 'program_cut_type', 'session', 'program']) {
    await conn.query(`DELETE FROM ${t}`);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  conn.release();
  console.log('Cleared all program-related data');

  // ── Process each program ──────────────────────────────────────────
  const unmatchedClasses = new Set();
  const unmatchedProfessors = new Set();
  const unmatchedLessons = new Set();
  let programsInserted = 0, sessionsInserted = 0, gradesInserted = 0;
  let rostersInserted = 0, errors = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const csvId = intOrNull(getVal(row, 'ID'));
    const nickname = strOrNull(getVal(row, 'Program Nickname'), 255);
    if (!nickname) { continue; }

    // ── Map program fields ────────────────────────────────────────
    const statusText = getVal(row, 'Class Status').trim().toLowerCase();
    const statusId = statusMap[statusText] || statusMap['confirmed'] || 2;

    let locationId = intOrNull(getVal(row, 'Location ID'));
    // Verify location exists, null out if not
    if (locationId && !locMap[locationId]) { locationId = null; }

    const programTypeText = getVal(row, 'Program Type').trim().toLowerCase();
    let programTypeId = 1; // default Class
    let live = 1;
    if (programTypeText.includes('camp')) programTypeId = 2;
    else if (programTypeText.includes('workshop')) programTypeId = 3;
    if (programTypeText.includes('virtual')) live = 0;

    const className = getVal(row, 'Class Name').trim();
    let classId = className ? classMap[className.toLowerCase()] : null;
    if (className && !classId) unmatchedClasses.add(className);

    const startTime = parseTime(getVal(row, 'Start Time'));
    const classLength = intOrNull(getVal(row, 'Class Length (Minutes)'));
    const days = parseDays(getVal(row, 'Day'));
    const generalNotes = strOrNull(getVal(row, 'General Notes'), 1024);
    const parentCost = numOrNull(getVal(row, 'Parent Cost'));
    const ourCut = numOrNull(getVal(row, 'Our Cut'));
    const labFee = numOrNull(getVal(row, 'Lab Fee'));
    const numEnrolled = intOrNull(getVal(row, 'Number Enrolled'));
    const minStudents = intOrNull(getVal(row, 'Minimum Students'));
    const maxStudents = intOrNull(getVal(row, 'Maximum Students'));
    const rosterReceived = yn(getVal(row, 'Roster Received'));
    const rosterConfirmed = yn(getVal(row, 'Roster Confirmed'));
    const rosterNotes = strOrNull(getVal(row, 'Roster Notes'), 1024);
    const degreesPrinted = strOrNull(getVal(row, 'Degrees Printed'), 64);
    const paymentThroughUs = yn(getVal(row, 'Payment through Us'));
    const invoiceSent = parseDate(getVal(row, 'Invoice Sent'));
    const invoiceNotes = strOrNull(getVal(row, 'Invoice Notes'), 1024);

    const specialInfoRequired = strOrNull(getVal(row, 'Special Info Required'), 1024);

    // Lead professor
    const leadProfText = getVal(row, 'Lead Professor').trim();
    let leadProfId = leadProfText ? profMap[leadProfText.toLowerCase()] : null;
    if (leadProfText && !leadProfId) unmatchedProfessors.add('Lead: ' + leadProfText);
    const leadProfPay = numOrNull(getVal(row, 'Lead Professor Pay'));

    const tbRequired = yn(getVal(row, 'TB Required'));
    const livescanRequired = yn(getVal(row, 'Livescan Required'));
    const virtusRequired = yn(getVal(row, 'Virtus Required'));
    const rosterLink = strOrNull(getVal(row, 'Roster Link'), 1024);

    // Demo fields
    const demoRequired = yn(getVal(row, 'Demo Required'));
    const demoDate = parseDate(getVal(row, 'Demo Date'));
    const demoTime = parseTime(getVal(row, 'Demo Time'));
    const demoTypeText = getVal(row, 'Demo Type').trim().toLowerCase();
    let demoTypeId = null;
    if (demoTypeText === 'no') demoTypeId = 5;
    else if (demoTypeText === 'recess') demoTypeId = 7;
    else if (demoTypeText === 'lunch') demoTypeId = 4;
    else if (demoTypeText === 'presentation') demoTypeId = 6;
    else if (demoTypeText === 'booth') demoTypeId = 2;
    else if (demoTypeText === 'fair') demoTypeId = 3;
    else if (demoTypeText === 'before school assembly') demoTypeId = 1;
    const demoPay = intOrNull(getVal(row, 'Demo Pay'));
    const demoProfText = getVal(row, 'Demo Professor').trim();
    let demoProfId = demoProfText ? profMap[demoProfText.toLowerCase()] : null;
    if (demoProfText && !demoProfId) unmatchedProfessors.add('Demo: ' + demoProfText);
    const demoNotes = strOrNull(getVal(row, 'Demo Notes'), 1024);

    // Flyer fields
    const flyerRequired = yn(getVal(row, 'Flyer Required'));
    const flyerMade = parseDate(getVal(row, 'Flyer Made'));
    const flyerSentElectronic = parseDate(getVal(row, 'Flyer Sent (Electronic)'));
    const flyerDroppedPhysical = parseDate(getVal(row, 'Flyer Dropped (Physical)'));
    const registrationOpened = parseDate(getVal(row, 'Registration Opened Online'));
    const openBlast = yn(getVal(row, 'Open Blast Sent'));
    const twoWeekBlast = yn(getVal(row, '2 Week Blast Sent'));
    const oneWeekBlast = yn(getVal(row, '1 Week Blast Sent'));
    const finalBlast = yn(getVal(row, 'Final Blast Sent'));
    const parentFeedback = yn(getVal(row, 'Parent Feedback Requested'));

    // Contract/permit
    const contractText = getVal(row, 'Contract/Permit Required').trim().toLowerCase();
    let contractId = null;
    if (contractText === 'yes') contractId = 10;
    else if (contractText === 'no') contractId = 6;

    // Count sessions to get session_count and first/last dates
    const sessionDates = [];
    for (let s = 0; s < 20; s++) {
      const idx = datesStart + s;
      if (idx < row.length) {
        const d = parseDate(row[idx]);
        if (d) sessionDates.push(d);
      }
    }
    const sessionCount = sessionDates.length;
    const firstDate = sessionDates.length > 0 ? sessionDates[0] : null;
    const lastDate = sessionDates.length > 0 ? sessionDates[sessionDates.length - 1] : null;

    // ── Insert program ────────────────────────────────────────────
    try {
      const insertSql = `INSERT INTO program (
        id, program_nickname, class_status_id, location_id, live, class_id,
        start_time, class_length_minutes, monday, tuesday, wednesday, thursday, friday, saturday, sunday,
        general_notes, parent_cost, our_cut, lab_fee, number_enrolled, session_count,
        minimum_students, maximum_students, roster_received, roster_confirmed, roster_notes,
        degrees_printed, payment_through_us, invoice_date_sent, invoice_notes,
        contract_permit_required_id, special_info_required,
        lead_professor_id, lead_professor_pay, tb_required, livescan_required, virtus_required,
        roster_link, demo_required, demo_date, demo_start_time, demo_type_id, demo_pay,
        demo_professor_id, demo_notes, flyer_required, flyer_made, flyer_sent_electronic,
        flyer_dropped_physical, registration_opened_online,
        open_blast_sent, two_week_blast_sent, one_week_blast_sent, final_blast_sent,
        parent_feedback_requested, first_session_date, last_session_date,
        ts_inserted, ts_updated, active
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        NOW(), NOW(), 1
      )`;

      await pool.query(insertSql, [
        csvId, nickname, statusId, locationId, live, classId,
        startTime, classLength, ...days,
        generalNotes, parentCost, ourCut, labFee, numEnrolled, sessionCount,
        minStudents, maxStudents, rosterReceived, rosterConfirmed, rosterNotes,
        degreesPrinted, paymentThroughUs, invoiceSent, invoiceNotes,
        contractId, specialInfoRequired,
        leadProfId, leadProfPay, tbRequired, livescanRequired, virtusRequired,
        rosterLink, demoRequired, demoDate, demoTime, demoTypeId, demoPay,
        demoProfId, demoNotes, flyerRequired, flyerMade, flyerSentElectronic,
        flyerDroppedPhysical, registrationOpened,
        openBlast, twoWeekBlast, oneWeekBlast, finalBlast,
        parentFeedback, firstDate, lastDate,
      ]);
      programsInserted++;

      // ── Insert grades ─────────────────────────────────────────────
      const gradeIds = parseGradeIds(getVal(row, 'Grades'));
      for (const gId of gradeIds) {
        await pool.query('INSERT INTO program_grade (program_id, grade_id) VALUES (?, ?)', [csvId, gId]);
        gradesInserted++;
      }

      // ── Insert sessions ───────────────────────────────────────────
      for (let s = 0; s < 20; s++) {
        const dateIdx = datesStart + s;
        if (dateIdx >= row.length) break;
        const sessionDate = parseDate(row[dateIdx]);
        if (!sessionDate) continue;

        // Session time (special time overrides default)
        let sessionTime = startTime;
        if (specialTimeStart >= 0) {
          const st = parseTime(row[specialTimeStart + s] || '');
          if (st) sessionTime = st;
        }

        // Lesson
        let lessonId = null;
        if (lessonStart >= 0 && (lessonStart + s) < row.length) {
          const lessonText = (row[lessonStart + s] || '').trim();
          if (lessonText) {
            lessonId = lessonMap[lessonText.toLowerCase()];
            if (!lessonId) unmatchedLessons.add(lessonText);
          }
        }

        // Professor
        let sessionProfId = leadProfId; // default to lead
        let sessionProfPay = null;
        if (professorStart >= 0 && (professorStart + s) < row.length) {
          const profText = (row[professorStart + s] || '').trim();
          if (profText) {
            const matched = profMap[profText.toLowerCase()];
            if (matched) sessionProfId = matched;
            else unmatchedProfessors.add('Session: ' + profText);
          }
        }
        if (profPayStart >= 0 && (profPayStart + s) < row.length) {
          sessionProfPay = numOrNull(row[profPayStart + s] || '');
        }

        // Assistant
        let assistId = null, assistPay = null;
        if (assistantStart >= 0 && (assistantStart + s) < row.length) {
          const assistText = (row[assistantStart + s] || '').trim();
          if (assistText) {
            assistId = profMap[assistText.toLowerCase()];
            if (!assistId) unmatchedProfessors.add('Assistant: ' + assistText);
          }
        }
        if (assistPayStart >= 0 && (assistPayStart + s) < row.length) {
          assistPay = numOrNull(row[assistPayStart + s] || '');
        }

        // Date-specific notes
        let specificNotes = null;
        if (dateNotesStart >= 0 && (dateNotesStart + s) < row.length) {
          specificNotes = strOrNull(row[dateNotesStart + s] || '', 1024);
        }

        await pool.query(
          `INSERT INTO session (program_id, lesson_id, professor_id, professor_pay,
            assistant_id, assistant_pay, session_date, session_time, specific_notes,
            not_billed, ts_inserted, ts_updated, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW(), 1)`,
          [csvId, lessonId, sessionProfId, sessionProfPay, assistId, assistPay,
           sessionDate, sessionTime, specificNotes]
        );
        sessionsInserted++;
      }

      // ── Insert student roster ─────────────────────────────────────
      if (studentNameStart >= 0) {
        for (let s = 0; s < 20; s++) {
          const nameIdx = studentNameStart + s;
          if (nameIdx >= row.length) break;
          const studentName = (row[nameIdx] || '').trim();
          if (!studentName) continue;

          // Try to find existing student
          let studentId = studentMap[studentName.toLowerCase()];

          if (!studentId) {
            // Create student
            const parts = studentName.split(/\s+/);
            const firstName = parts[0] || studentName;
            const lastName = parts.slice(1).join(' ') || '';
            try {
              const [result] = await pool.query(
                'INSERT INTO student (first_name, last_name, ts_inserted, ts_updated, active) VALUES (?, ?, NOW(), NOW(), 1)',
                [firstName.substring(0, 64), lastName.substring(0, 64)]
              );
              studentId = result.insertId;
              studentMap[studentName.toLowerCase()] = studentId;
            } catch (e) {
              continue; // skip if can't create
            }
          }

          // Gender/Age
          let gender = null, age = null;
          if (studentGenderStart >= 0 && (studentGenderStart + s) < row.length) {
            const ga = (row[studentGenderStart + s] || '').trim();
            if (ga) {
              const gMatch = ga.match(/^(M|F|Male|Female)/i);
              if (gMatch) gender = gMatch[1].substring(0, 1).toUpperCase();
              const aMatch = ga.match(/(\d+)/);
              if (aMatch) age = parseInt(aMatch[1]);
            }
          }

          // Notes
          let notes = null;
          if (studentNotesStart >= 0 && (studentNotesStart + s) < row.length) {
            notes = strOrNull(row[studentNotesStart + s] || '', 255);
          }

          // Lab fee
          let labFeeStr = null;
          if (studentLabFeeStart >= 0 && (studentLabFeeStart + s) < row.length) {
            labFeeStr = strOrNull(row[studentLabFeeStart + s] || '', 255);
          }

          await pool.query(
            `INSERT INTO program_roster (program_id, student_id, gender, age, date_applied,
              student_lab_fee, notes, ts_inserted, ts_updated, active)
             VALUES (?, ?, ?, ?, CURDATE(), ?, ?, NOW(), NOW(), 1)`,
            [csvId, studentId, gender, age, labFeeStr, notes]
          );
          rostersInserted++;
        }
      }

      if (programsInserted % 200 === 0) console.log(`  Processed ${programsInserted} programs...`);
    } catch (e) {
      console.error(`Row ${i + 1} (ID ${csvId}, ${nickname}): ${e.message}`);
      errors++;
    }
  }

  // ── Report ────────────────────────────────────────────────────────
  console.log('\n=== Import Complete ===');
  console.log(`Programs inserted: ${programsInserted}`);
  console.log(`Sessions inserted: ${sessionsInserted}`);
  console.log(`Grades inserted: ${gradesInserted}`);
  console.log(`Roster entries inserted: ${rostersInserted}`);
  console.log(`Errors: ${errors}`);

  if (unmatchedClasses.size > 0) {
    console.log(`\n=== UNMATCHED CLASSES (${unmatchedClasses.size}) ===`);
    [...unmatchedClasses].sort().forEach(c => console.log('  ' + c));
  }
  if (unmatchedProfessors.size > 0) {
    console.log(`\n=== UNMATCHED PROFESSORS (${unmatchedProfessors.size}) ===`);
    [...unmatchedProfessors].sort().forEach(p => console.log('  ' + p));
  }
  if (unmatchedLessons.size > 0) {
    console.log(`\n=== UNMATCHED LESSONS (${unmatchedLessons.size}) ===`);
    [...unmatchedLessons].sort().forEach(l => console.log('  ' + l));
  }

  // Final counts
  const [pc] = await pool.query('SELECT COUNT(*) as cnt FROM program');
  const [sc2] = await pool.query('SELECT COUNT(*) as cnt FROM session');
  const [gc] = await pool.query('SELECT COUNT(*) as cnt FROM program_grade');
  const [rc] = await pool.query('SELECT COUNT(*) as cnt FROM program_roster');
  console.log(`\nDB totals: programs=${pc[0].cnt} sessions=${sc2[0].cnt} grades=${gc[0].cnt} rosters=${rc[0].cnt}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
