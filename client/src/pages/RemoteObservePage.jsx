import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import { formatDate } from '../lib/utils';

const DAY_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseLocalDate(s) {
  const [y, m, d] = String(s).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function addMinutesToClock(timeStr, deltaMinutes) {
  const [h, m] = String(timeStr).split(':').map(Number);
  const total = h * 60 + m + deltaMinutes;
  const dayMins = ((total % 1440) + 1440) % 1440;
  const newH = Math.floor(dayMins / 60);
  const newM = dayMins % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = parseLocalDate(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / (1000 * 60 * 60 * 24));
}

function allowedBadge(value, notes) {
  if (value === 1) return { label: 'YES', cls: 'bg-green-100 text-green-700 border-green-200', notes };
  if (value === 0) return { label: 'NO', cls: 'bg-red-100 text-red-700 border-red-200', notes };
  return { label: 'UNKNOWN', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200', notes };
}

const STATUS_COLORS = {
  Active: 'bg-green-100 text-green-700',
  Substitute: 'bg-blue-100 text-blue-700',
  Training: 'bg-violet-100 text-violet-700',
};

export default function RemoteObservePage() {
  const qc = useQueryClient();
  const toast = useToast();

  const [profQuery, setProfQuery] = useState('');
  const [debouncedProfQuery, setDebouncedProfQuery] = useState('');
  const [selectedProfessor, setSelectedProfessor] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [meetingType, setMeetingType] = useState('initial');
  const [acknowledgeUnknown, setAcknowledgeUnknown] = useState(false);
  const [scheduledResult, setScheduledResult] = useState(null);

  // Debounce the professor search
  const debounceRef = useRef(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedProfQuery(profQuery), 250);
    return () => clearTimeout(debounceRef.current);
  }, [profQuery]);

  // Step 1: Professor search
  const { data: profData, isFetching: profFetching } = useQuery({
    queryKey: ['remote-observe-professors', debouncedProfQuery],
    queryFn: () => api.get('/remote-observe/professors', { params: { q: debouncedProfQuery } }).then(r => r.data),
    // Always enabled — when empty, returns the most-overdue list.
    enabled: true,
  });
  const professors = profData?.data || [];

  // Step 2: Programs for the selected professor
  const { data: progData, isLoading: progLoading } = useQuery({
    queryKey: ['remote-observe-progs-for', selectedProfessor?.professor_id],
    queryFn: () => api.get('/remote-observe/classes', { params: { professor_id: selectedProfessor.professor_id } }).then(r => r.data),
    enabled: !!selectedProfessor,
  });
  const programs = progData?.data || [];

  // Step 4: Live preview
  const { data: previewData } = useQuery({
    queryKey: ['remote-observe-preview', selectedSessionId, meetingType],
    queryFn: () => api.post('/remote-observe/preview', { session_id: selectedSessionId, meeting_type: meetingType }).then(r => r.data),
    enabled: !!selectedSessionId,
  });
  const preview = previewData?.data;

  // Reset downstream state when an upstream pick changes
  const pickProfessor = (p) => {
    setSelectedProfessor(p);
    setSelectedProgram(null);
    setSelectedSessionId(null);
    setAcknowledgeUnknown(false);
    setScheduledResult(null);
    setProfQuery('');
  };
  const pickProgram = (p) => {
    setSelectedProgram(p);
    setSelectedSessionId(null);
    setAcknowledgeUnknown(false);
    setScheduledResult(null);
  };

  useEffect(() => { setAcknowledgeUnknown(false); setScheduledResult(null); }, [meetingType, selectedSessionId]);

  const badge = selectedProgram
    ? allowedBadge(selectedProgram.remote_observe_allowed, selectedProgram.remote_observe_notes)
    : null;
  const blocked = selectedProgram?.remote_observe_allowed === 0;
  const needsAck = selectedProgram && (selectedProgram.remote_observe_allowed === null || selectedProgram.remote_observe_allowed === undefined);

  const scheduleMutation = useMutation({
    mutationFn: () => api.post('/remote-observe/schedule', {
      session_id: selectedSessionId,
      meeting_type: meetingType,
      acknowledge_unknown: acknowledgeUnknown || undefined,
    }).then(r => r.data),
    onSuccess: (res) => {
      setScheduledResult(res.data);
      qc.invalidateQueries(['remote-observe-progs-for', selectedProfessor?.professor_id]);
      toast.success('Remote evaluation scheduled');
    },
    onError: (err) => {
      const d = err?.response?.data;
      if (d?.requires_google_connect) toast.error('Connect your Google Calendar first (top-right account menu)');
      else toast.error(d?.error || 'Failed to schedule');
    },
  });

  const startOver = () => {
    setSelectedProfessor(null);
    setSelectedProgram(null);
    setSelectedSessionId(null);
    setAcknowledgeUnknown(false);
    setScheduledResult(null);
    setProfQuery('');
  };

  const canSubmit = selectedSessionId && !blocked && (needsAck ? acknowledgeUnknown : true) && !scheduleMutation.isPending;
  const disabledReason = !selectedSessionId ? 'Pick a class date above'
    : blocked ? 'This contractor is marked NO for remote evaluations'
    : (needsAck && !acknowledgeUnknown) ? 'Check the "I confirm" box in step 3'
    : null;

  return (
    <AppShell>
      <PageHeader title="Schedule Remote Evaluation" />

      <div className="p-6 pb-32 max-w-5xl space-y-4">
        {/* ─── Step 1: Pick Professor ─── */}
        <Step n={1} title="Professor"
          summary={selectedProfessor ? (
            <ProfessorSummary p={selectedProfessor} onChange={() => setSelectedProfessor(null)} />
          ) : null}>
          {!selectedProfessor && (
            <ProfessorPicker query={profQuery} setQuery={setProfQuery}
              professors={professors} loading={profFetching}
              onPick={pickProfessor} />
          )}
        </Step>

        {/* ─── Step 2: Pick Class ─── */}
        {selectedProfessor && (
          <Step n={2} title="Class"
            summary={selectedProgram ? (
              <ProgramSummary p={selectedProgram} onChange={() => setSelectedProgram(null)} />
            ) : null}>
            {!selectedProgram && (
              progLoading ? <div className="flex items-center gap-2 text-xs text-gray-500"><Spinner className="w-3 h-3" /> Loading their classes…</div>
              : programs.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No current confirmed programs with upcoming sessions where this professor is the lead.
                </p>
              ) : (
                <ProgramList programs={programs} onPick={pickProgram} />
              )
            )}
          </Step>
        )}

        {/* ─── Step 3: Status (allowed badge) ─── */}
        {selectedProgram && (
          <Step n={3} title="Remote Evaluations Allowed?">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs font-bold px-2 py-1 rounded border ${badge.cls}`}>{badge.label}</span>
              <span className="text-xs text-gray-500">
                for <strong className="text-gray-700">{selectedProgram.contractor_name || '—'}</strong>
              </span>
            </div>
            {badge.notes && (
              <div className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2 whitespace-pre-wrap">
                <span className="font-semibold text-gray-700">Notes:</span> {badge.notes}
              </div>
            )}
            {blocked && (
              <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                This contractor is marked <strong>NO</strong> for remote evaluations. Scheduling is blocked.
              </div>
            )}
            {needsAck && (
              <label className="mt-3 flex items-start gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={acknowledgeUnknown}
                  onChange={e => setAcknowledgeUnknown(e.target.checked)} className="mt-0.5 accent-[#1e3a5f]" />
                <span>I confirm this contractor allows remote evaluations. (Status is currently "Unknown" — update the contractor's Remote Observation Policy after confirming.)</span>
              </label>
            )}
          </Step>
        )}

        {/* ─── Step 4: Pick Date ─── */}
        {selectedProgram && !blocked && (
          <Step n={4} title="Class Date">
            {selectedProgram.next_3_sessions.length === 0 ? (
              <p className="text-sm text-gray-400">No future sessions on file for this class.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {selectedProgram.next_3_sessions.map(s => {
                  const dateObj = parseLocalDate(s.session_date);
                  const startClock = (selectedProgram.class_start_time || '').slice(0, 5);
                  const endClock = startClock && selectedProgram.class_length_minutes
                    ? addMinutesToClock(startClock, parseInt(selectedProgram.class_length_minutes))
                    : '';
                  const isSelected = selectedSessionId === s.session_id;
                  return (
                    <label key={s.session_id}
                      className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                        isSelected ? 'border-[#1e3a5f] bg-[#1e3a5f]/5' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <div className="flex items-start gap-2">
                        <input type="radio" name="session_date" checked={isSelected}
                          onChange={() => setSelectedSessionId(s.session_id)}
                          className="mt-1 accent-[#1e3a5f]" />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900">
                            {DAY_OF_WEEK[dateObj.getDay()]} · {formatDate(s.session_date)}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Class: {fmtTime(selectedProgram.class_start_time)}{endClock ? ` – ${fmtTime(endClock + ':00')}` : ''}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            Event window: 10 min pre + class + 15 min debrief
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </Step>
        )}

        {/* ─── Step 5: Meeting Type ─── */}
        {selectedSessionId && (
          <Step n={5} title="Evaluation Type">
            <div className="flex gap-4">
              {[
                { value: 'initial', label: 'Remote Evaluation' },
                { value: 'follow_up', label: 'Follow-Up Remote Evaluation' },
              ].map(o => (
                <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="meeting_type" checked={meetingType === o.value}
                    onChange={() => setMeetingType(o.value)} className="accent-[#1e3a5f]" />
                  {o.label}
                </label>
              ))}
            </div>
          </Step>
        )}

        {/* ─── Step 6: Preview + Submit ─── */}
        {selectedSessionId && preview && !scheduledResult && (
          <div className="bg-gray-50 rounded-lg border-2 border-[#1e3a5f]/20 p-4 space-y-2 text-xs">
            <div className="text-sm font-semibold text-gray-700">Event Preview</div>
            <div>
              <span className="font-semibold text-gray-700">Title:</span>{' '}
              <span className="text-gray-900">{preview.title}</span>
            </div>
            <div>
              <span className="font-semibold text-gray-700">Attendees:</span>{' '}
              <span className="text-gray-900">{preview.attendees.join(', ') || '— (none)'}</span>
            </div>
            <details className="bg-white rounded border border-gray-200 p-2">
              <summary className="cursor-pointer text-gray-600 select-none">View description body</summary>
              <pre className="mt-2 whitespace-pre-wrap text-[11px] text-gray-700 font-mono leading-relaxed">{preview.description}</pre>
            </details>
          </div>
        )}

        {selectedSessionId && !scheduledResult && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-end gap-3">
            {scheduleMutation.isPending && <Spinner className="w-4 h-4" />}
            {!canSubmit && disabledReason && (
              <span className="text-xs text-gray-500">{disabledReason}</span>
            )}
            <Button onClick={() => scheduleMutation.mutate()} disabled={!canSubmit}>
              {scheduleMutation.isPending ? 'Scheduling…' : 'Send Calendar Invite'}
            </Button>
          </div>
        )}

        {scheduledResult && (
          <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
            <div className="text-sm font-semibold text-green-800 mb-2">✓ Scheduled — invite sent to attendees</div>
            <div className="text-xs space-y-1">
              {scheduledResult.meet_link ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-700">Meet link:</span>
                  <a href={scheduledResult.meet_link} target="_blank" rel="noreferrer" className="text-[#1e3a5f] hover:underline font-medium">
                    {scheduledResult.meet_link}
                  </a>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(scheduledResult.meet_link); toast.info('Copied'); }}
                    className="text-gray-400 hover:text-gray-600 text-[10px]">copy</button>
                </div>
              ) : (
                <div className="text-amber-700">Meet link not yet available — check the Calendar event.</div>
              )}
              <div className="text-gray-500">Event ID: <code className="bg-white px-1 rounded">{scheduledResult.gcal_event_id}</code></div>
              <div className="text-gray-500">
                Window: {scheduledResult.event_start_at} → {scheduledResult.event_end_at} (Pacific Time)
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" onClick={startOver}>Schedule another</Button>
              <span className="text-[11px] text-gray-500">
                Logged on this professor's evaluation history. Fill out the evaluation form on the Evaluation Dashboard after the call.
              </span>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Step({ n, title, summary, children }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-gray-700">{n}. {title}</div>
        {summary}
      </div>
      {children}
    </div>
  );
}

function ProfessorSummary({ p, onChange }) {
  const days = daysSince(p.last_evaluation_date);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-medium text-gray-900">
        {p.professor_nickname || p.first_name} {p.last_name}
      </span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[p.professor_status_name] || 'bg-gray-100 text-gray-700'}`}>
        {p.professor_status_name}
      </span>
      {p.last_evaluation_date ? (
        <span className="text-gray-500">last eval {formatDate(p.last_evaluation_date)}{days != null ? ` (${days}d ago)` : ''}</span>
      ) : (
        <span className="text-red-600 font-medium">never evaluated</span>
      )}
      <button type="button" onClick={onChange} className="text-gray-400 hover:text-gray-600">change</button>
    </div>
  );
}

function ProfessorPicker({ query, setQuery, professors, loading, onPick }) {
  return (
    <div>
      <input
        type="text"
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Type a professor's name…"
        className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
      />
      {loading ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500"><Spinner className="w-3 h-3" /> Searching…</div>
      ) : professors.length === 0 ? (
        <p className="mt-2 text-xs text-gray-400">No matches.</p>
      ) : (
        <ul className="mt-2 border border-gray-200 rounded divide-y divide-gray-100 max-h-80 overflow-y-auto">
          {professors.map(p => {
            const days = daysSince(p.last_evaluation_date);
            const overdue = days != null && days > 180;
            const never = !p.last_evaluation_date;
            return (
              <li key={p.professor_id}>
                <button type="button" onClick={() => onPick(p)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {p.professor_nickname || p.first_name} {p.last_name}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {p.professor_email || '— no email —'}
                    </div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${STATUS_COLORS[p.professor_status_name] || 'bg-gray-100 text-gray-700'}`}>
                    {p.professor_status_name}
                  </span>
                  <span className={`text-[10px] shrink-0 ${never ? 'text-red-600 font-semibold' : overdue ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>
                    {never ? 'Never evaluated' : days != null ? `${days}d ago` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-gray-400">
        Showing Active, Substitute, and Training professors — sorted with the most-overdue evaluations at top.
      </p>
    </div>
  );
}

function ProgramSummary({ p, onChange }) {
  const b = allowedBadge(p.remote_observe_allowed);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-medium text-gray-900 truncate" style={{ maxWidth: '300px' }}>{p.program_nickname}</span>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${b.cls}`}>{b.label}</span>
      <button type="button" onClick={onChange} className="text-gray-400 hover:text-gray-600">change</button>
    </div>
  );
}

function ProgramList({ programs, onPick }) {
  return (
    <ul className="border border-gray-200 rounded divide-y divide-gray-100 max-h-96 overflow-y-auto">
      {programs.map(p => {
        const b = allowedBadge(p.remote_observe_allowed);
        return (
          <li key={p.program_id}>
            <button type="button" onClick={() => onPick(p)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{p.program_nickname}</div>
                <div className="text-[11px] text-gray-500 truncate">
                  {p.location_name || '—'}{p.contractor_name ? ` · ${p.contractor_name}` : ''}
                </div>
              </div>
              <span className="text-[10px] text-gray-500 shrink-0">
                {p.next_3_sessions.length} upcoming
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${b.cls}`}>
                {b.label}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
