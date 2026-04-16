import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { RichTextEditor } from '../components/ui/RichTextEditor';
import { formatDate, formatCurrency } from '../lib/utils';

const TABS = [
  { key: 'create', label: 'Create Stripe Links' },
  { key: 'status', label: 'Lab Fee Status' },
  { key: 'payments', label: 'Mark Payments' },
  { key: 'followup', label: 'Follow Up Emails' },
];

// ═══════════════════════════════════════════════════════════════════
// TAB 1: CREATE STRIPE LINKS
// ═══════════════════════════════════════════════════════════════════
function CreateLinksTab() {
  const qc = useQueryClient();
  const [leadDays, setLeadDays] = useState(parseInt(localStorage.getItem('labFeeLeadDays')) || 15);
  const [createdLinks, setCreatedLinks] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['lab-fee-create-links', leadDays],
    queryFn: () => api.get(`/lab-fees/create-links?lead_days=${leadDays}`).then(r => r.data),
  });
  const rows = data?.data || [];

  const createMutation = useMutation({
    mutationFn: (id) => api.post(`/lab-fees/create-link/${id}`).then(r => r.data),
    onSuccess: (res, id) => {
      setCreatedLinks(prev => ({ ...prev, [id]: res.data }));
      qc.invalidateQueries(['lab-fee-create-links']);
      qc.invalidateQueries(['lab-fee-counts']);
    },
  });

  const notNeededMutation = useMutation({
    mutationFn: (id) => api.post(`/lab-fees/mark-not-needed/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['lab-fee-create-links']);
      qc.invalidateQueries(['lab-fee-counts']);
    },
  });

  const handleLeadDaysChange = (val) => {
    const v = parseInt(val) || 15;
    setLeadDays(v);
    localStorage.setItem('labFeeLeadDays', v);
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-4">
        <label className="text-sm text-gray-600">Show programs starting within</label>
        <input type="number" value={leadDays} onChange={e => handleLeadDaysChange(e.target.value)}
          className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-center" min={1} max={365} />
        <span className="text-sm text-gray-600">days</span>
      </div>

      {isLoading ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No programs need Stripe links right now.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Program</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Start Date</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Lab Fee</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Enrolled</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const created = createdLinks[r.id];
              return (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/programs/${r.id}`} className="text-[#1e3a5f] hover:underline font-medium">{r.program_nickname}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(r.first_session_date)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(r.lab_fee)}</td>
                  <td className="px-4 py-3 text-right">{r.roster_count}</td>
                  <td className="px-4 py-3 text-center">
                    {created ? (
                      <div className="flex items-center gap-2 justify-center">
                        <span className="text-green-600 text-xs font-medium">Created</span>
                        <a href={created.url} target="_blank" rel="noreferrer" className="text-xs text-[#1e3a5f] hover:underline">Link</a>
                        <button onClick={() => { navigator.clipboard.writeText(created.url); }}
                          className="text-xs text-gray-500 hover:text-gray-700">Copy</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 justify-center">
                        <Button size="sm" onClick={() => createMutation.mutate(r.id)}
                          disabled={createMutation.isPending}>
                          {createMutation.isPending && createMutation.variables === r.id ? 'Creating...' : 'Create Link'}
                        </Button>
                        <button onClick={() => notNeededMutation.mutate(r.id)}
                          className="text-xs text-gray-400 hover:text-gray-600">Not Needed</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 2: LAB FEE STATUS
// ═══════════════════════════════════════════════════════════════════
function StatusTab() {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['lab-fee-status', showAll],
    queryFn: () => api.get(`/lab-fees/status?show_all=${showAll ? '1' : '0'}`).then(r => r.data),
  });
  const rows = data?.data || [];

  const { data: rosterData } = useQuery({
    queryKey: ['lab-fee-roster', expanded],
    queryFn: () => api.get(`/lab-fees/roster/${expanded}`).then(r => r.data),
    enabled: !!expanded,
  });

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}
            className="rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]" />
          Show all (including fully paid)
        </label>
      </div>

      {isLoading ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No outstanding lab fees.</p>
      ) : (
        <div className="text-sm">
          {/* Header row */}
          <div className="flex items-center border-b border-gray-200 font-semibold text-gray-700 text-xs uppercase tracking-wide">
            <div className="flex-1 px-4 py-3">Program</div>
            <div className="w-28 text-center px-4 py-3">Link</div>
            <div className="w-20 text-right px-4 py-3">Enrolled</div>
            <div className="w-20 text-right px-4 py-3">Paid</div>
            <div className="w-28 text-center px-4 py-3">Status</div>
          </div>
          {/* Rows */}
          <div>
            {rows.map(r => {
              const allPaid = r.paid_count >= r.enrolled_count && r.enrolled_count > 0;
              const isExpanded = expanded === r.id;
              return (
                <div key={r.id} className="border-b border-gray-100">
                    <div className="flex items-center hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : r.id)}>
                      <div className="flex-1 px-4 py-3">
                        <Link to={`/programs/${r.id}`} onClick={e => e.stopPropagation()} className="text-[#1e3a5f] hover:underline font-medium">{r.program_nickname}</Link>
                      </div>
                      <div className="w-28 text-center px-4 py-3">
                        {r.stripe_payment_link_id ? (
                          <div className="flex items-center gap-1 justify-center">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Created</span>
                            <a href={r.stripe_payment_link_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                              className="text-gray-400 hover:text-[#1e3a5f]" title="Open link">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            </a>
                          </div>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Not Created</span>
                        )}
                      </div>
                      <div className="w-20 text-right px-4 py-3 text-gray-600">{r.enrolled_count}</div>
                      <div className="w-20 text-right px-4 py-3 text-gray-600">{r.paid_count}</div>
                      <div className="w-28 text-center px-4 py-3">
                        {allPaid ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">All Paid</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Outstanding</span>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-8 pb-4 bg-gray-50 border-t border-gray-100">
                        {r.stripe_payment_link_qr_url && (
                          <div className="flex items-center gap-4 py-3 border-b border-gray-200 mb-3">
                            <img src={r.stripe_payment_link_qr_url} alt="QR Code" className="w-20 h-20 border rounded" />
                            <div className="text-xs text-gray-600">
                              <p className="font-medium mb-1">Payment Link QR Code</p>
                              <button onClick={() => navigator.clipboard.writeText(r.stripe_payment_link_url)}
                                className="text-[#1e3a5f] hover:underline">Copy link URL</button>
                            </div>
                          </div>
                        )}
                        {rosterData?.data ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left py-1">Student</th>
                                <th className="text-left py-1">Parent Email</th>
                                <th className="text-center py-1">Payment Status</th>
                                <th className="text-left py-1">Paid Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rosterData.data.map(s => (
                                <tr key={s.id} className="border-t border-gray-100">
                                  <td className="py-1.5">{s.first_name} {s.last_name}</td>
                                  <td className="py-1.5 text-gray-500">{s.parent_email || '-'}</td>
                                  <td className="py-1.5 text-center">
                                    <PaymentBadge status={s.lab_fee_payment_status} />
                                  </td>
                                  <td className="py-1.5 text-gray-500">{s.lab_fee_paid_date ? formatDate(s.lab_fee_paid_date) : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : <Spinner />}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 3: MARK PAYMENTS
// ═══════════════════════════════════════════════════════════════════
function PaymentsTab() {
  const qc = useQueryClient();
  const [manualProgramId, setManualProgramId] = useState('');

  const { data: unresolvedData, isLoading: unresolvedLoading } = useQuery({
    queryKey: ['lab-fee-unresolved'],
    queryFn: () => api.get('/lab-fees/unresolved').then(r => r.data),
  });
  const unresolved = unresolvedData?.data || [];

  const { data: statusData } = useQuery({
    queryKey: ['lab-fee-status', true],
    queryFn: () => api.get('/lab-fees/status?show_all=1').then(r => r.data),
  });
  const allPrograms = statusData?.data || [];

  const { data: manualRosterData } = useQuery({
    queryKey: ['lab-fee-roster', manualProgramId],
    queryFn: () => api.get(`/lab-fees/roster/${manualProgramId}`).then(r => r.data),
    enabled: !!manualProgramId,
  });
  const manualRoster = manualRosterData?.data || [];

  const matchMutation = useMutation({
    mutationFn: ({ eventId, rosterId }) => api.post(`/lab-fees/match-payment/${eventId}`, { roster_id: rosterId }),
    onSuccess: () => {
      qc.invalidateQueries(['lab-fee-unresolved']);
      qc.invalidateQueries(['lab-fee-status']);
      qc.invalidateQueries(['lab-fee-counts']);
    },
  });

  const manualMutation = useMutation({
    mutationFn: ({ rosterId, status, notes }) => api.post('/lab-fees/manual-payment', { roster_id: rosterId, payment_status: status, notes }),
    onSuccess: () => {
      qc.invalidateQueries(['lab-fee-roster', manualProgramId]);
      qc.invalidateQueries(['lab-fee-status']);
      qc.invalidateQueries(['lab-fee-counts']);
    },
  });

  const clearMutation = useMutation({
    mutationFn: (rosterId) => api.post('/lab-fees/clear-payment', { roster_id: rosterId }),
    onSuccess: () => {
      qc.invalidateQueries(['lab-fee-roster', manualProgramId]);
      qc.invalidateQueries(['lab-fee-status']);
      qc.invalidateQueries(['lab-fee-counts']);
    },
  });

  return (
    <div className="p-6 space-y-8">
      {/* Section A: Unresolved Stripe Payments */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Unresolved Stripe Payments</h3>
        {unresolvedLoading ? <Spinner /> : unresolved.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No unresolved payments.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Payer</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Class</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Student Name(s)</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Email</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700">Amount</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Date</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Match To</th>
                <th className="text-center px-3 py-2 font-semibold text-gray-700"></th>
              </tr>
            </thead>
            <tbody>
              {unresolved.map(evt => (
                <UnresolvedRow key={evt.id} evt={evt} matchMutation={matchMutation} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Section B: Manual Payment Entry */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Manual Payment Entry</h3>
        <select value={manualProgramId} onChange={e => setManualProgramId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full max-w-md mb-4">
          <option value="">Select a program...</option>
          {allPrograms.map(p => (
            <option key={p.id} value={p.id}>{p.program_nickname} — {formatCurrency(p.lab_fee)}</option>
          ))}
        </select>

        {manualProgramId && manualRoster.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Student</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Parent Email</th>
                <th className="text-center px-3 py-2 font-semibold text-gray-700">Current Status</th>
                <th className="text-center px-3 py-2 font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {manualRoster.map(s => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">{s.first_name} {s.last_name}</td>
                  <td className="px-3 py-2 text-gray-500">{s.parent_email || '-'}</td>
                  <td className="px-3 py-2 text-center"><PaymentBadge status={s.lab_fee_payment_status} /></td>
                  <td className="px-3 py-2 text-center">
                    {s.lab_fee_payment_status ? (
                      <button onClick={() => clearMutation.mutate(s.id)}
                        className="text-xs text-red-500 hover:underline">Clear</button>
                    ) : (
                      <select defaultValue="" onChange={e => {
                        if (e.target.value) manualMutation.mutate({ rosterId: s.id, status: e.target.value });
                        e.target.value = '';
                      }}
                        className="rounded border border-gray-300 px-2 py-1 text-xs">
                        <option value="">Mark as...</option>
                        <option value="paid_stripe">Paid - Stripe</option>
                        <option value="professor_has">Professor Has Cash or Check</option>
                        <option value="received">Cash or Check Received</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UnresolvedRow({ evt, matchMutation }) {
  const [selectedRoster, setSelectedRoster] = useState('');

  const { data: rosterData } = useQuery({
    queryKey: ['lab-fee-roster', evt.program_id],
    queryFn: () => api.get(`/lab-fees/roster/${evt.program_id}`).then(r => r.data),
    enabled: !!evt.program_id,
  });
  const roster = rosterData?.data || [];

  // Pre-select recommendation if there's exactly one
  const recommended = evt.recommendations?.length === 1 ? evt.recommendations[0].roster_id : '';

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2 font-medium">{evt.customer_name || '-'}</td>
      <td className="px-3 py-2">
        {evt.program_nickname ? (
          <Link to={`/programs/${evt.program_id}`} className="text-[#1e3a5f] hover:underline">{evt.program_nickname}</Link>
        ) : <span className="text-gray-400">Unknown</span>}
      </td>
      <td className="px-3 py-2 text-gray-600">{evt.student_name_field || '-'}</td>
      <td className="px-3 py-2 text-gray-500">{evt.customer_email || '-'}</td>
      <td className="px-3 py-2 text-right">{evt.amount_cents ? formatCurrency(evt.amount_cents / 100) : '-'}</td>
      <td className="px-3 py-2 text-gray-500">{evt.paid_at ? formatDate(evt.paid_at) : '-'}</td>
      <td className="px-3 py-2">
        <select value={selectedRoster || recommended} onChange={e => setSelectedRoster(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs w-full max-w-[200px]">
          <option value="">Select student...</option>
          {roster.filter(s => !s.lab_fee_payment_status).map(s => {
            const isRec = evt.recommendations?.some(r => r.roster_id === s.id);
            return (
              <option key={s.id} value={s.id}>
                {s.first_name} {s.last_name}{isRec ? ' (recommended)' : ''}
              </option>
            );
          })}
        </select>
      </td>
      <td className="px-3 py-2 text-center">
        <Button size="sm" onClick={() => matchMutation.mutate({ eventId: evt.id, rosterId: parseInt(selectedRoster || recommended) })}
          disabled={!selectedRoster && !recommended}>Match</Button>
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 4: FOLLOW UP EMAILS
// ═══════════════════════════════════════════════════════════════════
const FOLLOWUP_MERGE_FIELDS = [
  { key: '{{parent_name}}', label: 'Parent Name' },
  { key: '{{student_name}}', label: 'Student Name' },
  { key: '{{class_name}}', label: 'Class Name' },
  { key: '{{lab_fee_amount}}', label: 'Lab Fee Amount' },
  { key: '{{payment_link}}', label: 'Payment Link' },
  { key: '{{start_date}}', label: 'Start Date' },
];

function FollowUpTab() {
  const qc = useQueryClient();
  const [checked, setChecked] = useState(new Set());
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const editorRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['lab-fee-followup'],
    queryFn: () => api.get('/lab-fees/followup').then(r => r.data),
  });
  const rows = data?.data || [];

  // Use existing client management template system
  const { data: templateData } = useQuery({
    queryKey: ['cm-templates', 'lab_fee_followup'],
    queryFn: () => api.get('/client-management/templates', { params: { category: 'lab_fee_followup' } }).then(r => r.data),
  });
  const templates = templateData?.data || [];

  const handleTemplateSelect = (id) => {
    setTemplateId(id);
    const t = templates.find(t => String(t.id) === String(id));
    if (t) { setSubject(t.subject || ''); setBody(t.body_html || ''); }
  };

  const insertField = (fieldKey) => {
    const subjectEl = document.getElementById('lf-followup-subject');
    if (subjectEl && document.activeElement === subjectEl) {
      const start = subjectEl.selectionStart;
      const end = subjectEl.selectionEnd;
      const val = subject;
      setSubject(val.slice(0, start) + fieldKey + val.slice(end));
      setTimeout(() => { subjectEl.focus(); subjectEl.setSelectionRange(start + fieldKey.length, start + fieldKey.length); }, 0);
    } else if (editorRef.current) {
      editorRef.current.chain().focus().insertContent(fieldKey).run();
    }
  };

  const toggleCheck = (id) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (checked.size === rows.length) setChecked(new Set());
    else setChecked(new Set(rows.map(r => r.id)));
  };

  const handleSend = async () => {
    if (!subject || !body) return alert('Please select a template first');
    const targets = rows.filter(r => checked.has(r.id));
    if (!targets.length) return alert('Select at least one program');

    setSending(true);
    let totalSent = 0, totalFailed = 0;
    for (const row of targets) {
      try {
        const res = await api.post('/lab-fees/send-followup', {
          program_id: row.id,
          subject,
          body,
          test_mode: testMode,
          test_email: testEmail,
        });
        totalSent += res.data.sent || 0;
        totalFailed += res.data.failed || 0;
      } catch { totalFailed++; }
    }
    setSending(false);
    alert(`Sent ${totalSent} email${totalSent !== 1 ? 's' : ''} across ${targets.length} program${targets.length !== 1 ? 's' : ''}${totalFailed ? ` (${totalFailed} failed)` : ''}`);
    qc.invalidateQueries(['lab-fee-followup']);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Template + merge fields */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <select value={templateId} onChange={e => handleTemplateSelect(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Select template...</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Link to="/client-management/templates" className="text-xs text-[#1e3a5f] hover:underline">Manage templates</Link>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer ml-auto">
            <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)}
              className="rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]" />
            Test mode
          </label>
          {testMode && (
            <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
              placeholder="Test email address" className="rounded border border-gray-300 px-2 py-1 text-sm w-64" />
          )}
        </div>

        {/* Merge field buttons */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="text-[10px] font-semibold text-gray-600 mb-1.5">
            Insert Merge Field <span className="font-normal text-gray-400">— click to insert at cursor (works in subject and body). Each parent receives an individual email.</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FOLLOWUP_MERGE_FIELDS.map(f => (
              <button key={f.key} type="button" onClick={() => insertField(f.key)}
                className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-[#1e3a5f] font-mono hover:bg-[#1e3a5f] hover:text-white transition-colors">
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Subject</label>
          <input id="lf-followup-subject" value={subject} onChange={e => setSubject(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" placeholder="Subject line..." />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Body</label>
          <RichTextEditor value={body} onChange={setBody}
            placeholder="Write your follow-up email..." minHeight="200px" editorRef={editorRef} />
        </div>
      </div>

      {/* Program list */}
      {isLoading ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">No programs with outstanding lab fees.</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-600">{checked.size} of {rows.length} program{rows.length !== 1 ? 's' : ''} selected</span>
            <Button onClick={handleSend} disabled={sending || checked.size === 0 || !subject}>
              {sending ? 'Sending...' : `Send Follow-Up (${checked.size})`}
            </Button>
          </div>
          <div className="space-y-1">
            {rows.map(r => (
              <FollowUpProgramRow key={r.id} program={r} checked={checked.has(r.id)} onToggle={() => toggleCheck(r.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FOLLOW UP — EXPANDABLE PROGRAM ROW
// ═══════════════════════════════════════════════════════════════════
function FollowUpProgramRow({ program: r, checked, onToggle }) {
  const [expanded, setExpanded] = useState(false);

  const { data: parentsData } = useQuery({
    queryKey: ['lab-fee-followup-parents', r.id],
    queryFn: () => api.get(`/lab-fees/followup-parents/${r.id}`).then(res => res.data),
    enabled: expanded,
  });
  const parents = parentsData?.data || [];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <input type="checkbox" checked={checked} onChange={e => { e.stopPropagation(); onToggle(); }}
          className="rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]" />
        <div className="flex-1 min-w-0">
          <Link to={`/programs/${r.id}`} onClick={e => e.stopPropagation()} className="text-sm text-[#1e3a5f] hover:underline font-medium">{r.program_nickname}</Link>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{r.enrolled_count} enrolled</span>
          <span>{r.paid_count} paid</span>
          <span className="font-medium text-amber-600">{r.enrolled_count - r.paid_count} outstanding</span>
          {r.lab_fee_followup_date && <span>Last: {formatDate(r.lab_fee_followup_date)}</span>}
          {r.stripe_payment_link_url && (
            <a href={r.stripe_payment_link_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[#1e3a5f] hover:underline">Link</a>
          )}
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
          {parents.length === 0 ? (
            <p className="text-xs text-gray-500">No unpaid parents with email addresses found.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left py-1 font-medium">Student</th>
                  <th className="text-left py-1 font-medium">Parent</th>
                  <th className="text-left py-1 font-medium">Email</th>
                  <th className="text-right py-1 font-medium">Amount Due</th>
                </tr>
              </thead>
              <tbody>
                {parents.map((p, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1.5">{p.student_first} {p.student_last}</td>
                    <td className="py-1.5">{p.parent_first} {p.parent_last}</td>
                    <td className="py-1.5 text-gray-500">{p.email}</td>
                    <td className="py-1.5 text-right">{formatCurrency(parentsData?.program?.lab_fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════
function PaymentBadge({ status }) {
  if (!status) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Unpaid</span>;
  const map = {
    paid_stripe: { label: 'Paid - Stripe', cls: 'bg-green-100 text-green-700' },
    professor_has: { label: 'Professor Has', cls: 'bg-amber-100 text-amber-700' },
    received: { label: 'Received', cls: 'bg-green-100 text-green-700' },
  };
  const s = map[status] || { label: status, cls: 'bg-gray-100 text-gray-500' };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function LabFeesPage() {
  const [activeTab, setActiveTab] = useState('create');

  const { data: countsData } = useQuery({
    queryKey: ['lab-fee-counts'],
    queryFn: () => api.get('/lab-fees/counts').then(r => r.data),
    staleTime: 60 * 1000,
  });
  const counts = countsData?.data || {};

  const badgeMap = {
    create: counts.create_count || 0,
    payments: counts.unresolved_count || 0,
    followup: counts.outstanding_count || 0,
  };

  return (
    <AppShell>
      {/* Tab bar */}
      <div className="px-6 py-3 bg-white border-b border-gray-200 flex gap-1 flex-wrap items-center">
        <h1 className="text-lg font-bold text-gray-800 mr-4">Lab Fees</h1>
        {TABS.map(t => {
          const count = badgeMap[t.key] || 0;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === t.key ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {t.label}
              {count > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === t.key ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="bg-white min-h-[400px]">
        {activeTab === 'create' && <CreateLinksTab />}
        {activeTab === 'status' && <StatusTab />}
        {activeTab === 'payments' && <PaymentsTab />}
        {activeTab === 'followup' && <FollowUpTab />}
      </div>
    </AppShell>
  );
}
