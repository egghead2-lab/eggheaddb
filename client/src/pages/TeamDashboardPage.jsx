import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUserDashboard, runReport } from '../api/reports';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';
import api from '../api/client';

export default function TeamDashboardPage() {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [expandedData, setExpandedData] = useState(null);

  const { data: usersData } = useQuery({
    queryKey: ['team-users'],
    queryFn: () => api.get('/users?limit=100').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const users = usersData?.data || [];

  const { data: dashData, isLoading } = useQuery({
    queryKey: ['team-dashboard', selectedUserId],
    queryFn: () => getUserDashboard(selectedUserId),
    enabled: !!selectedUserId,
  });
  const userInfo = dashData?.user;
  const reports = dashData?.data || [];
  const tasks = reports.filter(r => r.display_mode === 'task' || r.display_mode === 'both');
  const kpis = reports.filter(r => r.display_mode === 'kpi' || r.display_mode === 'both');

  const handleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); setExpandedData(null); return; }
    try {
      const res = await runReport(id);
      setExpandedData(res);
      setExpandedId(id);
    } catch { setExpandedId(null); }
  };

  return (
    <AppShell>
      <PageHeader title="Team Dashboard">
        <Select value={selectedUserId} onChange={e => { setSelectedUserId(e.target.value); setExpandedId(null); }} className="w-64">
          <option value="">Select a team member…</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role_name})</option>
          ))}
        </Select>
      </PageHeader>

      <div className="p-6">
        {!selectedUserId ? (
          <div className="text-center py-20 text-gray-400">Select a team member to view their dashboard</div>
        ) : isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <div className="max-w-[1000px]">
            {/* User header */}
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-lg font-bold text-gray-900">{userInfo?.first_name} {userInfo?.last_name}</h2>
              <Badge status={userInfo?.role_name} />
              <span className="text-sm text-gray-500">{reports.length} report{reports.length !== 1 ? 's' : ''} assigned</span>
            </div>

            {reports.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
                No reports assigned to this user
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-6">
                {/* Tasks */}
                <div className="col-span-2">
                  <div className="bg-white rounded-lg border border-gray-200">
                    <div className="px-5 py-3 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-800">Daily Tasks ({tasks.length})</h3>
                    </div>
                    {tasks.length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm">No daily tasks assigned</div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {tasks.map(r => (
                          <div key={r.id}>
                            <button onClick={() => handleExpand(r.id)}
                              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left">
                              <div>
                                <span className="text-sm font-medium text-gray-800">{r.name}</span>
                                {r.description && <p className="text-xs text-gray-400 mt-0.5">{r.description}</p>}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-lg font-bold ${r.count > 0 ? 'text-[#1e3a5f]' : 'text-gray-300'}`}>{r.count}</span>
                                <span className="text-gray-300 text-xs">{expandedId === r.id ? '▾' : '▸'}</span>
                              </div>
                            </button>
                            {expandedId === r.id && expandedData?.data && (
                              <div className="px-5 pb-3">
                                <div className="bg-gray-50 rounded border border-gray-200 overflow-x-auto max-h-60 overflow-y-auto">
                                  <table className="w-full text-xs">
                                    <thead className="bg-gray-100 sticky top-0">
                                      <tr>
                                        {expandedData.data[0] && Object.keys(expandedData.data[0]).filter(k => k !== 'id').slice(0, 8).map(k => (
                                          <th key={k} className="text-left px-2 py-1.5 font-medium text-gray-600">{k.replace(/_/g, ' ')}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {expandedData.data.slice(0, 20).map((row, i) => (
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
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* KPIs */}
                <div>
                  <div className="bg-white rounded-lg border border-gray-200">
                    <div className="px-5 py-3 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-800">KPIs ({kpis.length})</h3>
                    </div>
                    {kpis.length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm">No KPIs assigned</div>
                    ) : (
                      <div className="p-4 space-y-3">
                        {kpis.map(r => (
                          <div key={r.id} className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">{r.name}</span>
                            <span className={`text-lg font-bold ${r.count > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{r.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
