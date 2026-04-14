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

  const { data, isLoading } = useQuery({
    queryKey: ['invoice-queue', contractor, invType, statusFilter],
    queryFn: () => api.get('/invoicing/queue', { params: { contractor_id: contractor || undefined, invoice_type: invType || undefined, status: statusFilter || undefined } }).then(r => r.data),
  });
  const rows = data?.data || [];
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
      const itemType = `Enrichment Classes:${r.program_type_name || 'Science'} Class`;
      const desc = `${r.school_name || r.location_nickname || ''} - ${r.program_nickname}`;
      const qty = r.class_pricing_type_name === 'Flat Fee' ? (r.sessions_completed || 1) : (r.number_enrolled || 1);
      const rate = r.class_pricing_type_name === 'Flat Fee' ? (r.line_amount / qty) : (parseFloat(r.our_cut) || 0);
      csvRows.push([invoiceNum, `"${customerName}"`, invoiceDate, dueDate, 'Net 30', `"${r.location_nickname || ''}"`, `"${memo}"`, `"${itemType}"`, `"${desc}"`, qty, rate.toFixed(2), r.line_amount.toFixed(2), ''].join(','));
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
        checked.size > 0 && <Button onClick={openGenerate}>Generate Invoice ({checked.size} programs)</Button>
      } />

      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <Select value={invType} onChange={e => setInvType(e.target.value)} className="w-40">
          <option value="">All Types</option>
          <option value="2nd Week">2nd Week</option>
          <option value="After Last Class">After Last Class</option>
        </Select>
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-32">
          <option value="">Not Invoiced</option>
          <option value="Ready">Ready</option>
          <option value="All">All</option>
        </Select>
        {lastQb > 0 && <span className="text-xs text-gray-400 ml-auto">Last QB Invoice #: {lastQb}</span>}
      </div>

      <div className="p-6 flex gap-6">
        <div className={showGenerate ? 'w-[60%]' : 'w-full'}>
          {isLoading ? <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div> : rows.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No programs in queue</div>
          ) : (
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
                    <th className="text-right px-2 py-2 font-medium text-gray-600">Cost</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-600">Lab Fee</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-600">Total</th>
                    <th className="text-center px-2 py-2 font-medium text-gray-600">Status</th>
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
                      <td className="px-2 py-2 text-gray-500">{r.effective_invoice_type}</td>
                      <td className="px-2 py-2 text-gray-600">{r.actual_last_date ? formatDate(r.actual_last_date) : '—'}</td>
                      <td className="px-2 py-2 text-right">{r.number_enrolled ?? '—'}</td>
                      <td className="px-2 py-2 text-right">{formatCurrency(r.line_amount)}</td>
                      <td className="px-2 py-2 text-right">{r.lab_fee_total > 0 ? formatCurrency(r.lab_fee_total) : '—'}</td>
                      <td className="px-2 py-2 text-right font-medium">{formatCurrency(r.total)}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-500'}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CopyableTable>
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
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {checkedRows.map(r => (
                      <div key={r.id} className="flex justify-between text-xs">
                        <span className="text-gray-700 truncate">{r.program_nickname}</span>
                        <span className="font-medium">{formatCurrency(r.line_amount + (chargeLabFees ? r.lab_fee_total : 0))}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-200">
                    <span>Total</span>
                    <span className="text-green-700">{formatCurrency(totalAmount + (chargeLabFees ? checkedRows.reduce((s, r) => s + r.lab_fee_total, 0) : 0))}</span>
                  </div>
                </div>

                <div className="flex gap-2">
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
