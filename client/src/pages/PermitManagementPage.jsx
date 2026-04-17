import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime, formatCurrency } from '../lib/utils';

const STAGES = [
  { key: 'needs_permit', label: 'Needs Permit' },
  { key: 'pending_approval', label: 'Permit Approval' },
  { key: 'confirm_payment', label: 'Confirm Payment' },
  { key: 'payment_processing', label: 'Payment Processing' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
function getDays(p) { return DAY_KEYS.map((d, i) => p[d] ? DAYS[i] : null).filter(Boolean).join(', '); }

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text || ''); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="text-[9px] text-gray-300 hover:text-[#1e3a5f] ml-0.5" title="Copy">
      {copied ? '(copied)' : '(copy)'}
    </button>
  );
}

function DaysUntil({ date }) {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date(); now.setHours(0,0,0,0);
  const days = Math.ceil((d - now) / (1000*60*60*24));
  if (days < 0) return <span className="text-[10px] bg-red-600 text-white px-1 rounded font-bold">PAST DUE</span>;
  if (days <= 7) return <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded font-medium">{days}d away</span>;
  if (days <= 14) return <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded font-medium">{days}d away</span>;
  return <span className="text-[10px] text-gray-400">{days}d away</span>;
}

export default function PermitManagementPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('needs_permit');

  const { data, isLoading } = useQuery({
    queryKey: ['permits'],
    queryFn: () => api.get('/permits').then(r => r.data),
  });

  const { data: flaggedData } = useQuery({
    queryKey: ['permits-flagged'],
    queryFn: () => api.get('/permits/flagged').then(r => r.data),
    enabled: tab === 'needs_permit',
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-admin'],
    queryFn: () => api.get('/users?limit=200').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const adminUsers = (usersData?.data || []).filter(u => ['Admin', 'CEO'].includes(u.role_name));

  const bulkCreateMutation = useMutation({
    mutationFn: (ids) => api.post('/permits/bulk-create', { program_ids: ids }),
    onSuccess: () => { qc.invalidateQueries(['permits']); qc.invalidateQueries(['permits-flagged']); },
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/permits/${id}/advance`, body || {}),
    onSuccess: () => qc.invalidateQueries(['permits']),
  });

  const revertMutation = useMutation({
    mutationFn: (id) => api.patch(`/permits/${id}/revert`),
    onSuccess: () => qc.invalidateQueries(['permits']),
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/permits/${id}/payment`, data),
    onSuccess: () => qc.invalidateQueries(['permits']),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/permits/${id}/cancel`, data),
    onSuccess: () => qc.invalidateQueries(['permits']),
  });

  const allPermits = data?.data || [];
  const cfg = data?.config || {};
  const flagged = flaggedData?.data || [];
  const stageItems = allPermits.filter(p => p.stage === tab);

  const stageCounts = {};
  STAGES.forEach(s => { stageCounts[s.key] = allPermits.filter(p => p.stage === s.key).length; });

  return (
    <AppShell>
      <div className="bg-white border-b border-gray-200 px-6 pt-4 pb-0">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Permit Management</h1>
        <div className="flex gap-1">
          {STAGES.map(s => (
            <button key={s.key} onClick={() => setTab(s.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === s.key ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {s.label}
              {stageCounts[s.key] > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  tab === s.key ? 'bg-[#1e3a5f] text-white' : 'bg-gray-200 text-gray-600'
                }`}>{stageCounts[s.key]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {isLoading ? <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div> : (
          <>
            {/* ── NEEDS PERMIT ──────────────────────────────── */}
            {tab === 'needs_permit' && (
              <div className="space-y-4">
                {/* Flagged programs needing permits */}
                {flagged.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-amber-800">{flagged.length} programs need permits (within {cfg.permit_flag_days || 30} days)</h3>
                      <Button size="sm" onClick={() => bulkCreateMutation.mutate(flagged.map(f => f.id))}>
                        Create All Permit Requests
                      </Button>
                    </div>
                    <div className="text-xs text-amber-600 space-y-0.5">
                      {flagged.slice(0, 10).map(f => (
                        <div key={f.id}>{f.program_nickname} at {f.location_nickname} — starts {formatDate(f.first_session_date)}</div>
                      ))}
                      {flagged.length > 10 && <div>...and {flagged.length - 10} more</div>}
                    </div>
                  </div>
                )}

                {stageItems.length === 0 && flagged.length === 0 && (
                  <div className="bg-white rounded-lg border p-12 text-center text-gray-400">No permits to send right now</div>
                )}

                {stageItems.map(pr => (
                  <PermitCard key={pr.id} pr={pr} stage="needs_permit"
                    onAdvance={() => advanceMutation.mutate({ id: pr.id })} />
                ))}
              </div>
            )}

            {/* ── PENDING APPROVAL ─────────────────────────── */}
            {tab === 'pending_approval' && (
              <div className="space-y-3">
                {stageItems.length === 0 && <div className="bg-white rounded-lg border p-12 text-center text-gray-400">No permits awaiting approval</div>}
                {stageItems.map(pr => (
                  <PermitCard key={pr.id} pr={pr} stage="pending_approval" cfg={cfg}
                    onAdvance={() => advanceMutation.mutate({ id: pr.id })}
                    onRevert={() => revertMutation.mutate(pr.id)} />
                ))}
              </div>
            )}

            {/* ── CONFIRM PAYMENT ──────────────────────────── */}
            {tab === 'confirm_payment' && (
              <div className="space-y-3">
                {stageItems.length === 0 && <div className="bg-white rounded-lg border p-12 text-center text-gray-400">No permits in payment confirmation</div>}
                {stageItems.map(pr => (
                  <PaymentCard key={pr.id} pr={pr} cfg={cfg} adminUsers={adminUsers}
                    onAdvance={(body) => advanceMutation.mutate({ id: pr.id, body })}
                    onRevert={() => revertMutation.mutate(pr.id)}
                    onCancel={(data) => cancelMutation.mutate({ id: pr.id, ...data })} />
                ))}
              </div>
            )}

            {/* ── PAYMENT PROCESSING ──────────────────────── */}
            {tab === 'payment_processing' && (
              <div className="space-y-3">
                {stageItems.length === 0 && <div className="bg-white rounded-lg border p-12 text-center text-gray-400">No permits in payment processing</div>}
                {stageItems.map(pr => (
                  <FinalCard key={pr.id} pr={pr}
                    onPayment={(data) => paymentMutation.mutate({ id: pr.id, ...data })}
                    onRevert={() => revertMutation.mutate(pr.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

// Stage 1 & 2: Permit card with program details
function PermitCard({ pr, stage, cfg, onAdvance, onRevert }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Link to={`/programs/${pr.program_id}`} className="font-medium text-[#1e3a5f] hover:underline">{pr.program_nickname}</Link>
          <span className="text-xs text-gray-400">at</span>
          <span className="text-sm text-gray-700">{pr.location_nickname || '—'}</span>
          <DaysUntil date={pr.first_session_date} />
          {stage === 'pending_approval' && cfg?.permit_approval_flag_days && (() => {
            const d = new Date(pr.first_session_date);
            const now = new Date(); now.setHours(0,0,0,0);
            const days = Math.ceil((d - now) / (1000*60*60*24));
            return days <= parseInt(cfg.permit_approval_flag_days) ? <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded font-bold">ACTION NEEDED</span> : null;
          })()}
        </div>
        <div className="flex items-center gap-2">
          {onRevert && (
            <button onClick={() => onRevert()} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
          )}
          {confirming ? (
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={() => { onAdvance(); setConfirming(false); }}>
                {stage === 'needs_permit' ? 'Yes, Mark Sent' : 'Yes, Approve'}
              </Button>
              <button onClick={() => setConfirming(false)} className="text-xs text-gray-400">Cancel</button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setConfirming(true)}>
              {stage === 'needs_permit' ? 'Mark Sent' : 'Approve Permit'}
            </Button>
          )}
        </div>
      </div>
      <div className="px-4 py-3 grid grid-cols-6 gap-3 text-xs">
        <div><span className="text-gray-400">Day(s):</span> <span className="text-gray-700">{getDays(pr)}</span><CopyBtn text={getDays(pr)} /></div>
        <div><span className="text-gray-400">Time:</span> <span className="text-gray-700">{pr.start_time ? formatTime(pr.start_time) : '—'}</span><CopyBtn text={pr.start_time ? formatTime(pr.start_time) : ''} /></div>
        <div><span className="text-gray-400">Cost:</span> <span className="text-gray-700">{pr.parent_cost != null ? formatCurrency(pr.parent_cost) : '—'}</span><CopyBtn text={pr.parent_cost || ''} /></div>
        <div><span className="text-gray-400">Class:</span> <span className="text-gray-700">{pr.formal_class_name || pr.class_name || '—'}</span><CopyBtn text={pr.formal_class_name || pr.class_name || ''} /></div>
        <div><span className="text-gray-400">Grades:</span> <span className="text-gray-700">{pr.grade_range || '—'}</span><CopyBtn text={pr.grade_range || ''} /></div>
        <div><span className="text-gray-400">Dates:</span> <span className="text-gray-700">{formatDate(pr.first_session_date)} – {formatDate(pr.last_session_date)}</span><CopyBtn text={`${formatDate(pr.first_session_date)} – ${formatDate(pr.last_session_date)}`} /></div>
      </div>
      {pr.contract_permit_notes && (
        <div className="px-4 pb-3">
          <div className="text-[10px] text-gray-400">Permit Notes:</div>
          <div className="text-xs text-gray-600">{pr.contract_permit_notes}<CopyBtn text={pr.contract_permit_notes} /></div>
        </div>
      )}
      {pr.session_dates?.length > 0 && (
        <div className="px-4 pb-3">
          <div className="text-[10px] text-gray-400">Session Dates:</div>
          <div className="text-xs text-gray-600 flex flex-wrap gap-1">
            {pr.session_dates.map((d, i) => <span key={i} className="bg-gray-100 px-1 rounded">{formatDate(d)}</span>)}
            <CopyBtn text={pr.session_dates.map(d => formatDate(d)).join(', ')} />
          </div>
        </div>
      )}
      {pr.related_programs?.length > 0 && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-2">
          <div className="text-[10px] text-amber-600 font-medium">Also starting at this location within 30 days:</div>
          {pr.related_programs.map(rp => (
            <div key={rp.id} className="text-xs text-gray-600">{rp.program_nickname} — {formatDate(rp.first_session_date)} {getDays(rp)} {rp.formal_class_name || ''}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// Stage 3: Confirm Payment
function PaymentCard({ pr, cfg, adminUsers, onAdvance, onRevert, onCancel }) {
  const [requestTo, setRequestTo] = useState('2'); // default Admin/Nick
  const [confirming, setConfirming] = useState(false);
  const cancelled = pr.class_status_name?.toLowerCase().includes('cancel');
  const enrollmentMet = pr.number_enrolled >= (pr.minimum_students || 0);
  const flagDays = parseInt(cfg?.permit_payment_flag_days) || 7;
  const d = new Date(pr.first_session_date);
  const now = new Date(); now.setHours(0,0,0,0);
  const daysAway = Math.ceil((d - now) / (1000*60*60*24));
  const needsAction = daysAway <= flagDays;

  return (
    <div className={`bg-white rounded-lg border overflow-hidden ${cancelled ? 'border-red-200' : needsAction ? 'border-amber-200' : 'border-gray-200'}`}>
      <div className="px-4 py-3 flex items-center justify-between bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Link to={`/programs/${pr.program_id}`} className="font-medium text-[#1e3a5f] hover:underline">{pr.program_nickname}</Link>
          <span className="text-sm text-gray-700">{pr.location_nickname || '—'}</span>
          <DaysUntil date={pr.first_session_date} />
          {cancelled && <span className="text-[10px] bg-red-600 text-white px-1 rounded font-bold">CANCELLED — Cancel permit & request refund</span>}
          {!cancelled && !enrollmentMet && <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded font-medium">Min not met ({pr.number_enrolled || 0}/{pr.minimum_students})</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onRevert()} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="grid grid-cols-4 gap-3 text-xs mb-3">
          <div><span className="text-gray-400">Status:</span> <span className={cancelled ? 'text-red-600 font-medium' : 'text-gray-700'}>{pr.class_status_name}</span></div>
          <div><span className="text-gray-400">Enrolled:</span> <span className="text-gray-700">{pr.number_enrolled || 0} / {pr.minimum_students || '—'} min</span></div>
          <div><span className="text-gray-400">Cost:</span> <span className="text-gray-700">{formatCurrency(pr.parent_cost)}</span></div>
          <div><span className="text-gray-400">Our Cut:</span> <span className="text-gray-700">{formatCurrency(pr.our_cut)}</span></div>
        </div>

        {cancelled ? (
          <div className="flex gap-2">
            {!pr.cancel_permit && <Button size="sm" variant="secondary" onClick={() => onCancel({ cancel_permit: true, refund_requested: true })}>Cancel Permit & Request Refund</Button>}
            {pr.cancel_permit && <span className="text-xs text-red-600 font-medium">Cancellation requested</span>}
          </div>
        ) : !enrollmentMet ? (
          <div className="flex gap-2">
            {!pr.cancel_permit && <Button size="sm" variant="secondary" onClick={() => onCancel({ cancel_permit: true, refund_requested: true })}>Cancel & Refund (min not met)</Button>}
            {pr.cancel_permit && <span className="text-xs text-amber-600 font-medium">Cancellation requested</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {confirming ? (
              <>
                <Select value={requestTo} onChange={e => setRequestTo(e.target.value)} className="w-48 text-xs">
                  {adminUsers.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                </Select>
                <Button size="sm" onClick={() => { onAdvance({ payment_request_to_user_id: parseInt(requestTo) }); setConfirming(false); }}>
                  Send Payment Request
                </Button>
                <button onClick={() => setConfirming(false)} className="text-xs text-gray-400">Cancel</button>
              </>
            ) : (
              <Button size="sm" onClick={() => setConfirming(true)}>Request Payment</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Stage 4: Payment Processing
function FinalCard({ pr, onPayment, onRevert }) {
  const [amount, setAmount] = useState('');
  const [addToProgram, setAddToProgram] = useState(false);
  const [cutType, setCutType] = useState('fixed');
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Link to={`/programs/${pr.program_id}`} className="font-medium text-[#1e3a5f] hover:underline">{pr.program_nickname}</Link>
          <span className="text-sm text-gray-700">{pr.location_nickname || '—'}</span>
          {pr.payment_request_to_name && <span className="text-xs text-gray-400">Requested by {pr.payment_requested_by_name} → {pr.payment_request_to_name}</span>}
        </div>
        <button onClick={() => onRevert()} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
      <div className="px-4 py-3">
        {confirming ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Input label="Payment Amount" type="number" step="0.01" prefix="$" value={amount}
                onChange={e => setAmount(e.target.value)} className="w-32" />
              <label className="flex items-center gap-1.5 text-xs cursor-pointer mt-5">
                <input type="checkbox" checked={addToProgram} onChange={e => setAddToProgram(e.target.checked)} className="accent-[#1e3a5f]" />
                Add to program's admin cut
              </label>
              {addToProgram && (
                <Select label="Cut Type" value={cutType} onChange={e => setCutType(e.target.value)} className="w-36">
                  <option value="fixed">Fixed (total)</option>
                  <option value="per_session">Per Session</option>
                </Select>
              )}
            </div>
            {addToProgram && amount && (
              <div className="text-xs text-gray-500">
                {cutType === 'per_session' && pr.session_count
                  ? `Will add $${(parseFloat(amount) / pr.session_count).toFixed(2)}/session to our cut`
                  : `Will add $${parseFloat(amount).toFixed(2)} to our cut`}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onPayment({ payment_amount: amount, add_to_program: addToProgram, payment_cut_type: addToProgram ? cutType : null })}
                disabled={!amount}>Mark Payment Made</Button>
              <button onClick={() => setConfirming(false)} className="text-xs text-gray-400">Cancel</button>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={() => setConfirming(true)}>Mark Payment Made</Button>
        )}
      </div>
    </div>
  );
}
