import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/people/search?q=smith — search existing people
router.get('/search', async (req, res, next) => {
  try {
    const q = `%${req.query.q || ''}%`;
    const { rows } = await db.query(`
      SELECT id, first_name, last_name, phone_primary, email
      FROM people
      WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1
      ORDER BY last_name, first_name
      LIMIT 10
    `, [q]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/people — create a new person
router.post('/', async (req, res, next) => {
  try {
    const { first_name, last_name, phone_primary, phone_secondary, email } = req.body;
    const { rows } = await db.query(`
      INSERT INTO people (first_name, last_name, phone_primary, phone_secondary, email)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [first_name, last_name, phone_primary || null, phone_secondary || null, email || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/people/:id — update a person's info
router.patch('/:id', async (req, res, next) => {
  try {
    const { first_name, last_name, phone_primary, phone_secondary, email } = req.body;
    const { rows } = await db.query(`
      UPDATE people SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        phone_primary = COALESCE($3, phone_primary),
        phone_secondary = COALESCE($4, phone_secondary),
        email = COALESCE($5, email),
        updated_at = now()
      WHERE id = $6 RETURNING *
    `, [first_name, last_name, phone_primary, phone_secondary, email, req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/people/:id/clients — which clients is this person linked to
router.get('/:id/clients', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT c.id, c.full_name, cc.relationship
      FROM client_contacts cc
      JOIN clients c ON c.id = cc.client_id
      WHERE cc.person_id = $1
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
