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

  console.log('\n===== COLUMNS =====');
  const [columns] = await conn.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_key, extra, column_default
    FROM information_schema.columns
    WHERE table_schema = 'program_data'
    ORDER BY table_name, ordinal_position
  `);
  console.log(JSON.stringify(columns, null, 2));

  console.log('\n===== CONSTRAINTS =====');
  const [constraints] = await conn.query(`
    SELECT table_name, constraint_name, constraint_type
    FROM information_schema.table_constraints
    WHERE table_schema = 'program_data'
  `);
  console.log(JSON.stringify(constraints, null, 2));

  console.log('\n===== FOREIGN KEYS =====');
  const [fks] = await conn.query(`
    SELECT constraint_name, table_name, column_name, referenced_table_name, referenced_column_name
    FROM information_schema.key_column_usage
    WHERE table_schema = 'program_data' AND referenced_table_name IS NOT NULL
  `);
  console.log(JSON.stringify(fks, null, 2));

  await conn.end();
}

inspect().catch(console.error);
