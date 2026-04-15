import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { Section } from '../components/ui/Section';
import { formatDate } from '../lib/utils';

const CELL_COLORS = {
  filled: '',
  unscheduled_future: 'bg-amber-50',
  unscheduled_past: 'bg-gray-100',
  off: 'bg-gray-200 text-gray-400',
  no_lesson: 'bg-blue-50 text-blue-400',
};

export default function CurriculumSettingPage() {
  const qc = useQueryClient();
  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const [classTypeId, setClassTypeId] = useState('');
  const [classId, setClassId] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [showUnsetOnly, setShowUnsetOnly] = useState(false);
  const [checked, setChecked] = useState(new Set());
  const [showBulkSet, setShowBulkSet] = useState(false);

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
    show_unset_only: showUnsetOnly ? 'true' : undefined,
  };
  const hasFilter = classTypeId || classId || contractorId || areaId;

  const { data: progData, isLoading } = useQuery({
    queryKey: ['curriculum-programs', queryParams],
    queryFn: () => api.get('/curriculum/programs', { params: queryParams }).then(r => r.data),
    enabled: !!hasFilter,
  });
  const programs = progData?.data || [];

  // Bulk fetch sessions for visible programs
  const progIds = programs.map(p => p.id);
  const { data: sessionsData } = useQuery({
    queryKey: ['curriculum-bulk-sessions', progIds.join(',')],
    queryFn: () => api.post('/curriculum/bulk-sessions', { program_ids: progIds }).then(r => r.data),
    enabled: progIds.length > 0,
  });
  const sessionsByProgram = sessionsData?.data || {};

  // Lessons for dropdown (filtered by selected class or program's class)
  const { data: lessonsData } = useQuery({
    queryKey: ['curriculum-lessons', classId],
    queryFn: () => api.get('/curriculum/lessons', { params: { class_id: classId || undefined } }).then(r => r.data),
    enabled: !!classId,
  });
  const lessons = lessonsData?.data || [];

  // Day count helper
  const getDayCount = (p) => {
    let count = 0;
    ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(d => { if (p[d]) count++; });
    return count;
  };

  const toggleCheck = (id) => setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => {
    if (checked.size === programs.length) setChecked(new Set());
    else setChecked(new Set(programs.map(p => p.id)));
  };

  const editSession = (sessionId, lessonId, noLessonTaught = false) => {
    setEdits(prev => ({ ...prev, [sessionId]: { lesson_id: noLessonTaught ? null : (lessonId || null), no_lesson_taught: noLessonTaught } }));
  };

  // Save edits
  const saveMutation = useMutation({
    mutationFn: () => api.post('/curriculum/save', {
      changes: Object.entries(edits).map(([sid, val]) => ({ session_id: parseInt(sid), ...val })),
      label: `Manual edits on ${new Date().toISOString().split('T')[0]}`,
    }),
    onSuccess: () => { qc.invalidateQueries(['curriculum-bulk-sessions']); qc.invalidateQueries(['curriculum-programs']); setEdits({}); },
  });

  // Backups
  const { data: backupsData } = useQuery({
    queryKey: ['curriculum-backups'],
    queryFn: () => api.get('/curriculum/backups').then(r => r.data),
  });
  const backups = backupsData?.data || [];

  const revertMutation = useMutation({
    mutationFn: (backupId) => api.post(`/curriculum/revert/${backupId}`),
    onSuccess: () => { qc.invalidateQueries(['curriculum-bulk-sessions']); qc.invalidateQueries(['curriculum-programs']); qc.invalidateQueries(['curriculum-backups']); },
  });

  const today = new Date().toISOString().split('T')[0];

  return (
    <AppShell>
      <PageHeader title="Curriculum Setting" action={
        <div className="flex items-center gap-2">
          {hasEdits && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : `Save ${Object.keys(edits).length} Changes`}
            </Button>
          )}
          {checked.size > 0 && (
            <Button onClick={() => setShowBulkSet(true)}>Bulk Set ({checked.size})</Button>
          )}
        </div>
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
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={showUnsetOnly} onChange={e => setShowUnsetOnly(e.target.checked)} className="w-3.5 h-3.5" />
          Unset only
        </label>
        <span className="text-xs text-gray-400 ml-auto">{programs.length} programs</span>
      </div>

      <div className="p-6 flex gap-4">
        {/* Main grid */}
        <div className={showBulkSet ? 'flex-1 min-w-0' : 'w-full'}>
          {!hasFilter ? (
            <div className="text-center py-16 text-gray-400 text-sm">Select a class type, module, contractor, or area to view programs</div>
          ) : isLoading ? (
            <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
          ) : programs.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No matching programs</div>
          ) : (
            <div className="space-y-2">
              {programs.map(prog => {
                const sessions = sessionsByProgram[prog.id] || [];
                const isMultiDay = getDayCount(prog) > 1;

                return (
                  <div key={prog.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {/* Program header */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                      <input type="checkbox" checked={checked.has(prog.id)} onChange={() => toggleCheck(prog.id)} className="w-3.5 h-3.5" />
                      <Link to={`/programs/${prog.id}`} className="font-medium text-sm text-[#1e3a5f] hover:underline">{prog.program_nickname}</Link>
                      {isMultiDay && <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Multi-Day</span>}
                      <span className="text-[10px] text-gray-400">{prog.class_name} · {prog.location_nickname}</span>
                      {prog.contractor_name && <span className="text-[10px] text-gray-400">· {prog.contractor_name}</span>}
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {sessions.length} sessions
                        {prog.unscheduled_count > 0 && <span className="text-amber-600 ml-1">({prog.unscheduled_count} unset)</span>}
                      </span>
                    </div>

                    {/* Session grid */}
                    <div className="overflow-x-auto">
                      <div className="flex min-w-max">
                        {sessions.map(s => {
                          const dateStr = (s.session_date || '').toString().split('T')[0];
                          const isPast = dateStr < today;
                          const isOff = s.not_billed;
                          const isNoLesson = s.no_lesson_taught;
                          const editVal = edits[s.id];
                          const currentLessonId = editVal !== undefined ? editVal.lesson_id : s.lesson_id;
                          const currentNoLesson = editVal !== undefined ? editVal.no_lesson_taught : s.no_lesson_taught;
                          const isUnscheduled = !currentLessonId && !currentNoLesson && !isOff;

                          let bgClass = '';
                          if (isOff) bgClass = CELL_COLORS.off;
                          else if (currentNoLesson) bgClass = CELL_COLORS.no_lesson;
                          else if (isUnscheduled && isPast) bgClass = CELL_COLORS.unscheduled_past;
                          else if (isUnscheduled) bgClass = CELL_COLORS.unscheduled_future;

                          return (
                            <div key={s.id} className={`flex flex-col border-r border-gray-100 last:border-r-0 ${bgClass}`} style={{ minWidth: '100px' }}>
                              <div className="text-[9px] text-gray-400 px-1.5 py-0.5 border-b border-gray-100 text-center">
                                {dateStr ? formatDate(dateStr) : '—'}
                              </div>
                              <div className="px-1 py-1">
                                {isOff ? (
                                  <div className="text-[10px] text-center font-medium text-gray-400">OFF</div>
                                ) : (
                                  <select
                                    value={currentNoLesson ? '__no_lesson__' : (currentLessonId || '')}
                                    onChange={e => {
                                      const val = e.target.value;
                                      if (val === '__no_lesson__') editSession(s.id, null, true);
                                      else editSession(s.id, val ? parseInt(val) : null, false);
                                    }}
                                    className="w-full text-[10px] rounded border-0 bg-transparent py-0.5 focus:ring-1 focus:ring-[#1e3a5f]/30 truncate">
                                    <option value="">—</option>
                                    {lessons.map(l => <option key={l.id} value={l.id}>{l.lesson_name}</option>)}
                                    {isPast && <option value="__no_lesson__">No Lesson Taught</option>}
                                  </select>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
                      <button onClick={() => { if (confirm(`Revert "${b.backup_label}"? This will undo ${b.session_count} changes.`)) revertMutation.mutate(b.id); }}
                        disabled={revertMutation.isPending}
                        className="text-xs text-amber-600 hover:text-amber-800 font-medium">Revert</button>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}
        </div>

        {/* Bulk Set Panel */}
        {showBulkSet && (
          <BulkSetPanel
            programIds={[...checked]}
            classId={classId}
            lessons={lessons}
            onClose={() => setShowBulkSet(false)}
            onSuccess={() => {
              qc.invalidateQueries(['curriculum-bulk-sessions']);
              qc.invalidateQueries(['curriculum-programs']);
              qc.invalidateQueries(['curriculum-backups']);
              setShowBulkSet(false);
              setChecked(new Set());
            }}
          />
        )}
      </div>

      {saveMutation.isSuccess && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg text-sm shadow-lg">Saved!</div>}
    </AppShell>
  );
}

function BulkSetPanel({ programIds, classId, lessons, onClose, onSuccess }) {
  const [startWeek, setStartWeek] = useState(1);
  const [sequence, setSequence] = useState(() => lessons.map(l => l.id));

  const bulkMutation = useMutation({
    mutationFn: () => api.post('/curriculum/bulk-set', {
      program_ids: programIds,
      lesson_sequence: sequence.filter(Boolean),
      start_at_week: startWeek,
    }),
    onSuccess,
  });

  const moveLesson = (from, to) => {
    const next = [...sequence];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSequence(next);
  };

  const updateSlot = (idx, lessonId) => {
    const next = [...sequence];
    next[idx] = lessonId ? parseInt(lessonId) : null;
    setSequence(next);
  };

  const addSlot = () => setSequence([...sequence, null]);

  return (
    <div className="w-80 shrink-0 sticky top-4 self-start">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex justify-between items-center">
          <div className="text-sm font-semibold text-gray-900">Bulk Set Lessons</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-xs text-gray-500">{programIds.length} program{programIds.length !== 1 ? 's' : ''} selected</div>

          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Start at week</label>
            <input type="number" min={1} value={startWeek} onChange={e => setStartWeek(parseInt(e.target.value) || 1)}
              className="w-20 rounded border border-gray-300 px-2 py-1 text-xs" />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Lesson Sequence</label>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {sequence.map((lessonId, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <span className="text-[9px] text-gray-300 w-4">{idx + 1}</span>
                  <select value={lessonId || ''} onChange={e => updateSlot(idx, e.target.value)}
                    className="flex-1 text-[10px] rounded border border-gray-200 px-1.5 py-1">
                    <option value="">— skip —</option>
                    {lessons.map(l => <option key={l.id} value={l.id}>{l.lesson_name}</option>)}
                  </select>
                  <button onClick={() => { const n = [...sequence]; n.splice(idx, 1); setSequence(n); }}
                    className="text-gray-300 hover:text-red-400 text-xs">×</button>
                </div>
              ))}
            </div>
            <button onClick={addSlot} className="text-[10px] text-[#1e3a5f] hover:underline mt-1">+ Add slot</button>
          </div>

          <Button onClick={() => bulkMutation.mutate()} disabled={bulkMutation.isPending || sequence.filter(Boolean).length === 0} className="w-full">
            {bulkMutation.isPending ? 'Applying...' : 'Apply to Selected Programs'}
          </Button>
          {bulkMutation.isError && <p className="text-xs text-red-600">{bulkMutation.error?.response?.data?.error || 'Failed'}</p>}
        </div>
      </div>
    </div>
  );
}
