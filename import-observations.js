const fs = require('fs');
const mysql = require('mysql2/promise');

function parseCSV(text) {
  const rows = [];
  let i = 0;
  while (i < text.length) {
    const row = [];
    while (i < text.length) {
      if (text[i] === '"') {
        i++; let field = '';
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
    if (row.length > 3) rows.push(row);
  }
  return rows;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  const d = dateStr.trim();
  const match = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    let year = parseInt(match[3]);
    if (year < 100) year += 2000;
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  return null;
}

function ratingToResult(rating) {
  const r = parseInt(rating);
  if (r === 5) return 'distinguished';
  if (r === 4) return 'excelling';
  if (r === 3) return 'performing';
  if (r === 2) return 'developing';
  if (r === 1) return 'emerging';
  return null;
}

function getObsType(row) {
  // Column 21 has observation type in some rows
  const typeCol = (row[21] || '').trim().toLowerCase();
  if (typeCol.includes('formal') || typeCol.includes('official')) return 'formal';
  if (typeCol.includes('peer')) return 'peer_to_peer';
  if (typeCol.includes('support') || typeCol.includes('remedial')) return 'support_session';
  if (typeCol.includes('follow')) return 'follow_up';
  if (typeCol.includes('casual') || typeCol.includes('informal')) return 'casual';
  if (typeCol.includes('remote')) return 'remote';
  if (typeCol.includes('phone') || typeCol.includes('virtual check')) return 'virtual_checkin';
  return 'formal'; // default
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) { console.error('Usage: node import-observations.js <csv-file>'); process.exit(1); }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  // Skip header rows (first few rows are the header + description)
  const dataRows = rows.filter(r => {
    const timestamp = (r[0] || '').trim();
    return timestamp.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/); // starts with a date
  });
  console.log(`Found ${dataRows.length} data rows`);

  const pool = mysql.createPool({
    host: 'egghead.mysql.database.azure.com', port: 3306,
    user: 'eggheaddb', password: 'Meesterodb1*',
    database: 'program_data', ssl: { rejectUnauthorized: false }, connectionLimit: 5
  });

  // Load professors
  const [professors] = await pool.query('SELECT id, professor_nickname FROM professor');
  const profMap = {};
  professors.forEach(p => { profMap[p.professor_nickname.toLowerCase().trim()] = p.id; });

  let updated = 0, inserted = 0, skipped = 0, notFound = 0;
  const notFoundNames = new Set();
  const seen = new Set();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const profName = (row[2] || '').trim();
    const dateStr = (row[3] || '').trim();
    const formLink = (row[5] || '').trim();
    const ratingStr = (row[6] || '').trim();
    const remediationStr = (row[7] || '').trim();

    if (!profName || !dateStr) { skipped++; continue; }

    const obsDate = parseDate(dateStr);
    if (!obsDate) { skipped++; continue; }

    const profId = profMap[profName.toLowerCase()];
    if (!profId) { notFoundNames.add(profName); notFound++; continue; }

    // Dedupe by prof + date (keep first occurrence)
    const key = `${profId}-${obsDate}`;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);

    const result = ratingToResult(ratingStr);
    const formUrl = formLink.startsWith('http') ? formLink : null;
    const evalType = getObsType(row);
    const needsRemediation = remediationStr.toLowerCase().includes('yes');
    const remFollowup = needsRemediation
      ? (remediationStr.toLowerCase().includes('2 week') ? 'within_2_weeks' : 'within_4_weeks')
      : null;

    // Try to update existing record first
    const [existingResult] = await pool.query(
      'UPDATE professor_evaluation SET result = ?, form_link = COALESCE(?, form_link), evaluation_type = ?, remediation_followup = ? WHERE professor_id = ? AND evaluation_date = ? AND active = 1',
      [result, formUrl, evalType, remFollowup, profId, obsDate]
    );

    if (existingResult.affectedRows > 0) {
      updated++;
    } else {
      // Insert new
      await pool.query(
        `INSERT INTO professor_evaluation (professor_id, evaluation_date, evaluation_type, result, form_link, form_status, remediation_followup, active)
         VALUES (?, ?, ?, ?, ?, 'completed', ?, 1)`,
        [profId, obsDate, evalType, result, formUrl, remFollowup]
      );
      inserted++;
    }

    if ((updated + inserted) % 100 === 0) console.log(`  Processed ${updated + inserted}...`);
  }

  // Now update professor.last_evaluation_date and last_evaluation_result from the most recent eval
  const [updateResult] = await pool.query(`
    UPDATE professor p
    JOIN (
      SELECT pe.professor_id, pe.evaluation_date, pe.result
      FROM professor_evaluation pe
      INNER JOIN (SELECT professor_id, MAX(evaluation_date) as max_date FROM professor_evaluation WHERE active = 1 GROUP BY professor_id) latest
      ON pe.professor_id = latest.professor_id AND pe.evaluation_date = latest.max_date
      WHERE pe.active = 1
    ) e ON e.professor_id = p.id
    SET p.last_evaluation_date = e.evaluation_date, p.last_evaluation_result = e.result
  `);
  console.log(`Updated last_evaluation for ${updateResult.affectedRows} professors`);

  console.log('\n=== Import Complete ===');
  console.log(`Updated existing: ${updated}`);
  console.log(`Inserted new: ${inserted}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Not found: ${notFound}`);
  if (notFoundNames.size > 0) {
    console.log(`\nUnmatched names (${notFoundNames.size}):`);
    [...notFoundNames].sort().forEach(n => console.log('  ' + n));
  }

  const [[evalCount]] = await pool.query('SELECT COUNT(*) as cnt FROM professor_evaluation WHERE active = 1');
  const [[withResult]] = await pool.query("SELECT COUNT(*) as cnt FROM professor_evaluation WHERE active = 1 AND result IS NOT NULL AND result != 'pass'");
  console.log(`\nDB: ${evalCount.cnt} total evals, ${withResult.cnt} with proper ratings`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
