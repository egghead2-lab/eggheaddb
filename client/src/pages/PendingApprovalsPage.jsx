import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

const ROLE_LABELS = { scheduler: 'Scheduler', field_manager: 'Field Mgr', recruiter: 'Recruiter', onboarder: 'Onboarder', trainer: 'Trainer' };
const ROLE_COLORS = { scheduler: 'bg-blue-100 text-blue-700', field_manager: 'bg-emerald-100 text-emerald-700', recruiter: 'bg-teal-100 text-teal-700', onboarder: 'bg-pink-100 text-pink-700', trainer: 'bg-orange-100 text-orange-700' };

export default function PendingApprovalsPage() {
  const qc = useQueryClient();
  const [viewAll, setViewAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['pending-approvals', viewAll],
    queryFn: () => api.get(`/onboarding/pending-approvals?all=${viewAll}`).then(r => r.data),
  });

  const approveMutation = useMutation({
    mutationFn: ({ reqId, action }) => api.post(`/onboarding/candidate-requirements/${reqId}/approve`, { action }),
    onSuccess: () => qc.invalidateQueries(['pending-approvals']),
  });

  const items = data?.data || [];

  return (
    <AppShell>
      <PageHeader title="Pending Approvals" action={
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setViewAll(false)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${!viewAll ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500'}`}>
            Mine
          </button>
          <button onClick={() => setViewAll(true)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewAll ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500'}`}>
            All
          </button>
        </div>
      } />

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
            No pending approvals{!viewAll ? ' assigned to you' : ''}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="bg-white rounded-lg border border-amber-200 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Link to={`/candidates/${item.candidate_id}`} className="text-lg font-bold text-[#1e3a5f] hover:underline">
                        {item.candidate_name}
                      </Link>
                      <span className="text-sm font-medium text-gray-800">&mdash; {item.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        item.type === 'document' ? 'bg-blue-100 text-blue-700' :
                        item.type === 'training' ? 'bg-purple-100 text-purple-700' :
                        item.type === 'compliance' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{item.type}</span>
                      {item.assigned_role && (
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${ROLE_COLORS[item.assigned_role] || 'bg-gray-100'}`}>
                          {ROLE_LABELS[item.assigned_role]}
                        </span>
                      )}
                    </div>

                    {item.due_date && (
                      <div className={`text-sm mt-1 ${new Date(item.due_date) < new Date() ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        Due: {formatDate(item.due_date)}
                      </div>
                    )}

                    {/* Documents */}
                    {item.documents?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {item.documents.map(d => (
                          <a key={d.id} href={`${api.defaults.baseURL}/onboarding/documents/${d.id}/download`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-100 border border-blue-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            {d.file_name}
                            <span className="text-blue-400 text-xs">({(d.file_size / 1024).toFixed(0)}KB)</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button onClick={() => approveMutation.mutate({ reqId: item.id, action: 'approve' })}
                      disabled={approveMutation.isPending}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                      Approve
                    </button>
                    <button onClick={() => approveMutation.mutate({ reqId: item.id, action: 'reject' })}
                      disabled={approveMutation.isPending}
                      className="px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50">
                      Reject
                    </button>
                  </div>
                </div>

                {item.assigned_to_name && (
                  <div className="text-xs text-gray-400 mt-2">Assigned to: {item.assigned_to_name}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
