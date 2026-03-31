import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getParties } from '../api/parties';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime, formatCurrency } from '../lib/utils';

export default function PartiesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['parties', { search, status, page }],
    queryFn: () => getParties({ search: search || undefined, status: status || undefined, page }),
  });

  const parties = data?.data || [];

  return (
    <AppShell>
      <PageHeader title="Parties" action={
        <Link to="/parties/new">
          <Button>+ New Party</Button>
        </Link>
      }>
        <Input placeholder="Search…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-64" />
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-36">
          <option value="">All Statuses</option>
          <option>Confirmed</option>
          <option>Pending</option>
          <option>Cancelled</option>
        </Select>
      </PageHeader>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Nickname</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Date / Time</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Lead Professor</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Total Cost</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Deposit</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Charged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parties.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">No parties found</td></tr>
                ) : parties.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-2.5">
                      <Link to={`/parties/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.program_nickname || `Party #${p.id}`}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{formatDate(p.party_date)} {formatTime(p.party_start)}</td>
                    <td className="px-4 py-2.5"><Badge status={p.class_status_name} /></td>
                    <td className="px-4 py-2.5 text-gray-600">{p.lead_professor_nickname || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatCurrency(p.total_party_cost)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatCurrency(p.deposit_amount)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {p.charge_confirmed ? <span className="text-green-600">✓</span> : <span className="text-gray-300">—</span>}
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
