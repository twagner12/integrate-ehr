import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

const FIELDS = [
  'practice_name', 'address_line1', 'address_line2', 'city', 'state', 'zip',
  'phone', 'tax_id', 'logo_data', 'invoice_due_days', 'invoice_footer', 'superbill_day',
];

// GET /api/settings
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM clinic_settings LIMIT 1');
    res.json(rows[0] || {});
  } catch (err) { next(err); }
});

// PATCH /api/settings
router.patch('/', async (req, res, next) => {
  try {
    const updates = [];
    const values = [];
    FIELDS.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${values.length + 1}`);
        values.push(req.body[f]);
      }
    });
    if (updates.length === 0) return res.json({});
    values.push(new Date());
    const { rows } = await db.query(
      `UPDATE clinic_settings SET ${updates.join(', ')}, updated_at = $${values.length}
       WHERE id = 1 RETURNING *`,
      values
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
