import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/clinicians - list all active clinicians
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, full_name, npi, license, phone FROM clinicians WHERE active = true ORDER BY full_name ASC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/clinicians - create clinician (admin only)
router.post('/', async (req, res, next) => {
  try {
    const { full_name, npi, license, phone, clerk_user_id } = req.body;
    const { rows } = await db.query(`
      INSERT INTO clinicians (full_name, npi, license, phone, clerk_user_id)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [full_name, npi, license, phone, clerk_user_id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
