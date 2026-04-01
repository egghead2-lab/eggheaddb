const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/holidays
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, type, year, sort, dir, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [];
    let params = [];

    // Default to future holidays only unless show_past is explicitly set
    if (!req.query.show_past) {
      whereClauses.push(`holiday_date >= CURDATE()`);
    }

    if (search) {
      whereClauses.push(`holiday_name LIKE ?`);
      params.push(`%${search}%`);
    }
    if (year) {
      whereClauses.push(`YEAR(holiday_date) = ?`);
      params.push(parseInt(year));
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const sortMap = { name: 'holiday_name', date: 'holiday_date' };
    const sortCol = sortMap[sort] || 'holiday_date';
    const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

    const [rows] = await pool.query(
      `SELECT * FROM holiday ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM holiday ${where}`,
      params
    );

    res.json({ success: true, data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// POST /api/holidays/bulk
router.post('/bulk', authenticate, async (req, res, next) => {
  try {
    const { holidays } = req.body;
    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({ success: false, error: 'Holidays array is required' });
    }

    const values = holidays
      .filter(h => h.holiday_name && h.holiday_date)
      .map(h => [h.holiday_name, h.holiday_date, h.generic ? 1 : 0, 0]);

    if (values.length === 0) {
      return res.status(400).json({ success: false, error: 'Each holiday needs a name and date' });
    }

    const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
    const flat = values.flat();

    const [result] = await pool.query(
      `INSERT INTO holiday (holiday_name, holiday_date, generic, jewish) VALUES ${placeholders}`,
      flat
    );

    res.json({ success: true, inserted: result.affectedRows });
  } catch (err) {
    next(err);
  }
});

// GET /api/holidays/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const [[holiday]] = await pool.query(`SELECT * FROM holiday WHERE id = ?`, [req.params.id]);
    if (!holiday) return res.status(404).json({ success: false, error: 'Holiday not found' });
    res.json({ success: true, data: holiday });
  } catch (err) {
    next(err);
  }
});

// POST /api/holidays
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { holiday_name, holiday_date, generic, jewish } = req.body;
    if (!holiday_name || !holiday_date) {
      return res.status(400).json({ success: false, error: 'Name and date are required' });
    }
    const [result] = await pool.query(
      `INSERT INTO holiday (holiday_name, holiday_date, generic, jewish) VALUES (?, ?, ?, ?)`,
      [holiday_name, holiday_date, generic ? 1 : 0, jewish ? 1 : 0]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/holidays/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { holiday_name, holiday_date, generic, jewish } = req.body;
    const fields = [];
    const values = [];

    if (holiday_name !== undefined) { fields.push('holiday_name = ?'); values.push(holiday_name); }
    if (holiday_date !== undefined) { fields.push('holiday_date = ?'); values.push(holiday_date); }
    if (generic !== undefined) { fields.push('generic = ?'); values.push(generic ? 1 : 0); }
    if (jewish !== undefined) { fields.push('jewish = ?'); values.push(jewish ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    await pool.query(`UPDATE holiday SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/holidays/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM holiday WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
