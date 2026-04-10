import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { formatTime } from '../lib/utils';

const DAYS_MAP = ['monday','tuesday','wednesday','thursday','friday'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri'];

export default function ClassroomAttendancePage() {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('location'); // 'location' | 'day'

  const { data, isLoading } = useQuery({
    queryKey: ['all-attendance'],
    queryFn: () => api.get('/schedule/all-attendance').then(r => r.data),
  });
  const programs = data?.data || [];

  const filtered = useMemo(() => {
    if (!search.trim()) return programs;
    const q = search.toLowerCase();
    return programs.filter(p =>
      (p.program_nickname || '').toLowerCase().includes(q) ||
      (p.location_nickname || '').toLowerCase().includes(q) ||
      (p.lead_professor_name || '').toLowerCase().includes(q) ||
      (p.assistant_professor_name || '').toLowerCase().includes(q)
    );
  }, [programs, search]);

  // Group by location
  const byLocation = useMemo(() => {
    const groups = {};
    filtered.forEach(p => {
      const loc = p.location_nickname || 'No Location';
      if (!groups[loc]) groups[loc] = [];
      groups[loc].push(p);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Group by day
  const byDay = useMemo(() => {
    const groups = {};
    DAY_LABELS.forEach(d => { groups[d] = []; });
    filtered.forEach(p => {
      DAYS_MAP.forEach((d, i) => {
        if (p[d]) groups[DAY_LABELS[i]].push(p);
      });
    });
    return DAY_LABELS.map(d => [d, groups[d]]).filter(([, progs]) => progs.length > 0);
  }, [filtered]);

  const grouped = viewMode === 'location' ? byLocation : byDay;

  return (
    <AppShell>
      <PageHeader title="Classroom Attendance" subtitle={`${programs.length} active program${programs.length !== 1 ? 's' : ''}`} />
      <div className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <Input placeholder="Search programs, locations, professors..." value={search}
            onChange={e => setSearch(e.target.value)} className="max-w-sm" />
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {[['location', 'By Location'], ['day', 'By Day']].map(([key, label]) => (
              <button key={key} onClick={() => setViewMode(key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === key ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>{label}</button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
        ) : programs.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No active programs found</div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([groupLabel, progs]) => (
              <div key={groupLabel}>
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  {groupLabel} <span className="text-gray-300 font-normal">({progs.length})</span>
                </h2>
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                        {viewMode === 'day' && <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>}
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Days</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Lead Professor</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600">Students</th>
                        <th className="w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {progs.map((p, i) => {
                        const days = DAYS_MAP.map((d, j) => p[d] ? DAY_LABELS[j] : null).filter(Boolean).join(', ');
                        return (
                          <tr key={`${groupLabel}-${p.id}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-3 py-2">
                              <Link to={`/programs/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                                {p.program_nickname}
                              </Link>
                              <div className="text-xs text-gray-400">{p.class_status_name}</div>
                            </td>
                            {viewMode === 'day' && <td className="px-3 py-2 text-gray-600">{p.location_nickname || '—'}</td>}
                            <td className="px-3 py-2 text-gray-600">{days}</td>
                            <td className="px-3 py-2 text-gray-600">{p.start_time ? formatTime(p.start_time) : '—'}</td>
                            <td className="px-3 py-2 text-gray-600 text-xs">
                              {p.lead_professor_name || '—'}
                              {p.assistant_professor_name && (
                                <div className="text-gray-400">Asst: {p.assistant_professor_name}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                p.roster_count > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                              }`}>{p.roster_count}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Link to={`/programs/${p.id}/classroom`}
                                className="text-xs font-medium text-[#1e3a5f] hover:underline">
                                Open Classroom
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
