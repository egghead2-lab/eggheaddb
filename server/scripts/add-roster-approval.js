/**
 * Migration: Add roster approval tracking
 * - Adds pending_approval column to program_roster
 * - Adds added_by_user_id to track who added the student
 * - Adds approved_by_user_id and approved_at for audit
 *
 * Run: node server/scripts/add-roster-approval.js
 */
const pool = require('../db/pool');

async function run() {
  const conn = await pool.getConnection();
  try {
    // Check if column already exists
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'program_roster' AND COLUMN_NAME = 'pending_approval'`
    );

    if (cols.length === 0) {
      await conn.query(`ALTER TABLE program_roster
        ADD COLUMN pending_approval TINYINT(1) NOT NULL DEFAULT 0 AFTER notes,
        ADD COLUMN added_by_user_id INT NULL AFTER pending_approval,
        ADD COLUMN approved_by_user_id INT NULL AFTER added_by_user_id,
        ADD COLUMN approved_at DATETIME NULL AFTER approved_by_user_id`
      );
      console.log('Added pending_approval, added_by_user_id, approved_by_user_id, approved_at columns to program_roster');
    } else {
      console.log('Columns already exist');
    }

    console.log('Done!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

run();
