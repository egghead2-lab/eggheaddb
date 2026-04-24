import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import { formatDate, formatCurrency } from '../lib/utils';

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700',
  approved_minor: 'bg-green-100 text-green-700',
  approved_major: 'bg-violet-100 text-violet-700',
  rejected: 'bg-gray-100 text-gray-400',
  fixed: 'bg-emerald-100 text-emerald-700',
};

const BUG_LABELS = { new: 'New', approved_minor: 'Minor ($2)', approved_major: 'Major ($4)', rejected: 'Rejected', fixed: 'Fixed' };
const IDEA_LABELS = { new: 'New', approved_minor: 'Minor QOL', approved_major: 'Major QOL', rejected: 'Rejected', fixed: 'Implemented' };

export default function BugBountyPage() {
  const { user } = useAuth();
  const isAdmin = ['Admin', 'CEO'].includes(user?.role);
  const qc = useQueryClient();
  const [tab, setTab] = useState('bug');  // 'bug' | 'idea'
  const [statusFilter, setStatusFilter] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);
  const [showAmounts, setShowAmounts] = useState(false);

  const { data: lbData } = useQuery({
    queryKey: ['bug-leaderboard'],
    queryFn: () => api.get('/bug-reports/leaderboard').then(r => r.data),
  });
  const leaderboard = lbData?.data || [];
  const totalPayout = lbData?.totalPayout || 0;

  const { data: amountsData } = useQuery({
    queryKey: ['bug-amounts'],
    queryFn: () => api.get('/bug-reports/amounts').then(r => r.data),
  });
  const amounts = amountsData?.data || { bug_minor: 2, bug_major: 4, idea_minor: 1, idea_major: 3 };

  const { data, isLoading } = useQuery({
    queryKey: ['bug-reports', statusFilter, tab],
    queryFn: () => api.get('/bug-reports', { params: { status: statusFilter || undefined, category: tab } }).then(r => r.data),
  });
  const allBugs = data?.data || [];

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/bug-reports/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bug-reports'] }); qc.invalidateQueries({ queryKey: ['bug-leaderboard'] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/bug-reports/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bug-reports'] }); qc.invalidateQueries({ queryKey: ['bug-leaderboard'] }); },
  });

  const markPaidMutation = useMutation({
    mutationFn: () => api.post('/bug-reports/mark-paid'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bug-reports'] }); qc.invalidateQueries({ queryKey: ['bug-leaderboard'] }); setConfirmPay(false); },
  });

  const activeBugs = allBugs.filter(b => !b.fixed_at && b.status !== 'rejected');
  const closedBugs = allBugs.filter(b => b.fixed_at || b.status === 'rejected');
  const unpaidCount = allBugs.filter(b => ['approved_minor', 'approved_major'].includes(b.status) && !b.paid_at).length;

  const labelsForTab = tab === 'idea' ? IDEA_LABELS : BUG_LABELS;

  return (
    <AppShell>
      <PageHeader title="Bug Bounty" action={
        <div className="flex items-center gap-2">
          {isAdmin && unpaidCount > 0 && (
            confirmPay ? (
              <div className="flex items-center gap-1">
                <Button size="sm" onClick={() => markPaidMutation.mutate()} disabled={markPaidMutation.isPending}>
                  {markPaidMutation.isPending ? 'Marking...' : `Yes, Mark ${unpaidCount} Paid`}
                </Button>
                <button onClick={() => setConfirmPay(false)} className="text-xs text-gray-400">Cancel</button>
              </div>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setConfirmPay(true)}>
                Mark All Paid ({unpaidCount})
              </Button>
            )
          )}
          {isAdmin && (
            <button type="button" onClick={() => setShowAmounts(v => !v)}
              className="text-[10px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f]">
              Award amounts
            </button>
          )}
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-36">
            <option value="">All</option>
            <option value="new">New</option>
            <option value="approved_minor">{tab === 'idea' ? 'Minor QOL' : 'Minor'}</option>
            <option value="approved_major">{tab === 'idea' ? 'Major QOL' : 'Major'}</option>
            <option value="fixed">{tab === 'idea' ? 'Implemented' : 'Fixed'}</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
      } />

      <div className="p-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {[
            { key: 'bug', label: 'Bugs' },
            { key: 'idea', label: 'Ideas / QOL' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Admin: edit award amounts */}
        {isAdmin && showAmounts && <AmountsEditor amounts={amounts} onClose={() => setShowAmounts(false)} />}

        {/* Leaderboard */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">This Month's Leaderboard</h2>
            <div className="text-xs text-gray-500">Total payout: <span className="font-bold text-green-700">${totalPayout}</span> / $1,000 cap</div>
          </div>
          <div className="p-4">
            {leaderboard.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-4">No approved items this month yet</div>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry, i) => (
                  <div key={entry.user_id} className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-white' : i === 2 ? 'bg-amber-700 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>{i + 1}</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{entry.name}</div>
                      <div className="text-xs text-gray-400">
                        {entry.bug_minor_count > 0 && `${entry.bug_minor_count} bug-minor`}
                        {entry.bug_major_count > 0 && (entry.bug_minor_count ? ' · ' : '') + `${entry.bug_major_count} bug-major`}
                        {entry.idea_minor_count > 0 && ((entry.bug_minor_count || entry.bug_major_count) ? ' · ' : '') + `${entry.idea_minor_count} idea-minor`}
                        {entry.idea_major_count > 0 && ((entry.bug_minor_count || entry.bug_major_count || entry.idea_minor_count) ? ' · ' : '') + `${entry.idea_major_count} idea-major`}
                        {' · '}{entry.total_submitted} submitted
                      </div>
                    </div>
                    <div className="text-sm font-bold text-green-700">${entry.earnings}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {isAdmin && <AwardSection />}

        {/* Active */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
        ) : activeBugs.length === 0 && closedBugs.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No {tab === 'idea' ? 'ideas' : 'bug reports'} yet</div>
        ) : (
          <>
            {activeBugs.length > 0 && (
              <div className="space-y-2 mb-6">
                {activeBugs.map(b => (
                  <BugCard key={b.id} bug={b} isAdmin={isAdmin} currentUserId={user?.id}
                    labels={labelsForTab} tab={tab}
                    onUpdate={updateMutation} onDelete={deleteMutation} />
                ))}
              </div>
            )}
            {closedBugs.length > 0 && (
              <div>
                <button onClick={() => setShowClosed(!showClosed)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 mb-2">
                  <span>{showClosed ? '▾' : '▸'}</span>
                  <span>{closedBugs.length} fixed/rejected {tab === 'idea' ? 'idea' : 'bug'}{closedBugs.length !== 1 ? 's' : ''}</span>
                </button>
                {showClosed && (
                  <div className="space-y-2 opacity-60">
                    {closedBugs.map(b => (
                      <BugCard key={b.id} bug={b} isAdmin={isAdmin} currentUserId={user?.id}
                        labels={labelsForTab} tab={tab}
                        onUpdate={updateMutation} onDelete={deleteMutation} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function BugCard({ bug: b, isAdmin, currentUserId, labels, tab, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(b.msg_count > 0);
  const isOwn = currentUserId && b.submitted_by_user_id === currentUserId;
  const canMessage = isAdmin || isOwn;
  const minorStatusLabel = tab === 'idea' ? 'Minor QOL' : 'Minor';
  const majorStatusLabel = tab === 'idea' ? 'Major QOL' : 'Major';
  const fixedLabel = tab === 'idea' ? 'Implemented' : 'Fixed';

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{b.description}</div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
            <span>{b.submitted_by_name}</span>
            <span>{formatDate(b.ts_inserted)}</span>
            {b.page_name && <span className="font-mono text-[10px] bg-gray-100 px-1 rounded">{b.page_name}</span>}
            {b.paid_at && <span className="text-green-600 font-medium">Paid {formatDate(b.paid_at)}</span>}
            {!b.paid_at && ['approved_minor', 'approved_major'].includes(b.status) && (
              <span className="text-amber-500 font-medium">Unpaid</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${STATUS_COLORS[b.status]}`}>
            {labels[b.status]}
          </span>
          {b.fixed_at && <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700">{fixedLabel}</span>}
          {isAdmin && (
            <div className="flex gap-1">
              {b.status !== 'approved_minor' && (
                <button onClick={() => onUpdate.mutate({ id: b.id, status: 'approved_minor' })}
                  className="text-[10px] text-green-600 border border-green-200 px-1.5 py-0.5 rounded hover:bg-green-50">{minorStatusLabel}</button>
              )}
              {b.status !== 'approved_major' && (
                <button onClick={() => onUpdate.mutate({ id: b.id, status: 'approved_major' })}
                  className="text-[10px] text-violet-600 border border-violet-200 px-1.5 py-0.5 rounded hover:bg-violet-50">{majorStatusLabel}</button>
              )}
              {b.status !== 'rejected' && (
                <button onClick={() => onUpdate.mutate({ id: b.id, status: 'rejected' })}
                  className="text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-50">Reject</button>
              )}
              {!b.fixed_at ? (
                <button onClick={() => onUpdate.mutate({ id: b.id, fixed: true })}
                  className="text-[10px] text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded hover:bg-emerald-50">{fixedLabel}</button>
              ) : (
                <button onClick={() => onUpdate.mutate({ id: b.id, fixed: false })}
                  className="text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-50">Un-{fixedLabel.toLowerCase()}</button>
              )}
              <ConfirmButton onConfirm={() => onDelete.mutate(b.id)}
                className="text-[10px] text-red-400 hover:text-red-600">×</ConfirmButton>
            </div>
          )}
        </div>
      </div>

      {/* Reply toggle */}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => setExpanded(v => !v)}
          className="text-[11px] px-2 py-0.5 rounded border border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f]/5 font-medium">
          {expanded ? 'Hide' : 'Reply'}
        </button>
        {b.msg_count > 0 && (
          <span className="text-[10px] text-gray-400">{b.msg_count} message{b.msg_count !== 1 ? 's' : ''} · Last {formatDate(b.last_msg_at)}</span>
        )}
      </div>
      {expanded && <MessageThread bugId={b.id} canPost={canMessage} isAdmin={isAdmin} />}
    </div>
  );
}

function MessageThread({ bugId, canPost, isAdmin }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['bug-messages', bugId],
    queryFn: () => api.get(`/bug-reports/${bugId}/messages`).then(r => r.data),
  });
  const messages = data?.data || [];

  const postMut = useMutation({
    mutationFn: () => api.post(`/bug-reports/${bugId}/messages`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-messages', bugId] });
      qc.invalidateQueries({ queryKey: ['bug-reports'] });
      setBody('');
    },
    onError: (e) => alert(e.response?.data?.error || 'Failed to post'),
  });

  const delMut = useMutation({
    mutationFn: (msgId) => api.delete(`/bug-reports/messages/${msgId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bug-messages', bugId] }),
  });

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
      {isLoading ? <Spinner className="w-4 h-4" /> : messages.length === 0 ? (
        <div className="text-[11px] text-gray-400 italic">No messages yet.</div>
      ) : (
        messages.map(m => (
          <div key={m.id} className={`rounded-lg px-3 py-2 text-sm border ${m.from_admin ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
            <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
              <span><strong className="text-gray-700">{m.author_name || 'User'}</strong>{m.from_admin ? ' · Admin' : ''}</span>
              <span className="flex items-center gap-2">
                <span>{formatDate(m.ts_inserted)}</span>
                {(isAdmin || m.user_id) && (
                  <button onClick={() => { if (confirm('Delete this message?')) delMut.mutate(m.id); }}
                    className="text-red-300 hover:text-red-600">×</button>
                )}
              </span>
            </div>
            <div className="text-gray-700 whitespace-pre-wrap">{m.body}</div>
          </div>
        ))
      )}

      {canPost && (
        <div className="pt-1">
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
            placeholder={isAdmin ? 'Reply to the submitter (they get an email)...' : 'Reply (the admins get an email)...'}
            className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f] resize-none" />
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => body.trim() && postMut.mutate()} disabled={!body.trim() || postMut.isPending}
              className="text-xs px-3 py-1 rounded bg-[#1e3a5f] text-white font-medium hover:bg-[#152a47] disabled:opacity-50">
              {postMut.isPending ? 'Posting...' : 'Reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AmountsEditor({ amounts, onClose }) {
  const qc = useQueryClient();
  const [vals, setVals] = useState(amounts);

  const saveMut = useMutation({
    mutationFn: () => api.put('/bug-reports/amounts', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-amounts'] });
      qc.invalidateQueries({ queryKey: ['bug-leaderboard'] });
      onClose();
    },
  });

  return (
    <div className="mb-4 bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Award Amounts (per approved item)</h3>
        <button onClick={onClose} className="text-xs text-gray-400">Close</button>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Input label="Bug Minor $" type="number" step="0.5" value={vals.bug_minor}
          onChange={e => setVals({ ...vals, bug_minor: parseFloat(e.target.value) || 0 })} />
        <Input label="Bug Major $" type="number" step="0.5" value={vals.bug_major}
          onChange={e => setVals({ ...vals, bug_major: parseFloat(e.target.value) || 0 })} />
        <Input label="Idea Minor QOL $" type="number" step="0.5" value={vals.idea_minor}
          onChange={e => setVals({ ...vals, idea_minor: parseFloat(e.target.value) || 0 })} />
        <Input label="Idea Major QOL $" type="number" step="0.5" value={vals.idea_major}
          onChange={e => setVals({ ...vals, idea_major: parseFloat(e.target.value) || 0 })} />
      </div>
      <div className="mt-3">
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? 'Saving...' : 'Save Amounts'}
        </Button>
      </div>
    </div>
  );
}

function AwardSection() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const { data: usersData } = useQuery({
    queryKey: ['users-staff'],
    queryFn: () => api.get('/users?limit=200').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const staffUsers = (usersData?.data || []).filter(u => !['Professor', 'Candidate'].includes(u.role_name));

  const { data: awardsData } = useQuery({
    queryKey: ['bug-awards'],
    queryFn: () => api.get('/bug-reports/awards').then(r => r.data),
  });
  const awards = awardsData?.data || [];

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/bug-reports/awards', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-awards'] });
      qc.invalidateQueries({ queryKey: ['bug-leaderboard'] });
      setUserId(''); setAmount(''); setDescription(''); setShowForm(false);
    },
  });

  const selectedUser = staffUsers.find(u => String(u.id) === userId);

  return (
    <div className="bg-white rounded-lg border border-gray-200 mb-6">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">Bonus Awards</h2>
        <button onClick={() => setShowForm(!showForm)} className="text-xs text-[#1e3a5f] hover:underline">
          {showForm ? 'Cancel' : '+ Issue Award'}
        </button>
      </div>
      {showForm && (
        <div className="px-4 py-3 border-b border-gray-100 flex items-end gap-3">
          <Select label="Person" value={userId} onChange={e => setUserId(e.target.value)} className="w-48">
            <option value="">Select...</option>
            {staffUsers.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
          </Select>
          <Input label="Amount" type="number" step="0.01" prefix="$" value={amount} onChange={e => setAmount(e.target.value)} className="w-24" />
          <Input label="Description" value={description} onChange={e => setDescription(e.target.value)} className="flex-1" placeholder="Reason for award" />
          <Button onClick={() => createMutation.mutate({
            user_id: parseInt(userId),
            user_name: selectedUser ? `${selectedUser.first_name} ${selectedUser.last_name}` : '',
            amount: parseFloat(amount),
            description,
          })} disabled={!userId || !amount || createMutation.isPending}>
            {createMutation.isPending ? 'Adding...' : 'Add'}
          </Button>
        </div>
      )}
      {awards.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {awards.slice(0, 10).map(a => (
            <div key={a.id} className="px-4 py-2 flex items-center gap-3 text-xs">
              <span className="font-medium text-gray-800">{a.user_name}</span>
              <span className="font-bold text-green-700">${parseFloat(a.amount).toFixed(2)}</span>
              <span className="text-gray-500 flex-1">{a.description}</span>
              {a.paid_at ? <span className="text-green-600">Paid {formatDate(a.paid_at)}</span> : <span className="text-amber-500">Unpaid</span>}
              <span className="text-gray-400">{formatDate(a.ts_inserted)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-4 text-xs text-gray-400 text-center">No awards yet</div>
      )}
    </div>
  );
}
