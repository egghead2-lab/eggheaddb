import { PayrollTabBar } from './PayrollDashboardPage';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSessionPay, editSessionPay } from '../api/payroll';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatCurrency } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';

export default function SessionPayPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = new Date();
  const thirtyAgo = new Date(today); thirtyAgo.setDate(today.getDate() - 30);
  const [start, setStart] = useState(thirtyAgo.toISOString().split('T')[0]);
  const [end, setEnd] = useState(today.toISOString().split('T')[0]);
  const [flagFilter, setFlagFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['session-pay', start, end, flagFilter],
    queryFn: () => getSessionPay({ start, end, flag: flagFilter || undefined }),
  });
  const entries = data?.data || [];

  const editMutation = useMutation({
    mutationFn: ({ id, data }) => editSessionPay(id, { ...data, edited_by: user?.name }),
    onSuccess: () => qc.invalidateQueries(['session-pay']),
  });

  const inlineEdit = (id, field, value) => {
    editMutation.mutate({ id, data: { [field]: value } });
  };

  return (
    <AppShell>
      <PayrollTabBar />
      <PageHeader title="Session Pay Review">
        <Input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-36" />
        <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-36" />
        <Select value={flagFilter} onChange={e => setFlagFilter(e.target.value)} className="w-40">
          <option value="">All</option>
          <option value="MISSING">Missing Pay Only</option>
        </Select>
      </PageHeader>
      <div className="p-6">
        {isLoading ? <Spinner className="w-6 h-6" /> : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">Role</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Pay</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Source</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Hours</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Regular</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Bonus</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600 w-16">Flag</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Edited</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-8 text-gray-400">No session pay records</td></tr>
                ) : entries.map((e, i) => (
                  <tr key={e.id} className={e.assist_pay_flag === 'MISSING' ? 'bg-red-50/30' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2">{formatDate(e.session_date)}</td>
                    <td className="px-3 py-2 text-gray-600">{e.program_nickname || '—'}</td>
                    <td className="px-3 py-2 font-medium">{e.professor_name || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                        e.role === 'Lead' ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'bg-gray-100 text-gray-600'
                      }`}>{e.role}</span>
                    </td>
                    <td className="px-3 py-1 text-right">
                      <input type="number" step="0.01" defaultValue={e.pay_amount}
                        onBlur={ev => { if (parseFloat(ev.target.value) !== parseFloat(e.pay_amount)) inlineEdit(e.id, 'pay_amount', ev.target.value); }}
                        className="w-20 rounded border border-gray-200 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{e.pay_source}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{e.class_hours}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(e.regular_pay_component)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(e.bonus_component)}</td>
                    <td className="px-2 py-2 text-center">
                      {e.assist_pay_flag === 'MISSING' ? (
                        <span className="text-xs text-red-600 font-bold">MISSING</span>
                      ) : (
                        <span className="text-xs text-green-600">OK</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">{e.edited_by ? `${e.edited_by}` : '—'}</td>
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
