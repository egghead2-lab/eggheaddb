import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPrograms } from '../api/programs';
import { useGeneralData, useLocationList } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime, getProgramDay } from '../lib/utils';
import { exportToCsv } from '../lib/exportCsv';
import { SortTh } from '../components/ui/SortTh';

export default function ProgramsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [area, setArea] = useState('');
  const [location, setLocation] = useState('');
  const [contractor, setContractor] = useState('');
  const [programType, setProgramType] = useState('');
  const [timeframe, setTimeframe] = useState('current');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('');
  const [dir, setDir] = useState('desc');

  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};
  const { data: locationListData } = useLocationList();
  const locations = locationListData?.data || [];

  const filters = {
    search: search || undefined,
    status: status || undefined,
    area: area || undefined,
    location: location || undefined,
    contractor: contractor || undefined,
    program_type: programType || undefined,
    timeframe,
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
    setSearch(''); setStatus(''); setArea(''); setLocation(''); setContractor('');
    setProgramType(''); setTimeframe('current'); setDateFrom(''); setDateTo(''); setPage(1);
  };
  const hasFilters = search || status || area || location || contractor || programType || timeframe !== 'current' || dateFrom || dateTo;

  return (
    <AppShell>
      <PageHeader title="Programs" action={
        <div className="flex gap-2">
          <button type="button" onClick={() => exportToCsv('programs.csv', programs, [
            { label: 'Program', key: 'program_nickname' }, { label: 'Status', key: 'class_status_name' },
            { label: 'Location', key: 'location_nickname' }, { label: 'Type', key: 'class_name' },
            { label: 'Lead Professor', key: 'lead_professor_nickname' }, { label: 'Sessions', key: 'session_count' },
            { label: 'Enrolled', key: 'number_enrolled' }, { label: 'Start', key: 'first_session_date' }, { label: 'End', key: 'last_session_date' },
          ])} className="text-xs text-gray-400 hover:text-[#1e3a5f] py-2">Export CSV</button>
          <Link to="/programs/new"><Button>+ New Program</Button></Link>
        </div>
      }>
        <Select value={timeframe} onChange={e => { setTimeframe(e.target.value); setPage(1); }} className="w-44">
          <option value="current">Current & Future</option>
          <option value="past">Past</option>
          <option value="all">All Programs</option>
        </Select>
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
        <Select value={location} onChange={e => { setLocation(e.target.value); setPage(1); }} className="w-44">
          <option value="">All Locations</option>
          {locations.map(l => (
            <option key={l.id} value={l.id}>{l.nickname}</option>
          ))}
        </Select>
        <Select value={contractor} onChange={e => { setContractor(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Contractors</option>
          {(ref.contractors || []).map(c => (
            <option key={c.id} value={c.id}>{c.contractor_name}</option>
          ))}
        </Select>
        <Select value={programType} onChange={e => { setProgramType(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Types</option>
          {(ref.programTypes || []).map(t => (
            <option key={t.id} value={t.program_type_name}>{t.program_type_name}</option>
          ))}
        </Select>
        <div className="flex flex-col gap-0.5">
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-36" />
          <label className="text-[10px] text-gray-400">From</label>
        </div>
        <div className="flex flex-col gap-0.5">
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-36" />
          <label className="text-[10px] text-gray-400">To</label>
        </div>
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
                    <th className="text-center px-3 py-3 font-semibold text-gray-700 w-16">Sessions</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {programs.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-12 text-gray-400">No programs found</td></tr>
                  ) : programs.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5">
                        <Link to={`/programs/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
                      </td>
                      <td className="px-4 py-2.5"><Badge status={p.class_status_name} /></td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {p.location_id ? <Link to={`/locations/${p.location_id}`} className="text-[#1e3a5f] hover:underline">{p.location_nickname}</Link> : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {p.class_name || p.program_type_name || '—'}
                        {p.class_type_name && (
                          <span className={`ml-1 inline-block px-1 py-0.5 text-[10px] font-medium rounded ${
                            p.class_type_name === 'Science' ? 'bg-blue-100 text-blue-700' :
                            p.class_type_name === 'Engineering' ? 'bg-orange-100 text-orange-700' :
                            p.class_type_name === 'Robotics' ? 'bg-purple-100 text-purple-700' :
                            p.class_type_name === 'Financial Literacy' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{p.class_type_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{getProgramDay(p)} {formatTime(p.start_time)}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{p.first_session_date ? formatDate(p.first_session_date) : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{p.last_session_date ? formatDate(p.last_session_date) : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{p.lead_professor_nickname || '—'}</td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{p.session_count || 0}</td>
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
