/**
 * Migration: Trainual integration
 * - Creates trainual_user table (cache of Trainual users keyed by email)
 * - Adds trainual_user_id and trainual_invited_at to candidate
 *
 * Run: node server/scripts/add-trainual-tables.js
 */
const pool = require('../db/pool');

async function run() {
  const conn = await pool.getConnection();
  try {
    // 1. Create trainual_user table if not exists
    const [tables] = await conn.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trainual_user'`
    );
    if (tables.length === 0) {
      await conn.query(`CREATE TABLE trainual_user (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trainual_user_id INT NOT NULL,
        email VARCHAR(128) NOT NULL,
        name VARCHAR(255),
        title VARCHAR(255),
        permission VARCHAR(32),
        avg_completion DECIMAL(5,2),
        status VARCHAR(32),
        last_synced_at DATETIME NOT NULL,
        ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ts_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_trainual_user_id (trainual_user_id),
        KEY idx_email (email),
        KEY idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      console.log('Created trainual_user table');
    } else {
      console.log('trainual_user table already exists');
    }

    // 2. Add trainual columns to candidate
    const [candCols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'candidate' AND COLUMN_NAME = 'trainual_user_id'`
    );
    if (candCols.length === 0) {
      await conn.query(`ALTER TABLE candidate
        ADD COLUMN trainual_user_id INT NULL,
        ADD COLUMN trainual_invited_at DATETIME NULL`);
      console.log('Added trainual_user_id and trainual_invited_at columns to candidate');
    } else {
      console.log('candidate trainual columns already exist');
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
