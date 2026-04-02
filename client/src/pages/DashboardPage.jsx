import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role || 'Admin';
  const name = user?.name || 'there';

  return (
    <AppShell>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {name.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-1">{role} Dashboard</p>
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

          {/* KPIs */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-800">Key Metrics</h2>
              </div>
              <div className="p-5 space-y-4">
                <KpiPlaceholder label="Active Programs" />
                <KpiPlaceholder label="Unconfirmed Programs" />
                <KpiPlaceholder label="Upcoming Sessions (7 days)" />
                <KpiPlaceholder label="Overdue Lesson Reviews" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function KpiPlaceholder({ label }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-lg font-bold text-gray-300">—</span>
    </div>
  );
}
