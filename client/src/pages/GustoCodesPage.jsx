import { PayrollTabBar } from './PayrollDashboardPage';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGustoCodes, createGustoCode, updateGustoCode } from '../api/payroll';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { SearchSelect } from '../components/ui/SearchSelect';
import { useProfessorList } from '../hooks/useReferenceData';

export default function GustoCodesPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ professor_id: '', company: 'Rocketology', gusto_employee_id: '', gusto_last_name: '', gusto_first_name: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({ queryKey: ['gusto-codes'], queryFn: getGustoCodes });
  const codes = data?.data || [];

  const { data: profData } = useProfessorList();
  const professors = (profData?.data || []).map(p => ({ id: String(p.id), label: p.display_name || p.professor_nickname }));

  const createMutation = useMutation({
    mutationFn: (d) => createGustoCode(d),
    onSuccess: () => { qc.invalidateQueries(['gusto-codes']); setShowAdd(false); setForm({ professor_id: '', company: 'Rocketology', gusto_employee_id: '', gusto_last_name: '', gusto_first_name: '' }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateGustoCode(id, data),
    onSuccess: () => qc.invalidateQueries(['gusto-codes']),
  });

  return (
    <AppShell>
      <PayrollTabBar />
      <PageHeader title="Gusto Employee Codes" action={
        <Button onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ Add Code'}</Button>
      } />
      <div className="p-6 space-y-4">
        {showAdd && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <div className="grid grid-cols-5 gap-4">
              <SearchSelect label="Professor" value={form.professor_id} onChange={v => set('professor_id', v)}
                options={professors} displayKey="label" valueKey="id" placeholder="Search…" />
              <Select label="Company" value={form.company} onChange={e => set('company', e.target.value)}>
                <option value="Rocketology">Rocketology</option>
                <option value="PES">PES</option>
              </Select>
              <Input label="Gusto ID (6 char)" value={form.gusto_employee_id} onChange={e => set('gusto_employee_id', e.target.value)} placeholder="e.g. pafrxd" />
              <Input label="Last Name" value={form.gusto_last_name} onChange={e => set('gusto_last_name', e.target.value)} />
              <Input label="First Name" value={form.gusto_first_name} onChange={e => set('gusto_first_name', e.target.value)} />
            </div>
            <Button onClick={() => form.professor_id && form.gusto_employee_id && createMutation.mutate({ ...form, professor_id: parseInt(form.professor_id) })}
              disabled={!form.professor_id || !form.gusto_employee_id || createMutation.isPending}>
              {createMutation.isPending ? '…' : 'Add'}
            </Button>
            {createMutation.isError && <span className="text-sm text-red-600">{createMutation.error?.response?.data?.error || 'Failed'}</span>}
          </div>
        )}

        {isLoading ? <Spinner className="w-6 h-6" /> : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Professor</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Company</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Gusto ID</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Last Name</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">First Name</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {codes.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No Gusto codes yet</td></tr>
                ) : codes.map((c, i) => (
                  <tr key={c.id} className={!c.is_active ? 'bg-gray-50 text-gray-400' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-2 font-medium">{c.professor_name || c.nickname || '—'}</td>
                    <td className="px-3 py-2">{c.company}</td>
                    <td className="px-3 py-1">
                      <input defaultValue={c.gusto_employee_id}
                        onBlur={e => { if (e.target.value !== c.gusto_employee_id) updateMutation.mutate({ id: c.id, data: { gusto_employee_id: e.target.value } }); }}
                        className="rounded border border-gray-200 px-2 py-1 text-xs font-mono w-20 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                    </td>
                    <td className="px-3 py-1">
                      <input defaultValue={c.gusto_last_name}
                        onBlur={e => { if (e.target.value !== c.gusto_last_name) updateMutation.mutate({ id: c.id, data: { gusto_last_name: e.target.value } }); }}
                        className="rounded border border-gray-200 px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                    </td>
                    <td className="px-3 py-1">
                      <input defaultValue={c.gusto_first_name}
                        onBlur={e => { if (e.target.value !== c.gusto_first_name) updateMutation.mutate({ id: c.id, data: { gusto_first_name: e.target.value } }); }}
                        className="rounded border border-gray-200 px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={!!c.is_active}
                        onChange={() => updateMutation.mutate({ id: c.id, data: { is_active: c.is_active ? 0 : 1 } })}
                        className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
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
