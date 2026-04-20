import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime, formatCurrency } from '../lib/utils';

const TABS = [
  { key: 'confirms', label: 'Party Confirms' },
  { key: 'follow_up', label: 'Follow Up' },
  { key: 'charge', label: 'Party Charge' },
];

const CHARGE_TYPES = ['Credit Card', 'Check', 'Stripe Link', 'Cash', 'Venmo', 'Other'];

// Replace template variables with party data
function fillTemplate(template, party) {
  const vars = {
    '{{contact_name}}': party.contact_name || 'there',
    '{{contact_email}}': party.contact_email || '',
    '{{contact_phone}}': party.contact_phone || '',
    '{{party_date}}': party.first_session_date ? formatDate(party.first_session_date) : '',
    '{{party_time}}': party.start_time ? formatTime(party.start_time) : '',
    '{{party_format}}': party.party_format_name || 'Science',
    '{{party_theme}}': party.party_theme || '',
    '{{location}}': party.party_city || party.location_nickname || party.party_location_text || '',
    '{{address}}': [party.party_address, party.party_city, party.party_state, party.party_zip].filter(Boolean).join(', ') || party.address || '',
    '{{lead_professor}}': party.lead_professor_name || '',
    '{{lead_phone}}': party.lead_phone || '',
    '{{program_name}}': party.program_nickname || '',
    '{{duration}}': party.class_length_minutes ? `${party.class_length_minutes} minutes` : '',
    '{{birthday_kid_name}}': party.birthday_kid_name || '',
    '{{birthday_kid_age}}': party.birthday_kid_age ? String(party.birthday_kid_age) : '',
    '{{kids_expected}}': party.kids_expected != null ? String(party.kids_expected) : '',
    '{{total_party_cost}}': party.total_party_cost ? formatCurrency(party.total_party_cost) : '',
    '{{base_party_price}}': party.base_party_price ? formatCurrency(party.base_party_price) : '',
    '{{deposit_amount}}': party.deposit_amount ? formatCurrency(party.deposit_amount) : '',
    '{{deposit_date}}': party.deposit_date ? formatDate(party.deposit_date) : '',
    '{{drive_fee}}': party.drive_fee ? formatCurrency(party.drive_fee) : '',
    '{{remaining_balance}}': (party.total_party_cost && party.deposit_amount)
      ? formatCurrency(Number(party.total_party_cost) - Number(party.deposit_amount))
      : (party.total_party_cost ? formatCurrency(party.total_party_cost) : ''),
    '{{final_charge_date}}': party.final_charge_date ? formatDate(party.final_charge_date) : '',
    '{{final_charge_type}}': party.final_charge_type || '',
  };
  let result = template;
  for (const [key, val] of Object.entries(vars)) result = result.replaceAll(key, val);
  return result;
}

export default function PartyConfirmsPage() {
  const [activeTab, setActiveTab] = useState('confirms');

  return (
    <AppShell>
      <PageHeader title="Party Tools" />
      <div className="px-6 pt-3 flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === t.key ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'confirms' && <ConfirmsTab />}
      {activeTab === 'follow_up' && <FollowUpTab />}
      {activeTab === 'charge' && <ChargeTab />}
    </AppShell>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHARED EMAIL PANEL
// ═══════════════════════════════════════════════════════════════════
function EmailPanel({ party, templates, onClose, onMark, onSend, sending, sendError, markLabel, sendLabel }) {
  const defaultTpl = templates.find(x => x.is_default) || templates[0] || null;
  const [recipientEmail, setRecipientEmail] = useState(party.contact_email || '');
  const [selectedTemplate, setSelectedTemplate] = useState(defaultTpl ? String(defaultTpl.id) : '');
  const [emailSubject, setEmailSubject] = useState(defaultTpl ? fillTemplate(defaultTpl.subject, party) : '');
  const [emailBody, setEmailBody] = useState(defaultTpl ? fillTemplate(defaultTpl.body, party) : '');

  const applyTemplate = (templateId) => {
    setSelectedTemplate(templateId);
    const t = templates.find(x => String(x.id) === templateId);
    if (t) {
      setEmailSubject(fillTemplate(t.subject, party));
      setEmailBody(fillTemplate(t.body, party));
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">{party.program_nickname}</div>
          <div className="text-xs text-gray-500">{formatDate(party.first_session_date)} — {party.contact_name || 'No contact'}</div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex gap-2 items-center">
          <select value={selectedTemplate} onChange={e => applyTemplate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs flex-1">
            <option value="">Select template…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</option>)}
          </select>
          <button type="button" onClick={onMark}
            className="text-xs text-gray-500 border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">
            {markLabel}
          </button>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">To</label>
          <div className="flex items-center gap-1">
            <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            {recipientEmail !== (party.contact_email || '') && party.contact_email && (
              <button type="button" onClick={() => setRecipientEmail(party.contact_email)}
                className="text-[10px] text-gray-400 hover:text-[#1e3a5f] whitespace-nowrap" title={`Reset to ${party.contact_email}`}>
                Reset ({party.contact_email})
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Subject</label>
          <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Body</label>
          <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={8}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] font-mono" />
        </div>
        <div className="text-[10px] text-gray-400">
          Variables: {'{{contact_name}} {{party_date}} {{party_time}} {{party_format}} {{party_theme}} {{location}} {{address}} {{lead_professor}} {{duration}} {{total_party_cost}} {{deposit_amount}} {{remaining_balance}}'}
        </div>

        <div className="flex gap-2">
          <Button onClick={() => onSend({ template_id: selectedTemplate || null, recipient_email: recipientEmail, subject: emailSubject, body: emailBody })}
            disabled={!recipientEmail || sending}>
            {sending ? 'Sending…' : sendLabel}
          </Button>
        </div>
        {sendError && <p className="text-xs text-red-600">{sendError}</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 1: CONFIRMS
// ═══════════════════════════════════════════════════════════════════
function ConfirmsTab() {
  const qc = useQueryClient();
  const [days, setDays] = useState('14');
  const [activeParty, setActiveParty] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['party-unconfirmed', days],
    queryFn: () => api.get('/parties/unconfirmed', { params: { days } }).then(r => r.data),
  });
  const parties = data?.data || [];
  const unconfirmed = parties.filter(p => !p.party_confirmation_sent);
  const confirmed = parties.filter(p => p.party_confirmation_sent);

  const { data: tplData } = useQuery({
    queryKey: ['party-email-templates', 'confirmation'],
    queryFn: () => api.get('/parties/email-templates', { params: { category: 'confirmation' } }).then(r => r.data),
  });
  const templates = tplData?.data || [];

  const markMutation = useMutation({
    mutationFn: (id) => api.post(`/parties/${id}/mark-confirmed`),
    onSuccess: () => { qc.invalidateQueries(['party-unconfirmed']); setActiveParty(null); },
  });
  const sendMutation = useMutation({
    mutationFn: (payload) => api.post(`/parties/${activeParty.id}/send-confirmation`, payload),
    onSuccess: () => { qc.invalidateQueries(['party-unconfirmed']); setActiveParty(null); },
  });

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-red-600 font-medium">{unconfirmed.length} unconfirmed</span>
        <Select value={days} onChange={e => setDays(e.target.value)} className="w-36">
          <option value="7">Next 7 days</option>
          <option value="14">Next 14 days</option>
          <option value="30">Next 30 days</option>
          <option value="60">Next 60 days</option>
        </Select>
      </div>
      {isLoading ? <Spinner className="w-8 h-8" /> : (
        <div className="flex gap-6">
          <div className={`${activeParty ? 'w-[45%]' : 'w-full'} space-y-4`}>
            {unconfirmed.length === 0 && confirmed.length === 0 ? (
              <div className="text-center py-20 text-gray-400 text-sm">No upcoming parties in the next {days} days</div>
            ) : (
              <>
                {unconfirmed.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">Unconfirmed ({unconfirmed.length})</div>
                    <div className="space-y-2">
                      {unconfirmed.map(p => <PartyCard key={p.id} p={p} active={activeParty?.id === p.id} onClick={() => setActiveParty(p)} accent="red" />)}
                    </div>
                  </div>
                )}
                {confirmed.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Confirmed ({confirmed.length})</div>
                    <div className="space-y-1">
                      {confirmed.map(p => (
                        <div key={p.id} className="flex items-center gap-3 px-3 py-1.5 bg-green-50/30 rounded text-xs">
                          <Link to={`/parties/${p.id}`} className="text-[#1e3a5f] hover:underline font-medium">{p.program_nickname}</Link>
                          <span className="text-gray-500">{formatDate(p.first_session_date)}</span>
                          <span className="text-green-600 ml-auto">Sent {p.party_confirmation_sent_at ? formatDate(p.party_confirmation_sent_at) : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {activeParty && (
            <div className="w-[55%] sticky top-4 self-start">
              <EmailPanel key={activeParty.id} party={activeParty} templates={templates}
                onClose={() => setActiveParty(null)}
                onMark={() => markMutation.mutate(activeParty.id)}
                onSend={(payload) => sendMutation.mutate(payload)}
                sending={sendMutation.isPending}
                sendError={sendMutation.error?.response?.data?.error}
                markLabel="Mark confirmed (no email)"
                sendLabel="Send & Confirm" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 2: FOLLOW UP
// ═══════════════════════════════════════════════════════════════════
function FollowUpTab() {
  const qc = useQueryClient();
  const [days, setDays] = useState('14');
  const [activeParty, setActiveParty] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['party-follow-up', days],
    queryFn: () => api.get('/parties/follow-up', { params: { days } }).then(r => r.data),
  });
  const parties = data?.data || [];
  const pending = parties.filter(p => !p.emailed_follow_up);
  const done = parties.filter(p => p.emailed_follow_up);

  const { data: tplData } = useQuery({
    queryKey: ['party-email-templates', 'follow_up'],
    queryFn: () => api.get('/parties/email-templates', { params: { category: 'follow_up' } }).then(r => r.data),
  });
  const templates = tplData?.data || [];

  const markMutation = useMutation({
    mutationFn: (id) => api.post(`/parties/${id}/mark-followed-up`),
    onSuccess: () => { qc.invalidateQueries(['party-follow-up']); setActiveParty(null); },
  });
  const sendMutation = useMutation({
    mutationFn: (payload) => api.post(`/parties/${activeParty.id}/send-follow-up`, payload),
    onSuccess: () => { qc.invalidateQueries(['party-follow-up']); setActiveParty(null); },
  });

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-amber-600 font-medium">{pending.length} pending follow-up</span>
        <Select value={days} onChange={e => setDays(e.target.value)} className="w-36">
          <option value="7">Past 7 days</option>
          <option value="14">Past 14 days</option>
          <option value="30">Past 30 days</option>
          <option value="60">Past 60 days</option>
        </Select>
      </div>
      {isLoading ? <Spinner className="w-8 h-8" /> : (
        <div className="flex gap-6">
          <div className={`${activeParty ? 'w-[45%]' : 'w-full'} space-y-4`}>
            {pending.length === 0 && done.length === 0 ? (
              <div className="text-center py-20 text-gray-400 text-sm">No past parties in the last {days} days</div>
            ) : (
              <>
                {pending.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">Needs Follow-Up ({pending.length})</div>
                    <div className="space-y-2">
                      {pending.map(p => <FollowUpCard key={p.id} p={p} active={activeParty?.id === p.id} onClick={() => setActiveParty(p)} />)}
                    </div>
                  </div>
                )}
                {done.length > 0 && (
                  <div>
                    <button onClick={() => setShowDone(v => !v)} className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1 hover:text-green-700">
                      <span>{showDone ? '▾' : '▸'}</span>
                      <span>Followed Up ({done.length})</span>
                    </button>
                    {showDone && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {done.map(p => {
                          const shortName = (p.contact_name || p.program_nickname || '—').split(' - ').slice(-1)[0];
                          return (
                            <div key={p.id} className="flex items-center gap-2 px-2 py-1 bg-green-50/30 rounded text-[11px] min-w-0">
                              <Link to={`/parties/${p.id}`} className="text-[#1e3a5f] hover:underline font-medium truncate" title={p.program_nickname}>{shortName}</Link>
                              <span className="text-gray-400 shrink-0">{formatDate(p.first_session_date)}</span>
                              <span className="text-green-600 ml-auto shrink-0">{formatDate(p.emailed_follow_up)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          {activeParty && (
            <div className="w-[55%] sticky top-4 self-start">
              <EmailPanel key={activeParty.id} party={activeParty} templates={templates}
                onClose={() => setActiveParty(null)}
                onMark={() => markMutation.mutate(activeParty.id)}
                onSend={(payload) => sendMutation.mutate(payload)}
                sending={sendMutation.isPending}
                sendError={sendMutation.error?.response?.data?.error}
                markLabel="Mark followed up (no email)"
                sendLabel="Send Follow-Up" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 3: PARTY CHARGE
// ═══════════════════════════════════════════════════════════════════
function ChargeTab() {
  const qc = useQueryClient();
  const [days, setDays] = useState('30');
  const [edits, setEdits] = useState({}); // { partyId: { date, type } }
  const [showDone, setShowDone] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['party-charge-pending', days],
    queryFn: () => api.get('/parties/charge-pending', { params: { days } }).then(r => r.data),
  });
  const parties = data?.data || [];
  const pending = parties.filter(p => !p.final_charge_date || !p.final_charge_type);
  const done = parties.filter(p => p.final_charge_date && p.final_charge_type);

  const logMutation = useMutation({
    mutationFn: ({ id, final_charge_date, final_charge_type }) =>
      api.post(`/parties/${id}/log-charge`, { final_charge_date, final_charge_type }),
    onSuccess: () => qc.invalidateQueries(['party-charge-pending']),
    onError: (err) => alert('Save failed: ' + (err?.response?.data?.error || err.message)),
  });

  const setEdit = (id, key, val) => setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: val } }));

  const today = new Date().toISOString().split('T')[0];

  const saveOne = (party) => {
    const e = edits[party.id] || {};
    const date = e.date || today;
    const type = e.type;
    if (!type) return alert('Pick a charge type first');
    logMutation.mutate({ id: party.id, final_charge_date: date, final_charge_type: type });
    setEdits(prev => { const next = { ...prev }; delete next[party.id]; return next; });
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-red-600 font-medium">{pending.length} unrecorded</span>
        <Select value={days} onChange={e => setDays(e.target.value)} className="w-36">
          <option value="14">Past 14 days</option>
          <option value="30">Past 30 days</option>
          <option value="60">Past 60 days</option>
          <option value="90">Past 90 days</option>
        </Select>
      </div>
      {isLoading ? <Spinner className="w-8 h-8" /> : (
        <div className="space-y-4">
          {pending.length === 0 && done.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">No past parties in the last {days} days</div>
          ) : (
            <>
              {pending.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">Needs Charge Logged ({pending.length})</div>
                  <div className="space-y-2">
                    {pending.map(p => (
                      <ChargeCard key={p.id} p={p} edits={edits[p.id] || {}} setEdit={setEdit} today={today}
                        onSave={() => saveOne(p)} saving={logMutation.isPending} />
                    ))}
                  </div>
                </div>
              )}
              {done.length > 0 && (
                <div>
                  <button onClick={() => setShowDone(v => !v)} className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1 hover:text-green-700">
                    <span>{showDone ? '▾' : '▸'}</span>
                    <span>Charge Logged ({done.length})</span>
                  </button>
                  {showDone && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {done.map(p => {
                        const shortName = (p.contact_name || p.program_nickname || '—').split(' - ').slice(-1)[0];
                        return (
                          <div key={p.id} className="flex items-center gap-2 px-2 py-1 bg-green-50/30 rounded text-[11px] min-w-0">
                            <Link to={`/parties/${p.id}`} className="text-[#1e3a5f] hover:underline font-medium truncate" title={p.program_nickname}>{shortName}</Link>
                            <span className="text-gray-400 shrink-0">{formatDate(p.first_session_date)}</span>
                            <span className="text-green-600 ml-auto shrink-0">{p.final_charge_type} {formatDate(p.final_charge_date)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Charge card — same financial breakdown as FollowUpCard, with inline date/type/log inputs
function ChargeCard({ p, edits, setEdit, today, onSave, saving }) {
  const total = Number(p.total_party_cost) || 0;
  const deposit = Number(p.deposit_amount) || 0;
  const owed = total - deposit;
  return (
    <div className="bg-white rounded-lg border border-red-200 p-3">
      <div className="flex items-center justify-between">
        <Link to={`/parties/${p.id}`} className="font-medium text-sm text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
        <span className="text-xs text-gray-500">{formatDate(p.first_session_date)}</span>
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {p.party_format_name} {p.party_theme ? `— ${p.party_theme}` : ''} &bull; {p.start_time ? formatTime(p.start_time) : '—'}
      </div>
      <div className="text-xs text-gray-400 mt-0.5">
        {p.contact_name || 'No contact'}{p.contact_email ? ` — ${p.contact_email}` : ''}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] mt-2 pt-2 border-t border-gray-100">
        <div className="text-gray-500">Kids expected: <strong className="text-gray-700">{p.kids_expected ?? '—'}</strong>{p.total_kids_attended != null ? <span className="text-gray-400"> (attended {p.total_kids_attended})</span> : null}</div>
        <div className="text-gray-500">Total cost: <strong className="text-gray-700">{total ? formatCurrency(total) : '—'}</strong></div>
        <div className="text-gray-500">Deposit: <strong className="text-gray-700">{deposit ? formatCurrency(deposit) : '—'}</strong>{p.deposit_date ? <span className="text-gray-400"> ({formatDate(p.deposit_date)})</span> : null}</div>
        <div className="text-gray-500">Amount owed: <strong className={owed > 0 ? 'text-red-700' : 'text-green-700'}>{formatCurrency(owed)}</strong></div>
      </div>
      {(p.invoice_needed || p.invoice_notes) && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-[11px]">
          {p.invoice_needed ? <span className="inline-block text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium mr-2">Invoice Needed</span> : null}
          {p.invoice_notes && <span className="text-gray-600">📝 {p.invoice_notes}</span>}
        </div>
      )}
      {p.emailed_follow_up && (
        <div className="mt-1 text-[10px] text-amber-600">Followed up {formatDate(p.emailed_follow_up)}</div>
      )}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
        <input type="date" value={edits.date || today} onChange={ev => setEdit(p.id, 'date', ev.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <select value={edits.type || ''} onChange={ev => setEdit(p.id, 'type', ev.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs">
          <option value="">Charge type…</option>
          {CHARGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button size="sm" onClick={onSave} disabled={saving}>Log Charge</Button>
      </div>
    </div>
  );
}

// Follow-up card with payment + invoice info
function FollowUpCard({ p, active, onClick }) {
  const total = Number(p.total_party_cost) || 0;
  const deposit = Number(p.deposit_amount) || 0;
  const owed = total - deposit;
  return (
    <div onClick={onClick}
      className={`bg-white rounded-lg border p-3 cursor-pointer transition-colors ${
        active ? 'border-[#1e3a5f] ring-1 ring-[#1e3a5f]/20' : 'border-amber-200 hover:border-amber-300'
      }`}>
      <div className="flex items-center justify-between">
        <Link to={`/parties/${p.id}`} onClick={e => e.stopPropagation()} className="font-medium text-sm text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
        <span className="text-xs text-gray-500">{formatDate(p.first_session_date)}</span>
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {p.party_format_name} {p.party_theme ? `— ${p.party_theme}` : ''} &bull; {p.start_time ? formatTime(p.start_time) : '—'}
      </div>
      <div className="text-xs text-gray-400 mt-0.5">
        {p.contact_name || 'No contact'}{p.contact_email ? ` — ${p.contact_email}` : ''}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] mt-2 pt-2 border-t border-gray-100">
        <div className="text-gray-500">Kids expected: <strong className="text-gray-700">{p.kids_expected ?? '—'}</strong>{p.total_kids_attended != null ? <span className="text-gray-400"> (attended {p.total_kids_attended})</span> : null}</div>
        <div className="text-gray-500">Total cost: <strong className="text-gray-700">{total ? formatCurrency(total) : '—'}</strong></div>
        <div className="text-gray-500">Deposit: <strong className="text-gray-700">{deposit ? formatCurrency(deposit) : '—'}</strong>{p.deposit_date ? <span className="text-gray-400"> ({formatDate(p.deposit_date)})</span> : null}</div>
        <div className="text-gray-500">Amount owed: <strong className={owed > 0 ? 'text-amber-700' : 'text-green-700'}>{formatCurrency(owed)}</strong></div>
      </div>
      {(p.invoice_needed || p.invoice_notes) && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-[11px]">
          {p.invoice_needed ? <span className="inline-block text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium mr-2">Invoice Needed</span> : null}
          {p.invoice_notes && <span className="text-gray-600">📝 {p.invoice_notes}</span>}
        </div>
      )}
    </div>
  );
}

// Shared party card
function PartyCard({ p, active, onClick, accent }) {
  const borderCls = accent === 'red' ? 'border-red-200 hover:border-red-300'
    : accent === 'amber' ? 'border-amber-200 hover:border-amber-300'
    : 'border-gray-200 hover:border-gray-300';
  return (
    <div onClick={onClick}
      className={`bg-white rounded-lg border p-3 cursor-pointer transition-colors ${
        active ? 'border-[#1e3a5f] ring-1 ring-[#1e3a5f]/20' : borderCls
      }`}>
      <div className="flex items-center justify-between">
        <Link to={`/parties/${p.id}`} onClick={e => e.stopPropagation()} className="font-medium text-sm text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
        <span className="text-xs text-gray-500">{formatDate(p.first_session_date)}</span>
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {p.party_format_name} {p.party_theme ? `— ${p.party_theme}` : ''} &bull; {p.start_time ? formatTime(p.start_time) : '—'}
      </div>
      <div className="text-xs text-gray-400 mt-0.5">
        {p.contact_name || 'No contact'}{p.contact_email ? ` — ${p.contact_email}` : ''}
      </div>
    </div>
  );
}
