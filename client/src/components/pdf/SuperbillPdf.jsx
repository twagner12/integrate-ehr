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
  return v;
};

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  logo: { height: 32, objectFit: 'contain', marginBottom: 8 },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  practiceName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  practiceAddr: { fontSize: 9, color: '#6b7280' },

  infoRow: { flexDirection: 'row', marginBottom: 16, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  infoCol: { flex: 1 },
  infoLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  infoValue: { fontSize: 10, color: '#111827' },
  infoSub: { fontSize: 9, color: '#6b7280', marginTop: 1 },

  diagSection: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  diagLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },

  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 6, marginBottom: 4 },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderColor: '#f9fafb' },
  dateCol: { width: 65 },
  posCol: { width: 30 },
  cptCol: { width: 45 },
  dxCol: { width: 25 },
  descCol: { flex: 1 },
  unitsCol: { width: 30, textAlign: 'center' },
  feeCol: { width: 55, textAlign: 'right' },
  paidCol: { width: 45, textAlign: 'right' },
  cellGray: { color: '#6b7280' },
  cellBold: { fontFamily: 'Helvetica-Bold' },

  totals: { alignItems: 'flex-end', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderColor: '#f3f4f6' },
  totalRow: { flexDirection: 'row', width: 180, justifyContent: 'space-between', marginBottom: 3 },
  totalLabel: { color: '#6b7280' },
  totalBold: { fontFamily: 'Helvetica-Bold' },

  footer: { marginTop: 24, paddingTop: 12, borderTopWidth: 1, borderColor: '#f3f4f6' },
  footerText: { fontSize: 8, color: '#9ca3af' },
});

export default function SuperbillPdf({ invoice, diagnoses = [] }) {
  const totalFees = invoice.items?.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0) || 0;
  const dxNumbers = diagnoses.map((_, i) => i + 1);

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
            <Text style={s.title}>Statement for Insurance Reimbursement</Text>
            <Text style={s.subtitle}>Statement #{invoice.invoice_number}</Text>
            <Text style={s.subtitle}>Issued: {fmtDate(invoice.issued_date)}</Text>
          </View>
        </View>

        {/* To / Client / Provider */}
        <View style={s.infoRow}>
          <View style={s.infoCol}>
            <Text style={s.infoLabel}>To</Text>
            <Text style={s.infoValue}>{invoice.responsible_party_name || invoice.client_name}</Text>
            {invoice.responsible_party_phone && <Text style={s.infoSub}>{fmtPhone(invoice.responsible_party_phone)}</Text>}
            {invoice.responsible_party_email && <Text style={s.infoSub}>{invoice.responsible_party_email}</Text>}
          </View>
          <View style={s.infoCol}>
            <Text style={s.infoLabel}>Client</Text>
            <Text style={s.infoValue}>{invoice.client_name}</Text>
            {invoice.client_dob && <Text style={s.infoSub}>DOB: {fmtDate(invoice.client_dob)}</Text>}
          </View>
          <View style={s.infoCol}>
            <Text style={s.infoLabel}>Provider</Text>
            <Text style={s.infoValue}>{invoice.clinician_name}</Text>
            {invoice.npi_number && <Text style={s.infoSub}>NPI: {invoice.npi_number}</Text>}
            {invoice.license_number && <Text style={s.infoSub}>License: {invoice.license_number}</Text>}
            {invoice.clinician_phone && <Text style={s.infoSub}>{fmtPhone(invoice.clinician_phone)}</Text>}
            {invoice.tax_id && <Text style={s.infoSub}>Tax ID: {invoice.tax_id}</Text>}
          </View>
        </View>

        {/* Diagnosis */}
        {diagnoses.length > 0 && (
          <View style={s.diagSection}>
            <Text style={s.diagLabel}>Diagnosis</Text>
            {diagnoses.map((dx, i) => (
              <Text key={i} style={s.infoValue}>DX{i + 1}: {dx.icd10_code} — {dx.description}</Text>
            ))}
          </View>
        )}

        {/* Line items */}
        <View style={s.tableHeader}>
          <Text style={[s.th, s.dateCol]}>Date</Text>
          <Text style={[s.th, s.posCol]}>POS</Text>
          <Text style={[s.th, s.cptCol]}>CPT</Text>
          <Text style={[s.th, s.dxCol]}>DX</Text>
          <Text style={[s.th, s.descCol]}>Description</Text>
          <Text style={[s.th, s.unitsCol]}>Units</Text>
          <Text style={[s.th, s.feeCol]}>Fee</Text>
          <Text style={[s.th, s.paidCol]}>Paid</Text>
        </View>
        {invoice.items?.map((item, i) => (
          <View key={i} style={s.row}>
            <Text style={[s.dateCol, s.cellGray]}>{fmtDate(item.service_date)}</Text>
            <Text style={s.posCol}>11</Text>
            <Text style={s.cptCol}>{item.cpt_code || ''}</Text>
            <Text style={s.dxCol}>{dxNumbers.length > 0 ? dxNumbers.join(',') : ''}</Text>
            <Text style={s.descCol}>{item.description}</Text>
            <Text style={[s.unitsCol, s.cellGray]}>1</Text>
            <Text style={[s.feeCol, s.cellBold]}>{fmt(item.amount)}</Text>
            <Text style={[s.paidCol, s.cellGray]}>{fmt(item.amount)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total Fees</Text>
            <Text style={s.totalBold}>{fmt(totalFees)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total Paid</Text>
            <Text style={s.totalBold}>{fmt(invoice.amount_paid)}</Text>
          </View>
        </View>

        {/* Footer */}
        {invoice.footer_text && (
          <View style={s.footer}>
            <Text style={s.footerText}>{invoice.footer_text}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
