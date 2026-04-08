const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: 'egghead.mysql.database.azure.com', port: 3306,
    user: 'eggheaddb', password: 'Meesterodb1*', database: 'program_data',
    ssl: { rejectUnauthorized: false }
  });

  // 1. shipment_cycle
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipment_cycle (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cycle_type ENUM('standard','mid_cycle','camp') NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      ship_date DATE NOT NULL,
      approval_date DATE,
      status ENUM('draft','approved','shipped','complete') NOT NULL DEFAULT 'draft',
      notes TEXT,
      created_by_user_id INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log('Created shipment_cycle');

  // 2. shipment_order
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipment_order (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cycle_id INT NOT NULL,
      professor_id INT NOT NULL,
      order_name VARCHAR(200) NOT NULL,
      status ENUM('pending','shipped','cancelled') NOT NULL DEFAULT 'pending',
      shipped_at DATETIME,
      shipped_by_user_id INT,
      inflow_order_number VARCHAR(100),
      tracking_number VARCHAR(200),
      tracking_imported_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (cycle_id) REFERENCES shipment_cycle(id),
      UNIQUE KEY cycle_professor (cycle_id, professor_id)
    )
  `);
  console.log('Created shipment_order');

  // 3. shipment_order_line
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipment_order_line (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      program_id INT,
      lesson_id INT,
      item_name VARCHAR(200) NOT NULL,
      item_type ENUM('lesson','bin','degree','id_card','start_kit','party_kit','camp_kit','camp_consumable','camp_coordinator_kit') NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      quantity_override INT,
      sku VARCHAR(100),
      skip_flag TINYINT(1) NOT NULL DEFAULT 0,
      source ENUM('standard_cycle','mid_cycle','party','camp','manual') NOT NULL,
      notes VARCHAR(512),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES shipment_order(id) ON DELETE CASCADE
    )
  `);
  console.log('Created shipment_order_line');

  // 4. shipment_resolution
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipment_resolution (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_line_id INT NOT NULL,
      resolution ENUM('dropped_by_field_manager','request_to_ship','catapult_kit_used','car_kit_substitute','not_needed_has_enough','other','ship_next_scheduled') NOT NULL,
      quantity_resolved INT,
      notes TEXT,
      resolved_by_user_id INT,
      resolved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_line_id) REFERENCES shipment_order_line(id) ON DELETE CASCADE
    )
  `);
  console.log('Created shipment_resolution');

  // 5. stock_level
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_level (
      id INT AUTO_INCREMENT PRIMARY KEY,
      item_name VARCHAR(200) NOT NULL,
      sku VARCHAR(100) UNIQUE NOT NULL,
      qty_on_hand INT NOT NULL DEFAULT 0,
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by_user_id INT
    )
  `);
  console.log('Created stock_level');

  // 6. shipment_exclusion_rule
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipment_exclusion_rule (
      id INT AUTO_INCREMENT PRIMARY KEY,
      rule_name VARCHAR(128) NOT NULL,
      rule_type ENUM('class_type_skip','min_weeks_id_card','min_weeks_degree','custom') NOT NULL,
      class_type_id INT,
      min_weeks INT,
      description TEXT,
      active TINYINT(1) NOT NULL DEFAULT 1
    )
  `);
  console.log('Created shipment_exclusion_rule');

  // 7. party_shipment
  await pool.query(`
    CREATE TABLE IF NOT EXISTS party_shipment (
      id INT AUTO_INCREMENT PRIMARY KEY,
      program_id INT NOT NULL,
      order_id INT,
      merged_with_professor_order TINYINT(1) NOT NULL DEFAULT 0,
      ship_by_date DATE NOT NULL,
      shipped_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES shipment_order(id)
    )
  `);
  console.log('Created party_shipment');

  // 8. party_kit_type
  await pool.query(`
    CREATE TABLE IF NOT EXISTS party_kit_type (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kit_name VARCHAR(128) NOT NULL,
      event_type ENUM('party','booth','workshop') NOT NULL,
      sku VARCHAR(100),
      description TEXT,
      active TINYINT(1) NOT NULL DEFAULT 1
    )
  `);
  console.log('Created party_kit_type');

  // 9. camp_curriculum
  await pool.query(`
    CREATE TABLE IF NOT EXISTS camp_curriculum (
      id INT AUTO_INCREMENT PRIMARY KEY,
      camp_day_name VARCHAR(200) UNIQUE NOT NULL,
      camp_type_name VARCHAR(128) NOT NULL,
      day_format ENUM('full_day','half_day') NOT NULL,
      lesson_1 VARCHAR(200),
      lesson_2 VARCHAR(200),
      lesson_3 VARCHAR(200),
      lesson_4 VARCHAR(200),
      lesson_5 VARCHAR(200),
      sku_standard VARCHAR(100),
      sku_full VARCHAR(100),
      sku_half VARCHAR(100),
      active TINYINT(1) NOT NULL DEFAULT 1
    )
  `);
  console.log('Created camp_curriculum');

  // 10. camp_coordinator_kit
  await pool.query(`
    CREATE TABLE IF NOT EXISTS camp_coordinator_kit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      item_name VARCHAR(200) NOT NULL,
      sku VARCHAR(100),
      qty_per_kit INT NOT NULL DEFAULT 1,
      kit_type ENUM('full_day','half_day','both') NOT NULL DEFAULT 'both',
      notes TEXT,
      active TINYINT(1) NOT NULL DEFAULT 1
    )
  `);
  console.log('Created camp_coordinator_kit');

  // 11. Alter lesson table
  for (const col of ['sku', 'sku_for_20']) {
    try { await pool.query(`ALTER TABLE lesson ADD COLUMN ${col} VARCHAR(100)`); console.log('Added lesson.' + col); }
    catch(e) { if (e.code === 'ER_DUP_FIELDNAME') console.log('lesson.' + col + ' exists'); else throw e; }
  }

  // 12. Alter class table
  try { await pool.query('ALTER TABLE class ADD COLUMN has_id_card TINYINT(1) NOT NULL DEFAULT 0'); console.log('Added class.has_id_card'); }
  catch(e) { if (e.code === 'ER_DUP_FIELDNAME') console.log('class.has_id_card exists'); else throw e; }

  // 13. Rename Fill 1 bin to Lego Mini Bag
  await pool.query('UPDATE bin SET bin_name = ? WHERE id = 7', ['Lego Mini Bag']);
  console.log('Renamed Fill 1 -> Lego Mini Bag');

  // 14. Seed exclusion rules
  const rules = [
    ['Robotics Skip', 'class_type_skip', 3, null, 'Skip all lesson items for Robotics programs (bins still included)'],
    ['ID Card Min Weeks', 'min_weeks_id_card', null, 4, 'Only include start kit if session_count >= 4'],
    ['Degree Min Weeks', 'min_weeks_degree', null, 4, 'Only include degrees if session_count >= 4'],
  ];
  for (const [name, type, ctId, minW, desc] of rules) {
    const [existing] = await pool.query('SELECT id FROM shipment_exclusion_rule WHERE rule_name = ?', [name]);
    if (existing.length === 0) {
      await pool.query('INSERT INTO shipment_exclusion_rule (rule_name, rule_type, class_type_id, min_weeks, description) VALUES (?, ?, ?, ?, ?)',
        [name, type, ctId, minW, desc]);
      console.log('Seeded rule:', name);
    }
  }

  // 15. Register tools in nav
  const tools = [
    ['/materials/cycles', 'Shipment Cycles', 'Warehouse Tools', 1, 0],
    ['/materials/standard-order', 'Standard Order Builder', 'Warehouse Tools', 2, 0],
    ['/materials/mid-cycle', 'Mid-Cycle Orders', 'Warehouse Tools', 3, 0],
    ['/materials/mark-shipped', 'Mark Shipments Sent', 'Warehouse Tools', 4, 0],
    ['/materials/resolutions', 'Resolution Center', 'Warehouse Tools', 5, 0],
    ['/materials/tracking', 'Tracking Import', 'Warehouse Tools', 6, 0],
    ['/materials/weekly-requirements', 'Weekly Requirements', 'Warehouse Tools', 7, 0],
    ['/materials/stock', 'Stock Levels', 'Warehouse Tools', 8, 0],
    ['/materials/parties', 'Party Shipments', 'Warehouse Tools', 9, 0],
    ['/materials/bins', 'Bin Manager', 'Warehouse Tools', 10, 0],
    ['/materials/camp-orders', 'Camp Order Builder', 'Warehouse Tools', 11, 0],
  ];
  for (const [path, label, group, sort, universal] of tools) {
    const [existing] = await pool.query('SELECT id FROM tool WHERE path = ?', [path]);
    if (existing.length === 0) {
      await pool.query('INSERT INTO tool (path, label, nav_group, sort_order, universal, active) VALUES (?, ?, ?, ?, ?, 1)',
        [path, label, group, sort, universal]);
      console.log('Added tool:', label);
    }
  }

  console.log('\nAll materials tables and tools created successfully');
  await pool.end();
}

main().catch(e => console.error(e));
