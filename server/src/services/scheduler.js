import cron from 'node-cron';
import { db } from '../db/index.js';
import { generateSuperbillPdf } from './pdf.js';
import { sendSuperbillEmail } from './email.js';

// Run daily at 7am CT — check if today is the superbill generation day
export function startScheduler() {
  if (!process.env.RESEND_API_KEY) {
    console.log('Scheduler: email not configured, skipping superbill automation');
    return;
  }

  // Every day at 7:00 AM
  cron.schedule('0 7 * * *', async () => {
    try {
      const today = new Date();
      const dayOfMonth = today.getDate();

      const { rows: csRows } = await db.query('SELECT superbill_day FROM clinic_settings LIMIT 1');
      const superbillDay = csRows[0]?.superbill_day || 15;

      if (dayOfMonth !== superbillDay) return;

      console.log(`Scheduler: superbill generation day (${superbillDay}), processing...`);

      // Find all paid invoices from the previous month that haven't had superbills sent
      // We check for invoices paid since the last superbill day
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const { rows: invoices } = await db.query(`
        SELECT i.id, i.invoice_number, i.client_id
        FROM invoices i
        WHERE i.status = 'Paid'
          AND i.paid_at >= $1
          AND i.paid_at < $2
          AND i.superbill_sent_at IS NULL
      `, [lastMonth.toISOString(), thisMonth.toISOString()]);

      if (invoices.length === 0) {
        console.log('Scheduler: no unsent superbills for last month');
        return;
      }

      let sent = 0;
      for (const inv of invoices) {
        try {
          await sendSuperbillForInvoice(inv.id);
          await db.query(
            'UPDATE invoices SET superbill_sent_at = now() WHERE id = $1',
            [inv.id]
          );
          sent++;
        } catch (err) {
          console.error(`Scheduler: failed to send superbill for invoice #${inv.invoice_number}:`, err.message);
        }
      }

      console.log(`Scheduler: sent ${sent}/${invoices.length} superbills`);
    } catch (err) {
      console.error('Scheduler: superbill job failed:', err.message);
    }
  });

  console.log('Scheduler started');
}

async function sendSuperbillForInvoice(invoiceId) {
  const { rows: invRows } = await db.query(`
    SELECT
      i.*,
      c.full_name AS client_name, c.date_of_birth AS client_dob,
      cl.full_name AS clinician_name, cl.npi_number, cl.phone AS clinician_phone, cl.license_number,
      cs.practice_name, cs.address_line1, cs.address_line2, cs.city, cs.state, cs.zip, cs.tax_id, cs.logo_data,
      (SELECT p.first_name || ' ' || p.last_name FROM people p JOIN client_contacts cc ON cc.person_id = p.id WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true LIMIT 1) AS responsible_party_name,
      (SELECT p.email FROM people p JOIN client_contacts cc ON cc.person_id = p.id WHERE cc.client_id = i.client_id AND cc.is_responsible_party = true LIMIT 1) AS responsible_party_email
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
    LEFT JOIN clinicians cl ON cl.id = i.clinician_id
    LEFT JOIN clinic_settings cs ON cs.id = 1
    WHERE i.id = $1
  `, [invoiceId]);

  if (!invRows[0]) return;
  const invoice = invRows[0];

  const billingEmail = invoice.responsible_party_email;
  if (!billingEmail) return;

  const { rows: items } = await db.query(
    'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY service_date ASC',
    [invoiceId]
  );
  invoice.items = items;

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
}
