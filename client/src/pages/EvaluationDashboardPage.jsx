import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Section } from '../components/ui/Section';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';
import { RatingBadge } from '../components/ui/DevelopmentalRating';

export default function EvaluationDashboardPage() {
  const { user } = useAuth();
  const isAdmin = ['Admin', 'CEO'].includes(user?.role);
  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  const [areaFilter, setAreaFilter] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['eval-dashboard', areaFilter],
    queryFn: () => api.get('/evaluations/dashboard', { params: { area_id: areaFilter || undefined } }).then(r => r.data),
  });

  const professors = data?.data || [];
  const tiers = data?.tiers || [];

  const overdue = professors.filter(p => p.is_overdue);
  const neverEvaled = professors.filter(p => p.never_evaluated && !p.is_overdue);
  const upcoming = professors.filter(p => !p.is_overdue && !p.never_evaluated && p.days_until_due !== null && p.days_until_due <= 30);
  const onTrack = professors.filter(p => !p.is_overdue && !p.never_evaluated && (p.days_until_due === null || p.days_until_due > 30));

  const overdueByArea = {};
  overdue.forEach(p => {
    const area = p.geographic_area_name || 'Unknown';
    if (!overdueByArea[area]) overdueByArea[area] = [];
    overdueByArea[area].push(p);
  });

  return (
    <AppShell>
      <PageHeader title="Evaluation Dashboard" action={
        <div className="flex items-center gap-3">
          <Select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="w-44">
            <option value="">All My Areas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
          </Select>
          {isAdmin && (
            <button type="button" onClick={() => setShowConfig(v => !v)}
              className="text-xs text-gray-500 hover:text-[#1e3a5f] underline">
              {showConfig ? 'Hide Config' : 'Schedule Config'}
            </button>
          )}
        </div>
      } />

      <div className="p-6 space-y-6">
        {showConfig && <EvalConfigPanel tiers={tiers} />}

        <div className="grid grid-cols-4 gap-4">
          <button type="button"
            onClick={() => document.getElementById('section-overdue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            disabled={overdue.length === 0}
            className="bg-red-50 rounded-lg p-4 border border-red-100 text-left hover:border-red-300 hover:shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-red-100 disabled:hover:shadow-none">
            <div className="text-2xl font-bold text-red-600">{overdue.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Overdue</div>
          </button>
          <button type="button"
            onClick={() => document.getElementById('section-never')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            disabled={neverEvaled.length === 0}
            className="bg-amber-50 rounded-lg p-4 border border-amber-100 text-left hover:border-amber-300 hover:shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-amber-100 disabled:hover:shadow-none">
            <div className="text-2xl font-bold text-amber-600">{neverEvaled.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Never Evaluated</div>
          </button>
          <button type="button"
            onClick={() => document.getElementById('section-upcoming')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            disabled={upcoming.length === 0}
            className="bg-blue-50 rounded-lg p-4 border border-blue-100 text-left hover:border-blue-300 hover:shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-blue-100 disabled:hover:shadow-none">
            <div className="text-2xl font-bold text-blue-600">{upcoming.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Due Within 30 Days</div>
          </button>
          <button type="button"
            onClick={() => document.getElementById('section-ontrack')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            disabled={onTrack.length === 0}
            className="bg-green-50 rounded-lg p-4 border border-green-100 text-left hover:border-green-300 hover:shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-green-100 disabled:hover:shadow-none">
            <div className="text-2xl font-bold text-green-600">{onTrack.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">On Track</div>
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            {overdue.length > 0 && (
              <div id="section-overdue" className="scroll-mt-4">
                <Section title={`Overdue Evaluations (${overdue.length})`} defaultOpen={true}>
                  {Object.entries(overdueByArea).map(([area, profs]) => (
                    <div key={area} className="mb-4">
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">{area} ({profs.length})</div>
                      <EvalTable professors={profs} statusCol="overdue" tint="red" />
                    </div>
                  ))}
                </Section>
              </div>
            )}

            {neverEvaled.length > 0 && (
              <div id="section-never" className="scroll-mt-4">
                <Section title={`Never Evaluated (${neverEvaled.length})`} defaultOpen={true}>
                  <EvalTable professors={neverEvaled} statusCol="never" tint="amber" />
                </Section>
              </div>
            )}

            {upcoming.length > 0 && (
              <div id="section-upcoming" className="scroll-mt-4">
                <Section title={`Due Within 30 Days (${upcoming.length})`} defaultOpen={true}>
                  <EvalTable professors={upcoming} statusCol="due" />
                </Section>
              </div>
            )}

            {onTrack.length > 0 && (
              <div id="section-ontrack" className="scroll-mt-4">
                <Section title={`On Track (${onTrack.length})`} defaultOpen={false}>
                  <EvalTable professors={onTrack} statusCol="due" />
                </Section>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

// Reusable table with expandable rows showing next 3 sessions + inline scheduler
function EvalTable({ professors, statusCol, tint }) {
  const [expandedId, setExpandedId] = useState(null);
  const bgHead = tint === 'red' ? 'bg-red-50 border-b border-red-200' : tint === 'amber' ? 'bg-amber-50 border-b border-amber-200' : 'bg-gray-50 border-b border-gray-200';
  const borderCls = tint === 'red' ? 'border-red-200' : tint === 'amber' ? 'border-amber-200' : 'border-gray-200';

  return (
    <div className={`bg-white rounded-lg border ${borderCls} overflow-hidden`}>
      <table className="w-full text-xs table-fixed">
        <colgroup>
          <col style={{ width: '22%' }} /><col style={{ width: '12%' }} /><col style={{ width: '14%' }} />
          <col style={{ width: '10%' }} /><col style={{ width: '12%' }} /><col style={{ width: '14%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>
        <thead className={bgHead}>
          <tr>
            <th className="text-left px-2 py-2 font-medium text-gray-600">Professor</th>
            <th className="text-left px-2 py-2 font-medium text-gray-600">Area</th>
            <th className="text-left px-2 py-2 font-medium text-gray-600">Last Eval</th>
            <th className="text-center px-2 py-2 font-medium text-gray-600">Rating</th>
            <th className="text-left px-2 py-2 font-medium text-gray-600">Tier</th>
            <th className="text-left px-2 py-2 font-medium text-gray-600">First Class</th>
            <th className="text-right px-2 py-2 font-medium text-gray-600">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {professors.map((p, i) => {
            const isExpanded = expandedId === p.id;
            return (
              <FragmentRow key={p.id}>
                <tr className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} ${isExpanded ? '!bg-blue-50/40' : ''} cursor-pointer hover:bg-blue-50/30`}
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                  <td className="px-2 py-1.5 truncate">
                    <span className="text-[10px] text-gray-400 mr-1">{isExpanded ? '▾' : '▸'}</span>
                    <Link to={`/professors/${p.id}`} onClick={e => e.stopPropagation()}
                      className="font-medium text-[#1e3a5f] hover:underline">{p.professor_nickname} {p.last_name}</Link>
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 truncate">{p.geographic_area_name || '—'}</td>
                  <td className="px-2 py-1.5 text-gray-600">{p.last_evaluation_date ? formatDate(p.last_evaluation_date) : 'Never'}</td>
                  <td className="px-2 py-1.5 text-center"><RatingBadge rating={p.current_rating} /></td>
                  <td className="px-2 py-1.5 text-gray-600 truncate">{p.tier_name}</td>
                  <td className="px-2 py-1.5 text-gray-500">{p.first_session_date ? formatDate(p.first_session_date) : p.hire_date ? formatDate(p.hire_date) : '—'}</td>
                  <td className="px-2 py-1.5 text-right font-medium">
                    {p.is_overdue ? <span className="text-red-600">{p.overdue_days}d overdue</span>
                      : p.never_evaluated ? <span className="text-amber-600">{p.days_until_due != null ? `Due in ${p.days_until_due}d` : 'No first class'}</span>
                      : p.days_until_due != null ? <span className={p.days_until_due <= 14 ? 'text-amber-600' : 'text-green-600'}>{p.days_until_due}d</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={7} className="bg-blue-50/20 px-4 py-3">
                      <ExpandedSessions professorId={p.id} professorName={`${p.professor_nickname} ${p.last_name}`} />
                    </td>
                  </tr>
                )}
              </FragmentRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ children }) { return <>{children}</>; }

// ─── Expanded view: next sessions with inline FM/Peer scheduling ────────────
function ExpandedSessions({ professorId, professorName }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['professor-upcoming-sessions', professorId],
    queryFn: () => api.get(`/evaluations/professor/${professorId}/upcoming-sessions?limit=3`).then(r => r.data),
  });
  const sessions = data?.data || [];

  if (isLoading) return <Spinner className="w-4 h-4" />;
  if (sessions.length === 0) return <p className="text-xs text-gray-400">No upcoming sessions scheduled</p>;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-600">Next {sessions.length} upcoming session{sessions.length > 1 ? 's' : ''} — schedule an evaluation:</div>
      {sessions.map(s => (
        <SessionRow key={s.session_id} session={s} professorId={professorId} professorName={professorName} qc={qc} />
      ))}
    </div>
  );
}

// ─── One session row with inline FM/Peer scheduling ───────────────────────
function SessionRow({ session, professorId, professorName, qc }) {
  const [showForm, setShowForm] = useState(false);
  const [evalSubType, setEvalSubType] = useState('fm'); // fm | peer_to_peer
  const [evaluatorId, setEvaluatorId] = useState('');
  const [obsPay, setObsPay] = useState('');
  const [notes, setNotes] = useState('');

  const dateStr = (session.session_date || '').toString().split('T')[0];
  const existing = session.existing_observations || [];
  const hasExisting = existing.length > 0;

  const { data: fmData } = useQuery({
    queryKey: ['fm-users'],
    queryFn: () => api.get('/users?role=Field+Manager&limit=100').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: showForm,
  });
  const fmUsers = fmData?.data || [];

  const { data: profListData } = useQuery({
    queryKey: ['professor-list'],
    queryFn: () => api.get('/professors/list').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: showForm,
  });
  const professorList = profListData?.data || [];

  const addMut = useMutation({
    mutationFn: (data) => api.post(`/evaluations/professor/${professorId}`, data),
    onSuccess: () => {
      qc.invalidateQueries(['professor-upcoming-sessions', professorId]);
      qc.invalidateQueries(['eval-dashboard']);
      setShowForm(false); setEvaluatorId(''); setObsPay(''); setNotes('');
    },
    onError: (e) => alert(e?.response?.data?.error || 'Failed'),
  });

  const handleSchedule = () => {
    const isPeer = evalSubType === 'peer_to_peer';
    addMut.mutate({
      evaluation_date: dateStr,
      evaluation_type: isPeer ? 'peer_to_peer' : 'fm_evaluation',
      evaluator_professor_id: isPeer ? evaluatorId : null,
      evaluator_user_id: !isPeer ? evaluatorId : null,
      program_id: session.program_id,
      form_link: null,
      notes: notes || null,
    });
  };

  return (
    <div className={`bg-white rounded-lg border p-3 ${hasExisting ? 'border-amber-200' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3">
        <div className="w-24 shrink-0">
          <div className="font-medium text-gray-800 text-xs">{formatDate(dateStr)}</div>
          <div className="text-[10px] text-gray-500">{new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</div>
          {session.session_time && <div className="text-[10px] text-gray-400">{formatTime(session.session_time)}</div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/programs/${session.program_id}`} className="font-medium text-[#1e3a5f] hover:underline text-xs">
              {session.program_nickname}
            </Link>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${session.is_lead ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
              {session.is_lead ? 'Lead' : 'Assist'}
            </span>
            {session.class_type_name && <span className="text-[10px] text-gray-500">{session.class_type_name}</span>}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {session.location_nickname || session.party_city || '—'}
            {session.geographic_area_name && <span className="ml-2 text-gray-400">{session.geographic_area_name}</span>}
          </div>
          {session.lesson_name && <div className="text-[10px] text-gray-400">{session.lesson_name}</div>}

          {hasExisting && (
            <div className="mt-2 flex items-center gap-2 flex-wrap bg-amber-50 border border-amber-200 rounded px-2 py-1">
              <span className="text-[10px] font-semibold text-amber-700 uppercase">Already scheduled:</span>
              {existing.map(o => (
                <span key={o.id} className="text-[10px] text-amber-700">
                  {o.observation_type === 'evaluation' ? 'Evaluation' : 'Observation'}
                  {o.evaluator_professor_name ? ` by ${o.evaluator_professor_name}` : ''}
                  {o.evaluator_user_first ? ` by ${o.evaluator_user_first} ${o.evaluator_user_last}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0">
          {!showForm && (
            <button type="button" onClick={() => setShowForm(true)}
              className="text-xs text-[#1e3a5f] hover:underline font-medium">
              + Evaluate
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-500">Type:</span>
            <button type="button" onClick={() => { setEvalSubType('fm'); setEvaluatorId(''); setObsPay('0'); }}
              className={`px-2 py-1 rounded text-[11px] font-medium border ${evalSubType === 'fm' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              FM Evaluation
            </button>
            <button type="button" onClick={() => { setEvalSubType('peer_to_peer'); setEvaluatorId(''); }}
              className={`px-2 py-1 rounded text-[11px] font-medium border ${evalSubType === 'peer_to_peer' ? 'bg-violet-700 text-white border-violet-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              Peer to Peer
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {evalSubType === 'fm' && (
              <select value={evaluatorId} onChange={e => setEvaluatorId(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs w-56">
                <option value="">Select Field Manager…</option>
                {fmUsers.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            )}
            {evalSubType === 'peer_to_peer' && (
              <select value={evaluatorId} onChange={e => setEvaluatorId(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs w-56">
                <option value="">Select observing professor…</option>
                {professorList.filter(p => String(p.id) !== String(professorId)).map(p => (
                  <option key={p.id} value={p.id}>{p.display_name || `${p.professor_nickname} ${p.last_name || ''}`}</option>
                ))}
              </select>
            )}
            <Input placeholder="Notes…" value={notes} onChange={e => setNotes(e.target.value)} className="w-32" />
            <Button size="sm" type="button" onClick={handleSchedule} disabled={addMut.isPending || !evaluatorId}>
              {addMut.isPending ? '…' : 'Schedule'}
            </Button>
            <button type="button" onClick={() => setShowForm(false)} className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin config panel (unchanged) ──────────────────────────────────
function EvalConfigPanel({ tiers: initialTiers }) {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['evaluation-config'],
    queryFn: () => api.get('/evaluations/schedule-config').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const tiers = data?.data || initialTiers || [];

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/evaluations/schedule-config/${id}`, data),
    onSuccess: () => qc.invalidateQueries(['evaluation-config']),
  });

  return (
    <Section title="Evaluation Schedule Config" defaultOpen={true}>
      <p className="text-xs text-gray-500 mb-3">
        Controls how frequently professors need evaluations based on how long they've been on staff.
        Changes apply immediately to all professors.
      </p>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Tier</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Min Days</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Max Days</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Frequency (days)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tiers.map(t => (
              <tr key={t.id}>
                <td className="px-3 py-2">
                  <input defaultValue={t.tier_name}
                    onBlur={e => { if (e.target.value !== t.tier_name) updateMutation.mutate({ id: t.id, data: { tier_name: e.target.value } }); }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs w-full" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" defaultValue={t.min_days_on_staff}
                    onBlur={e => { if (Number(e.target.value) !== t.min_days_on_staff) updateMutation.mutate({ id: t.id, data: { min_days_on_staff: Number(e.target.value) } }); }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs w-20" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" defaultValue={t.max_days_on_staff ?? ''}
                    placeholder="∞"
                    onBlur={e => { updateMutation.mutate({ id: t.id, data: { max_days_on_staff: e.target.value || null } }); }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs w-20" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" defaultValue={t.frequency_days}
                    onBlur={e => { if (Number(e.target.value) !== t.frequency_days) updateMutation.mutate({ id: t.id, data: { frequency_days: Number(e.target.value) } }); }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs w-20 font-medium" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {updateMutation.isSuccess && <p className="text-xs text-green-600 mt-1">Saved</p>}
    </Section>
  );
}
