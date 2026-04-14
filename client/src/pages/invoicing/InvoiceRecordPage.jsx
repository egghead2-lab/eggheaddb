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

export default function InvoiceRecordPage() {
  const qc = useQueryClient();
  const [invoiceType, setInvoiceType] = useState('');
  const [paidStatus, setPaidStatus] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-records', invoiceType, paidStatus],
    queryFn: () => api.get('/invoicing/records', { params: { invoice_type: invoiceType || undefined, paid_status: paidStatus || undefined } }).then(r => r.data),
  });
  const records = data?.data || [];

  const voidMutation = useMutation({
    mutationFn: (id) => api.patch(`/invoicing/records/${id}`, { active: 0 }),
    onSuccess: () => qc.invalidateQueries(['invoice-records']),
  });

  const markSentMutation = useMutation({
    mutationFn: (id) => api.post(`/invoicing/records/${id}/mark-sent`),
    onSuccess: () => qc.invalidateQueries(['invoice-records']),
  });

  return (
    <AppShell>
      <PageHeader title="Invoice Record" />

      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
        <select value={invoiceType} onChange={e => setInvoiceType(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
          <option value="">All Types</option>
          <option value="Monthly">Monthly</option>
          <option value="Non-Monthly">Non-Monthly</option>
        </select>
        <select value={paidStatus} onChange={e => setPaidStatus(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
          <option value="">All Status</option>
          <option value="Paid">Paid</option>
          <option value="Unpaid">Unpaid</option>
        </select>
      </div>

      <div className="p-6">
        {isLoading ? <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div> : records.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No invoice records</div>
        ) : (
          <CopyableTable className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Inv #</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">QB #</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Type</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Period</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Invoice Date</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Total</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Paid</th>
                  <th className="text-right px-2 py-2 font-medium text-gray-600">Balance</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">Sent</th>
                  <th className="w-24 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((r, i) => {
                  const balance = parseFloat(r.total_amount) - parseFloat(r.amount_paid);
                  const expanded = expandedId === r.id;
                  return (
                    <>
                      <tr key={r.id} className={`cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30`}
                        onClick={() => setExpandedId(expanded ? null : r.id)}>
                        <td className="px-2 py-2 font-medium">{r.invoice_number}</td>
                        <td className="px-2 py-2 text-gray-500">{r.qb_invoice_number || '—'}</td>
                        <td className="px-2 py-2 text-gray-500">{r.invoice_type}</td>
                        <td className="px-2 py-2 text-gray-800">{r.customer_name}</td>
                        <td className="px-2 py-2 text-gray-500">{r.billing_month || `${formatDate(r.invoice_date)}`}</td>
                        <td className="px-2 py-2 text-gray-600">{formatDate(r.invoice_date)}</td>
                        <td className="px-2 py-2 text-right font-medium">{formatCurrency(r.total_amount)}</td>
                        <td className="px-2 py-2 text-right text-green-700">{formatCurrency(r.amount_paid)}</td>
                        <td className="px-2 py-2 text-right font-medium">{balance > 0 ? <span className="text-red-700">{formatCurrency(balance)}</span> : <span className="text-green-700">Paid</span>}</td>
                        <td className="px-2 py-2 text-center">
                          {r.sent ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Sent</span>
                            : <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1 justify-end">
                            {!r.sent && (
                              <button onClick={() => markSentMutation.mutate(r.id)} className="text-[10px] text-[#1e3a5f] border border-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-50">Send</button>
                            )}
                            <button onClick={() => { if (confirm('Void this invoice?')) voidMutation.mutate(r.id); }}
                              className="text-[10px] text-red-500 border border-gray-200 px-1.5 py-0.5 rounded hover:bg-red-50">Void</button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${r.id}-detail`}>
                          <td colSpan={11} className="bg-blue-50/20 px-6 py-3">
                            <RecordDetails invoiceId={r.id} memo={r.memo} notes={r.notes} />
                          </td>
                        </tr>
                      )}
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

function RecordDetails({ invoiceId, memo, notes }) {
  const { data: progData } = useQuery({
    queryKey: ['invoice-programs', invoiceId],
    queryFn: () => api.get(`/invoicing/tracker/${invoiceId}/programs`).then(r => r.data),
  });
  const { data: payData } = useQuery({
    queryKey: ['invoice-payments', invoiceId],
    queryFn: () => api.get(`/invoicing/tracker/${invoiceId}/payments`).then(r => r.data),
  });

  return (
    <div className="space-y-3">
      {memo && <div className="text-xs text-gray-500"><strong>Memo:</strong> {memo}</div>}
      {notes && <div className="text-xs text-gray-500"><strong>Notes:</strong> {notes}</div>}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Programs</div>
          {(progData?.data || []).map(p => (
            <div key={p.id} className="flex justify-between text-xs py-0.5">
              <Link to={`/programs/${p.program_id}`} className="text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
              <span className="font-medium">{formatCurrency(p.line_amount)}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Payments</div>
          {(payData?.data || []).length === 0 ? <p className="text-xs text-gray-400">None</p> : (payData?.data || []).map(p => (
            <div key={p.id} className="flex justify-between text-xs py-0.5">
              <span>{formatDate(p.payment_date)}</span>
              <span className="font-medium text-green-700">{formatCurrency(p.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
