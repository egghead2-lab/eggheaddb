/**
 * Migration: Add sub_claim table for professor substitute claims
 *
 * Run: node server/scripts/add-sub-claims.js
 */
const pool = require('../db/pool');

async function run() {
  const conn = await pool.getConnection();
  try {
    const [tables] = await conn.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sub_claim'`
    );

    if (tables.length === 0) {
      await conn.query(`
        CREATE TABLE sub_claim (
          id INT AUTO_INCREMENT PRIMARY KEY,
          session_id INT NOT NULL,
          professor_id INT NOT NULL,
          role ENUM('Lead', 'Assistant') NOT NULL DEFAULT 'Lead',
          status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
          expected_pay DECIMAL(8,2),
          claimed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          reviewed_by INT NULL,
          reviewed_at DATETIME NULL,
          reject_reason VARCHAR(255) NULL,
          active TINYINT(1) NOT NULL DEFAULT 1,
          UNIQUE KEY uniq_session_role (session_id, role, active),
          INDEX idx_status (status),
          INDEX idx_professor (professor_id)
        )
      `);
      console.log('Created sub_claim table');
    } else {
      console.log('sub_claim table already exists');
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
