import { Router } from 'express';
import Stripe from 'stripe';
import { db } from '../db/index.js';
import pool from '../db/index.js';
import { generateInvoicePdf, generateSuperbillPdf } from '../services/pdf.js';
import { sendInvoiceEmail, sendSuperbillEmail } from '../services/email.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

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
        ${client_id ? `AND a.client_id = $3` : ''}
      ORDER BY c.last_name ASC, a.starts_at ASC
    `, client_id ? [start, end + 'T23:59:59', client_id] : [start, end + 'T23:59:59']);
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
          (invoice_id, appointment_id, service_date, description, amount, is_no_show, cpt_code)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [invoice.id, item.appointment_id || null, item.service_date,
          item.description, item.amount, item.is_no_show || false, item.cpt_code || null]);
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

// ── POST /api/invoices/generate-batch ────────────────────────────────────────
// Accepts selected appointment IDs, groups by client, creates one invoice per client
router.post('/generate-batch', async (req, res, next) => {
  const pgClient = await pool.connect();
  try {
    await pgClient.query('BEGIN');

    const { appointment_ids } = req.body;
    if (!appointment_ids?.length) {
      return res.status(400).json({ error: 'appointment_ids is required' });
    }

    // Fetch all selected appointments with service + clinician info
    const { rows: appointments } = await pgClient.query(`
      SELECT
        a.id, a.client_id, a.clinician_id, a.starts_at, a.fee, a.status,
        s.cpt_code, s.description AS service_description,
        cl.full_name AS clinician_name
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      JOIN clinicians cl ON cl.id = a.clinician_id
      WHERE a.id = ANY($1)
        AND a.billing_status = 'Uninvoiced'
        AND a.status IN ('Show', 'No Show', 'Late Cancel')
      ORDER BY a.starts_at ASC
    `, [appointment_ids]);

    if (!appointments.length) {
      await pgClient.query('ROLLBACK');
      return res.status(400).json({ error: 'No eligible uninvoiced appointments found' });
    }

    // Group by client
    const byClient = {};
    for (const a of appointments) {
      if (!byClient[a.client_id]) byClient[a.client_id] = [];
      byClient[a.client_id].push(a);
    }

    const { rows: csRows } = await pgClient.query('SELECT * FROM clinic_settings LIMIT 1');
    const cs = csRows[0] || {};
    const footer = cs.invoice_footer || 'Make Payments to: Anna Wagner Inc.';
    const dueDays = cs.invoice_due_days || 15;
    const issuedDate = new Date().toISOString().split('T')[0];
    const dueD = new Date();
    dueD.setDate(dueD.getDate() + dueDays);
    const dueDate = dueD.toISOString().split('T')[0];

    const created = [];

    for (const [clientId, appts] of Object.entries(byClient)) {
      // Use the most common clinician for this batch as the invoice provider
      const clinicianCounts = {};
      for (const a of appts) {
        clinicianCounts[a.clinician_id] = (clinicianCounts[a.clinician_id] || 0) + 1;
      }
      const clinicianId = Object.entries(clinicianCounts).sort((a, b) => b[1] - a[1])[0][0];

      const subtotal = appts.reduce((sum, a) => sum + parseFloat(a.fee || 0), 0);

      const { rows: seqRows } = await pgClient.query(`SELECT nextval('invoice_number_seq') AS num`);
      const invoiceNumber = parseInt(seqRows[0].num);

      const { rows: invRows } = await pgClient.query(`
        INSERT INTO invoices
          (invoice_number, client_id, clinician_id, issued_date, due_date,
           status, subtotal, total, footer_text)
        VALUES ($1,$2,$3,$4,$5,'Sent',$6,$7,$8)
        RETURNING *
      `, [invoiceNumber, clientId, clinicianId, issuedDate, dueDate,
          subtotal, subtotal, footer]);

      const invoice = invRows[0];
      const apptIds = [];

      for (const a of appts) {
        const desc = `${a.service_description} (${a.cpt_code}) with ${a.clinician_name}${a.status === 'No Show' ? ' — No Show' : ''}`;
        await pgClient.query(`
          INSERT INTO invoice_items
            (invoice_id, appointment_id, service_date, description, amount, is_no_show, cpt_code)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [invoice.id, a.id, a.starts_at.toISOString().split('T')[0],
            desc, a.fee, a.status === 'No Show', a.cpt_code || null]);
        apptIds.push(a.id);
      }

      await pgClient.query(`
        UPDATE appointments SET billing_status = 'Invoiced', updated_at = now()
        WHERE id = ANY($1)
      `, [apptIds]);

      created.push(invoice);
    }

    await pgClient.query('COMMIT');
    res.status(201).json({ invoices: created, count: created.length });
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

// ── Shared: fetch full invoice data ───────────────────────────────────────────
async function getFullInvoice(invoiceId) {
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
  `, [invoiceId]);

  if (!invRows[0]) return null;
  const invoice = invRows[0];

  const { rows: items } = await db.query(
    'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY service_date ASC',
    [invoiceId]
  );
  invoice.items = items;
  invoice.balance = parseFloat(invoice.total || 0) - parseFloat(invoice.amount_paid || 0);

  return invoice;
}

// ── Shared: send superbill after payment ─────────────────────────────────────
export async function sendSuperbillForInvoice(invoiceId) {
  if (!process.env.RESEND_API_KEY) return;

  const invoice = await getFullInvoice(invoiceId);
  if (!invoice) return;

  const billingEmail = invoice.responsible_party_email;
  if (!billingEmail) return;

  const { rows: diagnoses } = await db.query(
    'SELECT icd10_code, description FROM diagnoses WHERE client_id = $1 AND removed_at IS NULL ORDER BY created_at ASC',
    [invoice.client_id]
  );

  if (diagnoses.length === 0) return;

  const superbillPdf = await generateSuperbillPdf(invoice, diagnoses);
  const parentName = invoice.responsible_party_name || invoice.client_name;

  await sendSuperbillEmail({
    to: billingEmail,
    parentName,
    clientName: invoice.client_name,
    invoice,
    superbillPdf,
  });

  console.log(`Superbill emailed for invoice #${invoice.invoice_number} to ${billingEmail}`);
}

// ── POST /api/invoices/:id/send ───────────────────────────────────────────────
router.post('/:id/send', async (req, res, next) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ error: 'Email is not configured. Set RESEND_API_KEY in .env' });
    }

    const invoice = await getFullInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const billingEmail = invoice.responsible_party_email;
    if (!billingEmail) {
      return res.status(400).json({ error: 'No email on file for the responsible party' });
    }

    // Generate invoice PDF
    const invoicePdf = await generateInvoicePdf(invoice);

    // Create a Stripe Checkout payment link (if Stripe is configured and invoice is unpaid)
    let paymentUrl = null;
    if (stripe && invoice.status !== 'Paid' && invoice.balance > 0) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: billingEmail,
        payment_method_types: ['us_bank_account', 'card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(invoice.balance * 100),
            product_data: {
              name: `Invoice #${invoice.invoice_number}`,
              description: `Integrate Language & Literacy — ${invoice.client_name}`,
            },
          },
          quantity: 1,
        }],
        payment_intent_data: {
          metadata: {
            invoice_id: String(invoice.id),
            invoice_number: String(invoice.invoice_number),
          },
        },
        success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/invoices/${invoice.id}?paid=1`,
        cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/invoices/${invoice.id}`,
      });
      paymentUrl = session.url;

      await db.query(
        'UPDATE invoices SET stripe_checkout_session_id = $1, updated_at = now() WHERE id = $2',
        [session.id, invoice.id]
      );
    }

    // Send invoice email (no superbill — that comes after payment)
    const parentName = invoice.responsible_party_name || invoice.client_name;
    await sendInvoiceEmail({
      to: billingEmail,
      parentName,
      clientName: invoice.client_name,
      invoice,
      paymentUrl,
      invoicePdf,
    });

    // Update invoice status to Sent if it was Draft
    if (invoice.status === 'Draft') {
      await db.query(
        "UPDATE invoices SET status = 'Sent', updated_at = now() WHERE id = $1",
        [invoice.id]
      );
    }

    res.json({ success: true, sent_to: billingEmail });
  } catch (err) { next(err); }
});

// ── POST /api/invoices/:id/send-superbill ────────────────────────────────────
router.post('/:id/send-superbill', async (req, res, next) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ error: 'Email is not configured. Set RESEND_API_KEY in .env' });
    }

    const invoice = await getFullInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const billingEmail = invoice.responsible_party_email;
    if (!billingEmail) {
      return res.status(400).json({ error: 'No email on file for the responsible party' });
    }

    const { rows: diagnoses } = await db.query(
      'SELECT icd10_code, description FROM diagnoses WHERE client_id = $1 AND removed_at IS NULL ORDER BY created_at ASC',
      [invoice.client_id]
    );

    if (diagnoses.length === 0) {
      return res.status(400).json({ error: 'No diagnoses on file for this client' });
    }

    const superbillPdf = await generateSuperbillPdf(invoice, diagnoses);
    const parentName = invoice.responsible_party_name || invoice.client_name;

    await sendSuperbillEmail({
      to: billingEmail,
      parentName,
      clientName: invoice.client_name,
      invoice,
      superbillPdf,
    });

    res.json({ success: true, sent_to: billingEmail });
  } catch (err) { next(err); }
});

export default router;
