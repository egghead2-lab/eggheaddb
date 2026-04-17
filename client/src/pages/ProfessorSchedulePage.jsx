import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { SearchSelect } from '../components/ui/SearchSelect';
import { useAuth } from '../hooks/useAuth';
import { useProfessorList } from '../hooks/useReferenceData';
import { formatDate, formatTime, formatCurrency, formatPhone } from '../lib/utils';
import api from '../api/client';

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const TYPE_COLOR = {
  science: 'border-l-purple-500',
  engineering: 'border-l-green-600',
  robotics: 'border-l-blue-500',
  'financial literacy': 'border-l-yellow-500',
  party: 'border-l-pink-400',
  camp: 'border-l-orange-400',
};

function getDayString(prog) {
  return DAYS.map((d, i) => prog[d] ? DAY_LABELS[i] : null).filter(Boolean).join(', ');
}

function ProgramTable({ programs, profId, isLead, viewOnly, sessions, subDateSet }) {
  const [expandedId, setExpandedId] = useState(null);
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Class</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Day</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Dates</th>
            <th className="text-right px-3 py-2 font-medium text-gray-600">Per Session</th>
            <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">Role</th>
            <th className="w-20"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {programs.map((p, i) => {
            const expanded = expandedId === p.id;
            const progSessions = sessions?.filter(s => String(s.program_id) === String(p.id)) || [];
            const upcomingSess = progSessions.filter(s => (s.session_date || '').split('T')[0] >= today);
            const typeColor = TYPE_COLOR[(p.program_type_name || '').toLowerCase()] || '';
            const isConfirmed = (p.class_status_name || '').toLowerCase() === 'confirmed';
            return (
              <>
                <tr key={p.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${typeColor ? `border-l-4 ${typeColor}` : ''} ${viewOnly ? 'cursor-pointer hover:bg-blue-50/30' : ''}`}
                  onClick={viewOnly ? () => setExpandedId(expanded ? null : p.id) : undefined}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {viewOnly ? (
                        <span className="font-medium text-[#1e3a5f]">
                          <span className="text-[10px] text-gray-400 mr-1">{expanded ? '▾' : '▸'}</span>
                          {p.program_nickname}
                        </span>
                      ) : (
                        <Link to={`/programs/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline" onClick={e => e.stopPropagation()}>{p.program_nickname}</Link>
                      )}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                        isConfirmed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>{isConfirmed ? 'Confirmed' : 'Unconfirmed'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-600" onClick={e => e.stopPropagation()}>
                    {viewOnly && p.location_id ? (
                      <Link to={`/locations/${p.location_id}/info-sheet`} className="text-[#1e3a5f] hover:underline">{p.location_nickname}</Link>
                    ) : p.location_nickname || '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{p.class_name || '—'}{p.grade_range ? <span className="ml-1 text-xs text-gray-400">({p.grade_range})</span> : ''}</td>
                  <td className="px-3 py-2 text-gray-600">{getDayString(p)}</td>
                  <td className="px-3 py-2 text-gray-600">{p.start_time ? formatTime(p.start_time) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {p.first_session_date ? formatDate(p.first_session_date) : '—'}
                    {p.last_session_date ? ` — ${formatDate(p.last_session_date)}` : ''}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-green-700">
                    {formatCurrency(isLead(p) ? p.lead_professor_pay : p.assistant_professor_pay)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                      isLead(p) ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'bg-gray-100 text-gray-600'
                    }`}>{isLead(p) ? 'Lead' : 'Assist'}</span>
                  </td>
                  <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                    <Link to={`/programs/${p.id}/classroom`} className="text-xs text-[#1e3a5f] hover:underline font-medium">
                      Classroom
                    </Link>
                  </td>
                </tr>
                {expanded && (
                  <tr key={`${p.id}-detail`}>
                    <td colSpan={9} className="bg-blue-50/30 px-4 py-3">
                      <div className="flex gap-4 mb-3">
                        {p.location_nickname && (
                          <Link to={`/locations/${p.location_id}/info-sheet`}
                            className="text-xs text-[#1e3a5f] font-medium hover:underline">
                            View School Info Sheet →
                          </Link>
                        )}
                        {p.session_count && (
                          <span className="text-xs text-gray-500">{p.session_count} sessions total · {upcomingSess.length} remaining</span>
                        )}
                      </div>
                      {upcomingSess.length > 0 ? (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b border-gray-200">
                              <th className="text-left py-1 pr-3 font-medium">Date</th>
                              <th className="text-left py-1 pr-3 font-medium">Time</th>
                              <th className="text-left py-1 pr-3 font-medium">Lesson</th>
                              <th className="text-left py-1 pr-3 font-medium">Sub Status</th>
                              <th className="text-right py-1 font-medium">Pay</th>
                            </tr>
                          </thead>
                          <tbody>
                            {upcomingSess.map(s => {
                              const dateStr = (s.session_date || '').split('T')[0];
                              const hasSub = subDateSet?.has(dateStr);
                              const actualLead = s.session_professor_id || s.lead_professor_id;
                              const lead = String(actualLead) === String(profId);
                              const sPay = parseFloat(lead ? s.professor_pay : s.assistant_pay) || 0;
                              const pay = sPay || parseFloat(s.estimated_pay) || 0;
                              const isEst = !sPay && pay > 0;
                              const isToday = dateStr === today;
                              return (
                                <tr key={s.id} className={`border-b border-gray-100 last:border-0 ${isToday ? 'bg-blue-100/40 font-medium' : ''} ${hasSub ? 'bg-amber-50' : ''}`}>
                                  <td className="py-1.5 pr-3">
                                    {formatDate(dateStr)}
                                    {isToday && <span className="ml-1 text-[9px] font-medium text-blue-600 bg-blue-100 px-1 rounded">TODAY</span>}
                                  </td>
                                  <td className="py-1.5 pr-3 text-gray-600">{s.session_time ? formatTime(s.session_time) : '—'}</td>
                                  <td className="py-1.5 pr-3 text-gray-600">
                                    {s.trainual_link ? (
                                      <a href={s.trainual_link} target="_blank" rel="noopener noreferrer" className="text-[#1e3a5f] hover:underline">{s.lesson_name || '—'}</a>
                                    ) : (s.lesson_name || '—')}
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    {hasSub ? <span className="text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-medium">Sub requested</span> : <span className="text-gray-400">—</span>}
                                  </td>
                                  <td className={`py-1.5 text-right font-medium ${isEst ? 'text-blue-600' : 'text-green-700'}`}>
                                    {pay > 0 ? <>{formatCurrency(pay)}{isEst && <span className="text-[8px] text-blue-400 ml-0.5">est</span>}</> : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-xs text-gray-400">No upcoming sessions</p>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SessionTable({ sessions, profId, viewOnly, subDateSet, showStatus }) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const getSubStatus = (s) => {
    const dateStr = (s.session_date || '').split('T')[0];
    if (!subDateSet?.has(dateStr)) return 'none';
    const actualLead = s.session_professor_id || s.lead_professor_id;
    const actualAssist = s.session_assistant_id || s.assistant_professor_id;
    const stillOnSession = String(actualLead) === String(profId) || String(actualAssist) === String(profId);
    return stillOnSession ? 'requested' : 'covered';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Day</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
            <th className="text-left px-3 py-2 font-medium text-gray-600">Lesson</th>
            {showStatus && <th className="text-center px-3 py-2 font-medium text-gray-600">Status</th>}
            <th className="text-right px-3 py-2 font-medium text-gray-600">Your Pay</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sessions.map((s, i) => {
            const dateStr = (s.session_date || '').split('T')[0];
            const dow = dateStr ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : '—';
            const isToday = dateStr === today;
            const isTomorrow = dateStr === tomorrow;
            const subStatus = getSubStatus(s);
            const actualLead = s.session_professor_id || s.lead_professor_id;
            const lead = String(actualLead) === String(profId);
            const sessionPay = parseFloat(lead ? s.professor_pay : s.assistant_pay) || 0;
            const pay = sessionPay || parseFloat(s.estimated_pay) || 0;
            const isExpected = !sessionPay && pay > 0;
            return (
              <tr key={s.id} className={`${
                subStatus === 'requested' ? 'bg-amber-50' :
                isToday ? 'bg-blue-50 font-medium' :
                isTomorrow ? 'bg-blue-50/40' :
                i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
              }`}>
                <td className="px-3 py-2">
                  {formatDate(dateStr)}
                  {isToday && <span className="ml-1 text-[10px] font-medium text-blue-600 bg-blue-100 px-1 py-0.5 rounded">TODAY</span>}
                  {isTomorrow && <span className="ml-1 text-[10px] font-medium text-blue-500 bg-blue-50 px-1 py-0.5 rounded">TOMORROW</span>}
                  {subStatus === 'requested' && <span className="ml-1 text-[10px] font-medium text-amber-700 bg-amber-100 px-1 py-0.5 rounded">SUB REQUESTED</span>}
                </td>
                <td className="px-3 py-2 text-gray-500">{dow}</td>
                <td className="px-3 py-2 text-gray-600">{s.session_time ? formatTime(s.session_time) : '—'}</td>
                <td className="px-3 py-2">
                  {viewOnly ? <span>{s.program_nickname}</span> : <Link to={`/programs/${s.program_id || ''}`} className="text-[#1e3a5f] hover:underline">{s.program_nickname}</Link>}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {viewOnly && s.location_id ? (
                    <Link to={`/locations/${s.location_id}/info-sheet`} className="text-[#1e3a5f] hover:underline">{s.location_nickname}</Link>
                  ) : s.location_nickname || '—'}
                </td>
                <td className="px-3 py-2 text-gray-500">{s.lesson_name || '—'}</td>
                {showStatus && <td className="px-3 py-2 text-center">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    s.class_status_name === 'Confirmed' ? 'bg-green-100 text-green-700' :
                    s.class_status_name === 'Unconfirmed' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{s.class_status_name || '—'}</span>
                </td>}
                <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  {pay > 0 ? (
                    <span className={isExpected ? 'text-blue-600' : 'text-green-700'}>
                      {formatCurrency(pay)}{isExpected ? <span className="text-[9px] text-blue-400 ml-0.5">est</span> : ''}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                  {s.not_billed ? <span className="text-xs text-red-400 ml-1">(unbilled)</span> : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ProfessorSchedulePage() {
  const { id: paramId } = useParams();
  const [selectedId, setSelectedId] = useState(paramId || '');
  const { user } = useAuth();
  const role = user?.role || '';

  // Auto-load own profile for professors
  const { data: myProfileData } = useQuery({
    queryKey: ['my-professor-profile'],
    queryFn: () => api.get('/professors/my-profile').then(r => r.data),
    enabled: role === 'Professor' && !paramId,
    staleTime: Infinity,
  });

  const profId = paramId || selectedId || (role === 'Professor' ? myProfileData?.data?.professor_id : '') || '';

  // Professors see view-only, schedulers/admins can click through
  const ADMIN_ROLES = ['Admin', 'CEO', 'Scheduling Coordinator', 'Field Manager', 'Client Manager'];
  const viewOnly = !ADMIN_ROLES.includes(role);

  const { data: profListData } = useProfessorList();
  const professors = profListData?.data || [];

  const { data: schedData, isLoading } = useQuery({
    queryKey: ['schedule', profId],
    queryFn: () => api.get(`/schedule/${profId}`).then(r => r.data),
    enabled: !!profId,
  });

  const sched = schedData?.data || {};
  const prof = sched.professor || {};
  const programs = sched.programs || [];
  const sessions = sched.sessions || [];
  const parties = sched.parties || [];
  const availability = sched.availability || [];
  const subDates = sched.subDates || [];
  const subDateSet = new Set(subDates.map(d => (d.date_requested || '').split('T')[0]));
  const observations = sched.observations || [];

  const today = new Date().toISOString().split('T')[0];
  const [showAllClasses, setShowAllClasses] = useState(false);

  // 30 days from now
  const plus30 = new Date(); plus30.setDate(plus30.getDate() + 30);
  const plus30Str = plus30.toISOString().split('T')[0];

  // Split programs: "current" = not finished yet, optionally filtered to starting within 30 days
  const allCurrentPrograms = programs.filter(p => !p.last_session_date || p.last_session_date.split('T')[0] >= today);
  const currentPrograms = showAllClasses
    ? allCurrentPrograms
    : allCurrentPrograms.filter(p => !p.first_session_date || p.first_session_date.split('T')[0] <= plus30Str);
  const futureCount = allCurrentPrograms.length - currentPrograms.length;
  const pastPrograms = programs.filter(p => p.last_session_date && p.last_session_date.split('T')[0] < today);

  // For each session, determine this professor's sub status
  // 'none' = no sub requested, 'requested' = sub requested but still on session, 'covered' = replaced by someone else
  const getSubStatus = (s) => {
    const dateStr = (s.session_date || '').split('T')[0];
    if (!subDateSet.has(dateStr)) return 'none';
    // Who's actually teaching? Session override takes priority, fallback to program default
    const actualLead = s.session_professor_id || s.lead_professor_id;
    const actualAssist = s.session_assistant_id || s.assistant_professor_id;
    const stillOnSession = String(actualLead) === String(profId) || String(actualAssist) === String(profId);
    return stillOnSession ? 'requested' : 'covered';
  };
  // Hide sessions where this prof has been fully replaced; keep "sub requested" ones visible
  const upcomingSessions = sessions.filter(s => (s.session_date || '').split('T')[0] >= today && getSubStatus(s) !== 'covered');
  const pastSessions = sessions.filter(s => (s.session_date || '').split('T')[0] < today).reverse();

  // Pay totals
  const totalUpcomingPay = upcomingSessions.reduce((sum, s) => {
    const lead = String(s.session_professor_id || s.lead_professor_id) === String(profId);
    const sPay = parseFloat(lead ? s.professor_pay : s.assistant_pay) || 0;
    return sum + (sPay || parseFloat(s.estimated_pay) || 0);
  }, 0);
  const totalPastPay = pastSessions.reduce((sum, s) => {
    const lead = String(s.lead_professor_id) === String(profId);
    return sum + (parseFloat(lead ? s.professor_pay : s.assistant_pay) || 0);
  }, 0);

  // Unique locations from current programs
  const locationMap = {};
  allCurrentPrograms.forEach(p => {
    if (p.location_nickname && !locationMap[p.location_nickname]) {
      locationMap[p.location_nickname] = { nickname: p.location_nickname, school_name: p.school_name, address: p.address, contact: p.location_contact };
    }
  });
  const locations = Object.values(locationMap);

  const isLead = (prog) => String(prog.lead_professor_id) === String(profId);

  return (
    <AppShell>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            {!viewOnly && <Link to="/professors" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Professors</Link>}
            {prof.id ? (
              <div className="flex items-center gap-3 mt-0.5">
                <h1 className="text-xl font-bold text-gray-900">
                  {prof.professor_nickname} {prof.last_name} — Schedule
                </h1>
                <Badge status={prof.professor_status_name} />
              </div>
            ) : (
              <h1 className="text-xl font-bold text-gray-900 mt-0.5">Professor Schedule</h1>
            )}
          </div>
          {/* Professor picker for schedulers */}
          {!paramId && !viewOnly && (
            <div className="w-64">
              <SearchSelect
                placeholder="Search professor…"
                value={selectedId}
                onChange={v => setSelectedId(v)}
                options={professors.map(p => ({ id: p.id, label: p.display_name || p.professor_nickname }))}
                displayKey="label"
                valueKey="id"
              />
            </div>
          )}
        </div>
      </div>

      {!profId ? (
        <div className="p-6 text-center text-gray-400 py-20">Select a professor to view their schedule</div>
      ) : isLoading ? (
        <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
      ) : (
        <div className="p-6 space-y-4 max-w-[1200px]">
          {/* Professor Info Card */}
          <div className="grid grid-cols-3 gap-4">
            <Section title="General Information" defaultOpen={true}>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Full Name</span><span className="font-medium">{prof.first_name} {prof.last_name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{formatPhone(prof.phone_number)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{prof.email || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Area</span><span>{prof.geographic_area_name || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Base Pay</span><span className="font-medium">{formatCurrency(prof.base_pay)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Field Manager</span><span>{prof.field_manager_name || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Scheduler</span><span>{prof.scheduler_name || '—'}</span></div>
              </div>
            </Section>

            <Section title="Qualifications" defaultOpen={true}>
              <div className="space-y-2 text-sm">
                {[
                  ['Science', prof.science_trained_id],
                  ['Engineering', prof.engineering_trained_id],
                  ['Dry Ice Show', prof.show_party_trained_id],
                  ['StudySmart', prof.studysmart_trained_id],
                  ['Camp', prof.camp_trained_id],
                  ['Robotics', prof.robotics_trained_id],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className={val ? 'text-green-600 font-medium' : 'text-gray-300'}>
                      {val ? 'Yes' : 'No'}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between mt-2 pt-2 border-t border-gray-100">
                  <span className="text-gray-500">Virtus</span>
                  <span className={prof.virtus ? 'text-green-600 font-medium' : 'text-gray-300'}>{prof.virtus ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">TB Test</span>
                  <span className={prof.tb_test ? 'text-green-600 font-medium' : 'text-gray-300'}>{prof.tb_test ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </Section>

            <Section title="Availability" defaultOpen={true}>
              {availability.length > 0 ? (
                <div className="space-y-1 text-sm">
                  {availability.map(a => (
                    <div key={a.id} className="flex justify-between">
                      <span className="text-gray-500">{a.weekday_name}</span>
                      <span>{a.time_from || '—'} – {a.time_to || '—'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No availability on file</p>
              )}
            </Section>
          </div>

          {/* Current Classes — top of schedule */}
          <Section title={`Current Classes (${currentPrograms.length})`} defaultOpen={true}
            action={
              <div className="flex items-center gap-2">
                {!showAllClasses && futureCount > 0 && (
                  <span className="text-[10px] text-gray-400">{futureCount} more starting later</span>
                )}
                <button type="button" onClick={e => { e.stopPropagation(); setShowAllClasses(v => !v); }}
                  className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                    showAllClasses ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {showAllClasses ? 'Show Next 30 Days' : 'Show All Assigned'}
                </button>
              </div>
            }>
            {currentPrograms.length === 0 ? (
              <p className="text-sm text-gray-400">No active classes assigned{!showAllClasses ? ' in the next 30 days' : ''}</p>
            ) : (
              <ProgramTable programs={currentPrograms} profId={profId} isLead={isLead} viewOnly={viewOnly} sessions={sessions} subDateSet={subDateSet} />
            )}
          </Section>

          {/* Upcoming Sessions */}
          <Section title={`Upcoming Sessions (${upcomingSessions.length})${totalUpcomingPay > 0 ? ' — ' + formatCurrency(totalUpcomingPay) + ' total' : ''}`} defaultOpen={true}>
            {upcomingSessions.length === 0 ? (
              <p className="text-sm text-gray-400">No upcoming sessions</p>
            ) : (
              <SessionTable sessions={upcomingSessions} profId={profId} viewOnly={viewOnly} subDateSet={subDateSet} />
            )}
          </Section>

          {/* Substitute Dates */}
          {subDates.length > 0 && (() => {
            const futSub = subDates.filter(d => (d.date_requested || '').split('T')[0] >= today)
              .sort((a, b) => (a.date_requested || '').localeCompare(b.date_requested || ''));
            const pastSub = subDates.filter(d => (d.date_requested || '').split('T')[0] < today)
              .sort((a, b) => (b.date_requested || '').localeCompare(a.date_requested || ''));
            return (
              <Section title={`Substitute Dates (${futSub.length} upcoming)`} defaultOpen={futSub.length > 0}>
                {futSub.length > 0 && (
                  <div className="space-y-0.5 mb-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Upcoming</div>
                    {futSub.map(d => (
                      <div key={d.id} className="flex items-center gap-3 px-3 py-1.5 rounded bg-amber-50/50 text-sm">
                        <span className="w-24 font-medium text-gray-700">{formatDate((d.date_requested || '').split('T')[0])}</span>
                        <span className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{d.reason_name || 'No reason'}</span>
                        {d.notes && <span className="text-xs text-gray-400 truncate">{d.notes}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {pastSub.length > 0 && (
                  <details className="group">
                    <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600">
                      Past ({pastSub.length})
                    </summary>
                    <div className="space-y-0.5 mt-1">
                      {pastSub.map(d => (
                        <div key={d.id} className="flex items-center gap-3 px-3 py-1 rounded bg-gray-50 text-sm text-gray-400">
                          <span className="w-24">{formatDate((d.date_requested || '').split('T')[0])}</span>
                          <span className="text-xs">{d.reason_name || '—'}</span>
                          {d.notes && <span className="text-xs truncate">{d.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </Section>
            );
          })()}

          {/* Observations */}
          {observations.length > 0 && (() => {
            const futObs = observations.filter(o => (o.observation_date || '').split('T')[0] >= today && o.status !== 'cancelled')
              .sort((a, b) => (a.observation_date || '').localeCompare(b.observation_date || ''));
            const pastObs = observations.filter(o => (o.observation_date || '').split('T')[0] < today && o.status !== 'cancelled')
              .sort((a, b) => (b.observation_date || '').localeCompare(a.observation_date || ''));
            if (futObs.length === 0 && pastObs.length === 0) return null;
            return (
              <Section title={`Observations (${futObs.length} upcoming)`} defaultOpen={futObs.length > 0}>
                {futObs.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {futObs.map(o => {
                      const isEval = o.observation_type === 'evaluation';
                      return (
                        <div key={o.id} className={`rounded-lg border p-3 ${isEval ? 'border-violet-200 bg-violet-50/30' : 'border-gray-200'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-gray-900">{formatDate((o.observation_date || '').split('T')[0])}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isEval ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                              {isEval ? 'Evaluation' : 'Observation'}
                            </span>
                            {o.is_paid && o.pay_amount ? <span className="text-[10px] text-green-600">${o.pay_amount}</span> : null}
                          </div>
                          <div className="text-sm text-gray-800">{o.program_nickname}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {o.location_nickname}{o.address ? ` — ${o.address}` : ''}
                          </div>
                          <div className="text-xs text-gray-500">
                            Time: {o.start_time ? formatTime(o.start_time) : '—'}
                            {o.class_length_minutes ? ` (${o.class_length_minutes} min)` : ''}
                            &nbsp;&bull;&nbsp;Lead: <strong>{o.lead_professor_name || '—'}</strong>
                            {o.lead_professor_phone ? ` ${o.lead_professor_phone}` : ''}
                          </div>
                          {o.notes && <div className="text-xs text-gray-400 mt-0.5">{o.notes}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {pastObs.length > 0 && (
                  <details>
                    <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600">
                      Past ({pastObs.length})
                    </summary>
                    <div className="space-y-1 mt-1">
                      {pastObs.map(o => (
                        <div key={o.id} className="flex items-center gap-3 px-3 py-1 rounded bg-gray-50 text-sm text-gray-400">
                          <span className="w-20">{formatDate((o.observation_date || '').split('T')[0])}</span>
                          <span className="flex-1">{o.program_nickname}</span>
                          <span className="text-[10px]">{o.observation_type === 'evaluation' ? 'Eval' : 'Obs'}</span>
                          <span className="text-[10px]">{o.status}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </Section>
            );
          })()}

          {/* Past Sessions — admin only, professors see this in Pay History */}
          {!viewOnly && pastSessions.length > 0 && (
            <Section title={`Past Sessions (${pastSessions.length})${totalPastPay > 0 ? ' — ' + formatCurrency(totalPastPay) + ' earned' : ''}`} defaultOpen={false}>
              <SessionTable sessions={pastSessions} profId={profId} viewOnly={viewOnly} subDateSet={subDateSet} />
            </Section>
          )}

          {/* Past Programs */}
          {pastPrograms.length > 0 && (
            <Section title={`Past Programs (${pastPrograms.length})`} defaultOpen={false}>
              <ProgramTable programs={pastPrograms} profId={profId} isLead={isLead} viewOnly={viewOnly} sessions={sessions} subDateSet={subDateSet} />
            </Section>
          )}

          {/* Upcoming Parties */}
          {parties.length > 0 && (
            <Section title={`Upcoming Parties (${parties.length})`} defaultOpen={true}>
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Theme</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Pay</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parties.map((p, i) => {
                      const lead = String(p.lead_professor_id) === String(profId);
                      return (
                        <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                          <td className="px-3 py-2">{p.first_session_date ? formatDate(p.first_session_date) : '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{p.start_time ? formatTime(p.start_time) : '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{p.party_format_name || '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{p.party_theme || '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{p.party_city || p.party_location_text || '—'}</td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatCurrency(lead ? p.lead_professor_pay : p.assistant_professor_pay)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                              lead ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'bg-gray-100 text-gray-600'
                            }`}>{lead ? 'Lead' : 'Assist'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Locations */}
          {locations.length > 0 && (
            <Section title={`Locations (${locations.length})`} defaultOpen={false}>
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Address</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {locations.map((l, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2 font-medium">{l.nickname}</td>
                        <td className="px-3 py-2 text-gray-600">{l.address || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{l.contact || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}
    </AppShell>
  );
}
