import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from './layout/AppShell';
import { PageHeader } from './layout/PageHeader';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { CopyableTable } from './ui/CopyableTable';
import { RichTextEditor } from './ui/RichTextEditor';
import { formatDate, formatTime } from '../lib/utils';

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function getDays(p) { return DAYS.map((d,i) => p[d] ? DAY_SHORT[i] : null).filter(Boolean).join(', '); }

/**
 * Props:
 *  - title, category, endpoint, columns, getRecipient, getMergeData
 *  - idField: 'program_id' | 'location_id'
 *  - rowId: (row) => id
 *  - defaultRange: 'today' | 'week' (default: 'week')
 *  - tabs, tabParam, extraFilters
 */
export function ClientEmailTool({ title, category, endpoint, columns, getRecipient, getMergeData, idField = 'program_id', rowId, extraFilters, tabs, tabParam, defaultRange = 'week', toolSelector }) {
  const qc = useQueryClient();

  // Date range based on defaultRange prop
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);

  const [dateFrom, setDateFrom] = useState(defaultRange === 'today' ? today : weekStart.toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(defaultRange === 'today' ? today : weekEnd.toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState(tabs?.[0]?.key || '');

  // Selected row for preview
  const [selectedId, setSelectedId] = useState(null);
  // Bulk selection
  const [checked, setChecked] = useState(new Set());

  // Email state
  const [templateId, setTemplateId] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  // Fetch data
  const queryParams = { date_from: dateFrom, date_to: dateTo };
  if (tabParam && activeTab) queryParams[tabParam] = activeTab;

  const { data, isLoading } = useQuery({
    queryKey: [endpoint, dateFrom, dateTo, activeTab],
    queryFn: () => api.get(endpoint, { params: queryParams }).then(r => r.data),
  });
  const rows = data?.data || [];

  // Templates
  const activeCat = tabs ? (activeTab ? `${category}_${activeTab}` : category) : category;
  const { data: tplData } = useQuery({
    queryKey: ['cm-templates', activeCat],
    queryFn: () => api.get('/client-management/templates', { params: { category: activeCat } }).then(r => r.data),
  });
  const templates = tplData?.data || [];

  const getId = rowId || (r => r.id);
  const selectedRow = rows.find(r => getId(r) === selectedId);
  const sentCount = rows.filter(r => r.sent).length;
  const totalCount = rows.length;
  const isComplete = totalCount > 0 && sentCount === totalCount;
  const unsentRows = rows.filter(r => !r.sent);

  // Bulk select helpers
  const toggleCheck = (id) => setChecked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allChecked = unsentRows.length > 0 && unsentRows.every(r => checked.has(getId(r)));
  const toggleAll = () => {
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(unsentRows.map(r => getId(r))));
  };

  // Apply template
  const applyTemplate = (tplId, row) => {
    const tpl = templates.find(t => String(t.id) === String(tplId));
    if (!tpl || !row) return;
    setTemplateId(tplId);
    const mergeData = getMergeData ? getMergeData(row) : {};
    let subject = tpl.subject || '';
    let body = tpl.body_html || '';
    for (const [key, val] of Object.entries(mergeData)) {
      subject = subject.replaceAll(`{{${key}}}`, val || '');
      body = body.replaceAll(`{{${key}}}`, val || '');
    }
    setEmailSubject(subject);
    setEmailBody(body);
  };

  const selectRow = (row) => {
    setSelectedId(getId(row));
    if (templates.length > 0) applyTemplate(templates[0].id, row);
  };

  // Send single
  const sendMutation = useMutation({
    mutationFn: () => api.post('/client-management/send', {
      category: activeCat, [idField]: selectedId, template_id: templateId || null,
      recipient_email: getRecipient ? getRecipient(selectedRow) : '',
      subject: emailSubject, body: emailBody, test_mode: testMode, test_email: testEmail,
    }),
    onSuccess: () => qc.invalidateQueries([endpoint]),
  });

  // Mark done single
  const markDoneMutation = useMutation({
    mutationFn: () => api.post('/client-management/mark-done', { category: activeCat, [idField]: selectedId }),
    onSuccess: () => qc.invalidateQueries([endpoint]),
  });

  // Bulk mark done
  const bulkDoneMutation = useMutation({
    mutationFn: () => api.post('/client-management/bulk-mark-done', { category: activeCat, items: [...checked], id_field: idField }),
    onSuccess: () => { qc.invalidateQueries([endpoint]); setChecked(new Set()); },
  });

  // Bulk template selection (independent of single-row preview)
  const [bulkTemplateId, setBulkTemplateId] = useState('');

  // Bulk send (sends same template to all checked, merging per-row)
  const [bulkSending, setBulkSending] = useState(false);
  const bulkSend = async () => {
    const tplId = bulkTemplateId || templateId;
    if (!tplId) { alert('Select a template first'); return; }
    const tpl = templates.find(t => String(t.id) === String(tplId));
    if (!tpl) return;
    setBulkSending(true);
    let sent = 0;
    for (const id of checked) {
      const row = rows.find(r => getId(r) === id);
      if (!row || row.sent) continue;
      const mergeData = getMergeData ? getMergeData(row) : {};
      let subj = tpl.subject || ''; let body = tpl.body_html || '';
      for (const [key, val] of Object.entries(mergeData)) {
        subj = subj.replaceAll(`{{${key}}}`, val || '');
        body = body.replaceAll(`{{${key}}}`, val || '');
      }
      try {
        await api.post('/client-management/send', {
          category: activeCat, [idField]: id, template_id: tpl.id,
          recipient_email: getRecipient ? getRecipient(row) : '',
          subject: subj, body, test_mode: testMode, test_email: testEmail,
        });
        sent++;
      } catch (e) { console.error('Bulk send error for', id, e); }
    }
    setBulkSending(false);
    qc.invalidateQueries([endpoint]);
    setChecked(new Set());
    alert(`Sent ${sent} email${sent !== 1 ? 's' : ''}`);
  };

  return (
    <AppShell>
      {toolSelector}
      <PageHeader title={title} action={
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded font-medium ${isComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {isComplete ? 'COMPLETE' : `${sentCount}/${totalCount} sent`}
          </span>
        </div>
      } />

      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs" />
          <label className="text-xs text-gray-500">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs" />
        </div>
        {tabs && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 ml-2">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1 rounded text-xs font-medium ${activeTab === t.key ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        {extraFilters}
      </div>

      {/* Bulk action bar */}
      {checked.size > 0 && (
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-200 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-blue-800 font-medium">{checked.size} selected</span>
          {templates.length > 0 && (
            <select value={bulkTemplateId} onChange={e => setBulkTemplateId(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs bg-white">
              <option value="">Template for bulk send...</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <Button onClick={() => { if (confirm(`Send ${checked.size} emails using selected template?`)) bulkSend(); }}
            disabled={bulkSending || (!bulkTemplateId && !templateId)}>
            {bulkSending ? 'Sending...' : `Send All (${checked.size})`}
          </Button>
          <button onClick={() => bulkDoneMutation.mutate()} disabled={bulkDoneMutation.isPending}
            className="text-xs text-gray-500 border border-gray-200 px-2.5 py-1.5 rounded hover:bg-gray-50 bg-white">
            {bulkDoneMutation.isPending ? 'Marking...' : `Mark all done (no email)`}
          </button>
          <button onClick={() => setChecked(new Set())} className="text-xs text-gray-400 ml-auto">Clear</button>
        </div>
      )}

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <div className="flex gap-6">
            {/* Left panel — Queue */}
            <div className={`${selectedRow ? 'w-[55%]' : 'w-full'}`}>
              {rows.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">No eligible items in this date range</div>
              ) : (
                <CopyableTable className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="w-8 px-2 py-2">
                          <input type="checkbox" checked={allChecked} onChange={toggleAll}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" />
                        </th>
                        {columns.map(col => (
                          <th key={col.key} className={`text-left px-3 py-2 font-medium text-gray-600 ${col.className || ''}`}>{col.label}</th>
                        ))}
                        <th className="text-center px-2 py-2 font-medium text-gray-600 w-14">Sent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((r, i) => {
                        const id = getId(r);
                        const isChecked = checked.has(id);
                        return (
                          <tr key={id} onClick={() => selectRow(r)}
                            className={`cursor-pointer ${id === selectedId ? 'bg-[#1e3a5f]/5 ring-1 ring-inset ring-[#1e3a5f]/20' : isChecked ? 'bg-blue-50/50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30`}>
                            <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(id)}
                                disabled={r.sent}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" />
                            </td>
                            {columns.map(col => (
                              <td key={col.key} className={`px-3 py-2 ${col.tdClass || ''}`}>
                                {col.render ? col.render(r) : (r[col.key] ?? '—')}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center">
                              {r.sent ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Sent</span>
                                : <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CopyableTable>
              )}
            </div>

            {/* Right panel — Email Preview */}
            {selectedRow && (
              <div className="w-[45%] space-y-3 sticky top-4 self-start">
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex justify-between items-center">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {selectedRow.id && (selectedRow.program_nickname || selectedRow.class_name) ? (
                          <Link to={`/programs/${selectedRow.id}`} className="text-[#1e3a5f] hover:underline" onClick={e => e.stopPropagation()}>
                            {selectedRow.program_nickname || selectedRow.class_name}
                          </Link>
                        ) : (selectedRow.program_nickname || selectedRow.school_name || selectedRow.nickname)}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        To: {getRecipient ? getRecipient(selectedRow) : '—'}
                        {selectedRow.payment_through_us ? <span className="ml-2 text-amber-600 font-medium">Through Egghead</span> : ''}
                      </div>
                    </div>
                    <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
                  </div>

                  <div className="p-4 space-y-3">
                    {templates.length > 0 && (
                      <select value={templateId} onChange={e => applyTemplate(e.target.value, selectedRow)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs">
                        <option value="">Select template...</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}

                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">Subject</label>
                      <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-0.5">Body</label>
                      <RichTextEditor value={emailBody} onChange={setEmailBody}
                        placeholder="Write your email..." minHeight="200px" />
                    </div>

                    <div className="flex items-center gap-2 border-t border-gray-100 pt-2">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-gray-300" />
                        Test mode
                      </label>
                      {testMode && (
                        <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                          placeholder="Test email address"
                          className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
                      )}
                    </div>

                    <div className="flex gap-2 items-center">
                      <Button onClick={() => { if (confirm(`Send email to ${testMode ? testEmail : getRecipient?.(selectedRow)}?`)) sendMutation.mutate(); }}
                        disabled={sendMutation.isPending || (!emailSubject && !emailBody)}>
                        {sendMutation.isPending ? 'Sending...' : testMode ? 'Send Test' : 'Send'}
                      </Button>
                      <button onClick={() => markDoneMutation.mutate()}
                        disabled={markDoneMutation.isPending}
                        className="text-xs text-gray-500 border border-gray-200 px-2.5 py-1.5 rounded hover:bg-gray-50">
                        {markDoneMutation.isPending ? 'Marking...' : 'Mark done (no email)'}
                      </button>
                    </div>
                    {sendMutation.isSuccess && <p className="text-xs text-green-600">Sent successfully</p>}
                    {sendMutation.isError && <p className="text-xs text-red-600">{sendMutation.error?.response?.data?.error || 'Failed'}</p>}
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

export { getDays, formatDate, formatTime };
