import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatCurrency } from '../lib/utils';
import api from '../api/client';

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  finalized: 'bg-green-100 text-green-700',
  superseded: 'bg-gray-100 text-gray-400 line-through',
};

function firstOfThisMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
}

export default function CommissionRunsPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(firstOfThisMonth());
  const [batchResult, setBatchResult] = useState(null);
  const [err, setErr] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['commission-runs', period],
    queryFn: () => api.get('/commission/admin/runs', { params: { period_start: period } }).then(r => r.data),
  });
  const runs = data?.data || [];

  const batchMut = useMutation({
    mutationFn: () => api.post('/commission/admin/runs/batch', { period_start: period }).then(r => r.data),
    onSuccess: (d) => { setBatchResult(d); qc.invalidateQueries(['commission-runs']); },
    onError: (e) => setErr(e.response?.data?.error || 'Batch failed'),
  });

  const createMut = useMutation({
    mutationFn: (user_id) => api.post('/commission/admin/runs', { user_id, period_start: period }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['commission-runs']),
    onError: (e) => setErr(e.response?.data?.error || 'Create failed'),
  });

  return (
    <AppShell>
      <PageHeader title="Commission Runs" />
      <div className="p-6 space-y-4 max-w-[1100px]">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500">Period starting</label>
            <input type="date" value={period} onChange={e => setPeriod(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm" />
            <Button onClick={() => batchMut.mutate()} disabled={batchMut.isPending}>
              {batchMut.isPending ? 'Starting...' : 'Start All Runs for this Period'}
            </Button>
            <Link to="/admin/commission/cleanup" className="text-xs text-[#1e3a5f] hover:underline ml-auto">Data Cleanup →</Link>
          </div>
          {batchResult && (
            <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-3 py-2">
              Processed {batchResult.results.length} salespeople —
              {batchResult.results.filter(r => r.run_id && !r.error).length} created/updated,
              {batchResult.results.filter(r => r.error).length} errors
            </div>
          )}
          {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
        </div>

        {isLoading ? <Spinner className="w-6 h-6" /> : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Salesperson</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Period</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-32">Status</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 w-32">Total Revenue</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 w-32">Total Payout</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No runs yet for this period — click "Start All Runs"</td></tr>
                ) : runs.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{r.first_name} {r.last_name}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDate(r.period_start)} — {formatDate(r.period_end)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_STYLES[r.status]}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.total_revenue)}</td>
                    <td className="px-3 py-2 text-right font-bold text-green-700">{formatCurrency(r.total_payout)}</td>
                    <td className="px-3 py-2 text-center">
                      <Link to={`/admin/commission/runs/${r.id}`} className="text-xs text-[#1e3a5f] hover:underline">Review →</Link>
                    </td>
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
