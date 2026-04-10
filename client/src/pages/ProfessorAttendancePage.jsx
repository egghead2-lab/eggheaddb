import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';

const DAYS_MAP = ['monday','tuesday','wednesday','thursday','friday'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri'];

export default function ProfessorAttendancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-attendance'],
    queryFn: () => api.get('/schedule/my-attendance').then(r => r.data),
  });
  const programs = data?.data || [];

  // Group by day of week
  const byDay = {};
  DAY_LABELS.forEach(d => { byDay[d] = []; });
  programs.forEach(p => {
    DAYS_MAP.forEach((d, i) => {
      if (p[d]) byDay[DAY_LABELS[i]].push(p);
    });
  });

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Attendance</h1>
        <p className="text-sm text-gray-500 mb-4">Tap a class to open its classroom and roster</p>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
        ) : programs.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No active classes assigned</div>
        ) : (
          <div className="space-y-5">
            {DAY_LABELS.map(day => {
              const progs = byDay[day];
              if (progs.length === 0) return null;
              return (
                <div key={day}>
                  <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{day}</h2>
                  <div className="space-y-2">
                    {progs.map(p => (
                      <Link key={`${day}-${p.id}`} to={`/programs/${p.id}/classroom`}
                        className="block bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-[#1e3a5f]/30 hover:shadow-sm transition-all active:scale-[0.99]">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{p.program_nickname}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {p.start_time ? formatTime(p.start_time) : '—'}
                              {p.class_length_minutes ? ` (${p.class_length_minutes}m)` : ''}
                              {p.location_nickname ? ` · ${p.location_nickname}` : ''}
                            </div>
                          </div>
                          <span className="text-gray-400 text-sm">→</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
