/**
 * Location Import Script
 * Matches CSV → DB by nickname, updates in-place to preserve program mappings
 */
const fs = require('fs');
const path = require('path');
const pool = require('./server/db/pool');

function parseCSV(text) {
  const rows = []; let current = []; let field = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"' && text[i+1] === '"') { field += '"'; i++; } else if (ch === '"') inQ = false; else field += ch; }
    else { if (ch === '"') inQ = true; else if (ch === ',') { current.push(field.trim()); field = ''; } else if (ch === '\n' || (ch === '\r' && text[i+1] === '\n')) { current.push(field.trim()); field = ''; if (current.length > 1) rows.push(current); current = []; if (ch === '\r') i++; } else field += ch; }
  }
  if (field || current.length) { current.push(field.trim()); if (current.length > 1) rows.push(current); }
  return rows;
}

async function run() {
  const csvText = fs.readFileSync(path.join(__dirname, 'Program Databases - Locations (1).csv'), 'utf-8');
  const rows = parseCSV(csvText);
  const headers = rows[0];
  const data = rows.slice(1).map(row => { const obj = {}; headers.forEach((h, i) => { obj[h] = row[i] || ''; }); return obj; });
  console.log(`Parsed ${data.length} locations from CSV`);

  // Lookups
  const [areas] = await pool.query('SELECT id, geographic_area_name FROM geographic_area WHERE active = 1');
  const areaMap = {}; areas.forEach(a => { areaMap[a.geographic_area_name.toLowerCase().trim()] = a.id; });

  const [cons] = await pool.query('SELECT id, contractor_name FROM contractor WHERE active = 1');
  const conMap = {}; cons.forEach(c => { conMap[c.contractor_name.toLowerCase().trim()] = c.id; });

  const [lts] = await pool.query('SELECT id, location_type_name FROM location_type WHERE active = 1');
  const ltMap = {}; lts.forEach(l => { ltMap[l.location_type_name.toLowerCase().trim()] = l.id; });

  const [pts] = await pool.query('SELECT id, class_pricing_type_name FROM class_pricing_type WHERE active = 1');
  const ptMap = {}; pts.forEach(p => { ptMap[p.class_pricing_type_name.toLowerCase().trim()] = p.id; });

  const [pds] = await pool.query('SELECT id, parking_difficulty_name FROM parking_difficulty WHERE active = 1');
  const pdMap = {}; pds.forEach(p => { pdMap[p.parking_difficulty_name.toLowerCase().trim()] = p.id; });

  const [users] = await pool.query('SELECT id, first_name FROM user WHERE active = 1');
  const userMap = {}; users.forEach(u => { userMap[(u.first_name || '').toLowerCase().trim()] = u.id; });

  const [cities] = await pool.query('SELECT id, city_name, zip_code, geographic_area_id FROM city');
  const cityByZip = {}; cities.forEach(c => { cityByZip[c.zip_code] = c; });

  const [states] = await pool.query('SELECT id, state_code FROM state');
  const stateMap = {}; states.forEach(s => { stateMap[(s.state_code || '').toLowerCase()] = s.id; });

  const [existingLocs] = await pool.query('SELECT id, nickname FROM location');
  const locByNick = {}; existingLocs.forEach(l => { locByNick[l.nickname.trim().toUpperCase()] = l.id; });

  const toBool = (v) => { const s = (v || '').trim().toLowerCase(); return s === 'yes' || s === '1' || s === 'true' ? 1 : 0; };

  let updated = 0, created = 0, skipped = 0, citiesCreated = 0;
  const errors = [];
  const missingContractors = new Set();

  for (const row of data) {
    try {
      const nickname = (row['Nickname'] || '').trim();
      if (!nickname || ['old', 'error', 'duplicate', 'error input'].includes(nickname.toLowerCase())) { skipped++; continue; }

      // City
      const zip = (row['Zip Code'] || '').trim();
      const cityName = (row['City'] || '').trim();
      const stateName = (row['State'] || '').trim();
      let cityId = null;
      if (zip && cityByZip[zip]) { cityId = cityByZip[zip].id; }
      else if (zip && cityName) {
        const aId = areaMap[(row['Geographic Area'] || '').toLowerCase().trim()] || null;
        const sId = stateMap[stateName.toLowerCase()] || stateMap['ca'] || null;
        const [r] = await pool.query('INSERT INTO city (city_name, zip_code, state_id, geographic_area_id) VALUES (?,?,?,?)', [cityName, zip, sId, aId]);
        cityId = r.insertId; cityByZip[zip] = { id: cityId }; citiesCreated++;
      }

      const areaId = areaMap[(row['Geographic Area'] || '').toLowerCase().trim()] || null;
      const conName = (row['Contractor'] || '').trim();
      let conId = conName ? (conMap[conName.toLowerCase().trim()] || null) : null;
      if (conName && !conId) missingContractors.add(conName);

      const ltId = ltMap[(row['Location Type'] || '').toLowerCase().trim()] || null;
      const ptName = (row['Class Pricing Type'] || '').trim();
      const ptId = ptName ? (ptMap[ptName.toLowerCase().trim()] || null) : null;

      // Parking
      const parkText = (row['Parking Information'] || '').trim();
      let pdId = null;
      const pl = parkText.toLowerCase();
      if (pl === 'easy' || pl.startsWith('easy')) pdId = pdMap['easy'];
      else if (pl === 'medium' || pl.startsWith('medium')) pdId = pdMap['medium'];
      else if (pl === 'hard' || pl.startsWith('hard') || pl.startsWith('very hard') || pl.startsWith('difficult')) pdId = pdMap['hard'];

      const cmId = userMap[(row['Client Manager'] || '').toLowerCase().trim()] || null;

      // School cut
      let schoolCutType = null, schoolCutValue = null, schoolCutNotes = null;
      const cutTypeRaw = (row['School Cut Type'] || '').trim().toLowerCase();
      const cutValueRaw = (row['School Cut'] || '').trim();
      if (cutTypeRaw && cutValueRaw) {
        const numMatch = cutValueRaw.match(/([\d.]+)/);
        const numVal = numMatch ? parseFloat(numMatch[1]) : null;
        if (cutTypeRaw === 'percentage' || cutTypeRaw === 'subsidy percentage') {
          schoolCutType = cutTypeRaw === 'subsidy percentage' ? 'subsidy_percentage' : 'percentage';
          if (numVal != null) schoolCutValue = numVal > 1 ? numVal / 100 : numVal;
        } else if (cutTypeRaw === 'weekly') { schoolCutType = 'weekly_fixed'; schoolCutValue = numVal; }
        else if (cutTypeRaw === 'session fixed') { schoolCutType = 'session_fixed'; schoolCutValue = numVal; }
        else if (cutTypeRaw === 'student per session') { schoolCutType = 'student_per_session'; schoolCutValue = numVal; }
        else if (cutTypeRaw === 'student per week') { schoolCutType = 'student_per_week'; schoolCutValue = numVal; }
        if (cutValueRaw && !cutValueRaw.match(/^[\d.$%\s]+$/)) schoolCutNotes = cutValueRaw;
      }

      const locData = {
        nickname, school_name: (row['School Name'] || nickname).trim(),
        active: toBool(row['Active']), payment_through_us: toBool(row['Payment Through Us']),
        location_type_id: ltId, location_phone: (row['Location Phone'] || '').trim(),
        address: (row['Address'] || '').trim(), city_id: cityId, geographic_area_id_online: areaId,
        point_of_contact: (row['Point of Contact'] || '').trim(),
        poc_phone: (row['POC Phone'] || '').trim(), poc_email: (row['POC Email'] || '').trim(),
        poc_title: (row['POC Title'] || '').trim() || null,
        contractor_id: conId, location_enrollment: parseInt(row['Location Enrollment']) || null,
        demo_allowed: toBool(row['Demo Allowed']),
        demo_pay: parseInt(row['Base Professor Pay']) || null,
        virtus_required: toBool(row['Virtus Required']), tb_required: toBool(row['TB Required']),
        livescan_required: toBool(row['Livescan Required']),
        livescan_info: (row['Livescan Info'] || '').trim() || null,
        contract_permit_required: toBool(row['Contract/Permit Required']),
        contract_permit_notes: (row['Contract/Permit Notes'] || '').trim() || null,
        special_info_required: (row['Special Info Required'] || '').trim() || null,
        flyer_required: toBool(row['Flyer Required']),
        registration_link_for_flyer: (row['Registration Link for Flyer'] || '').trim() || null,
        custom_flyer_required: toBool(row['Custom Flyer Required']),
        custom_flyer_items_required: (row['Custom Flyer Items Required'] || '').trim() || null,
        flyer_quantity: parseInt(row['Flyer Quantity']) || null,
        parking_difficulty_id: pdId, parking_information: parkText || null,
        internal_notes: (row['Internal Notes'] || '').trim() || null,
        observes_allowed: row['Observes Allowed'] ? toBool(row['Observes Allowed']) : null,
        jewish: row['Jewish'] ? toBool(row['Jewish']) : null,
        set_dates_ourselves: row['Set Dates Ourselves'] ? (row['Set Dates Ourselves'].trim().toUpperCase() === 'YES' ? 1 : 0) : null,
        number_of_weeks: parseInt(row['Number of Weeks']) || null,
        school_calendar_link: (row['School Calendar Link'] || '').trim() || null,
        invoicing_notes: (row['Invoicing Notes'] || '').trim() || null,
        retained: toBool(row['Retained Client']),
        client_manager_user_id: cmId, class_pricing_type_id: ptId,
        school_cut_type: schoolCutType, school_cut_value: schoolCutValue,
        school_cut_notes: schoolCutNotes, tbd: 0,
      };

      const existingId = locByNick[nickname.toUpperCase()];
      if (existingId) {
        const entries = Object.entries(locData).filter(([, v]) => v !== undefined);
        await pool.query(
          `UPDATE location SET ${entries.map(([k]) => `${k} = ?`).join(', ')}, ts_updated = NOW() WHERE id = ?`,
          [...entries.map(([, v]) => v), existingId]
        );
        updated++;
      } else {
        const keys = Object.keys(locData);
        await pool.query(
          `INSERT INTO location (${keys.join(', ')}, ts_inserted, ts_updated) VALUES (${keys.map(() => '?').join(', ')}, NOW(), NOW())`,
          Object.values(locData)
        );
        created++;
      }
    } catch (err) {
      errors.push(`${row['Nickname']}: ${err.message}`);
    }
  }

  console.log(`\n=== IMPORT COMPLETE ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Cities created: ${citiesCreated}`);
  if (missingContractors.size) console.log(`Missing contractors (not in DB):`, [...missingContractors]);
  console.log(`Errors: ${errors.length}`);
  if (errors.length) errors.slice(0, 20).forEach(e => console.log(' ', e));
  process.exit();
}

run().catch(err => { console.error(err); process.exit(1); });
