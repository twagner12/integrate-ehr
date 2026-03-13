import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/services
// ?all=1 to include inactive (used by Settings page)
router.get('/', async (req, res, next) => {
  try {
    const showAll = req.query.all === '1';
    const { rows } = await db.query(
      showAll
        ? 'SELECT * FROM services ORDER BY is_default DESC, cpt_code ASC'
        : 'SELECT * FROM services WHERE active = true ORDER BY is_default DESC, cpt_code ASC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/services
router.post('/', async (req, res, next) => {
  try {
    const { cpt_code, description, duration_minutes, full_rate, late_cancel_rate, is_default } = req.body;
    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }
    // Clear existing default if this one is being set as default
    if (is_default) {
      await db.query('UPDATE services SET is_default = false');
    }
    const { rows } = await db.query(
      `INSERT INTO services (cpt_code, description, duration_minutes, full_rate, late_cancel_rate, is_default)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [cpt_code, description, duration_minutes || 50, full_rate, late_cancel_rate || null, is_default || false]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/services/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['cpt_code', 'description', 'duration_minutes', 'full_rate', 'late_cancel_rate', 'is_default', 'active'];
    const updates = [];
    const values = [];
    allowed.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${values.length + 1}`);
        values.push(req.body[f]);
      }
    });
    if (updates.length === 0) return res.json({});
    // Clear existing default if this one is being set as default
    if (req.body.is_default === true) {
      await db.query('UPDATE services SET is_default = false WHERE id != $1', [id]);
    }
    values.push(id);
    const { rows } = await db.query(
      `UPDATE services SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Service not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
