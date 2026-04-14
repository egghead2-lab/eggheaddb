import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Section } from '../../components/ui/Section';
import { CopyableTable } from '../../components/ui/CopyableTable';
import { formatDate, formatCurrency } from '../../lib/utils';

function getDefaultMonth() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return { month: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0],
    end: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0] };
}

export default function MonthlyInvoicingPage() {
  const qc = useQueryClient();
  const def = getDefaultMonth();
  const [startDate, setStartDate] = useState(def.start);
  const [endDate, setEndDate] = useState(def.end);
  const [billingMonth, setBillingMonth] = useState(def.month);

  const { data, isLoading } = useQuery({
    queryKey: ['monthly-invoicing', startDate, endDate],
    queryFn: () => api.get('/invoicing/monthly', { params: { start_date: startDate, end_date: endDate } }).then(r => r.data),
  });
  const groups = data?.data || [];
  const lastQb = data?.lastQbInvoice || 0;

  return (
    <AppShell>
      <PageHeader title="Monthly Invoicing" action={
        lastQb > 0 && <span className="text-xs text-gray-400">Last QB Invoice #: {lastQb}</span>
      } />

      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Billing Month</label>
          <input type="text" value={billingMonth} onChange={e => setBillingMonth(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs w-36" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Start</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">End</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs" />
        </div>
      </div>

      <div className="p-6 space-y-4">
        {isLoading ? <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div> : groups.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No monthly contractors with sessions in this period</div>
        ) : groups.map(group => (
          <ContractorGroup key={group.contractor_id + '_' + (group.location_id || '')} group={group}
            billingMonth={billingMonth} startDate={startDate} endDate={endDate} lastQb={lastQb} qc={qc} />
        ))}
      </div>
    </AppShell>
  );
}

function ContractorGroup({ group, billingMonth, startDate, endDate, lastQb, qc }) {
  const [invoiceNum, setInvoiceNum] = useState(String(lastQb + 1));
  const today = new Date().toISOString().split('T')[0];
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; });
  const [memo, setMemo] = useState(`Services Rendered - ${billingMonth}`);
  const [customerName, setCustomerName] = useState(group.customer_name || '');
  const [chargeLabFees, setChargeLabFees] = useState(false);

  const totalWithFees = group.total + (chargeLabFees ? group.programs.reduce((s, p) => s + p.lab_fee_total, 0) : 0);

  const generateMutation = useMutation({
    mutationFn: (data) => api.post('/invoicing/generate', data),
    onSuccess: () => qc.invalidateQueries(['monthly-invoicing']),
  });

  const handleGenerate = () => {
    generateMutation.mutate({
      invoice_number: parseInt(invoiceNum),
      invoice_type: 'Monthly',
      contractor_id: group.contractor_id,
      location_id: group.location_id,
      billing_month: billingMonth,
      billing_period_start: startDate,
      billing_period_end: endDate,
      invoice_date: invoiceDate,
      due_date: dueDate,
      memo,
      customer_name: customerName,
      total_amount: totalWithFees,
      qb_invoice_number: parseInt(invoiceNum),
      charge_lab_fees: chargeLabFees,
      programs: group.programs.map(p => ({
        program_id: p.id,
        line_amount: p.invoice_amount,
        lab_fee_amount: p.lab_fee_total,
        status: 'completed',
      })),
    });
  };

  const downloadCsv = () => {
    const headers = ['*InvoiceNo','*Customer','*InvoiceDate','*DueDate','Terms','Location','Memo','Item(Product/Service)','ItemDescription','ItemQuantity','ItemRate','*ItemAmount','Service Date'];
    const csvRows = [headers.join(',')];
    group.programs.forEach(p => {
      const itemType = `Enrichment Classes:${p.program_type_name || 'Science'} Class`;
      const desc = `${p.school_name || p.location_nickname || ''} - ${p.program_nickname} (${p.date_list || ''})`;
      csvRows.push([invoiceNum, `"${customerName}"`, invoiceDate, dueDate, 'Net 30', `"${p.location_nickname || ''}"`, `"${memo}"`, `"${itemType}"`, `"${desc}"`, p.dates_in_period, p.weekly_rate.toFixed(2), p.invoice_amount.toFixed(2), ''].join(','));
      if (chargeLabFees && p.lab_fee_total > 0) {
        csvRows.push([invoiceNum, `"${customerName}"`, invoiceDate, dueDate, 'Net 30', `"${p.location_nickname || ''}"`, `"${memo}"`, '"Lab Fee"', `"Lab fee - ${p.program_nickname}"`, 1, p.lab_fee_total.toFixed(2), p.lab_fee_total.toFixed(2), ''].join(','));
      }
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `monthly_${invoiceNum}_${group.contractor_name || 'invoice'}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Section title={
      <div className="flex items-center gap-3">
        <span>{group.contractor_name}{group.location_name ? ` - ${group.location_name}` : ''}</span>
        <span className="text-sm font-bold text-green-700">{formatCurrency(group.total)}</span>
        <span className="text-[10px] text-gray-400">{group.programs.length} programs</span>
      </div>
    } defaultOpen={false}>
      <CopyableTable className="mb-4">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium text-gray-600">Program</th>
              <th className="text-left px-2 py-1.5 font-medium text-gray-600">Location</th>
              <th className="text-left px-2 py-1.5 font-medium text-gray-600">Dates</th>
              <th className="text-right px-2 py-1.5 font-medium text-gray-600"># Dates</th>
              <th className="text-right px-2 py-1.5 font-medium text-gray-600">Rate/Week</th>
              <th className="text-right px-2 py-1.5 font-medium text-gray-600">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {group.programs.map(p => (
              <tr key={p.id}>
                <td className="px-2 py-1.5"><Link to={`/programs/${p.id}`} className="text-[#1e3a5f] hover:underline font-medium">{p.program_nickname}</Link></td>
                <td className="px-2 py-1.5 text-gray-600">{p.location_nickname || '—'}</td>
                <td className="px-2 py-1.5 text-gray-500">{p.date_list || '—'}</td>
                <td className="px-2 py-1.5 text-right">{p.dates_in_period}</td>
                <td className="px-2 py-1.5 text-right">{formatCurrency(p.weekly_rate)}</td>
                <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(p.invoice_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CopyableTable>

      <div className="grid grid-cols-4 gap-3 mb-3">
        <div><label className="text-[10px] text-gray-500">Invoice #</label><input type="number" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" /></div>
        <div><label className="text-[10px] text-gray-500">Customer</label><input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" /></div>
        <div><label className="text-[10px] text-gray-500">Invoice Date</label><input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" /></div>
        <div><label className="text-[10px] text-gray-500">Due Date</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" /></div>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <input type="text" value={memo} onChange={e => setMemo(e.target.value)} placeholder="Memo" className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
        <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={chargeLabFees} onChange={e => setChargeLabFees(e.target.checked)} className="w-3.5 h-3.5" />Lab fees</label>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-green-700">Total: {formatCurrency(totalWithFees)}</span>
        <div className="flex-1" />
        <Button onClick={downloadCsv}>Download CSV</Button>
        <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
          {generateMutation.isPending ? 'Saving...' : 'Mark Sent'}
        </Button>
      </div>
      {generateMutation.isSuccess && <p className="text-xs text-green-600 mt-2">Invoice recorded</p>}
    </Section>
  );
}
