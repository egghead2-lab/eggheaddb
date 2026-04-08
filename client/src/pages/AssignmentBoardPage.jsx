import { useState, useMemo, useCallback, useRef } from 'react';
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

const TYPE_BORDER = {
  science: 'border-l-4 border-l-purple-500',
  engineering: 'border-l-4 border-l-green-600',
  robotics: 'border-l-4 border-l-blue-500',
  'financial literacy': 'border-l-4 border-l-yellow-500',
  party: 'border-l-4 border-l-pink-400',
  camp: 'border-l-4 border-l-orange-400',
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

  // Initialize assignments from loaded data
  useMemo(() => {
    if (programs.length && !Object.keys(originals).length) {
      const orig = {};
      programs.forEach(p => { orig[p.id] = p.professorId || null; });
      setOriginals(orig);
      setAssignments(orig);
    }
  }, [programs]);

  const saveMutation = useMutation({
    mutationFn: (changes) => api.post('/assignment-board/assign', { changes }),
    onSuccess: () => {
      setOriginals({ ...assignments });
      refetch();
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
      const assigned = assignments[p.id] ?? p.professorId;
      return assigned === profId && p.displayDay === day;
    });
  }, [programs, assignments]);

  const handleDrop = (profId, day) => {
    if (!dragItem) return;
    const prog = programs.find(p => p.id === dragItem);
    if (!prog || prog.displayDay !== day) return;
    setAssignments(prev => ({ ...prev, [dragItem]: profId }));
    setDragItem(null);
  };

  // Sort professors: with assignments first, then by status
  const statusRank = { Active: 1, Training: 2, Substitute: 3, Inactive: 4 };
  const sortedProfs = useMemo(() => {
    const withClasses = new Set();
    programs.forEach(p => {
      const assigned = assignments[p.id] ?? p.professorId;
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
        <div className="flex gap-3 mt-3 items-end flex-wrap">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Areas</label>
            <select multiple value={selectedAreas} onChange={e => setSelectedAreas([...e.target.selectedOptions].map(o => o.value))}
              className="rounded border border-gray-300 px-2 py-1 text-sm min-w-[200px] h-20">
              {areas.map(a => <option key={a.id} value={a.geographic_area_name}>{a.geographic_area_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <Button onClick={handleLoad} disabled={!selectedAreas.length}>Load Board</Button>
        </div>
      </div>

      {/* Unsaved banner */}
      {changes.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between">
          <span className="text-sm text-amber-800 font-medium">{changes.length} unsaved change{changes.length !== 1 ? 's' : ''}</span>
          <Button onClick={() => saveMutation.mutate(changes)} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Push Changes'}
          </Button>
        </div>
      )}
      {saveMutation.isSuccess && changes.length === 0 && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-2 text-sm text-green-700 font-medium">Changes saved successfully</div>
      )}

      {/* Pending Hires */}
      {loaded && <PendingHiresPanel />}

      {!loaded ? (
        <div className="p-6 text-center text-gray-400 py-20">Select areas and date range, then click Load Board</div>
      ) : isLoading ? (
        <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
      ) : (
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          <div className="min-w-[1600px]" style={{ display: 'grid', gridTemplateColumns: '240px repeat(5, 1fr)' }}>
            {/* Header row */}
            <div className="bg-gray-100 border-b border-r border-gray-300 px-3 py-2 font-semibold text-sm text-gray-700 sticky top-0 z-10"></div>
            {WEEKDAYS.map(day => (
              <div key={day} className="bg-gray-100 border-b border-r border-gray-300 px-3 py-2 font-semibold text-sm text-gray-700 text-center sticky top-0 z-10">{day}</div>
            ))}

            {/* Unassigned row */}
            <div className="bg-white border-b border-r border-gray-200 px-3 py-2 font-semibold text-sm sticky left-0 z-[5] bg-white">Unassigned</div>
            {WEEKDAYS.map(day => (
              <DroppableCell key={`unassigned-${day}`} day={day} profId={null}
                programs={getCell(null, day)} assignments={assignments} originals={originals}
                onDrop={handleDrop} onDragStart={setDragItem} getProfessorName={getProfessorName} />
            ))}

            {/* Professor rows */}
            {sortedProfs.map(prof => (
              <>
                <div key={`label-${prof.id}`} className="bg-white border-b border-r border-gray-200 px-3 py-2 sticky left-0 z-[5] bg-white">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{prof.name}</span>
                    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full ${STATUS_PILL[prof.status] || 'bg-gray-100 text-gray-600'}`}>{prof.status}</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{prof.homeTerritory || ''}</div>
                  <div className="flex gap-1 mt-1">
                    {WEEKDAYS.map(d => (
                      <span key={d} className={`text-[9px] px-1 rounded ${prof.availability[d] ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-300'}`}>
                        {d.charAt(0)}
                      </span>
                    ))}
                  </div>
                </div>
                {WEEKDAYS.map(day => (
                  <DroppableCell key={`${prof.id}-${day}`} day={day} profId={prof.id}
                    programs={getCell(prof.id, day)} assignments={assignments} originals={originals}
                    unavailable={!prof.availability[day]} profStatus={prof.status}
                    onDrop={handleDrop} onDragStart={setDragItem} getProfessorName={getProfessorName} />
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

function DroppableCell({ day, profId, programs, assignments, originals, unavailable, profStatus, onDrop, onDragStart, getProfessorName }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);

  return (
    <div ref={ref}
      className={`border-b border-r border-gray-200 min-h-[100px] p-1 transition-colors ${over ? 'bg-blue-50' : unavailable ? 'bg-red-50/30' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(profId, day); }}
    >
      {programs.map(p => {
        const isChanged = (assignments[p.id] ?? p.professorId) !== originals[p.id];
        const prevName = isChanged ? (getProfessorName(originals[p.id]) || 'Unassigned') : null;
        const typeClass = TYPE_BORDER[p.programType] || '';

        return (
          <div key={p.id}
            draggable
            onDragStart={() => onDragStart(p.id)}
            className={`rounded px-2 py-1.5 mb-1 text-xs cursor-grab border ${typeClass} ${
              isChanged ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'
            } ${unavailable && profStatus !== 'Inactive' ? 'ring-1 ring-red-300' : ''}`}
          >
            <div className="font-medium text-gray-900 truncate">{p.nickname}</div>
            <div className="text-gray-500">{p.className}</div>
            <div className="text-gray-400">{p.startTime ? formatTimeRange(p.startTime, p.classLength) : ''}</div>
            {unavailable && <div className="text-red-500 font-semibold mt-0.5">Unavailable</div>}
            {profStatus === 'Inactive' && <div className="text-red-500 font-semibold mt-0.5">Inactive Prof</div>}
            {prevName && <div className="text-gray-400 italic mt-0.5">Previously: {prevName}</div>}
          </div>
        );
      })}
    </div>
  );
}
