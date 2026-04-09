const pool = require('../db/pool');

// Fields to never log (sensitive or noisy)
const SKIP_FIELDS = ['password', 'google_refresh_token', 'ts_updated', 'ts_inserted'];

/**
 * Log an audit entry by diffing old and new data.
 * Call BEFORE the update query with the current DB row, then after with the new values.
 *
 * @param {string} table - table name (e.g. 'professor')
 * @param {number} recordId - the row ID
 * @param {object} user - req.user from JWT ({ userId, name })
 * @param {object} oldData - the row before update
 * @param {object} newData - the fields being changed (from req.body)
 */
async function logAudit(table, recordId, user, oldData, newData) {
  try {
    const changes = {};
    for (const [key, newVal] of Object.entries(newData)) {
      if (SKIP_FIELDS.includes(key)) continue;
      if (newVal === undefined) continue;
      const oldVal = oldData[key];
      // Normalize for comparison
      const oldStr = oldVal instanceof Date ? oldVal.toISOString().split('T')[0] : String(oldVal ?? '');
      const newStr = newVal instanceof Date ? newVal.toISOString().split('T')[0] : String(newVal ?? '');
      if (oldStr !== newStr) {
        changes[key] = { from: oldVal ?? null, to: newVal === '' ? null : newVal };
      }
    }
    if (Object.keys(changes).length === 0) return; // nothing actually changed

    await pool.query(
      'INSERT INTO audit_log (table_name, record_id, user_id, user_name, action, changes) VALUES (?, ?, ?, ?, ?, ?)',
      [table, recordId, user?.userId || null, user?.name || null, 'update', JSON.stringify(changes)]
    );
  } catch (err) {
    // Don't let audit failures break the actual operation
    console.error('Audit log error:', err.message);
  }
}

module.exports = { logAudit };
