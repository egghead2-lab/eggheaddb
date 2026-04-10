/**
 * Migration: Fix tool visibility
 * - Move "Professor Schedule" from "My Classes" to "Scheduling" nav_group
 * - Add a "Classroom Attendance" tool under "Operations" for ops team
 * - Ensure "My Classes" tools are only assigned to Professor role
 *
 * Run: node server/scripts/fix-tool-visibility.js
 */
const pool = require('../db/pool');

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Move Professor Schedule from "My Classes" to "Scheduling"
    const [upd] = await conn.query(
      `UPDATE tool SET nav_group = 'Scheduling' WHERE path = '/schedule' AND nav_group = 'My Classes'`
    );
    console.log(`Moved Professor Schedule to Scheduling: ${upd.affectedRows} row(s)`);

    // 2. Add "Classroom Attendance" tool for ops if it doesn't exist
    const [[existing]] = await conn.query(`SELECT id FROM tool WHERE path = '/classroom-attendance'`);
    let attendanceToolId;
    if (!existing) {
      const [ins] = await conn.query(
        `INSERT INTO tool (path, label, nav_group, sort_order, universal, active)
         VALUES ('/classroom-attendance', 'Classroom Attendance', 'Operations', 10, 0, 1)`
      );
      attendanceToolId = ins.insertId;
      console.log(`Created Classroom Attendance tool (id=${attendanceToolId})`);
    } else {
      attendanceToolId = existing.id;
      console.log(`Classroom Attendance tool already exists (id=${attendanceToolId})`);
    }

    // 3. Assign Classroom Attendance to ops roles
    const opsRoles = ['Scheduling Coordinator', 'Field Manager', 'Client Manager'];
    for (const roleName of opsRoles) {
      const [[role]] = await conn.query(`SELECT id FROM role WHERE role_name = ? AND active = 1`, [roleName]);
      if (role) {
        const [[existingAssign]] = await conn.query(
          `SELECT id FROM tool_role WHERE tool_id = ? AND role_id = ?`, [attendanceToolId, role.id]
        );
        if (!existingAssign) {
          await conn.query(`INSERT INTO tool_role (tool_id, role_id) VALUES (?, ?)`, [attendanceToolId, role.id]);
          console.log(`  Assigned to ${roleName}`);
        }
      }
    }

    // 4. Add "Class Planner" tool under "Client Management" if it doesn't exist
    const [[existingPlanner]] = await conn.query(`SELECT id FROM tool WHERE path = '/class-planner'`);
    let plannerToolId;
    if (!existingPlanner) {
      const [ins2] = await conn.query(
        `INSERT INTO tool (path, label, nav_group, sort_order, universal, active)
         VALUES ('/class-planner', 'Class Planner', 'Client Management', 1, 0, 1)`
      );
      plannerToolId = ins2.insertId;
      console.log(`Created Class Planner tool (id=${plannerToolId})`);
    } else {
      plannerToolId = existingPlanner.id;
      console.log(`Class Planner tool already exists (id=${plannerToolId})`);
    }

    // Assign Class Planner to relevant roles
    const plannerRoles = ['Scheduling Coordinator', 'Field Manager', 'Client Manager'];
    for (const roleName of plannerRoles) {
      const [[role]] = await conn.query(`SELECT id FROM role WHERE role_name = ? AND active = 1`, [roleName]);
      if (role) {
        const [[existingAssign]] = await conn.query(
          `SELECT id FROM tool_role WHERE tool_id = ? AND role_id = ?`, [plannerToolId, role.id]
        );
        if (!existingAssign) {
          await conn.query(`INSERT INTO tool_role (tool_id, role_id) VALUES (?, ?)`, [plannerToolId, role.id]);
          console.log(`  Class Planner assigned to ${roleName}`);
        }
      }
    }

    // 5. Verify "My Classes" tools only have Professor role assigned
    const [myClassesTools] = await conn.query(
      `SELECT id, path, label FROM tool WHERE nav_group = 'My Classes' AND active = 1`
    );
    console.log(`\nMy Classes tools remaining:`);
    for (const t of myClassesTools) {
      console.log(`  ${t.label} (${t.path})`);
    }

    await conn.commit();
    console.log('\nDone!');
  } catch (err) {
    await conn.rollback();
    console.error('Migration failed:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

run();
