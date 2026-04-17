const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { isConfigured, trainualGet, trainualPost, trainualPut } = require('../lib/trainual');

// Trainual role IDs (permanent in account 7243). Env var overrides take precedence.
const ROLE_IN_TRAINING = parseInt(process.env.TRAINUAL_ROLE_IN_TRAINING) || 241016;
const ROLE_SCI_ENG_PROFESSOR = parseInt(process.env.TRAINUAL_ROLE_SCI_ENG_PROFESSOR) || 53906;

router.use(authenticate);

// POST /api/trainual/sync — pull all users from Trainual and upsert into trainual_user
router.post('/sync', async (req, res, next) => {
  try {
    if (!isConfigured()) return res.status(503).json({ success: false, error: 'Trainual not configured' });
    const users = await trainualGet('/users?with_archived=true');
    if (!Array.isArray(users)) return res.status(500).json({ success: false, error: 'Unexpected Trainual response' });

    let synced = 0;
    for (const u of users) {
      await pool.query(
        `INSERT INTO trainual_user (trainual_user_id, email, name, title, permission, avg_completion, status, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           email = VALUES(email),
           name = VALUES(name),
           title = VALUES(title),
           permission = VALUES(permission),
           avg_completion = VALUES(avg_completion),
           status = VALUES(status),
           last_synced_at = NOW()`,
        [
          u.id,
          (u.email || '').toLowerCase(),
          u.name || null,
          u.title || null,
          u.permission || null,
          u.completion_percentage != null ? u.completion_percentage : (u.avg_completion != null ? u.avg_completion : null),
          u.status || null,
        ]
      );
      synced++;
    }
    res.json({ success: true, synced });
  } catch (err) { next(err); }
});

// POST /api/trainual/sync-candidates — only refresh Trainual users tied to candidate records
router.post('/sync-candidates', async (req, res, next) => {
  try {
    if (!isConfigured()) return res.status(503).json({ success: false, error: 'Trainual not configured' });

    const [rows] = await pool.query(
      'SELECT trainual_user_id FROM candidate WHERE trainual_user_id IS NOT NULL AND active = 1'
    );
    const ids = rows.map(r => r.trainual_user_id);
    if (!ids.length) return res.json({ success: true, synced: 0 });

    let synced = 0, failed = 0, cleared = 0;
    for (const id of ids) {
      try {
        const u = await trainualGet(`/users/${id}`);
        if (!u || !u.id) { failed++; continue; }
        await pool.query(
          `INSERT INTO trainual_user (trainual_user_id, email, name, title, permission, avg_completion, status, last_synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             email = VALUES(email), name = VALUES(name), title = VALUES(title),
             permission = VALUES(permission), avg_completion = VALUES(avg_completion),
             status = VALUES(status), last_synced_at = NOW()`,
          [
            u.id, (u.email || '').toLowerCase(), u.name || null, u.title || null, u.permission || null,
            u.completion_percentage != null ? u.completion_percentage : (u.avg_completion != null ? u.avg_completion : null),
            u.status || null,
          ]
        );
        synced++;
      } catch (e) {
        // If Trainual returns 404, the user was deleted — clear the link from candidate + cache
        if (e.status === 404) {
          await pool.query('UPDATE candidate SET trainual_user_id = NULL, trainual_invited_at = NULL WHERE trainual_user_id = ?', [id]);
          await pool.query('DELETE FROM trainual_user WHERE trainual_user_id = ?', [id]);
          cleared++;
        } else {
          failed++;
        }
      }
    }
    res.json({ success: true, synced, failed, cleared });
  } catch (err) { next(err); }
});

// GET /api/trainual/professor-issues — flag professors needing attention
router.get('/professor-issues', async (req, res, next) => {
  try {
    // Active professors (Active/Substitute/Training/In Training) without an active Trainual account
    const [missingFromTrainual] = await pool.query(
      `SELECT p.id, p.professor_nickname, p.first_name, p.last_name, p.email, ps.professor_status_name,
              tu.status AS trainual_status
       FROM professor p
       LEFT JOIN professor_status ps ON ps.id = p.professor_status_id
       LEFT JOIN trainual_user tu ON tu.email = LOWER(p.email)
       WHERE p.active = 1
         AND ps.professor_status_name IN ('Active', 'Substitute', 'Training', 'In Training')
         AND p.email IS NOT NULL AND p.email != ''
         AND (tu.id IS NULL OR tu.status != 'active')
       ORDER BY p.professor_nickname`
    );

    // Professors with status Inactive-Items Pending or Terminated but still active in Trainual
    const [shouldBeArchived] = await pool.query(
      `SELECT p.id, p.professor_nickname, p.first_name, p.last_name, p.email, ps.professor_status_name,
              tu.trainual_user_id, tu.avg_completion, tu.status AS trainual_status
       FROM professor p
       JOIN professor_status ps ON ps.id = p.professor_status_id
       JOIN trainual_user tu ON tu.email = LOWER(p.email)
       WHERE p.active = 1
         AND ps.professor_status_name IN ('Inactive - Items Pending', 'Terminated', 'Inactive')
         AND tu.status = 'active'
       ORDER BY p.professor_nickname`
    );

    res.json({ success: true, data: { missingFromTrainual, shouldBeArchived } });
  } catch (err) { next(err); }
});

// POST /api/trainual/invite-candidate/:candidateId
router.post('/invite-candidate/:candidateId', async (req, res, next) => {
  try {
    if (!isConfigured()) return res.status(503).json({ success: false, error: 'Trainual not configured' });

    const [[candidate]] = await pool.query(
      'SELECT id, full_name, email, trainual_user_id FROM candidate WHERE id = ?',
      [req.params.candidateId]
    );
    if (!candidate) return res.status(404).json({ success: false, error: 'Candidate not found' });
    if (!candidate.email) return res.status(400).json({ success: false, error: 'Candidate has no email' });
    if (candidate.trainual_user_id) return res.status(400).json({ success: false, error: 'Candidate already invited to Trainual' });

    let created;
    try {
      created = await trainualPost('/users', {
        user: {
          email: candidate.email,
          name: (candidate.full_name || '').trim(),
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Trainual invite failed: ' + err.message });
    }

    const trainualUserId = created?.id;
    if (!trainualUserId) return res.status(500).json({ success: false, error: 'No user ID returned from Trainual' });

    // Assign In Training role as a follow-up call
    try {
      await trainualPut(`/users/${trainualUserId}/assign_roles`, { role_ids: [ROLE_IN_TRAINING] });
    } catch (err) {
      console.warn(`Trainual assign In Training failed for new user ${trainualUserId}: ${err.message}`);
    }

    // Save to candidate
    await pool.query(
      'UPDATE candidate SET trainual_user_id = ?, trainual_invited_at = NOW(), ts_updated = NOW() WHERE id = ?',
      [trainualUserId, candidate.id]
    );

    // Upsert into local cache
    await pool.query(
      `INSERT INTO trainual_user (trainual_user_id, email, name, title, permission, avg_completion, status, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         email = VALUES(email), name = VALUES(name), status = VALUES(status), last_synced_at = NOW()`,
      [
        trainualUserId,
        candidate.email.toLowerCase(),
        created.name || candidate.full_name,
        created.title || null,
        created.permission || 'general',
        created.completion_percentage != null ? created.completion_percentage : 0,
        created.status || 'pending',
      ]
    );

    res.json({ success: true, trainual_user_id: trainualUserId });
  } catch (err) { next(err); }
});

// POST /api/trainual/promote-candidate/:candidateId — swap In Training → Sci & Eng Professor
router.post('/promote-candidate/:candidateId', async (req, res, next) => {
  try {
    if (!isConfigured()) return res.status(503).json({ success: false, error: 'Trainual not configured' });

    const [[candidate]] = await pool.query(
      'SELECT trainual_user_id FROM candidate WHERE id = ?', [req.params.candidateId]
    );
    if (!candidate?.trainual_user_id) {
      return res.status(400).json({ success: false, error: 'Candidate not invited to Trainual' });
    }

    // Unassign In Training, then assign Sci & Eng Professor
    try {
      await trainualPut(`/users/${candidate.trainual_user_id}/unassign_roles`, { role_ids: [ROLE_IN_TRAINING] });
    } catch (err) {
      console.warn(`Trainual unassign In Training failed (continuing): ${err.message}`);
    }
    await trainualPut(`/users/${candidate.trainual_user_id}/assign_roles`, { role_ids: [ROLE_SCI_ENG_PROFESSOR] });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/trainual/users/:trainualUserId/archive
router.put('/users/:trainualUserId/archive', async (req, res, next) => {
  try {
    if (!isConfigured()) return res.status(503).json({ success: false, error: 'Trainual not configured' });
    await trainualPut(`/users/${req.params.trainualUserId}/archive`, {});
    await pool.query(
      'UPDATE trainual_user SET status = ?, last_synced_at = NOW() WHERE trainual_user_id = ?',
      ['archived', req.params.trainualUserId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
