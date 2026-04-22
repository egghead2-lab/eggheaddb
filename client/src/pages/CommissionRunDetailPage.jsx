import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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

export default function CommissionRunDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [err, setErr] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['commission-run', id],
    queryFn: () => api.get(`/commission/admin/runs/${id}`).then(r => r.data),
  });
  const run = data?.data;
  const lines = run?.lines || [];

  const invalidate = () => qc.invalidateQueries(['commission-run', id]);

  const m = {
    recalc: useMutation({ mutationFn: () => api.post(`/commission/admin/runs/${id}/recalculate`), onSuccess: invalidate, onError: (e) => setErr(e.response?.data?.error || 'Failed') }),
    submit: useMutation({ mutationFn: () => api.post(`/commission/admin/runs/${id}/submit`), onSuccess: invalidate, onError: (e) => setErr(e.response?.data?.error || 'Failed') }),
    approve: useMutation({ mutationFn: () => api.post(`/commission/admin/runs/${id}/approve`), onSuccess: invalidate, onError: (e) => setErr(e.response?.data?.error || 'Failed') }),
    finalize: useMutation({ mutationFn: () => api.post(`/commission/admin/runs/${id}/finalize`), onSuccess: invalidate, onError: (e) => setErr(e.response?.data?.error || 'Failed') }),
    reopen: useMutation({ mutationFn: () => api.post(`/commission/admin/runs/${id}/reopen`), onSuccess: (d) => { invalidate(); if (d.data?.id) window.location.href = `/admin/commission/runs/${d.data.id}`; }, onError: (e) => setErr(e.response?.data?.error || 'Failed') }),
    line: useMutation({ mutationFn: ({ lineId, patch }) => api.patch(`/commission/admin/runs/${id}/lines/${lineId}`, patch), onSuccess: invalidate, onError: (e) => setErr(e.response?.data?.error || 'Failed') }),
  };

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  if (!run) return <AppShell><div className="p-6">Not found</div></AppShell>;

  const visibleLines = lines.filter(l => filter === 'all' || l.line_type === filter);
  const locked = run.status === 'finalized' || run.status === 'superseded';

  return (
    <AppShell>
      <PageHeader title={`${run.first_name} ${run.last_name} — ${formatDate(run.period_start)} to ${formatDate(run.period_end)}`}
        action={<Link to="/admin/commission" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← All Runs</Link>} />

      <div className="p-6 space-y-4 max-w-[1200px]">
        {err && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex justify-between">
            <span>{err}</span>
            <button onClick={() => setErr(null)} className="text-xs text-red-400">Dismiss</button>
          </div>
        )}

        {/* Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_STYLES[run.status]}`}>{run.status.replace('_', ' ')}</span>
            <span className="text-sm text-gray-500">Plan: {formatCurrency(run.monthly_quota)} quota · {(run.initial_rate * 100).toFixed(2)}% initial · {(run.rebook_rate * 100).toFixed(2)}% rebook · {formatCurrency(run.non_retained_flat_fee)} flat</span>
          </div>
          <div className="grid grid-cols-5 gap-3">
            <Kpi label="Total Revenue" value={formatCurrency(run.total_revenue)} />
            <Kpi label="Above Quota" value={formatCurrency(run.above_quota)} />
            <Kpi label="Initial / Rebook" value={`${formatCurrency(run.initial_revenue)} / ${formatCurrency(run.rebook_revenue)}`} small />
            <Kpi label="Retained $" value={formatCurrency(run.retained_commission)} color="blue" />
            <Kpi label="Non-Retained $" value={formatCurrency(run.non_retained_commission)} color="amber" />
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Total Payout</div>
              <div className="text-2xl font-bold text-green-700">{formatCurrency(run.total_payout)}</div>
              {parseFloat(run.prior_month_adjustment) !== 0 && (
                <div className="text-[10px] text-gray-500">includes {formatCurrency(run.prior_month_adjustment)} prior-month adjustment</div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {!locked && <Button onClick={() => m.recalc.mutate()} disabled={m.recalc.isPending}>Recalculate</Button>}
              {run.status === 'draft' && <Button onClick={() => m.submit.mutate()} disabled={m.submit.isPending}>Submit for Review</Button>}
              {run.status === 'pending_approval' && <Button onClick={() => m.approve.mutate()}>Approve</Button>}
              {run.status === 'approved' && (
                <button onClick={() => m.finalize.mutate()} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700">
                  Finalize & Close
                </button>
              )}
              {run.status === 'finalized' && <Button onClick={() => m.reopen.mutate()}>Reopen</Button>}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {['all', 'retained', 'non_retained'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded border ${filter === f ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {f === 'all' ? `All (${lines.length})` : f === 'retained' ? `Retained (${lines.filter(l => l.line_type === 'retained').length})` : `Non-Retained (${lines.filter(l => l.line_type === 'non_retained').length})`}
            </button>
          ))}
        </div>

        {/* Lines */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-2 py-2 font-medium text-gray-600">Program</th>
                <th className="text-left px-2 py-2 font-medium text-gray-600">Contractor / Location</th>
                <th className="text-center px-2 py-2 font-medium text-gray-600 w-20">Type</th>
                <th className="text-center px-2 py-2 font-medium text-gray-600 w-20">Booking</th>
                <th className="text-right px-2 py-2 font-medium text-gray-600 w-24">Revenue</th>
                <th className="text-center px-2 py-2 font-medium text-gray-600 w-16">×Mult</th>
                <th className="text-center px-2 py-2 font-medium text-gray-600 w-16">Split</th>
                <th className="text-right px-2 py-2 font-medium text-gray-600 w-24">Line $</th>
                <th className="text-center px-2 py-2 font-medium text-gray-600 w-20">Reqs</th>
                <th className="text-center px-2 py-2 font-medium text-gray-600 w-20">Approved</th>
                <th className="text-center px-2 py-2 font-medium text-gray-600 w-20">Exclude</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleLines.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-gray-400">No lines</td></tr>
              ) : visibleLines.map(l => (
                <tr key={l.id} className={l.excluded ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'}>
                  <td className="px-2 py-1.5 font-medium">
                    <Link to={`/programs/${l.program_id}`} className="text-[#1e3a5f] hover:underline">{l.program_nickname}</Link>
                  </td>
                  <td className="px-2 py-1.5 text-gray-600">{l.contractor_name ? `${l.contractor_name} · ${l.location_nickname}` : l.location_nickname}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${l.line_type === 'retained' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {l.line_type === 'retained' ? 'Retained' : 'Non-Ret'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${l.booking_type_effective === 'initial' ? 'bg-green-100 text-green-700 font-medium' : 'bg-gray-100 text-gray-600'}`}>
                      {l.booking_type_effective}
                    </span>
                    {l.booking_type_original !== l.booking_type_effective && <div className="text-[9px] text-amber-600">was {l.booking_type_original}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-right">{formatCurrency(l.program_revenue)}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{parseFloat(l.adjustment_multiplier).toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{(parseFloat(l.split_pct) * 100).toFixed(0)}%</td>
                  <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(l.line_revenue)}</td>
                  <td className="px-2 py-1.5 text-center text-[10px]">
                    {l.line_type === 'non_retained' ? (
                      <span className={l.requirements_met ? 'text-green-600' : 'text-red-600'}>
                        {l.requirements_met ? '✓ All' : `${[l.req_enrollment_hit, l.req_margin_hit, l.req_booked_3wk_hit, l.req_program_ran].filter(Boolean).length}/4`}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={!!l.approved} disabled={locked}
                      onChange={e => m.line.mutate({ lineId: l.id, patch: { approved: e.target.checked } })}
                      className="accent-[#1e3a5f]" />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={!!l.excluded} disabled={locked}
                      onChange={e => {
                        if (e.target.checked) {
                          const reason = prompt('Exclusion reason:');
                          if (reason !== null) m.line.mutate({ lineId: l.id, patch: { excluded: true, exclusion_reason: reason } });
                        } else m.line.mutate({ lineId: l.id, patch: { excluded: false } });
                      }}
                      className="accent-red-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, color, small }) {
  const colorCls = color === 'blue' ? 'text-blue-700' : color === 'amber' ? 'text-amber-700' : 'text-gray-800';
  return (
    <div className="bg-gray-50 rounded px-3 py-2">
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className={`${small ? 'text-xs' : 'text-lg'} font-bold ${colorCls}`}>{value}</div>
    </div>
  );
}
