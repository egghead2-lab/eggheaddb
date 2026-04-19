import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { PayrollTabBar } from './PayrollDashboardPage';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatCurrency } from '../lib/utils';
import api from '../api/client';

const STATUS_STYLES = {
  Draft: 'bg-gray-100 text-gray-700',
  Calculated: 'bg-blue-100 text-blue-700',
  Committed: 'bg-green-100 text-green-700',
};

export default function PayrollRunsPage() {
  const qc = useQueryClient();
  const [previewRunId, setPreviewRunId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmCommit, setConfirmCommit] = useState(null);
  const [calcSuccess, setCalcSuccess] = useState(null);
  const [commitError, setCommitError] = useState(null);
  const [detailProfId, setDetailProfId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api.get('/payroll/runs/rocketology').then(r => r.data),
  });
  const runs = data?.data || [];
  const availablePeriods = data?.availablePeriods || [];

  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: ['payroll-preview', previewRunId],
    queryFn: () => api.get(`/payroll/runs/rocketology/${previewRunId}/csv-preview`).then(r => r.data),
    enabled: !!previewRunId,
  });
  const previewRows = previewData?.data || [];

  // Find the run for date range
  const activeRun = runs.find(r => r.id === previewRunId);
  const detailStart = activeRun?.start_date?.split?.('T')?.[0] || activeRun?.start_date;
  const detailEnd = activeRun?.end_date?.split?.('T')?.[0] || activeRun?.end_date;

  const { data: detailData } = useQuery({
    queryKey: ['payroll-detail', detailProfId, detailStart, detailEnd],
    queryFn: () => api.get('/payroll/session-pay', { params: { professor_id: detailProfId, start: detailStart, end: detailEnd } }).then(r => r.data),
    enabled: !!detailProfId && !!detailStart,
  });
  const { data: detailMiscData } = useQuery({
    queryKey: ['payroll-detail-misc', detailProfId, detailStart, detailEnd],
    queryFn: () => api.get('/payroll/misc-pay', { params: { professor_id: detailProfId, start: detailStart, end: detailEnd } }).then(r => r.data),
    enabled: !!detailProfId && !!detailStart,
  });

  const createMutation = useMutation({
    mutationFn: (d) => api.post('/payroll/runs/rocketology', d).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['payroll-runs']),
  });

  const calcMutation = useMutation({
    mutationFn: (id) => api.post(`/payroll/runs/rocketology/${id}/calculate`).then(r => r.data),
    onSuccess: (_, id) => {
      qc.invalidateQueries(['payroll-runs']);
      qc.invalidateQueries(['payroll-preview', id]);
      setCalcSuccess(id);
      setTimeout(() => setCalcSuccess(null), 3000);
    },
  });

  const commitMutation = useMutation({
    mutationFn: (id) => api.post(`/payroll/runs/rocketology/${id}/commit`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['payroll-runs']); setConfirmCommit(null); setCommitError(null); },
    onError: (err) => { setCommitError(err.response?.data?.error || 'Commit failed'); setConfirmCommit(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/payroll/runs/rocketology/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['payroll-runs']); setConfirmDelete(null); setPreviewRunId(null); },
  });

  const handleCsvDownload = async (runId) => {
    try {
      const res = await api.get(`/payroll/runs/rocketology/${runId}/csv`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url;
      a.download = `payroll_rocketology_${runId}.csv`;
      a.click(); window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV download failed:', err);
    }
  };

  return (
    <AppShell>
      <PayrollTabBar />
      <div className="p-6 space-y-4">
        {/* Create new period */}
        {availablePeriods.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-600 mb-2">Create Payroll Run</div>
            <div className="flex flex-wrap gap-2">
              {availablePeriods.map(p => (
                <button key={p.start_date}
                  onClick={() => createMutation.mutate({ start_date: p.start_date, end_date: p.end_date })}
                  disabled={createMutation.isPending}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 hover:border-[#1e3a5f] transition-colors">
                  {formatDate(p.start_date)} — {formatDate(p.end_date)}
                </button>
              ))}
            </div>
          </div>
        )}

        {commitError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-red-700">{commitError}</span>
            <button onClick={() => setCommitError(null)} className="text-xs text-red-400 hover:text-red-600">Dismiss</button>
          </div>
        )}

        {isLoading ? <Spinner className="w-6 h-6" /> : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Period</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Notes</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-64">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">No payroll runs yet</td></tr>
                ) : runs.map(r => (
                  <tr key={r.id} className={calcSuccess === r.id ? 'bg-green-50' : ''}>
                    <td className="px-4 py-2 font-medium">{formatDate(r.start_date)} — {formatDate(r.end_date)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_STYLES[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{r.notes || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2 justify-center items-center">
                        {/* Calculate — only if not committed */}
                        {r.status !== 'Committed' && (
                          <button onClick={() => calcMutation.mutate(r.id)}
                            disabled={calcMutation.isPending}
                            className="text-xs text-[#1e3a5f] hover:underline disabled:opacity-50">
                            {calcMutation.isPending && calcMutation.variables === r.id ? 'Calculating...'
                              : calcSuccess === r.id ? 'Done!' : r.status === 'Calculated' ? 'Recalculate' : 'Calculate'}
                          </button>
                        )}

                        {/* Preview */}
                        <button onClick={() => setPreviewRunId(previewRunId === r.id ? null : r.id)}
                          className="text-xs text-[#1e3a5f] hover:underline">
                          {previewRunId === r.id ? 'Hide' : 'Preview'}
                        </button>

                        {/* CSV — only if calculated or committed */}
                        {r.status !== 'Draft' && (
                          <button onClick={() => handleCsvDownload(r.id)}
                            className="text-xs text-[#1e3a5f] hover:underline">CSV</button>
                        )}

                        {/* Commit — only if Calculated */}
                        {r.status === 'Calculated' && (
                          confirmCommit === r.id ? (
                            <span className="flex items-center gap-1">
                              <button onClick={() => commitMutation.mutate(r.id)}
                                disabled={commitMutation.isPending}
                                className="text-xs px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700 font-medium">
                                {commitMutation.isPending ? 'Committing...' : 'Yes, Commit'}
                              </button>
                              <button onClick={() => setConfirmCommit(null)} className="text-xs text-gray-400">Cancel</button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirmCommit(r.id)}
                              className="text-xs px-2 py-0.5 bg-green-500 text-white rounded hover:bg-green-600 font-medium">
                              Commit
                            </button>
                          )
                        )}

                        {/* Committed label */}
                        {r.status === 'Committed' && r.committed_by && (
                          <span className="text-[10px] text-gray-400">by {r.committed_by}</span>
                        )}

                        {/* Delete — only if not committed */}
                        {r.status !== 'Committed' && (
                          confirmDelete === r.id ? (
                            <span className="flex items-center gap-1">
                              <button onClick={() => deleteMutation.mutate(r.id)}
                                disabled={deleteMutation.isPending}
                                className="text-xs px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600 font-medium">
                                {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
                              </button>
                              <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-400">Cancel</button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirmDelete(r.id)}
                              className="text-xs text-red-500 hover:underline">Delete</button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Preview table */}
        {previewRunId && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
              CSV Preview — {previewLoading ? '...' : `${previewRows.length} professors`}
            </div>
            {previewLoading ? (
              <div className="flex justify-center py-8"><Spinner className="w-6 h-6" /></div>
            ) : previewRows.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No data — click Calculate first to generate the summary</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Preferred Name</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Gusto ID</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Session Pay</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Party Pay</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Misc Pay</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Onboard Pay</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Hours</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Bonus</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Reimb</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 font-bold">Total</th>
                    <th className="text-center px-2 py-2 font-medium text-gray-600">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previewRows.map(r => (
                    <><tr key={r.id} onClick={() => setDetailProfId(detailProfId === r.professor_id ? null : r.professor_id)}
                      className={`cursor-pointer hover:bg-gray-50 ${detailProfId === r.professor_id ? 'bg-blue-50/50' : r.missing_gusto ? 'bg-amber-50/40' : r.has_missing_assist_pay ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-1.5 font-medium text-[#1e3a5f]">{r.professor_nickname || `${r.first_name} ${r.last_name}`}</td>
                      <td className="px-3 py-1.5 font-mono text-gray-500">{r.gusto_employee_id || <span className="text-red-500 text-[10px] font-bold">NONE</span>}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(r.live_program_pay)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(r.party_pay)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(r.misc_pay)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(r.onboarding_pay)}</td>
                      <td className="px-3 py-1.5 text-right">{r.regular_hours}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(r.bonus)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(r.reimbursement)}</td>
                      <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatCurrency(r.total_gross_pay)}</td>
                      <td className="px-2 py-1.5 text-center">
                        {r.missing_gusto ? <span className="text-amber-600 text-[10px] font-bold">NO GUSTO</span> : null}
                        {r.has_missing_assist_pay ? <span className="text-red-500 text-[10px] font-bold">MISSING PAY</span> : null}
                      </td>
                    </tr>
                    {detailProfId === r.professor_id && (
                      <tr key={`detail-${r.id}`}>
                        <td colSpan={11} className="bg-gray-50/80 px-4 py-3">
                          <ProfessorPayDetail
                            sessions={detailData?.data || []}
                            miscEntries={detailMiscData?.data || []}
                          />
                        </td>
                      </tr>
                    )}
                    </>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr className="font-bold text-xs">
                    <td className="px-3 py-2" colSpan={2}>Totals</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(previewRows.reduce((s, r) => s + parseFloat(r.live_program_pay || 0), 0))}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(previewRows.reduce((s, r) => s + parseFloat(r.party_pay || 0), 0))}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(previewRows.reduce((s, r) => s + parseFloat(r.misc_pay || 0), 0))}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(previewRows.reduce((s, r) => s + parseFloat(r.onboarding_pay || 0), 0))}</td>
                    <td className="px-3 py-2 text-right">{previewRows.reduce((s, r) => s + parseFloat(r.regular_hours || 0), 0).toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(previewRows.reduce((s, r) => s + parseFloat(r.bonus || 0), 0))}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(previewRows.reduce((s, r) => s + parseFloat(r.reimbursement || 0), 0))}</td>
                    <td className="px-3 py-2 text-right text-green-700">{formatCurrency(previewRows.reduce((s, r) => s + parseFloat(r.total_gross_pay || 0), 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ProfessorPayDetail({ sessions, miscEntries }) {
  // Group sessions by program
  const byProgram = {};
  sessions.forEach(s => {
    const key = s.program_nickname || `Program #${s.program_id}`;
    if (!byProgram[key]) byProgram[key] = [];
    byProgram[key].push(s);
  });

  return (
    <div className="space-y-3">
      {/* Session pay grouped by program */}
      {Object.keys(byProgram).length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Session Pay</div>
          {Object.entries(byProgram).map(([progName, items]) => {
            const progTotal = items.reduce((s, i) => s + parseFloat(i.pay_amount || 0), 0);
            const progHours = items.reduce((s, i) => s + parseFloat(i.class_hours || 0), 0);
            return (
              <div key={progName} className="mb-2">
                <div className="flex items-center justify-between text-xs font-medium text-gray-700 mb-0.5">
                  <Link to={`/programs/${items[0].program_id}`} className="text-[#1e3a5f] hover:underline">{progName}</Link>
                  <span>{progHours}h — {formatCurrency(progTotal)}</span>
                </div>
                <div className="pl-3 space-y-0.5">
                  {items.map(s => (
                    <div key={s.id} className="flex items-center gap-3 text-[11px] text-gray-500">
                      <span className="w-14">{formatDate(s.session_date)}</span>
                      <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${s.role === 'Lead' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{s.role}</span>
                      <span className="w-10 text-right">{s.class_hours}h</span>
                      <span className="w-16 text-right font-medium text-gray-700">{formatCurrency(s.pay_amount)}</span>
                      {s.is_substitute ? <span className="text-amber-600 text-[9px] font-bold">SUB</span> : null}
                      {s.assist_pay_flag === 'MISSING' ? <span className="text-red-500 text-[9px] font-bold">MISSING</span> : null}
                      <span className="text-gray-400 text-[9px]">{s.pay_source}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Misc pay */}
      {miscEntries.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Misc Pay</div>
          <div className="pl-3 space-y-0.5">
            {miscEntries.map(m => (
              <div key={m.id} className="flex items-center gap-3 text-[11px] text-gray-500">
                <span className="w-14">{formatDate(m.pay_date)}</span>
                <span className="px-1 py-0.5 rounded text-[9px] font-medium bg-gray-200 text-gray-700">{m.pay_type}</span>
                <span className="text-gray-600 truncate max-w-[200px]">{m.description || '—'}</span>
                <span className="w-16 text-right font-medium text-gray-700 ml-auto">{formatCurrency(m.manual_total_override || m.total_pay || (parseFloat(m.hourly_pay || 0) * parseFloat(m.hours || 0)))}</span>
                {!m.is_reviewed ? <span className="text-amber-500 text-[9px] font-bold">UNREVIEWED</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && miscEntries.length === 0 && (
        <div className="text-xs text-gray-400 text-center py-2">No pay records found for this period</div>
      )}
    </div>
  );
}
