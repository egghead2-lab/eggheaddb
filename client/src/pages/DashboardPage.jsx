import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
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
        <div className="grid grid-cols-6 gap-4 mb-6">
          <KpiCard label="Active Programs" value={kpi.activePrograms} link="/programs" />
          <KpiCard label="Unconfirmed" value={kpi.unconfirmedPrograms} link="/programs" color={kpi.unconfirmedPrograms > 0 ? 'amber' : ''} />
          <KpiCard label="Sessions (7 days)" value={kpi.upcomingSessions7d} />
          <KpiCard label="Overdue Reviews" value={kpi.overdueLessons} link="/lessons" color={kpi.overdueLessons > 0 ? 'red' : ''} />
          <KpiCard label="Active Professors" value={kpi.activeProfessors} link="/professors" />
          <KpiCard label="Active Locations" value={kpi.activeLocations} link="/locations" />
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Daily Task List */}
          <div className="col-span-2">
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-800">Daily Task List</h2>
                <p className="text-xs text-gray-400 mt-0.5">Tasks assigned to you and your area</p>
              </div>
              <div className="p-8 text-center text-gray-400">
                <p className="text-sm">Task list coming soon</p>
                <p className="text-xs mt-1">Tasks will be assigned by area and role</p>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
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
