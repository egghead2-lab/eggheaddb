import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime, formatPhone, formatCurrency } from '../lib/utils';

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

  // Pending party assignments
  const { data: partyData } = useQuery({
    queryKey: ['my-pending-parties'],
    queryFn: () => api.get('/schedule/my-pending-parties').then(r => r.data),
  });
  const pendingParties = partyData?.data || [];

  const partyRespondMutation = useMutation({
    mutationFn: ({ askId, response, decline_reason }) => api.post(`/schedule/party-respond/${askId}`, { response, decline_reason }),
    onSuccess: () => { qc.invalidateQueries(['my-pending-parties']); qc.invalidateQueries(['my-today']); },
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Hi, {prof.professor_nickname || prof.first_name || 'Professor'}</h1>
          <p className="text-sm text-gray-500">{formatDate(today)}</p>
          <Link to="/incident-report"
            className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg border border-red-200 text-xs text-red-600 font-medium hover:bg-red-50 transition-colors">
            Report an Incident
          </Link>
        </div>

        {/* Pending party assignments */}
        {pendingParties.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-pink-700">Pending Party Assignments</h2>
              <span className="text-[10px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded font-medium">{pendingParties.length}</span>
            </div>
            <div className="space-y-3">
              {pendingParties.map(p => (
                <PendingPartyCard key={p.ask_id} party={p} onRespond={partyRespondMutation} />
              ))}
            </div>
          </div>
        )}

        {sessions.length === 0 && pendingParties.length === 0 ? (
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
        {s.point_of_contact && (
          <div className="text-xs text-gray-600 mt-1">
            Contact: <span className="font-medium">{s.point_of_contact}</span>
            {s.poc_phone && <a href={`tel:${s.poc_phone}`} className="ml-1 text-[#1e3a5f]">{formatPhone(s.poc_phone)}</a>}
          </div>
        )}
      </div>

      {/* Notes + Pay */}
      <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
        <div className="text-xs text-gray-400">{s.specific_notes || ''}</div>
        {pay > 0 && <div className="text-sm font-medium text-green-700">${pay.toFixed(2)}</div>}
      </div>

      {/* Action buttons */}
      <div className="px-4 py-3 border-t border-gray-100 grid grid-cols-2 gap-2">
        {s.program_id && (
          <Link to={`/programs/${s.program_id}/classroom`}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium hover:bg-[#152a47] active:scale-[0.98] transition-all">
            View Roster
          </Link>
        )}
        {s.location_id && (
          <Link to={`/locations/${s.location_id}/info-sheet`}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-[#1e3a5f] text-[#1e3a5f] text-sm font-medium hover:bg-[#1e3a5f]/5 active:scale-[0.98] transition-all">
            School Info Sheet
          </Link>
        )}
      </div>
    </div>
  );
}

function PendingPartyCard({ party: p, onRespond }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <div className="bg-white rounded-xl border-2 border-pink-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-pink-50">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-gray-900">{p.program_nickname}</div>
            <div className="text-sm text-gray-500 mt-0.5">
              {formatDate(p.first_session_date)} {p.start_time ? `at ${formatTime(p.start_time)}` : ''}
              {p.class_length_minutes ? ` (${p.class_length_minutes} min)` : ''}
            </div>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-pink-100 text-pink-700 font-medium">{p.party_format_name || 'Party'}</span>
        </div>
      </div>

      <div className="px-4 py-2 border-t border-pink-100">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div><span className="text-gray-500">Location:</span> {p.location_nickname || p.party_location_text || '—'}</div>
          <div><span className="text-gray-500">Theme:</span> {p.party_theme || '—'}</div>
          {p.address && <div className="col-span-2"><span className="text-gray-500">Address:</span> {p.address}</div>}
          <div><span className="text-gray-500">Kids:</span> {p.total_kids_attended || '—'}</div>
          <div><span className="text-gray-500">Pay:</span> {p.lead_professor_pay ? formatCurrency(p.lead_professor_pay) : '—'}</div>
        </div>
        {p.ask_notes && <div className="text-xs text-gray-400 mt-1 italic">{p.ask_notes}</div>}
      </div>

      {!declining ? (
        <div className="px-4 py-3 border-t border-pink-100 grid grid-cols-2 gap-2">
          <button onClick={() => onRespond.mutate({ askId: p.ask_id, response: 'accepted' })}
            disabled={onRespond.isPending}
            className="py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 active:scale-[0.98] transition-all">
            Confirm
          </button>
          <button onClick={() => setDeclining(true)}
            className="py-2.5 rounded-lg border-2 border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 active:scale-[0.98] transition-all">
            Decline
          </button>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-pink-100 space-y-2">
          <input type="text" value={reason} onChange={e => setReason(e.target.value)} autoFocus
            placeholder="Reason for declining (optional)..."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-300" />
          <div className="flex gap-2">
            <button onClick={() => onRespond.mutate({ askId: p.ask_id, response: 'declined', decline_reason: reason })}
              disabled={onRespond.isPending}
              className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
              Confirm Decline
            </button>
            <button onClick={() => { setDeclining(false); setReason(''); }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
