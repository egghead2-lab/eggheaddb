import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function getMonday(d) {
  const date = new Date(d + 'T12:00:00');
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().split('T')[0];
}

function getThisMonday() {
  return getMonday(new Date().toISOString().split('T')[0]);
}

export default function WeeklyOverviewPage() {
  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  const [weekStart, setWeekStart] = useState(getThisMonday);
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [showAssistant, setShowAssistant] = useState(true);

  const params = {
    start_date: weekStart,
    areas: selectedAreas.length ? selectedAreas.join(',') : undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['weekly-overview', params],
    queryFn: () => api.get('/weekly-overview', { params }).then(r => r.data),
  });

  const sessions = data?.data || [];

  // Group by day
  const byDay = useMemo(() => {
    const groups = {};
    WEEKDAYS.forEach((_, i) => {
      const d = new Date(weekStart + 'T12:00:00');
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      groups[dateStr] = { day: WEEKDAYS[i], date: dateStr, sessions: [] };
    });
    sessions.forEach(s => {
      const dateStr = (s.session_date || '').split('T')[0];
      if (groups[dateStr]) groups[dateStr].sessions.push(s);
    });
    return Object.values(groups);
  }, [sessions, weekStart]);

  const today = new Date().toISOString().split('T')[0];

  const shiftWeek = (offset) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + offset * 7);
    setWeekStart(d.toISOString().split('T')[0]);
  };

  const handleDatePick = (val) => {
    setWeekStart(getMonday(val));
  };

  const weekEndDate = (() => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + 4);
    return d.toISOString().split('T')[0];
  })();

  return (
    <AppShell>
      <PageHeader title="Weekly Overview" action={
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)} className="px-2 py-1 text-sm text-gray-500 hover:text-[#1e3a5f] border border-gray-200 rounded-lg">&larr;</button>
          <button onClick={() => setWeekStart(getThisMonday())}
            className="px-2.5 py-1 text-xs font-medium text-[#1e3a5f] border border-[#1e3a5f]/30 rounded-lg hover:bg-[#1e3a5f]/5">This Week</button>
          <button onClick={() => shiftWeek(1)} className="px-2 py-1 text-sm text-gray-500 hover:text-[#1e3a5f] border border-gray-200 rounded-lg">&rarr;</button>
          <input type="date" value={weekStart} onChange={e => handleDatePick(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
          <span className="text-xs text-gray-500">{formatDate(weekStart)} – {formatDate(weekEndDate)}</span>
          <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer ml-2">
            <input type="checkbox" checked={showAssistant} onChange={e => setShowAssistant(e.target.checked)}
              className="w-3 h-3 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]" />
            Assist
          </label>
        </div>
      }>
      </PageHeader>

      {/* Area chips */}
      <div className="px-6 pt-4 flex flex-wrap gap-1.5">
        <span className="text-xs text-gray-500 py-1 mr-1">Areas:</span>
        {selectedAreas.length > 0 && (
          <button onClick={() => setSelectedAreas([])} className="text-[10px] text-gray-400 hover:text-gray-600 underline py-1 mr-1">Clear</button>
        )}
        {areas.map(a => (
          <button key={a.id} onClick={() => setSelectedAreas(prev =>
            prev.includes(a.id) ? prev.filter(x => x !== a.id) : [...prev, a.id]
          )} className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
            selectedAreas.includes(a.id)
              ? 'bg-[#1e3a5f] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>{a.geographic_area_name}</button>
        ))}
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <div className="space-y-6">
            {byDay.map(dayGroup => {
              const isToday = dayGroup.date === today;
              return (
                <div key={dayGroup.date}>
                  <div className={`flex items-center gap-2 mb-2 ${isToday ? 'text-[#1e3a5f]' : 'text-gray-700'}`}>
                    <h2 className="text-sm font-bold">{dayGroup.day}</h2>
                    <span className="text-xs text-gray-400">{formatDate(dayGroup.date)}</span>
                    {isToday && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">TODAY</span>}
                    <span className="text-[10px] text-gray-400">({dayGroup.sessions.length} session{dayGroup.sessions.length !== 1 ? 's' : ''})</span>
                  </div>

                  {dayGroup.sessions.length === 0 ? (
                    <div className="text-xs text-gray-300 py-3 pl-2">No sessions</div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full text-xs table-fixed">
                        <colgroup>
                          <col style={{ width: '28%' }} />
                          <col style={{ width: '10%' }} />
                          <col style={{ width: '14%' }} />
                          {showAssistant && <col style={{ width: '14%' }} />}
                          <col style={{ width: showAssistant ? '16%' : '22%' }} />
                          <col style={{ width: '10%' }} />
                          <col style={{ width: '8%' }} />
                        </colgroup>
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                            <th className="text-left px-2 py-2 font-medium text-gray-600">Time</th>
                            <th className="text-left px-2 py-2 font-medium text-gray-600">Lead</th>
                            {showAssistant && <th className="text-left px-2 py-2 font-medium text-gray-600">Assistant</th>}
                            <th className="text-left px-2 py-2 font-medium text-gray-600">Lesson</th>
                            <th className="text-left px-2 py-2 font-medium text-gray-600">Area</th>
                            <th className="text-center px-2 py-2 font-medium text-gray-600">Flag</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {dayGroup.sessions.map((s, i) => {
                            const firstDate = s.first_session_date ? s.first_session_date.split('T')[0] : null;
                            const lastDate = s.last_session_date ? s.last_session_date.split('T')[0] : null;
                            const sessionDate = s.session_date.split('T')[0];
                            const isFirst = firstDate === sessionDate && firstDate !== lastDate;
                            const isLast = lastDate === sessionDate && firstDate !== lastDate;
                            const isSingleDay = firstDate === lastDate;

                            return (
                              <tr key={s.session_id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${isFirst || isLast ? 'bg-amber-50/30' : ''}`}>
                                <td className="px-3 py-1.5 truncate">
                                  <Link to={`/programs/${s.program_id}`} className="font-medium text-[#1e3a5f] hover:underline">{s.program_nickname}</Link>
                                  {s.location_nickname && <div className="text-[10px] text-gray-400 truncate">{s.location_nickname}</div>}
                                </td>
                                <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                                  {s.session_time ? formatTime(s.session_time) : (s.start_time ? formatTime(s.start_time) : '—')}
                                </td>
                                <td className="px-2 py-1.5 truncate">
                                  {s.lead_id ? (
                                    <Link to={`/professors/${s.lead_id}`} className="text-[#1e3a5f] hover:underline">{s.lead_name}</Link>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                                {showAssistant && <td className="px-2 py-1.5 truncate">
                                  {s.assist_id ? (
                                    <Link to={`/professors/${s.assist_id}`} className="text-[#1e3a5f] hover:underline">{s.assist_name}</Link>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>}
                                <td className="px-2 py-1.5 truncate">
                                  {s.lesson_name ? (
                                    s.trainual_link ? (
                                      <a href={s.trainual_link} target="_blank" rel="noopener noreferrer"
                                        className="text-[#1e3a5f] hover:underline">{s.lesson_name}</a>
                                    ) : <span className="text-gray-600">{s.lesson_name}</span>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-2 py-1.5 text-gray-500 truncate">{s.geographic_area_name || '—'}</td>
                                <td className="px-2 py-1.5 text-center">
                                  {isFirst && <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1 py-0.5 rounded">1st</span>}
                                  {isLast && <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1 py-0.5 rounded">Last</span>}
                                  {isSingleDay && <span className="text-[9px] font-bold text-violet-600 bg-violet-50 px-1 py-0.5 rounded">1 Day</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
