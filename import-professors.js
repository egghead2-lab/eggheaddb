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
function ynOrNull(val) {
  if (!val || val.trim() === '') return null;
  return yn(val);
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
  const s = val.trim();
  return maxLen ? s.substring(0, maxLen) : s;
}
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  const d = dateStr.trim();
  // M/D/YYYY
  const match = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    let y = parseInt(match[3]);
    if (y < 100) y += 2000;
    if (y < 2000 || y > 2030) return null;
    return `${y}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // Excel serial number (5-digit number)
  const serial = parseInt(d);
  if (!isNaN(serial) && serial > 40000 && serial < 50000) {
    const epoch = new Date(1899, 11, 30);
    const dt = new Date(epoch.getTime() + serial * 86400000);
    return dt.toISOString().split('T')[0];
  }
  return null;
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

// Parse address like "5536 Summerhill Dr, Los Angeles, CA 90043" into parts
function parseFullAddress(fullAddr) {
  if (!fullAddr) return { street: null, city: null, state: null, zip: null };
  const s = fullAddr.trim();
  // Try "street, city, state zip" or "street, city state zip"
  const match = s.match(/^(.+?),\s*([^,]+?),?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (match) {
    return { street: match[1].trim(), city: match[2].trim(), state: match[3].trim(), zip: match[4].trim() };
  }
  // Try just "street, city CA zip"
  const match2 = s.match(/^(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (match2) {
    return { street: match2[1].trim(), city: null, state: match2[2].trim(), zip: match2[3].trim() };
  }
  return { street: s, city: null, state: null, zip: null };
}

// ── Main Import ─────────────────────────────────────────────────────
async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) { console.error('Usage: node import-professors.js <csv-file>'); process.exit(1); }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  const headers = rows[0];
  const dataRows = rows.slice(1);
  console.log(`Parsed ${dataRows.length} professor rows with ${headers.length} columns`);

  const pool = mysql.createPool({
    host: 'egghead.mysql.database.azure.com', port: 3306,
    user: 'eggheaddb', password: 'Meesterodb1*', database: 'program_data',
    ssl: { rejectUnauthorized: false }, connectionLimit: 5,
  });

  // ── Column helper ────────────────────────────────────────────────
  function col(name) { return headers.indexOf(name); }
  function getVal(row, colName) {
    const idx = col(colName);
    if (idx < 0 || idx >= row.length) return '';
    return (row[idx] || '').trim();
  }

  // ── Load lookups ─────────────────────────────────────────────────
  const [statuses] = await pool.query('SELECT id, professor_status_name FROM professor_status');
  const statusMap = {};
  statuses.forEach(s => { statusMap[s.professor_status_name.toLowerCase()] = s.id; });

  const [areas] = await pool.query('SELECT id, geographic_area_name, scheduling_coordinator_user_id FROM geographic_area');
  const areaMap = {};
  const areaScMap = {};
  areas.forEach(a => { areaMap[a.geographic_area_name.toLowerCase()] = a.id; areaScMap[a.id] = a.scheduling_coordinator_user_id; });
  // Aliases
  areaMap['south oc'] = areaMap['oc'] || 6;
  areaMap['norcal'] = areaMap['norcal'] || 13;

  const [cities] = await pool.query('SELECT id, city_name, zip_code, geographic_area_id FROM city');
  const cityByZip = {};
  cities.forEach(c => { cityByZip[c.zip_code] = c; });

  const [states] = await pool.query('SELECT id, state_code FROM state');
  const stateMap = {};
  states.forEach(s => { stateMap[s.state_code.toLowerCase()] = s.id; });

  const [locations] = await pool.query('SELECT id, nickname FROM location WHERE active = 1');
  const locByNickname = {};
  locations.forEach(l => { locByNickname[l.nickname.toLowerCase()] = l.id; });

  const [subReasons] = await pool.query('SELECT id, reason_name FROM substitute_reason WHERE active = 1');
  const subReasonMap = {};
  subReasons.forEach(r => { subReasonMap[r.reason_name.toLowerCase()] = r.id; });

  const [bins] = await pool.query('SELECT id, bin_name FROM bin WHERE active = 1');
  const binMap = {};
  bins.forEach(b => { binMap[b.bin_name.toLowerCase()] = b.id; });

  const [weekdays] = await pool.query('SELECT id, weekday_name FROM weekday ORDER BY id');
  const weekdayMap = {};
  weekdays.forEach(w => { weekdayMap[w.weekday_name.toLowerCase()] = w.id; });

  // User map by first name
  const [users] = await pool.query('SELECT id, first_name, last_name FROM user WHERE active = 1');
  const userByFirst = {};
  users.forEach(u => { userByFirst[u.first_name.toLowerCase()] = u.id; });

  // Helper: get or create city
  async function getOrCreateCity(cityName, zip, stateCode, geoAreaId) {
    if (!zip) return null;
    zip = zip.trim().substring(0, 5);
    if (cityByZip[zip]) return cityByZip[zip].id;
    const stateId = stateMap[(stateCode || 'ca').toLowerCase()] || stateMap['california'] || 5;
    const areaId = geoAreaId || 9;
    try {
      const [result] = await pool.query(
        'INSERT INTO city (city_name, zip_code, state_id, geographic_area_id) VALUES (?, ?, ?, ?)',
        [(cityName || 'Unknown').substring(0, 64), zip, stateId, areaId]
      );
      cityByZip[zip] = { id: result.insertId };
      return result.insertId;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        const [existing] = await pool.query('SELECT id FROM city WHERE zip_code = ?', [zip]);
        if (existing.length) { cityByZip[zip] = { id: existing[0].id }; return existing[0].id; }
      }
      return null;
    }
  }

  // Map substitute reason text to ID
  function mapSubReason(text) {
    if (!text) return null;
    const v = text.trim().toLowerCase();
    if (v === 'requested pre-session' || v === 'requested before term began') return 8; // Other
    if (v.includes('sick') || v === 'sickness' || v === 'fever') return 2;
    if (v.includes('family') || v === 'family emergency' || v === 'family care') return 4;
    if (v.includes('school') || v === 'school conflict' || v === 'midterms') return 5;
    if (v.includes('other work') || v.includes('other job') || v === 'other work popped up') return 6;
    if (v.includes('vacation') || v.includes('travel') || v.includes('out of town')) return 1;
    if (v.includes('training')) return 7;
    if (v.includes('car') || v.includes('last minute') || v.includes('offset') || v.includes('callout')) return 8;
    if (v.includes('jury')) return 8;
    if (v.includes('doctor') || v.includes('medical') || v.includes('surgery') || v.includes('dental') || v.includes('procedure')) return 3; // Personal
    if (v.includes('personal')) return 3;
    if (v.includes('resign') || v.includes('moving') || v.includes('quit')) return 8;
    if (v.includes('covid')) return 2;
    if (v.includes('religious')) return 3;
    if (v.includes('fire') || v.includes('evacuation')) return 4;
    if (v.includes('funeral') || v.includes('death')) return 4;
    if (v.includes('weather')) return 8;
    if (v === 'n/a' || v === 'none' || v === '') return null;
    return 8; // Other as fallback
  }

  // ── Clear existing professor data ────────────────────────────────
  console.log('\nClearing existing professor-related data...');
  const conn = await pool.getConnection();
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['professor_incident', 'has_bin', 'livescan', 'day_off', 'availability', 'professor_evaluation', 'professor']) {
    const [r] = await conn.query(`DELETE FROM ${t}`);
    console.log(`  Cleared ${t}: ${r.affectedRows} rows`);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  conn.release();

  // ── Find column indices for repeating blocks ─────────────────────
  const subDatesStart = col('Substitute Dates');
  const subReasonStart = col('Substitute Reason');
  const livescanStart = col('Livescan 1');
  const reviewStart = col('Review 1');
  const incidentStart = col('Incident 1');
  const availStartMon = col('Availability Start - Monday');
  const availEndMon = col('Availability End - Monday');
  const availNotesMon = col('Availability Notes - Monday');

  console.log('Sub dates start:', subDatesStart, 'Sub reason start:', subReasonStart);
  console.log('Livescan start:', livescanStart, 'Review start:', reviewStart, 'Incident start:', incidentStart);
  console.log('Avail Mon start:', availStartMon);

  // ── Process each professor ───────────────────────────────────────
  let profsInserted = 0, subsInserted = 0, livescansInserted = 0, binsInserted = 0;
  let availInserted = 0, evalsInserted = 0, incidentsInserted = 0, errors = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const csvId = intOrNull(getVal(row, 'ID'));
    const nickname = strOrNull(getVal(row, 'Professor Nickname'), 255);
    if (!nickname || !csvId) continue;

    // Status
    const statusText = getVal(row, 'Professor Status').toLowerCase();
    const statusId = statusMap[statusText] || statusMap['terminated'] || 4;

    // Names
    const firstName = strOrNull(getVal(row, 'First Name'), 64) || nickname;
    const lastName = strOrNull(getVal(row, 'Last Name'), 64) || '';

    // Contact
    const email = strOrNull(getVal(row, 'Email'), 128);
    const phone = strOrNull(getVal(row, 'Phone Number'), 128);

    // Address - try individual columns first, fall back to parsing combined address
    let address = strOrNull(getVal(row, 'Address'), 255);
    let cityName = strOrNull(getVal(row, 'City'), 64);
    let stateCode = strOrNull(getVal(row, 'State'), 2);
    let zipCode = strOrNull(getVal(row, 'Zip Code'), 16);

    // If city/state/zip are blank but address has them combined, parse it
    if (address && !cityName && !zipCode) {
      const parsed = parseFullAddress(address);
      if (parsed.zip) {
        address = parsed.street;
        cityName = parsed.city;
        stateCode = parsed.state || 'CA';
        zipCode = parsed.zip;
      }
    }

    // Fix zip codes that got mangled (dates like "5/1/2148" in zip column)
    if (zipCode && zipCode.includes('/')) zipCode = null;
    if (zipCode && zipCode.length > 5) zipCode = zipCode.substring(0, 5);

    // Geographic area
    let areaText = getVal(row, 'Geographic Area').toLowerCase();
    // For Crossover professors, try to get area from the materials-related columns
    if (areaText === 'crossover' || areaText === '') {
      // Check column CW area - look for area text in columns near the end
      // The "geographic area" for scheduling is in the column after bins area
      const matAreaIdx = col('Long Distance Materials');
      if (matAreaIdx > 0 && matAreaIdx + 1 < row.length) {
        const matArea = (row[matAreaIdx + 1] || '').trim().toLowerCase(); // "Materials Through" column
        if (areaMap[matArea] !== undefined) areaText = matArea;
      }
    }
    let geoAreaId = areaMap[areaText] || null;
    const geoAreaText = strOrNull(getVal(row, 'Geographic Area'), 128);

    // City
    let cityId = null;
    if (zipCode) {
      cityId = await getOrCreateCity(cityName, zipCode, stateCode || 'CA', geoAreaId);
    }

    // Scheduling coordinator - from area
    const scId = geoAreaId ? (areaScMap[geoAreaId] || null) : null;

    // Notes
    const generalNotes = strOrNull(getVal(row, 'General Notes'), 1024);
    const emergContact = strOrNull(getVal(row, 'Emergency Contact'), 128);
    const emergPhone = strOrNull(getVal(row, 'Emergency Contact Number'), 128);

    // Dates
    const birthday = parseDate(getVal(row, 'Birthday'));
    const hireDate = parseDate(getVal(row, 'Hire Date'));
    const termDate = parseDate(getVal(row, 'Termination Date'));
    const termReason = strOrNull(getVal(row, 'Termination Reason'), 255);
    const scheduleLink = strOrNull(getVal(row, 'Schedule Link'), 64);

    // Pay
    const basePay = numOrNull(getVal(row, 'Base Pay'));
    const assistPay = numOrNull(getVal(row, 'Assist Pay'));
    const pickupPay = numOrNull(getVal(row, 'Pickup Pay'));
    const partyPay = numOrNull(getVal(row, 'Party Pay'));
    const campPay = numOrNull(getVal(row, 'Camp Pay'));

    // Training flags
    const scienceTrained = ynOrNull(getVal(row, 'Science Trained'));
    const engineeringTrained = ynOrNull(getVal(row, 'Engineering Trained'));
    const roboticsTrained = ynOrNull(getVal(row, 'Robotics Trained'));
    const showPartyTrained = ynOrNull(getVal(row, 'Show Party Trained'));
    const studysmartTrained = ynOrNull(getVal(row, 'Studysmart Trained'));
    const campTrained = ynOrNull(getVal(row, 'Camp Trained'));

    // Compliance
    const virtus = yn(getVal(row, 'Virtus'));
    const virtusDate = parseDate(getVal(row, 'Virtus Date'));
    const tbTest = yn(getVal(row, 'TB Test'));
    const tbDate = parseDate(getVal(row, 'TB Date'));

    // Rating
    const rating = numOrNull(getVal(row, 'Rating'));
    const numSubsClaimed = intOrNull(getVal(row, 'Number of Subs Claimed'));

    // Vaccination card (skip - not in DB)
    // Onboard status - skip per instructions

    // ── Insert professor ───────────────────────────────────────────
    try {
      await pool.query(
        `INSERT INTO professor (
          id, professor_nickname, professor_status_id, first_name, last_name,
          email, phone_number, address, city_id, geographic_area, geographic_area_id,
          general_notes, emergency_contact, emergency_contact_number,
          birthday, hire_date, termination_date, termination_rason, schedule_link,
          base_pay, assist_pay, pickup_pay, party_pay, camp_pay,
          science_trained_id, engineering_trained_id, robotics_trained_id,
          show_party_trained_id, studysmart_trained_id, camp_trained_id,
          scheduling_coordinator_owner_id,
          virtus, virtus_date, tb_test, tb_date,
          rating, number_of_subs_claimed,
          ts_inserted, ts_updated, active
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?,
          ?, ?, ?, ?,
          ?, ?,
          NOW(), NOW(), 1
        )`,
        [
          csvId, nickname, statusId, firstName, lastName,
          email, phone, address, cityId, geoAreaText, geoAreaId,
          generalNotes, emergContact, emergPhone,
          birthday, hireDate, termDate, termReason, scheduleLink,
          basePay, assistPay, pickupPay, partyPay, campPay,
          scienceTrained, engineeringTrained, roboticsTrained,
          showPartyTrained, studysmartTrained, campTrained,
          scId,
          virtus, virtusDate, tbTest, tbDate,
          rating, numSubsClaimed,
        ]
      );
      profsInserted++;

      // ── Livescans (columns Livescan 1 through Livescan 9) ─────────
      if (livescanStart >= 0) {
        for (let ls = 0; ls < 9; ls++) {
          const idx = livescanStart + ls;
          if (idx >= row.length) break;
          const lsVal = (row[idx] || '').trim();
          if (!lsVal) continue;
          // Livescan values are location nicknames
          const locId = locByNickname[lsVal.toLowerCase()] || null;
          if (locId || lsVal) {
            await pool.query(
              `INSERT INTO livescan (professor_id, location_id, notes, pass, active, ts_inserted, ts_updated)
               VALUES (?, ?, ?, 1, 1, NOW(), NOW())`,
              [csvId, locId, locId ? null : lsVal.substring(0, 1024)]
            );
            livescansInserted++;
          }
        }
      }

      // ── Substitute Dates (20 columns) ─────────────────────────────
      if (subDatesStart >= 0) {
        for (let s = 0; s < 20; s++) {
          const dateIdx = subDatesStart + s;
          if (dateIdx >= row.length) break;
          const subDate = parseDate(row[dateIdx]);
          if (!subDate) continue;

          // Get corresponding reason
          let reasonId = null;
          if (subReasonStart >= 0) {
            const reasonIdx = subReasonStart + s;
            if (reasonIdx < row.length) {
              reasonId = mapSubReason(row[reasonIdx]);
            }
          }

          await pool.query(
            `INSERT INTO day_off (professor_id, date_requested, substitute_reason_id, active, ts_inserted, ts_updated)
             VALUES (?, ?, ?, 1, NOW(), NOW())`,
            [csvId, subDate, reasonId]
          );
          subsInserted++;
        }
      }

      // ── Bins ──────────────────────────────────────────────────────
      const binCols = [
        { csvCol: 'Science Bin', binId: 1 },
        { csvCol: 'Engineering Bin', binId: 2 },
        { csvCol: 'Robotics Bin', binId: 3 },
        { csvCol: 'Show Party Bin', binId: 4 },
        { csvCol: 'Fill 2 Bin', binId: 8 },
        { csvCol: 'Fill 3 Bin', binId: 9 },
        { csvCol: 'Fill 4 Bin', binId: 10 },
      ];
      for (const bc of binCols) {
        const binVal = getVal(row, bc.csvCol);
        const binNum = intOrNull(binVal);
        if (binNum && binNum > 0) {
          await pool.query(
            `INSERT INTO has_bin (professor_id, bin_id, bin_number, comment, active, ts_inserted, ts_updated)
             VALUES (?, ?, ?, '', 1, NOW(), NOW())`,
            [csvId, bc.binId, binNum]
          );
          binsInserted++;
        }
      }
      // Lego Mini Bag - check if they have one (boolean "Yes")
      // The column right after Fill 4 Bin might have "Yes" for lego mini bag... not clear from CSV
      // Skip for now since the column isn't labeled clearly

      // ── Availability (Monday-Friday) ──────────────────────────────
      if (availStartMon >= 0) {
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        for (let d = 0; d < 5; d++) {
          const startIdx = availStartMon + (d * 3);
          const endIdx = availEndMon + (d * 3);
          const notesIdx = availNotesMon + (d * 3);

          if (startIdx >= row.length) break;

          const startVal = (row[startIdx] || '').trim();
          const endVal = endIdx < row.length ? (row[endIdx] || '').trim() : '';
          const notesVal = notesIdx < row.length ? (row[notesIdx] || '').trim() : '';

          // Check if there's a TRUE/FALSE boolean for availability
          const isBool = startVal.toUpperCase() === 'TRUE' || startVal.toUpperCase() === 'FALSE';
          const isAvailable = isBool ? startVal.toUpperCase() === 'TRUE' : (startVal !== '' || notesVal !== '');

          if (!isAvailable) continue;

          const weekdayId = weekdayMap[dayNames[d].toLowerCase()];
          if (!weekdayId) continue;

          // Parse times if they look like times, otherwise null
          const timeFrom = isBool ? null : parseTime(startVal);
          const timeTo = parseTime(endVal);

          await pool.query(
            `INSERT INTO availability (professor_id, weekday_id, time_from, time_to, notes, active)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [csvId, weekdayId, timeFrom, timeTo, notesVal || '']
          );
          availInserted++;
        }
      }

      // ── Reviews (date-only → professor_evaluation) ────────────────
      if (reviewStart >= 0) {
        for (let r = 0; r < 3; r++) {
          const idx = reviewStart + r;
          if (idx >= row.length) break;
          const val = (row[idx] || '').trim();
          const evalDate = parseDate(val);
          if (evalDate) {
            await pool.query(
              `INSERT INTO professor_evaluation (professor_id, evaluation_date, evaluation_type, result, form_status, active, ts_inserted, ts_updated)
               VALUES (?, ?, 'formal', 'pass', 'completed', 1, NOW(), NOW())`,
              [csvId, evalDate]
            );
            evalsInserted++;
          }
          // If not a date (it's text), skip per instructions
        }
      }

      // ── Incidents ─────────────────────────────────────────────────
      if (incidentStart >= 0) {
        for (let inc = 0; inc < 3; inc++) {
          const idx = incidentStart + inc;
          if (idx >= row.length) break;
          const incVal = strOrNull(row[idx], 2000);
          if (incVal) {
            await pool.query(
              `INSERT INTO professor_incident (professor_id, description, active) VALUES (?, ?, 1)`,
              [csvId, incVal]
            );
            incidentsInserted++;
          }
        }
      }

      if (profsInserted % 100 === 0) console.log(`  Processed ${profsInserted} professors...`);
    } catch (e) {
      console.error(`Row ${i + 1} (ID ${csvId}, ${nickname}): ${e.message}`);
      errors++;
    }
  }

  // ── Report ────────────────────────────────────────────────────────
  console.log('\n=== Import Complete ===');
  console.log(`Professors inserted: ${profsInserted}`);
  console.log(`Livescans inserted: ${livescansInserted}`);
  console.log(`Substitute dates inserted: ${subsInserted}`);
  console.log(`Bins inserted: ${binsInserted}`);
  console.log(`Availability rows inserted: ${availInserted}`);
  console.log(`Evaluations inserted: ${evalsInserted}`);
  console.log(`Incidents inserted: ${incidentsInserted}`);
  console.log(`Errors: ${errors}`);

  // Final counts
  const [pc] = await pool.query('SELECT COUNT(*) as cnt FROM professor');
  const [lc] = await pool.query('SELECT COUNT(*) as cnt FROM livescan');
  const [dc] = await pool.query('SELECT COUNT(*) as cnt FROM day_off');
  const [bc] = await pool.query('SELECT COUNT(*) as cnt FROM has_bin');
  const [ac] = await pool.query('SELECT COUNT(*) as cnt FROM availability');
  console.log(`\nDB totals: professors=${pc[0].cnt} livescans=${lc[0].cnt} day_off=${dc[0].cnt} bins=${bc[0].cnt} availability=${ac[0].cnt}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
