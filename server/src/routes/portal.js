import { Router } from 'express';
import Stripe from 'stripe';
import { getAuth } from '@clerk/express';
import { db } from '../db/index.js';
import { requireParent } from '../middleware/auth.js';
import { generateInvoicePdf, generateSuperbillPdf } from '../services/pdf.js';

const router = Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// ── Middleware: resolve parent → person → linked clients ─────────────────────
async function resolveParent(req, res, next) {
  const { userId } = getAuth(req);

  // Look up person by clerk_user_id
  const { rows } = await db.query(
    'SELECT * FROM people WHERE clerk_user_id = $1', [userId]
  );

  if (!rows[0]) {
    // Fallback: try matching by Clerk email (for initial setup)
    return res.status(403).json({ error: 'No parent record linked to this account' });
  }

  req.person = rows[0];

  const { rows: links } = await db.query(
    `SELECT cc.client_id, cc.relationship, c.full_name, c.first_name, c.last_name, c.date_of_birth, c.status
     FROM client_contacts cc
     JOIN clients c ON c.id = cc.client_id
     WHERE cc.person_id = $1
     ORDER BY c.full_name`,
    [rows[0].id]
  );

  req.linkedClients = links;
  req.linkedClientIds = links.map(l => l.client_id);

  if (req.linkedClientIds.length === 0) {
    return res.status(403).json({ error: 'No linked clients found' });
  }

  next();
}

// Apply parent auth + resolution to all portal routes
router.use(requireParent);
router.use(resolveParent);

// ── Middleware: check client access ──────────────────────────────────────────
function requireClientAccess(req, res, next) {
  const clientId = parseInt(req.params.clientId);
  if (!req.linkedClientIds.includes(clientId)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  req.clientId = clientId;
  next();
}

// ── GET /api/portal/me ───────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  res.json({
    name: `${req.person.first_name} ${req.person.last_name}`,
    email: req.person.email,
    children: req.linkedClients.map(c => ({
      id: c.client_id,
      full_name: c.full_name,
      first_name: c.first_name,
      last_name: c.last_name,
      date_of_birth: c.date_of_birth,
      relationship: c.relationship,
      status: c.status,
    })),
  });
});

// ── GET /api/portal/settings ─────────────────────────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT practice_name, address_line1, address_line2, city, state, zip, phone, logo_data FROM clinic_settings LIMIT 1');
    res.json(rows[0] || {});
  } catch (err) { next(err); }
});

// ── Client-scoped routes ─────────────────────────────────────────────────────
router.use('/clients/:clientId', requireClientAccess);

// GET /api/portal/clients/:clientId/appointments
router.get('/clients/:clientId/appointments', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        a.id, a.starts_at, a.ends_at, a.status, a.location, a.memo,
        cl.full_name AS clinician_name,
        s.cpt_code, s.description AS service_description, s.duration_minutes
      FROM appointments a
      JOIN clinicians cl ON cl.id = a.clinician_id
      JOIN services s ON s.id = a.service_id
      WHERE a.client_id = $1
        AND a.starts_at >= now()
        AND a.status NOT IN ('Canceled')
      ORDER BY a.starts_at ASC
    `, [req.clientId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/portal/clients/:clientId/balance
router.get('/clients/:clientId/balance', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COALESCE(SUM(total - amount_paid), 0) AS total_balance,
        COUNT(*) FILTER (WHERE status != 'Paid') AS unpaid_count
      FROM invoices
      WHERE client_id = $1 AND status != 'Paid'
    `, [req.clientId]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/portal/clients/:clientId/invoices
router.get('/clients/:clientId/invoices', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        i.id, i.invoice_number, i.issued_date, i.due_date, i.status,
        i.total, i.amount_paid,
        (i.total - i.amount_paid) AS balance,
        cl.full_name AS clinician_name
      FROM invoices i
      LEFT JOIN clinicians cl ON cl.id = i.clinician_id
      WHERE i.client_id = $1
      ORDER BY i.issued_date DESC
    `, [req.clientId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/portal/clients/:clientId/invoices/:id
router.get('/clients/:clientId/invoices/:id', async (req, res, next) => {
  try {
    const { rows: invRows } = await db.query(`
      SELECT
        i.*,
        c.full_name AS client_name, c.date_of_birth AS client_dob,
        cl.full_name AS clinician_name, cl.npi_number, cl.phone AS clinician_phone, cl.license_number,
        cs.practice_name, cs.address_line1, cs.address_line2, cs.city, cs.state, cs.zip, cs.tax_id, cs.logo_data
      FROM invoices i
      JOIN clients c ON c.id = i.client_id
      LEFT JOIN clinicians cl ON cl.id = i.clinician_id
      LEFT JOIN clinic_settings cs ON cs.id = 1
      WHERE i.id = $1 AND i.client_id = $2
    `, [req.params.id, req.clientId]);

    if (!invRows[0]) return res.status(404).json({ error: 'Invoice not found' });

    const { rows: items } = await db.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY service_date ASC',
      [req.params.id]
    );

    res.json({ ...invRows[0], items });
  } catch (err) { next(err); }
});

// GET /api/portal/clients/:clientId/invoices/:id/pdf
router.get('/clients/:clientId/invoices/:id/pdf', async (req, res, next) => {
  try {
    const { rows: invRows } = await db.query(`
      SELECT i.*, c.full_name AS client_name, c.date_of_birth AS client_dob,
        cl.full_name AS clinician_name, cl.npi_number, cl.phone AS clinician_phone, cl.license_number,
        cs.practice_name, cs.address_line1, cs.address_line2, cs.city, cs.state, cs.zip, cs.tax_id, cs.logo_data,
        (SELECT p.first_name || ' ' || p.last_name FROM people p JOIN client_contacts cc ON cc.person_id = p.id WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true LIMIT 1) AS responsible_party_name,
        (SELECT p.phone_primary FROM people p JOIN client_contacts cc ON cc.person_id = p.id WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true LIMIT 1) AS responsible_party_phone,
        (SELECT p.email FROM people p JOIN client_contacts cc ON cc.person_id = p.id WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true LIMIT 1) AS responsible_party_email
      FROM invoices i JOIN clients c ON c.id = i.client_id LEFT JOIN clinicians cl ON cl.id = i.clinician_id LEFT JOIN clinic_settings cs ON cs.id = 1
      WHERE i.id = $1 AND i.client_id = $2
    `, [req.params.id, req.clientId]);

    if (!invRows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = invRows[0];

    const { rows: items } = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY service_date ASC', [req.params.id]);
    invoice.items = items;
    invoice.balance = parseFloat(invoice.total || 0) - parseFloat(invoice.amount_paid || 0);

    const pdfBuffer = await generateInvoicePdf(invoice);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Invoice-${invoice.invoice_number}.pdf"` });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// GET /api/portal/clients/:clientId/superbills
router.get('/clients/:clientId/superbills', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT i.id, i.invoice_number, i.issued_date, i.total, i.amount_paid,
        cl.full_name AS clinician_name
      FROM invoices i
      LEFT JOIN clinicians cl ON cl.id = i.clinician_id
      WHERE i.client_id = $1 AND i.status = 'Paid'
      ORDER BY i.issued_date DESC
    `, [req.clientId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/portal/clients/:clientId/superbills/:invoiceId/pdf
router.get('/clients/:clientId/superbills/:invoiceId/pdf', async (req, res, next) => {
  try {
    const { rows: invRows } = await db.query(`
      SELECT i.*, c.full_name AS client_name, c.date_of_birth AS client_dob,
        cl.full_name AS clinician_name, cl.npi_number, cl.phone AS clinician_phone, cl.license_number,
        cs.practice_name, cs.address_line1, cs.address_line2, cs.city, cs.state, cs.zip, cs.tax_id, cs.logo_data,
        (SELECT p.first_name || ' ' || p.last_name FROM people p JOIN client_contacts cc ON cc.person_id = p.id WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true LIMIT 1) AS responsible_party_name,
        (SELECT p.phone_primary FROM people p JOIN client_contacts cc ON cc.person_id = p.id WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true LIMIT 1) AS responsible_party_phone,
        (SELECT p.email FROM people p JOIN client_contacts cc ON cc.person_id = p.id WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true LIMIT 1) AS responsible_party_email
      FROM invoices i JOIN clients c ON c.id = i.client_id LEFT JOIN clinicians cl ON cl.id = i.clinician_id LEFT JOIN clinic_settings cs ON cs.id = 1
      WHERE i.id = $1 AND i.client_id = $2
    `, [req.params.invoiceId, req.clientId]);

    if (!invRows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = invRows[0];

    const { rows: items } = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY service_date ASC', [req.params.invoiceId]);
    invoice.items = items;

    const { rows: diagnoses } = await db.query(
      'SELECT icd10_code, description FROM diagnoses WHERE client_id = $1 AND removed_at IS NULL ORDER BY created_at ASC',
      [req.clientId]
    );

    const pdfBuffer = await generateSuperbillPdf(invoice, diagnoses);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Superbill-${invoice.invoice_number}.pdf"` });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// GET /api/portal/clients/:clientId/payments
router.get('/clients/:clientId/payments', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT i.id, i.invoice_number, i.total, i.amount_paid, i.paid_at,
        i.stripe_payment_intent_id
      FROM invoices i
      WHERE i.client_id = $1 AND i.status = 'Paid' AND i.paid_at IS NOT NULL
      ORDER BY i.paid_at DESC
    `, [req.clientId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/portal/clients/:clientId/card
router.get('/clients/:clientId/card', async (req, res, next) => {
  try {
    if (!stripe) return res.json({ has_card: false });

    const { rows } = await db.query('SELECT stripe_customer_id FROM clients WHERE id = $1', [req.clientId]);
    if (!rows[0]?.stripe_customer_id) return res.json({ has_card: false });

    const methods = await stripe.customers.listPaymentMethods(rows[0].stripe_customer_id, { type: 'card', limit: 1 });
    if (methods.data.length === 0) return res.json({ has_card: false });

    const card = methods.data[0].card;
    res.json({ has_card: true, brand: card.brand, last4: card.last4, exp_month: card.exp_month, exp_year: card.exp_year });
  } catch (err) {
    res.json({ has_card: false });
  }
});

// POST /api/portal/clients/:clientId/card/setup
router.post('/clients/:clientId/card/setup', async (req, res, next) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

    // Get or create Stripe customer
    const { rows } = await db.query('SELECT stripe_customer_id FROM clients WHERE id = $1', [req.clientId]);
    let customerId = rows[0]?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: `${req.person.first_name} ${req.person.last_name}`,
        email: req.person.email,
        metadata: { client_id: String(req.clientId) },
      });
      customerId = customer.id;
      await db.query('UPDATE clients SET stripe_customer_id = $1, updated_at = now() WHERE id = $2', [customerId, req.clientId]);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card'],
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/portal/${req.clientId}/billing?card_saved=1`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/portal/${req.clientId}/billing`,
    });

    res.json({ url: session.url });
  } catch (err) { next(err); }
});

// POST /api/portal/clients/:clientId/pay/:invoiceId
router.post('/clients/:clientId/pay/:invoiceId', async (req, res, next) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

    const { rows } = await db.query(`
      SELECT i.*, c.full_name AS client_name
      FROM invoices i JOIN clients c ON c.id = i.client_id
      WHERE i.id = $1 AND i.client_id = $2
    `, [req.params.invoiceId, req.clientId]);

    if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = rows[0];
    if (invoice.status === 'Paid') return res.status(400).json({ error: 'Invoice is already paid' });

    const balance = parseFloat(invoice.total || 0) - parseFloat(invoice.amount_paid || 0);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: req.person.email,
      payment_method_types: ['us_bank_account', 'card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(balance * 100),
          product_data: {
            name: `Invoice #${invoice.invoice_number}`,
            description: `Integrate Language & Literacy — ${invoice.client_name}`,
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        metadata: { invoice_id: String(invoice.id), invoice_number: String(invoice.invoice_number) },
      },
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/portal/${req.clientId}/billing?paid=1`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/portal/${req.clientId}/billing`,
    });

    await db.query('UPDATE invoices SET stripe_checkout_session_id = $1, updated_at = now() WHERE id = $2', [session.id, invoice.id]);
    res.json({ url: session.url });
  } catch (err) { next(err); }
});

export default router;
