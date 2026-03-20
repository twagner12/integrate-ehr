import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import path from 'path';
import { getRole } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { transcribeAudio, generateSOAPNote } from '../services/ai.js';

const uploadDir = path.resolve(import.meta.dirname, '../../uploads');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}-${file.originalname}`),
});
const audioUpload = multer({ storage });

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

// GET /api/notes/previous/:clientId — get most recent finalized note for a client
router.get('/previous/:clientId', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT n.subjective, n.objective, n.assessment, n.plan,
        a.starts_at, s.description AS service_name, cl.full_name AS clinician_name
      FROM notes n
      JOIN appointments a ON a.id = n.appointment_id
      JOIN services s ON s.id = a.service_id
      JOIN clinicians cl ON cl.id = a.clinician_id
      WHERE n.client_id = $1
        AND n.is_finalized = true
      ORDER BY a.starts_at DESC
      LIMIT 1
    `, [req.params.clientId]);
    if (!rows[0]) return res.status(404).json({ error: 'No previous notes found' });
    res.json(rows[0]);
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

// POST /api/notes/transcribe
router.post('/transcribe', audioUpload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
    const transcript = await transcribeAudio(req.file.path);
    res.json({ transcript, audio_filename: req.file.filename });
  } catch (err) { next(err); }
});

// POST /api/notes/generate-soap
router.post('/generate-soap', async (req, res, next) => {
  try {
    const { transcript, appointment_id } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript is required' });

    let context = {};
    if (appointment_id) {
      const { rows } = await db.query(`
        SELECT
          c.full_name AS client_name,
          s.description AS service_name,
          cl.full_name AS clinician_name,
          d.icd10_code AS diagnosis_code,
          d.description AS diagnosis_description
        FROM appointments a
        JOIN clients c ON c.id = a.client_id
        JOIN services s ON s.id = a.service_id
        JOIN clinicians cl ON cl.id = a.clinician_id
        LEFT JOIN diagnoses d ON d.client_id = a.client_id
        WHERE a.id = $1
      `, [appointment_id]);
      if (rows[0]) {
        context.clientName = rows[0].client_name;
        context.serviceName = rows[0].service_name;
        context.clinicianName = rows[0].clinician_name;
        if (rows[0].diagnosis_code) {
          context.diagnosisInfo = `${rows[0].diagnosis_code} - ${rows[0].diagnosis_description}`;
        }
      }
    }

    const soap = await generateSOAPNote(transcript, context);
    res.json(soap);
  } catch (err) { next(err); }
});

// POST /api/notes/:id/attach-audio
router.post('/:id/attach-audio', async (req, res, next) => {
  try {
    const { audio_filename, transcript } = req.body;
    const { rows } = await db.query(`
      UPDATE notes SET
        audio_filename = $1,
        transcript = $2,
        updated_at = now()
      WHERE id = $3 RETURNING *
    `, [audio_filename, transcript, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Note not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
