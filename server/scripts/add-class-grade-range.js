/**
 * Migration: grade range on class (curriculum module)
 *
 * Stored as integers, K = 0. NULL means "no constraint."
 * Used to soft-warn schedulers when a program's grade_range falls
 * outside the module's intended grade range.
 *
 * Run: node server/scripts/add-class-grade-range.js
 */
const pool = require('../db/pool');

async function run() {
  const conn = await pool.getConnection();
  try {
    const [existing] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'class' AND COLUMN_NAME IN ('min_grade','max_grade')`
    );
    const have = new Set(existing.map(r => r.COLUMN_NAME));
    const adds = [];
    if (!have.has('min_grade')) adds.push('ADD COLUMN min_grade INT NULL');
    if (!have.has('max_grade')) adds.push('ADD COLUMN max_grade INT NULL');
    if (adds.length === 0) { console.log('Already exists'); return; }
    await conn.query(`ALTER TABLE class ${adds.join(', ')}`);
    console.log('Added:', adds.map(a => a.replace('ADD COLUMN ','').split(' ')[0]).join(', '));
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit();
  }
}
run();
