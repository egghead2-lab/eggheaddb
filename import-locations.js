const fs = require('fs');
const mysql = require('mysql2/promise');
const path = require('path');

// Simple CSV parser that handles quoted fields with commas and newlines
function parseCSV(text) {
  const rows = [];
  let i = 0;
  while (i < text.length) {
    const row = [];
    while (i < text.length) {
      if (text[i] === '"') {
        // Quoted field
        i++;
        let field = '';
        while (i < text.length) {
          if (text[i] === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++; // closing quote
              break;
            }
          } else {
            field += text[i];
            i++;
          }
        }
        row.push(field);
        if (i < text.length && text[i] === ',') i++;
        else if (i < text.length && (text[i] === '\n' || text[i] === '\r')) {
          if (text[i] === '\r' && i + 1 < text.length && text[i + 1] === '\n') i += 2;
          else i++;
          break;
        }
      } else {
        // Unquoted field
        let field = '';
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i];
          i++;
        }
        row.push(field);
        if (i < text.length && text[i] === ',') i++;
        else if (i < text.length && (text[i] === '\n' || text[i] === '\r')) {
          if (text[i] === '\r' && i + 1 < text.length && text[i + 1] === '\n') i += 2;
          else i++;
          break;
        }
      }
    }
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) {
      rows.push(row);
    }
  }
  return rows;
}

function yn(val) {
  if (!val) return 0;
  const v = val.toString().trim().toLowerCase();
  if (v === 'yes' || v === '1' || v === 'true') return 1;
  return 0;
}

function numOrNull(val) {
  if (!val || val.trim() === '') return null;
  const n = parseInt(val.replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function strOrNull(val, maxLen) {
  if (!val || val.trim() === '') return null;
  const s = val.trim();
  return maxLen ? s.substring(0, maxLen) : s;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node import-locations.js <csv-file>');
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  const headers = rows[0];
  const dataRows = rows.slice(1);

  console.log(`Parsed ${dataRows.length} data rows with ${headers.length} columns`);

  const pool = mysql.createPool({
    host: 'egghead.mysql.database.azure.com', port: 3306,
    user: 'eggheaddb', password: 'Meesterodb1*', database: 'program_data',
    ssl: { rejectUnauthorized: false },
    connectionLimit: 5,
  });

  // Load lookup tables
  const [areas] = await pool.query('SELECT id, geographic_area_name FROM geographic_area');
  const [locTypes] = await pool.query('SELECT id, location_type_name FROM location_type');
  const [contractors] = await pool.query('SELECT id, contractor_name FROM contractor');
  const [pricingTypes] = await pool.query('SELECT id, class_pricing_type_name FROM class_pricing_type');
  const [parkingDiffs] = await pool.query('SELECT id, parking_difficulty_name FROM parking_difficulty');
  const [users] = await pool.query('SELECT id, first_name, last_name FROM user');
  const [cities] = await pool.query('SELECT id, city_name, zip_code, state_id, geographic_area_id FROM city');
  const [states] = await pool.query('SELECT id, state_name, state_code FROM state');

  // Build lookup maps (case-insensitive)
  const areaMap = {};
  areas.forEach(a => { areaMap[a.geographic_area_name.toLowerCase()] = a.id; });
  // Add aliases
  areaMap['south la'] = areaMap['south la'] || 7;
  areaMap['north oc'] = areaMap['north oc'] || 10;
  areaMap['south oc'] = areaMap['oc'] || 6;

  const locTypeMap = {};
  locTypes.forEach(t => { locTypeMap[t.location_type_name.toLowerCase()] = t.id; });

  const contractorMap = {};
  contractors.forEach(c => { contractorMap[c.contractor_name.toLowerCase()] = c.id; });
  // Add common aliases from the CSV
  contractorMap['city of arcadia'] = contractorMap['city of arcadia'] || 8;
  contractorMap['city of burbank'] = contractorMap['city of burbank'] || 9;
  contractorMap['city of monrovia'] = contractorMap['city of monrovia'] || 10;
  contractorMap['city of temple city'] = contractorMap['city of temple city'] || 11;
  contractorMap['duarte parks and rec'] = contractorMap['duarte parks and rec'] || 17;
  contractorMap['ace enrichement'] = contractorMap['ace enrichment'] || 74;
  contractorMap['bh parks'] = contractorMap['bh parks'] || 6;
  contractorMap['burbank parks'] = contractorMap['burbank parks'] || 7;
  contractorMap['pv enrichment'] = contractorMap['pv enrichment'] || 28;

  const pricingMap = {};
  pricingTypes.forEach(p => { pricingMap[p.class_pricing_type_name.toLowerCase()] = p.id; });

  const parkingMap = {};
  parkingDiffs.forEach(p => { parkingMap[p.parking_difficulty_name.toLowerCase()] = p.id; });

  const userMap = {};
  users.forEach(u => { userMap[u.first_name.toLowerCase()] = u.id; });

  const stateMap = {};
  states.forEach(s => { stateMap[s.state_code.toLowerCase()] = s.id; stateMap[s.state_name.toLowerCase()] = s.id; });

  // City lookup by zip
  const cityByZip = {};
  cities.forEach(c => { cityByZip[c.zip_code] = c.id; });

  // Helper to find or create city
  async function getOrCreateCity(cityName, zip, stateCode, geoAreaId) {
    if (!zip || !cityName) return null;
    zip = zip.trim();
    cityName = cityName.trim();
    if (cityByZip[zip]) return cityByZip[zip];

    const stateId = stateMap[stateCode.toLowerCase().trim()] || stateMap['california'] || 5;
    const areaId = geoAreaId || 9; // default to Outside Los Angeles

    try {
      const [result] = await pool.query(
        'INSERT INTO city (city_name, zip_code, state_id, geographic_area_id) VALUES (?, ?, ?, ?)',
        [cityName.substring(0, 64), zip.substring(0, 16), stateId, areaId]
      );
      cityByZip[zip] = result.insertId;
      return result.insertId;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        const [existing] = await pool.query('SELECT id FROM city WHERE zip_code = ?', [zip]);
        if (existing.length > 0) {
          cityByZip[zip] = existing[0].id;
          return existing[0].id;
        }
      }
      console.warn(`  Warning: Could not create city ${cityName} ${zip}: ${e.message}`);
      return null;
    }
  }

  // Helper to get column index
  function col(name) {
    const idx = headers.indexOf(name);
    return idx;
  }

  function getVal(row, colName) {
    const idx = col(colName);
    if (idx < 0 || idx >= row.length) return '';
    return row[idx] || '';
  }

  // Resolve geographic area from CSV text
  function resolveArea(val) {
    if (!val) return null;
    const v = val.trim().toLowerCase();
    if (areaMap[v] !== undefined) return areaMap[v];
    // Try partial matches
    if (v.includes('inland empire')) return areaMap['west inland empire'] || 11;
    return areaMap['outside current territories'] || 18;
  }

  // Resolve parking difficulty from text
  function resolveParking(val) {
    if (!val) return null;
    const v = val.trim().toLowerCase();
    if (parkingMap[v] !== undefined) return parkingMap[v];
    if (v.includes('easy') || v.includes('lot') || v === 'tbd') return 1;
    if (v.includes('medium') || v === 'check') return 2;
    if (v.includes('hard') || v.includes('difficult') || v.includes('street')) return null; // many "Street" entries aren't necessarily hard
    return null;
  }

  // Process each row
  let inserted = 0, updated = 0, skipped = 0, errors = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const csvId = numOrNull(getVal(row, 'ID'));
    const nickname = strOrNull(getVal(row, 'Nickname'), 128);
    const schoolName = strOrNull(getVal(row, 'School Name'), 128);

    if (!nickname || !schoolName) {
      console.log(`Row ${i + 1}: Skipping - missing nickname or school name`);
      skipped++;
      continue;
    }

    // Resolve lookups
    const geoAreaText = getVal(row, 'Geographic Area').trim();
    const geoAreaId = resolveArea(geoAreaText);
    const cityName = getVal(row, 'City').trim();
    const stateCode = getVal(row, 'State').trim();
    const zip = getVal(row, 'Zip Code').trim();
    const cityId = await getOrCreateCity(cityName, zip, stateCode || 'CA', geoAreaId);

    const locTypeText = getVal(row, 'Location Type').trim().toLowerCase();
    const locTypeId = locTypeMap[locTypeText] || null;

    const contractorText = getVal(row, 'Contractor').trim();
    const contractorId = contractorText ? (contractorMap[contractorText.toLowerCase()] || null) : null;

    const pricingText = getVal(row, 'Class Pricing Type').trim().toLowerCase();
    const pricingId = pricingMap[pricingText] || null;

    const parkingText = getVal(row, 'Parking Information').trim();
    const parkingId = resolveParking(parkingText);

    const clientMgr = getVal(row, 'Client Manager').trim().toLowerCase();
    const clientMgrId = userMap[clientMgr] || null;

    const enrollmentRaw = getVal(row, 'Location Enrollment').trim();
    const enrollment = numOrNull(enrollmentRaw);

    const weeksRaw = getVal(row, 'Number of Weeks').trim();
    const weeks = numOrNull(weeksRaw);

    const flyerQtyRaw = getVal(row, 'Flyer Quantity').trim();
    const flyerQty = numOrNull(flyerQtyRaw);

    // Build INSERT
    const fields = {
      nickname,
      school_name: schoolName,
      active: yn(getVal(row, 'Active')),
      payment_through_us: yn(getVal(row, 'Payment Through Us')),
      location_type_id: locTypeId,
      location_phone: strOrNull(getVal(row, 'Location Phone'), 32) || '',
      address: strOrNull(getVal(row, 'Address'), 128) || '',
      city_id: cityId,
      geographic_area_id_online: geoAreaId,
      point_of_contact: strOrNull(getVal(row, 'Point of Contact'), 64),
      poc_title: strOrNull(getVal(row, 'POC Title'), 128),
      poc_phone: strOrNull(getVal(row, 'POC Phone'), 128),
      poc_email: strOrNull(getVal(row, 'POC Email'), 128),
      contractor_id: contractorId,
      location_enrollment: enrollment,
      demo_allowed: yn(getVal(row, 'Demo Allowed')),
      demo_notes: strOrNull(getVal(row, 'Demo Start Time'), 1024),
      class_pricing_type_id: pricingId,
      virtus_required: yn(getVal(row, 'Virtus Required')),
      tb_required: yn(getVal(row, 'TB Required')),
      livescan_required: yn(getVal(row, 'Livescan Required')),
      livescan_info: strOrNull(getVal(row, 'Livescan Info'), 1024),
      contract_permit_required: yn(getVal(row, 'Contract/Permit Required')),
      contract_permit_notes: strOrNull(getVal(row, 'Contract/Permit Notes'), 255),
      special_info_required: strOrNull(getVal(row, 'Special Info Required'), 255),
      flyer_required: yn(getVal(row, 'Flyer Required')),
      registration_link_for_flyer: strOrNull(getVal(row, 'Registration Link for Flyer'), 255),
      custom_flyer_required: yn(getVal(row, 'Custom Flyer Required')),
      custom_flyer_items_required: strOrNull(getVal(row, 'Custom Flyer Items Required'), 1024),
      flyer_quantity: flyerQty,
      parking_difficulty_id: parkingId,
      parking_information: strOrNull(getVal(row, 'Parking Information'), 1024),
      school_procedure_Info: strOrNull(getVal(row, 'School Procedure Info'), 1024),
      internal_notes: strOrNull(getVal(row, 'Internal Notes'), 1024),
      observes_allowed: yn(getVal(row, 'Observes Allowed')),
      jewish: yn(getVal(row, 'Jewish')),
      set_dates_ourselves: yn(getVal(row, 'Set Dates Ourselves')),
      number_of_weeks: weeks,
      school_calendar_link: strOrNull(getVal(row, 'School Calendar Link'), 1024),
      invoicing_notes: strOrNull(getVal(row, 'Invoicing Notes'), 1024),
      client_manager_user_id: clientMgrId,
      retained: yn(getVal(row, 'Retained Client')),
      tbd: 0,
    };

    // Build the SQL
    const cols = Object.keys(fields);
    const vals = cols.map(c => fields[c]);

    try {
      // Check if location already exists by nickname
      const [existing] = await pool.query('SELECT id FROM location WHERE nickname = ?', [nickname]);

      if (existing.length > 0) {
        // UPDATE existing row
        const setClauses = cols.map(c => `${c} = ?`).join(', ');
        await pool.query(
          `UPDATE location SET ${setClauses}, ts_updated = NOW() WHERE nickname = ?`,
          [...vals, nickname]
        );
        updated++;
      } else {
        // INSERT new row, try with CSV id first, fall back to auto-increment
        let didInsert = false;
        if (csvId) {
          try {
            await pool.query(
              `INSERT INTO location (id, ${cols.join(', ')}, ts_inserted, ts_updated)
               VALUES (?, ${cols.map(() => '?').join(', ')}, NOW(), NOW())`,
              [csvId, ...vals]
            );
            didInsert = true;
          } catch (idErr) {
            if (idErr.code === 'ER_DUP_ENTRY' && idErr.message.includes('PRIMARY')) {
              // ID taken, fall back to auto-increment
              await pool.query(
                `INSERT INTO location (${cols.join(', ')}, ts_inserted, ts_updated)
                 VALUES (${cols.map(() => '?').join(', ')}, NOW(), NOW())`,
                vals
              );
              didInsert = true;
            } else {
              throw idErr;
            }
          }
        } else {
          await pool.query(
            `INSERT INTO location (${cols.join(', ')}, ts_inserted, ts_updated)
             VALUES (${cols.map(() => '?').join(', ')}, NOW(), NOW())`,
            vals
          );
          didInsert = true;
        }
        if (didInsert) inserted++;
      }
      if ((inserted + updated) % 100 === 0) console.log(`  Processed ${inserted + updated} locations...`);
    } catch (e) {
      console.error(`Row ${i + 1} (ID ${csvId}, ${nickname}): ${e.message}`);
      errors++;
    }
  }

  console.log(`\nDone! Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);

  // Final count
  const [finalCount] = await pool.query('SELECT COUNT(*) as cnt FROM location');
  console.log(`Total locations in DB: ${finalCount[0].cnt}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
