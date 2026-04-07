import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { SortTh } from '../components/ui/SortTh';

const STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', complete: 'Complete', rejected: 'Rejected', hired: 'Hired' };

export default function CandidatesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [area, setArea] = useState('');
  const [viewMode, setViewMode] = useState('mine'); // 'mine' or 'all'
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('created');
  const [dir, setDir] = useState('desc');

  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const handleSort = (col) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('desc'); }
    setPage(1);
  };

  const filters = {
    search: search || undefined, status: status || undefined,
    area: area || undefined, assignee: viewMode === 'mine' ? 'me' : undefined,
    sort, dir, page,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['candidates', filters],
    queryFn: () => api.get('/onboarding/candidates', { params: filters }).then(r => r.data),
  });

  const { data: dashData } = useQuery({
    queryKey: ['onboarding-dashboard'],
    queryFn: () => api.get('/onboarding/dashboard').then(r => r.data),
    staleTime: 30 * 1000,
  });

  const { data: myTasksData } = useQuery({
    queryKey: ['my-onboarding-tasks', viewMode],
    queryFn: () => api.get(`/onboarding/my-tasks?all=${viewMode === 'all'}`).then(r => r.data),
    staleTime: 30 * 1000,
  });

  const candidates = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 50;
  const dash = dashData?.data || {};
  const myTasks = myTasksData?.data || {};
  const myOpenReqs = (myTasks.requirements || []).length;
  const myOpenTasks = (myTasks.tasks || []).length;
  const today = new Date().toISOString().split('T')[0];
  const myOverdueReqs = (myTasks.requirements || []).filter(r => r.due_date && r.due_date < today).length;

  const reset = () => { setSearch(''); setStatus(''); setArea(''); setPage(1); };
  const hasFilters = search || status || area;

  return (
    <AppShell>
      <PageHeader title="Onboarding" action={
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => { setViewMode('mine'); setPage(1); }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'mine' ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              My Candidates
            </button>
            <button onClick={() => { setViewMode('all'); setPage(1); }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'all' ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              All
            </button>
          </div>
          <Link to="/candidates/new"><Button>+ New Candidate</Button></Link>
        </div>
      }>
        <Input placeholder="Search by name or email…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-60" />
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={area} onChange={e => { setArea(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Areas</option>
          {(ref.areas || []).map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
        </Select>
        {hasFilters && <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700 underline">Clear</button>}
      </PageHeader>

      <div className="p-6">
        {/* KPI cards */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Pending', value: dash.pending, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'In Progress', value: dash.inProgress, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: viewMode === 'mine' ? 'My Overdue Reqs' : 'Overdue Reqs', value: viewMode === 'mine' ? myOverdueReqs : dash.overdueReqs, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Pending Approvals', value: dash.pendingApprovals, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: viewMode === 'mine' ? 'My Open Tasks' : 'Open Tasks', value: viewMode === 'mine' ? myOpenReqs + myOpenTasks : dash.openTasks, color: 'text-violet-600', bg: 'bg-violet-50' },
          ].map(kpi => (
            <div key={kpi.label} className={`${kpi.bg} rounded-lg p-4 border border-gray-100`}>
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value ?? '—'}</div>
              <div className="text-xs text-gray-500 mt-0.5">{kpi.label}</div>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <SortTh col="name" sort={sort} dir={dir} onSort={handleSort}>Name</SortTh>
                    <SortTh col="area" sort={sort} dir={dir} onSort={handleSort}>Area</SortTh>
                    <SortTh col="status" sort={sort} dir={dir} onSort={handleSort}>Status</SortTh>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Onboarder / Trainer</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-700 w-24">Checklist</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-700 w-20">Tasks</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-700 w-20">Login</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-700 w-16">Msgs</th>
                    <SortTh col="first_class" sort={sort} dir={dir} onSort={handleSort}>First Class</SortTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {candidates.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-12 text-gray-400">No candidates found</td></tr>
                  ) : candidates.map((c, i) => {
                    const progress = c.total_reqs > 0 ? Math.round(((c.total_reqs - c.open_reqs) / c.total_reqs) * 100) : 0;
                    return (
                      <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-2.5">
                          <Link to={`/candidates/${c.id}`} className="font-medium text-[#1e3a5f] hover:underline">{c.full_name}</Link>
                          <div className="text-xs text-gray-400">{c.email}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{c.geographic_area_name || '—'}</td>
                        <td className="px-4 py-2.5"><Badge status={STATUS_LABELS[c.status] || c.status} /></td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">
                          {c.onboarder_name && <div>{c.onboarder_name}</div>}
                          {c.trainer_name && <div className="text-gray-400">{c.trainer_name}</div>}
                          {!c.onboarder_name && !c.trainer_name && '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.total_reqs > 0 ? (
                            <div className="flex items-center gap-1.5 justify-center">
                              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${progress === 100 ? 'bg-green-500' : 'bg-[#1e3a5f]'}`}
                                  style={{ width: `${progress}%` }} />
                              </div>
                              <span className="text-[10px] text-gray-500">{c.total_reqs - c.open_reqs}/{c.total_reqs}</span>
                            </div>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.open_tasks > 0 ? (
                            <span className="inline-block px-1.5 py-0.5 text-xs bg-amber-100 text-amber-800 rounded font-medium">{c.open_tasks}</span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.has_login ? (
                            <div>
                              <span className="text-green-600 text-xs font-medium">Active</span>
                              {c.last_login_at && (
                                <div className="text-[10px] text-gray-400">{new Date(c.last_login_at).toLocaleDateString()}</div>
                              )}
                            </div>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.candidate_messages > 0 ? (
                            <span className="inline-block px-1.5 py-0.5 text-xs bg-violet-100 text-violet-800 rounded font-medium">{c.candidate_messages}</span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">
                          {c.first_class_date ? new Date(c.first_class_date).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>{total} candidate{total !== 1 ? 's' : ''}</span>
              {total > limit && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <span className="py-1.5 px-2">Page {page}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={candidates.length < limit}>Next</Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
