/**
 * Migration: Email open tracking + message read indicators (candidate onboarding only)
 * - Adds read_at to candidate_message (timestamp of when the recipient first viewed it)
 * - Adds track_token to candidate_email (unique random token for tracking pixel URL)
 * - Creates candidate_email_open table (one row per open event)
 *
 * Run: node server/scripts/add-email-tracking.js
 */
const pool = require('../db/pool');

async function colExists(conn, table, col) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, col]
  );
  return rows.length > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    if (!(await colExists(conn, 'candidate_message', 'read_at'))) {
      await conn.query('ALTER TABLE candidate_message ADD COLUMN read_at DATETIME NULL');
      console.log('Added read_at to candidate_message');
    } else {
      console.log('candidate_message.read_at already exists');
    }

    if (!(await colExists(conn, 'candidate_email', 'track_token'))) {
      await conn.query('ALTER TABLE candidate_email ADD COLUMN track_token VARCHAR(64) NULL, ADD UNIQUE KEY uq_track_token (track_token)');
      console.log('Added track_token to candidate_email');
    } else {
      console.log('candidate_email.track_token already exists');
    }

    if (!(await tableExists(conn, 'candidate_email_open'))) {
      await conn.query(`CREATE TABLE candidate_email_open (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_email_id INT NOT NULL,
        opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip VARCHAR(64) NULL,
        user_agent VARCHAR(512) NULL,
        KEY idx_candidate_email_id (candidate_email_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      console.log('Created candidate_email_open table');
    } else {
      console.log('candidate_email_open table already exists');
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
