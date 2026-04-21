import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { formatDate, formatCurrency } from '../lib/utils';
import api from '../api/client';

const TABS = [
  { path: '/payroll', label: 'Overview' },
  { path: '/payroll/runs', label: 'Pay Runs' },
  { path: '/payroll/session-pay', label: 'Session Pay' },
  { path: '/payroll/misc-pay', label: 'Misc Pay' },
  { path: '/payroll/onboarding-pay', label: 'Onboarding' },
  { path: '/payroll/fm-log', label: 'FM Daily Log' },
  { path: '/payroll/mileage', label: 'Mileage' },
  { path: '/payroll/gas-reimbursements', label: 'Gas Reimbursements' },
  { path: '/payroll/gusto-codes', label: 'Gusto Codes' },
];

export function PayrollTabBar() {
  const location = useLocation();
  return (
    <div className="bg-white border-b border-gray-200 px-6 pt-4">
      <h1 className="text-xl font-bold text-gray-900 mb-3">Payroll</h1>
      <div className="flex gap-1 overflow-x-auto -mb-px">
        {TABS.map(t => {
          const active = t.path === '/payroll' ? location.pathname === '/payroll' : location.pathname.startsWith(t.path);
          return (
            <Link key={t.path} to={t.path}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                active ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function PayrollDashboardPage() {
  const qc = useQueryClient();
  const [showLogic, setShowLogic] = useState(false);
  const [reconStart, setReconStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  });
  const [reconEnd, setReconEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [backfillStart, setBackfillStart] = useState('2026-03-23');
  const [backfillEnd, setBackfillEnd] = useState('2026-04-14');
  const [backfillResult, setBackfillResult] = useState(null);

  const { data: missingData } = useQuery({ queryKey: ['payroll-missing'], queryFn: () => api.get('/payroll/session-pay?flag=MISSING').then(r => r.data) });
  const { data: miscData } = useQuery({ queryKey: ['payroll-unreviewed-misc'], queryFn: () => api.get('/payroll/misc-pay?reviewed=false').then(r => r.data) });
  const { data: onboardData } = useQuery({ queryKey: ['payroll-unreviewed-onboard'], queryFn: () => api.get('/payroll/onboarding-pay?reviewed=false').then(r => r.data) });
  const { data: gustoData } = useQuery({ queryKey: ['payroll-missing-gusto'], queryFn: () => api.get('/payroll/missing-gusto-codes').then(r => r.data) });
  const { data: logsData } = useQuery({ queryKey: ['nightly-logs'], queryFn: () => api.get('/payroll/nightly-job/logs').then(r => r.data) });
  const { data: missingPayData } = useQuery({ queryKey: ['missing-onboard-pay'], queryFn: () => api.get('/onboarding/missing-pay').then(r => r.data), staleTime: 60 * 1000 });
  const { data: reconData } = useQuery({
    queryKey: ['payroll-reconciliation', reconStart, reconEnd],
    queryFn: () => api.get('/payroll/reconciliation', { params: { start: reconStart, end: reconEnd } }).then(r => r.data),
  });

  const missing = missingData?.data?.length || 0;
  const unrevMisc = miscData?.data?.length || 0;
  const unrevOnboard = onboardData?.data?.length || 0;
  const missingGusto = gustoData?.data || [];
  const lastLog = logsData?.data?.[0];
  const missingOnboardPay = missingPayData?.data || [];

  const issues = reconData?.issues || {};
  const totals = reconData?.totals || {};
  const totalIssues = (issues.missingPay?.length || 0) + (issues.orphanPay?.length || 0) + (issues.ghostSessions?.length || 0);

  const nightlyMutation = useMutation({
    mutationFn: () => api.post('/payroll/nightly-job/run'),
    onSuccess: () => qc.invalidateQueries(),
  });

  const backfillMutation = useMutation({
    mutationFn: (d) => api.post('/payroll/nightly-job/backfill', d).then(r => r.data),
    onSuccess: (data) => { setBackfillResult(data); qc.invalidateQueries(['payroll-reconciliation']); },
  });

  return (
    <AppShell>
      <PayrollTabBar />
      <div className="p-6 space-y-4 max-w-[1100px]">
        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          <Link to="/payroll/session-pay" className="rounded-lg border p-4 bg-white border-gray-200 hover:shadow-sm transition-shadow">
            <div className="text-xs text-gray-500">Missing Assist Pay</div>
            <div className={`text-2xl font-bold ${missing > 0 ? 'text-red-600' : 'text-gray-300'}`}>{missing}</div>
          </Link>
          <Link to="/payroll/misc-pay" className={`rounded-lg border p-4 ${unrevMisc > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'} hover:shadow-sm transition-shadow`}>
            <div className="text-xs text-gray-500">Unreviewed Misc</div>
            <div className={`text-2xl font-bold ${unrevMisc > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{unrevMisc}</div>
          </Link>
          <Link to="/payroll/onboarding-pay" className={`rounded-lg border p-4 ${unrevOnboard > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'} hover:shadow-sm transition-shadow`}>
            <div className="text-xs text-gray-500">Unreviewed Onboarding</div>
            <div className={`text-2xl font-bold ${unrevOnboard > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{unrevOnboard}</div>
          </Link>
          <Link to="/payroll/gusto-codes" className={`rounded-lg border p-4 ${missingGusto.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'} hover:shadow-sm transition-shadow`}>
            <div className="text-xs text-gray-500">Missing Gusto IDs</div>
            <div className={`text-2xl font-bold ${missingGusto.length > 0 ? 'text-red-600' : 'text-gray-300'}`}>{missingGusto.length}</div>
          </Link>
          <Link to="/candidates" className={`rounded-lg border p-4 ${missingOnboardPay.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'} hover:shadow-sm transition-shadow`}>
            <div className="text-xs text-gray-500">Missing Onboard Pay</div>
            <div className={`text-2xl font-bold ${missingOnboardPay.length > 0 ? 'text-red-600' : 'text-gray-300'}`}>{missingOnboardPay.length}</div>
          </Link>
        </div>

        {/* Missing onboarding pay warning */}
        {missingOnboardPay.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-sm font-semibold text-red-700 mb-2">Missing Onboarding Pay Forms</div>
            <div className="space-y-1">
              {missingOnboardPay.map(c => (
                <div key={c.candidate_id} className="flex items-center gap-3 text-xs">
                  <Link to={`/candidates/${c.candidate_id}`} className="font-medium text-[#1e3a5f] hover:underline">{c.full_name}</Link>
                  <span className="text-gray-500">{c.status === 'hired' ? 'Hired' : `Training (${c.phase})`}</span>
                  {c.trainer_name && <span className="text-gray-400">Trainer: {c.trainer_name}</span>}
                  <span className="text-red-600 font-medium ml-auto">No pay form submitted</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing Gusto warning */}
        {missingGusto.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <div className="text-sm font-medium text-red-700 mb-1">Professors with pay but no Gusto ID:</div>
            <div className="flex flex-wrap gap-2">
              {missingGusto.map(p => <span key={p.id} className="inline-flex items-center px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs font-medium">{p.professor_name}</span>)}
            </div>
          </div>
        )}

        {/* Nightly Job */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <strong>Nightly Job:</strong> Last run {lastLog ? formatDate(lastLog.run_date) : 'never'}
              {lastLog && <span className="text-gray-400 ml-2">{lastLog.sessions_written} sessions, {lastLog.errors} errors</span>}
            </div>
            <button onClick={() => nightlyMutation.mutate()} disabled={nightlyMutation.isPending}
              className="text-xs px-3 py-1.5 bg-[#1e3a5f] text-white rounded hover:bg-[#152a47] disabled:opacity-50">
              {nightlyMutation.isPending ? 'Running...' : 'Run Now'}
            </button>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Backfill historical dates:</span>
              <input type="date" value={backfillStart} onChange={e => setBackfillStart(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-xs" />
              <span className="text-xs text-gray-400">to</span>
              <input type="date" value={backfillEnd} onChange={e => setBackfillEnd(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-xs" />
              <button onClick={() => backfillMutation.mutate({ start_date: backfillStart, end_date: backfillEnd })}
                disabled={backfillMutation.isPending}
                className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50">
                {backfillMutation.isPending ? 'Backfilling...' : 'Backfill'}
              </button>
            </div>
            {backfillResult && (
              <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-3 py-2">
                Found {backfillResult.sessionsFound} sessions — wrote {backfillResult.recordsWritten} pay records, skipped {backfillResult.skipped} (already existed), {backfillResult.errors} errors
              </div>
            )}
          </div>
        </div>

        {/* How Payroll Works */}
        <div className="bg-white rounded-lg border border-gray-200">
          <button onClick={() => setShowLogic(!showLogic)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50">
            <span>How Payroll Is Calculated</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showLogic ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {showLogic && (
            <div className="px-4 pb-4 text-xs text-gray-600 space-y-3 border-t border-gray-100 pt-3">
              <div>
                <div className="font-semibold text-gray-800 mb-1">Nightly Job (runs 11 PM PST)</div>
                <p>Every night at 11 PM PST, the system finds all <strong>confirmed, billable sessions</strong> that occurred that day and writes immutable pay records to <code className="bg-gray-100 px-1 rounded">program_session_pay</code>. It processes both Lead and Assistant roles. The job is idempotent — if a record already exists for that session/role/professor, it skips it.</p>
              </div>
              <div>
                <div className="font-semibold text-gray-800 mb-1">Pay Resolution (Lead Professor)</div>
                <ol className="list-decimal ml-4 space-y-0.5">
                  <li><strong>Session-level pay</strong> — if the specific session has <code className="bg-gray-100 px-1 rounded">professor_pay</code> set, use that</li>
                  <li><strong>Program-level pay</strong> — if the program has <code className="bg-gray-100 px-1 rounded">lead_professor_pay</code> set, use that</li>
                  <li><strong>Professor base pay</strong> — fall back to the professor's own <code className="bg-gray-100 px-1 rounded">base_pay</code></li>
                </ol>
              </div>
              <div>
                <div className="font-semibold text-gray-800 mb-1">Pay Resolution (Assistant)</div>
                <ol className="list-decimal ml-4 space-y-0.5">
                  <li><strong>Session-level pay</strong> — <code className="bg-gray-100 px-1 rounded">assistant_pay</code> on the session</li>
                  <li><strong>Program-level pay</strong> — <code className="bg-gray-100 px-1 rounded">assistant_professor_pay</code> on the program</li>
                  <li><strong>Professor assist pay</strong> — the professor's own <code className="bg-gray-100 px-1 rounded">assist_pay</code></li>
                  <li>If none found, flagged as <span className="text-red-600 font-medium">MISSING</span></li>
                </ol>
              </div>
              <div>
                <div className="font-semibold text-gray-800 mb-1">Gusto Split</div>
                <p>Each pay record is split for Gusto CSV export: <strong>Regular Pay</strong> = class hours x $25/hr, <strong>Bonus</strong> = total pay minus regular. This maps to Gusto's payroll categories.</p>
              </div>
              <div>
                <div className="font-semibold text-gray-800 mb-1">Payroll Run Calculation</div>
                <p>When you create a pay run and click Calculate, it aggregates for each professor with a Gusto code: <strong>Session Pay</strong> (Lead + Assist) + <strong>Party Pay</strong> + <strong>Misc Pay</strong> (reviewed only) + <strong>Onboarding Pay</strong> (reviewed only) + <strong>Mileage Reimbursement</strong>. Field Managers are excluded from session/party pay (they're salaried).</p>
              </div>
            </div>
          )}
        </div>

        {/* Reconciliation */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Reconciliation Checks</span>
              {totalIssues > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-100 text-red-700">{totalIssues} issues</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <input type="date" value={reconStart} onChange={e => setReconStart(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-xs" />
              <span>to</span>
              <input type="date" value={reconEnd} onChange={e => setReconEnd(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-xs" />
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Category totals */}
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-2">Pay Totals ({formatDate(reconStart)} - {formatDate(reconEnd)})</div>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: 'Lead Pay', value: totals.leadPay },
                  { label: 'Assist Pay', value: totals.assistPay },
                  { label: 'Misc Pay', value: totals.miscPay },
                  { label: 'Onboarding Pay', value: totals.onboardingPay },
                  { label: 'Party Pay', value: totals.partyPay },
                ].map(t => (
                  <div key={t.label} className="bg-gray-50 rounded px-3 py-2">
                    <div className="text-[10px] text-gray-500">{t.label}</div>
                    <div className="text-sm font-bold text-gray-800">{formatCurrency(t.value || 0)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Missing Pay */}
            <IssueSection
              title="Missing Pay"
              description="Professor assigned but all pay sources resolve to $0"
              items={issues.missingPay}
              color="red"
              renderItem={(item) => (
                <div key={`${item.session_id}-${item.role}`} className="flex items-center gap-3 text-xs py-1">
                  <span className="text-gray-500 w-16">{formatDate(item.session_date)}</span>
                  <Link to={`/programs/${item.program_id}`} className="font-medium text-[#1e3a5f] hover:underline">{item.program_nickname}</Link>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${item.role === 'Lead' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{item.role}</span>
                  <span className="text-gray-600">{item.professor_name}</span>
                  <span className="text-red-600 font-medium ml-auto">$0 pay — no session, program, or base pay set</span>
                </div>
              )}
            />

            {/* Orphan Pay */}
            <IssueSection
              title="Orphan Pay"
              description="Pay amount set on session but no professor assigned — someone may have been removed"
              items={issues.orphanPay}
              color="amber"
              renderItem={(item) => (
                <div key={`${item.session_id}-${item.role}`} className="flex items-center gap-3 text-xs py-1">
                  <span className="text-gray-500 w-16">{formatDate(item.session_date)}</span>
                  <Link to={`/programs/${item.program_id}`} className="font-medium text-[#1e3a5f] hover:underline">{item.program_nickname}</Link>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${item.role === 'Lead' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{item.role}</span>
                  <span className="text-amber-600 font-medium ml-auto">{formatCurrency(item.pay_amount)} set but no professor assigned</span>
                </div>
              )}
            />

            {/* Ghost Sessions */}
            <IssueSection
              title="Unassigned Billable Sessions"
              description="Billable class date with no professor and no pay — needs a teacher assigned"
              items={issues.ghostSessions}
              color="red"
              renderItem={(item) => (
                <div key={item.session_id} className="flex items-center gap-3 text-xs py-1">
                  <span className="text-gray-500 w-16">{formatDate(item.session_date)}</span>
                  <Link to={`/programs/${item.program_id}`} className="font-medium text-[#1e3a5f] hover:underline">{item.program_nickname}</Link>
                  {item.location_nickname && <span className="text-gray-400">{item.location_nickname}</span>}
                  <span className="text-red-600 font-medium ml-auto">No professor assigned</span>
                </div>
              )}
            />

            {totalIssues === 0 && reconData && (
              <div className="text-center py-4">
                <div className="text-green-600 font-bold text-sm">All Clear</div>
                <div className="text-xs text-gray-400">No reconciliation issues found for this date range</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function IssueSection({ title, description, items, color, renderItem }) {
  if (!items || items.length === 0) return null;
  const borderColor = color === 'red' ? 'border-red-200' : 'border-amber-200';
  const bgColor = color === 'red' ? 'bg-red-50' : 'bg-amber-50';
  const titleColor = color === 'red' ? 'text-red-700' : 'text-amber-700';
  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-3`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-semibold ${titleColor}`}>{title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${color === 'red' ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>{items.length}</span>
      </div>
      <div className="text-[10px] text-gray-500 mb-2">{description}</div>
      <div className="divide-y divide-gray-200/50">
        {items.map(renderItem)}
      </div>
    </div>
  );
}
