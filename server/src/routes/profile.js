import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/profile
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM user_profiles WHERE clerk_user_id = $1',
      [req.auth.userId]
    );
    res.json(rows[0] || { phone: '' });
  } catch (err) { next(err); }
});

// PATCH /api/profile
router.patch('/', async (req, res, next) => {
  try {
    const { phone } = req.body;
    const { rows } = await db.query(
      `INSERT INTO user_profiles (clerk_user_id, phone)
       VALUES ($1, $2)
       ON CONFLICT (clerk_user_id) DO UPDATE SET phone = $2, updated_at = NOW()
       RETURNING *`,
      [req.auth.userId, phone || '']
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
