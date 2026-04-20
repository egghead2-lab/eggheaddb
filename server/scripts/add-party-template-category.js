/**
 * Migration: add category column to party_email_template
 * Categories: 'confirmation' (default), 'follow_up', 'charge'
 *
 * Run: node server/scripts/add-party-template-category.js
 */
const pool = require('../db/pool');

async function run() {
  const conn = await pool.getConnection();
  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'party_email_template' AND COLUMN_NAME = 'category'`
    );
    if (cols.length === 0) {
      await conn.query(
        "ALTER TABLE party_email_template ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'confirmation'"
      );
      console.log('Added category to party_email_template');
    } else {
      console.log('category already exists on party_email_template');
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
