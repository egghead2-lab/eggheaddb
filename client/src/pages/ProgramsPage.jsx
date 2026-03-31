import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPrograms } from '../api/programs';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime, getProgramDay } from '../lib/utils';

export default function ProgramsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['programs', { search, status, page }],
    queryFn: () => getPrograms({ search: search || undefined, status: status || undefined, page }),
  });

  const programs = data?.data || [];
  const meta = data;

  return (
    <AppShell>
      <PageHeader title="Programs" action={
        <Link to="/programs/new">
          <Button>+ New Program</Button>
        </Link>
      }>
        <Input placeholder="Search by nickname or location…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-72" />
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Statuses</option>
          <option>Confirmed</option>
          <option>Unconfirmed</option>
          <option>Cancelled</option>
          <option>Completed</option>
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
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Program</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Location</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Day / Time</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Dates</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Lead Prof</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Enrolled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {programs.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">No programs found</td></tr>
                ) : programs.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-2.5">
                      <Link to={`/programs/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
                    </td>
                    <td className="px-4 py-2.5"><Badge status={p.class_status_name} /></td>
                    <td className="px-4 py-2.5 text-gray-600">{p.location_nickname || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.class_name || p.program_type_name || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{getProgramDay(p)} {formatTime(p.start_time)}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">
                      {p.first_session_date ? `${formatDate(p.first_session_date)} – ${formatDate(p.last_session_date)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{p.lead_professor_nickname || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {p.number_enrolled != null ? `${p.number_enrolled} / ${p.maximum_students || '—'}` : '—'}
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
