import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';

// Replace template variables with party data
function fillTemplate(template, party) {
  const vars = {
    '{{contact_name}}': party.contact_name || 'there',
    '{{party_date}}': party.first_session_date ? formatDate(party.first_session_date) : '',
    '{{party_time}}': party.start_time ? formatTime(party.start_time) : '',
    '{{party_format}}': party.party_format_name || 'Science',
    '{{party_theme}}': party.party_theme || '',
    '{{location}}': party.party_location_text || party.location_nickname || '',
    '{{address}}': party.address || '',
    '{{lead_professor}}': party.lead_professor_name || '',
    '{{lead_phone}}': party.lead_phone || '',
    '{{program_name}}': party.program_nickname || '',
    '{{duration}}': party.class_length_minutes ? `${party.class_length_minutes} minutes` : '',
  };
  let result = template;
  for (const [key, val] of Object.entries(vars)) result = result.replaceAll(key, val);
  return result;
}

export default function PartyConfirmsPage() {
  const qc = useQueryClient();
  const [days, setDays] = useState('14');
  const [activeParty, setActiveParty] = useState(null);
  const [emailBody, setEmailBody] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['party-unconfirmed', days],
    queryFn: () => api.get('/parties/unconfirmed', { params: { days } }).then(r => r.data),
  });
  const parties = data?.data || [];
  const unconfirmed = parties.filter(p => !p.party_confirmation_sent);
  const confirmed = parties.filter(p => p.party_confirmation_sent);

  const { data: templateData } = useQuery({
    queryKey: ['party-email-templates'],
    queryFn: () => api.get('/parties/email-templates').then(r => r.data),
  });
  const templates = templateData?.data || [];

  const markMutation = useMutation({
    mutationFn: (id) => api.post(`/parties/${id}/mark-confirmed`),
    onSuccess: () => { qc.invalidateQueries(['party-unconfirmed']); setActiveParty(null); },
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/parties/${activeParty.id}/send-confirmation`, {
      template_id: selectedTemplate || null,
      recipient_email: recipientEmail,
      subject: emailSubject,
      body: emailBody,
    }),
    onSuccess: () => { qc.invalidateQueries(['party-unconfirmed']); setActiveParty(null); },
  });

  const openEmail = (party) => {
    setActiveParty(party);
    setRecipientEmail(party.contact_email || '');
    const defaultTemplate = templates.find(t => t.is_default) || templates[0];
    if (defaultTemplate) {
      setSelectedTemplate(String(defaultTemplate.id));
      setEmailSubject(fillTemplate(defaultTemplate.subject, party));
      setEmailBody(fillTemplate(defaultTemplate.body, party));
    } else {
      setEmailSubject(`Party Confirmation - ${formatDate(party.first_session_date)}`);
      setEmailBody('');
    }
  };

  const applyTemplate = (templateId) => {
    setSelectedTemplate(templateId);
    const t = templates.find(x => String(x.id) === templateId);
    if (t && activeParty) {
      setEmailSubject(fillTemplate(t.subject, activeParty));
      setEmailBody(fillTemplate(t.body, activeParty));
    }
  };

  return (
    <AppShell>
      <PageHeader title="Party Confirms" action={
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-600 font-medium">{unconfirmed.length} unconfirmed</span>
          <Select value={days} onChange={e => setDays(e.target.value)} className="w-36">
            <option value="7">Next 7 days</option>
            <option value="14">Next 14 days</option>
            <option value="30">Next 30 days</option>
            <option value="60">Next 60 days</option>
          </Select>
        </div>
      } />

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <div className="flex gap-6">
            {/* Left: party list */}
            <div className={`${activeParty ? 'w-[45%]' : 'w-full'} space-y-4`}>
              {unconfirmed.length === 0 && confirmed.length === 0 ? (
                <div className="text-center py-20 text-gray-400 text-sm">No upcoming parties in the next {days} days</div>
              ) : (
                <>
                  {unconfirmed.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">Unconfirmed ({unconfirmed.length})</div>
                      <div className="space-y-2">
                        {unconfirmed.map(p => (
                          <div key={p.id} onClick={() => openEmail(p)}
                            className={`bg-white rounded-lg border p-3 cursor-pointer transition-colors ${
                              activeParty?.id === p.id ? 'border-[#1e3a5f] ring-1 ring-[#1e3a5f]/20' : 'border-red-200 hover:border-red-300'
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
                        ))}
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

            {/* Right: email panel */}
            {activeParty && (
              <div className="w-[55%] sticky top-4 self-start">
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{activeParty.program_nickname}</div>
                      <div className="text-xs text-gray-500">{formatDate(activeParty.first_session_date)} — {activeParty.contact_name || 'No contact'}</div>
                    </div>
                    <button onClick={() => setActiveParty(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="flex gap-2 items-center">
                      <select value={selectedTemplate} onChange={e => applyTemplate(e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs flex-1">
                        <option value="">Select template…</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</option>)}
                      </select>
                      <button type="button" onClick={() => markMutation.mutate(activeParty.id)}
                        disabled={markMutation.isPending}
                        className="text-xs text-gray-500 border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">
                        Mark confirmed (no email)
                      </button>
                    </div>

                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">To</label>
                      <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
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
                      Variables: {'{{contact_name}} {{party_date}} {{party_time}} {{party_format}} {{party_theme}} {{location}} {{address}} {{lead_professor}} {{duration}}'}
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={() => sendMutation.mutate()} disabled={!recipientEmail || sendMutation.isPending}>
                        {sendMutation.isPending ? 'Sending…' : 'Send & Confirm'}
                      </Button>
                    </div>
                    {sendMutation.isError && <p className="text-xs text-red-600">{sendMutation.error?.response?.data?.error || 'Failed to send'}</p>}
                    {sendMutation.isSuccess && <p className="text-xs text-green-600">Sent!</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
