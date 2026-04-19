/**
 * Payroll Nightly Job
 *
 * Runs at midnight. Finds all sessions with session_date = TODAY,
 * calculates pay for Lead and Assistant professors, and writes
 * immutable records to program_session_pay.
 *
 * Pay resolution hierarchy:
 *   1. Session-level pay (session.professor_pay / assistant_pay)
 *   2. Program-level pay (program.lead_professor_pay / assistant_professor_pay)
 *   3. Professor base pay (professor.base_pay / assist_pay)
 *
 * Gusto split:
 *   regular_pay_component = class_hours × $25.00
 *   bonus_component = pay_amount - regular_pay_component
 *
 * Idempotent: skips if record already exists for that session/role/professor.
 */

const pool = require('../db/pool');

const STANDARD_HOURLY = 25.00;

async function runNightlyPayJob() {
  const startTime = Date.now();
  let programsProcessed = 0;
  let sessionsWritten = 0;
  let errors = 0;
  const errorDetails = [];

  try {
    // Find all sessions happening today with program + professor info
    const [sessions] = await pool.query(
      `SELECT s.id AS session_id, s.program_id, s.session_date, s.session_time,
              s.professor_id AS session_professor_id, s.professor_pay AS session_professor_pay,
              s.assistant_id AS session_assistant_id, s.assistant_pay AS session_assistant_pay,
              s.not_billed,
              prog.program_nickname, prog.class_length_minutes,
              prog.lead_professor_id, prog.lead_professor_pay,
              prog.assistant_professor_id, prog.assistant_professor_pay,
              l.lesson_name
       FROM session s
       JOIN program prog ON prog.id = s.program_id AND prog.active = 1
       JOIN class_status cs ON cs.id = prog.class_status_id AND cs.class_status_name = 'Confirmed'
       LEFT JOIN lesson l ON l.id = s.lesson_id
       WHERE s.active = 1 AND s.session_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`
    );

    const processedPrograms = new Set();

    for (const s of sessions) {
      try {
        processedPrograms.add(s.program_id);
        const classHours = (s.class_length_minutes || 60) / 60;

        // === LEAD PROFESSOR ===
        const leadProfId = s.session_professor_id || s.lead_professor_id;
        if (leadProfId) {
          const isSubstitute = s.session_professor_id && s.session_professor_id !== s.lead_professor_id;

          // Resolve pay
          let payAmount = 0;
          let paySource = 'professor_base';

          if (s.session_professor_pay && s.session_professor_pay > 0) {
            payAmount = parseFloat(s.session_professor_pay);
            paySource = 'session';
          } else if (s.lead_professor_pay && s.lead_professor_pay > 0) {
            payAmount = parseFloat(s.lead_professor_pay);
            paySource = 'professor_base';
          } else {
            // Fall back to professor's own base pay
            const [[prof]] = await pool.query('SELECT base_pay FROM professor WHERE id = ?', [leadProfId]);
            if (prof?.base_pay) {
              payAmount = parseFloat(prof.base_pay);
              paySource = 'professor_base';
            }
          }

          if (payAmount > 0) {
            const regularPay = Math.round(classHours * STANDARD_HOURLY * 100) / 100;
            const bonus = Math.round((payAmount - regularPay) * 100) / 100;

            // Check idempotency
            const [[existing]] = await pool.query(
              `SELECT id FROM program_session_pay WHERE program_id = ? AND session_date = ? AND role = 'Lead' AND professor_id = ?`,
              [s.program_id, s.session_date, leadProfId]
            );

            if (!existing) {
              await pool.query(
                `INSERT INTO program_session_pay (program_id, session_id, session_date, lesson_name, role, professor_id, is_substitute, pay_amount, pay_source, class_hours, regular_pay_component, bonus_component)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                [s.program_id, s.session_id, s.session_date, s.lesson_name || null, 'Lead', leadProfId, isSubstitute ? 1 : 0, payAmount, paySource, classHours, regularPay, bonus]
              );
              sessionsWritten++;
            }
          }
        }

        // === ASSISTANT PROFESSOR ===
        const asstProfId = s.session_assistant_id || s.assistant_professor_id;
        if (asstProfId) {
          let payAmount = 0;
          let paySource = 'professor_base';
          let assistFlag = 'OK';

          if (s.session_assistant_pay && s.session_assistant_pay > 0) {
            payAmount = parseFloat(s.session_assistant_pay);
            paySource = 'session';
          } else if (s.assistant_professor_pay && s.assistant_professor_pay > 0) {
            payAmount = parseFloat(s.assistant_professor_pay);
            paySource = 'professor_base';
          } else {
            // Fall back to professor's own assist_pay
            const [[prof]] = await pool.query('SELECT assist_pay FROM professor WHERE id = ?', [asstProfId]);
            if (prof?.assist_pay) {
              payAmount = parseFloat(prof.assist_pay);
              paySource = 'professor_base';
            } else {
              assistFlag = 'MISSING';
            }
          }

          const regularPay = Math.round(classHours * STANDARD_HOURLY * 100) / 100;
          const bonus = Math.round((payAmount - regularPay) * 100) / 100;

          // Check idempotency
          const [[existing]] = await pool.query(
            `SELECT id FROM program_session_pay WHERE program_id = ? AND session_date = ? AND role = 'Assistant' AND professor_id = ?`,
            [s.program_id, s.session_date, asstProfId]
          );

          if (!existing) {
            await pool.query(
              `INSERT INTO program_session_pay (program_id, session_id, session_date, lesson_name, role, professor_id, is_substitute, pay_amount, pay_source, assist_pay_flag, class_hours, regular_pay_component, bonus_component)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [s.program_id, s.session_id, s.session_date, s.lesson_name || null, 'Assistant', asstProfId, 0, payAmount, paySource, assistFlag, classHours, regularPay, Math.max(0, bonus)]
            );
            sessionsWritten++;
          }
        }
      } catch (err) {
        errors++;
        errorDetails.push(`Program ${s.program_id}: ${err.message}`);
      }
    }

    programsProcessed = processedPrograms.size;

  } catch (err) {
    errors++;
    errorDetails.push(`Job-level error: ${err.message}`);
  }

  // Log the run
  const duration = Date.now() - startTime;
  await pool.query(
    `INSERT INTO nightly_job_logs (run_date, programs_processed, sessions_written, errors, error_details, duration_ms)
     VALUES (DATE_SUB(CURDATE(), INTERVAL 1 DAY), ?, ?, ?, ?, ?)`,
    [programsProcessed, sessionsWritten, errors, errorDetails.length ? errorDetails.join('\n') : null, duration]
  );

  console.log(`[Payroll Nightly Job] Programs: ${programsProcessed}, Sessions written: ${sessionsWritten}, Errors: ${errors}, Duration: ${duration}ms`);
  return { programsProcessed, sessionsWritten, errors, duration };
}

module.exports = { runNightlyPayJob };
