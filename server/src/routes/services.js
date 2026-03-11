import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/services
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT * FROM services WHERE active = true ORDER BY is_default DESC, cpt_code ASC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
