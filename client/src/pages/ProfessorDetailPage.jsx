import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, FormProvider } from 'react-hook-form';
import { ViewModeProvider } from '../contexts/ViewModeContext';
import { getProfessor, createProfessor, updateProfessor, createLivescan, updateLivescan, deleteLivescan } from '../api/professors';
import api from '../api/client';
import { useGeneralData, useLocationList } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { AuditHistory } from '../components/AuditHistory';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { SearchSelect } from '../components/ui/SearchSelect';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { useAuth } from '../hooks/useAuth';
import { TRAINING_FIELDS } from '../lib/constants';
import { RatingBadge } from '../components/ui/DevelopmentalRating';
import { formatDate, formatTime, toFormData } from '../lib/utils';

function LivescanForm({ form, setForm, contractors, locations, onSave, onCancel, isPending }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const contractorOptions = contractors.map(c => ({ id: String(c.id), label: c.contractor_name }));
  const locationOptions = locations.map(l => ({ id: String(l.id), label: l.nickname }));

  return (
    <div className="border border-gray-200 rounded-md p-3 bg-gray-50 space-y-3">
      {/* Contractor vs Location toggle */}
      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={form.lsType === 'contractor'} onChange={() => set('lsType', 'contractor')} className="accent-[#1e3a5f]" />
          Contractor
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={form.lsType === 'location'} onChange={() => set('lsType', 'location')} className="accent-[#1e3a5f]" />
          Specific Location
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {form.lsType === 'contractor' ? (
          <SearchSelect
            label="Contractor" required
            options={contractorOptions} displayKey="label" valueKey="id"
            value={form.contractorId} onChange={v => set('contractorId', v)}
            placeholder="Search contractors…"
          />
        ) : (
          <SearchSelect
            label="Location" required
            options={locationOptions} displayKey="label" valueKey="id"
            value={form.locationId} onChange={v => set('locationId', v)}
            placeholder="Search locations…"
          />
        )}
        <Input label="Date" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        <div className="flex items-end pb-1">
          <Toggle label="Pass" checked={form.pass} onChange={v => set('pass', v)} />
        </div>
        <Input label="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
        <div className="col-span-2">
          <Input label="Livescan Link" value={form.link} onChange={e => set('link', e.target.value)} />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
        <Button type="button" onClick={onSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

const WEEKDAYS = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 7, name: 'Sunday' },
];

function AvailabilitySection({ professorId, availability, availabilityNotes, qc }) {
  // Build state from existing availability data
  const buildState = () => WEEKDAYS.map(w => {
    const existing = availability.find(a => a.weekday_id === w.id);
    return { weekday_id: w.id, name: w.name, available: !!existing, notes: existing?.notes || '' };
  });

  const [days, setDays] = useState(buildState);
  const [generalNotes, setGeneralNotes] = useState(availabilityNotes);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDays(buildState());
    setGeneralNotes(availabilityNotes);
    setDirty(false);
  }, [availability, availabilityNotes]);

  const updateDay = (idx, field, value) => {
    setDays(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/professors/${professorId}/availability`, { days });
      await api.put(`/professors/${professorId}`, { availability_notes: generalNotes });
    },
    onSuccess: () => { qc.invalidateQueries(['professors', professorId]); setDirty(false); },
  });

  return (
    <Section title="Availability" defaultOpen={true}>
      {/* Day checkboxes — single row */}
      <div className="flex items-center gap-4 mb-2">
        {days.map((d, i) => (
          <label key={d.weekday_id} className="flex items-center gap-1 cursor-pointer select-none">
            <input type="checkbox" checked={d.available}
              onChange={e => updateDay(i, 'available', e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer" />
            <span className={`text-xs ${d.available ? 'font-medium text-gray-800' : 'text-gray-400'}`}>{d.name.slice(0, 3)}</span>
          </label>
        ))}
      </div>
      {/* Per-day notes for checked days — compact inline */}
      {days.some(d => d.available) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {days.map((d, i) => d.available ? (
            <div key={d.weekday_id} className="flex items-center gap-1">
              <span className="text-[10px] text-gray-500 w-7 font-medium">{d.name.slice(0, 3)}</span>
              <input type="text" value={d.notes} onChange={e => updateDay(i, 'notes', e.target.value)}
                placeholder="restrictions…"
                className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] w-32 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
          ) : null)}
        </div>
      )}
      {/* General notes + save */}
      <div className="flex items-center gap-2">
        <input type="text" value={generalNotes} onChange={e => { setGeneralNotes(e.target.value); setDirty(true); }}
          placeholder="General availability notes…"
          className="rounded border border-gray-200 px-2 py-0.5 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        {dirty && (
          <>
            <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
              className="text-xs text-white bg-[#1e3a5f] px-2.5 py-0.5 rounded hover:bg-[#152a47] disabled:opacity-50">
              {saveMutation.isPending ? '…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setDays(buildState()); setDirty(false); }}
              className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
          </>
        )}
        {saveMutation.isSuccess && !dirty && <span className="text-[10px] text-green-600">Saved</span>}
      </div>
    </Section>
  );
}

// ── Evaluation History ──────────────────────────────────────────────

// Rating conversion: old pass/needs_improvement/fail → 1-5 scale
function resultToRating(result) {
  if (!result) return null;
  // New scale: text labels map directly
  if (['emerging', 'developing', 'performing', 'excelling', 'distinguished'].includes(result)) return result;
  // Legacy mappings
  if (result === 'pass') return 'excelling';
  if (result === 'needs_improvement') return 'performing';
  if (result === 'fail') return 'emerging';
  return result;
}

const EVAL_TYPE_OPTIONS = [
  { value: 'formal', label: 'Formal' },
  { value: 'peer_to_peer', label: 'Peer to Peer' },
  { value: 'support_session', label: 'Support / Check-in' },
  { value: 'follow_up', label: 'Follow-up' },
];

const FORM_STATUS_BADGE = {
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  deleted: 'bg-gray-100 text-gray-400 line-through',
};

// ── Incident History ──────────────────────────────────────────────
function IncidentSection({ professorId }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [desc, setDesc] = useState('');
  const [incDate, setIncDate] = useState('');

  const { data } = useQuery({
    queryKey: ['professor-incidents', professorId],
    queryFn: () => api.get(`/professors/${professorId}/incidents`).then(r => r.data),
  });
  const incidents = data?.data || [];

  const addMutation = useMutation({
    mutationFn: () => api.post(`/professors/${professorId}/incidents`, { incident_date: incDate || null, description: desc }),
    onSuccess: () => { qc.invalidateQueries(['professor-incidents', professorId]); setAdding(false); setDesc(''); setIncDate(''); },
  });

  const deleteMutation = useMutation({
    mutationFn: (incId) => api.delete(`/professors/${professorId}/incidents/${incId}`),
    onSuccess: () => qc.invalidateQueries(['professor-incidents', professorId]),
  });

  return (
    <Section title={`Incidents (${incidents.length})`} defaultOpen={incidents.length > 0}>
      {incidents.length === 0 && !adding && <p className="text-sm text-gray-400">No incidents logged</p>}
      {incidents.map(inc => (
        <div key={inc.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
          <div className="flex-1">
            <div className="text-sm text-gray-800">{inc.description}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {inc.incident_date ? formatDate(inc.incident_date) : 'No date'}
              {inc.reported_by_name && ` · ${inc.reported_by_name}`}
            </div>
          </div>
          <ConfirmButton onConfirm={() => deleteMutation.mutate(inc.id)} className="text-xs text-gray-300 hover:text-red-500">Remove</ConfirmButton>
        </div>
      ))}
      {adding ? (
        <div className="mt-2 space-y-2">
          <input type="date" value={incDate} onChange={e => setIncDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm w-44" />
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the incident..."
            rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => addMutation.mutate()} disabled={!desc.trim() || addMutation.isPending}>
              {addMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-gray-400">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-2 text-xs text-[#1e3a5f] hover:underline">+ Log Incident</button>
      )}
    </Section>
  );
}

function EvaluationSection({ professorId, hireDate, lastEvalDate, lastEvalResult }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [evalSubType, setEvalSubType] = useState(''); // '' | 'fm' | 'peer_to_peer'
  const [evaluatorId, setEvaluatorId] = useState('');
  const [selectedProgram, setSelectedProgram] = useState(null); // { id, program_nickname, sessions: [...] }
  const [addDate, setAddDate] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [showAllDates, setShowAllDates] = useState(false);

  // FM users (Field Managers for FM evaluations)
  const { data: fmData } = useQuery({
    queryKey: ['fm-users'],
    queryFn: () => api.get('/users?role=Field+Manager&limit=100').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: showAdd && evalSubType === 'fm',
  });
  const fmUsers = fmData?.data || [];

  // Professors (for Peer to Peer)
  const { data: profListData } = useQuery({
    queryKey: ['professor-list'],
    queryFn: () => api.get('/professors/list').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: showAdd && evalSubType === 'peer_to_peer',
  });
  const professorList = profListData?.data || [];

  // Upcoming sessions for THIS professor — pick a class, then a real session date.
  const { data: upcomingSessionsData } = useQuery({
    queryKey: ['professor-upcoming-sessions-for-eval', professorId],
    queryFn: () => api.get(`/evaluations/professor/${professorId}/upcoming-sessions?limit=50`).then(r => r.data),
    enabled: showAdd && !!evalSubType,
    staleTime: 60 * 1000,
  });
  const upcomingPrograms = (() => {
    const byProg = new Map();
    (upcomingSessionsData?.data || []).forEach(s => {
      if (!byProg.has(s.program_id)) {
        byProg.set(s.program_id, {
          id: s.program_id,
          program_nickname: s.program_nickname,
          location_nickname: s.location_nickname,
          party_city: s.party_city,
          lead_professor_name: s.lead_professor_name,
          sessions: [],
        });
      }
      byProg.get(s.program_id).sessions.push({
        session_id: s.session_id,
        session_date: s.session_date,
        session_time: s.session_time,
      });
    });
    return Array.from(byProg.values());
  })();

  const { data } = useQuery({
    queryKey: ['evaluations', professorId],
    queryFn: () => api.get(`/evaluations/professor/${professorId}`).then(r => r.data),
  });
  const evaluations = data?.data || [];

  const { data: configData } = useQuery({
    queryKey: ['evaluation-config'],
    queryFn: () => api.get('/evaluations/schedule-config').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const tiers = configData?.data || [];

  const resetForm = () => {
    setShowAdd(false); setEvalSubType(''); setEvaluatorId('');
    setSelectedProgram(null); setAddDate(''); setAddNotes(''); setShowAllDates(false);
  };

  const addMutation = useMutation({
    mutationFn: () => api.post(`/evaluations/professor/${professorId}`, {
      evaluation_date: addDate,
      evaluation_type: evalSubType === 'fm' ? 'formal' : 'peer_to_peer',
      evaluator_professor_id: evalSubType === 'peer_to_peer' ? (evaluatorId || null) : null,
      evaluator_user_id: evalSubType === 'fm' ? (evaluatorId || null) : null,
      program_id: selectedProgram?.id || null,
      notes: addNotes || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['evaluations', professorId]);
      qc.invalidateQueries(['professors', professorId]);
      resetForm();
    },
    onError: (e) => alert(e?.response?.data?.error || 'Failed to schedule evaluation'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/evaluations/${id}`),
    onSuccess: () => { qc.invalidateQueries(['evaluations', professorId]); qc.invalidateQueries(['professors', professorId]); },
  });

  // Compute status
  const today = new Date();
  const hireDateObj = hireDate ? new Date(hireDate) : null;
  const daysOnStaff = hireDateObj ? Math.floor((today - hireDateObj) / 86400000) : null;
  const tier = tiers.find(t => daysOnStaff !== null && daysOnStaff >= t.min_days_on_staff && (t.max_days_on_staff === null || daysOnStaff <= t.max_days_on_staff));
  const freq = tier?.frequency_days || 120;

  let nextDueDate = null;
  let isOverdue = false;
  if (lastEvalDate) {
    const d = new Date(lastEvalDate);
    d.setDate(d.getDate() + freq);
    nextDueDate = d;
    isOverdue = d < today;
  } else if (hireDateObj) {
    const d = new Date(hireDateObj);
    d.setDate(d.getDate() + Math.min(freq, 45));
    nextDueDate = d;
    isOverdue = d < today;
  }

  // Split: upcoming scheduled (pending form), completed
  const todayStr = today.toISOString().split('T')[0];
  const scheduled = evaluations.filter(e => e.form_status === 'pending' || !e.form_status);
  const completed = evaluations.filter(e => e.form_status === 'completed');

  return (
    <Section title={`Evaluations (${evaluations.length})`} defaultOpen={true}>
      {/* Status banner */}
      <div className={`flex items-center gap-3 mb-3 px-3 py-2 rounded-lg text-sm ${
        isOverdue ? 'bg-red-50 border border-red-200 text-red-700' :
        !lastEvalDate ? 'bg-amber-50 border border-amber-200 text-amber-700' :
        'bg-green-50 border border-green-200 text-green-700'
      }`}>
        {!lastEvalDate ? (
          <span className="font-medium">Never evaluated</span>
        ) : (
          <span>Last eval: <strong>{formatDate(lastEvalDate)}</strong>
            {lastEvalResult && <span className="ml-1.5"><RatingBadge rating={resultToRating(lastEvalResult)} /></span>}
          </span>
        )}
        {tier && <span className="text-xs opacity-70">Tier: {tier.tier_name} (every {freq}d)</span>}
        {nextDueDate && (
          <span className={`ml-auto text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
            {isOverdue ? `Overdue by ${Math.abs(Math.floor((today - nextDueDate) / 86400000))}d` : `Due ${formatDate(nextDueDate.toISOString())}`}
          </span>
        )}
      </div>

      {/* Schedule new evaluation */}
      {!showAdd ? (
        <button type="button" onClick={() => setShowAdd(true)} className="text-xs text-[#1e3a5f] hover:underline mb-3">+ Schedule evaluation</button>
      ) : (
        <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Schedule an evaluation</span>
            <button type="button" onClick={resetForm} className="text-xs text-gray-400">Cancel</button>
          </div>

          {/* Step 1: Who's evaluating? */}
          {!evalSubType && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">Who is evaluating this professor?</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEvalSubType('fm'); setEvaluatorId(''); }}
                  className="flex-1 px-3 py-2 rounded-lg border text-xs font-medium text-left hover:border-[#1e3a5f]/40 transition-colors bg-white border-gray-200">
                  <div className="text-emerald-700 font-semibold">Field Manager</div>
                  <div className="text-gray-400 mt-0.5">FM evaluation — unpaid</div>
                </button>
                <button type="button" onClick={() => { setEvalSubType('peer_to_peer'); setEvaluatorId(''); }}
                  className="flex-1 px-3 py-2 rounded-lg border text-xs font-medium text-left hover:border-[#1e3a5f]/40 transition-colors bg-white border-gray-200">
                  <div className="text-violet-700 font-semibold">Peer to Peer</div>
                  <div className="text-gray-400 mt-0.5">Another professor observes</div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {evalSubType && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded font-medium ${evalSubType === 'fm' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                  {evalSubType === 'fm' ? 'FM Evaluation' : 'Peer to Peer'}
                </span>
                <button type="button" onClick={() => { setEvalSubType(''); setEvaluatorId(''); setSelectedProgram(null); setAddDate(''); }}
                  className="text-[10px] text-gray-400 hover:text-gray-600">← Change</button>
              </div>

              {/* Evaluator selection */}
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">
                  {evalSubType === 'fm' ? 'Field Manager' : 'Observing Professor'}
                </label>
                {evalSubType === 'fm' ? (
                  <select value={evaluatorId} onChange={e => setEvaluatorId(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs w-full">
                    <option value="">Select field manager…</option>
                    {fmUsers.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                  </select>
                ) : (
                  <select value={evaluatorId} onChange={e => setEvaluatorId(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs w-full">
                    <option value="">Select professor…</option>
                    {professorList.filter(p => String(p.id) !== String(professorId)).map(p => (
                      <option key={p.id} value={p.id}>{p.display_name || `${p.professor_nickname} ${p.last_name || ''}`}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Class picker — only this professor's upcoming classes */}
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">Class to evaluate (this professor is teaching)</label>
                {upcomingPrograms.length > 0 ? (
                  <select
                    value={selectedProgram?.id || ''}
                    onChange={e => {
                      const p = upcomingPrograms.find(x => String(x.id) === e.target.value);
                      setSelectedProgram(p || null);
                      setAddDate(''); setShowAllDates(false);
                    }}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs">
                    <option value="">Select an upcoming class…</option>
                    {upcomingPrograms.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.program_nickname} — {p.location_nickname || p.party_city || '—'} ({p.sessions.length} upcoming)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-[10px] text-gray-400 px-2 py-1.5 bg-white rounded border border-gray-200">
                    No upcoming sessions scheduled for this professor.
                  </div>
                )}
              </div>

              {/* Date picker — next sessions for the selected program */}
              {selectedProgram && (
                <div>
                  <label className="text-[10px] text-gray-500 block mb-0.5">Session date</label>
                  <div className="flex items-center gap-1">
                    <select value={addDate} onChange={e => setAddDate(e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs w-60">
                      <option value="">Select session date…</option>
                      {(showAllDates ? selectedProgram.sessions : selectedProgram.sessions.slice(0, 3)).map(s => {
                        const d = (s.session_date || '').toString().split('T')[0];
                        const dow = new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                        return <option key={s.session_id} value={d}>{dow} {formatDate(d)}{s.session_time ? ` — ${formatTime(s.session_time)}` : ''}</option>;
                      })}
                    </select>
                    {!showAllDates && selectedProgram.sessions.length > 3 && (
                      <button type="button" onClick={() => setShowAllDates(true)}
                        className="text-[10px] text-[#1e3a5f] hover:underline">+{selectedProgram.sessions.length - 3} more</button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 items-center flex-wrap">
                <Input placeholder="Notes…" value={addNotes} onChange={e => setAddNotes(e.target.value)} className="w-48" />
                <Button size="sm" type="button" onClick={() => addMutation.mutate()}
                  disabled={!addDate || !selectedProgram || !evaluatorId || addMutation.isPending}>
                  {addMutation.isPending ? '…' : 'Schedule'}
                </Button>
              </div>
              <p className="text-[10px] text-gray-400">After this date passes, the form will appear in Observation Lookup for completion.</p>
            </div>
          )}
        </div>
      )}

      {/* Scheduled (pending form) */}
      {scheduled.length > 0 && (
        <div className="space-y-1 mb-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Scheduled</div>
          {scheduled.map(e => {
            const dateStr = (e.evaluation_date || '').split('T')[0];
            const isPast = dateStr < todayStr;
            return (
              <div key={e.id} className={`flex items-center gap-3 px-3 py-1.5 rounded text-sm ${isPast ? 'bg-amber-50' : 'bg-blue-50/30'}`}>
                <span className="w-20 shrink-0 font-medium text-gray-700">{formatDate(dateStr)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  e.evaluation_type === 'formal' ? 'bg-blue-100 text-blue-700' :
                  e.evaluation_type === 'peer_to_peer' ? 'bg-violet-100 text-violet-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{EVAL_TYPE_OPTIONS.find(t => t.value === e.evaluation_type)?.label || e.evaluation_type?.replace(/_/g, ' ')}</span>
                {isPast && <span className="text-[10px] text-amber-700 bg-amber-100 px-1 py-0.5 rounded font-medium">Form pending</span>}
                <span className="text-xs text-gray-500 flex-1 truncate">{e.evaluator_name || ''}</span>
                <button type="button" onClick={() => { if (confirm('Remove this evaluation?')) deleteMutation.mutate(e.id); }}
                  className="text-gray-300 hover:text-red-500 text-xs">&times;</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed history */}
      {completed.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Completed ({completed.length})</div>
          {completed.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-3 py-1.5 rounded bg-gray-50 text-sm">
              <span className="w-20 shrink-0 font-medium text-gray-700">{formatDate((e.evaluation_date || '').split('T')[0])}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                e.evaluation_type === 'formal' ? 'bg-blue-100 text-blue-700' :
                e.evaluation_type === 'peer_to_peer' ? 'bg-violet-100 text-violet-700' :
                'bg-gray-100 text-gray-600'
              }`}>{EVAL_TYPE_OPTIONS.find(t => t.value === e.evaluation_type)?.label || e.evaluation_type?.replace(/_/g, ' ')}</span>
              {e.result && <RatingBadge rating={resultToRating(e.result)} size="xs" />}
              <span className="text-xs text-gray-500 flex-1 truncate">{e.evaluator_name || e.logged_by_name || ''}{e.notes ? ` — ${e.notes}` : ''}</span>
              <button type="button" onClick={() => { if (confirm('Delete this evaluation?')) deleteMutation.mutate(e.id); }}
                className="text-gray-300 hover:text-red-500 text-xs">&times;</button>
            </div>
          ))}
        </div>
      )}

      {evaluations.length === 0 && (
        <p className="text-sm text-gray-400">No evaluations scheduled or completed.</p>
      )}
    </Section>
  );
}


function SubstituteDatesSection({ professorId, daysOff, substituteReasons, qc }) {
  const { user } = useAuth();
  const isAdmin = ['Admin', 'CEO'].includes(user?.role);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState('single'); // 'single' or 'range'
  const [addForm, setAddForm] = useState({ date: '', start_date: '', end_date: '', substitute_reason_id: '', notes: '' });
  const [selected, setSelected] = useState(new Set());
  const [showManageReasons, setShowManageReasons] = useState(false);
  const [newReason, setNewReason] = useState('');

  const { data: reasonsData } = useQuery({
    queryKey: ['substitute-reasons'],
    queryFn: () => api.get('/substitute-reasons').then(r => r.data),
    enabled: showManageReasons,
  });
  const managedReasons = reasonsData?.data || [];

  const addReasonMutation = useMutation({
    mutationFn: (name) => api.post('/substitute-reasons', { reason_name: name }),
    onSuccess: () => { setNewReason(''); qc.invalidateQueries(['substitute-reasons']); qc.invalidateQueries(['general-data']); },
  });
  const updateReasonMutation = useMutation({
    mutationFn: ({ id, reason_name }) => api.put(`/substitute-reasons/${id}`, { reason_name }),
    onSuccess: () => { qc.invalidateQueries(['substitute-reasons']); qc.invalidateQueries(['general-data']); },
  });
  const deleteReasonMutation = useMutation({
    mutationFn: (id) => api.delete(`/substitute-reasons/${id}`),
    onSuccess: () => { qc.invalidateQueries(['substitute-reasons']); qc.invalidateQueries(['general-data']); },
  });

  const today = new Date().toISOString().split('T')[0];
  const futureDates = daysOff
    .filter(d => (d.date_requested || '').split('T')[0] >= today)
    .sort((a, b) => (a.date_requested || '').localeCompare(b.date_requested || ''));
  const pastDates = daysOff
    .filter(d => (d.date_requested || '').split('T')[0] < today)
    .sort((a, b) => (b.date_requested || '').localeCompare(a.date_requested || ''));

  const addMutation = useMutation({
    mutationFn: (data) => {
      if (addMode === 'range') {
        return api.post(`/professors/${professorId}/sub-dates/range`, data).then(r => r.data);
      }
      return api.post(`/professors/${professorId}/sub-dates`, data).then(r => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries(['professors', professorId]);
      setAddForm({ date: '', start_date: '', end_date: '', substitute_reason_id: '', notes: '' });
      setShowAdd(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ dateId, data }) => api.put(`/professors/${professorId}/sub-dates/${dateId}`, data),
    onSuccess: () => qc.invalidateQueries(['professors', professorId]),
  });

  const deleteMutation = useMutation({
    mutationFn: (dateId) => api.delete(`/professors/${professorId}/sub-dates/${dateId}`),
    onSuccess: () => qc.invalidateQueries(['professors', professorId]),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => api.post(`/professors/${professorId}/sub-dates/bulk-delete`, { ids }),
    onSuccess: () => { qc.invalidateQueries(['professors', professorId]); setSelected(new Set()); },
  });

  const handleAdd = () => {
    if (addMode === 'range') {
      addMutation.mutate({ start_date: addForm.start_date, end_date: addForm.end_date, substitute_reason_id: addForm.substitute_reason_id || null, notes: addForm.notes || null });
    } else {
      addMutation.mutate({ date_requested: addForm.date, substitute_reason_id: addForm.substitute_reason_id || null, notes: addForm.notes || null });
    }
  };

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const renderRow = (d, isPast) => {
    const dateStr = (d.date_requested || '').split('T')[0];
    return (
      <div key={d.id} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${isPast ? 'bg-gray-50 text-gray-400' : dateStr < today ? 'bg-amber-50/50' : 'bg-white'}`}>
        <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)}
          className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
        <span className={`w-24 flex-shrink-0 ${isPast ? '' : 'font-medium text-gray-700'}`}>{formatDate(dateStr)}</span>
        {!isPast && dateStr < today && <span className="text-[10px] text-amber-600 font-medium bg-amber-100 px-1 rounded">PAST</span>}
        <select value={d.substitute_reason_id || ''} onChange={e => updateMutation.mutate({ dateId: d.id, data: { substitute_reason_id: e.target.value || null, notes: d.notes } })}
          className="rounded border border-gray-200 px-1.5 py-0.5 text-xs bg-white w-32">
          <option value="">No reason</option>
          {substituteReasons.map(r => <option key={r.id} value={r.id}>{r.reason_name}</option>)}
        </select>
        <span className="text-xs text-gray-400 flex-1 truncate">{d.notes || ''}</span>
        <button type="button" onClick={() => { if (confirm('Remove this sub date?')) deleteMutation.mutate(d.id); }}
          className="text-gray-300 hover:text-red-500 text-xs flex-shrink-0">&times;</button>
      </div>
    );
  };

  return (
    <Section title={`Substitute Dates (${futureDates.length} upcoming)`} defaultOpen={true}>
      {/* Add controls */}
      <div className="flex items-center gap-2 mb-3">
        {!showAdd ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAddMode('single'); setShowAdd(true); }} className="text-xs text-[#1e3a5f] hover:underline">+ Add date</button>
            <button type="button" onClick={() => { setAddMode('range'); setShowAdd(true); }} className="text-xs text-[#1e3a5f] hover:underline">+ Add date range</button>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 w-full space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {addMode === 'single' ? (
                <Input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} className="w-40" />
              ) : (
                <>
                  <Input type="date" value={addForm.start_date} onChange={e => setAddForm(f => ({ ...f, start_date: e.target.value }))} className="w-36" />
                  <span className="text-xs text-gray-400">to</span>
                  <Input type="date" value={addForm.end_date} onChange={e => setAddForm(f => ({ ...f, end_date: e.target.value }))} className="w-36" />
                  <span className="text-[10px] text-gray-400">(weekdays only)</span>
                </>
              )}
              <select value={addForm.substitute_reason_id} onChange={e => setAddForm(f => ({ ...f, substitute_reason_id: e.target.value }))}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm bg-white w-36">
                <option value="">Reason…</option>
                {substituteReasons.map(r => <option key={r.id} value={r.id}>{r.reason_name}</option>)}
              </select>
              <Input placeholder="Notes (optional)" value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} className="w-44" />
              <Button size="sm" type="button" onClick={handleAdd} disabled={addMutation.isPending || (addMode === 'single' ? !addForm.date : !addForm.start_date || !addForm.end_date)}>
                {addMutation.isPending ? 'Adding…' : 'Add'}
              </Button>
              <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-gray-400">Cancel</button>
            </div>
            {addMutation.isError && <p className="text-xs text-red-600">{addMutation.error?.response?.data?.error || 'Failed'}</p>}
            {addMutation.isSuccess && <p className="text-xs text-green-600">Added!</p>}
          </div>
        )}

        {selected.size > 0 && (
          <button type="button" onClick={() => { if (confirm(`Delete ${selected.size} selected date(s)?`)) bulkDeleteMutation.mutate([...selected]); }}
            className="ml-auto text-xs text-red-600 hover:text-red-800 font-medium">
            Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Manage Reasons (admin only) */}
      {isAdmin && (
        <div className="mb-3">
          <button type="button" onClick={() => setShowManageReasons(v => !v)}
            className="text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-wider">
            {showManageReasons ? '▾ Hide reason options' : '▸ Manage reason options'}
          </button>
          {showManageReasons && (
            <div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-1.5">
              {managedReasons.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <input type="text" defaultValue={r.reason_name}
                    onBlur={e => { if (e.target.value !== r.reason_name) updateReasonMutation.mutate({ id: r.id, reason_name: e.target.value }); }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs flex-1 bg-white" />
                  <button type="button" onClick={() => { if (confirm(`Delete "${r.reason_name}"? Existing dates using it will show "No reason".`)) deleteReasonMutation.mutate(r.id); }}
                    className="text-gray-300 hover:text-red-500 text-xs">&times;</button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <input type="text" value={newReason} onChange={e => setNewReason(e.target.value)}
                  placeholder="New reason…"
                  onKeyDown={e => { if (e.key === 'Enter' && newReason.trim()) addReasonMutation.mutate(newReason.trim()); }}
                  className="rounded border border-gray-300 px-2 py-1 text-xs flex-1" />
                <button type="button" onClick={() => { if (newReason.trim()) addReasonMutation.mutate(newReason.trim()); }}
                  disabled={!newReason.trim()}
                  className="text-xs text-[#1e3a5f] hover:underline disabled:opacity-40">Add</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upcoming sub dates */}
      {futureDates.length > 0 && (
        <div className="space-y-0.5 mb-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Upcoming</div>
          {futureDates.map(d => renderRow(d, false))}
        </div>
      )}

      {/* Past sub dates */}
      {pastDates.length > 0 && (
        <details className="group">
          <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 mb-1">
            Past ({pastDates.length}) <span className="text-[10px] normal-case font-normal">click to expand</span>
          </summary>
          <div className="space-y-0.5 mt-1">
            {pastDates.map(d => renderRow(d, true))}
          </div>
        </details>
      )}

      {futureDates.length === 0 && pastDates.length === 0 && (
        <p className="text-sm text-gray-400">No substitute dates on file</p>
      )}
    </Section>
  );
}

export default function ProfessorDetailPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: profData, isLoading } = useQuery({
    queryKey: ['professors', id],
    queryFn: () => getProfessor(id),
    enabled: !isNew,
  });
  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};
  const { data: locationListData } = useLocationList();
  const locationList = locationListData?.data || [];

  const formMethods = useForm();
  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty } } = formMethods;

  const [viewMode, setViewMode] = useState(!isNew);

  useEffect(() => {
    if (profData?.data) {
      const fd = toFormData(profData.data);
      fd._city_name = profData.data.city_name || '';
      fd._state_code = profData.data.state_code || '';
      fd._zip_code = profData.data.zip_code || '';
      reset(fd);
    }
  }, [profData]);

  const [saveStatus, setSaveStatus] = useState(null);
  const mutation = useMutation({
    mutationFn: (data) => isNew ? createProfessor(data) : updateProfessor(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['professors']);
      qc.invalidateQueries(['professors', id]);
      setSaveStatus({ type: 'success', msg: 'Saved!' });
      setTimeout(() => setSaveStatus(null), 3000);
      if (isNew && res?.id) navigate(`/professors/${res.id}`);
      else setViewMode(true);
    },
    onError: (e) => {
      setSaveStatus({ type: 'error', msg: e?.response?.data?.error || e.message || 'Save failed' });
      setTimeout(() => setSaveStatus(null), 5000);
    },
  });

  const emptyLsForm = () => ({ lsType: 'contractor', contractorId: '', locationId: '', date: '', pass: true, notes: '', link: '' });
  const [lsAdding, setLsAdding] = useState(false);
  const [lsEdit, setLsEdit] = useState(null); // ls.id being edited
  const [lsForm, setLsForm] = useState(emptyLsForm());

  const lsCreate = useMutation({
    mutationFn: (data) => createLivescan(id, data),
    onSuccess: () => { qc.invalidateQueries(['professors', id]); setLsAdding(false); setLsForm(emptyLsForm()); },
    onError: (e) => alert('Save failed: ' + (e?.response?.data?.error || e.message)),
  });
  const lsUpdate = useMutation({
    mutationFn: ({ lsId, data }) => updateLivescan(id, lsId, data),
    onSuccess: () => { qc.invalidateQueries(['professors', id]); setLsEdit(null); setLsForm(emptyLsForm()); },
    onError: (e) => alert('Save failed: ' + (e?.response?.data?.error || e.message)),
  });
  const lsDelete = useMutation({
    mutationFn: (lsId) => deleteLivescan(id, lsId),
    onSuccess: () => qc.invalidateQueries(['professors', id]),
    onError: (e) => alert('Delete failed: ' + (e?.response?.data?.error || e.message)),
  });

  const startLsEdit = (ls) => {
    setLsEdit(ls.id);
    setLsAdding(false);
    setLsForm({
      lsType: ls.contractor_id ? 'contractor' : 'location',
      contractorId: ls.contractor_id ? String(ls.contractor_id) : '',
      locationId: ls.location_id ? String(ls.location_id) : '',
      date: ls.livescan_date ? ls.livescan_date.split('T')[0] : '',
      pass: !!ls.pass,
      notes: ls.notes || '',
      link: ls.livescan_link || '',
    });
  };

  const lsFormToPayload = () => ({
    contractor_id: lsForm.lsType === 'contractor' ? lsForm.contractorId || null : null,
    location_id: lsForm.lsType === 'location' ? lsForm.locationId || null : null,
    livescan_date: lsForm.date || null,
    livescan_link: lsForm.link || null,
    notes: lsForm.notes || null,
    pass: lsForm.pass ? 1 : 0,
  });

  const prof = profData?.data || {};
  const [generatedPassword, setGeneratedPassword] = useState(null);

  const generateLoginMutation = useMutation({
    mutationFn: () => api.post(`/professors/${id}/generate-login`).then(r => r.data),
    onSuccess: (res) => { setGeneratedPassword(res.password); qc.invalidateQueries(['professors', id]); },
  });

  const regenPasswordMutation = useMutation({
    mutationFn: () => api.post(`/professors/${id}/regenerate-password`).then(r => r.data),
    onSuccess: (res) => { setGeneratedPassword(res.password); },
  });

  const onSubmit = (data) => mutation.mutate(data);
  const onError = (errors) => {
    console.error('Form validation errors:', errors);
    const firstError = Object.entries(errors)[0];
    const fieldName = firstError?.[0]?.replace(/_/g, ' ') || 'unknown';
    setSaveStatus({ type: 'error', msg: `Fix required field: ${fieldName}` });
    setTimeout(() => setSaveStatus(null), 5000);

    // Auto-open collapsed section containing the error field and scroll to it
    setTimeout(() => {
      const el = document.querySelector(`[name="${firstError?.[0]}"]`);
      if (el) {
        // Already visible? Just scroll
        if (el.offsetParent) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
          return;
        }
        // Find the collapsed section and click its toggle to open it
        let sectionEl = el.closest('.border.border-gray-200.rounded-lg');
        if (sectionEl) {
          const toggleBtn = sectionEl.querySelector('button');
          if (toggleBtn) toggleBtn.click();
          // After React re-renders, scroll to the field
          setTimeout(() => {
            const field = document.querySelector(`[name="${firstError?.[0]}"]`);
            if (field) { field.scrollIntoView({ behavior: 'smooth', block: 'center' }); field.focus(); }
          }, 200);
        }
      }
    }, 100);
  };

  if (!isNew && isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  return (
    <AppShell>
      <UnsavedChangesModal when={isDirty} />
      <FormProvider {...formMethods}>
      <ViewModeProvider value={viewMode}>
      <form onSubmit={handleSubmit(onSubmit, onError)}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <Link to="/professors" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Professors</Link>
            <div className="flex items-center gap-2 mt-0.5">
              <h1 className="text-xl font-bold text-gray-900">
                {isNew ? 'New Professor' : (prof.professor_nickname || [prof.first_name, prof.last_name].filter(Boolean).join(' ') || 'Professor')}
              </h1>
              {prof.requires_observations && !prof.observations_cleared ? (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
                  Needs Observations
                </span>
              ) : null}
            </div>
          </div>
          {!isNew && (
            <div className="flex items-center gap-3">
              {viewMode ? (
                <button type="button" onClick={() => setViewMode(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium hover:bg-[#152a47] transition-colors shadow-sm">
                  ✎ Edit
                </button>
              ) : (
                <button type="button" onClick={() => {
                  const fd = toFormData(prof);
                  fd._city_name = prof.city_name || '';
                  fd._state_code = prof.state_code || '';
                  fd._zip_code = prof.zip_code || '';
                  reset(fd);
                  setViewMode(true);
                }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
                  Cancel Edit
                </button>
              )}
              <Link to={`/schedule/${id}`} className="text-sm text-[#1e3a5f] hover:underline">View Schedule →</Link>
            </div>
          )}
        </div>

        <div className="p-6 space-y-4 pb-32">
          {/* Section 1: General Info */}
          <Section title="General Info" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Preferred Name" required {...register('professor_nickname', { required: 'Required' })} error={errors.professor_nickname?.message} />
              <Select label="Status" required {...register('professor_status_id', { required: 'Required' })} error={errors.professor_status_id?.message}>
                <option value="">Select status…</option>
                {(ref.professorStatuses || []).filter(s => !isNew || ['Active', 'Substitute', 'Training'].includes(s.professor_status_name)).map(s => (
                  <option key={s.id} value={s.id}>{s.professor_status_name}</option>
                ))}
              </Select>
              <Input label="First Name" required {...register('first_name', { required: 'Required' })} error={errors.first_name?.message} />
              <Input label="Last Name" required {...register('last_name', { required: 'Required' })} error={errors.last_name?.message} />
              <Input label="Email" type="email" required {...register('email', { required: 'Required' })} error={errors.email?.message} />
              <Input label="Trainual Email (if different)" type="email" {...register('trainual_email')} placeholder="leave blank if same as Email" />
              <Input label="Phone Number" required {...register('phone_number', { required: 'Required' })} error={errors.phone_number?.message} />
              <div className="col-span-2">
                <Input label="Street Address" required {...register('address', { required: 'Required' })} error={errors.address?.message} />
              </div>
              <Input label="City" required value={watch('_city_name') || ''} onChange={e => setValue('_city_name', e.target.value, { shouldDirty: true })} error={errors._city_name?.message} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="State" required value={watch('_state_code') || ''} onChange={e => setValue('_state_code', e.target.value, { shouldDirty: true })} maxLength={2} error={errors._state_code?.message} />
                <Input label="Zip" required value={watch('_zip_code') || ''} onChange={e => setValue('_zip_code', e.target.value, { shouldDirty: true })} error={errors._zip_code?.message} />
              </div>
              <Select label="Geographic Area" required {...register('geographic_area_id', { required: 'Required' })} error={errors.geographic_area_id?.message}>
                <option value="">Select...</option>
                {(ref.areas || []).map(a => (
                  <option key={a.id} value={a.id}>{a.geographic_area_name}</option>
                ))}
              </Select>
              <Select label="Scheduling Coordinator" required {...register('scheduling_coordinator_owner_id', { required: 'Required' })} error={errors.scheduling_coordinator_owner_id?.message}>
                <option value="">Select...</option>
                {(ref.staffUsers || []).map(u => (
                  <option key={u.id} value={u.id}>{u.display_name}</option>
                ))}
              </Select>
              <div className="col-span-2">
                <Input label="General Notes" {...register('general_notes')} />
              </div>
            </div>
          </Section>

          {/* Portal Login */}
          {!isNew && (
            <Section title="Portal Login" defaultOpen={!!prof.user_id}>
              {prof.user_id ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-6">
                    <div>
                      <label className="text-xs text-gray-500">Username</label>
                      <div className="text-sm font-mono font-medium text-gray-800">{prof.login_username}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Password</label>
                      <div className="flex items-center gap-1">
                        <code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded select-all">{prof.login_password || '••••••'}</code>
                        {prof.login_password && (
                          <button type="button" onClick={() => navigator.clipboard.writeText(prof.login_password)}
                            className="text-[10px] text-gray-400 hover:text-[#1e3a5f]">Copy</button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Status</label>
                      <div className={`text-sm font-medium ${prof.login_active ? 'text-green-600' : 'text-red-600'}`}>
                        {prof.login_active ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                  </div>
                  {generatedPassword && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="text-xs font-medium text-amber-800 mb-1">New Password (copy now — won't be shown again)</div>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-white px-2 py-1 rounded border border-amber-200 select-all">{generatedPassword}</code>
                        <button type="button" onClick={() => navigator.clipboard.writeText(generatedPassword)}
                          className="text-xs text-amber-700 hover:text-amber-900 underline">Copy</button>
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => regenPasswordMutation.mutate()}
                    disabled={regenPasswordMutation.isPending}
                    className="text-xs text-[#1e3a5f] hover:underline">
                    {regenPasswordMutation.isPending ? 'Generating…' : 'Reset Password'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">No portal login yet. Generate one so this professor can view their schedule.</p>
                  <Button type="button" onClick={() => generateLoginMutation.mutate()}
                    disabled={generateLoginMutation.isPending}>
                    {generateLoginMutation.isPending ? 'Creating…' : 'Generate Portal Login'}
                  </Button>
                  {generateLoginMutation.isError && (
                    <p className="text-xs text-red-600">{generateLoginMutation.error?.response?.data?.error || 'Failed'}</p>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* Section 2: Pay Info */}
          <Section title="Pay Info">
            <div className="grid grid-cols-3 gap-4">
              <Input label="Base Pay" type="number" step="0.01" required {...register('base_pay', { required: 'Required' })} error={errors.base_pay?.message} />
              <Input label="Assist Pay" type="number" step="0.01" required {...register('assist_pay', { required: 'Required' })} error={errors.assist_pay?.message} />
              <Input label="Party Pay" type="number" step="0.01" {...register('party_pay')} />
              <Input label="Camp Pay" type="number" step="0.01" {...register('camp_pay')} />
            </div>
          </Section>

          {/* Section 3: Training */}
          <Section title="Training" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-3">
              {TRAINING_FIELDS.map(t => (
                <Toggle
                  key={t.key}
                  label={t.label}
                  checked={!!watch(t.key)}
                  onChange={v => setValue(t.key, v ? 1 : 0, { shouldDirty: true })}
                />
              ))}
            </div>
          </Section>

          {/* Section 4: Compliance */}
          <Section title="Compliance & Qualifications" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Toggle label="Virtus" checked={!!watch('virtus')} onChange={v => setValue('virtus', v ? 1 : 0, { shouldDirty: true })} />
              <Input label="Virtus Date" type="date" {...register('virtus_date')} />
              <Toggle label="TB Test" checked={!!watch('tb_test')} onChange={v => setValue('tb_test', v ? 1 : 0, { shouldDirty: true })} />
              <Input label="TB Date" type="date" {...register('tb_date')} />
            </div>
            {/* Livescans */}
            {!isNew && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700">Livescans</span>
                  {!lsAdding && lsEdit === null && (
                    <button type="button" onClick={() => { setLsAdding(true); setLsForm(emptyLsForm()); }}
                      className="text-xs text-[#1e3a5f] hover:underline">+ Add</button>
                  )}
                </div>

                <div className="space-y-1">
                  {(prof.livescans || []).map(ls => (
                    <div key={ls.id}>
                      {lsEdit === ls.id ? (
                        <LivescanForm
                          form={lsForm} setForm={setLsForm}
                          contractors={ref.contractors || []} locations={locationList}
                          onSave={() => lsUpdate.mutate({ lsId: ls.id, data: lsFormToPayload() })}
                          onCancel={() => { setLsEdit(null); setLsForm(emptyLsForm()); }}
                          isPending={lsUpdate.isPending}
                        />
                      ) : (
                        <div className="text-sm text-gray-600 flex gap-3 items-center py-0.5">
                          <span className="flex-1 truncate">{ls.display_name || ls.location_nickname || ls.contractor_name || 'Unknown'}</span>
                          <span className="text-gray-500 shrink-0">{ls.livescan_date ? formatDate(ls.livescan_date) : '—'}</span>
                          <span className={`shrink-0 ${ls.pass ? 'text-green-600' : 'text-red-500'}`}>{ls.pass ? 'Pass' : 'Fail'}</span>
                          <button type="button" onClick={() => startLsEdit(ls)}
                            className="text-xs text-gray-400 hover:text-[#1e3a5f] shrink-0">Edit</button>
                          <button type="button" onClick={() => { if (confirm('Delete this livescan?')) lsDelete.mutate(ls.id); }}
                            className="text-xs text-gray-400 hover:text-red-500 shrink-0">Delete</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {prof.livescans?.length === 0 && lsEdit === null && !lsAdding && (
                    <p className="text-sm text-gray-400">No livescans on file</p>
                  )}
                </div>

                {lsAdding && (
                  <div className="mt-2">
                    <LivescanForm
                      form={lsForm} setForm={setLsForm}
                      contractors={ref.contractors || []} locations={locationList}
                      onSave={() => lsCreate.mutate(lsFormToPayload())}
                      onCancel={() => { setLsAdding(false); setLsForm(emptyLsForm()); }}
                      isPending={lsCreate.isPending}
                    />
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Section 5: HR Info */}
          <Section title="HR Info">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Birthday" type="date" {...register('birthday')} />
              <Input label="Hire Date" type="date" required {...register('hire_date', { required: 'Required' })} error={errors.hire_date?.message} />
              <Input label="Termination Date" type="date" {...register('termination_date')} />
              <Input label="Termination Reason" {...register('termination_rason')} />
              <Input label="Rating" type="number" step="0.1" min="0" max="5" {...register('rating')} />
            </div>
          </Section>

          {/* Section 6: Availability */}
          {!isNew && <AvailabilitySection professorId={id} availability={prof.availability || []} availabilityNotes={prof.availability_notes || ''} qc={qc} />}

          {/* Active Programs */}
          {prof.activePrograms && prof.activePrograms.length > 0 && (
            <Section title={`Active Programs (${prof.activePrograms.length})`} defaultOpen={true}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Role</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Dates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {prof.activePrograms.map(p => (
                    <tr key={p.id}>
                      <td className="px-3 py-2"><Link to={`/programs/${p.id}`} className="text-[#1e3a5f] hover:underline font-medium">{p.program_nickname}</Link></td>
                      <td className="px-3 py-2 text-gray-600">{p.location_nickname || p.party_city || '—'}</td>
                      <td className="px-3 py-2"><Badge status={p.class_status_name} /></td>
                      <td className="px-3 py-2 text-center"><span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${p.role === 'Lead' ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'bg-gray-100 text-gray-600'}`}>{p.role}</span></td>
                      <td className="px-3 py-2 text-xs text-gray-500">{p.first_session_date ? formatDate(p.first_session_date) : '—'}{p.last_session_date ? ` — ${formatDate(p.last_session_date)}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Upcoming Sessions Preview (teaching + observes) */}
          {(() => {
            const subDateSet = new Set((prof.daysOff || []).map(d => (d.date_requested || '').split('T')[0]));
            // For each session, determine if this prof is still on it or has been replaced
            const getSubStatus = (s) => {
              const dateStr = (s.session_date || '').split('T')[0];
              if (!subDateSet.has(dateStr)) return 'none';
              const actualLead = s.session_professor_id || s.lead_professor_id;
              const actualAssist = s.session_assistant_id || s.assistant_professor_id;
              const stillOnSession = String(actualLead) === String(id) || String(actualAssist) === String(id);
              return stillOnSession ? 'requested' : 'covered';
            };
            const todayStr = new Date().toISOString().split('T')[0];
            const teachingSessions = (prof.upcomingSessions || [])
              .filter(s => getSubStatus(s) !== 'covered')
              .map(s => ({ ...s, _kind: 'teach', _subStatus: getSubStatus(s) }));
            const observeRows = (prof.observations || [])
              .filter(o => o.observation_type === 'observation'
                && o.role_in_obs === 'evaluator'
                && o.status !== 'cancelled'
                && o.observation_date
                && (o.observation_date.split('T')[0] >= todayStr))
              .map(o => ({
                _kind: 'observe',
                observation_id: o.id,
                session_date: o.observation_date,
                session_time: o.start_time,
                program_nickname: o.program_nickname,
                location_nickname: o.location_nickname,
                party_city: o.party_city,
                pay_amount: o.pay_amount,
                is_paid: o.is_paid,
                lead_professor_name: o.lead_professor_name,
              }));
            const combined = [...teachingSessions, ...observeRows].sort((a, b) => {
              const ad = (a.session_date || '').split('T')[0];
              const bd = (b.session_date || '').split('T')[0];
              if (ad !== bd) return ad.localeCompare(bd);
              return (a.session_time || '').localeCompare(b.session_time || '');
            });
            if (combined.length === 0) return null;
            return (
              <Section title={`Upcoming Sessions (${combined.length})`} defaultOpen={true}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {combined.map((s, i) => {
                      if (s._kind === 'observe') {
                        return (
                          <tr key={`o-${s.observation_id}`} className="bg-blue-50/40">
                            <td className="px-3 py-2">
                              {s.session_date ? formatDate(s.session_date) : '—'}
                              <span className="ml-1.5 text-[10px] font-medium text-blue-700 bg-blue-100 px-1 py-0.5 rounded">OBSERVE</span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">{s.session_time ? formatTime(s.session_time) : '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{s.program_nickname}</td>
                            <td className="px-3 py-2 text-gray-500">{s.location_nickname || s.party_city || '—'}</td>
                            <td className="px-3 py-2 text-center">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                                {s.is_paid ? (s.pay_amount ? `$${s.pay_amount}` : 'Paid') : 'Unpaid'}
                              </span>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={`s-${i}`} className={s._subStatus === 'requested' ? 'bg-amber-50' : ''}>
                          <td className="px-3 py-2">
                            {s.session_date ? formatDate(s.session_date) : '—'}
                            {s._subStatus === 'requested' && <span className="ml-1.5 text-[10px] font-medium text-amber-700 bg-amber-100 px-1 py-0.5 rounded">SUB REQUESTED</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{s.session_time ? formatTime(s.session_time) : '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{s.program_nickname}</td>
                          <td className="px-3 py-2 text-gray-500">{s.location_id ? <Link to={`/locations/${s.location_id}`} className="text-[#1e3a5f] hover:underline">{s.location_nickname}</Link> : (s.location_nickname || s.party_city || '—')}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              s.class_status_name === 'Confirmed' ? 'bg-green-100 text-green-700' :
                              s.class_status_name === 'Unconfirmed' ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{s.class_status_name || '—'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Link to={`/schedule/${id}`} className="text-xs text-[#1e3a5f] hover:underline mt-2 inline-block">View full schedule →</Link>
              </Section>
            );
          })()}

          {/* Section 7: Substitute Dates */}
          {!isNew && <SubstituteDatesSection professorId={id} daysOff={prof.daysOff || []} substituteReasons={ref.substituteReasons || []} qc={qc} />}

          {/* Evaluation History */}
          {!isNew && <EvaluationSection professorId={id} hireDate={prof.hire_date} lastEvalDate={prof.last_evaluation_date} lastEvalResult={prof.last_evaluation_result} />}

          {/* Incidents */}
          {!isNew && <IncidentSection professorId={id} />}

          {/* Audit History */}
          {!isNew && <AuditHistory table="professor" recordId={id} />}

          {/* Section 8: Materials / Bins */}
          <Section title="Materials / Bins">
            {prof.bins && prof.bins.length > 0 ? (
              <div className="space-y-1">
                {prof.bins.map(b => (
                  <div key={b.id} className="text-sm flex gap-4">
                    <span className="font-medium">{b.bin_name}</span>
                    <span className="text-gray-600">#{b.bin_number}</span>
                    <span className="text-gray-500">{b.comment}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-400">No bins assigned</p>}
          </Section>
        </div>

        {/* Sticky Footer — edit mode only */}
        {!viewMode && (
          <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
            {mutation.isError && (
              <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>
            )}
            {mutation.isSuccess && <p className="text-sm text-green-600">Saved successfully</p>}
            <div className="ml-auto flex gap-3">
              <Link to="/professors" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
      </form>
      </ViewModeProvider>
      </FormProvider>
      {saveStatus && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm shadow-lg z-50 ${
          saveStatus.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
        }`}>{saveStatus.msg}</div>
      )}
    </AppShell>
  );
}
