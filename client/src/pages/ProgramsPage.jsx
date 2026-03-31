import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPrograms } from '../api/programs';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime, getProgramDay } from '../lib/utils';
import { SortTh } from '../components/ui/SortTh';

export default function ProgramsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [area, setArea] = useState('');
  const [programType, setProgramType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('');
  const [dir, setDir] = useState('desc');

  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const filters = {
    search: search || undefined,
    status: status || undefined,
    area: area || undefined,
    program_type: programType || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    sort: sort || undefined,
    dir: sort ? dir : undefined,
    page,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['programs', filters],
    queryFn: () => getPrograms(filters),
  });

  const programs = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 50;

  const handleSort = (col) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('asc'); }
    setPage(1);
  };

  const reset = () => {
    setSearch(''); setStatus(''); setArea('');
    setProgramType(''); setDateFrom(''); setDateTo(''); setPage(1);
  };
  const hasFilters = search || status || area || programType || dateFrom || dateTo;

  return (
    <AppShell>
      <PageHeader title="Programs" action={
        <Link to="/programs/new"><Button>+ New Program</Button></Link>
      }>
        <Input
          placeholder="Search nickname or location…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-64"
        />
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Statuses</option>
          {(ref.classStatuses || []).map(s => (
            <option key={s.id} value={s.class_status_name}>{s.class_status_name}</option>
          ))}
        </Select>
        <Select value={area} onChange={e => { setArea(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Areas</option>
          {(ref.areas || []).map(a => (
            <option key={a.id} value={a.geographic_area_name}>{a.geographic_area_name}</option>
          ))}
        </Select>
        <Select value={programType} onChange={e => { setProgramType(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Types</option>
          {(ref.programTypes || []).map(t => (
            <option key={t.id} value={t.program_type_name}>{t.program_type_name}</option>
          ))}
        </Select>
        <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-36" title="Date from" />
        <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-36" title="Date to" />
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
                    <SortTh col="nickname" sort={sort} dir={dir} onSort={handleSort}>Program</SortTh>
                    <SortTh col="status" sort={sort} dir={dir} onSort={handleSort}>Status</SortTh>
                    <SortTh col="location" sort={sort} dir={dir} onSort={handleSort}>Location</SortTh>
                    <SortTh col="type" sort={sort} dir={dir} onSort={handleSort}>Type</SortTh>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Day / Time</th>
                    <SortTh col="start_date" sort={sort} dir={dir} onSort={handleSort}>Start</SortTh>
                    <SortTh col="end_date" sort={sort} dir={dir} onSort={handleSort}>End</SortTh>
                    <SortTh col="professor" sort={sort} dir={dir} onSort={handleSort}>Lead Prof</SortTh>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {programs.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-gray-400">No programs found</td></tr>
                  ) : programs.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5">
                        <Link to={`/programs/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
                      </td>
                      <td className="px-4 py-2.5"><Badge status={p.class_status_name} /></td>
                      <td className="px-4 py-2.5 text-gray-600">{p.location_nickname || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{p.class_name || p.program_type_name || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{getProgramDay(p)} {formatTime(p.start_time)}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{p.first_session_date ? formatDate(p.first_session_date) : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{p.last_session_date ? formatDate(p.last_session_date) : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{p.lead_professor_nickname || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">
                        {p.number_enrolled != null ? `${p.number_enrolled} / ${p.maximum_students || '—'}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>{total} program{total !== 1 ? 's' : ''}</span>
              {total > limit && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <span className="py-1.5 px-2">Page {page}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={programs.length < limit}>Next</Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
