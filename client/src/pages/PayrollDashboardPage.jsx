import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRunsRocketology, createRunRocketology, calculateRunRocketology, exportCsvRocketology, getCsvPreview, seedTestData, getMissingGustoCodes, getSessionPay, getMiscPay, getOnboardingPay, runNightlyJob, getNightlyLogs } from '../api/payroll';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatCurrency } from '../lib/utils';

export default function PayrollDashboardPage() {
  const qc = useQueryClient();
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [previewRunId, setPreviewRunId] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  const { data: runsData, isLoading: runsLoading } = useQuery({ queryKey: ['payroll-runs'], queryFn: getRunsRocketology });
  const runs = runsData?.data || [];

  const { data: missingData } = useQuery({ queryKey: ['payroll-missing'], queryFn: () => getSessionPay({ flag: 'MISSING' }) });
  const missingPay = missingData?.data || [];

  const { data: unreviewedMisc } = useQuery({ queryKey: ['payroll-unreviewed-misc'], queryFn: () => getMiscPay({ reviewed: 'false' }) });
  const { data: unreviewedOnboard } = useQuery({ queryKey: ['payroll-unreviewed-onboard'], queryFn: () => getOnboardingPay({ reviewed: 'false' }) });

  const { data: missingGustoData } = useQuery({ queryKey: ['payroll-missing-gusto'], queryFn: getMissingGustoCodes });
  const missingGusto = missingGustoData?.data || [];

  const { data: logsData } = useQuery({ queryKey: ['nightly-logs'], queryFn: getNightlyLogs });
  const logs = logsData?.data || [];

  const createMutation = useMutation({
    mutationFn: (d) => createRunRocketology(d),
    onSuccess: () => { qc.invalidateQueries(['payroll-runs']); setNewStart(''); setNewEnd(''); },
  });

  const calcMutation = useMutation({
    mutationFn: (id) => calculateRunRocketology(id),
    onSuccess: () => qc.invalidateQueries(['payroll-runs']),
  });

  const nightlyMutation = useMutation({
    mutationFn: () => runNightlyJob(),
    onSuccess: () => { qc.invalidateQueries(['nightly-logs']); qc.invalidateQueries(['payroll-missing']); },
  });

  const seedMutation = useMutation({
    mutationFn: () => seedTestData(),
    onSuccess: () => qc.invalidateQueries(),
  });

  const handlePreview = async (runId) => {
    if (previewRunId === runId) { setPreviewRunId(null); setPreviewData(null); return; }
    const res = await getCsvPreview(runId);
    setPreviewData(res.data || []);
    setPreviewRunId(runId);
  };

  return (
    <AppShell>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Payroll</h1>
      </div>
      <div className="p-6 space-y-4 max-w-[1200px]">
        {/* Quick Stats */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Missing Assist Pay</div>
            <div className={`text-2xl font-bold ${missingPay.length > 0 ? 'text-red-600' : 'text-gray-300'}`}>{missingPay.length}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Unreviewed Misc Pay</div>
            <div className={`text-2xl font-bold ${(unreviewedMisc?.data?.length || 0) > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{unreviewedMisc?.data?.length || 0}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Unreviewed Onboarding</div>
            <div className={`text-2xl font-bold ${(unreviewedOnboard?.data?.length || 0) > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{unreviewedOnboard?.data?.length || 0}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Missing Gusto IDs</div>
            <div className={`text-2xl font-bold ${missingGusto.length > 0 ? 'text-red-600' : 'text-gray-300'}`}>{missingGusto.length}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Last Nightly Run</div>
            <div className="text-sm font-medium text-gray-700">{logs[0] ? formatDate(logs[0].run_date) : 'Never'}</div>
            {logs[0]?.errors > 0 && <div className="text-xs text-red-500">{logs[0].errors} errors</div>}
          </div>
        </div>

        {/* Missing Gusto Warning */}
        {missingGusto.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <div className="text-sm font-medium text-red-700 mb-1">Professors with pay records but no Gusto ID — must be assigned before running payroll:</div>
            <div className="flex flex-wrap gap-2">
              {missingGusto.map(p => (
                <span key={p.id} className="inline-flex items-center px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs font-medium">
                  {p.professor_name}
                </span>
              ))}
            </div>
            <Link to="/payroll/gusto-codes" className="text-xs text-red-600 hover:underline mt-2 inline-block">→ Manage Gusto Codes</Link>
          </div>
        )}

        {/* Unapproved Misc Pay */}
        {(unreviewedMisc?.data?.length || 0) > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-amber-700">{unreviewedMisc.data.length} Unapproved Misc Pay Submissions</div>
              <Link to="/payroll/misc-pay" className="text-xs text-amber-700 hover:underline">View All →</Link>
            </div>
            <div className="bg-white rounded border border-amber-100 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-amber-50">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium text-amber-800">Date</th>
                    <th className="text-left px-3 py-1.5 font-medium text-amber-800">Professor</th>
                    <th className="text-left px-3 py-1.5 font-medium text-amber-800">Type</th>
                    <th className="text-right px-3 py-1.5 font-medium text-amber-800">Amount</th>
                    <th className="text-left px-3 py-1.5 font-medium text-amber-800">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {unreviewedMisc.data.slice(0, 10).map(e => (
                    <tr key={e.id}>
                      <td className="px-3 py-1.5">{formatDate(e.pay_date)}</td>
                      <td className="px-3 py-1.5 font-medium">{e.professor_name || '—'}</td>
                      <td className="px-3 py-1.5">{e.pay_type}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(e.manual_total_override || e.dollar_amount || e.total_pay || 0)}</td>
                      <td className="px-3 py-1.5 text-gray-500">{e.submitted_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-3">
          <Link to="/payroll/session-pay"><Button variant="secondary">Session Pay Review</Button></Link>
          <Link to="/payroll/misc-pay"><Button variant="secondary">Misc Pay</Button></Link>
          <Link to="/payroll/onboarding-pay"><Button variant="secondary">Onboarding Pay</Button></Link>
          <Link to="/payroll/fm-log"><Button variant="secondary">FM Daily Log</Button></Link>
          <Link to="/payroll/gusto-codes"><Button variant="secondary">Gusto Codes</Button></Link>
          <Button variant="secondary" onClick={() => nightlyMutation.mutate()} disabled={nightlyMutation.isPending}>
            {nightlyMutation.isPending ? 'Running…' : 'Run Nightly Job Now'}
          </Button>
          <Button variant="secondary" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            {seedMutation.isPending ? 'Seeding…' : 'Seed Test Data'}
          </Button>
          {seedMutation.isSuccess && <span className="text-xs text-green-600">Test data seeded</span>}
        </div>

        {/* Payroll Runs */}
        <Section title="Payroll Runs — Rocketology" defaultOpen={true}>
          <div className="flex gap-3 mb-3 items-end">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-medium text-gray-700">Start Date</label>
              <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-medium text-gray-700">End Date</label>
              <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
            <Button onClick={() => newStart && newEnd && createMutation.mutate({ start_date: newStart, end_date: newEnd })}
              disabled={!newStart || !newEnd || createMutation.isPending}>
              {createMutation.isPending ? '…' : 'Create Run'}
            </Button>
          </div>

          {runsLoading ? <Spinner className="w-6 h-6" /> : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Period</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Notes</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600 w-32">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {runs.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">No payroll runs yet</td></tr>
                  ) : runs.map(r => (
                    <tr key={r.id}>
                      <td className="px-4 py-2 font-medium">{formatDate(r.start_date)} — {formatDate(r.end_date)}</td>
                      <td className="px-3 py-2 text-center"><Badge status={r.status} /></td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{r.notes || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => calcMutation.mutate(r.id)} disabled={calcMutation.isPending}
                            className="text-xs text-[#1e3a5f] hover:underline">Calculate</button>
                          <button onClick={() => handlePreview(r.id)}
                            className="text-xs text-[#1e3a5f] hover:underline">{previewRunId === r.id ? 'Hide' : 'Preview'}</button>
                          <a href={exportCsvRocketology(r.id)} className="text-xs text-[#1e3a5f] hover:underline">CSV</a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* CSV Preview */}
        {previewRunId && previewData && (
          <Section title={`CSV Preview — Run #${previewRunId} (${previewData.length} professors)`} defaultOpen={true}>
            {previewData.length === 0 ? (
              <p className="text-sm text-gray-400">No data — run "Calculate" first</p>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Last Name</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">First Name</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Gusto ID</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Title</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Hours</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Bonus</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Reimb</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Program Pay</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Party Pay</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Misc</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Onboard</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 font-bold">Total Gross</th>
                      <th className="text-center px-2 py-2 font-medium text-gray-600">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewData.map(r => (
                      <tr key={r.id} className={r.has_missing_assist_pay || r.has_errors ? 'bg-red-50/30' : ''}>
                        <td className="px-3 py-1.5 font-medium">{r.last_name}</td>
                        <td className="px-3 py-1.5">{r.first_name}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-500">{r.gusto_employee_id}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.employment_title}</td>
                        <td className="px-3 py-1.5 text-right">{r.regular_hours}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(r.bonus)}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(r.reimbursement)}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(r.live_program_pay)}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(r.party_pay)}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(r.misc_pay)}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(r.onboarding_pay)}</td>
                        <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatCurrency(r.total_gross_pay)}</td>
                        <td className="px-2 py-1.5 text-center">
                          {r.has_missing_assist_pay && <span className="text-red-500 text-[10px] font-medium">MISSING PAY</span>}
                          {r.has_errors && <span className="text-red-500 text-[10px] font-medium ml-1">ERROR</span>}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-medium">
                      <td colSpan={4} className="px-3 py-2 text-right text-gray-600">Totals:</td>
                      <td className="px-3 py-2 text-right">{previewData.reduce((s, r) => s + parseFloat(r.regular_hours || 0), 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(previewData.reduce((s, r) => s + parseFloat(r.bonus || 0), 0))}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(previewData.reduce((s, r) => s + parseFloat(r.reimbursement || 0), 0))}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(previewData.reduce((s, r) => s + parseFloat(r.live_program_pay || 0), 0))}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(previewData.reduce((s, r) => s + parseFloat(r.party_pay || 0), 0))}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(previewData.reduce((s, r) => s + parseFloat(r.misc_pay || 0), 0))}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(previewData.reduce((s, r) => s + parseFloat(r.onboarding_pay || 0), 0))}</td>
                      <td className="px-3 py-2 text-right font-bold text-green-700">{formatCurrency(previewData.reduce((s, r) => s + parseFloat(r.total_gross_pay || 0), 0))}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* Nightly Job Logs */}
        <Section title="Nightly Job Logs" defaultOpen={false}>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600">Programs</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600">Sessions Written</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600">Errors</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(l => (
                  <tr key={l.id} className={l.errors > 0 ? 'bg-red-50/30' : ''}>
                    <td className="px-3 py-2">{formatDate(l.run_date)}</td>
                    <td className="px-3 py-2 text-center">{l.programs_processed}</td>
                    <td className="px-3 py-2 text-center">{l.sessions_written}</td>
                    <td className="px-3 py-2 text-center"><span className={l.errors > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}>{l.errors}</span></td>
                    <td className="px-3 py-2 text-right text-gray-500">{l.duration_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
