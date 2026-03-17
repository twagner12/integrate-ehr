import { Router } from 'express';
import Stripe from 'stripe';
import { db } from '../db/index.js';

const router = Router();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

function requireStripe(req, res, next) {
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env' });
  next();
}

router.use(requireStripe);

// POST /api/payments/checkout/:invoiceId
// Creates a Stripe Checkout Session for paying an invoice
router.post('/checkout/:invoiceId', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        i.*,
        c.full_name AS client_name,
        (SELECT p.email FROM people p
         JOIN client_contacts cc ON cc.person_id = p.id
         WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true
         LIMIT 1) AS billing_email
      FROM invoices i
      JOIN clients c ON c.id = i.client_id
      WHERE i.id = $1
    `, [req.params.invoiceId]);

    if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = rows[0];

    if (invoice.status === 'Paid') {
      return res.status(400).json({ error: 'Invoice is already paid' });
    }

    const balance = parseFloat(invoice.total || 0) - parseFloat(invoice.amount_paid || 0);
    const balanceCents = Math.round(balance * 100);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: invoice.billing_email || undefined,
      payment_method_types: ['us_bank_account', 'card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: balanceCents,
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

    // Store the checkout session ID on the invoice
    await db.query(
      'UPDATE invoices SET stripe_checkout_session_id = $1, updated_at = now() WHERE id = $2',
      [session.id, invoice.id]
    );

    res.json({ url: session.url });
  } catch (err) { next(err); }
});

// GET /api/payments/status/:invoiceId
// Check payment status for an invoice
router.get('/status/:invoiceId', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, status, amount_paid, balance, stripe_payment_intent_id FROM invoices WHERE id = $1',
      [req.params.invoiceId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Helper: get or create Stripe Customer for a client ──────────────────────
async function getOrCreateStripeCustomer(clientId) {
  const { rows } = await db.query(
    'SELECT c.*, p.email, p.first_name AS contact_first, p.last_name AS contact_last, p.phone_primary FROM clients c LEFT JOIN client_contacts cc ON cc.client_id = c.id AND cc.is_responsible_party = true LEFT JOIN people p ON p.id = cc.person_id WHERE c.id = $1',
    [clientId]
  );
  const client = rows[0];
  if (!client) throw new Error('Client not found');

  if (client.stripe_customer_id) {
    return client.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    name: client.contact_first ? `${client.contact_first} ${client.contact_last}` : client.full_name,
    email: client.email || undefined,
    phone: client.phone_primary || undefined,
    metadata: { client_id: String(clientId), client_name: client.full_name },
  });

  await db.query(
    'UPDATE clients SET stripe_customer_id = $1, updated_at = now() WHERE id = $2',
    [customer.id, clientId]
  );

  return customer.id;
}

// POST /api/payments/setup/:clientId
// Creates a Stripe Checkout Session in setup mode to save a card on file
router.post('/setup/:clientId', async (req, res, next) => {
  try {
    const customerId = await getOrCreateStripeCustomer(req.params.clientId);

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card'],
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/clients/${req.params.clientId}?card_saved=1`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/clients/${req.params.clientId}`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Setup card error:', err.message);
    next(err);
  }
});

// GET /api/payments/card/:clientId
// Check if client has a card on file
router.get('/card/:clientId', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT stripe_customer_id FROM clients WHERE id = $1',
      [req.params.clientId]
    );
    if (!rows[0]?.stripe_customer_id) {
      return res.json({ has_card: false });
    }

    const methods = await stripe.customers.listPaymentMethods(
      rows[0].stripe_customer_id, { type: 'card', limit: 1 }
    );

    if (methods.data.length === 0) {
      return res.json({ has_card: false });
    }

    const card = methods.data[0].card;
    res.json({
      has_card: true,
      brand: card.brand,
      last4: card.last4,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
    });
  } catch (err) {
    console.error('Card check error:', err.message);
    // Don't fail the page load if card check fails
    res.json({ has_card: false });
  }
});

// POST /api/payments/charge/:invoiceId
// Charge the card on file for an unpaid invoice
router.post('/charge/:invoiceId', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT i.*, c.stripe_customer_id
      FROM invoices i
      JOIN clients c ON c.id = i.client_id
      WHERE i.id = $1
    `, [req.params.invoiceId]);

    if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = rows[0];

    if (invoice.status === 'Paid') {
      return res.status(400).json({ error: 'Invoice is already paid' });
    }

    if (!invoice.stripe_customer_id) {
      return res.status(400).json({ error: 'No card on file. Send a card setup link first.' });
    }

    // Get the default payment method
    const methods = await stripe.customers.listPaymentMethods(
      invoice.stripe_customer_id, { type: 'card', limit: 1 }
    );

    if (methods.data.length === 0) {
      return res.status(400).json({ error: 'No card on file. Send a card setup link first.' });
    }

    const balance = parseFloat(invoice.total || 0) - parseFloat(invoice.amount_paid || 0);
    const balanceCents = Math.round(balance * 100);

    if (balanceCents <= 0) {
      return res.status(400).json({ error: 'No balance due' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: balanceCents,
      currency: 'usd',
      customer: invoice.stripe_customer_id,
      payment_method: methods.data[0].id,
      off_session: true,
      confirm: true,
      description: `Invoice #${invoice.invoice_number}`,
      metadata: {
        invoice_id: String(invoice.id),
        invoice_number: String(invoice.invoice_number),
      },
    });

    // Mark invoice as paid
    await db.query(`
      UPDATE invoices SET
        status = 'Paid', amount_paid = total,
        stripe_payment_intent_id = $1, paid_at = now(), updated_at = now()
      WHERE id = $2
    `, [paymentIntent.id, invoice.id]);

    // Mark linked appointments as paid
    await db.query(`
      UPDATE appointments SET billing_status = 'Paid', updated_at = now()
      WHERE id IN (
        SELECT appointment_id FROM invoice_items
        WHERE invoice_id = $1 AND appointment_id IS NOT NULL
      )
    `, [invoice.id]);

    res.json({ success: true, payment_intent_id: paymentIntent.id });
  } catch (err) {
    // Handle card declined etc.
    if (err.type === 'StripeCardError') {
      return res.status(400).json({ error: `Card declined: ${err.message}` });
    }
    next(err);
  }
});

export default router;

// ── Webhook handler (mounted separately, needs raw body) ────────────────────
export async function handleStripeWebhook(req, res) {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const invoiceId = session.metadata?.invoice_id
      || (session.payment_intent && await getInvoiceIdFromPI(session.payment_intent));

    if (invoiceId) {
      const amountPaid = (session.amount_total || 0) / 100;
      await db.query(`
        UPDATE invoices SET
          status = 'Paid',
          amount_paid = total,
          stripe_payment_intent_id = $1,
          paid_at = now(),
          updated_at = now()
        WHERE id = $2
      `, [session.payment_intent, invoiceId]);

      // Mark linked appointments as Paid
      await db.query(`
        UPDATE appointments SET billing_status = 'Paid', updated_at = now()
        WHERE id IN (
          SELECT appointment_id FROM invoice_items
          WHERE invoice_id = $1 AND appointment_id IS NOT NULL
        )
      `, [invoiceId]);

      console.log(`Invoice #${invoiceId} marked as paid via Stripe`);
    }
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const invoiceId = pi.metadata?.invoice_id;
    if (invoiceId) {
      console.log(`Payment intent succeeded for invoice #${invoiceId}`);
    }
  }

  res.json({ received: true });
}

async function getInvoiceIdFromPI(paymentIntentId) {
  const { rows } = await db.query(
    'SELECT id FROM invoices WHERE stripe_payment_intent_id = $1 OR stripe_checkout_session_id = $1',
    [paymentIntentId]
  );
  return rows[0]?.id || null;
}
