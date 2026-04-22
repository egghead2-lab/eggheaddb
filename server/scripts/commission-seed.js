/**
 * Commission seed: (a) non-initial client flags, (b) contractor salesperson assignments, (c) default plans.
 * Idempotent — safe to re-run.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const pool = require('../db/pool');

// §10 — Non-initial contractors
const NON_INITIAL_NAMES = [
  'BTB CHEREMOYA', 'Temple City Unified', 'Studysmart', 'Saddleback Unified',
  'Synergy', 'Fullerton School District', 'JUSD', 'Jurupa Unified',
  'Aspire', 'Pomona Unified', 'PUSD', 'Darnall Charter', 'Isana', 'ISANA',
  'Boys and Girls SD', 'Menifee',
];

// Sales rep CSV mapping (contractor_name → sales rep first name)
const REPS = {
  'Studysmart': 'Nick', 'Synergy': 'Ali', 'Jurupa Unified': 'Nick',
  'Pomona Unified': 'Ali', 'San Marino Workshops': 'Ali', 'Boys and Girls SD': 'Ali',
  'ISANA': 'Ali', 'La Habra City': 'Ali', 'Higher Learning': 'Ali',
  'Vista': 'Ali', 'Vallejo Unified': 'Ali', 'Lucia Mar Unified': 'Ali',
  'El Monte': 'Ali', 'Temple City Unified': 'Jenny',
  'Ontario Montclair Unified': 'Jenny', 'Equitas Academies': 'Nick',
  'Garden Grove Unified': 'Jenny', 'Norwalk La Mirada Unified': 'Ali',
  'Solana Beach Unified': 'Ali', 'Natomas Unified': 'Jenny',
  'Long Beach Unified': 'Ali', 'Gustine Unified': 'Rafael',
  'Willows Unified': 'Rafael', 'McFarland Unified': 'Ali',
  'Yonkers School District': 'Jenny', 'Norris School District': 'Ali',
  'BACR': 'Ali',
  // Fontana USD → no rep
};

(async () => {
  // Resolve rep user IDs
  const [users] = await pool.query(
    `SELECT id, first_name, last_name, email FROM user
     WHERE email IN ('ali@professoregghead.com','rafael@professoregghead.com','jenny@professoregghead.com','nick@professoregghead.com')
     AND active = 1`
  );
  const byFirstName = {};
  users.forEach(u => { byFirstName[u.first_name] = u; });
  console.log('Reps:', Object.entries(byFirstName).map(([n, u]) => `${n}=${u.id}`).join(', '));
  const adminId = byFirstName['Nick']?.id || 2;

  // (a) non_initial_client flags on contractors
  console.log('\n=== Setting non_initial_client flags ===');
  let flagged = 0;
  for (const name of NON_INITIAL_NAMES) {
    const [r] = await pool.query(
      `UPDATE contractor SET non_initial_client = 1 WHERE LOWER(TRIM(contractor_name)) = LOWER(TRIM(?)) AND active = 1`,
      [name]
    );
    if (r.affectedRows) { flagged += r.affectedRows; console.log(`  ✔ ${name} → non_initial_client=1`); }
  }
  console.log(`  ${flagged} contractors flagged non-initial`);

  // (b) contractor_salesperson rows from CSV
  console.log('\n=== Seeding contractor_salesperson ===');
  let created = 0, skipped = 0, unmatched = [];
  for (const [contractorName, repFirstName] of Object.entries(REPS)) {
    const rep = byFirstName[repFirstName];
    if (!rep) { unmatched.push(`${contractorName} → rep ${repFirstName} not found`); continue; }

    const [[contractor]] = await pool.query(
      `SELECT id FROM contractor WHERE LOWER(TRIM(contractor_name)) = LOWER(TRIM(?)) AND active = 1`,
      [contractorName]
    );
    if (!contractor) { unmatched.push(`${contractorName} → contractor not found`); continue; }

    // Skip if already has an active salesperson assignment
    const [[existing]] = await pool.query(
      `SELECT id FROM contractor_salesperson WHERE contractor_id = ? AND active = 1 LIMIT 1`,
      [contractor.id]
    );
    if (existing) { skipped++; continue; }

    await pool.query(
      `INSERT INTO contractor_salesperson (contractor_id, user_id, split_pct, effective_from, created_by_user_id, active)
       VALUES (?, ?, 1.0000, '2020-01-01', ?, 1)`,
      [contractor.id, rep.id, adminId]
    );
    // Also update legacy field
    await pool.query(`UPDATE contractor SET salesperson_user_id = ? WHERE id = ?`, [rep.id, contractor.id]);
    created++;
  }
  console.log(`  ${created} new assignments, ${skipped} already existed`);
  if (unmatched.length) { console.log('  UNMATCHED:'); unmatched.forEach(u => console.log(`    - ${u}`)); }

  // (c) Default commission plan for each Sales-role user + any user in the CSV rep list
  console.log('\n=== Seeding default commission plans ===');
  const planUsers = new Set();
  // Everyone with 'Sales' role
  const [salesUsers] = await pool.query(
    `SELECT u.id FROM user u JOIN role r ON r.id = u.role_id WHERE r.role_name = 'Sales' AND u.active = 1`
  );
  salesUsers.forEach(u => planUsers.add(u.id));
  // Plus anyone appearing in the CSV (covers Jenny/Nick even if they're not in Sales role)
  Object.values(byFirstName).forEach(u => planUsers.add(u.id));

  let plans = 0;
  for (const uid of planUsers) {
    const [[has]] = await pool.query(
      `SELECT id FROM salesperson_commission_plan WHERE user_id = ? AND active = 1 AND effective_to IS NULL`,
      [uid]
    );
    if (has) continue;
    await pool.query(
      `INSERT INTO salesperson_commission_plan
         (user_id, effective_from, monthly_quota, initial_rate, rebook_rate, non_retained_flat_fee, notes, created_by_user_id, active)
       VALUES (?, '2023-01-01', 50000.00, 0.0500, 0.0250, 250.00, 'Default plan — seed', ?, 1)`,
      [uid, adminId]
    );
    plans++;
  }
  console.log(`  ${plans} plans created`);

  console.log('\n=== Seed complete ===');
  process.exit();
})().catch(err => { console.error('SEED FAILED:', err); process.exit(1); });
