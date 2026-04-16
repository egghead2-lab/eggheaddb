import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';

const REQUIRED_OBS = 2;

export default function ObservationSchedulerPage() {
  const qc = useQueryClient();
  const [selectedProf, setSelectedProf] = useState(null);
  const [weekStart, setWeekStart] = useState('');
  const [confirmClear, setConfirmClear] = useState(null);
  const [confirmSchedule, setConfirmSchedule] = useState(null);

  // Dashboard: new hires needing observations
  const { data: reqData, isLoading } = useQuery({
    queryKey: ['observation-requirements'],
    queryFn: () => api.get('/professors/observation-requirements').then(r => r.data),
  });
  const professors = reqData?.data || [];

  // Area sessions for scheduling (when a professor is selected)
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['observation-candidates', selectedProf?.area_id, weekStart],
    queryFn: () => api.get('/professors/observation-candidates', {
      params: { area_id: selectedProf.area_id, week_start: weekStart || undefined }
    }).then(r => r.data),
    enabled: !!selectedProf?.area_id,
  });
  const sessions = sessionsData?.data || [];
  const searchWeekStart = sessionsData?.week_start;
  const searchWeekEnd = sessionsData?.week_end;

  const clearMutation = useMutation({
    mutationFn: (profId) => api.post(`/professors/${profId}/clear-observation-requirement`),
    onSuccess: () => { qc.invalidateQueries(['observation-requirements']); setConfirmClear(null); },
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ profId, program_id, observation_date }) =>
      api.post(`/professors/${profId}/schedule-observation`, { program_id, observation_date }),
    onSuccess: () => {
      qc.invalidateQueries(['observation-requirements']);
      setConfirmSchedule(null);
    },
  });

  // Group sessions by day
  const sessionsByDay = {};
  sessions.forEach(s => {
    const day = s.session_date?.split('T')[0] || s.session_date;
    if (!sessionsByDay[day]) sessionsByDay[day] = [];
    sessionsByDay[day].push(s);
  });

  return (
    <AppShell>
      <PageHeader title="Observation Scheduler" />

      <div className="p-6">
        {/* ── Dashboard: professors needing observations ── */}
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : professors.length === 0 ? (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
            All new hires have their observation requirements met or cleared.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
              <h3 className="text-sm font-semibold text-amber-800">
                New Hires Needing Observations ({professors.length})
              </h3>
              <p className="text-xs text-amber-600 mt-0.5">Professors require {REQUIRED_OBS} observations before teaching independently</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Professor</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Area</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600 w-28">Completed</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600 w-28">Scheduled</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600 w-28">Status</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-48"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {professors.map(p => {
                  const total = p.completed_observations + p.scheduled_observations;
                  const met = p.completed_observations >= REQUIRED_OBS;
                  return (
                    <tr key={p.id} className={`hover:bg-gray-50/50 ${selectedProf?.id === p.id ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-4 py-2.5">
                        <Link to={`/professors/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                          {p.professor_nickname} {p.last_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{p.area || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`font-medium ${p.completed_observations >= REQUIRED_OBS ? 'text-green-600' : 'text-red-600'}`}>
                          {p.completed_observations} / {REQUIRED_OBS}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-600">{p.scheduled_observations}</td>
                      <td className="px-4 py-2.5 text-center">
                        {met ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">Met</span>
                        ) : total >= REQUIRED_OBS ? (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Scheduled</span>
                        ) : (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">Needs {REQUIRED_OBS - total} more</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => setSelectedProf(selectedProf?.id === p.id ? null : p)}
                            className="text-xs px-2 py-1 bg-[#1e3a5f] text-white rounded hover:bg-[#152a47] font-medium">
                            {selectedProf?.id === p.id ? 'Close' : 'Find Classes'}
                          </button>
                          {confirmClear === p.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => clearMutation.mutate(p.id)}
                                className="text-xs px-2 py-1 bg-amber-500 text-white rounded font-medium">Yes, Clear</button>
                              <button onClick={() => setConfirmClear(null)} className="text-xs text-gray-400">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmClear(p.id)}
                              className="text-xs text-gray-400 hover:text-gray-600">Clear Req.</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Class search for selected professor ───────── */}
        {selectedProf && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-blue-800">
                  Schedule Observation for {selectedProf.professor_nickname} {selectedProf.last_name}
                </h3>
                <p className="text-xs text-blue-600 mt-0.5">
                  Showing classes in {selectedProf.area || 'their area'}
                  {searchWeekStart && ` — Week of ${formatDate(searchWeekStart)} to ${formatDate(searchWeekEnd)}`}
                </p>
              </div>
              <Input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
                className="w-40" placeholder="Change week" />
            </div>

            {sessionsLoading ? (
              <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
            ) : sessions.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No classes found in this area for this week</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {Object.entries(sessionsByDay).sort().map(([day, daySessions]) => (
                  <div key={day}>
                    <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-600 uppercase">
                      {new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </div>
                    <div className="divide-y divide-gray-100">
                      {daySessions.map(s => (
                        <div key={s.session_id} className="flex items-center gap-4 px-4 py-2.5 hover:bg-blue-50/20">
                          <div className="w-16 text-xs text-gray-500 shrink-0">
                            {s.session_time ? formatTime(s.session_time) : (s.start_time ? formatTime(s.start_time) : '—')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{s.professor_nickname}</div>
                            <div className="text-xs text-gray-500 truncate">
                              {s.class_name || s.program_nickname} at {s.location_nickname || '—'}
                              {s.lesson_name && <span className="ml-1 text-gray-400">— {s.lesson_name}</span>}
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 shrink-0">{s.class_type_name}</div>
                          <div className="shrink-0">
                            {confirmSchedule === s.session_id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => scheduleMutation.mutate({
                                  profId: selectedProf.id,
                                  program_id: s.program_id,
                                  observation_date: day
                                })}
                                  disabled={scheduleMutation.isPending}
                                  className="text-xs px-2 py-1 bg-green-500 text-white rounded font-medium">
                                  {scheduleMutation.isPending ? '...' : 'Confirm'}
                                </button>
                                <button onClick={() => setConfirmSchedule(null)} className="text-xs text-gray-400">X</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmSchedule(s.session_id)}
                                className="text-xs px-2 py-1 border border-[#1e3a5f] text-[#1e3a5f] rounded hover:bg-[#1e3a5f] hover:text-white font-medium">
                                Schedule
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
