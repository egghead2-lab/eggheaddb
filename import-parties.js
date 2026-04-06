const fs = require('fs');
const mysql = require('mysql2/promise');

// ── CSV Parser ──────────────────────────────────────────────────────
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
  return (v === 'yes' || v === '1' || v === 'true' || v === 'x') ? 1 : 0;
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
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const ampm = (match[3] ? '' : match[4] || '').toUpperCase() || (match[4] || '').toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
  }
  return null;
}
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  const d = dateStr.trim();
  const match = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const y = parseInt(match[3]);
    if (y < 2000 || y > 2030) return null;
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return null;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) { console.error('Usage: node import-parties.js <csv-file>'); process.exit(1); }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  const headers = rows[0];
  const dataRows = rows.slice(1);
  console.log(`Parsed ${dataRows.length} party rows with ${headers.length} columns`);

  const pool = mysql.createPool({ host: 'egghead.mysql.database.azure.com', port: 3306, user: 'eggheaddb', password: 'Meesterodb1*', database: 'program_data', ssl: { rejectUnauthorized: false }, connectionLimit: 5 });

  // ── Load lookups ──────────────────────────────────────────────────
  const [professors] = await pool.query('SELECT id, professor_nickname FROM professor');
  const profMap = {};
  professors.forEach(p => { profMap[p.professor_nickname.toLowerCase()] = p.id; });

  const [classStatuses] = await pool.query('SELECT id, class_status_name FROM class_status');
  const statusMap = {};
  classStatuses.forEach(s => { statusMap[s.class_status_name.toLowerCase()] = s.id; });

  const [partyFormats] = await pool.query('SELECT id, party_format_name FROM party_format WHERE active = 1');
  const formatMap = {};
  partyFormats.forEach(f => { formatMap[f.party_format_name.toLowerCase()] = f.id; });

  const [partyClasses] = await pool.query('SELECT id, class_name FROM class WHERE program_type_id = 4 AND active = 1');
  const themeMap = {};
  partyClasses.forEach(c => { themeMap[c.class_name.toLowerCase()] = c.id; });
  // Build reverse lookup: format name -> "Party / Format" class
  partyFormats.forEach(f => {
    const className = 'party / ' + f.party_format_name.toLowerCase();
    if (themeMap[className]) formatMap['_class_' + f.party_format_name.toLowerCase()] = themeMap[className];
  });

  const [areas] = await pool.query('SELECT id, geographic_area_name FROM geographic_area WHERE active = 1');
  const areaMap = {};
  areas.forEach(a => { areaMap[a.geographic_area_name.toLowerCase()] = a.id; });

  const [cities] = await pool.query('SELECT id, city_name, zip_code FROM city');
  const cityByZip = {};
  cities.forEach(c => { cityByZip[c.zip_code] = c.id; });

  const [states] = await pool.query('SELECT id, state_code FROM state');
  const stateMap = {};
  states.forEach(s => { stateMap[s.state_code.toLowerCase()] = s.id; });

  // Parent cache (by email)
  const [existingParents] = await pool.query('SELECT id, email FROM parent WHERE active = 1');
  const parentByEmail = {};
  existingParents.forEach(p => { if (p.email) parentByEmail[p.email.toLowerCase()] = p.id; });

  // Student cache
  const [existingStudents] = await pool.query('SELECT id, first_name, last_name FROM student');
  const studentByName = {};
  existingStudents.forEach(s => { studentByName[(s.first_name + ' ' + s.last_name).toLowerCase().trim()] = s.id; });

  function col(name) { return headers.indexOf(name); }
  function getVal(row, colName) {
    const idx = col(colName);
    if (idx < 0 || idx >= row.length) return '';
    return row[idx] || '';
  }

  // ── Process parties ───────────────────────────────────────────────
  let inserted = 0, errors = 0;
  const unmatchedProfs = new Set();
  const unmatchedThemes = new Set();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const nickname = strOrNull(getVal(row, 'Party Nickname'), 255);
    if (!nickname) continue;

    // Date & time
    const partyDate = parseDate(getVal(row, 'Date'));
    const startTime = parseTime(getVal(row, 'Start Time'));
    const lengthMinsRaw = numOrNull(getVal(row, 'Length (Minutes)'));
    const lengthMins = lengthMinsRaw ? Math.round(lengthMinsRaw) : null;

    // Contact → Parent
    const contactName = strOrNull(getVal(row, 'Contact Name'), 128);
    const contactEmail = strOrNull(getVal(row, 'Contact Email'), 128);
    const contactPhone = strOrNull(getVal(row, 'Contact Phone'), 128);

    let parentId = null;
    if (contactEmail && parentByEmail[contactEmail.toLowerCase()]) {
      parentId = parentByEmail[contactEmail.toLowerCase()];
    } else if (contactName) {
      // Create parent
      const parts = contactName.split(/\s+/);
      const firstName = parts[0] || contactName;
      const lastName = parts.slice(1).join(' ') || '';
      try {
        const [result] = await pool.query(
          'INSERT INTO parent (first_name, last_name, email, phone, ts_inserted, ts_updated, active) VALUES (?, ?, ?, ?, NOW(), NOW(), 1)',
          [firstName.substring(0, 64), lastName.substring(0, 64), contactEmail, contactPhone]
        );
        parentId = result.insertId;
        if (contactEmail) parentByEmail[contactEmail.toLowerCase()] = parentId;
      } catch (e) {
        // Might be duplicate — try to find
        if (contactEmail) {
          const [found] = await pool.query('SELECT id FROM parent WHERE email = ?', [contactEmail]);
          if (found.length > 0) { parentId = found[0].id; parentByEmail[contactEmail.toLowerCase()] = parentId; }
        }
      }
    }

    // Location text
    const address = strOrNull(getVal(row, 'Address'), 128) || '';
    const city = strOrNull(getVal(row, 'City'), 64) || '';
    const state = strOrNull(getVal(row, 'State'), 2) || '';
    const zip = strOrNull(getVal(row, 'Zip'), 16) || '';
    const locationText = [address, city, state, zip].filter(Boolean).join(', ');

    // Geographic area
    const areaText = getVal(row, 'Geographic Area').trim().toLowerCase();
    const areaId = areaMap[areaText] || null;

    // City ID (for parent)
    let cityId = zip ? cityByZip[zip] : null;
    if (!cityId && city && zip) {
      const stateId = stateMap[(state || 'ca').toLowerCase()] || 5;
      try {
        const [result] = await pool.query(
          'INSERT INTO city (city_name, zip_code, state_id, geographic_area_id) VALUES (?, ?, ?, ?)',
          [city.substring(0, 64), zip.substring(0, 16), stateId, areaId || 9]
        );
        cityId = result.insertId;
        cityByZip[zip] = cityId;
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
          const [found] = await pool.query('SELECT id FROM city WHERE zip_code = ?', [zip]);
          if (found.length) { cityId = found[0].id; cityByZip[zip] = cityId; }
        }
      }
    }

    // Update parent with city if we have one
    if (parentId && cityId) {
      await pool.query('UPDATE parent SET city_id = ?, address = ? WHERE id = ? AND city_id IS NULL', [cityId, address, parentId]);
    }

    // Child → Student
    const childName = strOrNull(getVal(row, 'Child Name'), 128);
    const childAge = intOrNull(getVal(row, 'Child Age'));
    let studentId = null;

    if (childName && childName.toLowerCase() !== 'na' && childName.toLowerCase() !== 'n/a') {
      const key = childName.toLowerCase().trim();
      if (studentByName[key]) {
        studentId = studentByName[key];
      } else {
        const parts = childName.split(/\s+/);
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ') || '';
        try {
          const [result] = await pool.query(
            'INSERT INTO student (first_name, last_name, ts_inserted, ts_updated, active) VALUES (?, ?, NOW(), NOW(), 1)',
            [firstName.substring(0, 64), lastName.substring(0, 64)]
          );
          studentId = result.insertId;
          studentByName[key] = studentId;
        } catch (e) { /* skip */ }
      }

      // Link student ↔ parent
      if (studentId && parentId) {
        try {
          await pool.query(
            'INSERT INTO student_parent (student_id, parent_id, parent_role_id, ts_inserted, ts_updated, active) VALUES (?, ?, 1, NOW(), NOW(), 1)',
            [studentId, parentId]
          );
        } catch (e) { /* duplicate link is fine */ }
      }
    }

    // Event type → party_format_id
    const eventType = getVal(row, 'Event Type').trim().toLowerCase();
    const partyFormatId = formatMap[eventType] || null;

    // Event theme → class_id
    const eventTheme = getVal(row, 'Event Theme').trim();
    let classId = null;
    if (eventTheme) {
      // Try exact match in party classes
      classId = themeMap[eventTheme.toLowerCase()];
      // Try "Party / Theme" pattern
      if (!classId) classId = themeMap[('party / ' + eventTheme).toLowerCase()];
      // Try matching just the theme name across all classes
      if (!classId) {
        const [allMatch] = await pool.query('SELECT id FROM class WHERE LOWER(class_name) = ? AND active = 1', [eventTheme.toLowerCase()]);
        if (allMatch.length > 0) classId = allMatch[0].id;
      }
      if (!classId) unmatchedThemes.add(eventTheme);
    }
    // If no theme but we have a format, use the "Party / Format" class
    if (!classId && partyFormatId) {
      const formatName = partyFormats.find(f => f.id === partyFormatId)?.party_format_name;
      if (formatName) classId = themeMap[('party / ' + formatName).toLowerCase()];
    }

    // Professors
    const leadProfText = getVal(row, 'Lead Professor').trim();
    let leadProfId = leadProfText ? profMap[leadProfText.toLowerCase()] : null;
    if (leadProfText && !leadProfId) unmatchedProfs.add('Lead: ' + leadProfText);

    const assistProfText = getVal(row, 'Assistant Professor').trim();
    let assistProfId = assistProfText ? profMap[assistProfText.toLowerCase()] : null;
    if (assistProfText && !assistProfId) unmatchedProfs.add('Asst: ' + assistProfText);

    // Status
    const statusText = getVal(row, 'Status').trim().toLowerCase();
    const statusId = statusMap[statusText] || statusMap['confirmed'] || 2;

    // Notes
    const notes = strOrNull(getVal(row, 'Notes'), 1024);

    // Shirt size, glow slime
    const shirtSize = strOrNull(getVal(row, 'Shirt Size'), 64);
    const glowSlime = intOrNull(getVal(row, 'Glow Slime Amount Needed'));
    const calendarEvent = strOrNull(getVal(row, 'Calendar Event ID'), 1024);
    const materialsPrepared = yn(getVal(row, 'Materials Prepared'));
    const detailsConfirmed = parseDate(getVal(row, 'Details Confirmed'));
    const invoiceNeeded = yn(getVal(row, 'Invoice Needed'));
    const howHeard = strOrNull(getVal(row, 'How Heard'), 32);
    const expectedMargin = numOrNull(getVal(row, 'Expected Margin'));

    // Financial fields
    const leadPay = numOrNull(getVal(row, 'Lead Professor Pay'));
    const leadDrive = numOrNull(getVal(row, 'Lead Professor Drive Fee'));
    const leadTip = numOrNull(getVal(row, 'Lead Professor Tip'));
    const leadDryIce = numOrNull(getVal(row, 'Lead Professor Dry Ice'));
    const leadReimbPaid = yn(getVal(row, 'Lead Reimbursements Paid'));
    const assistRequired = yn(getVal(row, 'Assistant Required'));
    const assistPay = numOrNull(getVal(row, 'Assistant Professor Pay'));
    const assistDrive = numOrNull(getVal(row, 'Assistant Professor Drive Fee'));
    const assistTip = numOrNull(getVal(row, 'Assistant Professor Tip'));
    const assistDryIce = numOrNull(getVal(row, 'Assistant Professor Dry Ice'));
    const assistReimbPaid = yn(getVal(row, 'Assistant Reimbursements Paid'));
    const basePrice = numOrNull(getVal(row, 'Base Party Price'));
    const driveFee = numOrNull(getVal(row, 'Drive Fee'));
    const lateBookingFee = numOrNull(getVal(row, 'Late Booking Fee'));
    const totalKids = intOrNull(getVal(row, 'Total Kids Attended'));
    const extraKidsFee = numOrNull(getVal(row, 'Extra Kids Fee'));
    const extraTimeFee = numOrNull(getVal(row, 'Extra Time Fee'));
    const depositDate = parseDate(getVal(row, 'Deposit Date'));
    const depositAmount = numOrNull(getVal(row, 'Deposit Amount'));
    const totalPartyCost = numOrNull(getVal(row, 'Total Party Cost'));
    const emailedFollowUp = parseDate(getVal(row, 'Emailed Follow Up'));
    const chargeConfirmed = yn(getVal(row, 'Charge Confirmed'));
    const finalChargeDate = parseDate(getVal(row, 'Final Charge Date'));
    const finalChargeType = strOrNull(getVal(row, 'Final Charge Type'), 1024);
    const kidsExpected = intOrNull(getVal(row, 'Kids Expected'));

    try {
      const [result] = await pool.query(
        `INSERT INTO program (
          program_nickname, class_status_id, live, class_id,
          start_time, class_length_minutes,
          monday, tuesday, wednesday, thursday, friday, saturday, sunday,
          general_notes, session_count,
          parent_id, shirt_size, glow_slime_amount_needed, calendar_event, materials_prepared,
          details_confirmed, invoice_needed, how_heard, expected_margin,
          lead_professor_id, lead_professor_pay, lead_professor_drive_fee, lead_professor_tip,
          lead_professor_dry_ice, lead_reimbursements_paid,
          assistant_required, assistant_professor_id, assistant_professor_pay,
          assistant_professor_drive_fee, assistant_professor_tip, assistant_professor_dry_ice,
          assistant_reimbursements_paid,
          base_party_price, drive_fee, late_booking_fee, total_kids_attended,
          extra_kids_fee, extra_time_fee, deposit_date, deposit_amount, total_party_cost,
          emailed_follow_up, charge_confirmed, final_charge_date, final_charge_type,
          party_format_id, party_location_text,
          first_session_date, last_session_date, maximum_students,
          payment_through_us,
          ts_inserted, ts_updated, active
        ) VALUES (
          ?, ?, 1, ?,
          ?, ?,
          0, 0, 0, 0, 0, 0, 0,
          ?, 1,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          1,
          NOW(), NOW(), 1
        )`,
        [
          nickname, statusId, classId,
          startTime, lengthMins,
          notes,
          parentId, shirtSize, glowSlime, calendarEvent, materialsPrepared,
          detailsConfirmed, invoiceNeeded, howHeard, expectedMargin,
          leadProfId, leadPay, leadDrive, leadTip,
          leadDryIce, leadReimbPaid,
          assistRequired, assistProfId, assistPay,
          assistDrive, assistTip, assistDryIce,
          assistReimbPaid,
          basePrice, driveFee, lateBookingFee, totalKids,
          extraKidsFee, extraTimeFee, depositDate, depositAmount, totalPartyCost,
          emailedFollowUp, chargeConfirmed, finalChargeDate, finalChargeType,
          partyFormatId, strOrNull(locationText, 255),
          partyDate, partyDate, kidsExpected,
        ]
      );

      const programId = result.insertId;

      // Create a session for the party date
      if (partyDate) {
        await pool.query(
          `INSERT INTO session (program_id, lesson_id, professor_id, professor_pay,
            assistant_id, assistant_pay, session_date, session_time,
            not_billed, ts_inserted, ts_updated, active)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW(), 1)`,
          [programId, leadProfId, leadPay, assistProfId, assistPay, partyDate, startTime]
        );
      }

      // Add child to roster
      if (studentId) {
        try {
          await pool.query(
            `INSERT INTO program_roster (program_id, student_id, age, date_applied,
              ts_inserted, ts_updated, active)
             VALUES (?, ?, ?, CURDATE(), NOW(), NOW(), 1)`,
            [programId, studentId, childAge]
          );
        } catch (e) { /* duplicate is fine */ }
      }

      inserted++;
      if (inserted % 200 === 0) console.log(`  Processed ${inserted} parties...`);
    } catch (e) {
      console.error(`Row ${i + 1} (${nickname}): ${e.message}`);
      errors++;
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`Parties inserted: ${inserted}`);
  console.log(`Errors: ${errors}`);

  if (unmatchedProfs.size > 0) {
    console.log(`\n=== UNMATCHED PROFESSORS (${unmatchedProfs.size}) ===`);
    [...unmatchedProfs].sort().forEach(p => console.log('  ' + p));
  }
  if (unmatchedThemes.size > 0) {
    console.log(`\n=== UNMATCHED THEMES (${unmatchedThemes.size}) ===`);
    [...unmatchedThemes].sort().forEach(t => console.log('  ' + t));
  }

  const [pc] = await pool.query('SELECT COUNT(*) as cnt FROM program');
  const [parentCount] = await pool.query('SELECT COUNT(*) as cnt FROM parent');
  const [spCount] = await pool.query('SELECT COUNT(*) as cnt FROM student_parent');
  console.log(`\nDB totals: programs=${pc[0].cnt} parents=${parentCount[0].cnt} student_parent_links=${spCount[0].cnt}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
