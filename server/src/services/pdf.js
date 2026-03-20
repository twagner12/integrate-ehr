import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const fmt = (a) => `$${parseFloat(a || 0).toFixed(2)}`;
const fmtNum = (a) => parseFloat(a || 0).toFixed(2);
const fmtDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
};
const fmtPhone = (v) => {
  if (!v) return '';
  const d = v.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return v;
};

const h = React.createElement;

// ── Invoice PDF ────────────────────────────────────────────────────────────────

const inv = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: '#1f2937' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  fromLabel: { fontSize: 9, color: '#6b7280', marginBottom: 2 },
  practiceName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  practiceAddr: { fontSize: 9, color: '#4b5563' },
  logo: { height: 40, objectFit: 'contain' },
  paidStamp: { borderWidth: 2.5, borderColor: '#22c55e', borderRadius: 4, paddingHorizontal: 18, paddingVertical: 6, alignSelf: 'flex-start' },
  paidText: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#22c55e', letterSpacing: 3 },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 20 },
  infoSection: { flexDirection: 'row', marginBottom: 24 },
  infoLeft: { flex: 1 },
  infoRight: { flex: 1 },
  infoLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginTop: 12, marginBottom: 3 },
  infoLabelFirst: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginBottom: 3 },
  infoValue: { fontSize: 10, color: '#1f2937' },
  infoSub: { fontSize: 9, color: '#4b5563', marginTop: 1 },
  tableHeader: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#9ca3af', paddingVertical: 6, marginBottom: 2 },
  th: { fontSize: 9, color: '#4b5563' },
  row: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.5, borderColor: '#e5e7eb' },
  dateCol: { width: 80 },
  descCol: { flex: 1, paddingRight: 12 },
  amtCol: { width: 70, textAlign: 'right' },
  totals: { alignItems: 'flex-end', marginTop: 12 },
  totalRow: { flexDirection: 'row', width: 200, justifyContent: 'flex-end', marginBottom: 4 },
  totalLabel: { width: 100, textAlign: 'right', paddingRight: 12, color: '#4b5563', fontSize: 10 },
  totalValue: { width: 80, textAlign: 'right', fontSize: 10 },
  totalDivider: { borderTopWidth: 1, borderColor: '#9ca3af', paddingTop: 4, marginTop: 2 },
  balanceLabel: { width: 100, textAlign: 'right', paddingRight: 12, fontSize: 13, fontFamily: 'Helvetica-Bold' },
  balanceValue: { width: 80, textAlign: 'right', fontSize: 13, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 48, left: 48, right: 48 },
  footerText: { fontSize: 9, color: '#4b5563' },
});

function InvoiceDocument({ invoice }) {
  const isPaid = invoice.status === 'Paid';
  const balance = parseFloat(invoice.total || 0) - parseFloat(invoice.amount_paid || 0);

  return h(Document, null,
    h(Page, { size: 'LETTER', style: inv.page },
      // Header
      h(View, { style: inv.header },
        h(View, null,
          h(Text, { style: inv.fromLabel }, 'From'),
          h(Text, { style: inv.practiceName }, invoice.practice_name),
          h(Text, { style: inv.practiceAddr }, invoice.address_line1),
          invoice.address_line2 && h(Text, { style: inv.practiceAddr }, invoice.address_line2),
          h(Text, { style: inv.practiceAddr }, `${invoice.city}, ${invoice.state} ${invoice.zip}`),
        ),
        isPaid && h(View, { style: inv.paidStamp },
          h(Text, { style: inv.paidText }, 'PAID'),
        ),
        invoice.logo_data && h(Image, { src: invoice.logo_data, style: inv.logo }),
      ),
      // Title
      h(Text, { style: inv.title }, 'Invoice'),
      // Info
      h(View, { style: inv.infoSection },
        h(View, { style: inv.infoLeft },
          h(Text, { style: inv.infoLabelFirst }, 'Bill To'),
          h(Text, { style: inv.infoValue }, invoice.responsible_party_name || invoice.client_name),
          h(Text, { style: inv.infoLabel }, 'Client'),
          h(Text, { style: inv.infoValue }, invoice.client_name),
          h(Text, { style: inv.infoLabel }, 'Responsible Party'),
          h(Text, { style: inv.infoValue }, invoice.responsible_party_name || invoice.client_name),
          invoice.responsible_party_email && h(Text, { style: inv.infoSub }, invoice.responsible_party_email),
        ),
        h(View, { style: inv.infoRight },
          h(Text, { style: inv.infoLabelFirst }, 'Invoice'),
          h(Text, { style: inv.infoValue }, `#${invoice.invoice_number}`),
          h(Text, { style: inv.infoSub }, `Issued: ${fmtDate(invoice.issued_date)}`),
          h(Text, { style: inv.infoSub }, `Due: ${fmtDate(invoice.due_date)}`),
          h(Text, { style: inv.infoLabel }, 'Provider'),
          h(Text, { style: inv.infoValue }, invoice.clinician_name),
          invoice.tax_id && h(Text, { style: inv.infoSub }, `Tax ID: ${invoice.tax_id}`),
          invoice.npi_number && h(Text, { style: inv.infoSub }, `NPI: #${invoice.npi_number}`),
          invoice.clinician_phone && h(Text, { style: inv.infoSub }, fmtPhone(invoice.clinician_phone)),
        ),
      ),
      // Table header
      h(View, { style: inv.tableHeader },
        h(Text, { style: [inv.th, inv.dateCol] }, 'Date'),
        h(Text, { style: [inv.th, inv.descCol] }, 'Description'),
        h(Text, { style: [inv.th, inv.amtCol] }, 'Amount'),
      ),
      // Line items
      ...(invoice.items || []).map((item, i) =>
        h(View, { key: i, style: inv.row },
          h(Text, { style: inv.dateCol }, fmtDate(item.service_date)),
          h(Text, { style: inv.descCol }, item.description),
          h(Text, { style: [inv.amtCol, { fontFamily: 'Helvetica-Bold' }] }, fmt(item.amount)),
        )
      ),
      // Totals
      h(View, { style: inv.totals },
        h(View, { style: inv.totalRow },
          h(Text, { style: inv.totalLabel }, 'Subtotal'),
          h(Text, { style: inv.totalValue }, fmtNum(invoice.subtotal)),
        ),
        h(View, { style: [inv.totalRow, inv.totalDivider] },
          h(Text, { style: [inv.totalLabel, { fontFamily: 'Helvetica-Bold' }] }, 'Total'),
          h(Text, { style: [inv.totalValue, { fontFamily: 'Helvetica-Bold' }] }, fmtNum(invoice.total)),
        ),
        h(View, { style: inv.totalRow },
          h(Text, { style: inv.totalLabel }, 'Amount Paid'),
          h(Text, { style: inv.totalValue }, fmtNum(invoice.amount_paid)),
        ),
        h(View, { style: [inv.totalRow, inv.totalDivider] },
          h(Text, { style: inv.balanceLabel }, 'Balance'),
          h(Text, { style: inv.balanceValue }, fmt(balance)),
        ),
      ),
      // Footer
      h(View, { style: inv.footer },
        invoice.notes && h(Text, { style: inv.footerText }, invoice.notes),
        h(Text, { style: inv.footerText }, invoice.footer_text || `Make Payments to: ${invoice.practice_name}`),
      ),
    )
  );
}

// ── Superbill PDF ──────────────────────────────────────────────────────────────

const sb = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: '#1f2937' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  fromLabel: { fontSize: 9, color: '#6b7280', marginBottom: 2 },
  practiceName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  practiceAddr: { fontSize: 9, color: '#4b5563' },
  logo: { height: 40, objectFit: 'contain' },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 20 },
  infoSection: { flexDirection: 'row', marginBottom: 20 },
  infoLeft: { flex: 1 },
  infoRight: { flex: 1 },
  infoLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginTop: 12, marginBottom: 3 },
  infoLabelFirst: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginBottom: 3 },
  infoValue: { fontSize: 10, color: '#1f2937' },
  infoSub: { fontSize: 9, color: '#4b5563', marginTop: 1 },
  diagSection: { marginBottom: 20 },
  diagHeader: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#9ca3af', paddingVertical: 6, marginBottom: 4 },
  diagRow: { flexDirection: 'row', paddingVertical: 4 },
  dxNumCol: { width: 40, fontSize: 9, color: '#4b5563' },
  dxDescCol: { flex: 1, fontSize: 10 },
  tableHeader: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#9ca3af', paddingVertical: 6, marginBottom: 2 },
  th: { fontSize: 9, color: '#4b5563' },
  row: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.5, borderColor: '#e5e7eb' },
  dateCol: { width: 70 },
  posCol: { width: 30 },
  svcCol: { width: 50 },
  dxCol: { width: 25 },
  descCol: { flex: 1, paddingRight: 8 },
  unitsCol: { width: 35, textAlign: 'center' },
  feeCol: { width: 50, textAlign: 'right' },
  paidCol: { width: 50, textAlign: 'right' },
  totals: { alignItems: 'flex-end', marginTop: 12 },
  totalRow: { flexDirection: 'row', width: 200, justifyContent: 'flex-end', marginBottom: 4 },
  totalDivider: { borderTopWidth: 1, borderColor: '#9ca3af', paddingTop: 4, marginTop: 2 },
  totalLabel: { width: 100, textAlign: 'right', paddingRight: 12, color: '#4b5563', fontSize: 10 },
  totalValue: { width: 80, textAlign: 'right', fontSize: 10, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 48, left: 48, right: 48 },
  footerText: { fontSize: 9, color: '#4b5563' },
});

function SuperbillDocument({ invoice, diagnoses = [] }) {
  const totalFees = (invoice.items || []).reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);
  const dxNumbers = diagnoses.map((_, i) => i + 1);

  return h(Document, null,
    h(Page, { size: 'LETTER', style: sb.page },
      // Header
      h(View, { style: sb.header },
        h(View, null,
          h(Text, { style: sb.fromLabel }, 'From'),
          h(Text, { style: sb.practiceName }, invoice.practice_name),
          h(Text, { style: sb.practiceAddr }, invoice.address_line1),
          invoice.address_line2 && h(Text, { style: sb.practiceAddr }, invoice.address_line2),
          h(Text, { style: sb.practiceAddr }, `${invoice.city}, ${invoice.state} ${invoice.zip}`),
        ),
        invoice.logo_data && h(Image, { src: invoice.logo_data, style: sb.logo }),
      ),
      // Title
      h(Text, { style: sb.title }, 'Statement for Insurance Reimbursement'),
      // Info
      h(View, { style: sb.infoSection },
        h(View, { style: sb.infoLeft },
          h(Text, { style: sb.infoLabelFirst }, 'To'),
          h(Text, { style: sb.infoValue }, invoice.responsible_party_name || invoice.client_name),
          h(Text, { style: sb.infoLabel }, 'Client'),
          h(Text, { style: sb.infoValue }, invoice.client_name),
          invoice.client_dob && h(Text, { style: sb.infoSub }, `DOB: ${fmtDate(invoice.client_dob)}`),
          h(Text, { style: sb.infoLabel }, 'Responsible party'),
          h(Text, { style: sb.infoValue }, invoice.responsible_party_name || invoice.client_name),
          invoice.responsible_party_email && h(Text, { style: sb.infoSub }, invoice.responsible_party_email),
        ),
        h(View, { style: sb.infoRight },
          h(Text, { style: sb.infoLabelFirst }, 'Statement'),
          h(Text, { style: sb.infoValue }, `#${invoice.invoice_number}`),
          h(Text, { style: sb.infoSub }, `Issued: ${fmtDate(invoice.issued_date)}`),
          h(Text, { style: sb.infoLabel }, 'Provider'),
          h(Text, { style: sb.infoValue }, invoice.clinician_name),
          invoice.npi_number && h(Text, { style: sb.infoSub }, `NPI: #${invoice.npi_number}`),
          invoice.clinician_phone && h(Text, { style: sb.infoSub }, fmtPhone(invoice.clinician_phone)),
          invoice.license_number && h(Text, { style: sb.infoSub }, `License: CCC-SLP #${invoice.license_number}`),
          h(Text, { style: sb.infoLabel }, 'Practice'),
          invoice.tax_id && h(Text, { style: sb.infoSub }, `Tax ID: ${invoice.tax_id}`),
        ),
      ),
      // Diagnoses
      diagnoses.length > 0 && h(View, { style: sb.diagSection },
        h(View, { style: sb.diagHeader },
          h(Text, { style: [sb.th, sb.dxNumCol] }, 'DX'),
          h(Text, { style: [sb.th, sb.dxDescCol] }, 'Diagnosis Code'),
        ),
        ...diagnoses.map((dx, i) =>
          h(View, { key: i, style: sb.diagRow },
            h(Text, { style: sb.dxNumCol }, String(i + 1)),
            h(Text, { style: sb.dxDescCol }, `${dx.icd10_code} - ${dx.description}`),
          )
        ),
      ),
      // Table header
      h(View, { style: sb.tableHeader },
        h(Text, { style: [sb.th, sb.dateCol] }, 'Date'),
        h(Text, { style: [sb.th, sb.posCol] }, 'POS'),
        h(Text, { style: [sb.th, sb.svcCol] }, 'Service'),
        h(Text, { style: [sb.th, sb.dxCol] }, 'DX'),
        h(Text, { style: [sb.th, sb.descCol] }, 'Description'),
        h(Text, { style: [sb.th, sb.unitsCol] }, 'Units'),
        h(Text, { style: [sb.th, sb.feeCol] }, 'Fee'),
        h(Text, { style: [sb.th, sb.paidCol] }, 'Paid'),
      ),
      // Line items
      ...(invoice.items || []).map((item, i) =>
        h(View, { key: i, style: sb.row },
          h(Text, { style: sb.dateCol }, fmtDate(item.service_date)),
          h(Text, { style: sb.posCol }, '11'),
          h(Text, { style: sb.svcCol }, item.cpt_code || ''),
          h(Text, { style: sb.dxCol }, dxNumbers.length > 0 ? dxNumbers.join(',') : ''),
          h(Text, { style: sb.descCol }, item.description),
          h(Text, { style: sb.unitsCol }, '1'),
          h(Text, { style: [sb.feeCol, { fontFamily: 'Helvetica-Bold' }] }, fmt(item.amount)),
          h(Text, { style: sb.paidCol }, fmt(item.amount)),
        )
      ),
      // Totals
      h(View, { style: sb.totals },
        h(View, { style: [sb.totalRow, sb.totalDivider] },
          h(Text, { style: sb.totalLabel }, 'Total Fees'),
          h(Text, { style: sb.totalValue }, fmt(totalFees)),
        ),
        h(View, { style: [sb.totalRow, sb.totalDivider] },
          h(Text, { style: sb.totalLabel }, 'Total Paid'),
          h(Text, { style: sb.totalValue }, fmt(invoice.amount_paid)),
        ),
      ),
      // Footer
      h(View, { style: sb.footer },
        h(Text, { style: sb.footerText }, `Make Payments to: ${invoice.practice_name}`),
      ),
    )
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function generateInvoicePdf(invoice) {
  return renderToBuffer(h(InvoiceDocument, { invoice }));
}

export async function generateSuperbillPdf(invoice, diagnoses) {
  return renderToBuffer(h(SuperbillDocument, { invoice, diagnoses }));
}
