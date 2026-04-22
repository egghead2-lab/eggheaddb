import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { getMyDashboard, runReport } from '../api/reports';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime, formatCurrency } from '../lib/utils';
import api from '../api/client';

export default function DashboardPage() {
  const { user } = useAuth();
  const name = user?.name || 'there';
  const role = user?.role || '';

  // Professor/Candidate role — show their schedule instead of admin dashboard
  if (role === 'Professor' || role === 'Candidate') {
    return <ProfessorDashboard name={name} role={role} />;
  }

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

        {/* FM missing professor profile warning — Admin/CEO only */}
        {['Admin', 'CEO'].includes(role) && <FmMissingProfessorWarning />}

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

function ProfessorDashboard({ name, role }) {
  const { data, isLoading } = useQuery({
    queryKey: ['my-today'],
    queryFn: () => api.get('/schedule/my-today').then(r => r.data),
    refetchInterval: 60000,
  });

  const sessions = data?.data?.sessions || [];
  const parties = data?.data?.parties || [];
  const today = new Date().toISOString().split('T')[0];

  // Group sessions by date
  const byDate = {};
  sessions.forEach(s => {
    const d = s.session_date?.split('T')[0] || today;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(s);
  });

  return (
    <AppShell>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {name.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-1">My Schedule</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : sessions.length === 0 && parties.length === 0 ? (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
            No classes scheduled for today or tomorrow
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byDate).sort().map(([date, daySessions]) => {
              const isToday = date === today;
              const dayLabel = isToday ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
              return (
                <div key={date}>
                  <h2 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                    {dayLabel}
                    {isToday && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">TODAY</span>}
                  </h2>
                  <div className="space-y-2">
                    {daySessions.map((s, i) => (
                      <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900">{s.program_nickname}</div>
                            <div className="text-sm text-gray-500 mt-0.5">
                              {s.location_nickname || s.party_city || '—'}
                              {s.grade_range && <span className="ml-2 text-gray-400">({s.grade_range})</span>}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-[#1e3a5f]">
                              {s.session_time ? formatTime(s.session_time) : (s.start_time ? formatTime(s.start_time) : '—')}
                            </div>
                            {s.class_length_minutes && <div className="text-xs text-gray-400">{s.class_length_minutes} min</div>}
                          </div>
                        </div>
                        {s.lesson_name && (
                          <div className="mt-2 text-xs text-gray-500">
                            <span className="text-gray-400">Lesson:</span> {s.lesson_name}
                            {s.trainual_link && <a href={s.trainual_link} target="_blank" rel="noopener noreferrer" className="ml-2 text-[#1e3a5f] hover:underline">View Lesson →</a>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {parties.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-pink-700 mb-2">Upcoming Parties</h2>
                <div className="space-y-2">
                  {parties.map((p, i) => (
                    <div key={i} className="bg-white rounded-lg border border-pink-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">{p.program_nickname}</div>
                          <div className="text-sm text-gray-500">{p.party_city || p.location_nickname || '—'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-700">{formatDate(p.first_session_date)}</div>
                          <div className="text-sm font-medium text-[#1e3a5f]">{p.start_time ? formatTime(p.start_time) : '—'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="flex gap-2 pt-4">
              <Link to="/my-today" className="flex-1 text-center py-2 text-sm font-medium text-[#1e3a5f] bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Full Schedule</Link>
              <Link to="/my-attendance" className="flex-1 text-center py-2 text-sm font-medium text-[#1e3a5f] bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Attendance</Link>
              <Link to="/my-pay" className="flex-1 text-center py-2 text-sm font-medium text-[#1e3a5f] bg-white border border-gray-200 rounded-lg hover:bg-gray-50">My Pay</Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
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

  // Daily task definitions (page links, custom queries, etc.)
  const { data: dtData, isLoading: dtLoading } = useQuery({
    queryKey: ['my-daily-tasks'],
    queryFn: () => api.get('/daily-tasks/my').then(r => r.data),
    staleTime: 60 * 1000,
  });
  const dailyTasks = dtData?.data?.tasks || [];
  const delegationsActive = dtData?.data?.delegations_active || 0;

  const allLoading = isLoading || dtLoading;
  const hasTasks = tasks.length > 0 || dailyTasks.length > 0;

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Daily Tasks */}
      <div className="col-span-2">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Daily Task List</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Tasks and reports assigned to you
                {delegationsActive > 0 && <span className="text-amber-600 ml-1">· {delegationsActive} delegation(s) active</span>}
              </p>
            </div>
            <div className="flex gap-3">
              <Link to="/daily-tasks-admin" className="text-xs text-gray-400 hover:text-[#1e3a5f] hover:underline">Manage Tasks</Link>
              <Link to="/report-builder" className="text-xs text-[#1e3a5f] hover:underline">Reports</Link>
            </div>
          </div>
          {allLoading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : !hasTasks ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-sm">No daily tasks assigned</p>
              <Link to="/report-builder" className="text-xs text-[#1e3a5f] hover:underline mt-1 inline-block">Create reports in Report Builder →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Task definition items (page links with counts) */}
              {dailyTasks.map(t => (
                <DailyTaskRow key={`dt-${t.id}`} task={t} />
              ))}
              {/* Report-based items */}
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

function DailyTaskRow({ task }) {
  return (
    <Link to={task.page_path || '#'} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
      <div>
        <span className="text-sm font-medium text-gray-800">{task.name}</span>
        {task.delegated_from && (
          <span className="text-xs text-amber-600 ml-2">covering for {task.delegated_from}</span>
        )}
        {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {task.count != null && (
          <span className={`text-sm font-bold px-2 py-0.5 rounded ${task.count > 0 ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'text-gray-300'}`}>
            {task.count}{task.count_label && task.count > 0 ? ` ${task.count_label}` : ''}
          </span>
        )}
        <span className="text-gray-300 text-xs">→</span>
      </div>
    </Link>
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

function FmMissingProfessorWarning() {
  const { data } = useQuery({
    queryKey: ['fm-missing-professor'],
    queryFn: () => api.get('/users/fm-missing-professor').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const fms = data?.data || [];
  if (fms.length === 0) return null;
  return (
    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-amber-800">Field Managers missing professor profile</span>
        <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-bold">{fms.length}</span>
      </div>
      <div className="text-xs text-amber-700 mb-2">Every FM should have a linked Professor record so they can be assigned to sessions. Link or create one for each:</div>
      <div className="flex flex-wrap gap-2">
        {fms.map(fm => (
          <Link key={fm.user_id} to={`/users/${fm.user_id}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-amber-300 text-xs text-amber-800 hover:border-amber-500 hover:text-amber-900">
            {fm.first_name} {fm.last_name} <span className="text-amber-500">↗</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
