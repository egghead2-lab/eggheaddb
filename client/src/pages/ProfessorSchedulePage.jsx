import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { SearchSelect } from '../components/ui/SearchSelect';
import { useProfessorList } from '../hooks/useReferenceData';
import { formatDate, formatTime, formatCurrency } from '../lib/utils';
import api from '../api/client';

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function getDayString(prog) {
  return DAYS.map((d, i) => prog[d] ? DAY_LABELS[i] : null).filter(Boolean).join(', ');
}

export default function ProfessorSchedulePage() {
  const { id: paramId } = useParams();
  const [selectedId, setSelectedId] = useState(paramId || '');
  const profId = paramId || selectedId;

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

  // Group sessions by week
  const sessionsByWeek = {};
  sessions.forEach(s => {
    const d = new Date(s.session_date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().split('T')[0];
    if (!sessionsByWeek[key]) sessionsByWeek[key] = [];
    sessionsByWeek[key].push(s);
  });

  // Unique locations from programs
  const locationMap = {};
  programs.forEach(p => {
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
            <Link to="/professors" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Professors</Link>
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
          {!paramId && (
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
                <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{prof.phone_number || '—'}</span></div>
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
                  ['Show Party', prof.show_party_trained_id],
                  ['Slime Party', prof.slime_party_trained_id],
                  ['Demo', prof.demo_trained_id],
                  ['StudySmart', prof.studysmart_trained_id],
                  ['Camp', prof.camp_trained_id],
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

          {/* Classes Table */}
          <Section title={`Classes (${programs.length})`} defaultOpen={true}>
            {programs.length === 0 ? (
              <p className="text-sm text-gray-400">No active classes assigned</p>
            ) : (
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
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Pay</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {programs.map((p, i) => (
                      <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2">
                          <Link to={`/programs/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
                          <div className="text-xs text-gray-400">{p.class_status_name}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{p.location_nickname || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{p.class_name || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{getDayString(p)}</td>
                        <td className="px-3 py-2 text-gray-600">{p.start_time ? formatTime(p.start_time) : '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {p.first_session_date ? formatDate(p.first_session_date) : '—'}
                          {p.last_session_date ? ` — ${formatDate(p.last_session_date)}` : ''}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatCurrency(isLead(p) ? p.lead_professor_pay : p.assistant_professor_pay)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                            isLead(p) ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {isLead(p) ? 'Lead' : 'Assist'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Upcoming Sessions */}
          <Section title={`Upcoming Sessions (${sessions.length})`} defaultOpen={true}>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-400">No upcoming sessions in the next 60 days</p>
            ) : (
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
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sessions.map((s, i) => {
                      const dateStr = (s.session_date || '').split('T')[0];
                      const dow = dateStr ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : '—';
                      const isToday = dateStr === new Date().toISOString().split('T')[0];
                      const isPast = dateStr < new Date().toISOString().split('T')[0];
                      const lead = String(s.lead_professor_id) === String(profId);
                      return (
                        <tr key={s.id} className={`${isToday ? 'bg-blue-50 font-medium' : isPast ? 'text-gray-400' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <td className="px-3 py-2">{formatDate(dateStr)}</td>
                          <td className="px-3 py-2 text-gray-500">{dow}</td>
                          <td className="px-3 py-2 text-gray-600">{s.session_time ? formatTime(s.session_time) : '—'}</td>
                          <td className="px-3 py-2">
                            <Link to={`/programs/${s.program_id || ''}`} className="text-[#1e3a5f] hover:underline">
                              {s.program_nickname}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{s.location_nickname || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{s.lesson_name || '—'}</td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(lead ? s.professor_pay : s.assistant_pay)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

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
                          <td className="px-3 py-2 text-gray-600">{p.party_location_text || '—'}</td>
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
