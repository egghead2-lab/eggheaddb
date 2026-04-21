/**
 * Migration: Flyer Tool tables + supporting columns
 *
 * - Adds `flyer_instructions` to `location` (per-location notes shown when generating a flyer)
 * - Creates `flyer_template` (uploaded PDF templates)
 * - Creates `flyer_template_field` (named merge zones drawn over each template)
 *
 * Idempotent — safe to re-run.
 *
 * Run: node server/scripts/add-flyer-tools.js
 */
const pool = require('../db/pool');

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    // 1. location.flyer_instructions
    if (!(await columnExists(conn, 'location', 'flyer_instructions'))) {
      await conn.query(
        "ALTER TABLE location ADD COLUMN flyer_instructions VARCHAR(2048) NULL AFTER custom_flyer_items_required"
      );
      console.log('Added flyer_instructions to location');
    } else {
      console.log('flyer_instructions already exists on location');
    }

    // 2. flyer_template
    if (!(await tableExists(conn, 'flyer_template'))) {
      await conn.query(`
        CREATE TABLE flyer_template (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          season VARCHAR(32) NULL,
          description VARCHAR(1024) NULL,
          pdf_storage_path VARCHAR(512) NOT NULL,
          pdf_page_width DECIMAL(10,2) NOT NULL,
          pdf_page_height DECIMAL(10,2) NOT NULL,
          page_count INT NOT NULL DEFAULT 1,
          is_archived TINYINT(1) NOT NULL DEFAULT 0,
          active TINYINT(1) NOT NULL DEFAULT 1,
          created_by_user_id INT NULL,
          ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ts_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_season_archived (season, is_archived),
          KEY idx_active (active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('Created flyer_template');
    } else {
      console.log('flyer_template already exists');
    }

    // 3. flyer_template_field
    if (!(await tableExists(conn, 'flyer_template_field'))) {
      await conn.query(`
        CREATE TABLE flyer_template_field (
          id INT AUTO_INCREMENT PRIMARY KEY,
          flyer_template_id INT NOT NULL,
          field_key VARCHAR(64) NOT NULL,
          field_label VARCHAR(255) NOT NULL,
          field_type ENUM('text','qr_code','image') NOT NULL,
          page_number INT NOT NULL DEFAULT 1,
          x DECIMAL(10,2) NOT NULL,
          y DECIMAL(10,2) NOT NULL,
          width DECIMAL(10,2) NOT NULL,
          height DECIMAL(10,2) NOT NULL,
          font_size DECIMAL(5,2) NULL DEFAULT 12,
          font_family VARCHAR(64) NULL DEFAULT 'Helvetica',
          font_color VARCHAR(7) NULL DEFAULT '#000000',
          alignment ENUM('left','center','right') NULL DEFAULT 'left',
          auto_shrink TINYINT(1) NOT NULL DEFAULT 1,
          is_optional TINYINT(1) NOT NULL DEFAULT 0,
          display_order INT NOT NULL DEFAULT 0,
          ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ts_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_template_field (flyer_template_id, field_key),
          KEY idx_template (flyer_template_id),
          CONSTRAINT fk_flyer_field_template FOREIGN KEY (flyer_template_id) REFERENCES flyer_template(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('Created flyer_template_field');
    } else {
      console.log('flyer_template_field already exists');
    }

    console.log('\nMigration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit(process.exitCode || 0);
  }
}

run();
