/**
 * Migration: add party_ship_status to program table
 * Values: 'pending' | 'prepped' | 'shipped'
 * Run: node server/scripts/add-party-ship-status.js
 */
const pool = require('../db/pool');

async function run() {
  const conn = await pool.getConnection();
  try {
    const [cols] = await conn.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'program' AND COLUMN_NAME = 'party_ship_status'`
    );
    if (cols.length === 0) {
      await conn.query(
        `ALTER TABLE program
         ADD COLUMN party_ship_status ENUM('pending','prepped','shipped') NOT NULL DEFAULT 'pending'
         AFTER materials_prepared`
      );
      console.log('Added party_ship_status to program');
    } else {
      console.log('party_ship_status already exists');
    }
    console.log('Done.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit(process.exitCode || 0);
  }
}

run();
