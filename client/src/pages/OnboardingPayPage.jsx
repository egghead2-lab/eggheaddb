import { PayrollTabBar } from './PayrollDashboardPage';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOnboardingPay, createOnboardingPay, reviewOnboardingPay } from '../api/payroll';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { SearchSelect } from '../components/ui/SearchSelect';
import { useAuth } from '../hooks/useAuth';
import { formatDate, formatCurrency } from '../lib/utils';
import api from '../api/client';

export default function OnboardingPayPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('unreviewed');
  const canApprove = ['Admin', 'CEO', 'Human Resources'].includes(user?.role);

  const [form, setForm] = useState({
    professor_id: '', professor_name_raw: '', training_date: new Date().toISOString().split('T')[0],
    trainer: '', trainual_completed: false, modules_completed: '', trainual_pay: '35',
    virtual_training_completed: false, virtual_training_pay: '40',
    bg_check_completed: false, bg_check_cost: '55',
    training_outcome: 'Passed to Scheduling', terminate_upon_payment: false, is_rehire: false,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: profsData } = useQuery({
    queryKey: ['onboard-profs'],
    queryFn: () => api.get('/professors?limit=500').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const professors = (profsData?.data || []).map(p => ({ id: String(p.id), label: `${p.professor_nickname} ${p.last_name || ''}`.trim() }));

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-pay', filter],
    queryFn: () => getOnboardingPay({ reviewed: filter === 'unreviewed' ? 'false' : undefined }),
  });
  const entries = data?.data || [];

  const createMutation = useMutation({
    mutationFn: (d) => createOnboardingPay(d),
    onSuccess: () => { qc.invalidateQueries(['onboarding-pay']); setShowForm(false); },
  });

  const reviewMutation = useMutation({
    mutationFn: (id) => reviewOnboardingPay(id, { reviewed_by: user?.name }),
    onSuccess: () => qc.invalidateQueries(['onboarding-pay']),
  });

  const calcTotal = () => {
    let t = 0;
    if (form.trainual_completed) t += parseFloat(form.trainual_pay) || 0;
    if (form.virtual_training_completed) t += parseFloat(form.virtual_training_pay) || 0;
    return t;
  };

  return (
    <AppShell>
      <PayrollTabBar />
      <PageHeader title="Onboarding Pay" action={
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Submission'}</Button>
      }>
        <Select value={filter} onChange={e => setFilter(e.target.value)} className="w-40">
          <option value="unreviewed">Unreviewed</option>
          <option value="all">All</option>
        </Select>
      </PageHeader>
      <div className="p-6 space-y-4">
        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">New Onboarding Pay</h3>
            <div className="grid grid-cols-3 gap-4">
              <SearchSelect label="Professor" value={form.professor_id} onChange={v => set('professor_id', v)}
                options={professors} displayKey="label" valueKey="id" placeholder="Search…" />
              <Input label="Or Name (if not in system)" value={form.professor_name_raw} onChange={e => set('professor_name_raw', e.target.value)} />
              <Input label="Training Date" type="date" value={form.training_date} onChange={e => set('training_date', e.target.value)} />
            </div>
            <Input label="Trainer" value={form.trainer} onChange={e => set('trainer', e.target.value)} />
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Toggle label="Trainual Completed" checked={form.trainual_completed} onChange={v => set('trainual_completed', v)} />
                {form.trainual_completed && <Input label="Trainual Pay" type="number" step="0.01" prefix="$" value={form.trainual_pay} onChange={e => set('trainual_pay', e.target.value)} />}
              </div>
              <div className="space-y-2">
                <Toggle label="Virtual Training Completed" checked={form.virtual_training_completed} onChange={v => set('virtual_training_completed', v)} />
                {form.virtual_training_completed && <Input label="Virtual Training Pay" type="number" step="0.01" prefix="$" value={form.virtual_training_pay} onChange={e => set('virtual_training_pay', e.target.value)} />}
              </div>
              <div className="space-y-2">
                <Toggle label="Background Check Completed" checked={form.bg_check_completed} onChange={v => set('bg_check_completed', v)} />
                {form.bg_check_completed && <Input label="BG Check Cost" type="number" step="0.01" prefix="$" value={form.bg_check_cost} onChange={e => set('bg_check_cost', e.target.value)} />}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Select label="Training Outcome" value={form.training_outcome} onChange={e => set('training_outcome', e.target.value)}>
                <option value="Passed to Scheduling">Passed to Scheduling</option>
                <option value="Will Not Complete Training">Will Not Complete Training</option>
                <option value="Lost Candidate">Lost Candidate</option>
              </Select>
              <Toggle label="Terminate Upon Payment" checked={form.terminate_upon_payment} onChange={v => set('terminate_upon_payment', v)} />
              <Toggle label="Is Rehire" checked={form.is_rehire} onChange={v => set('is_rehire', v)} />
            </div>
            {calcTotal() > 0 && <div className="text-sm text-gray-500">Training pay total: <strong>{formatCurrency(calcTotal())}</strong></div>}
            <Button onClick={() => createMutation.mutate({ ...form, professor_id: parseInt(form.professor_id) || null, submitted_by: user?.name || '' })}
              disabled={createMutation.isPending || (!form.professor_id && !form.professor_name_raw)}>
              {createMutation.isPending ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        )}

        {isLoading ? <Spinner className="w-6 h-6" /> : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Trainer</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">Trainual</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">Virtual</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">BG Check</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Total</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Outcome</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Status</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-gray-400">No entries</td></tr>
                ) : entries.map((e, i) => (
                  <tr key={e.id} className={!e.is_reviewed ? 'bg-amber-50/30' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2">{formatDate(e.training_date)}</td>
                    <td className="px-3 py-2 font-medium">{e.professor_name || e.professor_name_raw || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{e.trainer || '—'}</td>
                    <td className="px-2 py-2 text-center">{e.trainual_completed ? <span className="text-green-600">✓ {formatCurrency(e.trainual_pay)}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-2 text-center">{e.virtual_training_completed ? <span className="text-green-600">✓ {formatCurrency(e.virtual_training_pay)}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-2 text-center">{e.bg_check_completed ? <span className="text-amber-600">✓ {formatCurrency(e.bg_check_cost)}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-right font-medium text-green-700">{formatCurrency(e.total_training_pay)}</td>
                    <td className="px-3 py-2"><Badge status={e.training_outcome} /></td>
                    <td className="px-3 py-2 text-center">
                      {e.is_reviewed ? (
                        <div><span className="text-xs text-green-600 font-medium">Approved</span>{e.reviewed_by && <div className="text-[10px] text-gray-400">{e.reviewed_by}</div>}</div>
                      ) : <span className="text-xs text-amber-600 font-medium">Pending</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {!e.is_reviewed && canApprove && (
                        <button onClick={() => reviewMutation.mutate(e.id)} disabled={reviewMutation.isPending}
                          className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 font-medium">✓</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
