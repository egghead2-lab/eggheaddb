import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getProfessors } from '../api/professors';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatCurrency } from '../lib/utils';
import { TRAINING_FIELDS } from '../lib/constants';
import { SortTh } from '../components/ui/SortTh';

export default function ProfessorsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [area, setArea] = useState('');
  const [training, setTraining] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('');
  const [dir, setDir] = useState('asc');

  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const handleSort = (col) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('asc'); }
    setPage(1);
  };

  const filters = {
    search: search || undefined,
    status: status || undefined,
    area: area || undefined,
    training: training || undefined,
    sort: sort || undefined,
    dir: sort ? dir : undefined,
    page,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['professors', filters],
    queryFn: () => getProfessors(filters),
  });

  const professors = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 50;

  const reset = () => { setSearch(''); setStatus(''); setArea(''); setTraining(''); setPage(1); };
  const hasFilters = search || status || area || training;

  return (
    <AppShell>
      <PageHeader title="Professors" action={
        <Link to="/professors/new"><Button>+ New Professor</Button></Link>
      }>
        <Input
          placeholder="Search by name or nickname…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-60"
        />
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Statuses</option>
          {(ref.professorStatuses || []).map(s => (
            <option key={s.id} value={s.professor_status_name}>{s.professor_status_name}</option>
          ))}
        </Select>
        <Select value={area} onChange={e => { setArea(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Areas</option>
          {(ref.areas || []).map(a => (
            <option key={a.id} value={a.geographic_area_name}>{a.geographic_area_name}</option>
          ))}
        </Select>
        <Select value={training} onChange={e => { setTraining(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Training</option>
          {TRAINING_FIELDS.map(t => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </Select>
        {hasFilters && (
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700 underline">Clear</button>
        )}
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
                    <SortTh col="nickname" sort={sort} dir={dir} onSort={handleSort}>Nickname</SortTh>
                    <SortTh col="status" sort={sort} dir={dir} onSort={handleSort}>Status</SortTh>
                    <SortTh col="area" sort={sort} dir={dir} onSort={handleSort}>Area</SortTh>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">SC Owner</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Trained In</th>
                    <SortTh col="base_pay" sort={sort} dir={dir} onSort={handleSort} align="right">Base Pay</SortTh>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {professors.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400">No professors found</td></tr>
                  ) : professors.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
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
                      <td className="px-4 py-2.5 text-center text-xs font-medium">
                        <span className={`mr-1.5 ${p.tb_test ? 'text-green-600' : 'text-gray-300'}`}>TB</span>
                        <span className={`mr-1.5 ${p.livescan_count > 0 ? 'text-green-600' : 'text-gray-300'}`}>LS</span>
                        <span className={p.virtus ? 'text-green-600' : 'text-gray-300'}>V</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>{total} professor{total !== 1 ? 's' : ''}</span>
              {total > limit && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <span className="py-1.5 px-2">Page {page}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={professors.length < limit}>Next</Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
