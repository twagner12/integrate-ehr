import { Router } from 'express';
import { db } from '../db/index.js';
import pool from '../db/index.js';

const router = Router();

// ── GET /api/invoices ─────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { status, client_id, clinician_id } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (status)      { params.push(status);      conditions.push(`i.status = $${params.length}`); }
    if (client_id)   { params.push(client_id);   conditions.push(`i.client_id = $${params.length}`); }
    if (clinician_id){ params.push(clinician_id); conditions.push(`i.clinician_id = $${params.length}`); }

    const { rows } = await db.query(`
      SELECT
        i.*,
        c.full_name  AS client_name,
        cl.full_name AS clinician_name,
        (SELECT p.first_name || ' ' || p.last_name FROM people p
         JOIN client_contacts cc ON cc.person_id = p.id
         WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true
         LIMIT 1) AS responsible_party_name
      FROM invoices i
      JOIN clients c  ON c.id  = i.client_id
      LEFT JOIN clinicians cl ON cl.id = i.clinician_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.issued_date DESC, i.invoice_number DESC
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/invoices/preview ─────────────────────────────────────────────────
router.get('/preview', async (req, res, next) => {
  try {
    const { start, end, client_id } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end are required' });

    const { rows } = await db.query(`
      SELECT
        a.id,
        a.starts_at,
        a.fee,
        a.status,
        a.billing_status,
        a.client_id,
        c.full_name  AS client_name,
        a.clinician_id,
        cl.full_name AS clinician_name,
        s.cpt_code,
        s.description AS service_description
      FROM appointments a
      JOIN clients    c  ON c.id  = a.client_id
      JOIN clinicians cl ON cl.id = a.clinician_id
      JOIN services   s  ON s.id  = a.service_id
      WHERE a.starts_at >= $1
        AND a.starts_at <= $2
        AND a.status    IN ('Show', 'No Show', 'Late Cancel')
        AND a.billing_status = 'Uninvoiced'
        ${client_id ? `AND a.client_id = ${parseInt(client_id)}` : ''}
      ORDER BY c.last_name ASC, a.starts_at ASC
    `, [start, end + 'T23:59:59']);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/invoices/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { rows: invRows } = await db.query(`
      SELECT
        i.*,
        c.full_name        AS client_name,
        c.date_of_birth    AS client_dob,
        cl.full_name       AS clinician_name,
        cl.npi_number,
        cl.phone           AS clinician_phone,
        cl.license_number,
        cs.practice_name,
        cs.address_line1,
        cs.address_line2,
        cs.city,
        cs.state,
        cs.zip,
        cs.tax_id,
        cs.logo_data,
        (SELECT p.first_name || ' ' || p.last_name FROM people p
         JOIN client_contacts cc ON cc.person_id = p.id
         WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true LIMIT 1
        ) AS responsible_party_name,
        (SELECT p.phone_primary FROM people p
         JOIN client_contacts cc ON cc.person_id = p.id
         WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true LIMIT 1
        ) AS responsible_party_phone,
        (SELECT p.email FROM people p
         JOIN client_contacts cc ON cc.person_id = p.id
         WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true LIMIT 1
        ) AS responsible_party_email
      FROM invoices i
      JOIN clients         c   ON c.id  = i.client_id
      LEFT JOIN clinicians cl  ON cl.id = i.clinician_id
      LEFT JOIN clinic_settings cs ON cs.id = 1
      WHERE i.id = $1
    `, [req.params.id]);

    if (!invRows[0]) return res.status(404).json({ error: 'Invoice not found' });

    const { rows: items } = await db.query(`
      SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY service_date ASC
    `, [req.params.id]);

    res.json({ ...invRows[0], items });
  } catch (err) { next(err); }
});

// ── POST /api/invoices/generate ───────────────────────────────────────────────
router.post('/generate', async (req, res, next) => {
  const pgClient = await pool.connect();
  try {
    await pgClient.query('BEGIN');

    const { client_id, clinician_id, issued_date, due_date, notes, line_items } = req.body;
    if (!client_id || !line_items?.length) {
      return res.status(400).json({ error: 'client_id and line_items are required' });
    }

    const { rows: csRows } = await pgClient.query('SELECT * FROM clinic_settings LIMIT 1');
    const cs = csRows[0] || {};
    const footer = cs.invoice_footer || 'Make Payments to: Anna Wagner Inc.';

    const issuedDate = issued_date || new Date().toISOString().split('T')[0];
    const dueDays    = cs.invoice_due_days || 15;
    let dueDateFinal = due_date;
    if (!dueDateFinal) {
      const d = new Date(issuedDate);
      d.setDate(d.getDate() + dueDays);
      dueDateFinal = d.toISOString().split('T')[0];
    }

    const subtotal = line_items.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

    const { rows: seqRows } = await pgClient.query(`SELECT nextval('invoice_number_seq') AS num`);
    const invoiceNumber = parseInt(seqRows[0].num);

    const { rows: invRows } = await pgClient.query(`
      INSERT INTO invoices
        (invoice_number, client_id, clinician_id, issued_date, due_date,
         status, subtotal, total, footer_text, notes)
      VALUES ($1,$2,$3,$4,$5,'Sent',$6,$7,$8,$9)
      RETURNING *
    `, [invoiceNumber, client_id, clinician_id || null, issuedDate, dueDateFinal,
        subtotal, subtotal, footer, notes || null]);

    const invoice = invRows[0];

    const apptIds = [];
    for (const item of line_items) {
      await pgClient.query(`
        INSERT INTO invoice_items
          (invoice_id, appointment_id, service_date, description, amount, is_no_show)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [invoice.id, item.appointment_id || null, item.service_date,
          item.description, item.amount, item.is_no_show || false]);
      if (item.appointment_id) apptIds.push(item.appointment_id);
    }

    if (apptIds.length) {
      await pgClient.query(`
        UPDATE appointments SET billing_status = 'Invoiced', updated_at = now()
        WHERE id = ANY($1)
      `, [apptIds]);
    }

    await pgClient.query('COMMIT');
    res.status(201).json(invoice);
  } catch (err) {
    await pgClient.query('ROLLBACK');
    next(err);
  } finally {
    pgClient.release();
  }
});

// ── PATCH /api/invoices/:id ───────────────────────────────────────────────────
router.patch('/:id', async (req, res, next) => {
  const pgClient = await pool.connect();
  try {
    await pgClient.query('BEGIN');
    const { status, amount_paid, issued_date, due_date, notes, line_items } = req.body;
    const id = req.params.id;

    if (line_items) {
      const subtotal = line_items.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

      // Get old appointment IDs before deleting
      const { rows: oldItems } = await pgClient.query(
        'SELECT appointment_id FROM invoice_items WHERE invoice_id = $1 AND appointment_id IS NOT NULL', [id]
      );
      const oldApptIds = oldItems.map(r => r.appointment_id);
      const newApptIds = line_items.map(i => i.appointment_id).filter(Boolean);
      const removedApptIds = oldApptIds.filter(aid => !newApptIds.includes(aid));

      // Un-invoice removed appointments
      if (removedApptIds.length) {
        await pgClient.query(
          `UPDATE appointments SET billing_status = 'Uninvoiced' WHERE id = ANY($1)`,
          [removedApptIds]
        );
      }

      await pgClient.query(`
        UPDATE invoices SET
          issued_date = COALESCE($1, issued_date),
          due_date    = COALESCE($2, due_date),
          notes       = $3,
          subtotal    = $4,
          total       = $4,
          updated_at  = now()
        WHERE id = $5
      `, [issued_date, due_date, notes || null, subtotal, id]);

      await pgClient.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);

      for (const item of line_items) {
        await pgClient.query(`
          INSERT INTO invoice_items (invoice_id, appointment_id, service_date, description, amount)
          VALUES ($1, $2, $3, $4, $5)
        `, [id, item.appointment_id || null, item.service_date, item.description, item.amount]);
      }
    } else {
      await pgClient.query(`
        UPDATE invoices SET
          status      = COALESCE($1, status),
          amount_paid = COALESCE($2, amount_paid),
          updated_at  = now()
        WHERE id = $3
      `, [status, amount_paid, id]);
    }

    await pgClient.query('COMMIT');
    const { rows } = await db.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json(rows[0]);
  } catch (err) { await pgClient.query('ROLLBACK'); next(err); }
  finally { pgClient.release(); }
});

// ── DELETE /api/invoices/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  const pgClient = await pool.connect();
  try {
    await pgClient.query('BEGIN');
    const id = req.params.id;

    await pgClient.query(`
      UPDATE appointments SET billing_status = 'Uninvoiced'
      WHERE id IN (
        SELECT appointment_id FROM invoice_items
        WHERE invoice_id = $1 AND appointment_id IS NOT NULL
      )
    `, [id]);

    await pgClient.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
    const { rows } = await pgClient.query('DELETE FROM invoices WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) { await pgClient.query('ROLLBACK'); return res.status(404).json({ error: 'Invoice not found' }); }

    await pgClient.query('COMMIT');
    res.json({ deleted: true });
  } catch (err) { await pgClient.query('ROLLBACK'); next(err); }
  finally { pgClient.release(); }
});

export default router;
