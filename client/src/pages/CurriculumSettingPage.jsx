import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import { useToast } from '../components/ui/Toast';
import { Section } from '../components/ui/Section';
import { formatDate } from '../lib/utils';

const WINDOW_WEEKS = 12;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Local-date helpers (avoid Date.toISOString → UTC drift on date-only strings).
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
// Monday of the week containing `d` (treating Sunday as belonging to the previous week's Monday).
function mondayOf(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = dt.getDay();
  const diff = (dow + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  return dt;
}
function addDays(d, n) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}
function shortDate(s) {
  const d = parseDateStr(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function CurriculumSettingPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const [classTypeId, setClassTypeId] = useState('');
  const [classId, setClassId] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [areaId, setAreaId] = useState('');
  // When true, every per-cell dropdown lists lessons from every module (not just
  // the program's own). Useful when a 12-session program needs lessons from a
  // sibling module to fill the last few weeks.
  const [showAllLessons, setShowAllLessons] = useState(false);

  // Date window — sticky 12-week view, pannable by 4 weeks.
  const [weekStart, setWeekStart] = useState(() => toDateStr(mondayOf(new Date())));
  const weeks = useMemo(() => {
    const startMon = parseDateStr(weekStart);
    return Array.from({ length: WINDOW_WEEKS }, (_, i) => toDateStr(addDays(startMon, i * 7)));
  }, [weekStart]);
  const shiftWeeks = (deltaWeeks) => {
    setWeekStart(toDateStr(addDays(parseDateStr(weekStart), deltaWeeks * 7)));
  };

  // Pending edits: { sessionId: { lesson_id, no_lesson_taught } }
  const [edits, setEdits] = useState({});
  const hasEdits = Object.keys(edits).length > 0;

  // Classes filtered by class_type
  const filteredClasses = useMemo(() => {
    if (!ref.classes) return [];
    if (!classTypeId) return ref.classes;
    return ref.classes.filter(c => String(c.class_type_id) === String(classTypeId));
  }, [ref.classes, classTypeId]);

  // Fetch programs
  const queryParams = {
    class_type_id: classTypeId || undefined,
    class_id: classId || undefined,
    contractor_id: contractorId || undefined,
    area_id: areaId || undefined,
  };
  const hasFilter = classTypeId || classId || contractorId || areaId;

  const { data: progData, isLoading } = useQuery({
    queryKey: ['curriculum-programs', queryParams],
    queryFn: () => api.get('/curriculum/programs', { params: queryParams }).then(r => r.data),
    enabled: !!hasFilter,
  });
  const programs = progData?.data || [];

  // All sessions per visible program (full schedule, not just the window — needed for duplicate detection)
  const progIds = programs.map(p => p.id);
  const { data: sessionsData } = useQuery({
    queryKey: ['curriculum-bulk-sessions', progIds.join(',')],
    queryFn: () => api.post('/curriculum/bulk-sessions', { program_ids: progIds }).then(r => r.data),
    enabled: progIds.length > 0,
  });
  const sessionsByProgram = sessionsData?.data || {};

  // Fetch ALL active lessons across modules; we filter per-program in the UI.
  const { data: lessonsData } = useQuery({
    queryKey: ['curriculum-lessons-all'],
    queryFn: () => api.get('/curriculum/lessons').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const allLessons = lessonsData?.data || [];
  const lessonNameById = useMemo(() => Object.fromEntries(allLessons.map(l => [String(l.id), l.lesson_name])), [allLessons]);

  // Lessons grouped by class_id, so each program-row can default to its own module.
  const lessonsByClassId = useMemo(() => {
    const out = {};
    for (const l of allLessons) {
      const k = String(l.class_id || '');
      if (!out[k]) out[k] = [];
      out[k].push(l);
    }
    return out;
  }, [allLessons]);

  // Pool used by the column-bulk picker. If the user has filtered to a single
  // module, that module's lessons; otherwise all of them (with module names).
  const columnBulkLessons = useMemo(() => {
    if (classId) return lessonsByClassId[String(classId)] || [];
    return allLessons;
  }, [classId, allLessons, lessonsByClassId]);

  // Resolve a session's *current* lesson_id (pending edit wins over DB value)
  const resolveLessonId = (s) => {
    const ed = edits[s.id];
    if (ed !== undefined) return ed.no_lesson_taught ? null : (ed.lesson_id || null);
    return s.no_lesson_taught ? null : (s.lesson_id || null);
  };
  const resolveNoLesson = (s) => {
    const ed = edits[s.id];
    if (ed !== undefined) return !!ed.no_lesson_taught;
    return !!s.no_lesson_taught;
  };

  // Bucket each program's sessions by Monday-of-week string
  const sessionsByProgramByWeek = useMemo(() => {
    const out = {};
    for (const [pidStr, sList] of Object.entries(sessionsByProgram)) {
      const pid = parseInt(pidStr);
      out[pid] = {};
      for (const s of sList) {
        const dateStr = (s.session_date || '').split('T')[0];
        if (!dateStr) continue;
        const monStr = toDateStr(mondayOf(parseDateStr(dateStr)));
        if (!out[pid][monStr]) out[pid][monStr] = [];
        out[pid][monStr].push({ ...s, date_str: dateStr });
      }
    }
    return out;
  }, [sessionsByProgram, edits]);

  // For duplicate detection: for each program, lessonId → array of session_date strings (excluding the session currently being checked)
  const lessonDatesByProgram = useMemo(() => {
    const out = {};
    for (const [pidStr, sList] of Object.entries(sessionsByProgram)) {
      const pid = parseInt(pidStr);
      const map = {};
      for (const s of sList) {
        const lid = resolveLessonId(s);
        if (!lid) continue;
        if (!map[lid]) map[lid] = [];
        map[lid].push({ session_id: s.id, date_str: (s.session_date || '').split('T')[0] });
      }
      out[pid] = map;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsByProgram, edits]);

  const dupeDatesFor = (programId, sessionId, lessonId) => {
    if (!lessonId) return [];
    const map = lessonDatesByProgram[programId] || {};
    return (map[lessonId] || []).filter(x => x.session_id !== sessionId).map(x => x.date_str);
  };

  const editSession = (sessionId, lessonId, noLessonTaught = false) => {
    setEdits(prev => ({
      ...prev,
      [sessionId]: { lesson_id: noLessonTaught ? null : (lessonId || null), no_lesson_taught: noLessonTaught },
    }));
  };

  // Resolve which lessons are visible in a per-cell dropdown for a given program.
  // Defaults to that program's module; switching on "Show all module lessons"
  // (or having no in-module lessons available) expands to every active lesson.
  const lessonsForProgram = (programClassId) => {
    if (showAllLessons) return allLessons;
    const own = lessonsByClassId[String(programClassId || '')] || [];
    return own.length > 0 ? own : allLessons; // graceful fallback if module has no lessons defined
  };

  // Column-bulk: set every visible (assignable, non-OFF) session in this week-column to a lesson.
  const bulkSetColumn = (mondayStr, lessonId) => {
    if (!lessonId) return;
    let count = 0;
    for (const prog of programs) {
      const weekSessions = sessionsByProgramByWeek[prog.id]?.[mondayStr] || [];
      for (const s of weekSessions) {
        if (s.not_billed) continue;
        editSession(s.id, parseInt(lessonId), false);
        count++;
      }
    }
    toast.info(`Queued ${count} session${count !== 1 ? 's' : ''} for ${shortDate(mondayStr)} — click Save to apply`);
  };

  // Fill-down: copy the top program's lesson for this week into all programs below it in the same column.
  const fillDownColumn = (mondayStr) => {
    if (!programs.length) return;
    const topProg = programs[0];
    const topWeekSessions = sessionsByProgramByWeek[topProg.id]?.[mondayStr] || [];
    const topLessonId = topWeekSessions.length ? resolveLessonId(topWeekSessions[0]) : null;
    if (!topLessonId) { toast.error('Top row has no lesson set for this week — pick one first'); return; }
    let count = 0;
    for (let i = 1; i < programs.length; i++) {
      const prog = programs[i];
      const weekSessions = sessionsByProgramByWeek[prog.id]?.[mondayStr] || [];
      for (const s of weekSessions) {
        if (s.not_billed) continue;
        editSession(s.id, topLessonId, false);
        count++;
      }
    }
    toast.info(`Filled ${count} session${count !== 1 ? 's' : ''} with "${lessonNameById[topLessonId] || 'lesson'}" — click Save to apply`);
  };

  // Save edits
  const saveMutation = useMutation({
    mutationFn: () => api.post('/curriculum/save', {
      changes: Object.entries(edits).map(([sid, val]) => ({ session_id: parseInt(sid), ...val })),
      label: `Manual edits on ${new Date().toISOString().split('T')[0]}`,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['curriculum-bulk-sessions']);
      qc.invalidateQueries(['curriculum-programs']);
      qc.invalidateQueries(['curriculum-backups']);
      setEdits({});
      toast.success('Saved');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Save failed'),
  });

  // Backups
  const { data: backupsData } = useQuery({
    queryKey: ['curriculum-backups'],
    queryFn: () => api.get('/curriculum/backups').then(r => r.data),
  });
  const backups = backupsData?.data || [];

  const revertMutation = useMutation({
    mutationFn: (backupId) => api.post(`/curriculum/revert/${backupId}`),
    onSuccess: () => {
      qc.invalidateQueries(['curriculum-bulk-sessions']);
      qc.invalidateQueries(['curriculum-programs']);
      qc.invalidateQueries(['curriculum-backups']);
      toast.success('Reverted');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Revert failed'),
  });

  const today = toDateStr(new Date());

  return (
    <AppShell>
      <PageHeader title="Curriculum Setting" action={
        hasEdits ? (
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : `Save ${Object.keys(edits).length} Change${Object.keys(edits).length !== 1 ? 's' : ''}`}
          </Button>
        ) : null
      } />

      {/* Filters */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <Select value={classTypeId} onChange={e => { setClassTypeId(e.target.value); setClassId(''); }} className="w-36">
          <option value="">All Types</option>
          {(ref.classTypes || []).map(ct => <option key={ct.id} value={ct.id}>{ct.class_type_name}</option>)}
        </Select>
        <Select value={classId} onChange={e => setClassId(e.target.value)} className="w-56">
          <option value="">All Modules</option>
          {filteredClasses.map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
        </Select>
        <Select value={contractorId} onChange={e => setContractorId(e.target.value)} className="w-48">
          <option value="">All Contractors</option>
          {(ref.contractors || []).map(c => <option key={c.id} value={c.id}>{c.contractor_name}</option>)}
        </Select>
        <Select value={areaId} onChange={e => setAreaId(e.target.value)} className="w-44">
          <option value="">All Areas</option>
          {(ref.areas || []).map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
        </Select>

        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer" title="Let dropdowns show lessons from other modules — for filling extra weeks when the program's own module runs out of lessons">
          <input type="checkbox" checked={showAllLessons} onChange={e => setShowAllLessons(e.target.checked)} className="w-3.5 h-3.5 accent-[#1e3a5f]" />
          Show all module lessons
        </label>

        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => shiftWeeks(-4)} className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50">← 4 wks</button>
          <button onClick={() => setWeekStart(toDateStr(mondayOf(new Date())))} className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50">Today</button>
          <button onClick={() => shiftWeeks(4)} className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50">4 wks →</button>
          <span className="text-xs text-gray-500 ml-2">
            {shortDate(weeks[0])} – {shortDate(weeks[weeks.length - 1])}
          </span>
        </div>
      </div>

      <div className="p-6">
        {!hasFilter ? (
          <div className="text-center py-16 text-gray-400 text-sm">Select a class type, module, contractor, or area to view programs</div>
        ) : isLoading ? (
          <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
        ) : programs.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No matching programs</div>
        ) : (
          <CurriculumGrid
            programs={programs}
            weeks={weeks}
            sessionsByProgramByWeek={sessionsByProgramByWeek}
            columnBulkLessons={columnBulkLessons}
            lessonsForProgram={lessonsForProgram}
            showAllLessons={showAllLessons}
            lessonNameById={lessonNameById}
            today={today}
            resolveLessonId={resolveLessonId}
            resolveNoLesson={resolveNoLesson}
            editSession={editSession}
            bulkSetColumn={bulkSetColumn}
            fillDownColumn={fillDownColumn}
            dupeDatesFor={dupeDatesFor}
          />
        )}

        {/* Backups */}
        {backups.length > 0 && (
          <div className="mt-6">
            <Section title={`Recent Backups (${backups.length})`} defaultOpen={false}>
              <div className="space-y-1">
                {backups.map(b => (
                  <div key={b.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100 last:border-0">
                    <div>
                      <span className="text-gray-700">{b.backup_label}</span>
                      <span className="text-gray-400 ml-2">{formatDate(b.created_at)} · {b.session_count} sessions</span>
                      {b.created_by_name && <span className="text-gray-400"> · {b.created_by_name}</span>}
                    </div>
                    <ConfirmButton onConfirm={() => revertMutation.mutate(b.id)}
                      disabled={revertMutation.isPending}
                      className="text-xs text-amber-600 hover:text-amber-800 font-medium">Revert</ConfirmButton>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function CurriculumGrid({
  programs, weeks, sessionsByProgramByWeek, columnBulkLessons, lessonsForProgram, showAllLessons,
  lessonNameById, today,
  resolveLessonId, resolveNoLesson, editSession, bulkSetColumn, fillDownColumn, dupeDatesFor,
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 bg-gray-50 border-r border-gray-200 px-2 py-2 text-left font-medium text-gray-600" style={{ minWidth: '220px' }}>
                Program
              </th>
              {weeks.map(mon => (
                <ColumnHeader key={mon} mondayStr={mon} lessons={columnBulkLessons}
                  onBulkSet={(lid) => bulkSetColumn(mon, lid)}
                  onFillDown={() => fillDownColumn(mon)} />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {programs.map((prog, i) => {
              const hasUnset = (prog.unscheduled_count || 0) > 0;
              const isUnconfirmed = !prog.status_confirmed;
              const rowBg = hasUnset ? 'bg-yellow-50' : (i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40');
              return (
              <tr key={prog.id} className={rowBg}>
                <td className={`sticky left-0 z-10 border-r border-gray-200 px-2 py-1.5 ${rowBg} ${hasUnset ? 'border-l-4 border-l-yellow-400' : ''}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link to={`/programs/${prog.id}`} className="font-medium text-[#1e3a5f] hover:underline text-xs">{prog.program_nickname}</Link>
                    {isUnconfirmed && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-medium" title={prog.class_status_name || 'Unconfirmed'}>
                        {prog.class_status_name || 'Unconfirmed'}
                      </span>
                    )}
                    {hasUnset && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-200 text-yellow-800 font-medium" title={`${prog.unscheduled_count} unset session${prog.unscheduled_count !== 1 ? 's' : ''}`}>
                        {prog.unscheduled_count} unset
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 truncate" style={{ maxWidth: '200px' }}>
                    {prog.location_nickname || '—'}
                  </div>
                </td>
                {weeks.map(mon => {
                  const sessions = (sessionsByProgramByWeek[prog.id]?.[mon] || [])
                    .slice()
                    .sort((a, b) => a.date_str.localeCompare(b.date_str));
                  const cellLessons = lessonsForProgram(prog.class_id);
                  return (
                    <WeekCell key={mon} sessions={sessions} programId={prog.id} lessons={cellLessons}
                      programClassId={prog.class_id} showAllLessons={showAllLessons}
                      today={today} resolveLessonId={resolveLessonId} resolveNoLesson={resolveNoLesson}
                      editSession={editSession} dupeDatesFor={dupeDatesFor}
                      lessonNameById={lessonNameById} />
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColumnHeader({ mondayStr, lessons, onBulkSet, onFillDown }) {
  const [bulkVal, setBulkVal] = useState('');
  // When the lesson list spans multiple modules, group the <options> by class_name.
  const grouped = useMemo(() => {
    const byClass = {};
    for (const l of lessons) {
      const key = l.class_name || '— Unassigned —';
      if (!byClass[key]) byClass[key] = [];
      byClass[key].push(l);
    }
    return byClass;
  }, [lessons]);
  const classNames = Object.keys(grouped);
  const isCrossModule = classNames.length > 1;

  return (
    <th className="border-r border-gray-100 px-1.5 py-1.5 align-top font-normal" style={{ minWidth: '130px' }}>
      <div className="text-[11px] font-semibold text-gray-700 text-center">
        Week of {shortDate(mondayStr)}
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        <select value={bulkVal}
          onChange={e => {
            const v = e.target.value;
            if (v) { onBulkSet(v); setBulkVal(''); }
          }}
          className="text-[10px] rounded border border-gray-200 bg-white px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30"
          title="Set all programs in this column to this lesson">
          <option value="">— Set all to… —</option>
          {isCrossModule
            ? classNames.sort().map(cn => (
                <optgroup key={cn} label={cn}>
                  {grouped[cn].map(l => <option key={l.id} value={l.id}>{l.lesson_name}</option>)}
                </optgroup>
              ))
            : lessons.map(l => <option key={l.id} value={l.id}>{l.lesson_name}</option>)}
        </select>
        <button onClick={onFillDown} type="button"
          className="text-[9px] text-[#1e3a5f] hover:underline self-center"
          title="Copy the top row's lesson down to all programs in this column">
          ↓ fill down
        </button>
      </div>
    </th>
  );
}

function WeekCell({ sessions, programId, programClassId, showAllLessons, lessons, today, resolveLessonId, resolveNoLesson, editSession, dupeDatesFor, lessonNameById }) {
  if (sessions.length === 0) {
    return <td className="border-r border-gray-100 px-1 py-1 text-center text-gray-200 text-[10px]">—</td>;
  }
  return (
    <td className="border-r border-gray-100 px-1 py-1 align-top">
      <div className="space-y-0.5">
        {sessions.map(s => (
          <SessionPicker key={s.id} session={s} programId={programId} programClassId={programClassId}
            showAllLessons={showAllLessons} lessons={lessons} today={today}
            resolveLessonId={resolveLessonId} resolveNoLesson={resolveNoLesson}
            editSession={editSession} dupeDatesFor={dupeDatesFor}
            lessonNameById={lessonNameById}
            showDayLabel={sessions.length > 1} />
        ))}
      </div>
    </td>
  );
}

function SessionPicker({ session, programId, programClassId, showAllLessons, lessons, today, resolveLessonId, resolveNoLesson, editSession, dupeDatesFor, lessonNameById, showDayLabel }) {
  const isPast = session.date_str < today;
  const isOff = !!session.not_billed;
  const noLesson = resolveNoLesson(session);
  const lessonId = resolveLessonId(session);
  const dupes = dupeDatesFor(programId, session.id, lessonId);
  const dayLabel = showDayLabel ? DAY_SHORT[parseDateStr(session.date_str).getDay()] : null;
  // If the currently-assigned lesson belongs to a different module than the
  // program, surface that with a small chip (and make sure it's selectable
  // even when "Show all module lessons" is off).
  const currentLessonInList = lessonId ? lessons.some(l => String(l.id) === String(lessonId)) : true;
  const renderLessons = currentLessonInList ? lessons : [...lessons, ...allLessonsContaining(lessonId)];

  function allLessonsContaining(lid) {
    if (!lid) return [];
    return [{ id: lid, lesson_name: lessonNameById[lid] || `Lesson #${lid}`, class_id: null, class_name: '(other module)' }];
  }

  // When the per-program dropdown is showing a mix of modules, group options so
  // it's clear which lesson belongs to which class.
  const groupedRender = (() => {
    if (!showAllLessons) return null;
    const byClass = {};
    for (const l of renderLessons) {
      const key = l.class_name || '— Unassigned —';
      if (!byClass[key]) byClass[key] = [];
      byClass[key].push(l);
    }
    return byClass;
  })();

  if (isOff) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-gray-400">
        {dayLabel && <span className="w-7 shrink-0 text-gray-300">{dayLabel}</span>}
        <span className="px-1 rounded bg-gray-200 text-gray-500">OFF</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {dayLabel && <span className="w-7 shrink-0 text-[10px] text-gray-400">{dayLabel}</span>}
      <select
        value={noLesson ? '__no_lesson__' : (lessonId || '')}
        onChange={e => {
          const v = e.target.value;
          if (v === '__no_lesson__') editSession(session.id, null, true);
          else editSession(session.id, v ? parseInt(v) : null, false);
        }}
        className={`flex-1 min-w-0 text-[10px] rounded border bg-white px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/40 truncate ${
          noLesson ? 'border-blue-200 bg-blue-50 text-blue-600' :
          !lessonId ? (isPast ? 'border-gray-200 bg-gray-50' : 'border-yellow-400 bg-yellow-100 font-medium') :
          dupes.length > 0 ? 'border-amber-400 bg-amber-50' :
          'border-gray-200'
        }`}
        title={shortDate(session.date_str)}
      >
        <option value="">—</option>
        {groupedRender
          ? Object.keys(groupedRender).sort().map(cn => (
              <optgroup key={cn} label={cn}>
                {groupedRender[cn].map(l => <option key={l.id} value={l.id}>{l.lesson_name}</option>)}
              </optgroup>
            ))
          : renderLessons.map(l => <option key={l.id} value={l.id}>{l.lesson_name}</option>)}
        {isPast && <option value="__no_lesson__">No Lesson Taught</option>}
      </select>
      {dupes.length > 0 && (
        <span className="relative shrink-0 inline-flex" tabIndex={0}
          // group/dupe enables the hover/focus popover below.
        >
          <span className="text-amber-600 text-[11px] cursor-help peer">⚠</span>
          <span className="pointer-events-none absolute bottom-full right-0 mb-1 z-50 hidden peer-hover:block peer-focus:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
            Also scheduled: {dupes.sort().map(shortDate).join(', ')}
          </span>
        </span>
      )}
    </div>
  );
}
