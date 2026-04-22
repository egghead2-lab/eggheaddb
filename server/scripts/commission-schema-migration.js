/**
 * Sales Commission Module — Schema Migration
 *
 * Applies all DDL from the Sales Commission spec:
 * - §3.2: contractor + location commission columns
 * - §4.1–4.6: new tables
 * - §4.7: program booking_type columns + program_booking_type_log
 *
 * Idempotent: checks for column/table existence before creating.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const pool = require('../db/pool');

async function hasColumn(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function hasTable(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) cnt FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

async function addColumn(table, column, ddl) {
  if (await hasColumn(table, column)) { console.log(`  SKIP ${table}.${column} — exists`); return; }
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`  ADDED ${table}.${column}`);
}

async function createTable(name, ddl) {
  if (await hasTable(name)) { console.log(`  SKIP table ${name} — exists`); return; }
  await pool.query(ddl);
  console.log(`  CREATED ${name}`);
}

(async () => {
  console.log('=== Sales Commission schema migration ===\n');

  // §3.2 contractor
  console.log('contractor columns:');
  await addColumn('contractor', 'retained', `retained TINYINT(1) NULL`);
  await addColumn('contractor', 'non_initial_client', `non_initial_client TINYINT(1) NOT NULL DEFAULT 0`);

  // §3.2 location — note location.retained already exists for operational use;
  // we need a separate retained_commission flag
  console.log('\nlocation columns:');
  await addColumn('location', 'retained_commission', `retained_commission TINYINT(1) NULL`);
  await addColumn('location', 'non_initial_client', `non_initial_client TINYINT(1) NOT NULL DEFAULT 0`);

  // §4.7 program
  console.log('\nprogram columns:');
  await addColumn('program', 'booking_type', `booking_type ENUM('initial','rebook') NOT NULL DEFAULT 'rebook'`);
  await addColumn('program', 'booking_type_manual_override', `booking_type_manual_override TINYINT(1) NOT NULL DEFAULT 0`);
  await addColumn('program', 'booking_type_set_at', `booking_type_set_at DATETIME NULL`);
  await addColumn('program', 'booking_type_set_by_user_id', `booking_type_set_by_user_id INT NULL`);

  // index on program.booking_type
  try {
    await pool.query(`ALTER TABLE program ADD INDEX idx_booking_type (booking_type)`);
    console.log(`  ADDED program idx_booking_type`);
  } catch (e) {
    if (e.code === 'ER_DUP_KEYNAME') console.log(`  SKIP program idx_booking_type — exists`);
    else throw e;
  }

  console.log('\nnew tables:');

  // §4.1 salesperson_commission_plan
  await createTable('salesperson_commission_plan', `
    CREATE TABLE salesperson_commission_plan (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      effective_from DATE NOT NULL,
      effective_to DATE NULL,
      monthly_quota DECIMAL(10,2) NOT NULL DEFAULT 50000.00,
      initial_rate DECIMAL(6,4) NOT NULL DEFAULT 0.0500,
      rebook_rate DECIMAL(6,4) NOT NULL DEFAULT 0.0250,
      non_retained_flat_fee DECIMAL(8,2) NOT NULL DEFAULT 250.00,
      notes TEXT,
      created_by_user_id INT NOT NULL,
      ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ts_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      active TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_user_effective (user_id, effective_from, effective_to)
    )
  `);

  // §4.2 contractor_salesperson
  await createTable('contractor_salesperson', `
    CREATE TABLE contractor_salesperson (
      id INT PRIMARY KEY AUTO_INCREMENT,
      contractor_id INT NOT NULL,
      user_id INT NOT NULL,
      split_pct DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
      effective_from DATE NOT NULL,
      effective_to DATE NULL,
      notes VARCHAR(512),
      created_by_user_id INT NOT NULL,
      ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      active TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_contractor (contractor_id, active),
      INDEX idx_user (user_id)
    )
  `);

  // §4.2 location_salesperson
  await createTable('location_salesperson', `
    CREATE TABLE location_salesperson (
      id INT PRIMARY KEY AUTO_INCREMENT,
      location_id INT NOT NULL,
      user_id INT NOT NULL,
      split_pct DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
      effective_from DATE NOT NULL,
      effective_to DATE NULL,
      notes VARCHAR(512),
      created_by_user_id INT NOT NULL,
      ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      active TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_location (location_id, active),
      INDEX idx_user (user_id)
    )
  `);

  // §4.3 contractor_commission_adjustment
  await createTable('contractor_commission_adjustment', `
    CREATE TABLE contractor_commission_adjustment (
      id INT PRIMARY KEY AUTO_INCREMENT,
      contractor_id INT NOT NULL,
      multiplier DECIMAL(5,4) NOT NULL,
      reason VARCHAR(512),
      effective_from DATE NOT NULL,
      effective_to DATE NULL,
      created_by_user_id INT NOT NULL,
      ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      active TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_contractor (contractor_id, active)
    )
  `);

  // §4.3 location_commission_adjustment
  await createTable('location_commission_adjustment', `
    CREATE TABLE location_commission_adjustment (
      id INT PRIMARY KEY AUTO_INCREMENT,
      location_id INT NOT NULL,
      multiplier DECIMAL(5,4) NOT NULL,
      reason VARCHAR(512),
      effective_from DATE NOT NULL,
      effective_to DATE NULL,
      created_by_user_id INT NOT NULL,
      ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      active TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_location (location_id, active)
    )
  `);

  // §4.4 commission_run
  await createTable('commission_run', `
    CREATE TABLE commission_run (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      plan_id INT NOT NULL,
      status ENUM('draft','pending_approval','approved','finalized','superseded') NOT NULL DEFAULT 'draft',
      rerun_of INT NULL,
      total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
      initial_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
      rebook_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
      initial_split DECIMAL(6,4) NOT NULL DEFAULT 0,
      above_quota DECIMAL(12,2) NOT NULL DEFAULT 0,
      initial_commission DECIMAL(10,2) NOT NULL DEFAULT 0,
      rebook_commission DECIMAL(10,2) NOT NULL DEFAULT 0,
      retained_commission DECIMAL(10,2) NOT NULL DEFAULT 0,
      non_retained_commission DECIMAL(10,2) NOT NULL DEFAULT 0,
      subtotal_commission DECIMAL(10,2) NOT NULL DEFAULT 0,
      prior_month_adjustment DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_payout DECIMAL(10,2) NOT NULL DEFAULT 0,
      submitted_by_user_id INT NULL,
      submitted_at DATETIME NULL,
      approved_by_user_id INT NULL,
      approved_at DATETIME NULL,
      finalized_by_user_id INT NULL,
      finalized_at DATETIME NULL,
      notes TEXT,
      ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ts_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      active TINYINT(1) NOT NULL DEFAULT 1,
      INDEX idx_user_period (user_id, period_start),
      INDEX idx_status (status)
    )
  `);

  // §4.5 commission_run_line
  await createTable('commission_run_line', `
    CREATE TABLE commission_run_line (
      id INT PRIMARY KEY AUTO_INCREMENT,
      commission_run_id INT NOT NULL,
      program_id INT NOT NULL,
      contractor_id INT NULL,
      location_id INT NOT NULL,
      line_type ENUM('retained','non_retained') NOT NULL,
      booking_type_original ENUM('initial','rebook') NOT NULL,
      booking_type_effective ENUM('initial','rebook') NOT NULL,
      booking_type_override_reason VARCHAR(512) NULL,
      non_initial_client_applied TINYINT(1) NOT NULL DEFAULT 0,
      parent_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      number_enrolled INT NOT NULL DEFAULT 0,
      session_count INT NOT NULL DEFAULT 0,
      sessions_run_in_period INT NOT NULL DEFAULT 0,
      first_session_date DATE NULL,
      program_booked_at DATETIME NULL,
      program_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
      adjustment_source ENUM('none','location','contractor') NOT NULL DEFAULT 'none',
      adjustment_multiplier DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
      adjusted_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
      split_pct DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
      line_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
      req_enrollment_hit TINYINT(1) NOT NULL DEFAULT 0,
      req_margin_hit TINYINT(1) NOT NULL DEFAULT 0,
      req_booked_3wk_hit TINYINT(1) NOT NULL DEFAULT 0,
      req_min_weeks_hit TINYINT(1) NOT NULL DEFAULT 0,
      req_program_ran TINYINT(1) NOT NULL DEFAULT 0,
      requirements_met TINYINT(1) NOT NULL DEFAULT 0,
      non_retained_commission DECIMAL(10,2) NOT NULL DEFAULT 0,
      approved TINYINT(1) NOT NULL DEFAULT 0,
      approved_by_user_id INT NULL,
      approved_at DATETIME NULL,
      excluded TINYINT(1) NOT NULL DEFAULT 0,
      exclusion_reason VARCHAR(512) NULL,
      notes TEXT,
      ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ts_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_run (commission_run_id),
      INDEX idx_program (program_id),
      INDEX idx_contractor (contractor_id)
    )
  `);

  // §4.6 commission_run_audit
  await createTable('commission_run_audit', `
    CREATE TABLE commission_run_audit (
      id INT PRIMARY KEY AUTO_INCREMENT,
      commission_run_id INT NOT NULL,
      commission_run_line_id INT NULL,
      action ENUM(
        'created','recalculated','submitted','approved','finalized','reopened',
        'line_override_booking_type','line_approved','line_unapproved',
        'line_excluded','line_included','line_edited','note_added',
        'adjustment_accepted','adjustment_waived'
      ) NOT NULL,
      actor_user_id INT NOT NULL,
      before_value JSON NULL,
      after_value JSON NULL,
      reason VARCHAR(512) NULL,
      ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_run (commission_run_id)
    )
  `);

  // §5 program_booking_type_log
  await createTable('program_booking_type_log', `
    CREATE TABLE program_booking_type_log (
      id INT PRIMARY KEY AUTO_INCREMENT,
      program_id INT NOT NULL,
      from_value ENUM('initial','rebook') NULL,
      to_value ENUM('initial','rebook') NOT NULL,
      reason ENUM('auto_create','auto_cluster_member_ran','auto_sibling_added','manual_override','manual_clear_override','migration') NOT NULL,
      cluster_program_ids JSON NULL,
      actor_user_id INT NULL,
      ts_inserted TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_program (program_id)
    )
  `);

  console.log('\n=== Migration complete ===');
  process.exit();
})().catch(err => { console.error('MIGRATION FAILED:', err); process.exit(1); });
