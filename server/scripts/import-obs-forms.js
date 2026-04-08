require('dotenv').config();
const pool = require('../db/pool');

// Extracted from the CSV: professor_name | date | evaluator | rating | remediation | school_notes | class | type | recommend_party
// Ratings per category when available: PC, Org, Auth, Edu, Rapport, Flex
const DATA = [
  // 2023
  ['Madaket G','12/6/2022','Nicole','4','No','','formal'],
  ['Nicole','1/24/2023','Nicole','4','No','','formal'],
  ['Dave Mo','3/3/2023','Nicole','4','No','','formal'],
  ['Alex Bu','3/7/2023','Nicole','3','Yes - Within 4 weeks','','formal'],
  ['Audrey Biz','3/2/2023','Nicole','4','No','','formal'],
  ['Nicolette M','3/9/2023','Nicole','4','No','Parking was terrible!','formal'],
  ['Amber Coop','3/13/2023','Nicole','4','No','','formal'],
  ['Madaket G','3/15/2023','Nicole','4','No','','formal'],
  ['Danielle P','3/17/2023','Nicole','5','No','Parking is tough.','formal'],
  ['Kate S','3/20/2023','Nicole','4','No','','formal'],
  ['Micah Jack','3/14/2023','Nicole','3','Yes - Within 4 weeks','Class is held outdoors.','formal'],
  ['Sonia Es','3/30/2023','Enjolii','5','No','','formal'],
  ['Patricia M','4/3/2023','Enjolii','4','No','','formal'],
  ['Nikki N','4/4/2023','Enjolii','3','Yes - Within 4 weeks','','formal'],
  ['Voris','4/11/2023','Enjolii','5','No','','formal'],
  ['Andy Q','4/10/2023','Jaime G','4','No','','formal'],
  ['Irase Z','4/12/2023','Enjolii','4','Yes - Within 4 weeks','','formal'],
  ['Zach Cr','4/17/2023','Daniela G','3','Yes - within 2 weeks','','formal'],
  ['Isabella','4/17/2023','Atiana','5','No','','formal'],
  ['Nicholas D','4/17/2023','Jaime G','4','Yes - within 2 weeks','','formal'],
  ['Harut','4/18/2023','Daniela G','3','Yes - Within 4 weeks','','formal'],
  ['Isaak M','4/18/2023','Jaime G','1','Yes - within 2 weeks','','formal'],
  ['Atiana','4/18/2023','Atiana','4','No','','formal'],
  ['Kreshmeh K','4/18/2023','Atiana','4','No','','formal'],
  ['Isaak M','4/19/2023','Jaime G','1','Yes - within 2 weeks','','formal'],
  ['Bib','4/19/2023','Jaime G','5','No','','formal'],
  ['Makin B','4/21/2023','Jaime G','4','No','','formal'],
  ['Alex Bu','4/6/2023','Nicole','4','No','','formal'],
  ['Isaak M','4/24/2023','Jaime G','2','Yes - within 2 weeks','','formal'],
  ['Alex Bu','4/19/2023','Nicole','4','No','','formal'],
  ['Audrey Biz','4/20/2023','Nicole','4','No','','formal'],
  ['Danielle P','4/10/2023','Nicole','5','No','','formal'],
  ['Keith McE','4/13/2023','Nicole','5','No','','formal'],
  ['Kimberly','4/24/2023','Nicole','4','No','','formal'],
  ['Micah Jack','4/17/2023','Nicole','4','No','','formal'],
  ['Sonia Es','4/3/2023','Nicole','4','No','','formal'],
  ['Stephanie Du','3/23/2023','Nicole','4','No','','formal'],
  ['Stephanie Du','4/12/2023','Nicole','4','No','','formal'],
  ['Mari A','4/26/2023','Atiana','4','No','','formal'],
  ['Lindsey W','4/25/2023','Daniela G','5','No','','formal'],
  ['Lee Sch','4/27/2023','Nicole','3','Yes - Within 4 weeks','','formal'],
  ['Jacob G','4/27/2023','Jaime G','3','No','','formal'],
  ['Dave Mo','4/25/2023','Nicole','3','Yes - within 2 weeks','','formal'],
  ['Mena M','5/1/2023','Atiana','3','No','','formal'],
  ['Kylie R','5/10/2023','Daniela G','5','No','','formal'],
  ['Mario V','5/5/2023','Jaime G','1','Yes - within 2 weeks','','formal'],
  ['Nadiya','5/8/2023','Atiana','5','No','','formal'],
  ['Isamar P','5/11/2023','Jaime G','5','No','','formal'],
  ['Mario V','5/12/2023','Jaime G','1','Yes - within 2 weeks','','formal'],
  ['Stella P','5/11/2023','Enjolii','4','No','','formal'],
  ['Jackie M','5/12/2023','Enjolii','4','No','','formal'],
  ['Sam W','5/17/2023','Enjolii','2','Yes - within 2 weeks','','formal'],
  ['Arricka S','5/19/2023','Enjolii','3','Yes','','formal'],
  ['Mario V','5/22/2023','Jaime G','2','Yes - within 2 weeks','','formal'],
  ['Israel M','5/25/2023','Jaime G','2','Yes - within 2 weeks','','formal'],
  ['Chris Ts','5/23/2023','Enjolii','4','No','','formal'],
  ['Erin C','5/24/2023','Enjolii','4','No','','formal'],
  ['Brenda N','6/5/2023','Daniela G','5','No','','formal'],
  ['Sabrina N','6/13/2023','Jaime G','2','No','','formal'],
  ['Israel M','6/19/2023','Jaime G','2','Yes - within 2 weeks','','formal'],
  ['Bib','6/20/2023','Jaime G','5','No','','formal'],
  ['Riley','6/22/2023','Jaime G','4','No','','formal'],
  ['Berenice L','6/20/2023','Atiana','3','Yes - within 2 weeks','','formal'],
  ['Kim N','6/20/2023','Atiana','5','No','','formal'],
  ['Maria S','6/21/2023','Atiana','4','Yes - Within 4 weeks','','formal'],
  ['Natalie','6/26/2023','Jaime G','4','No','','formal'],
  ['Kreshmeh K','6/21/2023','Atiana','3','Yes - within 2 weeks','','formal'],
  ['Aryhanna','6/20/2023','Atiana','5','No','','formal'],
  ['Brian Anin','6/21/2023','Atiana','3','Yes - within 2 weeks','','formal'],
  ['Chris C','6/26/2023','Daniela G','4','No','','formal'],
  ['Catie S','6/28/2023','Daniela G','5','No','','formal'],
  ['Zach Cr','6/27/2023','Daniela G','3','Yes - Within 4 weeks','','formal'],
  ['Neha','6/29/2023','Daniela G','5','No','','formal'],
  ['Melody F','6/27/2023','Atiana','3','Yes - within 2 weeks','','formal'],
  ['Marissa J','6/27/2023','Atiana','5','No','','formal'],
  ['Nadiya','6/28/2023','Atiana','4','Yes - Within 4 weeks','','formal'],
  ['Bryce E','6/23/2023','Jaime G','3','No','','formal'],
  ['Kelsey E','6/21/2023','Jaime G','5','No','','formal'],
  ['Patricia M','6/23/2023','Enjolii','5','No','','formal'],
  ['Chris Ts','6/22/2023','Enjolii','4','No','','formal'],
  ['Irase Z','6/22/2023','Enjolii','4','No','','formal'],
  ['Kreshmeh K','6/12/2023','Enjolii','3','Yes - Within 4 weeks','','formal'],
  ['Marissa J','6/12/2023','Enjolii','5','No','','formal'],
  ['Hannah L','7/11/2023','Daniela G','3','No','','formal'],
  ['Jacob G','7/10/2023','Jaime G','4','No','','formal'],
  ['Kylie R','7/14/2023','Daniela G','5','No','','formal'],
  ['Isabel M','7/21/2023','Jaime G','4','No','','formal'],
  ['Alverne','7/21/2023','Jaime G','3','No','','formal'],
  ['Danielle P','7/24/2023','Enjolii','5','No','','formal'],
  ['Precious','7/7/2023','Enjolii','3','Yes - Within 4 weeks','','formal'],
  ['Eddie','6/14/2023','Daniela G','4','No','','formal'],
  ['Eddie','8/2/2023','Daniela G','5','No','','formal'],
  ['Ashley','8/9/2023','Jaime G','5','No','','formal'],
  ['Crystal C','8/28/2023','Daniela G','2','Yes','','formal'],
  ['Richard Wil','8/29/2023','Enjolii','4','No','','formal'],
  ['Victoria R','8/23/2023','Daniela G','4','No','','formal'],
  ['Giselle P','8/24/2023','Daniela G','3','Yes','','formal'],
  ['Clarissa F','8/25/2023','Daniela G','3','No','','formal'],
  ['Natalie','9/1/2023','Jaime G','4','No','','formal'],
  ['Bryce E','9/6/2023','Jaime G','2','Yes - within 2 weeks','','formal'],
  ['Tahlia R','9/11/2023','Daniela G','1','Yes','','formal'],
  ['Andy Q','9/12/2023','Jaime G','4','No','','formal'],
  ['Sarah C','9/18/2023','Daniela G','3','Yes - within 2 weeks','','formal'],
  ['Allegra S','9/19/2023','Daniela G','4','No','','formal'],
  ['Christopher R','9/19/2023','Jaime G','5','No','','formal'],
  ['Lindsey W','9/20/2023','Daniela G','5','No','','formal'],
  ['Michael M','9/20/2023','Daniela G','4','No','','formal'],
  ['Kat','9/21/2023','Jaime G','4','No','','formal'],
  ['Kyle C','9/22/2023','Daniela G','2','Yes - within 2 weeks','','formal'],
  ['Upasana','9/26/2023','Jaime G','4','No','','formal'],
  ['Aaron S','10/2/2023','Atiana','4','No','','formal'],
  ['Pahan P','10/4/2023','Christian','2','Yes - Within 4 weeks','','formal'],
  ['Rayven','10/4/2023','Daniela G','5','No','','formal'],
  ['Bruce A','9/28/2023','Atiana','5','No','','formal'],
  ['Wano','10/4/2023','Jaime G','2','Yes - within 2 weeks','','formal'],
  ['Jeed S','9/28/2023','Atiana','5','No','','formal'],
  ['Raha','9/28/2023','Atiana','4','Yes - Within 4 weeks','','formal'],
  ['Kevin Se','10/5/2023','Atiana','3','Yes - Within 4 weeks','','formal'],
  ['Isela M','10/9/2023','Christian','3','No','','formal'],
  ['Helen Le','10/4/2023','Atiana','4','No','','formal'],
  ['Megan Y','10/5/2023','Atiana','5','No','','formal'],
  ['Amber Coop','10/10/2023','Christian','5','No','','formal'],
  ['Marina Mar','10/11/2023','Christian','3','No','','formal'],
  ['Brenda N','10/12/2023','Daniela G','5','No','','formal'],
  ['Nia J','10/10/2023','Jaime G','4','No','','formal'],
  ['Emily Wal','10/12/2023','Christian','5','No','','formal'],
  ['Kate S','10/13/2023','Christian','4','No','','formal'],
  ['Krishna V','10/16/2023','Atiana','4','No','','formal'],
  ['Elle Bon','10/2/2023','Atiana','4','No','','formal'],
  ['Chelsey W','10/4/2023','Atiana','4','Yes - Within 4 weeks','','formal'],
  ['Jackie V','10/17/2023','Jaime G','5','No','','formal'],
  ['Wano','10/18/2023','Jaime G','3','Yes - within 2 weeks','','formal'],
  ['Nicolette M','10/19/2023','Christian','4','No','','formal'],
  ['Sonia Es','10/20/2023','Christian','5','No','','formal'],
  ['Terry','10/23/2023','Daniela G','3','Yes','','formal'],
  ['Chris M','10/16/2023','Atiana','4','No','','formal'],
  ['Gregory K','10/23/2023','Atiana','4','No','','formal'],
  ['Emily','10/23/2023','Atiana','4','Yes - Within 4 weeks','','formal'],
  ['Eli Bro','10/24/2023','Christian','4','No','','formal'],
  ['Stella A','10/24/2023','Daniela G','3','Yes - Within 4 weeks','','formal'],
  ['Aaron Shut','10/25/2023','Christian','5','No','','formal'],
  ['Tiffany C','10/24/2023','Atiana','3','Yes - Within 4 weeks','','formal'],
  ['Ferno','10/23/2023','Enjolii','3','No','','formal'],
  ['Kimberly','10/24/2023','Enjolii','4','No','','formal'],
  ['Richard Wil','10/24/2023','Enjolii','3','Yes - Within 4 weeks','','formal'],
  ['Robin L','10/25/2023','Enjolii','4','No','','formal'],
  ['Dorothy V','10/25/2023','Enjolii','3','No','','formal'],
  ['Dave Mo','10/26/2023','Christian','5','No','','formal'],
  ['Gargi B','10/25/2023','Atiana','5','No','','formal'],
  ['Angel G','10/26/2023','Atiana','5','No','','formal'],
  ['JJ','10/30/2023','Atiana','5','No','','formal'],
  ['Elisabeth G','10/19/2023','Jaime G','5','No','','formal'],
  ['Tati','10/30/2023','Jaime G','3','Yes - Within 4 weeks','','formal'],
  ['Bib','11/2/2023','Jaime G','5','No','','formal'],
  ['Kreshmeh K','11/6/2023','Atiana','4','No','','formal'],
  ['Dorothy V','11/6/2023','Enjolii','3','Yes - within 2 weeks','','formal'],
  ['Adriel S','11/7/2023','Atiana','4','No','','formal'],
  ['Marina Mar','11/1/2023','Christian','4','No','','formal'],
  ['Amber Coop','11/2/2023','Christian','5','No','','formal'],
  ['Keith McE','11/6/2023','Christian','5','No','','formal'],
  ['April Ga','11/7/2023','Christian','4','No','','formal'],
  ['Renzo','11/7/2023','Lindsey W','3','Yes - within 2 weeks','','formal'],
  ['Jackie R-A','11/8/2023','Enjolii','3','Yes - Within 4 weeks','','formal'],
  ['Isela M','11/9/2023','Christian','4','No','','formal'],
  ['Sarah C','11/13/2023','Lindsey W','3','No','','formal'],
  ['Kimbri V','11/11/2023','Jaime G','1','Yes - within 2 weeks','','formal'],
  ['Stella P','11/8/2023','Atiana','5','No','','formal'],
  ['Chris Ts','11/15/2023','Enjolii','5','No','','formal'],
  ['Bryce E','11/16/2023','Jaime G','3','No','','formal'],
  ['Richard Wil','11/14/2023','Christian','4','No','','formal'],
  ['Kimbri V','11/27/2023','Jaime G','3','Yes - Within 4 weeks','','formal'],
  ['Kimbri V','12/4/2023','Jaime G','3','Yes - within 2 weeks','','formal'],
  ['Neha','12/4/2023','Lindsey W','4','No','','formal'],
  ['Rayven','11/27/2023','Lindsey W','4','No','','formal'],
  ['Kylie R','11/20/2023','Lindsey W','5','No','','formal'],
  ['Kyle C','11/30/2023','Lindsey W','3','No','','formal'],
  ['Allegra S','12/6/2023','Lindsey W','3','No','','formal'],
  ['Isabel M','12/7/2023','Lindsey W','5','No','','formal'],
  ['Danielle P','12/4/2023','Christian','5','No','','formal'],
  ['Kimbri V','12/11/2023','Jaime G','3','No','','formal'],
  ['Kimbri V','12/13/2023','Jaime G','3','No','','formal'],
  ['Marina Mar','12/12/2023','Christian','4','No','','formal'],
  // 2024+ continues - these are the key ones
  ['Irene C','1/9/2024','Lindsey W','3','Yes - Within 4 weeks','','formal'],
  ['Stella A','1/10/2024','Lindsey W','3','Yes - Within 4 weeks','','formal'],
  ['Tahlia R','1/8/2024','Lindsey W','2','Yes','','formal'],
  ['Robert C','1/12/2024','Christopher R','3','Yes - within 2 weeks','','formal'],
  ['Isela M','1/11/2024','Christian','4','No','','formal'],
  ['Nicolette M','1/12/2024','Christian','4','No','','formal'],
  ['Kaden G','12/15/2023','Christopher R','4','No','','formal'],
  ['Renzo','1/16/2024','Lindsey W','4','No','','formal'],
  ['Tahlia R','1/11/2024','Lindsey W','3','No','','formal'],
  ['Ferno','1/17/2024','Christian','3','No','','formal'],
  ['Rachel H','1/16/2024','Christopher R','4','No','','formal'],
];

async function run() {
  // Get all professors for name matching
  const [profs] = await pool.query('SELECT id, professor_nickname, last_name FROM professor');
  const profMap = {};
  profs.forEach(p => {
    const nick = (p.professor_nickname || '').toLowerCase().trim();
    const full = (nick + ' ' + (p.last_name || '').toLowerCase().charAt(0)).trim();
    profMap[nick] = p.id;
    profMap[full] = p.id;
    // Also try first name only
    const firstName = nick.split(' ')[0];
    if (!profMap[firstName]) profMap[firstName] = p.id;
  });

  let matched = 0, created = 0, skipped = 0, notFound = 0;

  for (const row of DATA) {
    const [profName, dateStr, evaluatorName, ratingStr, remediation, notes, obsType] = row;

    // Parse date
    const parts = dateStr.split('/');
    const isoDate = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;

    // Find professor
    const searchName = profName.toLowerCase().trim();
    let profId = profMap[searchName];
    if (!profId) {
      // Try partial match
      const key = Object.keys(profMap).find(k => k.startsWith(searchName.split(' ')[0]) && (searchName.length < 3 || k.includes(searchName.charAt(searchName.length-1))));
      if (key) profId = profMap[key];
    }

    if (!profId) {
      notFound++;
      if (notFound <= 10) console.log('  Not found:', profName);
      continue;
    }

    // Check if we have an existing evaluation for this prof+date
    const [existing] = await pool.query(
      'SELECT id, form_status FROM professor_evaluation WHERE professor_id = ? AND evaluation_date = ? AND active = 1',
      [profId, isoDate]
    );

    const rating = parseInt(ratingStr) || null;
    const result = rating >= 4 ? 'pass' : rating >= 2.5 ? 'needs_improvement' : 'fail';
    const formData = JSON.stringify({ imported: true, overall_rating: rating, remediation, notes, evaluator: evaluatorName, observation_type: obsType });

    if (existing.length > 0) {
      // Update existing
      if (existing[0].form_status !== 'completed') {
        await pool.query(
          "UPDATE professor_evaluation SET form_status = 'completed', form_data = ?, result = ?, notes = CONCAT(COALESCE(notes,''), ' [Imported from CSV]') WHERE id = ?",
          [formData, result, existing[0].id]
        );
        matched++;
      } else {
        skipped++;
      }
    } else {
      // Create new evaluation record (no matching session-based eval existed)
      await pool.query(
        "INSERT INTO professor_evaluation (professor_id, evaluation_date, evaluation_type, result, form_status, form_data, notes, active) VALUES (?, ?, 'formal', ?, 'completed', ?, '[Imported from CSV]', 1)",
        [profId, isoDate, result, formData]
      );
      created++;
    }
  }

  // Update last_evaluation_date for all affected professors
  await pool.query(
    "UPDATE professor p SET last_evaluation_date = (SELECT MAX(pe.evaluation_date) FROM professor_evaluation pe WHERE pe.professor_id = p.id AND pe.active = 1 AND pe.form_status = 'completed'), last_evaluation_result = (SELECT pe.result FROM professor_evaluation pe WHERE pe.professor_id = p.id AND pe.active = 1 AND pe.form_status = 'completed' ORDER BY pe.evaluation_date DESC LIMIT 1) WHERE p.active = 1"
  );

  // Stats
  const [[outstanding]] = await pool.query("SELECT COUNT(*) as c FROM professor_evaluation WHERE active = 1 AND (form_status = 'pending' OR form_status IS NULL)");
  const [[completed]] = await pool.query("SELECT COUNT(*) as c FROM professor_evaluation WHERE active = 1 AND form_status = 'completed'");

  console.log('\\n=== Import Results ===');
  console.log('Matched existing:', matched);
  console.log('Created new:', created);
  console.log('Skipped (already complete):', skipped);
  console.log('Professor not found:', notFound);
  console.log('\\nTotal completed evals:', completed.c);
  console.log('Remaining outstanding:', outstanding.c);

  process.exit(0);
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
