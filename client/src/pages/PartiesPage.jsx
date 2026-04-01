import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getParties } from '../api/parties';
import { useProfessorList, useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { SortTh } from '../components/ui/SortTh';
import { formatDate, formatTimeRange, formatCurrency } from '../lib/utils';

export default function PartiesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [professor, setProfessor] = useState('');
  const [timeframe, setTimeframe] = useState('current');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('');
  const [dir, setDir] = useState('desc');

  const { data: profListData } = useProfessorList();
  const professorList = profListData?.data || [];
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
    professor: professor || undefined,
    timeframe,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    sort: sort || undefined,
    dir: sort ? dir : undefined,
    page,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['parties', filters],
    queryFn: () => getParties(filters),
  });

  const parties = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 50;

  const reset = () => { setSearch(''); setStatus(''); setProfessor(''); setTimeframe('current'); setDateFrom(''); setDateTo(''); setPage(1); };
  const hasFilters = search || status || professor || timeframe !== 'current' || dateFrom || dateTo;

  return (
    <AppShell>
      <PageHeader title="Parties" action={
        <Link to="/parties/new"><Button>+ New Party</Button></Link>
      }>
        <Select value={timeframe} onChange={e => { setTimeframe(e.target.value); setPage(1); }} className="w-44">
          <option value="current">Current & Future</option>
          <option value="past">Past</option>
          <option value="all">All Parties</option>
        </Select>
        <Input
          placeholder="Search by type or professor…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-56"
        />
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-36">
          <option value="">All Statuses</option>
          {(ref.classStatuses || []).map(s => (
            <option key={s.id} value={s.class_status_name}>{s.class_status_name}</option>
          ))}
        </Select>
        <Select value={professor} onChange={e => { setProfessor(e.target.value); setPage(1); }} className="w-44">
          <option value="">All Professors</option>
          {professorList.map(p => (
            <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>
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
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <SortTh col="date" sort={sort} dir={dir} onSort={handleSort}>Date</SortTh>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Time</th>
                    <SortTh col="professor" sort={sort} dir={dir} onSort={handleSort}>Lead Prof</SortTh>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Assist Prof</th>
                    <SortTh col="location" sort={sort} dir={dir} onSort={handleSort}>Location</SortTh>
                    <SortTh col="contact" sort={sort} dir={dir} onSort={handleSort}>Contact</SortTh>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Email</th>
                    <SortTh col="type" sort={sort} dir={dir} onSort={handleSort}>Format</SortTh>
                    <SortTh col="theme" sort={sort} dir={dir} onSort={handleSort}>Theme</SortTh>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">#Kids</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Total</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Charged</th>
                    <SortTh col="status" sort={sort} dir={dir} onSort={handleSort}>Status</SortTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parties.length === 0 ? (
                    <tr><td colSpan={13} className="text-center py-12 text-gray-400">No parties found</td></tr>
                  ) : parties.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Link to={`/parties/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                          {p.party_date ? formatDate(p.party_date) : <span className="text-gray-400 italic">No date</span>}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                        {formatTimeRange(p.party_start, p.class_length_minutes)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {p.lead_professor_id
                          ? <Link to={`/professors/${p.lead_professor_id}`} className="text-[#1e3a5f] hover:underline">{p.lead_professor_nickname}</Link>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {p.assistant_professor_id
                          ? <Link to={`/professors/${p.assistant_professor_id}`} className="text-[#1e3a5f] hover:underline">{p.assistant_professor_nickname}</Link>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        <div>{p.party_location_text || p.location_nickname || '—'}</div>
                        {!p.party_location_text && (p.city_name || p.zip_code) && (
                          <div className="text-xs text-gray-400">{[p.city_name, p.zip_code].filter(Boolean).join(' ')}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{p.contact_name?.trim() || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{p.contact_email || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{p.party_format_name || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{p.party_theme || p.class_name || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{p.total_kids_attended ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{formatCurrency(p.total_party_cost)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {p.charge_confirmed ? <span className="text-green-600 font-medium">✓</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5"><Badge status={p.class_status_name} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>{total} part{total !== 1 ? 'ies' : 'y'}</span>
              {total > limit && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <span className="py-1.5 px-2">Page {page}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={parties.length < limit}>Next</Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
