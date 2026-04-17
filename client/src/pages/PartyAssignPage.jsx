import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime, formatCurrency } from '../lib/utils';

const FORMAT_BADGE = {
  show: 'bg-pink-100 text-pink-700',
  party: 'bg-pink-100 text-pink-700',
  event: 'bg-purple-100 text-purple-700',
  booth: 'bg-blue-100 text-blue-700',
  workshop: 'bg-amber-100 text-amber-700',
};

const STATUS_STYLE = {
  Unassigned: 'bg-red-100 text-red-700',
  Declined: 'bg-red-100 text-red-700',
  Confirmed: 'bg-green-100 text-green-700',
  'Assigned - Pending Confirmation': 'bg-amber-100 text-amber-700',
};

function getFormatBadge(name) {
  const key = (name || '').toLowerCase();
  for (const [k, v] of Object.entries(FORMAT_BADGE)) {
    if (key.includes(k)) return v;
  }
  return 'bg-gray-100 text-gray-600';
}

export default function PartyAssignPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('assign'); // 'assign' | 'responses'
  const [filter, setFilter] = useState('unassigned'); // 'unassigned' | 'all'
  const [selected, setSelected] = useState(new Set());
  const [actionMode, setActionMode] = useState(null); // 'ask' | 'assign'
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [showEmailPanel, setShowEmailPanel] = useState(false);

  const { data: partyData, isLoading } = useQuery({
    queryKey: ['party-assign-unassigned'],
    queryFn: () => api.get('/party-assign/unassigned').then(r => r.data),
  });
  const allParties = partyData?.data || [];
  const parties = filter === 'unassigned'
    ? allParties.filter(p => !p.lead_professor_id)
    : allParties;

  const selectedParty = allParties.find(p => p.id === selectedId);

  const { data: profData, isLoading: profsLoading } = useQuery({
    queryKey: ['party-assign-profs', selectedId],
    queryFn: () => api.get(`/party-assign/${selectedId}/available-professors`).then(r => r.data),
    enabled: !!selectedId,
  });
  const professors = profData?.data || [];

  const { data: askData } = useQuery({
    queryKey: ['party-assign-asks', selectedId],
    queryFn: () => api.get(`/party-assign/${selectedId}/asks`).then(r => r.data),
    enabled: !!selectedId,
  });
  const asks = askData?.data || [];

  const { data: respData } = useQuery({
    queryKey: ['party-assign-responses'],
    queryFn: () => api.get('/party-assign/responses/dashboard').then(r => r.data),
    enabled: tab === 'responses',
  });

  const defaultAction = selectedParty?.days_until > 14 ? 'ask' : 'assign';

  const askMutation = useMutation({
    mutationFn: (data) => api.post(`/party-assign/${selectedId}/ask`, data),
    onSuccess: () => {
      qc.invalidateQueries(['party-assign-unassigned']);
      qc.invalidateQueries(['party-assign-profs', selectedId]);
      qc.invalidateQueries(['party-assign-asks', selectedId]);
      setSelected(new Set());
      setShowEmailPanel(false);
    },
  });

  const assignMutation = useMutation({
    mutationFn: (data) => api.post(`/party-assign/${selectedId}/assign`, data),
    onSuccess: () => {
      qc.invalidateQueries(['party-assign-unassigned']);
      qc.invalidateQueries(['party-assign-profs', selectedId]);
      qc.invalidateQueries(['party-assign-asks', selectedId]);
      setSelected(new Set());
      setShowEmailPanel(false);
    },
  });

  const forceConfirmMutation = useMutation({
    mutationFn: ({ partyId, professor_id }) => api.post(`/party-assign/${partyId}/force-confirm`, { professor_id }),
    onSuccess: () => {
      qc.invalidateQueries(['party-assign-unassigned']);
      qc.invalidateQueries(['party-assign-responses']);
    },
  });

  const toggleProf = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openEmailPanel = (mode) => {
    setActionMode(mode);
    const p = selectedParty;
    if (mode === 'ask') {
      setEmailSubject(`Party Opportunity — ${formatDate(p?.first_session_date)} ${p?.party_format_name || ''}`);
      setEmailBody(`Hi,\n\nWe have a ${p?.party_format_name || 'party'} on ${formatDate(p?.first_session_date)} at ${formatTime(p?.start_time)}.\n\nLocation: ${p?.location_nickname || p?.party_location_text || ''}\nTheme: ${p?.party_theme || ''}\nKids expected: ${p?.total_kids_attended || 'TBD'}\nPay: ${p?.lead_professor_pay ? formatCurrency(p.lead_professor_pay) : 'TBD'}\n\nAre you available and interested? Please let us know!\n\nThank you`);
    } else {
      setEmailSubject(`Party Assignment — ${formatDate(p?.first_session_date)} ${p?.party_format_name || ''}`);
      setEmailBody(`Hi,\n\nYou have been assigned to a ${p?.party_format_name || 'party'} on ${formatDate(p?.first_session_date)} at ${formatTime(p?.start_time)}.\n\nLocation: ${p?.location_nickname || p?.party_location_text || ''}\nTheme: ${p?.party_theme || ''}\nKids expected: ${p?.total_kids_attended || 'TBD'}\nPay: ${p?.lead_professor_pay ? formatCurrency(p.lead_professor_pay) : 'TBD'}\n\nThis party has been added to your schedule. Please log in to your portal to confirm or decline.\n\nThank you`);
    }
    setShowEmailPanel(true);
  };

  const handleSend = () => {
    const profIds = [...selected];
    if (actionMode === 'ask') {
      askMutation.mutate({ professor_ids: profIds, send_email: true, email_subject: emailSubject, email_body: emailBody });
    } else {
      assignMutation.mutate({ professor_id: profIds[0], send_email: true, email_subject: emailSubject, email_body: emailBody });
    }
  };

  return (
    <AppShell>
      <PageHeader title="Party Assignment" action={
        <div className="flex items-center gap-2">
          <button onClick={() => setTab('assign')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tab === 'assign' ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600'}`}>Assign</button>
          <button onClick={() => setTab('responses')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tab === 'responses' ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600'}`}>Responses</button>
        </div>
      } />

      {tab === 'responses' ? (
        <ResponsesDashboard data={respData?.data} forceConfirm={forceConfirmMutation} />
      ) : (
        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
          ) : (
            <div className="flex gap-6">
              {/* Left panel — Party Queue */}
              <div className={`${selectedId ? 'w-[40%]' : 'w-full'} space-y-2`}>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => setFilter('unassigned')} className={`text-xs px-2 py-1 rounded ${filter === 'unassigned' ? 'bg-red-100 text-red-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
                    Unassigned ({allParties.filter(p => !p.lead_professor_id).length})
                  </button>
                  <button onClick={() => setFilter('all')} className={`text-xs px-2 py-1 rounded ${filter === 'all' ? 'bg-gray-200 text-gray-800 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
                    All Upcoming ({allParties.length})
                  </button>
                </div>

                {parties.length === 0 ? (
                  <div className="text-center py-16 text-gray-400 text-sm">No parties to show</div>
                ) : parties.map(p => (
                  <div key={p.id} onClick={() => { setSelectedId(p.id); setSelected(new Set()); setShowEmailPanel(false); }}
                    className={`bg-white rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedId === p.id ? 'border-[#1e3a5f] ring-1 ring-[#1e3a5f]/20' :
                      p.days_until <= 14 && !p.lead_professor_id ? 'border-red-300 hover:border-red-400' :
                      'border-gray-200 hover:border-gray-300'
                    }`}>
                    <div className="flex items-center justify-between mb-1">
                      <Link to={`/parties/${p.id}`} onClick={e => e.stopPropagation()} className="font-medium text-sm text-[#1e3a5f] hover:underline truncate">{p.program_nickname}</Link>
                      <span className="text-xs text-gray-500 whitespace-nowrap ml-2">{p.days_until}d</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getFormatBadge(p.party_format_name)}`}>{p.party_format_name || '—'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLE[p.assignment_status] || 'bg-gray-100 text-gray-600'}`}>
                        {p.assignment_status}
                      </span>
                      {p.days_until <= 14 && !p.lead_professor_id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-red-600 text-white">URGENT</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDate(p.first_session_date)} {p.start_time ? `at ${formatTime(p.start_time)}` : ''}
                      {p.contact_name ? ` — ${p.contact_name}` : ''}
                    </div>
                    {p.lead_professor_name && <div className="text-xs text-green-600 mt-0.5">Lead: {p.lead_professor_name}</div>}
                  </div>
                ))}
              </div>

              {/* Right panel — Professor Availability */}
              {selectedId && selectedParty && (
                <div className="w-[60%] space-y-4">
                  {/* Party summary */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-bold text-gray-900">{selectedParty.program_nickname}</h2>
                      <span className={`text-xs px-2 py-1 rounded font-medium ${getFormatBadge(selectedParty.party_format_name)}`}>{selectedParty.party_format_name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div><span className="text-gray-500">Date:</span> {formatDate(selectedParty.first_session_date)}</div>
                      <div><span className="text-gray-500">Time:</span> {selectedParty.start_time ? formatTime(selectedParty.start_time) : '—'}</div>
                      <div><span className="text-gray-500">Location:</span> {selectedParty.party_city || selectedParty.location_nickname || '—'}</div>
                      <div><span className="text-gray-500">Address:</span> {selectedParty.party_address || selectedParty.address || '—'}</div>
                      <div><span className="text-gray-500">Theme:</span> {selectedParty.party_theme || '—'}</div>
                      <div><span className="text-gray-500">Kids:</span> {selectedParty.total_kids_attended || '—'}</div>
                      <div><span className="text-gray-500">Pay:</span> {selectedParty.lead_professor_pay ? formatCurrency(selectedParty.lead_professor_pay) : '—'}</div>
                      <div><span className="text-gray-500">Contact:</span> {selectedParty.contact_name || '—'}</div>
                    </div>
                  </div>

                  {/* Ask history */}
                  {asks.length > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Outreach History</div>
                      <div className="space-y-1">
                        {asks.map(a => (
                          <div key={a.id} className="flex items-center gap-2 text-xs">
                            <span className={`px-1.5 py-0.5 rounded font-medium ${
                              a.response === 'accepted' ? 'bg-green-100 text-green-700' :
                              a.response === 'declined' ? 'bg-red-100 text-red-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>{a.response}</span>
                            <span className="font-medium text-gray-800">{a.professor_name}</span>
                            <span className="text-gray-400">{a.ask_type} · {formatDate(a.asked_at)}</span>
                            {a.decline_reason && <span className="text-red-500 italic">"{a.decline_reason}"</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action bar */}
                  {!selectedParty.lead_professor_id && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                        <button onClick={() => setActionMode(null)} className={`px-3 py-1 rounded text-xs font-medium ${!actionMode ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
                          {defaultAction === 'ask' ? 'Ask (default)' : 'Ask'}
                        </button>
                        <button onClick={() => setActionMode('assign')} className={`px-3 py-1 rounded text-xs font-medium ${actionMode === 'assign' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
                          {defaultAction === 'assign' ? 'Assign (default)' : 'Assign'}
                        </button>
                      </div>
                      <div className="flex-1" />
                      {selected.size > 0 && (
                        <Button onClick={() => openEmailPanel(actionMode || defaultAction)}
                          disabled={actionMode === 'assign' && selected.size > 1}>
                          {(actionMode || defaultAction) === 'ask'
                            ? `Send Ask Email (${selected.size})`
                            : `Assign Professor`}
                        </Button>
                      )}
                      {selected.size === 0 && <span className="text-xs text-gray-400">Select professor(s) below</span>}
                    </div>
                  )}

                  {/* Email preview panel */}
                  {showEmailPanel && (
                    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-800">
                          {actionMode === 'ask' ? 'Ask Email Preview' : 'Assignment Email Preview'}
                        </div>
                        <button onClick={() => setShowEmailPanel(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-0.5">To</label>
                        <div className="text-xs text-gray-600">
                          {[...selected].map(id => professors.find(p => p.id === id)?.name).filter(Boolean).join(', ')}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-0.5">Subject</label>
                        <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-0.5">Body</label>
                        <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={8}
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs font-mono" />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleSend} disabled={askMutation.isPending || assignMutation.isPending}>
                          {askMutation.isPending || assignMutation.isPending ? 'Sending...' : 'Send & Record'}
                        </Button>
                        <button onClick={() => setShowEmailPanel(false)} className="text-xs text-gray-500">Cancel</button>
                      </div>
                      {(askMutation.isError || assignMutation.isError) && (
                        <p className="text-xs text-red-600">{askMutation.error?.response?.data?.error || assignMutation.error?.response?.data?.error || 'Failed'}</p>
                      )}
                    </div>
                  )}

                  {/* Available professors table */}
                  {profsLoading ? (
                    <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="w-8 px-2 py-2"></th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
                            <th className="text-center px-2 py-2 font-medium text-gray-600 text-xs">Parties (30d)</th>
                            <th className="text-center px-2 py-2 font-medium text-gray-600 text-xs">Conflict</th>
                            <th className="text-center px-2 py-2 font-medium text-gray-600 text-xs">Declines</th>
                            <th className="text-center px-2 py-2 font-medium text-gray-600 text-xs">Flags</th>
                            <th className="text-left px-2 py-2 font-medium text-gray-600 text-xs">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {professors.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No available professors</td></tr>
                          ) : professors.map((p, i) => {
                            const isSelected = selected.has(p.id);
                            const alreadyAsked = p.existing_ask;
                            return (
                              <tr key={p.id} className={`${isSelected ? 'bg-[#1e3a5f]/5' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${p.has_conflict ? 'opacity-50' : ''}`}>
                                <td className="px-2 py-2 text-center">
                                  <input type="checkbox" checked={isSelected} onChange={() => toggleProf(p.id)}
                                    disabled={!!selectedParty.lead_professor_id || (alreadyAsked?.response === 'pending')} />
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-gray-900">{p.name}</span>
                                    {p.show_trained && <span className="text-[9px] px-1 py-0.5 rounded bg-pink-100 text-pink-700 font-medium">Show</span>}
                                  </div>
                                  <div className="text-[10px] text-gray-400">{p.geographic_area_name || '—'}</div>
                                </td>
                                <td className="px-2 py-2 text-center text-xs">{p.parties_next_30}</td>
                                <td className="px-2 py-2 text-center">
                                  {p.has_conflict ? <span className="text-red-600 font-bold text-xs">Yes</span> : <span className="text-gray-300 text-xs">—</span>}
                                </td>
                                <td className="px-2 py-2 text-center text-xs">
                                  {p.decline_count > 0 ? <span className="text-red-600 font-medium">{p.decline_count}</span> : <span className="text-gray-300">0</span>}
                                </td>
                                <td className="px-2 py-2 text-center">
                                  {p.day_off_nearby && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700">Day off nearby</span>}
                                </td>
                                <td className="px-2 py-2 text-xs">
                                  {alreadyAsked ? (
                                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                                      alreadyAsked.response === 'pending' ? 'bg-amber-100 text-amber-700' :
                                      alreadyAsked.response === 'accepted' ? 'bg-green-100 text-green-700' :
                                      'bg-red-100 text-red-700'
                                    }`}>{alreadyAsked.response} ({alreadyAsked.ask_type})</span>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function ResponsesDashboard({ data, forceConfirm }) {
  if (!data) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>;
  const { pending, recent, urgent } = data;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Urgent */}
      {urgent.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-2">
            Urgent — Unassigned Within 14 Days ({urgent.length})
          </h2>
          <div className="space-y-1">
            {urgent.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                <Link to={`/parties/${p.id}`} className="font-medium text-sm text-[#1e3a5f] hover:underline flex-1">{p.program_nickname}</Link>
                <span className="text-xs text-gray-500">{formatDate(p.first_session_date)}</span>
                <span className="text-xs font-bold text-red-600">{p.days_until}d</span>
                {p.decline_count >= 3 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white font-medium">{p.decline_count} declines</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending confirmations */}
      <div>
        <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wider mb-2">
          Pending Confirmations ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400">No pending confirmations</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Party</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Asked</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map(a => (
                  <tr key={a.id}>
                    <td className="px-3 py-2">
                      <Link to={`/parties/${a.program_id}`} className="text-[#1e3a5f] hover:underline font-medium">{a.program_nickname}</Link>
                    </td>
                    <td className="px-3 py-2 text-gray-800">{a.professor_name}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${a.ask_type === 'assign' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{a.ask_type}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDate(a.asked_at)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDate(a.first_session_date)}</td>
                    <td className="px-3 py-2 text-right">
                      {a.ask_type === 'assign' && (
                        <button onClick={() => forceConfirm.mutate({ partyId: a.program_id, professor_id: a.professor_id })}
                          disabled={forceConfirm.isPending}
                          className="text-[10px] text-[#1e3a5f] border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">
                          Force Confirm
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent responses */}
      <div>
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-2">
          Recent Responses (7 days)
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400">No recent responses</p>
        ) : (
          <div className="space-y-1">
            {recent.map(a => (
              <div key={a.id} className={`flex items-center gap-3 px-4 py-2 rounded-lg ${a.response === 'accepted' ? 'bg-green-50' : 'bg-red-50'}`}>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${a.response === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {a.response}
                </span>
                <span className="font-medium text-sm text-gray-800">{a.professor_name}</span>
                <Link to={`/parties/${a.program_id}`} className="text-sm text-[#1e3a5f] hover:underline">{a.program_nickname}</Link>
                <span className="text-xs text-gray-400 ml-auto">{formatDate(a.response_at)}</span>
                {a.decline_reason && <span className="text-xs text-red-500 italic">"{a.decline_reason}"</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
