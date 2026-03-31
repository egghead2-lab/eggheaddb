const mysql = require('mysql2/promise');

const config = {
  host: 'egghead.mysql.database.azure.com',
  port: 3306,
  user: 'eggheaddb',
  password: 'Meesterodb1*',
  database: 'program_data',
  ssl: { rejectUnauthorized: false },
};

async function inspect() {
  const conn = await mysql.createConnection(config);

  const [columns] = await conn.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_key, extra, column_default
    FROM information_schema.columns
    WHERE table_schema = 'program_data'
    ORDER BY table_name, ordinal_position
  `);

  // Group by table
  const tables = {};
  for (const col of columns) {
    const t = col.TABLE_NAME;
    if (!tables[t]) tables[t] = [];
    const flags = [];
    if (col.COLUMN_KEY === 'PRI') flags.push('PK');
    if (col.COLUMN_KEY === 'UNI') flags.push('UNI');
    if (col.COLUMN_KEY === 'MUL') flags.push('FK');
    if (col.EXTRA.includes('auto_increment')) flags.push('AI');
    if (col.IS_NULLABLE === 'NO' && !flags.includes('PK')) flags.push('NN');
    tables[t].push(`  ${col.COLUMN_NAME} (${col.DATA_TYPE})${flags.length ? ' [' + flags.join(',') + ']' : ''}`);
  }

  console.log('\n===== TABLE LIST =====');
  console.log(Object.keys(tables).sort().join(', '));

  console.log('\n===== SCHEMA =====');
  for (const [table, cols] of Object.entries(tables)) {
    console.log(`\n${table}:`);
    cols.forEach(c => console.log(c));
  }

  const [fks] = await conn.query(`
    SELECT constraint_name, table_name, column_name, referenced_table_name, referenced_column_name
    FROM information_schema.key_column_usage
    WHERE table_schema = 'program_data' AND referenced_table_name IS NOT NULL
    ORDER BY table_name, column_name
  `);

  console.log('\n===== FOREIGN KEYS =====');
  for (const fk of fks) {
    console.log(`${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`);
  }

  await conn.end();
}

inspect().catch(console.error);
