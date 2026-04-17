import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import { formatDate } from '../lib/utils';

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700',
  approved_minor: 'bg-green-100 text-green-700',
  approved_major: 'bg-violet-100 text-violet-700',
  rejected: 'bg-gray-100 text-gray-400',
  fixed: 'bg-emerald-100 text-emerald-700',
};
const STATUS_LABELS = { new: 'New', approved_minor: 'Minor ($2)', approved_major: 'Major ($4)', rejected: 'Rejected', fixed: 'Fixed' };

export default function BugBountyPage() {
  const { user } = useAuth();
  const isAdmin = ['Admin', 'CEO'].includes(user?.role);
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);

  const { data: lbData } = useQuery({
    queryKey: ['bug-leaderboard'],
    queryFn: () => api.get('/bug-reports/leaderboard').then(r => r.data),
  });
  const leaderboard = lbData?.data || [];
  const totalPayout = lbData?.totalPayout || 0;

  const { data, isLoading } = useQuery({
    queryKey: ['bug-reports', statusFilter],
    queryFn: () => api.get('/bug-reports', { params: { status: statusFilter || undefined } }).then(r => r.data),
  });
  const allBugs = data?.data || [];

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/bug-reports/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['bug-reports']); qc.invalidateQueries(['bug-leaderboard']); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/bug-reports/${id}`),
    onSuccess: () => { qc.invalidateQueries(['bug-reports']); qc.invalidateQueries(['bug-leaderboard']); },
  });

  const markPaidMutation = useMutation({
    mutationFn: () => api.post('/bug-reports/mark-paid'),
    onSuccess: () => { qc.invalidateQueries(['bug-reports']); qc.invalidateQueries(['bug-leaderboard']); setConfirmPay(false); },
  });

  // Split active vs closed — fixed is now a separate flag, not a status
  const activeBugs = allBugs.filter(b => !b.fixed_at && b.status !== 'rejected');
  const closedBugs = allBugs.filter(b => b.fixed_at || b.status === 'rejected');
  const unpaidCount = allBugs.filter(b => ['approved_minor', 'approved_major'].includes(b.status) && !b.paid_at).length;

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
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-36">
            <option value="">All</option>
            <option value="new">New</option>
            <option value="approved_minor">Minor</option>
            <option value="approved_major">Major</option>
            <option value="fixed">Fixed</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
      } />

      <div className="p-6">
        {/* Leaderboard */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">This Month's Leaderboard</h2>
            <div className="text-xs text-gray-500">Total payout: <span className="font-bold text-green-700">${totalPayout}</span> / $1,000 cap</div>
          </div>
          <div className="p-4">
            {leaderboard.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-4">No approved bugs this month yet</div>
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
                        {entry.minor_count > 0 && `${entry.minor_count} minor`}
                        {entry.minor_count > 0 && entry.major_count > 0 && ' · '}
                        {entry.major_count > 0 && `${entry.major_count} major`}
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

        {/* Admin Awards */}
        {isAdmin && <AwardSection />}

        {/* Active bugs */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
        ) : activeBugs.length === 0 && closedBugs.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No bug reports</div>
        ) : (
          <>
            {activeBugs.length > 0 && (
              <div className="space-y-2 mb-6">
                {activeBugs.map(b => (
                  <BugCard key={b.id} bug={b} isAdmin={isAdmin}
                    onUpdate={updateMutation} onDelete={deleteMutation} />
                ))}
              </div>
            )}

            {/* Closed bugs — collapsible */}
            {closedBugs.length > 0 && (
              <div>
                <button onClick={() => setShowClosed(!showClosed)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 mb-2">
                  <span>{showClosed ? '▾' : '▸'}</span>
                  <span>{closedBugs.length} fixed/rejected bug{closedBugs.length !== 1 ? 's' : ''}</span>
                </button>
                {showClosed && (
                  <div className="space-y-2 opacity-60">
                    {closedBugs.map(b => (
                      <BugCard key={b.id} bug={b} isAdmin={isAdmin}
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

function BugCard({ bug: b, isAdmin, onUpdate, onDelete }) {
  const [responding, setResponding] = useState(false);
  const [notes, setNotes] = useState(b.admin_notes || '');

  const saveNotes = () => {
    onUpdate.mutate({ id: b.id, admin_notes: notes });
    setResponding(false);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm text-gray-800">{b.description}</div>
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
            {STATUS_LABELS[b.status]}
          </span>
          {b.fixed_at && <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700">Fixed</span>}
          {isAdmin && (
            <div className="flex gap-1">
              {b.status !== 'approved_minor' && (
                <button onClick={() => onUpdate.mutate({ id: b.id, status: 'approved_minor' })}
                  className="text-[10px] text-green-600 border border-green-200 px-1.5 py-0.5 rounded hover:bg-green-50">Minor</button>
              )}
              {b.status !== 'approved_major' && (
                <button onClick={() => onUpdate.mutate({ id: b.id, status: 'approved_major' })}
                  className="text-[10px] text-violet-600 border border-violet-200 px-1.5 py-0.5 rounded hover:bg-violet-50">Major</button>
              )}
              {b.status !== 'rejected' && (
                <button onClick={() => onUpdate.mutate({ id: b.id, status: 'rejected' })}
                  className="text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-50">Reject</button>
              )}
              {!b.fixed_at ? (
                <button onClick={() => onUpdate.mutate({ id: b.id, fixed: true })}
                  className="text-[10px] text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded hover:bg-emerald-50">Fixed</button>
              ) : (
                <button onClick={() => onUpdate.mutate({ id: b.id, fixed: false })}
                  className="text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-50">Unfixed</button>
              )}
              {b.status !== 'new' && (
                <button onClick={() => onUpdate.mutate({ id: b.id, status: 'new' })}
                  className="text-[10px] text-blue-500 border border-blue-200 px-1.5 py-0.5 rounded hover:bg-blue-50">Reset</button>
              )}
              <button onClick={() => setResponding(r => !r)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  responding ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'text-[#1e3a5f] border-[#1e3a5f]/30 hover:bg-[#1e3a5f]/5'
                }`}>Reply</button>
              <ConfirmButton onConfirm={() => onDelete.mutate(b.id)}
                className="text-[10px] text-red-400 hover:text-red-600">×</ConfirmButton>
            </div>
          )}
        </div>
      </div>

      {b.admin_notes && !responding && (
        <div className="mt-2 px-3 py-2 bg-gray-50 rounded border border-gray-100 text-xs text-gray-600">
          <span className="font-medium text-gray-500">Admin response:</span> {b.admin_notes}
        </div>
      )}

      {isAdmin && responding && (
        <div className="mt-2">
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Write a response to this bug report..."
            rows={2}
            className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f] resize-none" />
          <div className="flex items-center gap-2 mt-1">
            <button onClick={saveNotes} disabled={onUpdate.isPending}
              className="text-xs px-3 py-1 rounded bg-[#1e3a5f] text-white font-medium hover:bg-[#152a47] disabled:opacity-50 transition-colors">
              {onUpdate.isPending ? 'Saving...' : 'Save Response'}
            </button>
            <button onClick={() => { setResponding(false); setNotes(b.admin_notes || ''); }}
              className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        </div>
      )}
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
  const unpaidAwards = awards.filter(a => !a.paid_at);

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/bug-reports/awards', data),
    onSuccess: () => {
      qc.invalidateQueries(['bug-awards']);
      qc.invalidateQueries(['bug-leaderboard']);
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
