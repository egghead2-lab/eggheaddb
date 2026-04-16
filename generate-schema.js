const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const dbConfig = {
  host: 'egghead.mysql.database.azure.com',
  port: 3306,
  user: 'eggheaddb',
  password: 'Meesterodb1*',
  database: 'program_data',
  ssl: { rejectUnauthorized: false }
};

// Table groupings - prefix/keyword-based
const groupRules = [
  { name: 'Programs & Sessions', prefixes: ['program', 'session', 'attendance', 'roster', 'enrollment', 'curriculum', 'curriculum_backup'] },
  { name: 'Locations & Geography', prefixes: ['location', 'city', 'state', 'region', 'geographic_area', 'parking'] },
  { name: 'Classes & Lessons', prefixes: ['class', 'lesson', 'lab_fee', 'default_location_class', 'default_grade'] },
  { name: 'Professors & Staff', prefixes: ['professor', 'contractor', 'availability', 'livescan', 'evaluation', 'observation', 'professor_status', 'poc_title'] },
  { name: 'Hiring & Onboarding', prefixes: ['candidate', 'hiring', 'onboard', 'hiring_request'] },
  { name: 'Parties & Events', prefixes: ['party', 'demo', 'camp'] },
  { name: 'Students & Parents', prefixes: ['student', 'parent', 'grade'] },
  { name: 'Payroll & Pay', prefixes: ['payroll', 'pay', 'mileage', 'misc_pay', 'gusto', 'field_manager', 'onboarding_pay', 'program_session_pay', 'party_session_pay'] },
  { name: 'Invoicing & Billing', prefixes: ['invoice', 'qb', 'cut_type', 'our_cut', 'program_cut', 'location_cut', 'contract_permit'] },
  { name: 'Shipping & Materials', prefixes: ['shipment', 'bin', 'has_bin', 'stock', 'mapping_id'] },
  { name: 'Users, Roles & Access', prefixes: ['user', 'role', 'report', 'tool', 'permission'] },
  { name: 'Notifications & Comms', prefixes: ['notification', 'email_template', 'sms_template', 'twilio', 'client_email', 'party_email'] },
  { name: 'HR & Compliance', prefixes: ['incident', 'review', 'sub_claim', 'substitute', 'day_off', 'holiday', 'bug_report', 'audit'] },
  { name: 'System & Config', prefixes: ['app_setting', 'system_setting', 'nightly_job', 'weekday'] },
];

function assignGroup(tableName) {
  for (const group of groupRules) {
    for (const prefix of group.prefixes) {
      if (tableName === prefix || tableName.startsWith(prefix + '_') || tableName.startsWith(prefix)) {
        return group.name;
      }
    }
  }
  return 'Other';
}

async function main() {
  const conn = await mysql.createConnection(dbConfig);
  console.log('Connected to database.');

  // 1. Get all tables
  const [tableRows] = await conn.query('SHOW TABLES');
  const dbKey = Object.keys(tableRows[0])[0];
  const allTables = tableRows.map(r => r[dbKey]);
  console.log(`Found ${allTables.length} tables.`);

  // 2. Get all foreign keys from information_schema
  const [fkRows] = await conn.query(`
    SELECT
      TABLE_NAME,
      COLUMN_NAME,
      CONSTRAINT_NAME,
      REFERENCED_TABLE_NAME,
      REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME
  `, [dbConfig.database]);

  const fksByTable = {};
  for (const fk of fkRows) {
    if (!fksByTable[fk.TABLE_NAME]) fksByTable[fk.TABLE_NAME] = [];
    fksByTable[fk.TABLE_NAME].push(fk);
  }

  // 3. Get DESCRIBE for each table
  const tableDescriptions = {};
  for (const table of allTables) {
    const [cols] = await conn.query(`DESCRIBE \`${table}\``);
    tableDescriptions[table] = cols;
  }

  await conn.end();

  // 4. Organize tables into groups
  const groups = {};
  for (const table of allTables) {
    const groupName = assignGroup(table);
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(table);
  }

  // Sort groups by defined order, Other last
  const groupOrder = groupRules.map(g => g.name);
  groupOrder.push('Other');
  const sortedGroupNames = Object.keys(groups).sort((a, b) => {
    return groupOrder.indexOf(a) - groupOrder.indexOf(b);
  });

  // 5. Build markdown
  let md = `# Database Schema: program_data\n\n`;
  md += `**Host:** egghead.mysql.database.azure.com  \n`;
  md += `**Generated:** ${new Date().toISOString().slice(0, 10)}  \n`;
  md += `**Total Tables:** ${allTables.length}  \n\n`;

  // Table of contents
  md += `## Table of Contents\n\n`;
  for (const groupName of sortedGroupNames) {
    const tables = groups[groupName];
    if (!tables || tables.length === 0) continue;
    md += `- **${groupName}** (${tables.length} tables)\n`;
    for (const table of tables.sort()) {
      const anchor = table.replace(/_/g, '-');
      md += `  - [${table}](#${anchor})\n`;
    }
  }
  md += `\n---\n\n`;

  // Sections per group
  for (const groupName of sortedGroupNames) {
    const tables = groups[groupName];
    if (!tables || tables.length === 0) continue;

    md += `# ${groupName}\n\n`;

    for (const table of tables.sort()) {
      md += `## ${table}\n\n`;

      const cols = tableDescriptions[table];
      md += `| Column | Type | Null | Key | Default |\n`;
      md += `|--------|------|------|-----|---------|\n`;
      for (const col of cols) {
        const nullable = col.Null === 'YES' ? 'YES' : 'NO';
        const key = col.Key || '';
        const def = col.Default !== null && col.Default !== undefined ? String(col.Default) : 'NULL';
        const extra = col.Extra ? ` *(${col.Extra})*` : '';
        md += `| \`${col.Field}\` | \`${col.Type}\`${extra} | ${nullable} | ${key} | \`${def}\` |\n`;
      }

      const fks = fksByTable[table];
      if (fks && fks.length > 0) {
        md += `\n**Foreign Keys:**\n\n`;
        for (const fk of fks) {
          md += `- \`${fk.COLUMN_NAME}\` → \`${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}\` *(${fk.CONSTRAINT_NAME})*\n`;
        }
      }

      md += `\n`;
    }
  }

  const outputPath = path.join('C:/App Coding/Database Tools', 'SCHEMA.md');
  fs.writeFileSync(outputPath, md, 'utf8');
  console.log(`\nSchema written to: ${outputPath}`);
  console.log(`Total size: ${(md.length / 1024).toFixed(1)} KB`);

  // Summary
  console.log('\nGroup summary:');
  for (const groupName of sortedGroupNames) {
    const tables = groups[groupName];
    if (tables) console.log(`  ${groupName}: ${tables.length} tables`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
