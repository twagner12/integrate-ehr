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

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: '#1f2937' },

  // Header: From (left) + PAID stamp (center) + Logo (right)
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  fromLabel: { fontSize: 9, color: '#6b7280', marginBottom: 2 },
  practiceName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  practiceAddr: { fontSize: 9, color: '#4b5563' },
  logo: { height: 40, objectFit: 'contain' },
  paidStamp: { borderWidth: 2.5, borderColor: '#22c55e', borderRadius: 4, paddingHorizontal: 18, paddingVertical: 6, alignSelf: 'flex-start' },
  paidText: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#22c55e', letterSpacing: 3 },

  // Title
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 20 },

  // Info section: two columns
  infoSection: { flexDirection: 'row', marginBottom: 24 },
  infoLeft: { flex: 1 },
  infoRight: { flex: 1 },
  infoLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginTop: 12, marginBottom: 3 },
  infoLabelFirst: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginBottom: 3 },
  infoValue: { fontSize: 10, color: '#1f2937' },
  infoSub: { fontSize: 9, color: '#4b5563', marginTop: 1 },

  // Table
  tableHeader: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#9ca3af', paddingVertical: 6, marginBottom: 2 },
  th: { fontSize: 9, color: '#4b5563' },
  row: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 0.5, borderColor: '#e5e7eb' },
  dateCol: { width: 80 },
  descCol: { flex: 1, paddingRight: 12 },
  amtCol: { width: 70, textAlign: 'right' },

  // Totals
  totals: { alignItems: 'flex-end', marginTop: 12 },
  totalRow: { flexDirection: 'row', width: 200, justifyContent: 'flex-end', marginBottom: 4 },
  totalLabel: { width: 100, textAlign: 'right', paddingRight: 12, color: '#4b5563', fontSize: 10 },
  totalValue: { width: 80, textAlign: 'right', fontSize: 10 },
  totalDivider: { borderTopWidth: 1, borderColor: '#9ca3af', paddingTop: 4, marginTop: 2 },
  balanceLabel: { width: 100, textAlign: 'right', paddingRight: 12, fontSize: 13, fontFamily: 'Helvetica-Bold' },
  balanceValue: { width: 80, textAlign: 'right', fontSize: 13, fontFamily: 'Helvetica-Bold' },

  // Footer
  footer: { position: 'absolute', bottom: 48, left: 48, right: 48 },
  footerText: { fontSize: 9, color: '#4b5563' },
});

export default function InvoicePdf({ invoice }) {
  const isPaid = invoice.status === 'Paid';
  const balance = parseFloat(invoice.total || 0) - parseFloat(invoice.amount_paid || 0);

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Header: From + PAID stamp + Logo */}
        <View style={s.header}>
          <View>
            <Text style={s.fromLabel}>From</Text>
            <Text style={s.practiceName}>{invoice.practice_name}</Text>
            <Text style={s.practiceAddr}>{invoice.address_line1}</Text>
            {invoice.address_line2 && <Text style={s.practiceAddr}>{invoice.address_line2}</Text>}
            <Text style={s.practiceAddr}>{invoice.city}, {invoice.state} {invoice.zip}</Text>
          </View>
          {isPaid && (
            <View style={s.paidStamp}>
              <Text style={s.paidText}>PAID</Text>
            </View>
          )}
          {invoice.logo_data && <Image src={invoice.logo_data} style={s.logo} />}
        </View>

        {/* Title */}
        <Text style={s.title}>Invoice</Text>

        {/* Info: two columns */}
        <View style={s.infoSection}>
          <View style={s.infoLeft}>
            <Text style={s.infoLabelFirst}>Bill To</Text>
            <Text style={s.infoValue}>{invoice.responsible_party_name || invoice.client_name}</Text>

            <Text style={s.infoLabel}>Client</Text>
            <Text style={s.infoValue}>{invoice.client_name}</Text>

            <Text style={s.infoLabel}>Responsible Party</Text>
            <Text style={s.infoValue}>{invoice.responsible_party_name || invoice.client_name}</Text>
            {invoice.responsible_party_email && <Text style={s.infoSub}>{invoice.responsible_party_email}</Text>}
          </View>

          <View style={s.infoRight}>
            <Text style={s.infoLabelFirst}>Invoice</Text>
            <Text style={s.infoValue}>#{invoice.invoice_number}</Text>
            <Text style={s.infoSub}>Issued: {fmtDate(invoice.issued_date)}</Text>
            <Text style={s.infoSub}>Due: {fmtDate(invoice.due_date)}</Text>

            <Text style={s.infoLabel}>Provider</Text>
            <Text style={s.infoValue}>{invoice.clinician_name}</Text>
            {invoice.tax_id && <Text style={s.infoSub}>Tax ID: {invoice.tax_id}</Text>}
            {invoice.npi_number && <Text style={s.infoSub}>NPI: #{invoice.npi_number}</Text>}
            {invoice.clinician_phone && <Text style={s.infoSub}>{fmtPhone(invoice.clinician_phone)}</Text>}
          </View>
        </View>

        {/* Line items */}
        <View style={s.tableHeader}>
          <Text style={[s.th, s.dateCol]}>Date</Text>
          <Text style={[s.th, s.descCol]}>Description</Text>
          <Text style={[s.th, s.amtCol]}>Amount</Text>
        </View>
        {invoice.items?.map((item, i) => (
          <View key={i} style={s.row}>
            <Text style={s.dateCol}>{fmtDate(item.service_date)}</Text>
            <Text style={s.descCol}>{item.description}</Text>
            <Text style={[s.amtCol, { fontFamily: 'Helvetica-Bold' }]}>{fmt(item.amount)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{fmtNum(invoice.subtotal)}</Text>
          </View>
          <View style={[s.totalRow, s.totalDivider]}>
            <Text style={[s.totalLabel, { fontFamily: 'Helvetica-Bold' }]}>Total</Text>
            <Text style={[s.totalValue, { fontFamily: 'Helvetica-Bold' }]}>{fmtNum(invoice.total)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Amount Paid</Text>
            <Text style={s.totalValue}>{fmtNum(invoice.amount_paid)}</Text>
          </View>
          <View style={[s.totalRow, s.totalDivider]}>
            <Text style={s.balanceLabel}>Balance</Text>
            <Text style={s.balanceValue}>{fmt(balance)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          {invoice.notes && <Text style={s.footerText}>{invoice.notes}</Text>}
          <Text style={s.footerText}>{invoice.footer_text || `Make Payments to: ${invoice.practice_name}`}</Text>
        </View>
      </Page>
    </Document>
  );
}
