require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'egghead.mysql.database.azure.com',
    port: 3306,
    user: 'eggheaddb',
    password: 'Meesterodb1*',
    database: 'program_data',
    ssl: { rejectUnauthorized: false },
  });

  console.log('\n===== USERS =====');
  const [users] = await conn.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.user_name, u.password, r.role_name, u.active
     FROM user u
     LEFT JOIN role r ON r.id = u.role_id
     ORDER BY u.id`
  );
  console.table(users);

  await conn.end();
}

main().catch(console.error);
