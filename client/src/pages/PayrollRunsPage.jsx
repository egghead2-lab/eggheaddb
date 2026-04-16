import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRunsRocketology, createRunRocketology, calculateRunRocketology, exportCsvRocketology, getCsvPreview } from '../api/payroll';
import { AppShell } from '../components/layout/AppShell';
import { PayrollTabBar } from './PayrollDashboardPage';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatCurrency } from '../lib/utils';

export default function PayrollRunsPage() {
  const qc = useQueryClient();
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [previewRunId, setPreviewRunId] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['payroll-runs'], queryFn: getRunsRocketology });
  const runs = data?.data || [];
  const createMutation = useMutation({ mutationFn: (d) => createRunRocketology(d), onSuccess: () => { qc.invalidateQueries(['payroll-runs']); setNewStart(''); setNewEnd(''); } });
  const calcMutation = useMutation({ mutationFn: (id) => calculateRunRocketology(id), onSuccess: () => qc.invalidateQueries(['payroll-runs']) });

  const handlePreview = async (runId) => {
    if (previewRunId === runId) { setPreviewRunId(null); return; }
    const res = await getCsvPreview(runId);
    setPreviewData(res.data || []); setPreviewRunId(runId);
  };

  return (
    <AppShell>
      <PayrollTabBar />
      <div className="p-6 space-y-4">
        <div className="flex gap-3 items-end">
          <div className="flex flex-col gap-0.5"><label className="text-xs font-medium text-gray-700">Start</label><input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" /></div>
          <div className="flex flex-col gap-0.5"><label className="text-xs font-medium text-gray-700">End</label><input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" /></div>
          <Button onClick={() => newStart && newEnd && createMutation.mutate({ start_date: newStart, end_date: newEnd })} disabled={!newStart || !newEnd || createMutation.isPending}>Create Run</Button>
        </div>

        {isLoading ? <Spinner className="w-6 h-6" /> : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200"><tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Period</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Notes</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600 w-40">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {runs.length === 0 ? <tr><td colSpan={4} className="text-center py-8 text-gray-400">No runs</td></tr> : runs.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium">{formatDate(r.start_date)} — {formatDate(r.end_date)}</td>
                    <td className="px-3 py-2 text-center"><Badge status={r.status} /></td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{r.notes || '—'}</td>
                    <td className="px-3 py-2 text-center"><div className="flex gap-2 justify-center">
                      <button onClick={() => calcMutation.mutate(r.id)} className="text-xs text-[#1e3a5f] hover:underline">Calculate</button>
                      <button onClick={() => handlePreview(r.id)} className="text-xs text-[#1e3a5f] hover:underline">{previewRunId === r.id ? 'Hide' : 'Preview'}</button>
                      <a href={exportCsvRocketology(r.id)} className="text-xs text-[#1e3a5f] hover:underline">CSV</a>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {previewRunId && previewData && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">CSV Preview — {previewData.length} professors</div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200"><tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Gusto ID</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Hours</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Bonus</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Reimb</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600 font-bold">Total</th>
                <th className="text-center px-2 py-2 font-medium text-gray-600">Flags</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {previewData.map(r => (
                  <tr key={r.id} className={r.has_missing_assist_pay ? 'bg-red-50/30' : ''}>
                    <td className="px-3 py-1.5 font-medium">{r.first_name} {r.last_name}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-500">{r.gusto_employee_id}</td>
                    <td className="px-3 py-1.5 text-right">{r.regular_hours}</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(r.bonus)}</td>
                    <td className="px-3 py-1.5 text-right">{formatCurrency(r.reimbursement)}</td>
                    <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatCurrency(r.total_gross_pay)}</td>
                    <td className="px-2 py-1.5 text-center">{r.has_missing_assist_pay && <span className="text-red-500 text-[10px] font-bold">MISSING</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
