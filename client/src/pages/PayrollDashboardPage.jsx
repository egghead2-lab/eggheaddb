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

  const { data: missingData } = useQuery({ queryKey: ['payroll-missing'], queryFn: () => api.get('/payroll/session-pay?flag=MISSING').then(r => r.data) });
  const { data: miscData } = useQuery({ queryKey: ['payroll-unreviewed-misc'], queryFn: () => api.get('/payroll/misc-pay?reviewed=false').then(r => r.data) });
  const { data: onboardData } = useQuery({ queryKey: ['payroll-unreviewed-onboard'], queryFn: () => api.get('/payroll/onboarding-pay?reviewed=false').then(r => r.data) });
  const { data: gustoData } = useQuery({ queryKey: ['payroll-missing-gusto'], queryFn: () => api.get('/payroll/missing-gusto-codes').then(r => r.data) });
  const { data: logsData } = useQuery({ queryKey: ['nightly-logs'], queryFn: () => api.get('/payroll/nightly-job/logs').then(r => r.data) });
  const { data: missingPayData } = useQuery({ queryKey: ['missing-onboard-pay'], queryFn: () => api.get('/onboarding/missing-pay').then(r => r.data), staleTime: 60 * 1000 });

  const missing = missingData?.data?.length || 0;
  const unrevMisc = miscData?.data?.length || 0;
  const unrevOnboard = onboardData?.data?.length || 0;
  const missingGusto = gustoData?.data || [];
  const lastLog = logsData?.data?.[0];
  const missingOnboardPay = missingPayData?.data || [];

  const nightlyMutation = useMutation({
    mutationFn: () => api.post('/payroll/nightly-job/run'),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <AppShell>
      <PayrollTabBar />
      <div className="p-6 space-y-4 max-w-[1000px]">
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
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <strong>Nightly Job:</strong> Last run {lastLog ? formatDate(lastLog.run_date) : 'never'}
            {lastLog && <span className="text-gray-400 ml-2">{lastLog.sessions_written} sessions, {lastLog.errors} errors</span>}
          </div>
          <button onClick={() => nightlyMutation.mutate()} disabled={nightlyMutation.isPending}
            className="text-xs px-3 py-1.5 bg-[#1e3a5f] text-white rounded hover:bg-[#152a47] disabled:opacity-50">
            {nightlyMutation.isPending ? 'Running…' : 'Run Now'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
