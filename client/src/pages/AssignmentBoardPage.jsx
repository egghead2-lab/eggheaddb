import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
      </div>

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
                allProfessors={professors} allProfsGlobal={allProfsGlobal} onClickAssign={handleClickAssign} />
            ))}

            {/* Professor rows */}
            {sortedProfs.map(prof => (
              <>
                <div key={`label-${prof.id}`} className="bg-white border-b border-r border-gray-200 px-2 py-1 sticky left-0 z-[5] bg-white">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[11px] font-medium leading-tight">{prof.name}</span>
                    <span className={`px-1 py-0 text-[8px] font-medium rounded ${STATUS_PILL[prof.status] || 'bg-gray-100 text-gray-600'}`}>{prof.status.charAt(0)}</span>
                  </div>
                  <div className="flex gap-0.5 mt-0.5">
                    {WEEKDAYS.map(d => (
                      <span key={d} className={`text-[8px] w-3 text-center rounded ${prof.availability[d] ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-300'}`}>
                        {d.charAt(0)}
                      </span>
                    ))}
                    {prof.homeTerritory && <span className="text-[8px] text-gray-400 ml-1 truncate">{prof.homeTerritory}</span>}
                  </div>
                </div>
                {WEEKDAYS.map(day => (
                  <DroppableCell key={`${prof.id}-${day}`} day={day} profId={prof.id}
                    programs={getCell(prof.id, day)} assignments={assignments} originals={originals}
                    unavailable={!prof.availability[day]} profStatus={prof.status}
                    onDrop={handleDrop} onDragStart={setDragItem} getProfessorName={getProfessorName}
                    allProfessors={professors} allProfsGlobal={allProfsGlobal} onClickAssign={handleClickAssign} />
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

function DroppableCell({ day, profId, programs, assignments, originals, unavailable, profStatus, onDrop, onDragStart, getProfessorName, allProfessors, onClickAssign, allProfsGlobal }) {
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
        const typeClass = TYPE_STYLE[p.programType] || '';
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
                {p.isMultiDay && <span className="text-[7px] px-0.5 rounded bg-purple-200 text-purple-700 font-bold shrink-0">M</span>}
                {p.retained && <span className="text-[7px] px-0.5 rounded bg-blue-200 text-blue-700 font-bold shrink-0">R</span>}
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
