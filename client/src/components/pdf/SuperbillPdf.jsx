import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const fmt = (a) => `$${parseFloat(a || 0).toFixed(2)}`;
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

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  fromLabel: { fontSize: 9, color: '#6b7280', marginBottom: 2 },
  practiceName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  practiceAddr: { fontSize: 9, color: '#4b5563' },
  logo: { height: 40, objectFit: 'contain' },

  // Title
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 20 },

  // Info section
  infoSection: { flexDirection: 'row', marginBottom: 20 },
  infoLeft: { flex: 1 },
  infoRight: { flex: 1 },
  infoLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginTop: 12, marginBottom: 3 },
  infoLabelFirst: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginBottom: 3 },
  infoValue: { fontSize: 10, color: '#1f2937' },
  infoSub: { fontSize: 9, color: '#4b5563', marginTop: 1 },

  // Diagnosis
  diagSection: { marginBottom: 20 },
  diagHeader: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#9ca3af', paddingVertical: 6, marginBottom: 4 },
  diagRow: { flexDirection: 'row', paddingVertical: 4 },
  dxNumCol: { width: 40, fontSize: 9, color: '#4b5563' },
  dxDescCol: { flex: 1, fontSize: 10 },

  // Table
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

  // Totals
  totals: { alignItems: 'flex-end', marginTop: 12 },
  totalRow: { flexDirection: 'row', width: 200, justifyContent: 'flex-end', marginBottom: 4 },
  totalDivider: { borderTopWidth: 1, borderColor: '#9ca3af', paddingTop: 4, marginTop: 2 },
  totalLabel: { width: 100, textAlign: 'right', paddingRight: 12, color: '#4b5563', fontSize: 10 },
  totalValue: { width: 80, textAlign: 'right', fontSize: 10, fontFamily: 'Helvetica-Bold' },

  // Footer
  footer: { position: 'absolute', bottom: 48, left: 48, right: 48 },
  footerText: { fontSize: 9, color: '#4b5563' },
});

export default function SuperbillPdf({ invoice, diagnoses = [] }) {
  const totalFees = invoice.items?.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0) || 0;
  const dxNumbers = diagnoses.map((_, i) => i + 1);

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Header: From + Logo */}
        <View style={s.header}>
          <View>
            <Text style={s.fromLabel}>From</Text>
            <Text style={s.practiceName}>{invoice.practice_name}</Text>
            <Text style={s.practiceAddr}>{invoice.address_line1}</Text>
            {invoice.address_line2 && <Text style={s.practiceAddr}>{invoice.address_line2}</Text>}
            <Text style={s.practiceAddr}>{invoice.city}, {invoice.state} {invoice.zip}</Text>
          </View>
          {invoice.logo_data && <Image src={invoice.logo_data} style={s.logo} />}
        </View>

        {/* Title */}
        <Text style={s.title}>Statement for Insurance Reimbursement</Text>

        {/* Info: two columns */}
        <View style={s.infoSection}>
          <View style={s.infoLeft}>
            <Text style={s.infoLabelFirst}>To</Text>
            <Text style={s.infoValue}>{invoice.responsible_party_name || invoice.client_name}</Text>

            <Text style={s.infoLabel}>Client</Text>
            <Text style={s.infoValue}>{invoice.client_name}</Text>
            {invoice.client_dob && <Text style={s.infoSub}>DOB: {fmtDate(invoice.client_dob)}</Text>}

            <Text style={s.infoLabel}>Responsible party</Text>
            <Text style={s.infoValue}>{invoice.responsible_party_name || invoice.client_name}</Text>
            {invoice.responsible_party_email && <Text style={s.infoSub}>{invoice.responsible_party_email}</Text>}
          </View>

          <View style={s.infoRight}>
            <Text style={s.infoLabelFirst}>Statement</Text>
            <Text style={s.infoValue}>#{invoice.invoice_number}</Text>
            <Text style={s.infoSub}>Issued: {fmtDate(invoice.issued_date)}</Text>

            <Text style={s.infoLabel}>Provider</Text>
            <Text style={s.infoValue}>{invoice.clinician_name}</Text>
            {invoice.npi_number && <Text style={s.infoSub}>NPI: #{invoice.npi_number}</Text>}
            {invoice.clinician_phone && <Text style={s.infoSub}>{fmtPhone(invoice.clinician_phone)}</Text>}
            {invoice.license_number && <Text style={s.infoSub}>License: CCC-SLP #{invoice.license_number}</Text>}

            <Text style={s.infoLabel}>Practice</Text>
            {invoice.tax_id && <Text style={s.infoSub}>Tax ID: {invoice.tax_id}</Text>}
          </View>
        </View>

        {/* Diagnosis */}
        {diagnoses.length > 0 && (
          <View style={s.diagSection}>
            <View style={s.diagHeader}>
              <Text style={[s.th, s.dxNumCol]}>DX</Text>
              <Text style={[s.th, s.dxDescCol]}>Diagnosis Code</Text>
            </View>
            {diagnoses.map((dx, i) => (
              <View key={i} style={s.diagRow}>
                <Text style={s.dxNumCol}>{i + 1}</Text>
                <Text style={s.dxDescCol}>{dx.icd10_code} - {dx.description}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Line items */}
        <View style={s.tableHeader}>
          <Text style={[s.th, s.dateCol]}>Date</Text>
          <Text style={[s.th, s.posCol]}>POS</Text>
          <Text style={[s.th, s.svcCol]}>Service</Text>
          <Text style={[s.th, s.dxCol]}>DX</Text>
          <Text style={[s.th, s.descCol]}>Description</Text>
          <Text style={[s.th, s.unitsCol]}>Units</Text>
          <Text style={[s.th, s.feeCol]}>Fee</Text>
          <Text style={[s.th, s.paidCol]}>Paid</Text>
        </View>
        {invoice.items?.map((item, i) => (
          <View key={i} style={s.row}>
            <Text style={s.dateCol}>{fmtDate(item.service_date)}</Text>
            <Text style={s.posCol}>11</Text>
            <Text style={s.svcCol}>{item.cpt_code || ''}</Text>
            <Text style={s.dxCol}>{dxNumbers.length > 0 ? dxNumbers.join(',') : ''}</Text>
            <Text style={s.descCol}>{item.description}</Text>
            <Text style={s.unitsCol}>1</Text>
            <Text style={[s.feeCol, { fontFamily: 'Helvetica-Bold' }]}>{fmt(item.amount)}</Text>
            <Text style={s.paidCol}>{fmt(item.amount)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totals}>
          <View style={[s.totalRow, s.totalDivider]}>
            <Text style={s.totalLabel}>Total Fees</Text>
            <Text style={s.totalValue}>{fmt(totalFees)}</Text>
          </View>
          <View style={[s.totalRow, s.totalDivider]}>
            <Text style={s.totalLabel}>Total Paid</Text>
            <Text style={s.totalValue}>{fmt(invoice.amount_paid)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>Make Payments to: {invoice.practice_name}</Text>
        </View>
      </Page>
    </Document>
  );
}
