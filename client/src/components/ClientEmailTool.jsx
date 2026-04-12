import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from './layout/AppShell';
import { PageHeader } from './layout/PageHeader';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { CopyableTable } from './ui/CopyableTable';
import { formatDate, formatTime } from '../lib/utils';

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function getDays(p) { return DAYS.map((d,i) => p[d] ? DAY_SHORT[i] : null).filter(Boolean).join(', '); }

/**
 * Shared shell for all client management email tools.
 *
 * Props:
 *  - title: string
 *  - category: string (email template category slug)
 *  - endpoint: string (API endpoint for data, e.g. '/client-management/starting-emails')
 *  - columns: array of { key, label, render? }
 *  - getRecipient: (row) => email string
 *  - getMergeData: (row) => { field: value } for template merge
 *  - idField: 'program_id' | 'location_id' (which field to use for sent tracking)
 *  - rowId: (row) => id value (default: row.id)
 *  - extraFilters?: JSX for additional filter controls
 *  - tabs?: array of { key, label } for multi-tab tools
 *  - tabParam?: string (query param for tab, e.g. 'tab')
 */
export function ClientEmailTool({ title, category, endpoint, columns, getRecipient, getMergeData, idField = 'program_id', rowId, extraFilters, tabs, tabParam }) {
  const qc = useQueryClient();
  const tableRef = useRef(null);

  // Date range
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const [dateFrom, setDateFrom] = useState(weekStart.toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(weekEnd.toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState(tabs?.[0]?.key || '');

  // Selected row for preview
  const [selectedId, setSelectedId] = useState(null);

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
  // Try exact category first, fall back to base
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

  // Apply template
  const applyTemplate = (tplId, row) => {
    const tpl = templates.find(t => String(t.id) === String(tplId));
    if (!tpl || !row) return;
    setTemplateId(tplId);
    const mergeData = getMergeData ? getMergeData(row) : {};
    let subject = tpl.subject || '';
    let body = tpl.body_html || '';
    for (const [key, val] of Object.entries(mergeData)) {
      const placeholder = `{{${key}}}`;
      subject = subject.replaceAll(placeholder, val || '');
      body = body.replaceAll(placeholder, val || '');
    }
    setEmailSubject(subject);
    setEmailBody(body);
  };

  // Select a row
  const selectRow = (row) => {
    setSelectedId(getId(row));
    if (templates.length > 0) {
      applyTemplate(templates[0].id, row);
    }
  };

  // Send
  const sendMutation = useMutation({
    mutationFn: () => api.post('/client-management/send', {
      category: activeCat,
      [idField]: selectedId,
      template_id: templateId || null,
      recipient_email: getRecipient ? getRecipient(selectedRow) : '',
      subject: emailSubject,
      body: emailBody,
      test_mode: testMode,
      test_email: testEmail,
    }),
    onSuccess: () => { qc.invalidateQueries([endpoint]); },
  });

  return (
    <AppShell>
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
                        {columns.map(col => (
                          <th key={col.key} className={`text-left px-3 py-2 font-medium text-gray-600 ${col.className || ''}`}>{col.label}</th>
                        ))}
                        <th className="text-center px-2 py-2 font-medium text-gray-600 w-14">Sent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((r, i) => (
                        <tr key={getId(r)} onClick={() => selectRow(r)}
                          className={`cursor-pointer ${getId(r) === selectedId ? 'bg-[#1e3a5f]/5 ring-1 ring-inset ring-[#1e3a5f]/20' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30`}>
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
                      ))}
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
                      <div className="text-sm font-semibold text-gray-900">{selectedRow.program_nickname || selectedRow.school_name || selectedRow.nickname}</div>
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
                      <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={10}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs font-mono" />
                    </div>

                    {/* Test mode */}
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

                    <div className="flex gap-2">
                      <Button onClick={() => { if (confirm(`Send email to ${testMode ? testEmail : getRecipient?.(selectedRow)}?`)) sendMutation.mutate(); }}
                        disabled={sendMutation.isPending || (!emailSubject && !emailBody)}>
                        {sendMutation.isPending ? 'Sending...' : testMode ? 'Send Test' : 'Send'}
                      </Button>
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

// Export helpers for use in tool pages
export { getDays, formatDate, formatTime };
