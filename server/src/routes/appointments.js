import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/appointments?start=2026-03-01&end=2026-03-31&clinician_id=1
router.get('/', async (req, res, next) => {
  try {
    const { start, end, clinician_id } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (start) { params.push(start); conditions.push(`a.starts_at >= $${params.length}`); }
    if (end)   { params.push(end);   conditions.push(`a.starts_at <= $${params.length}`); }
    if (clinician_id) { params.push(clinician_id); conditions.push(`a.clinician_id = $${params.length}`); }

    const { rows } = await db.query(`
      SELECT
        a.*,
        c.full_name AS client_name,
        c.first_name AS client_first_name,
        c.last_name AS client_last_name,
        cl.full_name AS clinician_name,
        cl.first_name AS clinician_first_name,
        cl.last_name AS clinician_last_name,
        s.cpt_code,
        s.description AS service_description,
        s.full_rate,
        s.late_cancel_rate
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN clinicians cl ON cl.id = a.clinician_id
      JOIN services s ON s.id = a.service_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.starts_at ASC
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/appointments/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        a.*,
        c.full_name AS client_name,
        c.id AS client_id,
        cl.full_name AS clinician_name,
        s.cpt_code,
        s.description AS service_description,
        s.full_rate,
        s.late_cancel_rate
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN clinicians cl ON cl.id = a.clinician_id
      JOIN services s ON s.id = a.service_id
      WHERE a.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Appointment not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/appointments
router.post('/', async (req, res, next) => {
  try {
    const {
      client_id, clinician_id, service_id,
      starts_at, ends_at,
      location, memo, status, billing_status,
      // Recurring fields
      is_recurring, recurrence_rule,
    } = req.body;

    // Determine fee from service
    const { rows: svcRows } = await db.query('SELECT full_rate FROM services WHERE id = $1', [service_id]);
    const fee = svcRows[0]?.full_rate ?? 0;

    const { rows } = await db.query(`
      INSERT INTO appointments
        (client_id, clinician_id, service_id, starts_at, ends_at, location, memo,
         status, billing_status, fee, is_recurring, recurrence_rule)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      client_id, clinician_id, service_id,
      starts_at, ends_at,
      location || '1167 Wilmette Ave, Wilmette IL',
      memo || null,
      status || 'Show',
      billing_status || 'Uninvoiced',
      fee,
      is_recurring || false,
      recurrence_rule || null,
    ]);

    // If recurring, generate future instances
    if (is_recurring && recurrence_rule) {
      await generateRecurringInstances(rows[0], recurrence_rule, db);
    }

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/appointments/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const {
      client_id, clinician_id, service_id,
      starts_at, ends_at, location, memo,
      status, billing_status, fee,
    } = req.body;

    // Recalculate fee if status changed (No Show = full, Late Cancel = reduced)
    let resolvedFee = fee;
    if (status && !fee) {
      const { rows: appt } = await db.query(
        `SELECT s.full_rate, s.late_cancel_rate FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.id = $1`,
        [req.params.id]
      );
      if (appt[0]) {
        resolvedFee = status === 'Late Cancel' ? appt[0].late_cancel_rate : appt[0].full_rate;
      }
    }

    const { rows } = await db.query(`
      UPDATE appointments SET
        client_id = COALESCE($1, client_id),
        clinician_id = COALESCE($2, clinician_id),
        service_id = COALESCE($3, service_id),
        starts_at = COALESCE($4, starts_at),
        ends_at = COALESCE($5, ends_at),
        location = COALESCE($6, location),
        memo = COALESCE($7, memo),
        status = COALESCE($8, status),
        billing_status = COALESCE($9, billing_status),
        fee = COALESCE($10, fee),
        updated_at = now()
      WHERE id = $11 RETURNING *
    `, [client_id, clinician_id, service_id, starts_at, ends_at,
        location, memo, status, billing_status, resolvedFee, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Appointment not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/appointments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/appointments/series/:seriesId — all appointments in a recurring series
router.get('/series/:seriesId', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM appointments WHERE series_id = $1 AND starts_at > now() ORDER BY starts_at ASC`,
      [req.params.seriesId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Helper: generate recurring appointment instances
async function generateRecurringInstances(baseAppt, rule, db) {
  const { frequency, interval, days_of_week, ends_after } = rule;
  const instances = [];
  let current = new Date(baseAppt.starts_at);
  const baseEnd = new Date(baseAppt.ends_at);
  const duration = baseEnd - current;
  const seriesId = baseAppt.id; // use first appointment as series anchor
  let count = 0;
  const maxInstances = ends_after || 30;

  while (count < maxInstances - 1) {
    // Advance by interval weeks
    current = new Date(current.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
    const newEnd = new Date(current.getTime() + duration);
    instances.push([
      baseAppt.client_id, baseAppt.clinician_id, baseAppt.service_id,
      current.toISOString(), newEnd.toISOString(),
      baseAppt.location, baseAppt.memo,
      'Show', 'Uninvoiced', baseAppt.fee, true,
      JSON.stringify(rule), seriesId,
    ]);
    count++;
  }

  // Update the base appointment with series_id
  await db.query('UPDATE appointments SET series_id = $1 WHERE id = $2', [seriesId, baseAppt.id]);

  // Bulk insert instances
  for (const inst of instances) {
    await db.query(`
      INSERT INTO appointments
        (client_id, clinician_id, service_id, starts_at, ends_at, location, memo,
         status, billing_status, fee, is_recurring, recurrence_rule, series_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, inst);
  }
}

export default router;
