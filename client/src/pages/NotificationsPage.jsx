import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { SearchSelect } from '../components/ui/SearchSelect';
import { useProfessorList } from '../hooks/useReferenceData';
import { formatTimeRange } from '../lib/utils';

const TABS = [
  { key: 'class', label: 'Classes' },
  { key: 'party', label: 'Parties' },
  { key: 'observation', label: 'Observations' },
];

function today() { return new Date().toISOString().split('T')[0]; }

function formatTime12(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function ConfirmBadge({ confirmed, sent }) {
  if (confirmed) return <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Confirmed</span>;
  if (sent) return <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Sent</span>;
  return <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Not Sent</span>;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [tab, setTab] = useState('class');
  const [selected, setSelected] = useState(new Set());
  const [expandedMsg, setExpandedMsg] = useState(null);
  const [areaFilter, setAreaFilter] = useState('');
  const [coordFilter, setCoordFilter] = useState('');

  // Custom message state
  const [customProfId, setCustomProfId] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [customMsg, setCustomMsg] = useState('');

  const { data: profListData } = useProfessorList();
  const profList = (profListData?.data || []).map(p => ({
    id: String(p.id),
    label: p.professor_nickname || `${p.first_name} ${p.last_name}`,
    phone_number: p.phone_number,
  }));

  const { data: sessionsData, isLoading } = useQuery({
    queryKey: ['notifications', date, tab],
    queryFn: () => api.get(`/notifications/sessions?date=${date}&type=${tab}`).then(r => r.data),
  });
  const allSessions = sessionsData?.data || [];

  // Derive unique areas and coordinators for filters
  const areas = [...new Set(allSessions.map(s => s.geographic_area_name).filter(Boolean))].sort();
  const coordinators = [...new Set(allSessions.map(s => s.coordinator_name).filter(Boolean))].sort();

  // Apply filters
  const sessions = allSessions.filter(s => {
    if (areaFilter && s.geographic_area_name !== areaFilter) return false;
    if (coordFilter && s.coordinator_name !== coordFilter) return false;
    return true;
  });

  const { data: unconfirmedData } = useQuery({
    queryKey: ['notifications-unconfirmed', date],
    queryFn: () => api.get(`/notifications/unconfirmed?date=${date}`).then(r => r.data),
  });
  const unconfirmed = unconfirmedData?.data || [];

  // Mutations
  const sendMut = useMutation({
    mutationFn: (items) => api.post('/notifications/send', { items }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['notifications']); setSelected(new Set()); },
    onError: (e) => alert('Send failed: ' + (e?.response?.data?.error || e.message)),
  });

  const confirmMut = useMutation({
    mutationFn: ({ sessionId, confirmed, date: d, type: t, professor_id }) =>
      api.post(`/notifications/confirm/${sessionId}`, { confirmed, date: d, type: t, professor_id }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['notifications']),
  });

  const processMut = useMutation({
    mutationFn: () => api.post('/notifications/process-responses').then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries(['notifications']);
      const count = data.data?.filter(d => d.status === 'confirmed').length || 0;
      alert(count > 0 ? `${count} professor(s) auto-confirmed from replies` : 'No new confirmations found');
    },
    onError: (e) => alert('Error: ' + (e?.response?.data?.error || e.message)),
  });

  const customSendMut = useMutation({
    mutationFn: (data) => api.post('/notifications/send-custom', data).then(r => r.data),
    onSuccess: () => { alert('Custom message sent'); setCustomMsg(''); },
    onError: (e) => alert('Send failed: ' + (e?.response?.data?.error || e.message)),
  });

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === sessions.length) setSelected(new Set());
    else setSelected(new Set(sessions.map(s => s.session_id || s.observation_id)));
  };

  // Select only unsent
  const selectUnsent = () => {
    setSelected(new Set(sessions.filter(s => !s.notification_sent && s.send_status !== 'sent').map(s => s.session_id || s.observation_id)));
  };

  // Select only unconfirmed
  const selectUnconfirmed = () => {
    setSelected(new Set(sessions.filter(s => s.notif_confirm_status !== 'confirmed').map(s => s.session_id || s.observation_id)));
  };

  const handleSendSelected = () => {
    const items = sessions
      .filter(s => selected.has(s.session_id || s.observation_id))
      .map(s => ({
        session_id: s.session_id || null,
        professor_id: s.professor_id,
        phone: s.phone_formatted || s.phone_number,
        message: s.generated_message,
        type: tab,
        notification_date: date,
      }));
    if (items.length === 0) return;
    if (!confirm(`Send ${items.length} notification(s)?`)) return;
    sendMut.mutate(items);
  };

  const handleSendOne = (s) => {
    if (!confirm(`Send notification to ${s.professor_nickname}?`)) return;
    sendMut.mutate([{
      session_id: s.session_id || null,
      professor_id: s.professor_id,
      phone: s.phone_formatted || s.phone_number,
      message: s.generated_message,
      type: tab,
      notification_date: date,
    }]);
  };

  const handleCustomProfSelect = (id) => {
    setCustomProfId(id);
    if (id) {
      const match = profList.find(p => p.id === id);
      if (match?.phone_number) setCustomPhone(match.phone_number);
    }
  };

  // Summary counts
  const totalCount = sessions.length;
  const confirmedCount = sessions.filter(s => s.notif_confirm_status === 'confirmed').length;
  const sentCount = sessions.filter(s => s.notification_sent || s.send_status === 'sent').length;
  const unsentCount = totalCount - sentCount;

  return (
    <AppShell>
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Twilio Notifications</h1>
          <p className="text-sm text-gray-500 mt-0.5">Send notifications, track confirmations</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => processMut.mutate()} disabled={processMut.isPending} size="sm" variant="secondary">
            {processMut.isPending ? 'Checking...' : 'Check Twilio Responses'}
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-4 pb-32">
        {/* Controls row */}
        <div className="flex items-end gap-3 flex-wrap">
          <Input label="Date" type="date" value={date} onChange={e => { setDate(e.target.value); setSelected(new Set()); setAreaFilter(''); setCoordFilter(''); }} className="w-40" />
          <div className="flex gap-1">
            {TABS.map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setSelected(new Set()); }}
                className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${tab === t.key ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {areas.length > 1 && (
            <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">All Areas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {coordinators.length > 1 && (
            <select value={coordFilter} onChange={e => setCoordFilter(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">All Coordinators</option>
              {coordinators.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* Summary bar */}
        <div className="flex gap-4 text-sm">
          <span className="text-gray-600">{totalCount} session{totalCount !== 1 ? 's' : ''}</span>
          <span className="text-green-600 font-medium">{confirmedCount} confirmed</span>
          <span className="text-amber-600">{sentCount - confirmedCount} sent / awaiting</span>
          <span className="text-gray-400">{unsentCount} not sent</span>
          {selected.size > 0 && <span className="text-[#1e3a5f] font-medium">{selected.size} selected</span>}
        </div>

        {/* Action bar */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={selectAll} className="text-xs text-gray-500 hover:text-[#1e3a5f] underline">
            {selected.size === sessions.length && sessions.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
          <button onClick={selectUnsent} className="text-xs text-gray-500 hover:text-[#1e3a5f] underline">Select Unsent</button>
          <button onClick={selectUnconfirmed} className="text-xs text-gray-500 hover:text-[#1e3a5f] underline">Select Unconfirmed</button>
          {selected.size > 0 && (
            <>
              <Button onClick={handleSendSelected} disabled={sendMut.isPending} size="sm">
                {sendMut.isPending ? 'Sending...' : `Send ${selected.size} Notification${selected.size > 1 ? 's' : ''}`}
              </Button>
              <Button onClick={() => {
                const items = sessions.filter(s => selected.has(s.session_id || s.observation_id) && s.session_id);
                if (!items.length) return;
                if (!confirm(`Mark ${items.length} as confirmed?`)) return;
                items.forEach(s => confirmMut.mutate({ sessionId: s.session_id, confirmed: true, date, type: tab, professor_id: s.professor_id }));
              }} size="sm" variant="secondary">Confirm Selected</Button>
            </>
          )}
        </div>

        {/* Unconfirmed Warner */}
        {unconfirmed.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-sm font-medium text-red-800 mb-1">
              {unconfirmed.length} Unconfirmed Session{unconfirmed.length > 1 ? 's' : ''} for {date}
            </div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {unconfirmed.map(u => (
                <div key={u.session_id} className="text-xs text-red-700 flex gap-3">
                  <span className="font-medium w-24 shrink-0">{u.professor_nickname}</span>
                  <span className="flex-1">{u.program_nickname}</span>
                  <span className="text-red-500 shrink-0">{u.notification_sent ? 'No reply' : 'Not notified'}</span>
                  <span className="text-gray-400 shrink-0">{u.coordinator_name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Table */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-8 h-8" /></div>
        ) : sessions.length === 0 ? (
          <div className="text-center text-gray-400 py-12">No {tab} sessions for {date}</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="w-8 px-2 py-2.5">
                    <input type="checkbox" checked={selected.size === sessions.length && sessions.length > 0}
                      onChange={selectAll} className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" />
                  </th>
                  <th className="text-left px-2 py-2.5 font-medium text-gray-600 text-xs">Program</th>
                  <th className="text-left px-2 py-2.5 font-medium text-gray-600 text-xs">Lead Prof</th>
                  <th className="text-left px-2 py-2.5 font-medium text-gray-600 text-xs">Assist Prof</th>
                  <th className="text-left px-2 py-2.5 font-medium text-gray-600 text-xs">Time</th>
                  <th className="text-left px-2 py-2.5 font-medium text-gray-600 text-xs">Area</th>
                  <th className="text-left px-2 py-2.5 font-medium text-gray-600 text-xs">Coordinator</th>
                  <th className="text-left px-2 py-2.5 font-medium text-gray-600 text-xs">Confirm</th>
                  <th className="text-left px-2 py-2.5 font-medium text-gray-600 text-xs">Notification</th>
                  <th className="text-left px-2 py-2.5 font-medium text-gray-600 text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => {
                  const id = s.session_id || s.observation_id;
                  const isConfirmed = s.notif_confirm_status === 'confirmed';
                  const isSent = !!s.notification_sent || s.send_status === 'sent';
                  const time = s.start_time || s.session_time;
                  const timeStr = time ? `${formatTime12(time)}–${formatTime12(endTime(time, s.class_length_minutes))}` : '—';
                  return (
                    <tr key={`${id}-${i}`} className={`border-b border-gray-100 hover:bg-gray-50/50 ${isConfirmed ? 'bg-green-50/40' : !isSent ? '' : 'bg-amber-50/30'}`}>
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={selected.has(id)} onChange={() => toggleSelect(id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" />
                      </td>
                      <td className="px-2 py-2 font-medium text-gray-900 max-w-[220px] truncate">{s.program_nickname}</td>
                      <td className="px-2 py-2 text-gray-700">{s.lead_professor_name || s.professor_nickname || '—'}</td>
                      <td className="px-2 py-2 text-gray-500">{s.assistant_professor_name || '—'}</td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{timeStr}</td>
                      <td className="px-2 py-2 text-gray-500 text-xs">{s.geographic_area_name || '—'}</td>
                      <td className="px-2 py-2 text-gray-500 text-xs">{s.coordinator_name || '—'}</td>
                      <td className="px-2 py-2">
                        {s.session_id ? (
                          <button type="button" onClick={() => confirmMut.mutate({
                            sessionId: s.session_id, confirmed: !isConfirmed,
                            date, type: tab, professor_id: s.professor_id,
                          })} className="cursor-pointer">
                            {isConfirmed
                              ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium hover:bg-green-200">Confirmed</span>
                              : <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200">Unconfirmed</span>}
                          </button>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-2">
                        <ConfirmBadge confirmed={false} sent={isSent} />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1.5 items-center">
                          <button type="button" onClick={() => handleSendOne(s)}
                            className="text-xs text-[#1e3a5f] hover:underline font-medium">
                            {isSent ? 'Resend' : 'Send'}
                          </button>
                          <button type="button" onClick={() => setExpandedMsg(expandedMsg === id ? null : id)}
                            className="text-xs text-gray-400 hover:text-gray-600">
                            {expandedMsg === id ? 'Hide' : 'Msg'}
                          </button>
                        </div>
                        {expandedMsg === id && (
                          <pre className="mt-1.5 text-xs text-gray-600 bg-gray-50 p-2 rounded whitespace-pre-wrap max-w-md border">
                            {s.generated_message}
                          </pre>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Custom Twilio Message */}
        <Section title="Custom Twilio Message" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <SearchSelect
              label="Professor"
              options={profList}
              displayKey="label" valueKey="id"
              value={customProfId}
              onChange={handleCustomProfSelect}
              placeholder="Search professor..."
            />
            <Input label="Phone Number" value={customPhone} onChange={e => setCustomPhone(e.target.value)}
              placeholder="+18181234567" />
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-700 mb-1 block">Message</label>
              <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)}
                rows={5} placeholder="Type your message..."
                className="block w-full rounded border border-gray-300 text-sm px-3 py-2 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
            <div className="col-span-2 flex justify-end">
              <Button onClick={() => {
                if (!customPhone || !customMsg) return alert('Phone and message required');
                if (!confirm(`Send message to ${customPhone}?`)) return;
                customSendMut.mutate({ professor_id: customProfId || null, phone: customPhone, message: customMsg });
              }} disabled={customSendMut.isPending}>
                {customSendMut.isPending ? 'Sending...' : 'Send Custom Message'}
              </Button>
            </div>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}

// Helper to calculate end time string
function endTime(startTime, lengthMinutes) {
  if (!startTime || !lengthMinutes) return '';
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + lengthMinutes;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}
