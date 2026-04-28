/**
 * Migration: post-class feedback fields on session
 *
 * Lead professors fill these out after a class:
 *   - actual_kids_count — how many showed up
 *   - lead_notes — optional class notes
 *   - fun_for_students — 0/1, lead's read on student engagement
 *   - easy_to_teach — 0/1, curriculum signal
 *
 * Run: node server/scripts/add-session-feedback.js
 */
const pool = require('../db/pool');

async function run() {
  const conn = await pool.getConnection();
  try {
    const cols = ['actual_kids_count', 'lead_notes', 'fun_for_students', 'easy_to_teach'];
    const [existing] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'session' AND COLUMN_NAME IN (?, ?, ?, ?)`,
      cols
    );
    const have = new Set(existing.map(r => r.COLUMN_NAME));
    const adds = [];
    if (!have.has('actual_kids_count')) adds.push('ADD COLUMN actual_kids_count INT NULL');
    if (!have.has('lead_notes'))        adds.push('ADD COLUMN lead_notes TEXT NULL');
    if (!have.has('fun_for_students'))  adds.push('ADD COLUMN fun_for_students TINYINT(1) NULL');
    if (!have.has('easy_to_teach'))     adds.push('ADD COLUMN easy_to_teach TINYINT(1) NULL');

    if (adds.length === 0) { console.log('All feedback columns already exist'); return; }

    await conn.query(`ALTER TABLE session ${adds.join(', ')}`);
    console.log('Added columns:', adds.map(a => a.replace('ADD COLUMN ', '').split(' ')[0]).join(', '));
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit();
  }
}

run();
