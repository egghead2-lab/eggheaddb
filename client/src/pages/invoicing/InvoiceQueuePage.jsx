import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { CopyableTable } from '../../components/ui/CopyableTable';
import { formatDate, formatCurrency } from '../../lib/utils';

const STATUS_BADGE = {
  Ready: 'bg-green-100 text-green-700',
  Pending: 'bg-amber-100 text-amber-700',
  Invoiced: 'bg-gray-100 text-gray-500',
};
const QB_BADGE = {
  Sent: 'bg-blue-100 text-blue-700',
  Paid: 'bg-green-100 text-green-700',
  Overdue: 'bg-red-100 text-red-700',
};

export default function InvoiceQueuePage() {
  const qc = useQueryClient();
  const [contractor, setContractor] = useState('');
  const [invType, setInvType] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [checked, setChecked] = useState(new Set());
  const [showGenerate, setShowGenerate] = useState(false);

  // Generate form
  const [invoiceNum, setInvoiceNum] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; });
  const [memo, setMemo] = useState('Services Rendered');
  const [customerName, setCustomerName] = useState('');
  const [chargeLabFees, setChargeLabFees] = useState(false);
  const [qbCustomerId, setQbCustomerId] = useState('');

  const [displayLimit, setDisplayLimit] = useState(50);

  // QuickBooks connection
  const { data: qbStatus } = useQuery({
    queryKey: ['qb-status'],
    queryFn: () => api.get('/quickbooks/status').then(r => r.data),
    staleTime: 60 * 1000,
  });
  const qbConnected = qbStatus?.connected || false;

  const { data: qbCustomersData } = useQuery({
    queryKey: ['qb-customers'],
    queryFn: () => api.get('/quickbooks/customers').then(r => r.data),
    enabled: qbConnected,
    staleTime: 5 * 60 * 1000,
  });
  const qbCustomers = qbCustomersData?.data || [];

  const qbConnectMutation = useMutation({
    mutationFn: () => api.get('/quickbooks/auth').then(r => { window.location.href = r.data.authUrl; }),
  });

  const qbInvoiceMutation = useMutation({
    mutationFn: (payload) => api.post('/quickbooks/create-invoice', payload),
    onSuccess: () => { qc.invalidateQueries(['invoice-queue']); setShowGenerate(false); setChecked(new Set()); },
  });

  const { data: contractorData } = useQuery({
    queryKey: ['contractor-list'],
    queryFn: () => api.get('/contractors').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const contractors = contractorData?.data || [];

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-queue', contractor, invType, statusFilter],
    queryFn: () => api.get('/invoicing/queue', { params: { contractor_id: contractor || undefined, invoice_type: invType || undefined, status: statusFilter || undefined } }).then(r => r.data),
  });
  const allRows = data?.data || [];
  const rows = allRows.slice(0, displayLimit);
  const lastQb = data?.lastQbInvoice || 0;

  const toggleCheck = (id) => setChecked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const checkedRows = rows.filter(r => checked.has(r.id));
  const totalAmount = checkedRows.reduce((s, r) => s + r.total, 0);

  const generateMutation = useMutation({
    mutationFn: (data) => api.post('/invoicing/generate', data),
    onSuccess: () => { qc.invalidateQueries(['invoice-queue']); setShowGenerate(false); setChecked(new Set()); },
  });

  const openGenerate = () => {
    if (!checked.size) return;
    setInvoiceNum(String(lastQb + 1));
    const first = checkedRows[0];
    setCustomerName(first?.contractor_name || first?.school_name || first?.location_nickname || '');
    setShowGenerate(true);
  };

  const handleGenerate = () => {
    generateMutation.mutate({
      invoice_number: parseInt(invoiceNum),
      invoice_type: 'Non-Monthly',
      contractor_id: checkedRows[0]?.contractor_id || null,
      location_id: checkedRows[0]?.location_id || null,
      invoice_date: invoiceDate,
      due_date: dueDate,
      memo,
      customer_name: customerName,
      total_amount: totalAmount,
      qb_invoice_number: parseInt(invoiceNum),
      charge_lab_fees: chargeLabFees,
      programs: checkedRows.map(r => ({
        program_id: r.id,
        line_amount: r.line_amount,
        lab_fee_amount: r.lab_fee_total,
        status: r.status === 'Ready' ? 'completed' : 'in_progress',
      })),
    });
  };

  // CSV generation
  const downloadCsv = () => {
    const headers = ['*InvoiceNo','*Customer','*InvoiceDate','*DueDate','Terms','Location','Memo','Item(Product/Service)','ItemDescription','ItemQuantity','ItemRate','*ItemAmount','Service Date'];
    const csvRows = [headers.join(',')];
    checkedRows.forEach(r => {
      const qty = r.class_pricing_type_name === 'Flat Fee' ? (r.billable_sessions || 1) : (r.number_enrolled || 1);
      const rate = r.weekly_rate || 0;
      csvRows.push([invoiceNum, `"${customerName}"`, invoiceDate, dueDate, 'Net 30', `"${r.location_nickname || ''}"`, `"${memo}"`, `"${r.qb_item_name || ''}"`, `"${r.text_for_invoice || r.program_nickname}"`, qty, rate.toFixed(2), r.line_amount.toFixed(2), ''].join(','));
      if (chargeLabFees && r.lab_fee_total > 0) {
        csvRows.push([invoiceNum, `"${customerName}"`, invoiceDate, dueDate, 'Net 30', `"${r.location_nickname || ''}"`, `"${memo}"`, '"Lab Fee"', `"Lab fee - ${r.program_nickname}"`, 1, r.lab_fee_total.toFixed(2), r.lab_fee_total.toFixed(2), ''].join(','));
      }
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `invoice_${invoiceNum}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <PageHeader title="Invoice Queue" action={
        <div className="flex items-center gap-2">
          {checked.size > 0 && <Button onClick={openGenerate}>Generate Invoice ({checked.size} programs)</Button>}
          {qbConnected ? (
            <span className="text-[10px] px-2 py-1 rounded bg-green-100 text-green-700 font-medium">QB Connected{qbStatus?.environment === 'sandbox' ? ' (Sandbox)' : ''}</span>
          ) : (
            <button onClick={() => qbConnectMutation.mutate()}
              className="text-[10px] px-2.5 py-1 rounded border border-blue-300 text-blue-700 font-medium hover:bg-blue-50">
              Connect QuickBooks
            </button>
          )}
        </div>
      } />

      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <Select value={contractor} onChange={e => { setContractor(e.target.value); setDisplayLimit(50); }} className="w-52">
          <option value="">All Contractors</option>
          {contractors.map(c => <option key={c.id} value={c.id}>{c.contractor_name}</option>)}
        </Select>
        <Select value={invType} onChange={e => { setInvType(e.target.value); setDisplayLimit(50); }} className="w-40">
          <option value="">All Types</option>
          <option value="2nd Week">2nd Week</option>
          <option value="After Last Class">After Last Class</option>
        </Select>
        <Select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setDisplayLimit(50); }} className="w-32">
          <option value="">Not Invoiced</option>
          <option value="Ready">Ready</option>
          <option value="All">All</option>
        </Select>
        <span className="text-xs text-gray-400">
          Showing {rows.length} of {allRows.length}
        </span>
        {lastQb > 0 && <span className="text-xs text-gray-400 ml-auto">Last QB Invoice #: {lastQb}</span>}
      </div>

      <div className="p-6 flex gap-6">
        <div className={showGenerate ? 'w-[60%]' : 'w-full'}>
          {isLoading ? <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div> : rows.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No programs in queue</div>
          ) : (
            <>
            <CopyableTable className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-8 px-2 py-2"><input type="checkbox" onChange={() => { if (checked.size === rows.filter(r => r.status !== 'Invoiced').length) setChecked(new Set()); else setChecked(new Set(rows.filter(r => r.status !== 'Invoiced').map(r => r.id))); }} className="w-3.5 h-3.5" /></th>
                    <th className="text-left px-2 py-2 font-medium text-gray-600">Program</th>
                    <th className="text-left px-2 py-2 font-medium text-gray-600">Location</th>
                    <th className="text-left px-2 py-2 font-medium text-gray-600">Contractor</th>
                    <th className="text-left px-2 py-2 font-medium text-gray-600">Type</th>
                    <th className="text-left px-2 py-2 font-medium text-gray-600">Last Session</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-600">Enrolled</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-600">Parent Cost</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-600">Our Cut</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-600">Lab Fee</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-600">Total</th>
                    <th className="text-center px-2 py-2 font-medium text-gray-600">Status</th>
                    {qbConnected && <th className="text-center px-2 py-2 font-medium text-gray-600">QB</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => (
                    <tr key={r.id} className={`${checked.has(r.id) ? 'bg-blue-50/50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggleCheck(r.id)} disabled={r.status === 'Invoiced'} className="w-3.5 h-3.5" />
                      </td>
                      <td className="px-2 py-2"><Link to={`/programs/${r.id}`} className="font-medium text-[#1e3a5f] hover:underline">{r.program_nickname}</Link></td>
                      <td className="px-2 py-2 text-gray-600">{r.location_nickname || '—'}</td>
                      <td className="px-2 py-2 text-gray-600">{r.contractor_name || '—'}</td>
                      <td className="px-2 py-2">
                        {r.missing_invoice_type ? (
                          <InvoiceTypeSelector row={r} />
                        ) : (
                          <span className="text-gray-500">{r.effective_invoice_type}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-600">{r.actual_last_date ? formatDate(r.actual_last_date) : '—'}</td>
                      <td className="px-2 py-2 text-right">{r.number_enrolled ?? '—'}</td>
                      <td className="px-2 py-2 text-right text-gray-400">{r.parent_cost ? formatCurrency(r.parent_cost) : '—'}</td>
                      <td className="px-2 py-2 text-right">{formatCurrency(r.line_amount)}</td>
                      <td className="px-2 py-2 text-right">{r.lab_fee_total > 0 ? formatCurrency(r.lab_fee_total) : '—'}</td>
                      <td className="px-2 py-2 text-right font-medium">{formatCurrency(r.total)}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-500'}`}>{r.status}</span>
                      </td>
                      {qbConnected && (
                        <td className="px-2 py-2 text-center">
                          {r.qb_invoice_number ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${QB_BADGE[r.qb_invoice_status] || 'bg-gray-100 text-gray-500'}`}>
                              #{r.qb_invoice_number} {r.qb_invoice_status}
                            </span>
                          ) : <span className="text-gray-300 text-[10px]">—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CopyableTable>
            {allRows.length > displayLimit && (
              <div className="mt-3 text-center">
                <button onClick={() => setDisplayLimit(prev => prev + 50)}
                  className="text-xs text-[#1e3a5f] hover:underline font-medium">
                  Show 50 more ({allRows.length - displayLimit} remaining)
                </button>
              </div>
            )}
            </>
          )}
        </div>

        {/* Generate Invoice Panel */}
        {showGenerate && (
          <div className="w-[40%] sticky top-4 self-start">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex justify-between items-center">
                <div className="text-sm font-semibold text-gray-900">Generate Invoice</div>
                <button onClick={() => setShowGenerate(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">Invoice #</label>
                    <input type="number" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">Customer</label>
                    <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">Invoice Date</label>
                    <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">Due Date</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-0.5">Memo</label>
                  <input type="text" value={memo} onChange={e => setMemo(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={chargeLabFees} onChange={e => setChargeLabFees(e.target.checked)} className="w-3.5 h-3.5" />
                  Include lab fees
                </label>

                <div className="border-t border-gray-100 pt-3">
                  <div className="text-xs font-semibold text-gray-500 mb-2">Line Items ({checkedRows.length})</div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {checkedRows.map(r => (
                      <div key={r.id} className="flex justify-between gap-2 text-xs">
                        <span className="text-gray-700 text-[10px] leading-tight">{r.text_for_invoice || r.program_nickname}</span>
                        <span className="font-medium shrink-0">{formatCurrency(r.line_amount + (chargeLabFees ? r.lab_fee_total : 0))}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-200">
                    <span>Total</span>
                    <span className="text-green-700">{formatCurrency(totalAmount + (chargeLabFees ? checkedRows.reduce((s, r) => s + r.lab_fee_total, 0) : 0))}</span>
                  </div>
                </div>

                {qbConnected && (
                  <div className="border-t border-gray-100 pt-3">
                    <div className="text-xs font-semibold text-gray-500 mb-1">Push to QuickBooks</div>
                    <select value={qbCustomerId} onChange={e => setQbCustomerId(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm mb-2">
                      <option value="">Select QB Customer...</option>
                      {qbCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <Button onClick={() => {
                      if (!qbCustomerId) return alert('Select a QB customer first');
                      const cust = qbCustomers.find(c => c.id === qbCustomerId);
                      qbInvoiceMutation.mutate({
                        customer_id: qbCustomerId,
                        customer_name: cust?.name || '',
                        due_date: dueDate,
                        memo,
                        program_ids: checkedRows.map(r => r.id),
                        line_items: checkedRows.flatMap(r => {
                          const items = [{
                            description: r.text_for_invoice || r.program_nickname,
                            qty: r.class_pricing_type_name === 'Flat Fee' ? (r.billable_sessions || 1) : (r.number_enrolled || 1),
                            rate: r.weekly_rate || 0,
                            amount: r.line_amount,
                          }];
                          if (chargeLabFees && r.lab_fee_total > 0) {
                            items.push({ description: `Lab fee - ${r.program_nickname}`, qty: 1, rate: r.lab_fee_total, amount: r.lab_fee_total });
                          }
                          return items;
                        }),
                      });
                    }} disabled={qbInvoiceMutation.isPending || !qbCustomerId}>
                      {qbInvoiceMutation.isPending ? 'Pushing...' : 'Push to QuickBooks'}
                    </Button>
                    {qbInvoiceMutation.isSuccess && <p className="text-xs text-green-600 mt-1">Invoice #{qbInvoiceMutation.data?.data?.invoice?.number} created in QB!</p>}
                    {qbInvoiceMutation.isError && <p className="text-xs text-red-600 mt-1">{qbInvoiceMutation.error?.response?.data?.error || 'QB push failed'}</p>}
                  </div>
                )}

                <div className="flex gap-2 border-t border-gray-100 pt-3">
                  <Button onClick={downloadCsv}>Download CSV</Button>
                  <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
                    {generateMutation.isPending ? 'Saving...' : 'Mark as Invoiced'}
                  </Button>
                </div>
                {generateMutation.isError && <p className="text-xs text-red-600">{generateMutation.error?.response?.data?.error || 'Failed'}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function InvoiceTypeSelector({ row }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (invoice_type) => api.put('/invoicing/set-invoice-type', {
      invoice_type,
      contractor_id: row.contractor_id || undefined,
      location_id: !row.contractor_id ? row.location_id : undefined,
    }),
    onSuccess: () => qc.invalidateQueries(['invoice-queue']),
  });

  return (
    <select onChange={e => { if (e.target.value) mutation.mutate(e.target.value); }} defaultValue=""
      disabled={mutation.isPending}
      className="text-[10px] px-1 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 font-medium cursor-pointer">
      <option value="">Set Type...</option>
      <option value="2nd Week">2nd Week</option>
      <option value="After Last Class">After Last Class</option>
      <option value="Monthly">Monthly</option>
    </select>
  );
}
