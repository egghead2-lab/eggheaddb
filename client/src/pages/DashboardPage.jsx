import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { getMyDashboard, runReport } from '../api/reports';
import { Button } from '../components/ui/Button';
import { formatDate } from '../lib/utils';
import api from '../api/client';

export default function DashboardPage() {
  const { user } = useAuth();
  const name = user?.name || 'there';
  const role = user?.role || '';

  const { data: kpiData } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: () => api.get('/dashboard-kpis').then(r => r.data),
    staleTime: 60 * 1000,
  });
  const kpi = kpiData?.data || {};

  return (
    <AppShell>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {name.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-1">{role} Dashboard</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-7 gap-4 mb-6">
          <KpiCard label="Active Programs" value={kpi.activePrograms} link="/programs" />
          <KpiCard label="Unconfirmed" value={kpi.unconfirmedPrograms} link="/programs" color={kpi.unconfirmedPrograms > 0 ? 'amber' : ''} />
          <KpiCard label="Sessions (7 days)" value={kpi.upcomingSessions7d} />
          <KpiCard label="Overdue Reviews" value={kpi.overdueLessons} link="/lessons" color={kpi.overdueLessons > 0 ? 'red' : ''} />
          <KpiCard label="Active Professors" value={kpi.activeProfessors} link="/professors" />
          <KpiCard label="Active Locations" value={kpi.activeLocations} link="/locations" />
          <KpiCard label="Overdue Evals" value={kpi.overdueEvals} link="/evaluations" color={kpi.overdueEvals > 0 ? 'red' : ''} />
        </div>

        {/* Pending Roster Approvals — Client Managers, Admins, CEO */}
        {['Admin', 'CEO', 'Client Manager'].includes(role) && <PendingRosterApprovals />}

        <DailyTasksAndKpis />
      </div>
    </AppShell>
  );
}

function PendingRosterApprovals() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['pending-roster'],
    queryFn: () => api.get('/programs/pending-roster').then(r => r.data),
    staleTime: 30 * 1000,
  });
  const items = data?.data || [];

  const approveMutation = useMutation({
    mutationFn: (roster_ids) => api.post('/programs/pending-roster/approve', { roster_ids }),
    onSuccess: () => {
      qc.invalidateQueries(['pending-roster']);
      setSelected(new Set());
    },
  });

  if (isLoading || items.length === 0) return null;

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.roster_id)));
  };

  // Group by program
  const byProgram = {};
  items.forEach(i => {
    if (!byProgram[i.program_id]) byProgram[i.program_id] = { ...i, students: [] };
    byProgram[i.program_id].students.push(i);
  });

  return (
    <div className="mb-6">
      <div className="bg-amber-50 rounded-lg border border-amber-200">
        <div className="px-5 py-3 border-b border-amber-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-amber-800">Pending Roster Approvals</h2>
            <p className="text-xs text-amber-600 mt-0.5">{items.length} student{items.length !== 1 ? 's' : ''} added by professors awaiting your approval</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={selectAll}
              className="text-xs text-amber-700 hover:text-amber-900 underline">
              {selected.size === items.length ? 'Deselect All' : 'Select All'}
            </button>
            {selected.size > 0 && (
              <Button size="sm" onClick={() => approveMutation.mutate([...selected])}
                disabled={approveMutation.isPending}>
                {approveMutation.isPending ? 'Approving...' : `Accept ${selected.size} Change${selected.size !== 1 ? 's' : ''}`}
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-amber-100/50">
              <tr>
                <th className="w-8 px-3 py-2"></th>
                <th className="text-left px-3 py-2 text-xs font-medium text-amber-700">Student</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-amber-700">Program</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-amber-700">Location</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-amber-700">Added By</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-amber-700">Date</th>
                <th className="w-24 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {items.map(i => (
                <tr key={i.roster_id} className={selected.has(i.roster_id) ? 'bg-amber-100/30' : 'bg-white'}>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={selected.has(i.roster_id)}
                      onChange={() => toggleSelect(i.roster_id)}
                      className="rounded border-amber-300 text-[#1e3a5f]" />
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-900">{i.student_last}, {i.student_first}</td>
                  <td className="px-3 py-2">
                    <Link to={`/programs/${i.program_id}`} className="text-[#1e3a5f] hover:underline">{i.program_nickname}</Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{i.location_nickname || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{i.added_by_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{i.date_applied ? formatDate(i.date_applied) : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => approveMutation.mutate([i.roster_id])}
                      disabled={approveMutation.isPending}
                      className="text-xs font-medium text-green-700 hover:text-green-900">
                      Accept
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, link, color }) {
  const bg = color === 'red' ? 'bg-red-50 border-red-200' : color === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200';
  const text = color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-600' : 'text-gray-900';
  const content = (
    <div className={`rounded-lg border p-4 ${bg} ${link ? 'hover:shadow-sm transition-shadow cursor-pointer' : ''}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${text}`}>{value ?? '—'}</div>
    </div>
  );
  return link ? <Link to={link}>{content}</Link> : content;
}

function QuickLink({ to, label }) {
  return (
    <Link to={to} className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-50 text-sm text-gray-700 hover:text-[#1e3a5f] transition-colors">
      {label}
      <span className="text-gray-300">→</span>
    </Link>
  );
}

function DailyTasksAndKpis() {
  const { data, isLoading } = useQuery({ queryKey: ['my-dashboard-reports'], queryFn: getMyDashboard, staleTime: 60 * 1000 });
  const reports = data?.data || [];
  const tasks = reports.filter(r => r.display_mode === 'task' || r.display_mode === 'both');
  const kpis = reports.filter(r => r.display_mode === 'kpi' || r.display_mode === 'both');

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Daily Tasks */}
      <div className="col-span-2">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Daily Task List</h2>
              <p className="text-xs text-gray-400 mt-0.5">Reports assigned to your role</p>
            </div>
            <Link to="/report-builder" className="text-xs text-[#1e3a5f] hover:underline">Manage Reports</Link>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-sm">No daily tasks assigned</p>
              <Link to="/report-builder" className="text-xs text-[#1e3a5f] hover:underline mt-1 inline-block">Create reports in Report Builder →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {tasks.map(r => (
                <TaskRow key={r.id} report={r} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPIs + Quick Links */}
      <div className="space-y-4">
        {kpis.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-800">KPIs</h2>
            </div>
            <div className="p-4 space-y-3">
              {kpis.map(r => (
                <div key={r.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{r.name}</span>
                  <span className={`text-lg font-bold ${r.count > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-800">Quick Links</h2>
          </div>
          <div className="p-4 space-y-2">
            <QuickLink to="/programs" label="Programs" />
            <QuickLink to="/professors" label="Professors" />
            <QuickLink to="/schedule" label="Professor Schedule" />
            <QuickLink to="/bulk-input" label="Bulk Program Input" />
            <QuickLink to="/assignment-board" label="Assignment Board" />
            <QuickLink to="/lessons" label="Lessons & Modules" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ report }) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [results, setResults] = useState(null);

  const handleExpand = async () => {
    if (expanded && !showAll) { setExpanded(false); return; }
    const res = await runReport(report.id, showAll);
    setResults(res);
    setExpanded(true);
  };

  const toggleShowAll = async (e) => {
    e.stopPropagation();
    const next = !showAll;
    setShowAll(next);
    const res = await runReport(report.id, next);
    setResults(res);
    setExpanded(true);
  };

  return (
    <div>
      <button onClick={handleExpand} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left">
        <div>
          <span className="text-sm font-medium text-gray-800">{report.name}</span>
          {report.description && <p className="text-xs text-gray-400 mt-0.5">{report.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-lg font-bold ${report.count > 0 ? 'text-[#1e3a5f]' : 'text-gray-300'}`}>{report.count}</span>
          <span className="text-gray-300 text-xs">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>
      {expanded && results?.data && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <button onClick={toggleShowAll}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${showAll ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {showAll ? 'Showing All' : 'Show All'}
            </button>
            {showAll && <span className="text-[10px] text-gray-400">{results.data.length} total</span>}
          </div>
          <div className="bg-gray-50 rounded border border-gray-200 overflow-x-auto max-h-60 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  {results.data[0] && Object.keys(results.data[0]).filter(k => k !== 'id').slice(0, 8).map(k => (
                    <th key={k} className="text-left px-2 py-1.5 font-medium text-gray-600">{k.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.data.slice(0, 20).map((row, i) => {
                  const cols = Object.entries(row).filter(([k]) => k !== 'id').slice(0, 8);
                  const detailLink = row.id ? (
                    report.name?.toLowerCase().includes('professor') || report.name?.toLowerCase().includes('classes')
                      ? `/professors/${row.id}`
                      : report.name?.toLowerCase().includes('program') ? `/programs/${row.id}`
                      : report.name?.toLowerCase().includes('location') ? `/locations/${row.id}`
                      : null
                  ) : null;
                  return (
                    <tr key={row.id || i} className={detailLink ? 'hover:bg-blue-50/30 cursor-pointer' : ''}>
                      {cols.map(([k, v], ci) => (
                        <td key={k} className="px-2 py-1 text-gray-600">
                          {ci === 0 && detailLink ? (
                            <Link to={detailLink} className="text-[#1e3a5f] hover:underline">{v === null ? '—' : String(v)}</Link>
                          ) : (v === null ? '—' : String(v))}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
