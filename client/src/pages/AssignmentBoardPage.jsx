import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { useGeneralData } from '../hooks/useReferenceData';
import { formatTime } from '../lib/utils';
import api from '../api/client';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const TYPE_STYLE = {
  science: 'border-l-4 border-l-violet-500 bg-violet-50',
  engineering: 'border-l-4 border-l-emerald-500 bg-emerald-50',
  robotics: 'border-l-4 border-l-blue-500 bg-blue-50',
  'financial literacy': 'border-l-4 border-l-amber-500 bg-amber-50',
  party: 'border-l-4 border-l-pink-400 bg-pink-50',
  camp: 'border-l-4 border-l-orange-400 bg-orange-50',
  mix: 'border-l-4 border-l-orange-400 bg-orange-50',
};

const STATUS_PILL = {
  Active: 'bg-green-100 text-green-800',
  Training: 'bg-blue-100 text-blue-800',
  Substitute: 'bg-amber-100 text-amber-800',
  Inactive: 'bg-red-100 text-red-800',
};

function formatTimeRange(startTime, lengthMin) {
  if (!startTime) return '';
  const st = formatTime(startTime);
  if (!lengthMin) return st;
  const [h, m] = startTime.split(':').map(Number);
  const endMins = h * 60 + m + lengthMin;
  const eh = Math.floor(endMins / 60) % 24;
  const em = endMins % 60;
  const ampm = eh >= 12 ? 'PM' : 'AM';
  const h12 = eh % 12 || 12;
  return `${st} – ${h12}:${String(em).padStart(2, '0')} ${ampm}`;
}

function ConflictBadge() {
  const { data } = useQuery({
    queryKey: ['schedule-conflicts'],
    queryFn: () => api.get('/schedule-conflicts').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const count = data?.total || 0;
  if (count === 0) return null;
  return (
    <Link to="/schedule-conflicts"
      className="flex items-center gap-1.5 bg-red-50 border-b border-red-200 px-6 py-1.5 hover:bg-red-100 transition-colors">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">{count}</span>
      <span className="text-xs text-red-700 font-medium">scheduling conflict{count !== 1 ? 's' : ''} need resolution</span>
      <span className="text-xs text-red-500 ml-1">&rarr;</span>
    </Link>
  );
}

function ObsNeededBadge() {
  const { data } = useQuery({
    queryKey: ['observation-requirements'],
    queryFn: () => api.get('/professors/observation-requirements').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const count = data?.data?.length || 0;
  if (count === 0) return null;
  return (
    <Link to="/observation-scheduler"
      className="flex items-center gap-1.5 bg-amber-50 border-b border-amber-200 px-6 py-1.5 hover:bg-amber-100 transition-colors">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">{count}</span>
      <span className="text-xs text-amber-700 font-medium">new hire{count !== 1 ? 's' : ''} need{count === 1 ? 's' : ''} observations scheduled</span>
      <span className="text-xs text-amber-500 ml-1">&rarr;</span>
    </Link>
  );
}

export default function AssignmentBoardPage() {
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 90);
    return d.toISOString().split('T')[0];
  });
  const [loaded, setLoaded] = useState(false);
  const [assignments, setAssignments] = useState({}); // programId -> professorId
  const [originals, setOriginals] = useState({});
  const [dragItem, setDragItem] = useState(null);
  const scrollRef = useRef(null);
  const qc = useQueryClient();

  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  const { data: boardData, isLoading, refetch } = useQuery({
    queryKey: ['assignment-board', selectedAreas, startDate, endDate],
    queryFn: () => api.get('/assignment-board/data', {
      params: { areas: selectedAreas.join(','), start_date: startDate, end_date: endDate }
    }).then(r => r.data),
    enabled: loaded && selectedAreas.length > 0,
  });

  const programs = boardData?.data?.programs || [];
  const professors = boardData?.data?.professors || [];

  // All professors globally (for out-of-area assignment)
  const { data: allProfsData } = useQuery({
    queryKey: ['all-professors-global'],
    queryFn: () => api.get('/professors/list').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const allProfsGlobal = useMemo(() => {
    const validStatuses = new Set(['Active', 'Substitute', 'Training']);
    return (allProfsData?.data || [])
      .filter(p => validStatuses.has(p.professor_status_name))
      .map(p => ({ id: p.id, name: p.display_name || p.professor_nickname, status: p.professor_status_name }));
  }, [allProfsData]);

  // Initialize assignments from loaded data — reset on every fresh load
  useEffect(() => {
    if (programs.length) {
      const orig = {};
      programs.forEach(p => { orig[p.id] = p.professorId || null; });
      setOriginals(orig);
      setAssignments(orig);
    }
  }, [programs]);

  const saveMutation = useMutation({
    mutationFn: ({ changes, force }) => api.post('/assignment-board/assign', { changes, force }),
    onSuccess: () => {
      setOriginals({ ...assignments });
      setSaveError(null);
      refetch();
    },
    onError: (err) => {
      if (err.response?.status === 409) {
        const conflicts = err.response.data.conflicts || [];
        const msgs = conflicts.map(c =>
          `${c.conflicts.map(x => `${x.conflicting_program} (${x.days?.join(', ')})`).join(', ')}`
        );
        setSaveError({ message: 'Schedule conflicts detected:\n' + msgs.join('\n'), conflicts });
      } else {
        setSaveError({ message: err.response?.data?.error || 'Save failed' });
      }
    },
  });

  const changes = useMemo(() => {
    const c = [];
    for (const [pid, newProf] of Object.entries(assignments)) {
      if (newProf !== originals[pid]) {
        c.push({ programId: parseInt(pid), newProfessorId: newProf });
      }
    }
    return c;
  }, [assignments, originals]);

  const handleLoad = () => {
    setOriginals({});
    setAssignments({});
    setLoaded(true);
  };

  // Auto-scheduler
  const [showAutoSchedule, setShowAutoSchedule] = useState(false);
  const autoScheduleMut = useMutation({
    mutationFn: () => api.post('/assignment-board/auto-schedule', {
      areas: selectedAreas, start_date: startDate, end_date: endDate, only_unassigned: true,
    }).then(r => r.data),
  });

  const applyAutoSuggestions = (suggestions) => {
    const newAssignments = { ...assignments };
    suggestions.forEach(s => { newAssignments[s.program_id] = s.suggested_professor_id; });
    setAssignments(newAssignments);
    setShowAutoSchedule(false);
  };

  // Warning computation
  const [showWarnings, setShowWarnings] = useState(true);
  const profMap = useMemo(() => {
    const m = {};
    professors.forEach(p => { m[p.id] = p; });
    // Also include global profs for out-of-area assignments (less data but enough for warnings)
    allProfsGlobal.forEach(p => { if (!m[p.id]) m[p.id] = p; });
    return m;
  }, [professors, allProfsGlobal]);

  const progMap = useMemo(() => {
    const m = {};
    programs.forEach(p => { if (!m[p.id]) m[p.id] = p; }); // first entry per program (dedup multi-day)
    return m;
  }, [programs]);

  const warnings = useMemo(() => {
    const w = [];
    for (const [progId, profId] of Object.entries(assignments)) {
      if (!profId) continue;
      const prof = profMap[profId] || profMap[parseInt(profId)] || profMap[String(profId)];
      const prog = progMap[parseInt(progId)];
      if (!prof || !prog) continue;

      const type = prog.programType;
      // Training check
      if (type === 'science' && !prof.scienceTrained) w.push({ progId: parseInt(progId), profId, nickname: prog.nickname, profName: prof.name, type: 'training', msg: `${prof.name} is not Science trained` });
      if (type === 'engineering' && !prof.engineeringTrained) w.push({ progId: parseInt(progId), profId, nickname: prog.nickname, profName: prof.name, type: 'training', msg: `${prof.name} is not Engineering trained` });
      if (type === 'robotics' && !prof.roboticsTrained) w.push({ progId: parseInt(progId), profId, nickname: prog.nickname, profName: prof.name, type: 'training', msg: `${prof.name} is not Robotics trained` });
      if (type === 'financial literacy' && !prof.finlitTrained) w.push({ progId: parseInt(progId), profId, nickname: prog.nickname, profName: prof.name, type: 'training', msg: `${prof.name} is not Financial Literacy trained` });

      // Livescan check
      if (prog.livescanRequired) {
        const hasLs = prof.livescanLocations?.includes(prog.locationId) || prof.livescanContractors?.includes(prog.contractorId);
        if (!hasLs) w.push({ progId: parseInt(progId), profId, nickname: prog.nickname, profName: prof.name, type: 'livescan', msg: `${prof.name} needs livescan at ${prog.locationNickname}` });
      }

      // Virtus check
      if (prog.virtusRequired && !prof.virtus) w.push({ progId: parseInt(progId), profId, nickname: prog.nickname, profName: prof.name, type: 'virtus', msg: `${prof.name} needs Virtus for ${prog.locationNickname}` });
    }
    return w;
  }, [assignments, profMap, progMap]);

  const warningProgIds = useMemo(() => new Set(warnings.map(w => w.progId)), [warnings]);

  const getProfessorName = useCallback((profId) => {
    if (!profId) return null;
    const p = professors.find(pr => pr.id === profId);
    return p?.name || null;
  }, [professors]);

  // Group programs by displayDay and professorId
  const getCell = useCallback((profId, day) => {
    return programs.filter(p => {
      const assigned = p.id in assignments ? assignments[p.id] : p.professorId;
      return assigned === profId && p.displayDay === day;
    });
  }, [programs, assignments]);

  const [saveError, setSaveError] = useState(null);

  const handleDrop = (profId, day) => {
    if (!dragItem) return;
    const prog = programs.find(p => p.id === dragItem);
    if (!prog || prog.displayDay !== day) return;
    setAssignments(prev => ({ ...prev, [dragItem]: profId }));
    setDragItem(null);
  };

  const handleClickAssign = (programId, newProfId) => {
    setAssignments(prev => ({ ...prev, [programId]: newProfId }));
  };

  // Sort professors: with assignments first, then by status
  const statusRank = { Active: 1, Training: 2, Substitute: 3, Inactive: 4 };
  const sortedProfs = useMemo(() => {
    const withClasses = new Set();
    programs.forEach(p => {
      const assigned = p.id in assignments ? assignments[p.id] : p.professorId;
      if (assigned) withClasses.add(assigned);
    });
    return [...professors].sort((a, b) => {
      const aHas = withClasses.has(a.id) ? 0 : 1;
      const bHas = withClasses.has(b.id) ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return (statusRank[a.status] || 9) - (statusRank[b.status] || 9) || a.name.localeCompare(b.name);
    });
  }, [professors, programs, assignments]);

  return (
    <AppShell>
      <ConflictBadge />
      <ObsNeededBadge />
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Professor Assignment Board</h1>
        <div className="flex items-end gap-3 mt-3">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Start</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">End</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
          </div>
          <Button onClick={handleLoad} disabled={!selectedAreas.length}>Load Board</Button>
          {loaded && programs.length > 0 && (
            <Button onClick={() => { autoScheduleMut.mutate(); setShowAutoSchedule(true); }}
              disabled={autoScheduleMut.isPending} variant="secondary">
              {autoScheduleMut.isPending ? 'Calculating...' : 'Auto-Scheduler'}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-xs text-gray-500 py-1 mr-1">Areas:</span>
          {selectedAreas.length > 0 && (
            <button onClick={() => setSelectedAreas([])} className="text-[10px] text-gray-400 hover:text-gray-600 underline py-1 mr-1">Clear</button>
          )}
          {areas.map(a => (
            <button key={a.id} onClick={() => setSelectedAreas(prev =>
              prev.includes(a.geographic_area_name) ? prev.filter(x => x !== a.geographic_area_name) : [...prev, a.geographic_area_name]
            )} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              selectedAreas.includes(a.geographic_area_name)
                ? 'bg-[#1e3a5f] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>{a.geographic_area_name}</button>
          ))}
        </div>
        {loaded && (
          <div className="flex items-center gap-3 mt-2 text-[9px] text-gray-400">
            <span>Legend:</span>
            <span className="px-1 rounded bg-violet-50 text-violet-600">Science</span>
            <span className="px-1 rounded bg-emerald-50 text-emerald-600">Engineering</span>
            <span className="px-1 rounded bg-blue-50 text-blue-600">Robotics</span>
            <span className="px-1 rounded bg-amber-50 text-amber-600">FinLit</span>
            <span className="px-1 rounded bg-purple-200 text-purple-700 font-bold">M</span><span>Multi-day</span>
            <span className="px-1 rounded bg-blue-200 text-blue-700 font-bold">R</span><span>Retained</span>
            <span className="px-1 rounded bg-red-200 text-red-700 font-bold">LS</span><span>Livescan req.</span>
            <span className="px-1 rounded bg-purple-200 text-purple-700 font-bold">V</span><span>Virtus req.</span>
            <span className="px-1 rounded bg-yellow-300 text-yellow-800 font-bold">!</span><span>Compliance issue</span>
          </div>
        )}
      </div>

      {/* Auto-Scheduler results */}
      {showAutoSchedule && autoScheduleMut.data && (
        <AutoSchedulePanel
          data={autoScheduleMut.data.data}
          onApply={applyAutoSuggestions}
          onClose={() => setShowAutoSchedule(false)}
        />
      )}

      {/* Compliance warnings */}
      {warnings.length > 0 && (
        <div className={`border-b ${showWarnings ? 'bg-yellow-50 border-yellow-200' : 'bg-yellow-50/50 border-yellow-100'}`}>
          <button onClick={() => setShowWarnings(v => !v)}
            className="w-full px-6 py-1.5 flex items-center gap-2 text-left">
            <span className="text-yellow-600 text-sm">⚠</span>
            <span className="text-xs font-medium text-yellow-800">{warnings.length} compliance warning{warnings.length !== 1 ? 's' : ''}</span>
            <span className="text-[10px] text-yellow-600 ml-auto">{showWarnings ? 'hide' : 'show'}</span>
          </button>
          {showWarnings && (
            <div className="px-6 pb-2 flex flex-wrap gap-1">
              {warnings.map((w, i) => (
                <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                  w.type === 'livescan' ? 'bg-red-100 text-red-700' :
                  w.type === 'virtus' ? 'bg-purple-100 text-purple-700' :
                  'bg-amber-100 text-amber-700'
                }`}>{w.nickname}: {w.msg}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unsaved banner */}
      {changes.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-3">
          <span className="text-sm text-amber-800 font-medium flex-1">{changes.length} unsaved change{changes.length !== 1 ? 's' : ''}</span>
          <Button onClick={() => saveMutation.mutate({ changes, force: false })} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Push Changes'}
          </Button>
        </div>
      )}
      {saveError && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2">
          <div className="text-sm text-red-700 font-medium mb-1">Conflicts detected</div>
          <div className="text-xs text-red-600 whitespace-pre-line mb-2">{saveError.message}</div>
          <div className="flex gap-2">
            <button onClick={() => saveMutation.mutate({ changes, force: true })}
              className="px-3 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700">Save Anyway (override conflicts)</button>
            <button onClick={() => setSaveError(null)} className="text-xs text-gray-500">Dismiss</button>
          </div>
        </div>
      )}
      {saveMutation.isSuccess && changes.length === 0 && !saveError && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-2 text-sm text-green-700 font-medium">Changes saved successfully</div>
      )}

      {/* Pending Hires */}
      {loaded && <PendingHiresPanel />}

      {!loaded ? (
        <div className="p-6 text-center text-gray-400 py-20">Select areas and date range, then click Load Board</div>
      ) : isLoading ? (
        <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
      ) : (
        <div ref={scrollRef} className="overflow-auto relative" style={{ maxHeight: 'calc(100vh - 220px)' }}
          onDragOver={e => {
            e.preventDefault();
            const el = scrollRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const ZONE = 60;
            if (y < ZONE) { el.scrollTop -= 8; }
            else if (y > rect.height - ZONE) { el.scrollTop += 8; }
            // Horizontal
            const x = e.clientX - rect.left;
            if (x < ZONE) { el.scrollLeft -= 8; }
            else if (x > rect.width - ZONE) { el.scrollLeft += 8; }
          }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px repeat(5, minmax(150px, 1fr))' }}>
            {/* Header row */}
            <div className="bg-gray-100 border-b border-r border-gray-300 px-2 py-1.5 font-semibold text-xs text-gray-700 sticky top-0 z-10"></div>
            {WEEKDAYS.map(day => (
              <div key={day} className="bg-gray-100 border-b border-r border-gray-300 px-1 py-1.5 font-semibold text-xs text-gray-700 text-center sticky top-0 z-10">{day.slice(0, 3)}</div>
            ))}

            {/* Unassigned row */}
            <div className="bg-white border-b border-r border-gray-200 px-2 py-1 font-semibold text-xs sticky left-0 z-[5] bg-white">Unassigned</div>
            {WEEKDAYS.map(day => (
              <DroppableCell key={`unassigned-${day}`} day={day} profId={null}
                programs={getCell(null, day)} assignments={assignments} originals={originals}
                onDrop={handleDrop} onDragStart={setDragItem} getProfessorName={getProfessorName}
                allProfessors={professors} allProfsGlobal={allProfsGlobal} onClickAssign={handleClickAssign} warningProgIds={warningProgIds} />
            ))}

            {/* Professor rows */}
            {sortedProfs.map(prof => (
              <>
                <ProfessorLabel key={`label-${prof.id}`} prof={prof} />
                {WEEKDAYS.map(day => (
                  <DroppableCell key={`${prof.id}-${day}`} day={day} profId={prof.id}
                    programs={getCell(prof.id, day)} assignments={assignments} originals={originals}
                    unavailable={!prof.availability[day]} profStatus={prof.status}
                    onDrop={handleDrop} onDragStart={setDragItem} getProfessorName={getProfessorName}
                    allProfessors={professors} allProfsGlobal={allProfsGlobal} onClickAssign={handleClickAssign} warningProgIds={warningProgIds} />
                ))}
              </>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function PendingHiresPanel() {
  const { data } = useQuery({
    queryKey: ['pending-schedules'],
    queryFn: () => api.get('/onboarding/pending-schedules').then(r => r.data),
    staleTime: 60 * 1000,
  });
  const candidates = data?.data || [];
  if (candidates.length === 0) return null;

  return (
    <div className="bg-violet-50 border-b border-violet-200 px-6 py-3">
      <div className="text-xs font-semibold text-violet-700 uppercase tracking-wider mb-2">
        Pending Hires ({candidates.length})
        <span className="font-normal normal-case ml-2 text-violet-500">Tentative schedules — not counted as staffed until hired + confirmed</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {candidates.map(c => (
          <Link key={c.id} to={`/candidates/${c.id}`}
            className="inline-flex items-center gap-2 bg-white border border-violet-200 rounded-lg px-3 py-1.5 hover:border-violet-400 transition-colors">
            <span className="text-sm font-medium text-gray-900">{c.full_name}</span>
            <span className="text-[10px] text-gray-500">{c.geographic_area_name || '—'}</span>
            {c.schedule_count > 0 ? (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                c.schedule_confirmed_at && !c.schedule_changed_since_confirm ? 'bg-green-100 text-green-700' :
                c.schedule_ready ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>{c.schedule_count} class{c.schedule_count !== 1 ? 'es' : ''}{c.schedule_confirmed_at && !c.schedule_changed_since_confirm ? ' ✓' : ''}</span>
            ) : (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">No schedule</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function ProfessorLabel({ prof }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white border-b border-r border-gray-200 px-2 py-1 sticky left-0 z-[5] bg-white">
      <div className="flex items-center gap-1 flex-wrap cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <span className="text-[11px] font-medium leading-tight">{prof.name}</span>
        <span className={`px-1 py-0 text-[8px] font-medium rounded ${STATUS_PILL[prof.status] || 'bg-gray-100 text-gray-600'}`}
          title={prof.status}>{prof.status.charAt(0)}</span>
      </div>
      <div className="flex gap-0.5 mt-0.5">
        {WEEKDAYS.map(d => (
          <span key={d} className={`text-[8px] w-3 text-center rounded ${prof.availability[d] ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-300'}`}>
            {d.charAt(0)}
          </span>
        ))}
        {prof.homeTerritory && <span className="text-[8px] text-gray-400 ml-1 truncate">{prof.homeTerritory}</span>}
      </div>
      {expanded && (
        <div className="mt-1 pt-1 border-t border-gray-100 text-[9px] space-y-0.5">
          <div className="flex flex-wrap gap-1">
            <span className="text-gray-400">Training:</span>
            {prof.scienceTrained && <span className="px-1 rounded bg-violet-100 text-violet-700">Science</span>}
            {prof.engineeringTrained && <span className="px-1 rounded bg-emerald-100 text-emerald-700">Engineering</span>}
            {prof.roboticsTrained && <span className="px-1 rounded bg-blue-100 text-blue-700">Robotics</span>}
            {prof.finlitTrained && <span className="px-1 rounded bg-amber-100 text-amber-700">FinLit</span>}
            {!prof.scienceTrained && !prof.engineeringTrained && !prof.roboticsTrained && !prof.finlitTrained && <span className="text-gray-300">None</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="text-gray-400">Compliance:</span>
            {prof.virtus ? <span className="px-1 rounded bg-green-100 text-green-700">Virtus</span> : <span className="px-1 rounded bg-red-50 text-red-400">No Virtus</span>}
            {prof.tbTest ? <span className="px-1 rounded bg-green-100 text-green-700">TB</span> : <span className="px-1 rounded bg-red-50 text-red-400">No TB</span>}
          </div>
          {(prof.livescanLocationNames?.length > 0 || prof.livescanContractorNames?.length > 0) && (
            <div className="flex flex-wrap gap-0.5">
              <span className="text-gray-400 shrink-0">Livescans:</span>
              {[...new Set(prof.livescanLocationNames || [])].map((name, i) => (
                <span key={`l${i}`} className="px-1 rounded bg-green-50 text-green-700 text-[9px]">{name}</span>
              ))}
              {[...new Set(prof.livescanContractorNames || [])].map((name, i) => (
                <span key={`c${i}`} className="px-1 rounded bg-blue-50 text-blue-700 text-[9px]">{name}</span>
              ))}
            </div>
          )}
          {prof.livescanLocations?.length === 0 && prof.livescanContractors?.length === 0 && (
            <div className="flex flex-wrap gap-0.5">
              <span className="text-gray-400">Livescans:</span>
              <span className="text-red-400">None</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AutoSchedulePanel({ data, onApply, onClose }) {
  const [selected, setSelected] = useState(() => new Set(data.suggestions.map(s => s.program_id)));

  const toggleSelect = (id) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const selectedSuggestions = data.suggestions.filter(s => selected.has(s.program_id));
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="bg-blue-50 border-b border-blue-200">
      <div className="px-6 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#1e3a5f]">Auto-Scheduler Results</h2>
          <div className="flex gap-3 text-xs mt-0.5">
            <span className="text-gray-600">{data.stats.total} programs analyzed</span>
            <span className="text-green-700 font-medium">{data.stats.suggested} matched</span>
            {data.stats.unassignable > 0 && <span className="text-red-600">{data.stats.unassignable} unassignable</span>}
            <span className="text-gray-400">avg score: {data.stats.avg_score}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onApply(selectedSuggestions)} size="sm">
            Apply {selected.size} Suggestion{selected.size !== 1 ? 's' : ''}
          </Button>
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
        </div>
      </div>

      {data.suggestions.length > 0 && (
        <div className="px-6 pb-3 max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-blue-100/50 sticky top-0">
              <tr>
                <th className="w-8 px-1 py-1"><input type="checkbox" checked={selected.size === data.suggestions.length}
                  onChange={() => selected.size === data.suggestions.length ? setSelected(new Set()) : setSelected(new Set(data.suggestions.map(s => s.program_id)))}
                  className="w-3 h-3" /></th>
                <th className="text-left px-2 py-1 font-medium text-gray-600">Program</th>
                <th className="text-left px-2 py-1 font-medium text-gray-600">Location</th>
                <th className="text-left px-2 py-1 font-medium text-gray-600">Suggested Professor</th>
                <th className="text-center px-2 py-1 font-medium text-gray-600">Score</th>
                <th className="text-left px-2 py-1 font-medium text-gray-600">Key Reasons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-100">
              {data.suggestions.map(s => (
                <React.Fragment key={s.program_id}>
                  <tr className={`cursor-pointer hover:bg-blue-100/30 ${selected.has(s.program_id) ? '' : 'opacity-40'}`}
                    onClick={() => setExpandedId(expandedId === s.program_id ? null : s.program_id)}>
                    <td className="px-1 py-1.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(s.program_id)}
                        onChange={() => toggleSelect(s.program_id)} className="w-3 h-3" />
                    </td>
                    <td className="px-2 py-1.5 font-medium text-gray-800">{s.program_nickname}</td>
                    <td className="px-2 py-1.5 text-gray-500">{s.location_nickname}</td>
                    <td className="px-2 py-1.5 text-[#1e3a5f] font-medium">{s.suggested_professor_name}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                        s.score >= 100 ? 'bg-green-100 text-green-700' : s.score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                      }`}>{s.score}</span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-500">{s.reasons.slice(0, 3).join(', ')}</td>
                  </tr>
                  {expandedId === s.program_id && (
                    <tr><td colSpan={6} className="px-4 py-2 bg-white/50">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(s.score_breakdown).map(([k, v]) => (
                          <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded ${v > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {k}: {v > 0 ? '+' : ''}{v}
                          </span>
                        ))}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.unassignable.length > 0 && (
        <div className="px-6 pb-3">
          <div className="text-[10px] font-bold text-red-600 mb-1">Unassignable ({data.unassignable.length})</div>
          <div className="flex flex-wrap gap-1">
            {data.unassignable.map(u => (
              <span key={u.program_id} className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-600" title={u.reason}>
                {u.program_nickname}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DroppableCell({ day, profId, programs, assignments, originals, unavailable, profStatus, onDrop, onDragStart, getProfessorName, allProfessors, onClickAssign, allProfsGlobal, warningProgIds }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [searchQ, setSearchQ] = useState('');

  return (
    <div ref={ref}
      className={`border-b border-r border-gray-200 min-h-[32px] p-0.5 transition-colors ${over ? 'bg-blue-50' : unavailable ? 'bg-red-50/20' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(profId, day); }}
    >
      {programs.map(p => {
        const currentAssigned = p.id in assignments ? assignments[p.id] : p.professorId;
        const originalAssigned = p.id in originals ? originals[p.id] : p.professorId;
        const isChanged = currentAssigned !== originalAssigned;
        const prevName = isChanged ? (getProfessorName(originalAssigned) || 'Unassigned') : null;
        const hasWarning = warningProgIds?.has(p.id);
        const typeClass = hasWarning ? 'bg-yellow-300 border-l-4 border-l-yellow-600' : (TYPE_STYLE[p.programType] || '');
        const isAssigning = assigningId === p.id;

        const isExpanded = expandedId === p.id;
        const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

        return (
          <div key={`${p.id}-${p.displayDay}`} className="relative">
            <div draggable onDragStart={() => onDragStart(p.id)}
              onClick={e => { if (!e.defaultPrevented) setExpandedId(isExpanded ? null : p.id); }}
              className={`rounded px-1 py-0.5 mb-0.5 cursor-grab border ${typeClass || 'bg-white'} ${
                isChanged ? 'border-amber-400 ring-1 ring-amber-300' : 'border-gray-200'
              } ${unavailable && profStatus !== 'Inactive' ? 'ring-1 ring-red-300' : ''}`}
            >
              <div className="flex items-center gap-0.5">
                <div className="text-[10px] font-medium text-gray-900 truncate leading-tight flex-1">{p.nickname}</div>
                {p.isMultiDay && <span className="text-[7px] px-0.5 rounded bg-purple-200 text-purple-700 font-bold shrink-0" title="Multi-day program">M</span>}
                {p.retained && <span className="text-[7px] px-0.5 rounded bg-blue-200 text-blue-700 font-bold shrink-0" title="Retained client">R</span>}
                {p.livescanRequired && <span className="text-[7px] px-0.5 rounded bg-red-200 text-red-700 font-bold shrink-0" title="Livescan required">LS</span>}
                {p.virtusRequired && <span className="text-[7px] px-0.5 rounded bg-purple-200 text-purple-700 font-bold shrink-0" title="Virtus required">V</span>}
                <button onClick={e => { e.preventDefault(); e.stopPropagation(); setAssigningId(isAssigning ? null : p.id); setSearchQ(''); }}
                  className="text-[8px] text-gray-400 hover:text-[#1e3a5f] shrink-0 leading-none" title="Reassign">
                  {isAssigning ? '×' : '✎'}
                </button>
              </div>
              <div className="text-[9px] text-gray-400 truncate leading-tight">
                {p.startTime ? formatTimeRange(p.startTime, p.classLength) : ''}
                {p.firstDate && <span className="ml-1">{fmtDate(p.firstDate)}–{fmtDate(p.lastDate)}</span>}
              </div>
              {unavailable && <div className="text-[9px] text-red-500 font-bold">Unavail</div>}
              {prevName && <div className="text-[9px] text-amber-600 italic truncate">was: {prevName}</div>}
            </div>
            {/* Mini detail view on click */}
            {isExpanded && (
              <div className="bg-white border border-gray-300 rounded shadow-lg p-2 mb-1 text-[9px] z-20 relative">
                <div className="font-medium text-gray-900 text-[10px] mb-1">{p.nickname}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
                  <span className="text-gray-400">Class:</span><span>{p.className || '—'}</span>
                  <span className="text-gray-400">Location:</span><span>{p.locationNickname || '—'}</span>
                  <span className="text-gray-400">Days:</span><span>{p.days?.join(', ') || '—'}</span>
                  <span className="text-gray-400">Time:</span><span>{p.startTime ? formatTimeRange(p.startTime, p.classLength) : '—'}</span>
                  <span className="text-gray-400">Dates:</span><span>{fmtDate(p.firstDate)} – {fmtDate(p.lastDate)}</span>
                  <span className="text-gray-400">Pay:</span><span>{p.pay ? `$${parseFloat(p.pay).toFixed(0)}` : '—'}</span>
                  <span className="text-gray-400">Status:</span><span>{p.status}</span>
                  {p.retained && <><span className="text-gray-400">Retained:</span><span className="text-blue-600 font-medium">Yes</span></>}
                  <span className="text-gray-400">Requires:</span>
                  <span className="flex gap-1">
                    {p.livescanRequired && <span className="px-1 rounded bg-red-100 text-red-700">Livescan</span>}
                    {p.virtusRequired && <span className="px-1 rounded bg-purple-100 text-purple-700">Virtus</span>}
                    {p.tbRequired && <span className="px-1 rounded bg-amber-100 text-amber-700">TB</span>}
                    {!p.livescanRequired && !p.virtusRequired && !p.tbRequired && <span className="text-gray-300">None</span>}
                  </span>
                </div>
              </div>
            )}
            {isAssigning && (
              <div className="absolute z-30 left-0 right-0 bg-white border border-gray-300 rounded shadow-lg" style={{ bottom: '100%', minWidth: '180px' }}>
                <div className="flex items-center border-b border-gray-200">
                  <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus
                    placeholder={searchQ ? 'Search all professors...' : 'Search out of territory...'}
                    className="flex-1 px-1.5 py-1 text-[10px] focus:outline-none" />
                  <button onClick={e => { e.stopPropagation(); setAssigningId(null); }}
                    className="px-1.5 py-1 text-gray-400 hover:text-gray-600 text-xs">&times;</button>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {!searchQ ? (
                    // No search: show in-area professors
                    allProfessors.slice(0, 20).map(pr => (
                      <button key={pr.id} onClick={() => { onClickAssign(p.id, pr.id); setAssigningId(null); }}
                        className="w-full text-left px-1.5 py-1 text-[10px] hover:bg-[#1e3a5f]/10 flex items-center gap-1">
                        <span className="truncate flex-1">{pr.name}</span>
                        <span className={`text-[8px] px-0.5 rounded ${STATUS_PILL[pr.status] || 'text-gray-400'}`}>{pr.status?.charAt(0)}</span>
                      </button>
                    ))
                  ) : (
                    // Searching: search ALL professors globally
                    (allProfsGlobal || allProfessors)
                      .filter(pr => pr.name.toLowerCase().includes(searchQ.toLowerCase()))
                      .slice(0, 20)
                      .map(pr => {
                        const isLocal = allProfessors.some(lp => lp.id === pr.id);
                        return (
                          <button key={pr.id} onClick={() => { onClickAssign(p.id, pr.id); setAssigningId(null); }}
                            className="w-full text-left px-1.5 py-1 text-[10px] hover:bg-[#1e3a5f]/10 flex items-center gap-1">
                            <span className="truncate flex-1">{pr.name}</span>
                            {!isLocal && <span className="text-[7px] px-0.5 rounded bg-blue-50 text-blue-500">OOA</span>}
                            <span className={`text-[8px] px-0.5 rounded ${STATUS_PILL[pr.status] || 'text-gray-400'}`}>{pr.status?.charAt(0)}</span>
                          </button>
                        );
                      })
                  )}
                  <button onClick={() => { onClickAssign(p.id, null); setAssigningId(null); }}
                    className="w-full text-left px-1.5 py-1 text-[10px] text-red-500 hover:bg-red-50 border-t border-gray-100">Unassign</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
