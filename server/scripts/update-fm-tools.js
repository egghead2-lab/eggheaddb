/**
 * Migration: Remove old FM sidebar entries (daily-log, mileage, misc-pay)
 * and camp order builder, then add the new unified "My Workday" tool.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const pool = require('../db/pool');

async function run() {
  console.log('Deactivating old FM tools and Camp Order Builder...');

  // Deactivate the 3 old FM alias routes and camp order builder
  const pathsToRemove = [
    '/fm/daily-log',
    '/fm/mileage',
    '/fm/misc-pay',
    '/materials/camp-orders',  // camp order builder if it exists
  ];

  for (const p of pathsToRemove) {
    const [result] = await pool.query('UPDATE tool SET active = 0 WHERE path = ?', [p]);
    if (result.affectedRows) console.log(`  Deactivated: ${p}`);
    else console.log(`  Not found (skipped): ${p}`);
  }

  // Also search by label for camp order builder in case path differs
  const [campResult] = await pool.query(
    "UPDATE tool SET active = 0 WHERE label LIKE '%Camp Order%' AND active = 1"
  );
  if (campResult.affectedRows) console.log(`  Deactivated ${campResult.affectedRows} Camp Order tool(s) by label`);

  // Insert the new My Workday tool
  console.log('Adding My Workday tool...');
  try {
    // Get the Field Manager role id
    const [[fmRole]] = await pool.query("SELECT id FROM role WHERE role_name = 'Field Manager' AND active = 1");

    const [ins] = await pool.query(
      "INSERT INTO tool (path, label, nav_group, universal, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)",
      ['/fm/workday', 'My Workday', 'FM Tools', 0, 1]
    );
    console.log(`  Created tool id=${ins.insertId}`);

    // Assign to Field Manager role (and Admin/CEO see everything automatically)
    if (fmRole) {
      await pool.query('INSERT INTO tool_role (tool_id, role_id) VALUES (?,?)', [ins.insertId, fmRole.id]);
      console.log(`  Assigned to Field Manager role (id=${fmRole.id})`);
    }

    // Also assign to Admin/CEO roles if they aren't auto-included
    const [adminRoles] = await pool.query("SELECT id FROM role WHERE role_name IN ('Admin', 'CEO') AND active = 1");
    for (const r of adminRoles) {
      await pool.query('INSERT IGNORE INTO tool_role (tool_id, role_id) VALUES (?,?)', [ins.insertId, r.id]);
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      console.log('  My Workday tool already exists, updating...');
      await pool.query("UPDATE tool SET active = 1, nav_group = 'FM Tools', sort_order = 1 WHERE path = '/fm/workday'");
    } else {
      throw err;
    }
  }

  console.log('Done!');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
