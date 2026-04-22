import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { Section } from '../components/ui/Section';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import { Input } from '../components/ui/Input';
import { formatDate, formatTime, formatPhone, formatCurrency } from '../lib/utils';

const DECLINE_REASONS = [
  'Already filled by another professor',
  'Not qualified for this class',
  'Distance / travel concern',
  'Performance / reliability concern',
  'Scheduling conflict',
  'Other',
];

function daysAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function SubNeedCard({ need, onFindSub }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-[#1e3a5f]/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/programs/${need.program_id}`} className="font-medium text-[#1e3a5f] hover:underline text-sm">
              {need.program_nickname}
            </Link>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
              need.role_needing_sub === 'Lead' ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'bg-gray-100 text-gray-600'
            }`}>{need.role_needing_sub}</span>
            <Badge status={need.class_status_name} />
          </div>
          <div className="mt-1.5 flex items-center gap-4 text-xs text-gray-500">
            <span>{need.session_time ? formatTime(need.session_time) : formatTime(need.start_time)}</span>
            {need.class_length_minutes && <span>{need.class_length_minutes} min</span>}
            <Link to={`/locations/${need.location_id}`} className="text-[#1e3a5f] hover:underline">
              {need.location_nickname || need.school_name}
            </Link>
          </div>
          {need.address && <div className="text-xs text-gray-400 mt-0.5">{need.address}</div>}
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            <span className="text-gray-500">
              Out: <Link to={`/professors/${need.off_professor_id}`} className="text-[#1e3a5f] hover:underline font-medium">{need.off_professor_name} {need.off_professor_last}</Link>
            </span>
            {need.reason_name && <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{need.reason_name}</span>}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
            {need.virtus_required ? <span className="bg-purple-50 text-purple-600 px-1 py-0.5 rounded">Virtus</span> : null}
            {need.livescan_required ? <span className="bg-blue-50 text-blue-600 px-1 py-0.5 rounded">Livescan</span> : null}
            {need.tb_required ? <span className="bg-amber-50 text-amber-600 px-1 py-0.5 rounded">TB</span> : null}
          </div>
        </div>
        <Button size="sm" onClick={() => onFindSub(need)}>Find Sub</Button>
      </div>
    </div>
  );
}

function ProfessorRow({ prof, need, onAssign, onAsk, priorAsk, isPending }) {
  const flags = [];
  if (prof.has_day_off) flags.push({ label: 'Requested Off', color: 'bg-red-100 text-red-700' });
  if (prof.already_working) flags.push({ label: 'Working', color: 'bg-amber-100 text-amber-700' });
  if (!prof.generally_available) flags.push({ label: 'Not Avail', color: 'bg-gray-100 text-gray-600' });
  if (!prof.in_target_area) flags.push({ label: 'Other Area', color: 'bg-blue-100 text-blue-600' });
  if (need?.virtus_required && !prof.virtus) flags.push({ label: 'No Virtus', color: 'bg-purple-100 text-purple-600' });
  if (need?.livescan_required) flags.push({ label: 'Check LS', color: 'bg-blue-50 text-blue-500' });

  const isIdeal = !prof.has_day_off && !prof.already_working && prof.generally_available && prof.in_target_area;

  // Prior ask state: show colored badge if already asked for this sub
  const askTint = priorAsk?.response === 'declined' ? 'bg-red-100 text-red-700'
    : priorAsk?.response === 'accepted' ? 'bg-green-100 text-green-700'
    : priorAsk ? 'bg-amber-100 text-amber-700' : null;

  return (
    <tr className={`${prof.has_day_off ? 'opacity-40' : ''} ${isIdeal && !priorAsk ? 'bg-green-50/30' : ''} ${priorAsk?.response === 'declined' ? 'bg-red-50/20' : ''}`}>
      <td className="px-3 py-2">
        <Link to={`/professors/${prof.id}`} className="font-medium text-[#1e3a5f] hover:underline text-sm">
          {prof.professor_nickname} {prof.last_name}
        </Link>
        <div className="text-[10px] text-gray-400">{prof.professor_status_name}</div>
      </td>
      <td className="px-3 py-2 text-xs text-gray-600">{prof.geographic_area_name || '—'}</td>
      <td className="px-3 py-2 text-xs text-gray-500">{formatPhone(prof.phone_number)}</td>
      <td className="px-3 py-2 text-xs text-gray-500">{prof.email || '—'}</td>
      <td className="px-3 py-2">
        {prof.generally_available ? (
          <span className="text-green-600 text-xs">{prof.availability_times}</span>
        ) : (
          <span className="text-gray-400 text-xs">Not set</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {priorAsk && (
            <span className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium ${askTint}`}
              title={`Asked via ${priorAsk.method} ${daysAgo(priorAsk.asked_at)}${priorAsk.response !== 'pending' ? ` — ${priorAsk.response}` : ''}`}>
              {priorAsk.method} {daysAgo(priorAsk.asked_at)}
            </span>
          )}
          {flags.map((f, i) => (
            <span key={i} className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium ${f.color}`}>{f.label}</span>
          ))}
          {flags.length === 0 && !priorAsk && <span className="text-[10px] text-green-600 font-medium">Available</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          {onAsk && <button onClick={() => onAsk(prof)} className="text-xs text-amber-600 hover:underline font-medium">Ask</button>}
          {!prof.has_day_off && (
            <button onClick={() => onAssign(prof)} disabled={isPending}
              className="text-xs text-[#1e3a5f] hover:underline font-medium disabled:opacity-40">
              Assign
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Outreach tracking panel ──────────────────────────────────
function OutreachPanel({ sessionId, onRequestAsk }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['outreach', sessionId],
    queryFn: () => api.get('/sub-management/outreach', { params: { session_id: sessionId } }).then(r => r.data),
    enabled: !!sessionId,
  });
  const entries = data?.data || [];

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/sub-management/outreach/${id}`, body),
    onSuccess: () => qc.invalidateQueries(['outreach', sessionId]),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/sub-management/outreach/${id}`),
    onSuccess: () => qc.invalidateQueries(['outreach', sessionId]),
  });

  const METHOD_ICON = { email: '✉', sms: '💬', phone: '☎', manual_note: '📝' };
  const RESPONSES = [
    { value: 'pending', label: 'Pending', cls: 'bg-gray-100 text-gray-600' },
    { value: 'accepted', label: 'Accepted', cls: 'bg-green-100 text-green-700' },
    { value: 'declined', label: 'Declined', cls: 'bg-red-100 text-red-700' },
    { value: 'no_response', label: 'No Response', cls: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <div className="border-t border-gray-200">
      <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">Outreach History ({entries.length})</span>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner className="w-4 h-4" /></div>
      ) : entries.length === 0 ? (
        <div className="px-4 py-3 text-xs text-gray-400">No one asked yet. Click "Ask" on a professor above to log outreach.</div>
      ) : (
        <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {entries.map(o => {
            const respCfg = RESPONSES.find(r => r.value === o.response) || RESPONSES[0];
            return (
              <div key={o.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                <span className="w-6 shrink-0 text-center">{METHOD_ICON[o.method] || '•'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link to={`/professors/${o.professor_id}`} className="font-medium text-[#1e3a5f] hover:underline">{o.professor_nickname} {o.professor_last}</Link>
                    <span className="text-gray-400">{o.method}</span>
                    <span className="text-gray-400">{daysAgo(o.asked_at)}</span>
                    {o.asked_by_first && <span className="text-gray-400">by {o.asked_by_first}</span>}
                  </div>
                  {o.message_preview && <div className="text-gray-500 truncate">{o.message_preview}</div>}
                  {o.decline_reason && <div className="text-red-600">Decline reason: {o.decline_reason}</div>}
                  {o.notes && <div className="text-gray-400 italic">{o.notes}</div>}
                </div>
                <select value={o.response} onChange={e => {
                  const newResp = e.target.value;
                  if (newResp === 'declined') {
                    const reason = prompt('Decline reason?');
                    if (!reason) return;
                    updateMut.mutate({ id: o.id, response: newResp, decline_reason: reason });
                  } else {
                    updateMut.mutate({ id: o.id, response: newResp });
                  }
                }}
                  className={`text-[10px] rounded px-1.5 py-0.5 border-0 font-medium ${respCfg.cls}`}>
                  {RESPONSES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button onClick={() => { if (confirm('Remove this outreach log?')) deleteMut.mutate(o.id); }}
                  className="text-gray-300 hover:text-red-500">&times;</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Ask Modal ────────────────────────────────────────────────
function AskModal({ professor, sessionId, need, onClose }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState('sms');
  const [message, setMessage] = useState(
    `Hi ${professor.professor_nickname} - are you available to sub on ${formatDate((need?.date_requested || '').split('T')[0])} at ${formatTime(need?.session_time || need?.start_time || '')} for ${need?.program_nickname || 'a class'}? Reply YES if interested.`
  );
  const [notes, setNotes] = useState('');
  const [sendSms, setSendSms] = useState(true);

  const createMut = useMutation({
    mutationFn: () => api.post('/sub-management/outreach', {
      session_id: sessionId,
      professor_id: professor.id,
      method,
      message_preview: method === 'manual_note' ? null : message.slice(0, 500),
      notes: notes || null,
      send_sms: method === 'sms' && sendSms,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['outreach', sessionId]);
      qc.invalidateQueries(['outreach-all', sessionId]);
      onClose();
    },
    onError: (e) => alert(e?.response?.data?.error || 'Failed to log outreach'),
  });

  return (
    <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Ask {professor.professor_nickname} {professor.last_name}</h3>
        <p className="text-xs text-gray-500 mb-3">{formatPhone(professor.phone_number)} · {professor.email || 'no email'}</p>

        <div className="flex gap-1 mb-3">
          {[
            { value: 'sms', label: 'SMS', icon: '💬' },
            { value: 'email', label: 'Email (log only)', icon: '✉' },
            { value: 'phone', label: 'Phone (log call)', icon: '☎' },
            { value: 'manual_note', label: 'Note', icon: '📝' },
          ].map(m => (
            <button key={m.value} onClick={() => setMethod(m.value)}
              className={`px-2.5 py-1 text-xs rounded font-medium ${method === m.value ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {method !== 'manual_note' && (
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-700 block mb-1">Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
              className="block w-full rounded border border-gray-300 text-sm px-3 py-2 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            <p className="text-[10px] text-gray-400 mt-1">{message.length} chars</p>
          </div>
        )}

        <div className="mb-3">
          <label className="text-xs font-medium text-gray-700 block mb-1">Internal notes (optional)</label>
          <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Left voicemail, follow up tomorrow" />
        </div>

        {method === 'sms' && (
          <label className="flex items-center gap-2 cursor-pointer text-xs mb-3">
            <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} />
            <span>Send SMS via Twilio now {!sendSms && <span className="text-gray-400">(just log, don't send)</span>}</span>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
          <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? 'Saving…' : (method === 'sms' && sendSms ? 'Send & Log' : 'Log Ask')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SubManagementPage() {
  const [tab, setTab] = useState('needs'); // 'needs' | 'claimed'

  return (
    <AppShell>
      <PageHeader title="Sub Management" />
      <div className="px-6 pt-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-4">
          {[['needs', 'Sub Needs'], ['claimed', 'Claimed Subs']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === key ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{label}</button>
          ))}
        </div>
      </div>
      {tab === 'needs' ? <SubNeedsPanel /> : <ClaimedSubsPanel />}
    </AppShell>
  );
}

function ClaimedSubsPanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [filter, setFilter] = useState('all'); // 'all' | 'mine'
  const [rejecting, setRejecting] = useState(null); // { claim_id, professor_name } | null
  const [rejectReason, setRejectReason] = useState('');
  const [rejectPreset, setRejectPreset] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['claimed-subs', filter === 'mine' ? user?.id : null],
    queryFn: () => api.get('/sub-management/claimed', {
      params: { status: 'pending', ...(filter === 'mine' ? { scheduler_id: user?.id } : {}) }
    }).then(r => r.data),
  });
  const claims = data?.data || [];

  const approveMutation = useMutation({
    mutationFn: (claim_id) => api.post('/sub-management/claimed/approve', { claim_id }),
    onSuccess: () => qc.invalidateQueries(['claimed-subs']),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ claim_id, reason }) => api.post('/sub-management/claimed/reject', { claim_id, reason }),
    onSuccess: () => { qc.invalidateQueries(['claimed-subs']); setRejecting(null); setRejectReason(''); setRejectPreset(''); },
    onError: (e) => alert(e?.response?.data?.error || 'Reject failed'),
  });

  const handleSubmitReject = () => {
    const reason = rejectPreset === 'Other' ? rejectReason.trim() : (rejectPreset || rejectReason.trim());
    if (!reason) return alert('Please choose or enter a reason');
    rejectMutation.mutate({ claim_id: rejecting.claim_id, reason });
  };

  return (
    <div className="px-6 pb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {[['all', 'All Claimed'], ['mine', 'My Areas']].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === key ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{label}</button>
          ))}
        </div>
        <span className="text-sm text-gray-400">{claims.length} pending claim{claims.length !== 1 ? 's' : ''}</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
      ) : claims.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-lg mb-1">No pending claims</div>
          <div className="text-sm">Professors haven't claimed any substitute sessions yet</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Claimed By</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Role</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Area</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Expected Pay</th>
                <th className="w-40 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.map(c => {
                const dateStr = (c.session_date || '').split('T')[0];
                return (
                  <tr key={c.claim_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs">
                      {formatDate(dateStr)}
                      <div className="text-gray-400">{new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/programs/${c.program_id}`} className="font-medium text-[#1e3a5f] hover:underline text-sm">
                        {c.program_nickname}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{formatTime(c.session_time || c.start_time)}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{c.location_nickname || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-sm">{c.professor_nickname} {c.professor_last}</span>
                      {c.professor_phone && <div className="text-[10px] text-gray-400">{formatPhone(c.professor_phone)}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        c.role === 'Lead' ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'bg-gray-100 text-gray-600'
                      }`}>{c.role}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{c.geographic_area_name || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium text-green-700 text-sm">
                      {c.expected_pay ? formatCurrency(c.expected_pay) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => approveMutation.mutate(c.claim_id)}
                          disabled={approveMutation.isPending}
                          className="px-2.5 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-50">
                          Approve
                        </button>
                        <button onClick={() => { setRejecting({ claim_id: c.claim_id, professor_name: `${c.professor_nickname} ${c.professor_last}` }); setRejectPreset(''); setRejectReason(''); }}
                          className="text-xs text-gray-400 hover:text-red-500">
                          Decline
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject reason modal */}
      {rejecting && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center p-4" onClick={() => setRejecting(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Decline claim from {rejecting.professor_name}</h3>
            <p className="text-xs text-gray-500 mb-3">The professor will see this reason in their dashboard.</p>
            <div className="space-y-2 mb-3">
              {DECLINE_REASONS.map(r => (
                <label key={r} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                  <input type="radio" checked={rejectPreset === r} onChange={() => { setRejectPreset(r); if (r !== 'Other') setRejectReason(''); }}
                    className="text-[#1e3a5f]" />
                  <span className="text-sm text-gray-700">{r}</span>
                </label>
              ))}
            </div>
            {(rejectPreset === 'Other' || rejectPreset === '') && (
              <Input placeholder="Explain (required)…" value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="mb-3" />
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejecting(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
              <Button variant="danger" size="sm" onClick={handleSubmitReject} disabled={rejectMutation.isPending}>
                {rejectMutation.isPending ? 'Declining…' : 'Decline Claim'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubNeedsPanel() {
  const qc = useQueryClient();
  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const [days, setDays] = useState('14');
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [activeSub, setActiveSub] = useState(null); // the sub need we're finding a prof for
  const [searchAreas, setSearchAreas] = useState([]); // areas to search for available profs
  const [showAll, setShowAll] = useState(false);
  const [askingProf, setAskingProf] = useState(null); // professor being asked via modal

  const needsFilters = {
    days,
    areas: selectedAreas.length ? selectedAreas.join(',') : undefined,
  };

  const { data: needsData, isLoading } = useQuery({
    queryKey: ['sub-needs', needsFilters],
    queryFn: () => api.get('/sub-management/needs', { params: needsFilters }).then(r => r.data),
  });
  const needs = needsData?.data || [];

  // Group needs by date
  const groupedNeeds = useMemo(() => {
    const groups = {};
    needs.forEach(n => {
      const dateStr = (n.date_requested || '').split('T')[0];
      if (!groups[dateStr]) groups[dateStr] = { date: dateStr, items: [] };
      groups[dateStr].items.push(n);
    });
    return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
  }, [needs]);

  // Available professors query (only when finding a sub)
  const profFilters = activeSub ? {
    date: (activeSub.date_requested || '').split('T')[0],
    area_id: activeSub.area_id || undefined,
    search_areas: searchAreas.length ? searchAreas.join(',') : (activeSub.area_id ? String(activeSub.area_id) : undefined),
    show_all: showAll ? 'true' : undefined,
  } : null;

  const { data: profsData, isLoading: profsLoading } = useQuery({
    queryKey: ['sub-available-profs', profFilters],
    queryFn: () => api.get('/sub-management/available-professors', { params: profFilters }).then(r => r.data),
    enabled: !!activeSub,
  });
  const professors = profsData?.data || [];

  // Outreach history for the active sub need — keyed by professor_id for quick row lookup
  const { data: outreachData } = useQuery({
    queryKey: ['outreach-all', activeSub?.session_id],
    queryFn: () => api.get('/sub-management/outreach', { params: { session_id: activeSub.session_id } }).then(r => r.data),
    enabled: !!activeSub,
  });
  const priorAskMap = useMemo(() => {
    const map = {};
    (outreachData?.data || []).forEach(o => {
      // Keep most recent per professor
      if (!map[o.professor_id] || new Date(o.asked_at) > new Date(map[o.professor_id].asked_at)) {
        map[o.professor_id] = o;
      }
    });
    return map;
  }, [outreachData]);

  const assignMutation = useMutation({
    mutationFn: ({ session_id, professor_id, role }) =>
      api.post('/sub-management/assign', { session_id, professor_id, role }),
    onSuccess: () => {
      qc.invalidateQueries(['sub-needs']);
      qc.invalidateQueries(['sub-available-profs']);
      setActiveSub(null);
    },
  });

  const handleFindSub = (need) => {
    setActiveSub(need);
    setSearchAreas(need.area_id ? [need.area_id] : []);
    setShowAll(false);
  };

  const handleAssign = (prof) => {
    if (!activeSub) return;
    if (confirm(`Assign ${prof.professor_nickname} ${prof.last_name} as ${activeSub.role_needing_sub} sub for ${activeSub.program_nickname} on ${formatDate((activeSub.date_requested || '').split('T')[0])}?`)) {
      assignMutation.mutate({
        session_id: activeSub.session_id,
        professor_id: prof.id,
        role: activeSub.role_needing_sub,
      });
    }
  };

  const toggleArea = (id) => {
    setSelectedAreas(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const toggleSearchArea = (id, multi) => {
    if (multi) {
      // Ctrl/Cmd+Click → toggle in/out of the current selection
      setSearchAreas(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
    } else {
      // Plain click → select only this one (replace)
      setSearchAreas(prev => (prev.length === 1 && prev[0] === id) ? [] : [id]);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <>
      <div className="px-6 flex items-center gap-3 mb-2">
        <span className="text-sm text-gray-500">{needs.length} session{needs.length !== 1 ? 's' : ''} needing subs</span>
        <Select value={days} onChange={e => setDays(e.target.value)} className="w-36">
          <option value="7">Next 7 days</option>
          <option value="14">Next 14 days</option>
          <option value="30">Next 30 days</option>
          <option value="60">Next 60 days</option>
          <option value="90">Next 90 days</option>
        </Select>
      </div>

      <div className="px-6 pb-6">
        {/* Area filter chips */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className="text-xs text-gray-500 py-1 mr-1">Areas:</span>
          {selectedAreas.length > 0 && (
            <button onClick={() => setSelectedAreas([])}
              className="text-[10px] text-gray-400 hover:text-gray-600 underline py-1 mr-1">Clear</button>
          )}
          {(ref.areas || []).map(a => (
            <button key={a.id} onClick={() => toggleArea(a.id)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                selectedAreas.includes(a.id)
                  ? 'bg-[#1e3a5f] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{a.geographic_area_name}</button>
          ))}
        </div>

        <div className="flex gap-6">
          {/* Left: Needs list */}
          <div className={`${activeSub ? 'w-[45%]' : 'w-full'} space-y-4 transition-all`}>
            {isLoading ? (
              <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
            ) : needs.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="text-lg mb-1">No subs needed</div>
                <div className="text-sm">All sessions in the next {days} days are covered</div>
              </div>
            ) : (
              groupedNeeds.map(group => {
                const dow = new Date(group.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
                const isToday = group.date === today;
                return (
                  <div key={group.date}>
                    <div className={`text-sm font-semibold mb-2 flex items-center gap-2 ${isToday ? 'text-blue-700' : 'text-gray-700'}`}>
                      {dow}, {formatDate(group.date)}
                      {isToday && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">TODAY</span>}
                      <span className="text-xs font-normal text-gray-400">({group.items.length} session{group.items.length !== 1 ? 's' : ''})</span>
                    </div>
                    <div className="space-y-2">
                      {group.items.map(n => (
                        <SubNeedCard key={`${n.day_off_id}-${n.session_id}`} need={n}
                          onFindSub={handleFindSub} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Professor finder panel */}
          {activeSub && (
            <div className="w-[55%] sticky top-0 self-start">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Find Sub — {formatDate((activeSub.date_requested || '').split('T')[0])}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {activeSub.program_nickname} &bull; {activeSub.role_needing_sub} &bull; {formatTime(activeSub.session_time || activeSub.start_time)}
                        {activeSub.location_nickname && ` &bull; ${activeSub.location_nickname}`}
                      </div>
                    </div>
                    <button onClick={() => setActiveSub(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
                  </div>

                  {/* Search area chips */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-[10px] text-gray-400 py-0.5 mr-1">Search in:</span>
                    {(ref.areas || []).map(a => (
                      <button key={a.id} onClick={e => toggleSearchArea(a.id, e.ctrlKey || e.metaKey)}
                        title="Click to select one area · Ctrl/Cmd+Click to select multiple"
                        className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                          searchAreas.includes(a.id)
                            ? 'bg-[#1e3a5f] text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>{a.geographic_area_name}</button>
                    ))}
                    <label className="flex items-center gap-1 ml-2 text-[10px] text-gray-500 cursor-pointer">
                      <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}
                        className="w-3 h-3 rounded border-gray-300" />
                      All areas
                    </label>
                  </div>
                  <div className="text-[9px] text-gray-400 mt-1 italic">Tip: Ctrl+Click (Cmd on Mac) to search multiple areas at once.</div>
                </div>

                {/* Professor table */}
                <div className="max-h-[600px] overflow-y-auto">
                  {profsLoading ? (
                    <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
                  ) : professors.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">No professors found in selected areas</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Area</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Phone</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Email</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Avail</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Flags</th>
                          <th className="w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {professors.map(p => (
                          <ProfessorRow key={p.id} prof={p} need={activeSub}
                            priorAsk={priorAskMap[p.id]}
                            onAssign={handleAssign}
                            onAsk={(prof) => setAskingProf(prof)}
                            isPending={assignMutation.isPending} />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Outreach history panel */}
                <OutreachPanel sessionId={activeSub.session_id} />

                {assignMutation.isError && (
                  <div className="px-4 py-2 text-sm text-red-600 border-t">{assignMutation.error?.response?.data?.error || 'Assignment failed'}</div>
                )}
                {assignMutation.isSuccess && (
                  <div className="px-4 py-2 text-sm text-green-600 border-t">Sub assigned!</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {askingProf && activeSub && (
        <AskModal professor={askingProf} sessionId={activeSub.session_id} need={activeSub}
          onClose={() => setAskingProf(null)} />
      )}
    </>
  );
}
