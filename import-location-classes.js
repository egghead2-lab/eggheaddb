const fs = require('fs');
const mysql = require('mysql2/promise');

// Reuse CSV parser from import-locations.js
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

// Parse grade range like "K-3", "TK-1", "PK", "1-5", "6-8", "TK/K", "DK-K", "N&K", "P1-2"
function parseGradeIds(gradeStr) {
  if (!gradeStr || gradeStr.trim() === '' || gradeStr.trim().toLowerCase() === 'check') return [];

  // grade_id mapping: 1=by age, 2=PK/TK, 3=K, 4=1, 5=2, 6=3, 7=4, 8=5, 9=6, 10=7, 11=8, 12=9, 13=10, 14=11, 15=12
  const gradeNameToId = {
    'pk': 2, 'tk': 2, 'prek': 2, 'pre-k': 2, 'pktk': 2, 'pk/tk': 2, 'tk/k': [2, 3],
    'n&k': [2, 3], 'dk': 3, 'anp4': 2,
    'k': 3, 'k1': [3, 4], 'k2': [3, 4, 5],
    '1': 4, '1st': 4, '2': 5, '2nd': 5, '3': 6, '3rd': 6,
    '4': 7, '4th': 7, '5': 8, '5th': 8, '6': 9, '6th': 9,
    '7': 10, '7th': 10, '8': 11, '8th': 11,
    '9': 12, '9th': 12, '10': 13, '10th': 13, '11': 14, '11th': 14, '12': 15, '12th': 15,
  };

  const s = gradeStr.trim().toLowerCase().replace(/\s+/g, '');

  // Check for direct match first
  const direct = gradeNameToId[s];
  if (direct) return Array.isArray(direct) ? direct : [direct];

  // Strip ordinal suffixes: "2nd" -> "2", "1st" -> "1", "3rd" -> "3", "4th" -> "4"
  const cleaned = s.replace(/(\d+)(?:st|nd|rd|th)/g, '$1');

  // Re-check direct match after cleaning
  const directCleaned = gradeNameToId[cleaned];
  if (directCleaned) return Array.isArray(directCleaned) ? directCleaned : [directCleaned];

  // Handle ranges like "K-3", "1-5", "TK-3", "PK-K", "2-7", "6-8", "TK-2nd" -> "TK-2"
  const rangeMatch = cleaned.match(/^([a-z]*\/?[a-z]*\d*)-(\d+|[a-z]+\d*)$/);
  if (rangeMatch) {
    let startStr = rangeMatch[1];
    let endStr = rangeMatch[2];

    function gradeToNum(g) {
      if (g === 'pk' || g === 'tk' || g === 'prek' || g === 'anp4' || g === 'n') return 2;
      if (g === 'dk' || g === 'k') return 3;
      if (g === 'tk/k' || g === 'n&k') return 3;
      // Handle "p1", "p2" (Hillel uses P1-2 meaning grade 1-2)
      const pMatch = g.match(/^p(\d+)$/);
      if (pMatch) { const n = parseInt(pMatch[1]); if (n >= 1 && n <= 12) return n + 3; }
      const n = parseInt(g);
      if (!isNaN(n) && n >= 1 && n <= 12) return n + 3;
      return null;
    }

    const startId = gradeToNum(startStr);
    const endId = gradeToNum(endStr);

    if (startId && endId && startId <= endId) {
      const ids = [];
      for (let g = startId; g <= endId; g++) ids.push(g);
      return ids;
    }
  }

  // Handle age-based entries like "Age 5", "Age 6-8", "Ages 4-8", "4.5-7", "5 Years"
  if (s.includes('age') || s.includes('years') || /^\d+\.?\d*$/.test(s)) {
    return [1]; // grade_id 1 = "by age"
  }

  // Handle slash combos like "1/2", "4/6"
  if (s.includes('/')) {
    const parts = s.split('/');
    const ids = [];
    for (const p of parts) {
      const r = gradeNameToId[p.trim()];
      if (r) ids.push(...(Array.isArray(r) ? r : [r]));
    }
    if (ids.length > 0) return [...new Set(ids)];
  }

  // Handle "K-F" type combos or unusual entries
  // Check for things like "45326" (Excel date artifacts) - skip
  if (/^\d{4,}$/.test(s)) return [];

  // Handle combined like "2-6", "3-5" etc. where first char is a digit
  const numRange = s.match(/^(\d+)-(\d+)$/);
  if (numRange) {
    const start = parseInt(numRange[1]);
    const end = parseInt(numRange[2]);
    if (start >= 1 && end <= 12 && start <= end) {
      const ids = [];
      for (let g = start; g <= end; g++) ids.push(g + 3);
      return ids;
    }
  }

  // Fallback: try to parse as single grade number
  const num = parseInt(s);
  if (!isNaN(num) && num >= 1 && num <= 12) return [num + 3];

  console.warn(`  Could not parse grades: "${gradeStr}"`);
  return [];
}

// Parse day string to boolean array [mon, tue, wed, thu, fri, sat, sun]
function parseDays(dayStr) {
  if (!dayStr) return [0, 0, 0, 0, 0, 0, 0];
  const d = dayStr.trim().toLowerCase();
  if (d === 'm-f' || d === 'mon-fri' || d === 'weekdays') return [1, 1, 1, 1, 1, 0, 0];
  const days = [0, 0, 0, 0, 0, 0, 0];
  if (d.includes('monday') || d === 'mon' || d === 'mondays') days[0] = 1;
  if (d.includes('tuesday') || d === 'tue' || d === 'tues' || d === 'tuesdays') days[1] = 1;
  if (d.includes('wednesday') || d === 'wed' || d === 'wednesdays') days[2] = 1;
  if (d.includes('thursday') || d === 'thu' || d === 'thur' || d === 'thurs' || d === 'thursdays') days[3] = 1;
  if (d.includes('friday') || d === 'fri' || d === 'fridays') days[4] = 1;
  if (d.includes('saturday') || d === 'sat' || d === 'saturdays') days[5] = 1;
  if (d.includes('sunday') || d === 'sun' || d === 'sundays') days[6] = 1;
  // Handle plurals
  if (d === 'friday' || d === 'fridays') days[4] = 1;
  return days;
}

// Parse time like "3:15 PM", "9:00 AM", "12:30 PM" to HH:MM:SS
function parseTime(timeStr) {
  if (!timeStr || timeStr.trim() === '') return null;
  const t = timeStr.trim();

  // Handle "3:15 PM" format
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const ampm = (match[3] || '').toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
  }

  // Handle Excel time serial like "12/30/1899" or other date-looking things - skip
  if (t.includes('/') || t.includes('-')) return null;

  // Handle "15:39:42" 24-hour format
  const match24 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24) {
    return `${match24[1].padStart(2, '0')}:${match24[2]}:${match24[3] || '00'}`;
  }

  return null;
}

// Parse cost - handle "$22.00", "22", "$400.00", complex text
function parseCost(costStr) {
  if (!costStr || costStr.trim() === '') return null;
  const cleaned = costStr.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Parse length_minutes - handle "60", but also Excel date serials like "8/2/1900", "2/28/1900"
function parseLength(lengthStr) {
  if (!lengthStr || lengthStr.trim() === '') return null;
  const s = lengthStr.trim();

  // If it's a simple number, use it
  const num = parseInt(s);
  if (!isNaN(num) && num > 0 && num < 600 && !s.includes('/')) return num;

  // Excel serial date: e.g. "2/28/1900" means day 59 of Excel epoch = 59 minutes?
  // These are actually Excel bugs where the column was formatted as date
  // Common pattern: 2/28/1900 = 59 min, 8/2/1900 = 214? Let's compute from Excel serial
  const dateMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dateMatch && dateMatch[3] === '1900') {
    // Excel serial number: Jan 1 1900 = 1, so M/D/1900 means serial = days from epoch
    const month = parseInt(dateMatch[1]);
    const day = parseInt(dateMatch[2]);
    // Approximate: days in 1900 up to that date
    const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let serial = day;
    for (let m = 1; m < month; m++) serial += daysInMonth[m];
    // The serial represents minutes
    return serial;
  }

  // 1901 dates too
  if (dateMatch && dateMatch[3] === '1901') {
    const month = parseInt(dateMatch[1]);
    const day = parseInt(dateMatch[2]);
    const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let serial = day;
    for (let m = 1; m < month; m++) serial += daysInMonth[m];
    serial += 365;
    return serial;
  }

  return null;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) { console.error('Usage: node import-location-classes.js <csv-file>'); process.exit(1); }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  const headers = rows[0];
  const dataRows = rows.slice(1);

  const pool = mysql.createPool({
    host: 'egghead.mysql.database.azure.com', port: 3306,
    user: 'eggheaddb', password: 'Meesterodb1*', database: 'program_data',
    ssl: { rejectUnauthorized: false }, connectionLimit: 5,
  });

  // Load location nickname->id mapping
  const [locations] = await pool.query('SELECT id, nickname FROM location');
  const locMap = {};
  locations.forEach(l => { locMap[l.nickname] = l.id; });

  // class_type mapping
  const classTypeMap = { 'science': 1, 'engineering': 2, 'robotics': 3, 'mix': 4, 'camp': 1, 'financial literacy': 1 };

  function col(name) { return headers.indexOf(name); }
  function getVal(row, colName) {
    const idx = col(colName);
    if (idx < 0 || idx >= row.length) return '';
    return row[idx] || '';
  }

  // --- Import School Cut data into location_cut_type ---
  console.log('=== Importing School Cut data ===');
  let cutInserted = 0, cutUpdated = 0, cutSkipped = 0;

  // Cut type mapping from CSV
  const cutTypeMap = {
    'percentage': 3,
    'weekly': 8, // Rental Per Date
    'subsidy percentage': 3, // Percentage
    'student per session': 5,
    'student per week': 6,
    'session fixed': 4,
  };

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const nickname = (getVal(row, 'Nickname') || '').trim();
    const locationId = locMap[nickname];
    if (!locationId) continue;

    const cutTypeText = (getVal(row, 'School Cut Type') || '').trim().toLowerCase();
    const cutAmountText = (getVal(row, 'School Cut') || '').trim();

    if (!cutTypeText || !cutAmountText) continue;

    const cutTypeId = cutTypeMap[cutTypeText];
    if (!cutTypeId) continue;

    // Parse amount - handle "30%", "0.3", "$300", "14 plus $25 application fee", etc.
    let amount = null;
    let description = cutAmountText;
    const pctMatch = cutAmountText.match(/^(\d+\.?\d*)%?$/);
    if (pctMatch) {
      amount = parseFloat(pctMatch[1]);
      // If it's like 0.3 (decimal fraction), convert to percentage
      if (amount > 0 && amount < 1) amount = amount * 100;
    } else {
      const numMatch = cutAmountText.replace(/[$,]/g, '').match(/^(\d+\.?\d*)/);
      if (numMatch) amount = parseFloat(numMatch[1]);
    }

    // Check if already exists for this location
    const [existing] = await pool.query(
      'SELECT id FROM location_cut_type WHERE location_id = ? AND cut_type_id = ? AND active = 1',
      [locationId, cutTypeId]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE location_cut_type SET amount = ?, description = ? WHERE id = ?',
        [amount, description.substring(0, 255), existing[0].id]
      );
      cutUpdated++;
    } else {
      await pool.query(
        'INSERT INTO location_cut_type (location_id, cut_type_id, amount, description, active) VALUES (?, ?, ?, ?, 1)',
        [locationId, cutTypeId, amount, description.substring(0, 255)]
      );
      cutInserted++;
    }
  }
  console.log(`  Cut types - Inserted: ${cutInserted}, Updated: ${cutUpdated}`);

  // --- Import Class 1-6 into default_location_class_type + default_grade ---
  console.log('\n=== Importing Default Class Types ===');
  let classInserted = 0, classUpdated = 0, classErrors = 0, gradeInserted = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const nickname = (getVal(row, 'Nickname') || '').trim();
    const locationId = locMap[nickname];
    if (!locationId) continue;

    for (let c = 1; c <= 6; c++) {
      const typeStr = (getVal(row, `Class ${c} Type`) || '').trim().toLowerCase();
      if (!typeStr) continue;

      const classTypeId = classTypeMap[typeStr];
      if (!classTypeId) {
        if (typeStr) console.warn(`  Row ${i + 1} Class ${c}: Unknown class type "${typeStr}"`);
        continue;
      }

      const gradesStr = getVal(row, `Class ${c} Grades`);
      const dayStr = getVal(row, `Class ${c} Day`);
      const timeStr = getVal(row, `Class ${c} Start Time`);
      const lengthStr = getVal(row, `Class ${c} Length (Minutes)`);
      const costStr = getVal(row, `Class ${c} Cost`);
      const labFeeStr = getVal(row, `Class ${c} Lab Fee per Week`);
      const minStr = getVal(row, `Class ${c} Minimum Students`);
      const maxStr = getVal(row, `Class ${c} Maximum Students`);

      const days = parseDays(dayStr);
      const startTime = parseTime(timeStr);
      const lengthMins = parseLength(lengthStr);
      const cost = parseCost(costStr);
      const labFee = parseCost(labFeeStr);
      const minStudents = parseInt(minStr) || null;
      const maxStudents = parseInt(maxStr) || null;

      // Try to find existing matching row (same location, class type, and day pattern)
      const [existing] = await pool.query(
        `SELECT id FROM default_location_class_type
         WHERE location_id = ? AND class_type_id = ?
           AND monday = ? AND tuesday = ? AND wednesday = ? AND thursday = ? AND friday = ? AND saturday = ? AND sunday = ?
           AND active = 1`,
        [locationId, classTypeId, ...days]
      );

      let dlctId;
      if (existing.length > 0) {
        dlctId = existing[0].id;
        await pool.query(
          `UPDATE default_location_class_type SET
            start_time = ?, length_minutes = ?, cost = ?, lab_fee_amount = ?,
            minimum_students = ?, maximum_students = ?, ts_updated = NOW()
           WHERE id = ?`,
          [startTime, lengthMins, cost, labFee, minStudents, maxStudents, dlctId]
        );
        classUpdated++;
      } else {
        try {
          const [result] = await pool.query(
            `INSERT INTO default_location_class_type
              (location_id, class_type_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday,
               start_time, length_minutes, cost, lab_fee_type_id, lab_fee_amount,
               minimum_students, maximum_students, ts_inserted, ts_updated, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 1)`,
            [locationId, classTypeId, ...days, startTime, lengthMins, cost,
             labFee ? 1 : null, labFee, minStudents, maxStudents]
          );
          dlctId = result.insertId;
          classInserted++;
        } catch (e) {
          console.error(`  Row ${i + 1} Class ${c} (${nickname}): ${e.message}`);
          classErrors++;
          continue;
        }
      }

      // Insert grades
      const gradeIds = parseGradeIds(gradesStr);
      if (gradeIds.length > 0 && dlctId) {
        // Clear existing grades for this dlct
        await pool.query('DELETE FROM default_grade WHERE default_location_class_type_id = ?', [dlctId]);
        for (const gId of gradeIds) {
          await pool.query(
            'INSERT INTO default_grade (default_location_class_type_id, grade_id) VALUES (?, ?)',
            [dlctId, gId]
          );
          gradeInserted++;
        }
      }
    }

    if ((i + 1) % 100 === 0) console.log(`  Processed ${i + 1} locations...`);
  }

  console.log(`\n=== Results ===`);
  console.log(`Class types - Inserted: ${classInserted}, Updated: ${classUpdated}, Errors: ${classErrors}`);
  console.log(`Grades inserted: ${gradeInserted}`);

  const [finalDlct] = await pool.query('SELECT COUNT(*) as cnt FROM default_location_class_type WHERE active = 1');
  const [finalGrade] = await pool.query('SELECT COUNT(*) as cnt FROM default_grade');
  const [finalCut] = await pool.query('SELECT COUNT(*) as cnt FROM location_cut_type WHERE active = 1');
  console.log(`\nTotal default_location_class_type: ${finalDlct[0].cnt}`);
  console.log(`Total default_grade: ${finalGrade[0].cnt}`);
  console.log(`Total location_cut_type: ${finalCut[0].cnt}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
