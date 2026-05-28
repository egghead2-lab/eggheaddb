import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import { formatDate } from '../lib/utils';

export default function OnboardingRemindersPage() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-reminders-due'],
    queryFn: () => api.get('/onboarding/reminders/due').then(r => r.data),
  });
  const rows = data?.data || [];

  const sendMutation = useMutation({
    mutationFn: (candidateId) => api.post(`/onboarding/reminders/${candidateId}/send`).then(r => r.data),
    onSuccess: (res) => {
      toast.success(`Reminder sent (stage ${res.data?.stage || res.stage})`);
      qc.invalidateQueries(['onboarding-reminders-due']);
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Failed to send reminder'),
  });

  return (
    <AppShell>
      <PageHeader title="Onboarding Reminders" />

      <div className="p-6">
        <p className="text-sm text-gray-500 mb-4">
          Candidates with onboarding requirements at least ~24h overdue. Reminders are <strong>not</strong> sent
          automatically — review and push a nudge here. It emails the candidate a digest of their outstanding
          items from their onboarder's account (falling back to yours).
        </p>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400 text-sm">
            🎉 No candidates with overdue onboarding items right now.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Candidate</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Onboarder</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Overdue Items</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Most Overdue</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Nudges Sent</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 w-40">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => {
                  const isSending = sendMutation.isPending && sendMutation.variables === r.candidate_id;
                  return (
                    <tr key={r.candidate_id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <Link to={`/candidates/${r.candidate_id}`} className="font-medium text-[#1e3a5f] hover:underline">{r.full_name}</Link>
                        <div className="text-xs text-gray-400">{r.email}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {r.onboarder_name || <span className="text-gray-400">—</span>}
                        {r.onboarder_name && !r.onboarder_connected && (
                          <span className="block text-[10px] text-amber-600">Google not connected — sends from you</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">{r.overdue_count}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {r.days_overdue}d overdue
                        <span className="text-xs text-gray-400 ml-1">(due {formatDate(r.oldest_due)})</span>
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium ${r.suggested_stage === 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          suggest stage {r.suggested_stage}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">
                        {r.nudges_sent > 0
                          ? `${r.nudges_sent}× (last: stage ${r.last_stage}, ${formatDate(r.last_sent_at)})`
                          : <span className="text-gray-300">none yet</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" onClick={() => sendMutation.mutate(r.candidate_id)} disabled={isSending}>
                          {isSending ? 'Sending…' : r.nudges_sent > 0 ? 'Send again' : 'Send nudge'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
