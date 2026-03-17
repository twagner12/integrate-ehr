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

    const balanceCents = Math.round(parseFloat(invoice.balance) * 100);

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
