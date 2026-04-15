import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { SearchSelect } from '../components/ui/SearchSelect';
import { useProfessorList } from '../hooks/useReferenceData';

const TABS = [
  { key: 'class', label: 'Classes' },
  { key: 'party', label: 'Parties' },
  { key: 'observation', label: 'Observations' },
];

function today() { return new Date().toISOString().split('T')[0]; }

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [tab, setTab] = useState('class');
  const [checked, setChecked] = useState(new Set());
  const [previewRow, setPreviewRow] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [coordFilter, setCoordFilter] = useState('');

  // Custom message
  const [customProfId, setCustomProfId] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [customMsg, setCustomMsg] = useState('');

  const { data: profListData } = useProfessorList();
  const profList = (profListData?.data || []).map(p => ({
    id: String(p.id), label: p.professor_nickname || `${p.first_name} ${p.last_name}`, phone_number: p.phone_number,
  }));

  // Sessions
  const { data: sessionsData, isLoading } = useQuery({
    queryKey: ['notifications', date, tab],
    queryFn: () => api.get(`/notifications/sessions?date=${date}&type=${tab}`).then(r => r.data),
  });
  const allRows = sessionsData?.data || [];

  // Templates
  const { data: tplData } = useQuery({
    queryKey: ['sms-templates'],
    queryFn: () => api.get('/notifications/sms-templates').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const allTemplates = tplData?.data || [];

  // Unconfirmed warner
  const { data: unconfirmedData } = useQuery({
    queryKey: ['notifications-unconfirmed', date],
    queryFn: () => api.get(`/notifications/unconfirmed?date=${date}`).then(r => r.data),
  });
  const unconfirmed = unconfirmedData?.data || [];

  // Derived
  const areas = useMemo(() => [...new Set(allRows.map(r => r.geographic_area_name).filter(Boolean))].sort(), [allRows]);
  const coords = useMemo(() => [...new Set(allRows.map(r => r.coordinator_name).filter(Boolean))].sort(), [allRows]);
  const rows = useMemo(() => allRows.filter(r => {
    if (areaFilter && r.geographic_area_name !== areaFilter) return false;
    if (coordFilter && r.coordinator_name !== coordFilter) return false;
    return true;
  }), [allRows, areaFilter, coordFilter]);

  // Templates filtered by current categories in view
  const categories = useMemo(() => [...new Set(rows.map(r => r.template_category).filter(Boolean))], [rows]);
  const templates = allTemplates.filter(t => categories.includes(t.category));

  // Counts
  const sentCount = rows.filter(r => r.send_status === 'sent').length;
  const confirmedCount = rows.filter(r => r.confirm_status === 'confirmed').length;
  const unsentCount = rows.length - sentCount;
  const allDone = rows.length > 0 && confirmedCount === rows.length;

  // Selection
  const toggleCheck = (key) => setChecked(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const allUnsent = rows.filter(r => r.send_status !== 'sent');
  const allChecked = allUnsent.length > 0 && allUnsent.every(r => checked.has(r.row_key));
  const toggleAll = () => {
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(allUnsent.map(r => r.row_key)));
  };

  // Mutations
  const sendMut = useMutation({
    mutationFn: (items) => api.post('/notifications/send', { items }).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries(['notifications']);
      setChecked(new Set());
      const sent = data.data?.filter(d => d.status === 'sent').length || 0;
      const failed = data.data?.filter(d => d.status === 'failed').length || 0;
      alert(`${sent} sent${failed ? `, ${failed} failed` : ''}`);
    },
    onError: (e) => alert('Send failed: ' + (e?.response?.data?.error || e.message)),
  });

  const confirmMut = useMutation({
    mutationFn: (params) => {
      if (params.observation_id) return api.post(`/notifications/confirm-observation/${params.observation_id}`, params).then(r => r.data);
      return api.post(`/notifications/confirm/${params.sessionId}`, params).then(r => r.data);
    },
    onSuccess: () => qc.invalidateQueries(['notifications']),
  });

  const processMut = useMutation({
    mutationFn: () => api.post('/notifications/process-responses').then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries(['notifications']);
      const count = data.data?.filter(d => d.status === 'confirmed').reduce((s, d) => s + (d.count || 0), 0) || 0;
      alert(count > 0 ? `${count} notification(s) auto-confirmed` : 'No new confirmations');
    },
    onError: (e) => alert('Error: ' + (e?.response?.data?.error || e.message)),
  });

  const customSendMut = useMutation({
    mutationFn: (data) => api.post('/notifications/send-custom', data).then(r => r.data),
    onSuccess: () => { alert('Custom message sent'); setCustomMsg(''); },
    onError: (e) => alert('Send failed: ' + (e?.response?.data?.error || e.message)),
  });

  // Build message from template + row merge vars
  const buildMessage = (row) => {
    // Find template: use selected, or default for this row's category
    const tpl = selectedTemplateId
      ? allTemplates.find(t => t.id === Number(selectedTemplateId))
      : allTemplates.find(t => t.category === row.template_category && t.is_default);
    if (!tpl) return `[No template for ${row.template_category}]`;
    // The server already computed merge vars in the row — we do template fill client-side for preview
    return fillTemplate(tpl.body, row);
  };

  const fillTemplate = (body, row) => {
    const d = row.session_date ? row.session_date.split('T')[0] : '';
    const vars = {
      program_nickname: row.program_nickname || '',
      day_name: d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }) : '',
      short_date: d ? `${new Date(d + 'T12:00:00').getMonth() + 1}/${new Date(d + 'T12:00:00').getDate()}` : '',
      start_time: fmt12(row.start_time || row.session_time),
      end_time: fmtEnd(row.start_time || row.session_time, row.class_length_minutes),
      arrival_time: fmtArrival(row.start_time || row.session_time),
      address: row.address || '',
      contact_name: row.point_of_contact || row.contact_name || '',
      contact_phone: (row.poc_phone || row.contact_phone) ? ` - ${row.poc_phone || row.contact_phone}` : '',
      class_type: row.class_type_name || '',
      lesson_name: row.lesson_name || '',
      num_enrolled: row.number_enrolled || '',
      lead_professor_name: row.lead_professor_name || '',
      lead_phone: row.lead_phone || '',
      party_format: row.party_format_name || '',
      child_info: [row.child_name, row.child_age ? `turning ${row.child_age}` : ''].filter(Boolean).join(' ') || '',
      notes: row.specific_notes ? `\nNotes: ${row.specific_notes}` : '',
      reminder_number: row._reminder_number || '1',
      total_reminders: row._total_reminders || '1',
    };
    let result = body;
    for (const [k, v] of Object.entries(vars)) result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    result = result.replace(/\{\{[^}]+\}\}/g, '');
    return result.replace(/\\n/g, '\n');
  };

  const bulkSend = () => {
    const items = rows
      .filter(r => checked.has(r.row_key))
      .map(r => ({
        session_id: r.session_id || null,
        professor_id: r.professor_id,
        phone: r.phone_formatted || r.phone_number,
        message: buildMessage(r),
        type: r.template_category || tab,
        notification_date: date,
      }));
    if (!items.length) return;
    if (!confirm(`Send ${items.length} notification(s)?`)) return;
    sendMut.mutate(items);
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Twilio Notifications</h1>
          <div className="flex gap-3 mt-1 text-xs">
            {allDone
              ? <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">ALL CONFIRMED</span>
              : <>
                  <span className="text-gray-500">{rows.length} total</span>
                  <span className="text-green-600 font-medium">{confirmedCount} confirmed</span>
                  <span className="text-amber-600">{sentCount - confirmedCount} awaiting</span>
                  <span className="text-gray-400">{unsentCount} unsent</span>
                </>}
          </div>
        </div>
        <Button onClick={() => processMut.mutate()} disabled={processMut.isPending} size="sm" variant="secondary">
          {processMut.isPending ? 'Checking...' : 'Check Twilio Responses'}
        </Button>
      </div>

      <div className="p-6 space-y-4 pb-32">
        {/* Controls */}
        <div className="flex items-end gap-3 flex-wrap">
          <Input label="Date" type="date" value={date} onChange={e => { setDate(e.target.value); setChecked(new Set()); setAreaFilter(''); setCoordFilter(''); }} className="w-40" />
          <div className="flex gap-1">
            {TABS.map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setChecked(new Set()); setSelectedTemplateId(''); }}
                className={`px-3 py-1.5 text-sm rounded font-medium ${tab === t.key ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {areas.length > 1 && (
            <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">All Areas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {coords.length > 1 && (
            <select value={coordFilter} onChange={e => setCoordFilter(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">All Coordinators</option>
              {coords.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* Bulk action bar */}
        {checked.size > 0 && (
          <div className="flex items-center gap-3 bg-[#1e3a5f]/5 border border-[#1e3a5f]/20 rounded-lg px-4 py-2">
            <span className="text-sm font-medium text-[#1e3a5f]">{checked.size} selected</span>
            {templates.length > 0 && (
              <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm">
                <option value="">Default template</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <Button onClick={bulkSend} disabled={sendMut.isPending} size="sm">
              {sendMut.isPending ? 'Sending...' : `Send ${checked.size}`}
            </Button>
            <Button onClick={() => {
              const items = rows.filter(r => checked.has(r.row_key));
              if (!confirm(`Mark ${items.length} as confirmed?`)) return;
              items.forEach(r => confirmMut.mutate({
                sessionId: r.session_id, observation_id: r.observation_id,
                confirmed: true, date, type: r.template_category || tab, professor_id: r.professor_id,
              }));
            }} size="sm" variant="secondary">Confirm {checked.size}</Button>
            <button onClick={() => setChecked(new Set())} className="text-xs text-gray-400 hover:text-gray-600 ml-auto">Clear</button>
          </div>
        )}

        {/* Unconfirmed warner */}
        {unconfirmed.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            <span className="text-sm font-medium text-red-800">{unconfirmed.length} unconfirmed</span>
            <span className="text-xs text-red-600 ml-2">
              {unconfirmed.slice(0, 5).map(u => u.professor_nickname).join(', ')}
              {unconfirmed.length > 5 ? ` +${unconfirmed.length - 5} more` : ''}
            </span>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-8 h-8" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center text-gray-400 py-12">No {tab} sessions for {date}</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-2 py-2.5 text-center">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" />
                  </th>
                  <th className="w-[22%] text-left px-2 py-2.5 text-xs font-medium text-gray-600">Program</th>
                  <th className="w-[10%] text-left px-2 py-2.5 text-xs font-medium text-gray-600">Professor</th>
                  <th className="w-[7%] text-left px-2 py-2.5 text-xs font-medium text-gray-600">Role</th>
                  <th className="w-[10%] text-left px-2 py-2.5 text-xs font-medium text-gray-600">Time</th>
                  <th className="w-[9%] text-left px-2 py-2.5 text-xs font-medium text-gray-600">Area</th>
                  <th className="w-[9%] text-left px-2 py-2.5 text-xs font-medium text-gray-600">Coordinator</th>
                  <th className="w-[8%] text-left px-2 py-2.5 text-xs font-medium text-gray-600">Sent</th>
                  <th className="w-[8%] text-left px-2 py-2.5 text-xs font-medium text-gray-600">Confirmed</th>
                  <th className="w-[7%] text-left px-2 py-2.5 text-xs font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isSent = r.send_status === 'sent';
                  const isConfirmed = r.confirm_status === 'confirmed';
                  const time = r.start_time || r.session_time;
                  return (
                    <tr key={r.row_key} className={`border-b border-gray-100 ${i % 2 ? 'bg-gray-50/50' : 'bg-white'} ${checked.has(r.row_key) ? '!bg-[#1e3a5f]/5' : ''}`}>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={checked.has(r.row_key)} onChange={() => toggleCheck(r.row_key)}
                          disabled={isSent}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] disabled:opacity-30" />
                      </td>
                      <td className="px-2 py-2 truncate font-medium text-gray-900" title={r.program_nickname}>
                        {r.program_nickname}
                      </td>
                      <td className="px-2 py-2 text-gray-700 truncate">{r.professor_nickname}</td>
                      <td className="px-2 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${r.role === 'lead' ? 'bg-blue-50 text-blue-600' : r.role === 'assistant' ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-500'}`}>
                          {r.role === 'lead' ? 'Lead' : r.role === 'assistant' ? 'Assist' : r.role === 'observer' ? 'Obs' : r.role}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-gray-600 text-xs whitespace-nowrap">
                        {time ? `${fmt12(time)}–${fmtEnd(time, r.class_length_minutes)}` : '—'}
                      </td>
                      <td className="px-2 py-2 text-gray-500 text-xs truncate">{r.geographic_area_name || '—'}</td>
                      <td className="px-2 py-2 text-gray-500 text-xs truncate">{r.coordinator_name || '—'}</td>
                      <td className="px-2 py-2">
                        {isSent
                          ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Sent</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => confirmMut.mutate({
                          sessionId: r.session_id, observation_id: r.observation_id,
                          confirmed: !isConfirmed, date, type: r.template_category || tab, professor_id: r.professor_id,
                        })}>
                          {isConfirmed
                            ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium hover:bg-green-200 cursor-pointer">Confirmed</span>
                            : <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-500 hover:bg-red-100 cursor-pointer">Unconfirmed</span>}
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          {!isSent && (
                            <button onClick={() => {
                              if (!confirm(`Send to ${r.professor_nickname}?`)) return;
                              sendMut.mutate([{
                                session_id: r.session_id || null, professor_id: r.professor_id,
                                phone: r.phone_formatted || r.phone_number, message: buildMessage(r),
                                type: r.template_category || tab, notification_date: date,
                              }]);
                            }} className="text-xs text-[#1e3a5f] hover:underline font-medium">Send</button>
                          )}
                          <button onClick={() => setPreviewRow(previewRow === r.row_key ? null : r.row_key)}
                            className="text-xs text-gray-400 hover:text-gray-600">{previewRow === r.row_key ? 'Hide' : 'Msg'}</button>
                        </div>
                        {previewRow === r.row_key && (
                          <pre className="mt-1 text-xs text-gray-600 bg-gray-50 p-2 rounded whitespace-pre-wrap border max-w-sm">
                            {buildMessage(r)}
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

        {/* SMS Templates */}
        <Section title="SMS Templates" defaultOpen={false}>
          <SmsTemplateManager templates={allTemplates} onRefresh={() => qc.invalidateQueries(['sms-templates'])} />
        </Section>

        {/* Custom Message */}
        <Section title="Custom Twilio Message" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <SearchSelect label="Professor" options={profList} displayKey="label" valueKey="id"
              value={customProfId} onChange={id => { setCustomProfId(id); const m = profList.find(p => p.id === id); if (m?.phone_number) setCustomPhone(m.phone_number); }}
              placeholder="Search professor..." />
            <Input label="Phone Number" value={customPhone} onChange={e => setCustomPhone(e.target.value)} placeholder="+18181234567" />
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-700 mb-1 block">Message</label>
              <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)} rows={5} placeholder="Type your message..."
                className="block w-full rounded border border-gray-300 text-sm px-3 py-2 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
            <div className="col-span-2 flex justify-end">
              <Button onClick={() => {
                if (!customPhone || !customMsg) return alert('Phone and message required');
                if (!confirm(`Send to ${customPhone}?`)) return;
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

// ── SMS Template Manager ──────────────────────────────────────
function SmsTemplateManager({ templates, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [editName, setEditName] = useState('');
  const [editBody, setEditBody] = useState('');

  const saveMut = useMutation({
    mutationFn: ({ id, name, body }) => api.put(`/notifications/sms-templates/${id}`, { name, body }).then(r => r.data),
    onSuccess: () => { onRefresh(); alert('Template saved'); },
  });

  const categories = {
    class_lead: 'Class Lead', class_assistant: 'Class Assistant',
    party_lead: 'Party Lead', party_observe: 'Party Observe', observation: 'Observation',
  };

  const mergeFields = [
    'program_nickname', 'day_name', 'short_date', 'start_time', 'end_time', 'arrival_time',
    'address', 'contact_name', 'contact_phone', 'class_type', 'lesson_name', 'num_enrolled',
    'lead_professor_name', 'lead_phone', 'party_format', 'child_info', 'notes',
    'reminder_number', 'total_reminders',
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-1">
        {templates.map(t => (
          <button key={t.id} onClick={() => { setSelected(t); setEditName(t.name); setEditBody(t.body); }}
            className={`w-full text-left px-3 py-2 rounded text-sm ${selected?.id === t.id ? 'bg-[#1e3a5f] text-white' : 'hover:bg-gray-50'}`}>
            <div className="font-medium truncate">{t.name}</div>
            <div className={`text-xs ${selected?.id === t.id ? 'text-white/70' : 'text-gray-400'}`}>{categories[t.category] || t.category}</div>
          </button>
        ))}
      </div>
      {selected && (
        <div className="col-span-2 space-y-3">
          <Input label="Template Name" value={editName} onChange={e => setEditName(e.target.value)} />
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Body</label>
            <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={12}
              className="block w-full rounded border border-gray-300 text-xs font-mono px-3 py-2 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
          </div>
          <div className="flex items-start justify-between">
            <div className="text-xs text-gray-400">
              <span className="font-medium">Merge fields:</span>{' '}
              {mergeFields.map(f => <code key={f} className="bg-gray-100 px-1 rounded mr-1">{`{{${f}}}`}</code>)}
            </div>
            <Button onClick={() => saveMut.mutate({ id: selected.id, name: editName, body: editBody })}
              disabled={saveMut.isPending} size="sm">
              {saveMut.isPending ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Time helpers ──────────────────────────────────────────────
function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function fmtEnd(start, mins) {
  if (!start || !mins) return '';
  const [h, m] = start.split(':').map(Number);
  const tot = h * 60 + m + mins;
  const eh = Math.floor(tot / 60) % 24;
  const em = tot % 60;
  return `${eh % 12 || 12}:${String(em).padStart(2, '0')} ${eh >= 12 ? 'PM' : 'AM'}`;
}

function fmtArrival(start, before = 10) {
  if (!start) return '';
  const [h, m] = start.split(':').map(Number);
  const tot = h * 60 + m - before;
  const ah = Math.floor(tot / 60) % 24;
  const am = tot % 60;
  return `${ah % 12 || 12}:${String(am).padStart(2, '0')} ${ah >= 12 ? 'PM' : 'AM'}`;
}
