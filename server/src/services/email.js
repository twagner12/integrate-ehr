import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'billing@integrateliteracy.com';
const FROM_NAME = process.env.RESEND_FROM_NAME || 'Integrate Language & Literacy';

function requireResend() {
  if (!resend) {
    throw new Error('Email is not configured. Set RESEND_API_KEY in .env');
  }
}

export async function sendInvoiceEmail({ to, parentName, clientName, invoice, paymentUrl, invoicePdf }) {
  requireResend();

  const balance = parseFloat(invoice.total || 0) - parseFloat(invoice.amount_paid || 0);
  const fmtBalance = `$${balance.toFixed(2)}`;
  const dueDate = new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  const { data, error } = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to,
    subject: `Invoice #${invoice.invoice_number} for ${clientName}`,
    text: [
      `Hi ${parentName},`,
      '',
      `Please find attached Invoice #${invoice.invoice_number} for ${clientName}'s speech-language services.`,
      '',
      `Amount due: ${fmtBalance}`,
      `Due date: ${dueDate}`,
      '',
      paymentUrl ? `Pay online: ${paymentUrl}` : '',
      '',
      'Thank you,',
      FROM_NAME,
    ].filter(Boolean).join('\n'),
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <div style="padding: 32px 0; border-bottom: 1px solid #e5e7eb;">
          <h2 style="margin: 0 0 4px; font-size: 20px;">Invoice #${invoice.invoice_number}</h2>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">For ${clientName}'s speech-language services</p>
        </div>

        <div style="padding: 24px 0;">
          <p style="margin: 0 0 16px;">Hi ${parentName},</p>
          <p style="margin: 0 0 24px;">Please find your invoice attached.</p>

          <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
              <tr>
                <td style="color: #6b7280; padding-bottom: 8px;">Amount due</td>
                <td style="text-align: right; font-weight: bold; font-size: 18px; padding-bottom: 8px;">${fmtBalance}</td>
              </tr>
              <tr>
                <td style="color: #6b7280;">Due date</td>
                <td style="text-align: right;">${dueDate}</td>
              </tr>
            </table>
          </div>

          ${paymentUrl ? `
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${paymentUrl}" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 15px;">Pay Now</a>
          </div>
          <p style="text-align: center; color: #9ca3af; font-size: 12px; margin: 0;">ACH bank transfer and credit card accepted</p>
          ` : ''}
        </div>

        <div style="padding: 16px 0; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">${FROM_NAME}</p>
        </div>
      </div>
    `,
    attachments: [
      {
        content: invoicePdf,
        filename: `Invoice-${invoice.invoice_number}.pdf`,
      },
    ],
  });

  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
}

export async function sendSuperbillEmail({ to, parentName, clientName, invoice, superbillPdf }) {
  requireResend();

  const fmtTotal = `$${parseFloat(invoice.total || 0).toFixed(2)}`;

  const { data, error } = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to,
    subject: `Statement for Insurance Reimbursement — ${clientName}`,
    text: [
      `Hi ${parentName},`,
      '',
      `Thank you for your payment of ${fmtTotal} for Invoice #${invoice.invoice_number}.`,
      '',
      `Attached is your Statement for Insurance Reimbursement (superbill) for ${clientName}'s speech-language services. You can submit this to your insurance provider for reimbursement.`,
      '',
      'Thank you,',
      FROM_NAME,
    ].join('\n'),
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <div style="padding: 32px 0; border-bottom: 1px solid #e5e7eb;">
          <h2 style="margin: 0 0 4px; font-size: 20px;">Statement for Insurance Reimbursement</h2>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">For ${clientName}'s speech-language services</p>
        </div>

        <div style="padding: 24px 0;">
          <p style="margin: 0 0 16px;">Hi ${parentName},</p>
          <p style="margin: 0 0 16px;">Thank you for your payment of <strong>${fmtTotal}</strong> for Invoice #${invoice.invoice_number}.</p>
          <p style="margin: 0 0 24px;">Attached is your Statement for Insurance Reimbursement (superbill). You can submit this to your insurance provider for reimbursement.</p>
        </div>

        <div style="padding: 16px 0; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">${FROM_NAME}</p>
        </div>
      </div>
    `,
    attachments: [
      {
        content: superbillPdf,
        filename: `Superbill-${invoice.invoice_number}.pdf`,
      },
    ],
  });

  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
}
