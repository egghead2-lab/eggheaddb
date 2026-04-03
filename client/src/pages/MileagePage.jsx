import { PayrollTabBar } from './PayrollDashboardPage';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMileage, createMileage, processMileage } from '../api/payroll';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { SearchSelect } from '../components/ui/SearchSelect';
import { useAuth } from '../hooks/useAuth';
import { formatDate, formatCurrency } from '../lib/utils';
import api from '../api/client';

export default function MileagePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const canProcess = ['Admin', 'CEO', 'Human Resources'].includes(user?.role);

  const [form, setForm] = useState({ professor_id: '', submission_date: new Date().toISOString().split('T')[0], miles_claimed: '', reimbursement_total: '', pdf_link: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: profsData } = useQuery({
    queryKey: ['mileage-profs'],
    queryFn: () => api.get('/professors?status=Active&limit=500').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const professors = (profsData?.data || []).map(p => ({ id: String(p.id), label: `${p.professor_nickname} ${p.last_name || ''}`.trim() }));

  const { data, isLoading } = useQuery({ queryKey: ['mileage'], queryFn: () => getMileage({}) });
  const entries = data?.data || [];

  const createMutation = useMutation({
    mutationFn: (d) => createMileage(d),
    onSuccess: () => { qc.invalidateQueries(['mileage']); setShowForm(false); setForm({ professor_id: '', submission_date: new Date().toISOString().split('T')[0], miles_claimed: '', reimbursement_total: '', pdf_link: '' }); },
  });

  const processMutation = useMutation({
    mutationFn: (id) => processMileage(id),
    onSuccess: () => qc.invalidateQueries(['mileage']),
  });

  return (
    <AppShell>
      <PayrollTabBar />
      <PageHeader title="Mileage Submissions" action={
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Submission'}</Button>
      } />
      <div className="p-6 space-y-4">
        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <div className="grid grid-cols-5 gap-4">
              <SearchSelect label="Professor" value={form.professor_id} onChange={v => set('professor_id', v)}
                options={professors} displayKey="label" valueKey="id" placeholder="Search…" />
              <Input label="Date" type="date" value={form.submission_date} onChange={e => set('submission_date', e.target.value)} />
              <Input label="Miles Claimed" type="number" value={form.miles_claimed} onChange={e => set('miles_claimed', e.target.value)} />
              <Input label="Reimbursement Total" type="number" step="0.01" prefix="$" value={form.reimbursement_total} onChange={e => set('reimbursement_total', e.target.value)} />
              <Input label="PDF Link" value={form.pdf_link} onChange={e => set('pdf_link', e.target.value)} placeholder="URL…" />
            </div>
            <Button onClick={() => form.professor_id && form.miles_claimed && createMutation.mutate({ ...form, professor_id: parseInt(form.professor_id), miles_claimed: parseInt(form.miles_claimed), reimbursement_total: parseFloat(form.reimbursement_total) || 0, submitted_by: user?.name || '' })}
              disabled={!form.professor_id || !form.miles_claimed || createMutation.isPending}>
              {createMutation.isPending ? '…' : 'Submit'}
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
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Miles</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Reimbursement</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">PDF</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Submitted By</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Status</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">No submissions</td></tr>
                ) : entries.map((e, i) => (
                  <tr key={e.id} className={!e.is_processed ? 'bg-amber-50/30' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2">{formatDate(e.submission_date)}</td>
                    <td className="px-3 py-2 font-medium">{e.professor_name || '—'}</td>
                    <td className="px-3 py-2 text-right">{e.miles_claimed}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(e.reimbursement_total)}</td>
                    <td className="px-3 py-2">{e.pdf_link ? <a href={e.pdf_link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1e3a5f] hover:underline">View</a> : '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{e.submitted_by || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {e.is_processed ? <span className="text-xs text-green-600 font-medium">Processed</span> : <span className="text-xs text-amber-600 font-medium">Pending</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {!e.is_processed && canProcess && (
                        <button onClick={() => processMutation.mutate(e.id)} disabled={processMutation.isPending}
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
