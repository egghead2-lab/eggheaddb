/**
 * Flyers module — upload PDF templates, draw merge zones over them,
 * generate personalized flyers for programs.
 *
 * Routes (all under /api/flyers):
 *   Templates
 *     GET    /templates                      list non-archived
 *     POST   /templates                      upload new PDF template (multipart)
 *     GET    /templates/:id                  template + fields
 *     PUT    /templates/:id                  update metadata
 *     POST   /templates/:id/archive          soft-delete
 *     PUT    /templates/:id/fields           replace all fields for template
 *     GET    /templates/:id/pdf              stream original template PDF
 *   Data / rendering
 *     GET    /fields-catalog                 list of available merge fields
 *     GET    /programs-needing-flyers        programs flagged (or location-inherited) as needing a flyer
 *     GET    /program/:programId/data        the auto-populated data for a program
 *     POST   /render                         render a flyer (preview or download)
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { FLYER_FIELDS, isValidFieldKey } = require('../lib/flyerFields');
const { renderFlyer } = require('../services/flyerRenderer');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'flyer-templates');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const flyerUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const id = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}_${id}.pdf`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF uploads are allowed'));
    }
    cb(null, true);
  },
});

// ─── Field catalog ───────────────────────────────────────────────────
router.get('/fields-catalog', authenticate, (_req, res) => {
  res.json({ success: true, data: FLYER_FIELDS });
});

// ─── Template list ───────────────────────────────────────────────────
router.get('/templates', authenticate, async (req, res, next) => {
  try {
    const { season, include_archived } = req.query;
    const where = ['t.active = 1'];
    const params = [];
    if (!include_archived) where.push('t.is_archived = 0');
    if (season) { where.push('t.season = ?'); params.push(season); }

    const [rows] = await pool.query(
      `SELECT t.id, t.name, t.season, t.description, t.page_count,
              t.pdf_page_width, t.pdf_page_height, t.is_archived,
              t.created_by_user_id, t.ts_inserted, t.ts_updated,
              CONCAT(u.first_name, ' ', u.last_name) AS created_by_name,
              (SELECT COUNT(*) FROM flyer_template_field f WHERE f.flyer_template_id = t.id) AS field_count
       FROM flyer_template t
       LEFT JOIN user u ON u.id = t.created_by_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY t.ts_updated DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ─── Create template (upload PDF) ────────────────────────────────────
router.post('/templates', authenticate, flyerUpload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'PDF file required' });
    const { name, season, description } = req.body;
    if (!name) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    // Parse PDF to get page dimensions + count
    let pageCount, width, height;
    try {
      const bytes = fs.readFileSync(req.file.path);
      const pdf = await PDFDocument.load(bytes);
      pageCount = pdf.getPageCount();
      const page = pdf.getPage(0);
      ({ width, height } = page.getSize());
    } catch (err) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: 'Invalid PDF: ' + err.message });
    }

    const relPath = path.relative(path.join(__dirname, '..', '..'), req.file.path).replace(/\\/g, '/');
    const [result] = await pool.query(
      `INSERT INTO flyer_template (name, season, description, pdf_storage_path,
        pdf_page_width, pdf_page_height, page_count, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, season || null, description || null, relPath, width, height, pageCount, req.user.userId]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(err);
  }
});

// ─── Template detail + fields ────────────────────────────────────────
router.get('/templates/:id', authenticate, async (req, res, next) => {
  try {
    const [[template]] = await pool.query(
      `SELECT t.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
       FROM flyer_template t
       LEFT JOIN user u ON u.id = t.created_by_user_id
       WHERE t.id = ? AND t.active = 1`,
      [req.params.id]
    );
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const [fields] = await pool.query(
      `SELECT * FROM flyer_template_field
       WHERE flyer_template_id = ?
       ORDER BY display_order, id`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...template, fields } });
  } catch (err) { next(err); }
});

// ─── Update template metadata ────────────────────────────────────────
router.put('/templates/:id', authenticate, async (req, res, next) => {
  try {
    const updates = ['name', 'season', 'description']
      .filter((f) => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    const set = updates.map((f) => `${f} = ?`).join(', ');
    const vals = updates.map((f) => req.body[f] === '' ? null : req.body[f]);
    await pool.query(
      `UPDATE flyer_template SET ${set}, ts_updated = NOW() WHERE id = ?`,
      [...vals, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Archive template (soft-delete) ──────────────────────────────────
router.post('/templates/:id/archive', authenticate, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE flyer_template SET is_archived = 1, ts_updated = NOW() WHERE id = ?`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Replace all fields for a template ───────────────────────────────
router.put('/templates/:id/fields', authenticate, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const fields = Array.isArray(req.body.fields) ? req.body.fields : [];
    // Validate every field_key is in the catalog
    for (const f of fields) {
      if (!isValidFieldKey(f.field_key)) {
        return res.status(400).json({ success: false, error: `Invalid field_key: ${f.field_key}` });
      }
    }

    await conn.beginTransaction();
    await conn.query(`DELETE FROM flyer_template_field WHERE flyer_template_id = ?`, [req.params.id]);
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      await conn.query(
        `INSERT INTO flyer_template_field
          (flyer_template_id, field_key, field_label, field_type, page_number,
           x, y, width, height, font_size, font_family, font_color, alignment,
           auto_shrink, is_optional, display_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          req.params.id,
          f.field_key,
          f.field_label || f.field_key,
          f.field_type || 'text',
          f.page_number || 1,
          f.x, f.y, f.width, f.height,
          f.font_size ?? 12,
          f.font_family || 'Helvetica',
          f.font_color || '#000000',
          f.alignment || 'left',
          f.auto_shrink ? 1 : 0,
          f.is_optional ? 1 : 0,
          f.display_order ?? i,
        ]
      );
    }
    await conn.commit();
    res.json({ success: true, count: fields.length });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// ─── Stream original template PDF ────────────────────────────────────
router.get('/templates/:id/pdf', authenticate, async (req, res, next) => {
  try {
    const [[template]] = await pool.query(
      `SELECT pdf_storage_path FROM flyer_template WHERE id = ? AND active = 1`,
      [req.params.id]
    );
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    const full = path.join(__dirname, '..', '..', template.pdf_storage_path);
    if (!fs.existsSync(full)) return res.status(404).json({ success: false, error: 'PDF file missing from disk' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, max-age=300');
    fs.createReadStream(full).pipe(res);
  } catch (err) { next(err); }
});

// ─── Programs that need a flyer (inherited from location.flyer_required) ──
router.get('/programs-needing-flyers', authenticate, async (req, res, next) => {
  try {
    const { search, status, location_id } = req.query;
    const where = [
      'prog.active = 1',
      "(cs.class_status_name IS NULL OR cs.class_status_name NOT LIKE 'Cancelled%')",
      '(prog.flyer_required = 1 OR loc.flyer_required = 1)',
      `pt.program_type_name != 'Party'`,
    ];
    const params = [];
    if (search) { where.push('prog.program_nickname LIKE ?'); params.push(`%${search}%`); }
    if (location_id) { where.push('prog.location_id = ?'); params.push(location_id); }
    if (status === 'needed') where.push('prog.flyer_made IS NULL');
    if (status === 'made') where.push('prog.flyer_made IS NOT NULL AND prog.flyer_sent_electronic IS NULL');
    if (status === 'sent') where.push('prog.flyer_sent_electronic IS NOT NULL');

    const [rows] = await pool.query(
      `SELECT prog.id, prog.program_nickname,
              prog.first_session_date, prog.last_session_date,
              prog.start_time, prog.class_length_minutes,
              prog.parent_cost, prog.lab_fee, prog.session_count, prog.grade_range,
              prog.flyer_required AS program_flyer_required,
              prog.flyer_made, prog.flyer_sent_electronic, prog.flyer_dropped_physical,
              loc.id AS location_id, loc.nickname AS location_nickname, loc.school_name,
              loc.flyer_required AS location_flyer_required,
              loc.registration_link_for_flyer, loc.flyer_instructions,
              cl.class_name
       FROM program prog
       LEFT JOIN location loc ON loc.id = prog.location_id
       LEFT JOIN class_status cs ON cs.id = prog.class_status_id
       LEFT JOIN class cl ON cl.id = prog.class_id
       LEFT JOIN program_type pt ON pt.id = cl.program_type_id
       WHERE ${where.join(' AND ')}
       ORDER BY prog.first_session_date ASC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Helper: build flyer data object from a program row
async function buildFlyerData(programId) {
  const [[prog]] = await pool.query(
    `SELECT prog.*, cl.class_name,
            loc.nickname AS location_nickname, loc.school_name,
            loc.registration_link_for_flyer, loc.flyer_instructions
     FROM program prog
     LEFT JOIN location loc ON loc.id = prog.location_id
     LEFT JOIN class cl ON cl.id = prog.class_id
     WHERE prog.id = ? AND prog.active = 1`,
    [programId]
  );
  if (!prog) return null;

  // Sessions for class_dates + session_count
  const [sessions] = await pool.query(
    `SELECT session_date FROM session
     WHERE program_id = ? AND active = 1
     ORDER BY session_date ASC`,
    [programId]
  );

  // Format class_dates as "Jan 12, Jan 19, Jan 26..."
  const formatDateShort = (d) => {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const sessionDateList = sessions.map((s) => formatDateShort(s.session_date));

  // Day + time: e.g., "Tuesdays, 2:30 — 3:30 PM"
  const DAYS = [['monday', 'Mondays'], ['tuesday', 'Tuesdays'], ['wednesday', 'Wednesdays'],
    ['thursday', 'Thursdays'], ['friday', 'Fridays'], ['saturday', 'Saturdays'], ['sunday', 'Sundays']];
  const dayNames = DAYS.filter(([k]) => prog[k]).map(([, n]) => n);
  const formatTime = (t) => {
    if (!t) return '';
    const [h, m] = String(t).split(':');
    let hr = parseInt(h);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    if (hr > 12) hr -= 12;
    if (hr === 0) hr = 12;
    return `${hr}:${m} ${ampm}`;
  };
  const startTimeStr = formatTime(prog.start_time);
  let endTimeStr = '';
  if (prog.start_time && prog.class_length_minutes) {
    const [h, m] = String(prog.start_time).split(':').map((n) => parseInt(n));
    const endMin = h * 60 + m + prog.class_length_minutes;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    endTimeStr = formatTime(`${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`);
  }
  const classDay = dayNames.join(' & ');
  const classTime = `${startTimeStr}${endTimeStr ? ` - ${endTimeStr}` : ''}`.trim();
  const dayAndTime = classDay ? `${classDay}, ${classTime}` : classTime;

  const formatMoney = (n) => {
    if (n == null) return '';
    const v = parseFloat(n);
    if (Number.isNaN(v)) return '';
    return `$${v.toFixed(2).replace(/\.00$/, '')}`;
  };

  const data = {
    location_name: prog.school_name || prog.location_nickname || '',
    class_name: prog.class_name || '',
    class_dates: sessionDateList.join(', '),
    class_day: classDay,
    class_time: classTime,
    class_day_and_time: dayAndTime,
    class_cost: formatMoney(prog.parent_cost),
    lab_fee: formatMoney(prog.lab_fee),
    grade_range: prog.grade_range || '',
    session_count: sessions.length ? `${sessions.length} weeks` : (prog.session_count ? `${prog.session_count} weeks` : ''),
    registration_link: prog.registration_link_for_flyer || '',
    qr_code: prog.registration_link_for_flyer || '',
    note: '',
  };

  return { program: prog, sessions, data, flyer_instructions: prog.flyer_instructions };
}

// ─── Program → auto-populated flyer data (for UI prefill) ────────────
router.get('/program/:programId/data', authenticate, async (req, res, next) => {
  try {
    const result = await buildFlyerData(req.params.programId);
    if (!result) return res.status(404).json({ success: false, error: 'Program not found' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ─── Render a flyer (preview or download) ────────────────────────────
router.post('/render', authenticate, async (req, res, next) => {
  try {
    const { template_id, program_id, data: overrideData, mode } = req.body;
    if (!template_id) return res.status(400).json({ success: false, error: 'template_id required' });

    const [[template]] = await pool.query(
      `SELECT * FROM flyer_template WHERE id = ? AND active = 1`,
      [template_id]
    );
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const [fields] = await pool.query(
      `SELECT * FROM flyer_template_field WHERE flyer_template_id = ? ORDER BY display_order, id`,
      [template_id]
    );

    // Build data: start with program defaults, then layer overrides from the client
    let data = {};
    if (program_id) {
      const built = await buildFlyerData(program_id);
      if (built) data = { ...built.data };
    }
    if (overrideData && typeof overrideData === 'object') {
      data = { ...data, ...overrideData };
    }

    // Load template PDF from disk
    const full = path.join(__dirname, '..', '..', template.pdf_storage_path);
    if (!fs.existsSync(full)) {
      return res.status(500).json({ success: false, error: 'Template PDF missing from disk' });
    }
    const templateBytes = fs.readFileSync(full);

    const outputBytes = await renderFlyer(templateBytes, fields, data);

    if (mode === 'download') {
      const safeName = (data.location_name || `flyer-${template_id}`).replace(/[^\w\-]+/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
      return res.end(Buffer.from(outputBytes));
    }

    // Default: preview — return base64 in JSON (easy for <iframe src="data:…">)
    const b64 = Buffer.from(outputBytes).toString('base64');
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, pdf_base64: b64 });
  } catch (err) {
    console.error('[Flyer render] failed:', err.message, '\n  template:', req.body?.template_id, '\n  program:', req.body?.program_id, '\n', err.stack);
    res.status(500).json({ success: false, error: err.message || 'Render failed' });
  }
});

module.exports = router;
