import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';

const fmt = (a) => `$${parseFloat(a || 0).toFixed(2)}`;
const fmtDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
};

function BillingDocuments({ clientId }) {
  const api = useApi();
  const [invoices, setInvoices] = useState([]);
  const [superbills, setSuperbills] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get(`/portal/clients/${clientId}/invoices`),
      api.get(`/portal/clients/${clientId}/superbills`),
      api.get(`/portal/clients/${clientId}/balance`),
    ]).then(([inv, sb, bal]) => {
      setInvoices(inv);
      setSuperbills(sb);
      setBalance(bal);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  const handlePay = async (invoiceId) => {
    setPaying(invoiceId);
    try {
      const { url } = await api.post(`/portal/clients/${clientId}/pay/${invoiceId}`);
      window.location.href = url;
    } catch (err) {
      alert(err.message);
      setPaying(null);
    }
  };

  const handleDownloadInvoice = async (invoiceId, number) => {
    const token = await window.Clerk?.session?.getToken();
    const res = await fetch(`/api/portal/clients/${clientId}/invoices/${invoiceId}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Invoice-${number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSuperbill = async (invoiceId, number) => {
    const token = await window.Clerk?.session?.getToken();
    const res = await fetch(`/api/portal/clients/${clientId}/superbills/${invoiceId}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Superbill-${number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <p className="text-sm text-gray-400">Loading...</p>;

  return (
    <div>
      {/* Total balance */}
      <div className="bg-gray-50 rounded-lg p-5 text-center mb-8">
        <span className="text-gray-600 mr-2">Total Balance</span>
        <span className="text-xl font-bold text-gray-900">{fmt(balance?.total_balance)}</span>
      </div>

      {/* Invoices */}
      <h3 className="text-lg font-medium text-gray-900 mb-3">Invoices ({invoices.length})</h3>
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3 text-right">Charges</th>
              <th className="px-4 py-3 text-right">Payments</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No invoices</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-600">{fmtDate(inv.issued_date)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDownloadInvoice(inv.id, inv.invoice_number)}
                    className="text-blue-600 hover:underline">
                    Invoice #{inv.invoice_number}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">{fmt(inv.total)}</td>
                <td className="px-4 py-3 text-right">{fmt(inv.amount_paid)}</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(inv.balance)}</td>
                <td className="px-4 py-3 text-right">
                  {inv.status !== 'Paid' && parseFloat(inv.balance) > 0 && (
                    <button onClick={() => handlePay(inv.id)} disabled={paying === inv.id}
                      className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {paying === inv.id ? 'Loading...' : 'Pay'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Superbills */}
      <details className="border border-gray-200 rounded-lg mb-3">
        <summary className="px-5 py-4 cursor-pointer flex justify-between items-center text-gray-900 font-medium">
          Insurance Reimbursement Statements ({superbills.length})
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        {superbills.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-gray-400">No statements available.</p>
        ) : (
          <div className="px-5 pb-4 space-y-2">
            {superbills.map(sb => (
              <div key={sb.id} className="flex justify-between items-center py-2 border-t border-gray-100">
                <div>
                  <span className="text-sm text-gray-700">Statement #{sb.invoice_number}</span>
                  <span className="text-xs text-gray-400 ml-3">{fmtDate(sb.issued_date)}</span>
                </div>
                <button onClick={() => handleDownloadSuperbill(sb.id, sb.invoice_number)}
                  className="text-sm text-blue-600 hover:underline">
                  Download PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </details>
    </div>
  );
}

function PaymentMethods({ clientId }) {
  const api = useApi();
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/portal/clients/${clientId}/card`)
      .then(setCard)
      .catch(() => setCard({ has_card: false }))
      .finally(() => setLoading(false));
  }, [clientId]);

  const handleSetup = async () => {
    try {
      const { url } = await api.post(`/portal/clients/${clientId}/card/setup`);
      window.location.href = url;
    } catch (err) { alert(err.message); }
  };

  if (loading) return <p className="text-sm text-gray-400">Loading...</p>;

  return (
    <div>
      {card?.has_card ? (
        <div className="border border-gray-200 rounded-lg p-5">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Card on file</p>
              <p className="font-medium text-gray-900 mt-1">
                {card.brand?.toUpperCase()} •••• {card.last4}
                <span className="text-gray-400 ml-2 text-sm">Exp {card.exp_month}/{card.exp_year}</span>
              </p>
            </div>
            <button onClick={handleSetup}
              className="text-sm text-blue-600 hover:underline">
              Update card
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">No payment method on file.</p>
          <button onClick={handleSetup}
            className="bg-blue-600 text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-blue-700">
            Add payment method
          </button>
        </div>
      )}
    </div>
  );
}

function PaymentHistory({ clientId }) {
  const api = useApi();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/portal/clients/${clientId}/payments`)
      .then(setPayments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <p className="text-sm text-gray-400">Loading...</p>;

  return (
    <div>
      {payments.length === 0 ? (
        <p className="text-center text-gray-500 py-8">No payment history.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-600">{fmtDate(p.paid_at)}</td>
                  <td className="px-4 py-3">Invoice #{p.invoice_number}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(p.amount_paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PortalBilling() {
  const { clientId } = useParams();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('documents');

  useEffect(() => {
    if (searchParams.get('card_saved') === '1') {
      setTab('methods');
    }
  }, []);

  const subTabs = [
    { id: 'documents', label: 'BILLING DOCUMENTS' },
    { id: 'methods', label: 'PAYMENT METHODS' },
    { id: 'history', label: 'PAYMENT HISTORY' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-light text-gray-800 mb-6">Billing & Payments</h2>

      {/* Sub-tabs */}
      <div className="flex gap-6 border-b border-gray-200 mb-6">
        {subTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-gray-800 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'documents' && <BillingDocuments clientId={clientId} />}
      {tab === 'methods' && <PaymentMethods clientId={clientId} />}
      {tab === 'history' && <PaymentHistory clientId={clientId} />}
    </div>
  );
}
