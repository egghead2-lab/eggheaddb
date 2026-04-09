import { PayrollTabBar } from './PayrollDashboardPage';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../lib/utils';
import api from '../api/client';

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function MileagePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canManage = ['Admin', 'CEO', 'Human Resources'].includes(user?.role);
  const [statusFilter, setStatusFilter] = useState('submitted');
  const [expandedId, setExpandedId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  // Weekly submissions
  const { data, isLoading } = useQuery({
    queryKey: ['mileage-weeks-admin', statusFilter],
    queryFn: () => api.get(`/payroll/mileage-weeks${statusFilter ? `?status=${statusFilter}` : ''}`).then(r => r.data),
  });
  const weeks = data?.data || [];

  // Expanded week detail
  const { data: detailData } = useQuery({
    queryKey: ['mileage-week-detail', expandedId],
    queryFn: () => api.get(`/payroll/mileage-weeks/${expandedId}`).then(r => r.data),
    enabled: !!expandedId,
  });
  const detail = detailData?.data;

  // Settings
  const { data: settingsData } = useQuery({
    queryKey: ['payroll-settings'],
    queryFn: () => api.get('/payroll/settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const currentRate = settingsData?.data?.mileage_reimbursement_rate || '0.70';
  const [editRate, setEditRate] = useState('');
  const [showRate, setShowRate] = useState(false);

  const rateMutation = useMutation({
    mutationFn: (val) => api.put('/payroll/settings/mileage_reimbursement_rate', { value: val }),
    onSuccess: () => { qc.invalidateQueries(['payroll-settings']); setShowRate(false); setEditRate(''); },
  });

  const approveMutation = useMutation({
    mutationFn: (id) => api.patch(`/payroll/mileage-weeks/${id}/approve`, { approved_by: user?.name }),
    onSuccess: () => { qc.invalidateQueries(['mileage-weeks']); qc.invalidateQueries(['mileage-week-detail']); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }) => api.patch(`/payroll/mileage-weeks/${id}/reject`, { note }),
    onSuccess: () => { qc.invalidateQueries(['mileage-weeks']); qc.invalidateQueries(['mileage-week-detail']); setRejectNote(''); },
  });

  return (
    <AppShell>
      <PayrollTabBar />
      <PageHeader title="Mileage — Weekly Submissions">
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-36">
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
        {canManage && (
          <Button variant="secondary" onClick={() => { setShowRate(!showRate); setEditRate(currentRate); }}>
            Rate: ${parseFloat(currentRate).toFixed(2)}/mi
          </Button>
        )}
      </PageHeader>

      <div className="p-6 space-y-4">
        {/* Rate editor */}
        {showRate && canManage && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-end gap-4 max-w-md">
            <Input label="Mileage Reimbursement Rate ($/mile)" type="number" step="0.01"
              value={editRate} onChange={e => setEditRate(e.target.value)} />
            <Button onClick={() => editRate && rateMutation.mutate(editRate)} disabled={rateMutation.isPending || !editRate}>
              {rateMutation.isPending ? 'Saving...' : 'Save Rate'}
            </Button>
          </div>
        )}

        {isLoading ? <Spinner className="w-6 h-6" /> : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">FM</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Week</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Miles</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Rate</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Reimbursement</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Submitted</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Status</th>
                  <th className="w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {weeks.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">No submissions</td></tr>
                ) : weeks.map((w, i) => (
                  <>
                    <tr key={w.id} className={`hover:bg-gray-50 cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                      onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}>
                      <td className="px-3 py-2 font-medium">{w.professor_name || '—'}</td>
                      <td className="px-3 py-2">{formatDate(w.week_start)} — {formatDate(w.week_end)}</td>
                      <td className="px-3 py-2 text-right">{parseFloat(w.total_miles || 0).toFixed(1)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">${parseFloat(w.reimbursement_rate).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium text-green-700">${parseFloat(w.reimbursement_total || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{w.submitted_at ? formatDate(w.submitted_at) : '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_COLORS[w.status]}`}>{w.status}</span>
                      </td>
                      <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                        {w.status === 'submitted' && canManage && (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => approveMutation.mutate(w.id)} disabled={approveMutation.isPending}
                              className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 font-medium">Approve</button>
                            <button onClick={() => setExpandedId(w.id)}
                              className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 font-medium">Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {/* Expanded detail */}
                    {expandedId === w.id && detail && (
                      <tr key={`${w.id}-detail`}>
                        <td colSpan={8} className="px-6 py-4 bg-gray-50/80">
                          <table className="w-full text-sm mb-3">
                            <thead>
                              <tr className="text-xs text-gray-500">
                                <th className="text-left pb-1">Date</th>
                                <th className="text-right pb-1">Odometer Start</th>
                                <th className="text-right pb-1">Odometer End</th>
                                <th className="text-right pb-1">Miles</th>
                                <th className="text-right pb-1">Reimb.</th>
                                <th className="text-left pb-1">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {(detail.entries || []).map(e => (
                                <tr key={e.id}>
                                  <td className="py-1.5">{formatDate(e.entry_date)}</td>
                                  <td className="py-1.5 text-right text-gray-600">{parseFloat(e.odometer_start).toFixed(1)}</td>
                                  <td className="py-1.5 text-right text-gray-600">{parseFloat(e.odometer_end).toFixed(1)}</td>
                                  <td className="py-1.5 text-right font-medium">{parseFloat(e.miles).toFixed(1)}</td>
                                  <td className="py-1.5 text-right text-green-700">${(parseFloat(e.miles) * detail.reimbursement_rate).toFixed(2)}</td>
                                  <td className="py-1.5 text-gray-600">{e.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {w.status === 'submitted' && canManage && (
                            <div className="flex gap-3 items-center pt-2 border-t border-gray-200">
                              <Input placeholder="Rejection reason (optional)" value={rejectNote}
                                onChange={e => setRejectNote(e.target.value)} className="flex-1" />
                              <Button variant="danger" size="sm" onClick={() => rejectMutation.mutate({ id: w.id, note: rejectNote })}
                                disabled={rejectMutation.isPending}>
                                {rejectMutation.isPending ? 'Rejecting...' : 'Reject & Return'}
                              </Button>
                            </div>
                          )}
                          {w.approved_by && (
                            <div className="text-xs text-gray-400 mt-2">Approved by {w.approved_by} on {formatDate(w.approved_at)}</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
