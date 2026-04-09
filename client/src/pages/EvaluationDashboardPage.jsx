import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Section } from '../components/ui/Section';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

const RATING_LABELS = { 1: 'Emerging', 2: 'Developing', 3: 'Performing', 4: 'Excelling', 5: 'Distinguished' };
const RATING_COLORS = {
  1: 'bg-red-100 text-red-700 border-red-300',
  2: 'bg-orange-100 text-orange-700 border-orange-300',
  3: 'bg-amber-100 text-amber-700 border-amber-300',
  4: 'bg-green-100 text-green-700 border-green-300',
  5: 'bg-blue-100 text-blue-700 border-blue-300',
};
function RatingBadge({ rating }) {
  if (!rating) return <span className="text-gray-300 text-xs">—</span>;
  const r = Math.round(rating);
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold ${RATING_COLORS[r] || 'bg-gray-100 text-gray-600'}`}>
      {r} {RATING_LABELS[r] || ''}
    </span>
  );
}

const RESULT_COLORS = {
  pass: 'bg-green-100 text-green-700',
  needs_improvement: 'bg-amber-100 text-amber-700',
  fail: 'bg-red-100 text-red-700',
};

export default function EvaluationDashboardPage() {
  const { user } = useAuth();
  const isAdmin = ['Admin', 'CEO'].includes(user?.role);
  const qc = useQueryClient();
  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  const [areaFilter, setAreaFilter] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['eval-dashboard', areaFilter],
    queryFn: () => api.get('/evaluations/dashboard', { params: { area_id: areaFilter || undefined } }).then(r => r.data),
  });

  const professors = data?.data || [];
  const tiers = data?.tiers || [];

  const overdue = professors.filter(p => p.is_overdue);
  const neverEvaled = professors.filter(p => p.never_evaluated && !p.is_overdue);
  const upcoming = professors.filter(p => !p.is_overdue && !p.never_evaluated && p.days_until_due !== null && p.days_until_due <= 30);
  const onTrack = professors.filter(p => !p.is_overdue && !p.never_evaluated && (p.days_until_due === null || p.days_until_due > 30));

  // Group overdue by area
  const overdueByArea = {};
  overdue.forEach(p => {
    const area = p.geographic_area_name || 'Unknown';
    if (!overdueByArea[area]) overdueByArea[area] = [];
    overdueByArea[area].push(p);
  });

  return (
    <AppShell>
      <PageHeader title="Evaluation Dashboard" action={
        <div className="flex items-center gap-3">
          <Select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="w-44">
            <option value="">All My Areas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
          </Select>
          {isAdmin && (
            <button type="button" onClick={() => setShowConfig(v => !v)}
              className="text-xs text-gray-500 hover:text-[#1e3a5f] underline">
              {showConfig ? 'Hide Config' : 'Schedule Config'}
            </button>
          )}
        </div>
      } />

      <div className="p-6 space-y-6">
        {/* Admin config */}
        {showConfig && <EvalConfigPanel tiers={tiers} />}

        {/* KPI summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-red-50 rounded-lg p-4 border border-red-100">
            <div className="text-2xl font-bold text-red-600">{overdue.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Overdue</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
            <div className="text-2xl font-bold text-amber-600">{neverEvaled.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Never Evaluated</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <div className="text-2xl font-bold text-blue-600">{upcoming.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Due Within 30 Days</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-100">
            <div className="text-2xl font-bold text-green-600">{onTrack.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">On Track</div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            {/* Overdue — by area */}
            {overdue.length > 0 && (
              <Section title={`Overdue Evaluations (${overdue.length})`} defaultOpen={true}>
                {Object.entries(overdueByArea).map(([area, profs]) => (
                  <div key={area} className="mb-4">
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">{area} ({profs.length})</div>
                    <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
                      <table className="w-full text-xs table-fixed">
                        <colgroup><col style={{width:'25%'}}/><col style={{width:'12%'}}/><col style={{width:'14%'}}/><col style={{width:'14%'}}/><col style={{width:'12%'}}/><col style={{width:'12%'}}/></colgroup>
                        <thead className="bg-red-50 border-b border-red-200">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium text-gray-600">Professor</th>
                            <th className="text-left px-2 py-1.5 font-medium text-gray-600">Tier</th>
                            <th className="text-left px-2 py-1.5 font-medium text-gray-600">Last Eval</th>
                            <th className="text-center px-2 py-1.5 font-medium text-gray-600">Rating</th>
                            <th className="text-left px-2 py-1.5 font-medium text-gray-600">Area</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-600">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {profs.map(p => (
                            <tr key={p.id} className="bg-red-50/30">
                              <td className="px-3 py-1.5 truncate">
                                <Link to={`/professors/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.professor_nickname} {p.last_name}</Link>
                              </td>
                              <td className="px-2 py-1.5 text-gray-600">{p.tier_name}</td>
                              <td className="px-2 py-1.5 text-gray-500">{p.last_evaluation_date ? formatDate(p.last_evaluation_date) : 'Never'}</td>
                              <td className="px-2 py-1.5 text-center"><RatingBadge rating={p.current_rating} /></td>
                              <td className="px-2 py-1.5 text-gray-500">{p.geographic_area_name || '—'}</td>
                              <td className="px-2 py-1.5 text-right font-bold text-red-600">{p.overdue_days}d overdue</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Never evaluated */}
            {neverEvaled.length > 0 && (
              <Section title={`Never Evaluated (${neverEvaled.length})`} defaultOpen={true}>
                <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-50 border-b border-amber-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Area</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Hire Date</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Days on Staff</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Tier</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {neverEvaled.map(p => (
                        <tr key={p.id}>
                          <td className="px-3 py-2">
                            <Link to={`/professors/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.professor_nickname} {p.last_name}</Link>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">{p.geographic_area_name || '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{p.hire_date ? formatDate(p.hire_date) : '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{p.days_on_staff !== null ? `${p.days_on_staff}d` : '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{p.tier_name}</td>
                          <td className="px-3 py-2 text-right">
                            {p.days_until_due !== null && p.days_until_due <= 0 ? (
                              <span className="text-xs font-bold text-red-600">Overdue</span>
                            ) : p.days_until_due !== null ? (
                              <span className="text-xs text-amber-600">Due in {p.days_until_due}d</span>
                            ) : (
                              <span className="text-xs text-gray-400">No hire date</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* Due within 30 days */}
            {upcoming.length > 0 && (
              <Section title={`Due Within 30 Days (${upcoming.length})`} defaultOpen={true}>
                <EvalTable professors={upcoming} statusCol="due" />
              </Section>
            )}

            {/* On track — collapsed */}
            {onTrack.length > 0 && (
              <Section title={`On Track (${onTrack.length})`} defaultOpen={false}>
                <EvalTable professors={onTrack} statusCol="due" />
              </Section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

// Reusable evaluation table with aligned columns
function EvalTable({ professors, statusCol }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-xs table-fixed">
        <colgroup><col style={{width:'22%'}}/><col style={{width:'12%'}}/><col style={{width:'12%'}}/><col style={{width:'16%'}}/><col style={{width:'12%'}}/><col style={{width:'14%'}}/><col style={{width:'12%'}}/></colgroup>
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-2 py-2 font-medium text-gray-600">Professor</th>
            <th className="text-left px-2 py-2 font-medium text-gray-600">Area</th>
            <th className="text-left px-2 py-2 font-medium text-gray-600">Last Eval</th>
            <th className="text-center px-2 py-2 font-medium text-gray-600">Rating</th>
            <th className="text-left px-2 py-2 font-medium text-gray-600">Tier</th>
            <th className="text-left px-2 py-2 font-medium text-gray-600">Evaluator</th>
            <th className="text-right px-2 py-2 font-medium text-gray-600">{statusCol === 'due' ? 'Due In' : 'Status'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {professors.map((p, i) => (
            <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              <td className="px-2 py-1.5 truncate">
                <Link to={`/professors/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.professor_nickname} {p.last_name}</Link>
              </td>
              <td className="px-2 py-1.5 text-gray-600 truncate">{p.geographic_area_name || '—'}</td>
              <td className="px-2 py-1.5 text-gray-600">{p.last_evaluation_date ? formatDate(p.last_evaluation_date) : 'Never'}</td>
              <td className="px-2 py-1.5 text-center"><RatingBadge rating={p.current_rating} /></td>
              <td className="px-2 py-1.5 text-gray-600">{p.tier_name}</td>
              <td className="px-2 py-1.5 text-gray-500 truncate">{p.evaluator_name || '—'}</td>
              <td className="px-2 py-1.5 text-right font-medium">
                {p.is_overdue ? <span className="text-red-600">{p.overdue_days}d overdue</span>
                  : p.days_until_due != null ? <span className={p.days_until_due <= 14 ? 'text-amber-600' : 'text-green-600'}>{p.days_until_due}d</span>
                  : <span className="text-gray-400">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Admin evaluation schedule config panel
function EvalConfigPanel({ tiers: initialTiers }) {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['evaluation-config'],
    queryFn: () => api.get('/evaluations/schedule-config').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const tiers = data?.data || initialTiers || [];

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/evaluations/schedule-config/${id}`, data),
    onSuccess: () => qc.invalidateQueries(['evaluation-config']),
  });

  return (
    <Section title="Evaluation Schedule Config" defaultOpen={true}>
      <p className="text-xs text-gray-500 mb-3">
        Controls how frequently professors need evaluations based on how long they've been on staff.
        Changes apply immediately to all professors.
      </p>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Tier</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Min Days</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Max Days</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Frequency (days)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tiers.map(t => (
              <tr key={t.id}>
                <td className="px-3 py-2">
                  <input defaultValue={t.tier_name}
                    onBlur={e => { if (e.target.value !== t.tier_name) updateMutation.mutate({ id: t.id, data: { tier_name: e.target.value } }); }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs w-full" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" defaultValue={t.min_days_on_staff}
                    onBlur={e => { if (Number(e.target.value) !== t.min_days_on_staff) updateMutation.mutate({ id: t.id, data: { min_days_on_staff: Number(e.target.value) } }); }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs w-20" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" defaultValue={t.max_days_on_staff ?? ''}
                    placeholder="∞"
                    onBlur={e => { updateMutation.mutate({ id: t.id, data: { max_days_on_staff: e.target.value || null } }); }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs w-20" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" defaultValue={t.frequency_days}
                    onBlur={e => { if (Number(e.target.value) !== t.frequency_days) updateMutation.mutate({ id: t.id, data: { frequency_days: Number(e.target.value) } }); }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs w-20 font-medium" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {updateMutation.isSuccess && <p className="text-xs text-green-600 mt-1">Saved</p>}
    </Section>
  );
}
