import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';

export default function ProfessorTodayPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['my-today'],
    queryFn: () => api.get('/schedule/my-today').then(r => r.data),
    refetchInterval: 60000,
  });

  const prof = data?.data?.professor || {};
  const sessions = data?.data?.sessions || [];
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = sessions.filter(s => s.session_date?.split('T')[0] === today);
  const tomorrowSessions = sessions.filter(s => s.session_date?.split('T')[0] !== today);

  const confirmMutation = useMutation({
    mutationFn: (sessionId) => api.post(`/schedule/confirm-session/${sessionId}`),
    onSuccess: () => qc.invalidateQueries(['my-today']),
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Hi, {prof.professor_nickname || prof.first_name || 'Professor'}</h1>
          <p className="text-sm text-gray-500">{formatDate(today)}</p>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-lg mb-1">No classes today or tomorrow</div>
            <div className="text-sm">Enjoy your time off!</div>
          </div>
        ) : (
          <div className="space-y-6">
            {todaySessions.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-gray-800">Today</h2>
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">{todaySessions.length} class{todaySessions.length !== 1 ? 'es' : ''}</span>
                </div>
                <div className="space-y-3">
                  {todaySessions.map(s => <SessionCard key={s.id} session={s} profId={prof.id} onConfirm={confirmMutation} />)}
                </div>
              </div>
            )}

            {tomorrowSessions.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-gray-800">Tomorrow</h2>
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{tomorrowSessions.length} class{tomorrowSessions.length !== 1 ? 'es' : ''}</span>
                </div>
                <div className="space-y-3">
                  {tomorrowSessions.map(s => <SessionCard key={s.id} session={s} profId={prof.id} onConfirm={confirmMutation} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SessionCard({ session: s, profId, onConfirm }) {
  const isLead = String(s.lead_professor_id) === String(profId);
  const pay = parseFloat(isLead ? s.professor_pay : s.assistant_pay) || 0;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${s.professor_confirmed ? 'border-green-200' : 'border-gray-200'}`}>
      {/* Header */}
      <div className={`px-4 py-3 ${s.professor_confirmed ? 'bg-green-50' : 'bg-white'}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-gray-900">{s.program_nickname}</div>
            <div className="text-sm text-gray-500 mt-0.5">
              {s.session_time ? formatTime(s.session_time) : formatTime(s.start_time)}
              {s.class_length_minutes ? ` (${s.class_length_minutes} min)` : ''}
              {' · '}{isLead ? 'Lead' : 'Assistant'}
            </div>
          </div>
          {s.professor_confirmed ? (
            <span className="text-xs text-green-600 bg-green-100 px-2.5 py-1 rounded-full font-medium">Confirmed</span>
          ) : (
            <button onClick={() => onConfirm.mutate(s.id)} disabled={onConfirm.isPending}
              className="text-sm text-white bg-[#1e3a5f] px-4 py-1.5 rounded-full font-medium hover:bg-[#152a47] active:scale-95 transition-all">
              Confirm
            </button>
          )}
        </div>
      </div>

      {/* Lesson */}
      {s.lesson_name && (
        <div className="px-4 py-2 border-t border-gray-100 bg-blue-50/30">
          <div className="text-xs text-gray-500">Lesson</div>
          <div className="text-sm font-medium text-gray-800">
            {s.trainual_link ? (
              <a href={s.trainual_link} target="_blank" rel="noopener noreferrer" className="text-[#1e3a5f] hover:underline">{s.lesson_name}</a>
            ) : s.lesson_name}
          </div>
        </div>
      )}

      {/* Location */}
      <div className="px-4 py-2 border-t border-gray-100">
        <div className="text-xs text-gray-500">Location</div>
        <div className="text-sm font-medium text-gray-800">{s.location_nickname || s.school_name || '—'}</div>
        {s.address && <div className="text-xs text-gray-500 mt-0.5">{s.address}</div>}
        {s.parking_information && (
          <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1.5">
            <span className="font-medium">Parking:</span> {s.parking_information}
          </div>
        )}
        {s.school_procedure_Info && (
          <div className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 mt-1">
            <span className="font-medium">Check-in:</span> {s.school_procedure_Info}
          </div>
        )}
        {s.point_of_contact && (
          <div className="text-xs text-gray-600 mt-1">
            Contact: <span className="font-medium">{s.point_of_contact}</span>
            {s.poc_phone && <a href={`tel:${s.poc_phone}`} className="ml-1 text-[#1e3a5f]">{s.poc_phone}</a>}
          </div>
        )}
        {s.location_id && (
          <Link to={`/locations/${s.location_id}/info-sheet`}
            className="inline-block mt-2 text-xs text-[#1e3a5f] font-medium hover:underline">
            View Full School Info →
          </Link>
        )}
      </div>

      {/* Notes + Pay */}
      <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
        <div className="text-xs text-gray-400">{s.specific_notes || ''}</div>
        {pay > 0 && <div className="text-sm font-medium text-green-700">${pay.toFixed(2)}</div>}
      </div>
    </div>
  );
}
