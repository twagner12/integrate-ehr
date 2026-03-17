import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/clients
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        c.id, c.full_name, c.first_name, c.last_name, c.preferred_name,
        c.date_of_birth, c.status, c.location, c.created_at,
        cl.full_name AS primary_clinician,
        EXTRACT(YEAR FROM AGE(c.date_of_birth))::int AS age,
        (
          SELECT starts_at FROM appointments a
          WHERE a.client_id = c.id AND a.starts_at > now() AND a.status != 'Canceled'
          ORDER BY a.starts_at ASC LIMIT 1
        ) AS next_appointment,
        (
          SELECT COALESCE(SUM(a2.fee), 0) FROM appointments a2
          WHERE a2.client_id = c.id AND a2.billing_status = 'Uninvoiced' AND a2.status != 'Canceled'
        ) AS uninvoiced_amount
      FROM clients c
      LEFT JOIN clinicians cl ON cl.id = c.primary_clinician_id
      ORDER BY c.last_name ASC, c.first_name ASC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/clients/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [clientResult, contacts, diagnoses, appointments] = await Promise.all([
      db.query(`
        SELECT c.*, cl.full_name AS primary_clinician_name,
          EXTRACT(YEAR FROM AGE(c.date_of_birth))::int AS age
        FROM clients c
        LEFT JOIN clinicians cl ON cl.id = c.primary_clinician_id
        WHERE c.id = $1
      `, [id]),
      db.query(`
        SELECT
          cc.id AS link_id, cc.relationship, cc.is_responsible_party,
          cc.reminder_appointment_email, cc.reminder_appointment_text,
          cc.reminder_cancellation_email, cc.reminder_cancellation_text,
          p.id, p.first_name, p.last_name, p.phone_primary, p.phone_secondary, p.email
        FROM client_contacts cc
        JOIN people p ON p.id = cc.person_id
        WHERE cc.client_id = $1
        ORDER BY cc.is_responsible_party DESC, cc.id ASC
      `, [id]),
      db.query(`SELECT * FROM diagnoses WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1`, [id]),
      db.query(`
        SELECT a.*, cl.full_name AS clinician_name, s.cpt_code, s.description AS service_description,
          n.id AS note_id, n.subjective, n.objective, n.assessment, n.plan AS note_plan,
          n.is_finalized, n.finalized_at, n.unlocked_at,
          n.created_at AS note_created_at, n.updated_at AS note_updated_at
        FROM appointments a
        JOIN clinicians cl ON cl.id = a.clinician_id
        JOIN services s ON s.id = a.service_id
        LEFT JOIN notes n ON n.appointment_id = a.id
        WHERE a.client_id = $1
        ORDER BY a.starts_at DESC LIMIT 50
      `, [id]),
    ]);
    if (!clientResult.rows[0]) return res.status(404).json({ error: 'Client not found' });
    res.json({
      ...clientResult.rows[0],
      contacts: contacts.rows,
      diagnosis: diagnoses.rows[0] || null,
      appointments: appointments.rows,
    });
  } catch (err) { next(err); }
});

// POST /api/clients
router.post('/', async (req, res, next) => {
  try {
    const { first_name, last_name, preferred_name, full_name, date_of_birth, status, primary_clinician_id, location, admin_notes } = req.body;
    const { rows } = await db.query(`
      INSERT INTO clients (first_name, last_name, preferred_name, full_name, date_of_birth, status, primary_clinician_id, location, admin_notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [first_name, last_name, preferred_name || null, full_name || `${first_name} ${last_name}`,
        date_of_birth || null, status || 'Active', primary_clinician_id || null,
        location || 'In-person', admin_notes || null]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/clients/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, preferred_name, full_name, date_of_birth, status, primary_clinician_id, location, admin_notes } = req.body;
    const { rows } = await db.query(`
      UPDATE clients SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        preferred_name = COALESCE($3, preferred_name),
        full_name = COALESCE($4, full_name),
        date_of_birth = COALESCE($5, date_of_birth),
        status = COALESCE($6, status),
        primary_clinician_id = COALESCE($7, primary_clinician_id),
        location = COALESCE($8, location),
        admin_notes = COALESCE($9, admin_notes),
        updated_at = now()
      WHERE id = $10 RETURNING *
    `, [first_name, last_name, preferred_name, full_name, date_of_birth, status,
        primary_clinician_id, location, admin_notes, id]);
    if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/clients/:id/contacts
router.get('/:id/contacts', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        cc.id AS link_id, cc.relationship, cc.is_responsible_party,
        cc.reminder_appointment_email, cc.reminder_appointment_text,
        cc.reminder_cancellation_email, cc.reminder_cancellation_text,
        p.id, p.first_name, p.last_name, p.phone_primary, p.phone_secondary, p.email
      FROM client_contacts cc
      JOIN people p ON p.id = cc.person_id
      WHERE cc.client_id = $1
      ORDER BY cc.is_responsible_party DESC, cc.id ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/clients/:id/contacts
router.post('/:id/contacts', async (req, res, next) => {
  try {
    const { person_id, relationship, is_responsible_party,
      reminder_appointment_email, reminder_appointment_text,
      reminder_cancellation_email, reminder_cancellation_text } = req.body;

    // Only one billing party allowed — clear others first
    if (is_responsible_party === true) {
      await db.query(
        'UPDATE client_contacts SET is_responsible_party = false WHERE client_id = $1',
        [req.params.id]
      );
    }

    const { rows } = await db.query(`
      INSERT INTO client_contacts
        (client_id, person_id, relationship, is_responsible_party,
         reminder_appointment_email, reminder_appointment_text,
         reminder_cancellation_email, reminder_cancellation_text)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (client_id, person_id) DO UPDATE SET
        relationship = EXCLUDED.relationship,
        is_responsible_party = EXCLUDED.is_responsible_party
      RETURNING *
    `, [req.params.id, person_id, relationship, is_responsible_party ?? false,
        reminder_appointment_email ?? true, reminder_appointment_text ?? false,
        reminder_cancellation_email ?? true, reminder_cancellation_text ?? false]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/clients/:id/contacts/:linkId
router.patch('/:id/contacts/:linkId', async (req, res, next) => {
  try {
    const { relationship, is_responsible_party,
      reminder_appointment_email, reminder_appointment_text,
      reminder_cancellation_email, reminder_cancellation_text } = req.body;

    // Only one billing party allowed — clear others first
    if (is_responsible_party === true) {
      await db.query(
        'UPDATE client_contacts SET is_responsible_party = false WHERE client_id = $1 AND id != $2',
        [req.params.id, req.params.linkId]
      );
    }

    const { rows } = await db.query(`
      UPDATE client_contacts SET
        relationship = COALESCE($1, relationship),
        is_responsible_party = COALESCE($2, is_responsible_party),
        reminder_appointment_email = COALESCE($3, reminder_appointment_email),
        reminder_appointment_text = COALESCE($4, reminder_appointment_text),
        reminder_cancellation_email = COALESCE($5, reminder_cancellation_email),
        reminder_cancellation_text = COALESCE($6, reminder_cancellation_text)
      WHERE id = $7 AND client_id = $8 RETURNING *
    `, [relationship, is_responsible_party,
        reminder_appointment_email, reminder_appointment_text,
        reminder_cancellation_email, reminder_cancellation_text,
        req.params.linkId, req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/clients/:id/contacts/:linkId
router.delete('/:id/contacts/:linkId', async (req, res, next) => {
  try {
    await db.query(
      'DELETE FROM client_contacts WHERE id = $1 AND client_id = $2',
      [req.params.linkId, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
