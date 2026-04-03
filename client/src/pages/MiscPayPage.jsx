import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMiscPay, createMiscPay, reviewMiscPay } from '../api/payroll';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { SearchSelect } from '../components/ui/SearchSelect';
import { useAuth } from '../hooks/useAuth';
import { formatDate, formatCurrency } from '../lib/utils';
import api from '../api/client';

const PAY_TYPES = [
  'Training or Bonus Pay',
  'Class Related Non-Standard Pay',
  'Reimbursement',
  'Miscellaneous Work',
  'Livescan',
  'Virtus',
];

const BONUS_SUBTYPES = [
  'Party Training',
  '6 Month Bonus - $50',
  '1 Year Bonus - $100',
  '2 Year Bonus - $200',
  '3 Year Bonus - $300',
  '4 Year Bonus - $300',
  '5 Year Bonus - $300',
  'Mandated Reporter Training - $65',
];

const REIMB_SUBTYPES = ['Gas', 'Materials Pickup', 'Materials Purchase', 'Other Class Requirement'];

export default function MiscPayPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('unreviewed');
  const canApprove = ['Admin', 'CEO', 'Human Resources'].includes(user?.role);

  // Form state
  const [form, setForm] = useState({
    professor_id: '', pay_date: new Date().toISOString().split('T')[0],
    pay_type: '', subtype: '', description: '', location: '',
    program_id: '', hourly_pay: '', hours: '', dollar_amount: '',
    manual_total_override: '', total_reimbursement: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Data
  const { data, isLoading } = useQuery({
    queryKey: ['misc-pay', filter],
    queryFn: () => getMiscPay({ reviewed: filter === 'unreviewed' ? 'false' : filter === 'reviewed' ? 'true' : undefined }),
  });
  const entries = data?.data || [];

  // Active professors
  const { data: profsData } = useQuery({
    queryKey: ['misc-pay-profs'],
    queryFn: () => api.get('/professors?status=Active&limit=500').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const professors = (profsData?.data || []).map(p => ({
    id: String(p.id), label: `${p.professor_nickname} ${p.last_name || ''}`.trim(),
  }));

  // Active programs for class-related pay
  const { data: progsData } = useQuery({
    queryKey: ['misc-pay-progs'],
    queryFn: () => api.get('/programs?timeframe=current&limit=500').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: form.pay_type === 'Class Related Non-Standard Pay',
  });
  const programs = (progsData?.data || []).map(p => ({
    id: String(p.id), label: p.program_nickname,
  }));

  // Locations for livescan
  const { data: locsData } = useQuery({
    queryKey: ['misc-pay-locs'],
    queryFn: () => api.get('/locations/list').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: form.pay_type === 'Livescan',
  });
  const locations = (locsData?.data || []).map(l => ({
    id: String(l.id), label: l.nickname,
  }));

  const createMutation = useMutation({
    mutationFn: (d) => createMiscPay(d),
    onSuccess: () => {
      qc.invalidateQueries(['misc-pay']);
      setShowForm(false);
      setForm({ professor_id: '', pay_date: new Date().toISOString().split('T')[0], pay_type: '', subtype: '', description: '', location: '', program_id: '', hourly_pay: '', hours: '', dollar_amount: '', manual_total_override: '', total_reimbursement: '' });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (id) => reviewMiscPay(id, { reviewed_by: user?.name }),
    onSuccess: () => qc.invalidateQueries(['misc-pay']),
  });

  const handleSubmit = () => {
    if (!form.professor_id || !form.pay_type || !form.pay_date) return;
    createMutation.mutate({
      ...form,
      submitted_by: user?.name || '',
      professor_id: parseInt(form.professor_id) || null,
      program_id: parseInt(form.program_id) || null,
      hourly_pay: parseFloat(form.hourly_pay) || null,
      hours: parseFloat(form.hours) || null,
      dollar_amount: parseFloat(form.dollar_amount) || null,
      manual_total_override: parseFloat(form.manual_total_override) || null,
      total_reimbursement: parseFloat(form.total_reimbursement) || 0,
    });
  };

  return (
    <AppShell>
      <PageHeader title="Miscellaneous Pay" action={
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Submission'}</Button>
      }>
        <Select value={filter} onChange={e => setFilter(e.target.value)} className="w-40">
          <option value="unreviewed">Unreviewed</option>
          <option value="reviewed">Reviewed</option>
          <option value="all">All</option>
        </Select>
      </PageHeader>

      <div className="p-6 space-y-4">
        {/* Helper text */}
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Line items more than $50 must have a detailed explanation. To be paid on time, items must be recorded at least 4 business days before each pay period.
        </div>

        {/* New Submission Form */}
        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">New Misc Pay Submission</h3>
            <div className="grid grid-cols-3 gap-4">
              <SearchSelect label="Professor" required value={form.professor_id} onChange={v => set('professor_id', v)}
                options={professors} displayKey="label" valueKey="id" placeholder="Search professor…" />
              <Input label="Date" type="date" required value={form.pay_date} onChange={e => set('pay_date', e.target.value)} />
              <Select label="Pay Type" required value={form.pay_type} onChange={e => { set('pay_type', e.target.value); set('subtype', ''); }}>
                <option value="">Select…</option>
                {PAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>

            {/* === Training or Bonus Pay === */}
            {form.pay_type === 'Training or Bonus Pay' && (
              <div className="grid grid-cols-2 gap-4">
                <Select label="Select Bonus Type" required value={form.subtype} onChange={e => set('subtype', e.target.value)}>
                  <option value="">Select…</option>
                  {BONUS_SUBTYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Input label="Pay Amount" type="number" step="0.01" prefix="$" value={form.dollar_amount} onChange={e => set('dollar_amount', e.target.value)} />
              </div>
            )}

            {/* === Class Related Non-Standard Pay === */}
            {form.pay_type === 'Class Related Non-Standard Pay' && (
              <div className="space-y-4">
                <SearchSelect label="Select Class/Program" required value={form.program_id} onChange={v => set('program_id', v)}
                  options={programs} displayKey="label" valueKey="id" placeholder="Search active programs…" />
                <Input label="Description of Pay" required value={form.description} onChange={e => set('description', e.target.value)} />
                <div className="grid grid-cols-3 gap-4">
                  <Input label="Hourly Pay" type="number" step="0.01" prefix="$" value={form.hourly_pay} onChange={e => set('hourly_pay', e.target.value)} />
                  <Input label="Number of Hours" type="number" step="0.01" value={form.hours} onChange={e => set('hours', e.target.value)} placeholder="e.g. 0.5" />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">Calculated</label>
                    <span className="text-sm text-gray-500 py-1.5 px-3 bg-gray-50 rounded border border-gray-200">
                      {form.hourly_pay && form.hours ? formatCurrency(parseFloat(form.hourly_pay) * parseFloat(form.hours)) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* === Reimbursement === */}
            {form.pay_type === 'Reimbursement' && (
              <div className="space-y-4">
                <Select label="Reimbursement Type" required value={form.subtype} onChange={e => set('subtype', e.target.value)}>
                  <option value="">Select…</option>
                  {REIMB_SUBTYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Reimbursement Amount" type="number" step="0.01" prefix="$" required value={form.total_reimbursement} onChange={e => set('total_reimbursement', e.target.value)} />
                  <Input label="Description" value={form.description} onChange={e => set('description', e.target.value)} />
                </div>
              </div>
            )}

            {/* === Miscellaneous Work === */}
            {form.pay_type === 'Miscellaneous Work' && (
              <div className="space-y-4">
                <Input label="Description" required value={form.description} onChange={e => set('description', e.target.value)} />
                <div className="grid grid-cols-3 gap-4">
                  <Input label="Hourly Pay" type="number" step="0.01" prefix="$" value={form.hourly_pay} onChange={e => set('hourly_pay', e.target.value)} />
                  <Input label="Number of Hours" type="number" step="0.01" value={form.hours} onChange={e => set('hours', e.target.value)} placeholder="e.g. 0.5" />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">Calculated</label>
                    <span className="text-sm text-gray-500 py-1.5 px-3 bg-gray-50 rounded border border-gray-200">
                      {form.hourly_pay && form.hours ? formatCurrency(parseFloat(form.hourly_pay) * parseFloat(form.hours)) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* === Livescan === */}
            {form.pay_type === 'Livescan' && (
              <div className="grid grid-cols-2 gap-4">
                <SearchSelect label="Location" required value={form.location} onChange={v => set('location', v)}
                  options={locations} displayKey="label" valueKey="id" placeholder="Search locations…" />
                <Input label="Rolling Cost" type="number" step="0.01" prefix="$" required value={form.dollar_amount} onChange={e => set('dollar_amount', e.target.value)} />
              </div>
            )}

            {/* === Virtus === */}
            {form.pay_type === 'Virtus' && (
              <Input label="Cost" type="number" step="0.01" prefix="$" required value={form.dollar_amount} onChange={e => set('dollar_amount', e.target.value)} />
            )}

            <div className="flex gap-3">
              <Button onClick={handleSubmit} disabled={createMutation.isPending || !form.professor_id || !form.pay_type}>
                {createMutation.isPending ? 'Submitting…' : 'Submit'}
              </Button>
              {createMutation.isError && <span className="text-sm text-red-600">{createMutation.error?.response?.data?.error || 'Failed'}</span>}
            </div>
          </div>
        )}

        {/* Entries Table */}
        {isLoading ? <Spinner className="w-6 h-6" /> : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Subtype</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Hours</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Pay</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Reimb</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Submitted By</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Status</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-8 text-gray-400">No entries</td></tr>
                ) : entries.map((e, i) => {
                  const total = e.manual_total_override || e.dollar_amount || e.total_pay || 0;
                  return (
                    <tr key={e.id} className={`${!e.is_reviewed ? 'bg-amber-50/30' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-2">{formatDate(e.pay_date)}</td>
                      <td className="px-3 py-2 font-medium">{e.professor_name || e.professor_name_raw || '—'}</td>
                      <td className="px-3 py-2"><Badge status={e.pay_type} /></td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{e.class_name || e.subtype || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs truncate max-w-[200px]">{e.description || '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{e.hours || '—'}</td>
                      <td className="px-3 py-2 text-right font-medium">{total ? formatCurrency(total) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{e.total_reimbursement > 0 ? formatCurrency(e.total_reimbursement) : '—'}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{e.submitted_by}</td>
                      <td className="px-3 py-2 text-center">
                        {e.is_reviewed ? (
                          <div>
                            <span className="text-xs text-green-600 font-medium">Approved</span>
                            {e.reviewed_by && <div className="text-[10px] text-gray-400">{e.reviewed_by}</div>}
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">Pending</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!e.is_reviewed && canApprove && (
                          <button onClick={() => reviewMutation.mutate(e.id)} disabled={reviewMutation.isPending}
                            className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 font-medium">
                            {reviewMutation.isPending ? '…' : '✓ Approve'}
                          </button>
                        )}
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
