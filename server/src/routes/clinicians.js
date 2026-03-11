import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/clinicians
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT * FROM clinicians ORDER BY active DESC, last_name ASC, first_name ASC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/clinicians/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM clinicians WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Clinician not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/clinicians
router.post('/', async (req, res, next) => {
  try {
    const { first_name, last_name, npi_number, license_number, credentials, phone } = req.body;
    const full_name = `${first_name} ${last_name}`;
    const { rows } = await db.query(`
      INSERT INTO clinicians (first_name, last_name, full_name, npi_number, license_number, credentials, phone, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *
    `, [first_name, last_name, full_name, npi_number || null, license_number || null, credentials || null, phone || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/clinicians/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { first_name, last_name, npi_number, license_number, credentials, phone, active } = req.body;
    const full_name = (first_name && last_name) ? `${first_name} ${last_name}` : undefined;
    const { rows } = await db.query(`
      UPDATE clinicians SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        full_name = COALESCE($3, full_name),
        npi_number = COALESCE($4, npi_number),
        license_number = COALESCE($5, license_number),
        credentials = COALESCE($6, credentials),
        phone = COALESCE($7, phone),
        active = COALESCE($8, active),
        updated_at = now()
      WHERE id = $9 RETURNING *
    `, [first_name, last_name, full_name, npi_number, license_number, credentials, phone, active, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Clinician not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
