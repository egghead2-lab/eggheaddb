import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { CopyableTable } from '../../components/ui/CopyableTable';
import { formatDate, formatCurrency } from '../../lib/utils';

const STATUS_BADGE = {
  Paid: 'bg-green-100 text-green-700',
  Partial: 'bg-amber-100 text-amber-700',
  Unpaid: 'bg-red-100 text-red-700',
};
const QB_STATUS_BADGE = {
  Paid: 'bg-green-50 text-green-600 border-green-200',
  Partial: 'bg-amber-50 text-amber-600 border-amber-200',
  Overdue: 'bg-red-50 text-red-600 border-red-200',
  Unpaid: 'bg-gray-50 text-gray-500 border-gray-200',
  Deleted: 'bg-red-50 text-red-600 border-red-300',
};

function getStatus(r) {
  if (r.is_paid) return 'Paid';
  if (parseFloat(r.amount_paid) > 0) return 'Partial';
  return 'Unpaid';
}

export default function InvoiceTrackerPage() {
  const qc = useQueryClient();
  const [paidFilter, setPaidFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [payingId, setPayingId] = useState(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-tracker', paidFilter],
    queryFn: () => api.get('/invoicing/tracker', { params: { paid_status: paidFilter || undefined } }).then(r => r.data),
  });
  const invoices = data?.data || [];
  const summary = data?.summary || {};

  const syncMutation = useMutation({
    mutationFn: () => api.post('/quickbooks/sync-status'),
    onSuccess: () => qc.invalidateQueries(['invoice-tracker']),
  });

  const voidMutation = useMutation({
    mutationFn: (invoice_record_id) => api.post('/quickbooks/void-invoice', { invoice_record_id }),
    onSuccess: () => qc.invalidateQueries(['invoice-tracker']),
  });

  const payMutation = useMutation({
    mutationFn: ({ id, payment_date, amount, payment_notes }) =>
      api.post(`/invoicing/tracker/${id}/payment`, { payment_date, amount, payment_notes }),
    onSuccess: () => { qc.invalidateQueries(['invoice-tracker']); setPayingId(null); setPayAmount(''); setPayNotes(''); },
  });

  return (
    <AppShell>
      <PageHeader title="Invoice Tracker" />

      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-4">
        <div className="flex gap-1">
          {['', 'Unpaid', 'Partial', 'Paid'].map(f => (
            <button key={f} onClick={() => setPaidFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium ${paidFilter === f ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f || 'All'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
          className="text-[10px] px-2.5 py-1.5 rounded border border-blue-200 text-blue-700 font-medium hover:bg-blue-50 disabled:opacity-50">
          {syncMutation.isPending ? 'Syncing...' : 'Sync QB Status'}
        </button>
        <div className="flex gap-4 text-xs">
          <div className="text-center"><div className="text-gray-400">Invoiced</div><div className="font-bold">{formatCurrency(summary.totalInvoiced || 0)}</div></div>
          <div className="text-center"><div className="text-gray-400">Received</div><div className="font-bold text-green-700">{formatCurrency(summary.totalReceived || 0)}</div></div>
          <div className="text-center"><div className="text-gray-400">Outstanding</div><div className="font-bold text-red-700">{formatCurrency(summary.outstanding || 0)}</div></div>
        </div>
      </div>

      <div className="p-6">
        {isLoading ? <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div> : invoices.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No invoices found</div>
        ) : (
          <CopyableTable className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Inv #</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Type</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Invoice Date</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Due</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Total</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Paid</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Balance</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">Our Status</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">QB Status</th>
                  <th className="w-32 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv, i) => {
                  const status = getStatus(inv);
                  const balance = parseFloat(inv.total_amount) - parseFloat(inv.amount_paid);
                  const isExpanded = expandedId === inv.id;
                  return (
                    <>
                      <tr key={inv.id} className={`cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30`}
                        onClick={() => setExpandedId(isExpanded ? null : inv.id)}>
                        <td className="px-2 py-2 font-medium">{inv.invoice_number}</td>
                        <td className="px-2 py-2 text-gray-500">{inv.invoice_type}</td>
                        <td className="px-2 py-2 text-gray-800">{inv.customer_name}</td>
                        <td className="px-2 py-2 text-gray-600">{formatDate(inv.invoice_date)}</td>
                        <td className="px-2 py-2 text-gray-600">{formatDate(inv.due_date)}</td>
                        <td className="px-2 py-2 text-right font-medium">{formatCurrency(inv.total_amount)}</td>
                        <td className="px-2 py-2 text-right text-green-700">{formatCurrency(inv.amount_paid)}</td>
                        <td className="px-2 py-2 text-right font-medium text-red-700">{balance > 0 ? formatCurrency(balance) : '—'}</td>
                        <td className="px-2 py-2 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[status]}`}>{status}</span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {inv.qb_invoice_id ? (
                            <div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${QB_STATUS_BADGE[inv.qb_status] || QB_STATUS_BADGE.Unpaid}`}>
                                QB: {inv.qb_status || 'Unknown'}
                              </span>
                              {inv.qb_status === 'Paid' && !inv.is_paid && (
                                <div className="text-[9px] text-green-600 mt-0.5 font-medium">Payment received in QB</div>
                              )}
                              {inv.qb_status === 'Partial' && (
                                <div className="text-[9px] text-amber-600 mt-0.5">QB bal: {formatCurrency(inv.qb_balance)}</div>
                              )}
                              {inv.qb_status === 'Deleted' && (
                                <div className="mt-1" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => { if (confirm('Void this invoice and re-queue programs for re-invoicing?')) voidMutation.mutate(inv.id); }}
                                    disabled={voidMutation.isPending}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium hover:bg-red-200">
                                    {voidMutation.isPending ? '...' : 'Void & Re-queue'}
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : <span className="text-gray-300 text-[10px]">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {status !== 'Paid' && (
                              <button onClick={() => { setPayingId(payingId === inv.id ? null : inv.id); setPayAmount(String(balance.toFixed(2))); }}
                                className="text-[10px] text-[#1e3a5f] border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">
                                Record Payment
                              </button>
                            )}
                            <button onClick={() => { if (confirm('Void this invoice and re-queue all programs for re-invoicing?')) voidMutation.mutate(inv.id); }}
                              disabled={voidMutation.isPending}
                              className="text-[10px] text-red-400 border border-red-200 px-2 py-1 rounded hover:bg-red-50 hover:text-red-600">
                              Void
                            </button>
                          </div>
                        </td>
                      </tr>
                      {payingId === inv.id && (
                        <tr key={`${inv.id}-pay`}>
                          <td colSpan={11} className="bg-green-50/30 px-4 py-3">
                            <div className="flex items-center gap-3">
                              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs" />
                              <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount" className="w-28 rounded border border-gray-300 px-2 py-1 text-xs" />
                              <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Notes..." className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
                              <Button onClick={() => payMutation.mutate({ id: inv.id, payment_date: payDate, amount: parseFloat(payAmount), payment_notes: payNotes })}
                                disabled={payMutation.isPending || !payAmount}>
                                {payMutation.isPending ? 'Saving...' : 'Save'}
                              </Button>
                              <button onClick={() => setPayingId(null)} className="text-xs text-gray-500">Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {isExpanded && <InvoiceDetails invoiceId={inv.id} />}
                    </>
                  );
                })}
              </tbody>
            </table>
          </CopyableTable>
        )}
      </div>
    </AppShell>
  );
}

function InvoiceDetails({ invoiceId }) {
  const { data: progData } = useQuery({
    queryKey: ['invoice-programs', invoiceId],
    queryFn: () => api.get(`/invoicing/tracker/${invoiceId}/programs`).then(r => r.data),
  });
  const { data: payData } = useQuery({
    queryKey: ['invoice-payments', invoiceId],
    queryFn: () => api.get(`/invoicing/tracker/${invoiceId}/payments`).then(r => r.data),
  });
  const programs = progData?.data || [];
  const payments = payData?.data || [];

  return (
    <tr>
      <td colSpan={11} className="bg-blue-50/20 px-6 py-3">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Programs ({programs.length})</div>
            {programs.map(p => (
              <div key={p.id} className="flex justify-between text-xs py-0.5">
                <Link to={`/programs/${p.program_id}`} className="text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
                <span className="font-medium">{formatCurrency(p.line_amount + (p.include_lab_fee ? p.lab_fee_amount : 0))}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Payments ({payments.length})</div>
            {payments.length === 0 ? <p className="text-xs text-gray-400">No payments recorded</p> : payments.map(p => (
              <div key={p.id} className="flex justify-between text-xs py-0.5">
                <span className="text-gray-600">{formatDate(p.payment_date)} {p.payment_notes ? `— ${p.payment_notes}` : ''}</span>
                <span className="font-medium text-green-700">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </td>
    </tr>
  );
}
