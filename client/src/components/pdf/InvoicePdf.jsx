import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const fmt = (a) => `$${parseFloat(a || 0).toFixed(2)}`;
const fmtDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
const fmtPhone = (v) => {
  if (!v) return '';
  const d = v.replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return v;
};

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  logo: { height: 32, objectFit: 'contain', marginBottom: 8 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  invoiceNum: { fontSize: 11, color: '#4b5563', marginTop: 4 },
  meta: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  practiceName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  practiceAddr: { fontSize: 9, color: '#6b7280' },

  infoRow: { flexDirection: 'row', marginBottom: 20, paddingTop: 16, paddingBottom: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  infoCol: { flex: 1 },
  infoLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  infoValue: { fontSize: 10, color: '#111827' },
  infoSub: { fontSize: 9, color: '#6b7280', marginTop: 1 },

  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 6, marginBottom: 4 },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#f9fafb' },
  dateCol: { width: 80 },
  descCol: { flex: 1 },
  amtCol: { width: 70, textAlign: 'right' },
  cellGray: { color: '#6b7280' },
  cellBold: { fontFamily: 'Helvetica-Bold' },

  totals: { alignItems: 'flex-end', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderColor: '#f3f4f6' },
  totalRow: { flexDirection: 'row', width: 180, justifyContent: 'space-between', marginBottom: 3 },
  totalLabel: { color: '#6b7280' },
  totalDivider: { borderTopWidth: 1, borderColor: '#e5e7eb', paddingTop: 4, marginTop: 2 },
  balanceRow: { flexDirection: 'row', width: 180, justifyContent: 'space-between', paddingTop: 4, marginTop: 2, borderTopWidth: 1, borderColor: '#e5e7eb' },
  balanceLabel: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  balanceValue: { fontSize: 12, fontFamily: 'Helvetica-Bold' },

  footer: { marginTop: 24, paddingTop: 12, borderTopWidth: 1, borderColor: '#f3f4f6' },
  footerNotes: { fontSize: 9, color: '#4b5563', marginBottom: 4 },
  footerText: { fontSize: 8, color: '#9ca3af' },
});

export default function InvoicePdf({ invoice }) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            {invoice.logo_data && <Image src={invoice.logo_data} style={s.logo} />}
            <Text style={s.practiceName}>{invoice.practice_name}</Text>
            <Text style={s.practiceAddr}>{invoice.address_line1}</Text>
            {invoice.address_line2 && <Text style={s.practiceAddr}>{invoice.address_line2}</Text>}
            <Text style={s.practiceAddr}>{invoice.city}, {invoice.state} {invoice.zip}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.title}>Invoice</Text>
            <Text style={s.invoiceNum}>#{invoice.invoice_number}</Text>
            <Text style={s.meta}>Issued: {fmtDate(invoice.issued_date)}</Text>
            <Text style={s.meta}>Due: {fmtDate(invoice.due_date)}</Text>
          </View>
        </View>

        {/* Bill To / Client / Provider */}
        <View style={s.infoRow}>
          <View style={s.infoCol}>
            <Text style={s.infoLabel}>Bill To</Text>
            <Text style={s.infoValue}>{invoice.responsible_party_name || invoice.client_name}</Text>
            {invoice.responsible_party_phone && <Text style={s.infoSub}>{fmtPhone(invoice.responsible_party_phone)}</Text>}
            {invoice.responsible_party_email && <Text style={s.infoSub}>{invoice.responsible_party_email}</Text>}
          </View>
          <View style={s.infoCol}>
            <Text style={s.infoLabel}>Client</Text>
            <Text style={s.infoValue}>{invoice.client_name}</Text>
          </View>
          <View style={s.infoCol}>
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
            <Text style={[s.dateCol, s.cellGray]}>{fmtDate(item.service_date)}</Text>
            <Text style={s.descCol}>{item.description}</Text>
            <Text style={[s.amtCol, s.cellBold]}>{fmt(item.amount)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text>{fmt(invoice.subtotal)}</Text>
          </View>
          <View style={[s.totalRow, s.totalDivider]}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Total</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmt(invoice.total)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Amount paid</Text>
            <Text>{fmt(invoice.amount_paid)}</Text>
          </View>
          <View style={s.balanceRow}>
            <Text style={s.balanceLabel}>Balance</Text>
            <Text style={s.balanceValue}>{fmt(invoice.balance)}</Text>
          </View>
        </View>

        {/* Footer */}
        {(invoice.notes || invoice.footer_text) && (
          <View style={s.footer}>
            {invoice.notes && <Text style={s.footerNotes}>{invoice.notes}</Text>}
            {invoice.footer_text && <Text style={s.footerText}>{invoice.footer_text}</Text>}
          </View>
        )}
      </Page>
    </Document>
  );
}
