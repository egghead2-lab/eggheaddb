import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { getMyDashboard, runReport } from '../api/reports';
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

        <DailyTasksAndKpis />
      </div>
    </AppShell>
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
  const [results, setResults] = useState(null);

  const handleExpand = async () => {
    if (expanded) { setExpanded(false); return; }
    const res = await runReport(report.id);
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
                {results.data.slice(0, 20).map((row, i) => (
                  <tr key={row.id || i}>
                    {Object.entries(row).filter(([k]) => k !== 'id').slice(0, 8).map(([k, v]) => (
                      <td key={k} className="px-2 py-1 text-gray-600">{v === null ? '—' : String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
