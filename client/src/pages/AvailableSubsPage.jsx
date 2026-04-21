import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime, formatCurrency } from '../lib/utils';

export default function AvailableSubsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['available-subs', 30],
    queryFn: () => api.get('/schedule/available-subs', { params: { days: 30 } }).then(r => r.data),
    refetchInterval: 60000,
  });
  const subs = data?.data || [];

  const claimMutation = useMutation({
    mutationFn: ({ session_id, role }) => api.post('/schedule/claim-sub', { session_id, role }),
    onSuccess: () => { qc.invalidateQueries(['available-subs']); qc.invalidateQueries(['my-claims']); },
  });

  const { data: myClaimsData } = useQuery({
    queryKey: ['my-claims'],
    queryFn: () => api.get('/schedule/my-claims').then(r => r.data),
    refetchInterval: 60000,
  });
  const myClaims = myClaimsData?.data || [];
  const pendingClaims = myClaims.filter(c => c.status === 'pending');
  const rejectedClaims = myClaims.filter(c => c.status === 'rejected');

  // Group by date
  const byDate = {};
  subs.forEach(s => {
    const d = (s.session_date || '').split('T')[0];
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(s);
  });
  const dateKeys = Object.keys(byDate).sort();

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">Available Subs in Your Area</h1>
          <p className="text-sm text-gray-500">Next 30 days · {subs.length} open</p>
        </div>

        {/* My claims — pending + recently rejected */}
        {(pendingClaims.length > 0 || rejectedClaims.length > 0) && (
          <div className="mb-5">
            <h2 className="text-sm font-bold text-gray-800 mb-2">My Sub Claims</h2>
            <div className="space-y-2">
              {pendingClaims.map(c => {
                const dateStr = (c.session_date || '').split('T')[0];
                return (
                  <div key={c.claim_id} className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm">{c.program_nickname}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {formatDate(dateStr)}{c.session_time || c.start_time ? ` at ${formatTime(c.session_time || c.start_time)}` : ''}
                          {' · '}{c.role}
                        </div>
                        <div className="text-xs text-amber-700 font-medium mt-1">Requested — awaiting scheduler approval</div>
                      </div>
                      {c.expected_pay > 0 && <span className="text-sm font-medium text-gray-500">{formatCurrency(c.expected_pay)}</span>}
                    </div>
                  </div>
                );
              })}
              {rejectedClaims.map(c => {
                const dateStr = (c.session_date || '').split('T')[0];
                return (
                  <div key={c.claim_id} className="bg-red-50 rounded-xl border border-red-200 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-600 text-sm line-through">{c.program_nickname}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatDate(dateStr)}{c.session_time || c.start_time ? ` at ${formatTime(c.session_time || c.start_time)}` : ''}
                        {' · '}{c.role}
                      </div>
                      <div className="text-xs text-red-700 mt-1"><span className="font-medium">Declined</span>{c.reject_reason && ` — ${c.reject_reason}`}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : subs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-lg mb-1">No subs available</div>
            <div className="text-sm">Check back later — new sub requests appear here as they come in.</div>
          </div>
        ) : (
          <div className="space-y-5">
            {dateKeys.map(date => (
              <div key={date}>
                <div className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">{formatDate(date)}</div>
                <div className="space-y-2">
                  {byDate[date].map(sub => {
                    const isClaiming = claimMutation.isPending && claimMutation.variables?.session_id === sub.session_id;
                    const justClaimed = claimMutation.isSuccess && claimMutation.variables?.session_id === sub.session_id;
                    const claimError = claimMutation.isError && claimMutation.variables?.session_id === sub.session_id;
                    return (
                      <div key={`${sub.session_id}-${sub.role_needing_sub}`}
                        className="bg-white rounded-xl border border-blue-200 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 text-sm truncate">{sub.program_nickname}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {sub.session_time || sub.start_time ? formatTime(sub.session_time || sub.start_time) : 'Time TBD'}
                              {sub.class_length_minutes ? ` · ${sub.class_length_minutes} min` : ''}
                              {sub.location_nickname ? ` · ${sub.location_nickname}` : ''}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {sub.role_needing_sub} sub for {sub.off_professor_name}
                              {sub.reason_name ? ` — ${sub.reason_name}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 ml-3 shrink-0">
                            {sub.expected_pay > 0 && (
                              <span className="text-sm font-medium text-green-700">{formatCurrency(sub.expected_pay)}</span>
                            )}
                            <button onClick={() => claimMutation.mutate({ session_id: sub.session_id, role: sub.role_needing_sub })}
                              disabled={isClaiming || justClaimed}
                              className="px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-white text-xs font-medium hover:bg-[#152a47] active:scale-95 transition-all disabled:opacity-50">
                              {isClaiming ? '...' : justClaimed ? 'Claimed' : 'Claim Sub'}
                            </button>
                          </div>
                        </div>
                        {justClaimed && <div className="text-xs text-green-600 mt-1">Claimed! Awaiting scheduler approval.</div>}
                        {claimError && <div className="text-xs text-red-600 mt-1">{claimMutation.error?.response?.data?.error || 'Failed to claim'}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
