require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const pool = require('../db/pool');

async function main() {
  // Check if already exists
  const [existing] = await pool.query("SELECT id FROM tool WHERE path = '/email-blasts'");
  if (existing.length) {
    console.log('Email Blast Tool already exists, id:', existing[0].id);
    process.exit(0);
  }

  // Find max sort_order in Client Management group
  const [maxSort] = await pool.query("SELECT MAX(sort_order) as mx FROM tool WHERE nav_group = 'Client Management'");
  const sortOrder = (maxSort[0]?.mx || 0) + 1;

  const [ins] = await pool.query(
    "INSERT INTO tool (path, label, nav_group, sort_order, universal, active) VALUES (?, ?, ?, ?, ?, 1)",
    ['/email-blasts', 'Email Blast Tool', 'Client Management', sortOrder, 0]
  );
  console.log('Created tool id:', ins.insertId);

  // Assign to Admin, CEO, Field Manager roles
  const [roles] = await pool.query("SELECT id, role_name FROM role WHERE role_name IN ('Admin', 'CEO', 'Field Manager')");
  for (const role of roles) {
    await pool.query('INSERT INTO tool_role (tool_id, role_id) VALUES (?,?)', [ins.insertId, role.id]);
    console.log('  Assigned to', role.role_name);
  }

  console.log('Done');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
