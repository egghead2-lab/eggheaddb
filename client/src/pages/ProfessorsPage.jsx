import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getProfessors } from '../api/professors';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatCurrency } from '../lib/utils';
import { TRAINING_FIELDS } from '../lib/constants';

export default function ProfessorsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['professors', { search, status, page }],
    queryFn: () => getProfessors({ search: search || undefined, status: status || undefined, page }),
  });

  const professors = data?.data || [];
  const meta = data;

  return (
    <AppShell>
      <PageHeader
        title="Professors"
        action={<Button as={Link} to="/professors/new"><Link to="/professors/new" className="text-white no-underline">+ New Professor</Link></Button>}
      >
        <Input
          placeholder="Search by name or nickname…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-64"
        />
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Statuses</option>
          <option>Active</option>
          <option>Inactive</option>
          <option>Terminated</option>
          <option>In Training</option>
        </Select>
      </PageHeader>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Nickname</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Area</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">SC Owner</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Trained In</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Base Pay</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {professors.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400">No professors found</td></tr>
                  ) : professors.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} style={{ cursor: 'pointer' }}>
                      <td className="px-4 py-2.5">
                        <Link to={`/professors/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                          {p.professor_nickname}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5"><Badge status={p.professor_status_name} /></td>
                      <td className="px-4 py-2.5 text-gray-600">{p.geographic_area_name || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{p.scheduling_coordinator || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {TRAINING_FIELDS.filter(t => p[t.key]).map(t => (
                            <span key={t.key} className="inline-block px-1.5 py-0.5 text-xs bg-[#1e3a5f]/10 text-[#1e3a5f] rounded font-medium">{t.short}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{formatCurrency(p.base_pay)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`mr-1 ${p.tb_test ? 'text-green-600' : 'text-gray-300'}`}>TB</span>
                        <span className={`mr-1 ${p.livescan_count > 0 ? 'text-green-600' : 'text-gray-300'}`}>LS</span>
                        <span className={p.virtus ? 'text-green-600' : 'text-gray-300'}>V</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {meta && meta.total > meta.limit && (
              <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
                <span>{meta.total} total professors</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <span className="py-1.5 px-2">Page {page}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={professors.length < meta.limit}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
