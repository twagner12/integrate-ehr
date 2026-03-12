import { getAuth } from '@clerk/express';
import { Router } from 'express';
import { getRole } from '../middleware/auth.js';
import { db } from '../db/index.js';

const router = Router();

// GET /api/notes?client_id=1
router.get('/', async (req, res, next) => {
  try {
    const { client_id } = req.query;
    const conditions = ['1=1'];
    const params = [];
    if (client_id) { params.push(client_id); conditions.push(`n.client_id = $${params.length}`); }

    const { rows } = await db.query(`
      SELECT
        n.*,
        a.starts_at AS appointment_date,
        a.status AS appointment_status,
        s.cpt_code, s.description AS service_description,
        cl.full_name AS clinician_name,
        cl.license_number AS clinician_license,
        cl.credentials AS clinician_credentials,
        c.full_name AS client_name,
        c.date_of_birth AS client_dob,
        d.icd10_code AS diagnosis_code,
        d.description AS diagnosis_description
      FROM notes n
      JOIN appointments a ON a.id = n.appointment_id
      JOIN services s ON s.id = a.service_id
      JOIN clinicians cl ON cl.id = a.clinician_id
      JOIN clients c ON c.id = n.client_id
      LEFT JOIN diagnoses d ON d.client_id = n.client_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.starts_at DESC
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/notes/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        n.*,
        a.starts_at AS appointment_date,
        a.ends_at AS appointment_end,
        a.status AS appointment_status,
        s.cpt_code, s.description AS service_description,
        cl.full_name AS clinician_name,
        cl.npi_number AS clinician_npi,
        cl.license_number AS clinician_license,
        cl.credentials AS clinician_credentials,
        c.full_name AS client_name,
        c.date_of_birth AS client_dob,
        d.icd10_code AS diagnosis_code,
        d.description AS diagnosis_description
      FROM notes n
      JOIN appointments a ON a.id = n.appointment_id
      JOIN services s ON s.id = a.service_id
      JOIN clinicians cl ON cl.id = a.clinician_id
      JOIN clients c ON c.id = n.client_id
      LEFT JOIN diagnoses d ON d.client_id = n.client_id
      WHERE n.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Note not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/notes/appointment/:appointmentId
router.get('/appointment/:appointmentId', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT n.* FROM notes n WHERE n.appointment_id = $1 LIMIT 1
    `, [req.params.appointmentId]);
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

// POST /api/notes
router.post('/', async (req, res, next) => {
  try {
    const { appointment_id, client_id, subjective, objective, assessment, plan } = req.body;
    const { rows } = await db.query(`
      INSERT INTO notes (appointment_id, client_id, subjective, objective, assessment, plan, is_finalized)
      VALUES ($1, $2, $3, $4, $5, $6, false)
      RETURNING *
    `, [appointment_id, client_id, subjective || '', objective || '', assessment || '', plan || '']);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/notes/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { subjective, objective, assessment, plan } = req.body;

    // Block edits on finalized notes
    const { rows: check } = await db.query('SELECT is_finalized FROM notes WHERE id = $1', [req.params.id]);
    if (!check[0]) return res.status(404).json({ error: 'Note not found' });
    if (check[0].is_finalized) return res.status(403).json({ error: 'Note is finalized. Unlock it to edit.' });

    const { rows } = await db.query(`
      UPDATE notes SET
        subjective = COALESCE($1, subjective),
        objective = COALESCE($2, objective),
        assessment = COALESCE($3, assessment),
        plan = COALESCE($4, plan),
        updated_at = now()
      WHERE id = $5 RETURNING *
    `, [subjective, objective, assessment, plan, req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/notes/:id/finalize
router.post('/:id/finalize', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      UPDATE notes SET
        is_finalized = true,
        finalized_at = now(),
        updated_at = now()
      WHERE id = $1 RETURNING *
    `, [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/notes/:id/unlock — admin only
router.post('/:id/unlock', async (req, res, next) => {
  try {
    const role = getRole(req);
    if (role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { rows } = await db.query(`
      UPDATE notes SET
        is_finalized = false,
        finalized_at = null,
        unlocked_at = now(),
        updated_at = now()
      WHERE id = $1 RETURNING *
    `, [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
