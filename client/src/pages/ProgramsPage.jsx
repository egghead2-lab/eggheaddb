import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPrograms, updateProgram } from '../api/programs';
import { useGeneralData, useLocationList } from '../hooks/useReferenceData';
import { CopyableTable } from '../components/ui/CopyableTable';
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
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import { ColumnPicker } from '../components/ui/ColumnPicker';
import { useRowSelection } from '../hooks/useRowSelection';
import { BulkEditBar } from '../components/ui/BulkEditBar';

const COLUMNS = [
  { key: 'nickname', label: 'Program' },
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
  { key: 'type', label: 'Type' },
  { key: 'day_time', label: 'Day / Time' },
  { key: 'start_date', label: 'Start' },
  { key: 'end_date', label: 'End' },
  { key: 'professor', label: 'Lead Prof' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'enrolled', label: 'Enrolled' },
];

export default function ProgramsPage() {
  const qc = useQueryClient();
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
  const [editEnrollment, setEditEnrollment] = useState(false);
  const [enrollmentEdits, setEnrollmentEdits] = useState({});
  const [savingEnrollment, setSavingEnrollment] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState(null);

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

  const colPrefs = useColumnPrefs('programs', COLUMNS);
  const v = (key) => colPrefs.isColumnVisible(key);

  const { data, isLoading } = useQuery({
    queryKey: ['programs', filters],
    queryFn: () => getPrograms(filters),
  });

  const programs = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 50;
  const selection = useRowSelection(programs);

  const startEditEnrollment = () => {
    const seed = {};
    programs.forEach(p => { seed[p.id] = p.number_enrolled ?? ''; });
    setEnrollmentEdits(seed);
    setEditEnrollment(true);
  };

  const cancelEditEnrollment = () => {
    setEditEnrollment(false);
    setEnrollmentEdits({});
    setEnrollmentError(null);
  };

  const saveEnrollment = async () => {
    // Block save if any edited value exceeds its program's max
    const overCaps = programs.filter(p => {
      const v = enrollmentEdits[p.id];
      return p.maximum_students && v !== '' && v != null && Number(v) > Number(p.maximum_students);
    });
    if (overCaps.length) {
      setEnrollmentError(`${overCaps.length} program${overCaps.length === 1 ? ' has' : 's have'} an enrolled count over the max students cap. Fix the red rows before saving.`);
      return;
    }
    setEnrollmentError(null);
    const changed = programs
      .filter(p => {
        const newVal = enrollmentEdits[p.id];
        const cur = p.number_enrolled;
        if (newVal === '' && cur == null) return false;
        return Number(newVal) !== Number(cur);
      })
      .map(p => ({ id: p.id, number_enrolled: enrollmentEdits[p.id] === '' ? null : Number(enrollmentEdits[p.id]) }));
    if (!changed.length) { cancelEditEnrollment(); return; }
    setSavingEnrollment(true);
    let saved = 0, failed = 0;
    for (const c of changed) {
      try { await updateProgram(c.id, { number_enrolled: c.number_enrolled }); saved++; }
      catch { failed++; }
    }
    setSavingEnrollment(false);
    qc.invalidateQueries(['programs']);
    cancelEditEnrollment();
    if (failed) alert(`Saved ${saved}, failed ${failed}`);
  };

  const bulkFields = [
    { key: 'class_status_id', label: 'Status', type: 'select', options: (ref.classStatuses || []).map(s => ({ value: s.id, label: s.class_status_name })) },
    { key: 'lead_professor_id', label: 'Lead Professor', type: 'select', options: (ref.partyAssistProfessors || []).map(p => ({ value: p.id, label: p.display_name })) },
    { key: 'active', label: 'Active', type: 'toggle' },
    { key: 'payment_through_us', label: 'Payment Through Us', type: 'toggle' },
    { key: 'roster_received', label: 'Roster Received', type: 'toggle' },
    { key: 'roster_confirmed', label: 'Roster Confirmed', type: 'toggle' },
    { key: 'flyer_required', label: 'Flyer Required', type: 'toggle' },
    { key: 'demo_required', label: 'Demo Required', type: 'toggle' },
    { key: 'invoice_needed', label: 'Invoice Needed', type: 'toggle' },
    { key: 'lead_professor_pay', label: 'Lead Prof Pay', type: 'number' },
    { key: 'tb_required', label: 'TB Required', type: 'toggle' },
    { key: 'livescan_required', label: 'Livescan Required', type: 'toggle' },
    { key: 'virtus_required', label: 'Virtus Required', type: 'toggle' },
  ];

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
      <BulkEditBar count={selection.count} selected={selection.selected} onClear={selection.clearAll}
        table="program" queryKey="programs" fields={bulkFields} />
      <PageHeader title="Programs" action={
        <div className="flex gap-2">
          <button type="button" onClick={() => exportToCsv('programs.csv', programs, [
            { label: 'Program', key: 'program_nickname' }, { label: 'Status', key: 'class_status_name' },
            { label: 'Location', key: 'location_nickname' }, { label: 'Type', key: 'class_name' },
            { label: 'Lead Professor', key: 'lead_professor_nickname' }, { label: 'Sessions', key: 'session_count' },
            { label: 'Enrolled', key: 'number_enrolled' }, { label: 'Start', key: 'first_session_date' }, { label: 'End', key: 'last_session_date' },
          ])} className="text-xs text-gray-400 hover:text-[#1e3a5f] py-2">Export CSV</button>
          <Link to="/programs/new"><Button>+ New Program</Button></Link>
          <ColumnPicker {...colPrefs} />
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
            {enrollmentError && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 text-sm text-red-800">
                  <span className="font-bold">⚠</span>
                  <span>{enrollmentError}</span>
                </div>
                <button onClick={() => setEnrollmentError(null)}
                  className="text-xs text-red-400 hover:text-red-700 shrink-0">Dismiss</button>
              </div>
            )}
            <CopyableTable className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="w-8 px-2 py-3">
                      <input type="checkbox" checked={selection.isAllSelected} onChange={selection.toggleAll}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
                    </th>
                    {v('nickname') && <SortTh col="nickname" sort={sort} dir={dir} onSort={handleSort}>Program</SortTh>}
                    {v('status') && <SortTh col="status" sort={sort} dir={dir} onSort={handleSort}>Status</SortTh>}
                    {v('location') && <SortTh col="location" sort={sort} dir={dir} onSort={handleSort}>Location</SortTh>}
                    {v('type') && <SortTh col="type" sort={sort} dir={dir} onSort={handleSort}>Type</SortTh>}
                    {v('day_time') && <th className="text-left px-4 py-3 font-semibold text-gray-700">Day / Time</th>}
                    {v('start_date') && <SortTh col="start_date" sort={sort} dir={dir} onSort={handleSort}>Start</SortTh>}
                    {v('end_date') && <SortTh col="end_date" sort={sort} dir={dir} onSort={handleSort}>End</SortTh>}
                    {v('professor') && <SortTh col="professor" sort={sort} dir={dir} onSort={handleSort}>Lead Prof</SortTh>}
                    {v('sessions') && <th className="text-center px-3 py-3 font-semibold text-gray-700 w-16">Sessions</th>}
                    {v('enrolled') && <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <span>Enrolled</span>
                        {editEnrollment ? (
                          <span className="flex items-center gap-1">
                            <button type="button" onClick={saveEnrollment} disabled={savingEnrollment}
                              className="text-[10px] px-2 py-0.5 rounded bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50">
                              {savingEnrollment ? 'Saving…' : 'Save All'}
                            </button>
                            <button type="button" onClick={cancelEditEnrollment} disabled={savingEnrollment}
                              className="text-[10px] px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium">
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button type="button" onClick={startEditEnrollment} title="Bulk edit enrollments"
                            className="text-[10px] px-2 py-0.5 rounded bg-gray-100 hover:bg-[#1e3a5f] hover:text-white text-gray-600 font-medium transition-colors">
                            Edit
                          </button>
                        )}
                      </div>
                    </th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {programs.length === 0 ? (
                    <tr><td colSpan={colPrefs.visibleKeys.length} className="text-center py-12 text-gray-400">No programs found</td></tr>
                  ) : programs.map((p, i) => (
                    <tr key={p.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${selection.isSelected(p.id) ? '!bg-[#1e3a5f]/5' : ''}`}>
                      <td className="w-8 px-2 py-2.5">
                        <input type="checkbox" checked={selection.isSelected(p.id)} onChange={() => selection.toggle(p.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
                      </td>
                      {v('nickname') && <td className="px-4 py-2.5">
                        <Link to={`/programs/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
                      </td>}
                      {v('status') && <td className="px-4 py-2.5"><Badge status={p.class_status_name} /></td>}
                      {v('location') && <td className="px-4 py-2.5 text-gray-600">
                        {p.location_id ? <Link to={`/locations/${p.location_id}`} className="text-[#1e3a5f] hover:underline">{p.location_nickname}</Link> : (p.party_city || '—')}
                      </td>}
                      {v('type') && <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {p.class_type_name && (
                            <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded whitespace-nowrap shrink-0 ${
                              p.class_type_name === 'Science' ? 'bg-blue-100 text-blue-700' :
                              p.class_type_name === 'Engineering' ? 'bg-orange-100 text-orange-700' :
                              p.class_type_name === 'Robotics' ? 'bg-purple-100 text-purple-700' :
                              p.class_type_name === 'Financial Literacy' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{p.class_type_name}</span>
                          )}
                          <span className="text-gray-600 truncate">{p.class_name || p.program_type_name || '—'}</span>
                        </div>
                      </td>}
                      {v('day_time') && <td className="px-4 py-2.5 text-gray-600">{getProgramDay(p)} {formatTime(p.start_time)}</td>}
                      {v('start_date') && <td className="px-4 py-2.5 text-gray-600 text-xs">{p.first_session_date ? formatDate(p.first_session_date) : '—'}</td>}
                      {v('end_date') && <td className="px-4 py-2.5 text-gray-600 text-xs">{p.last_session_date ? formatDate(p.last_session_date) : '—'}</td>}
                      {v('professor') && <td className="px-4 py-2.5 text-gray-600">{p.lead_professor_id ? <Link to={`/professors/${p.lead_professor_id}`} className="text-[#1e3a5f] hover:underline">{p.lead_professor_nickname}</Link> : '—'}</td>}
                      {v('sessions') && <td className="px-3 py-2.5 text-center text-gray-600">{p.session_count || 0}</td>}
                      {v('enrolled') && <td className="px-4 py-2.5 text-right text-gray-700">
                        {editEnrollment ? (
                          <div className="flex items-center justify-end gap-1">
                            {(() => {
                              const val = enrollmentEdits[p.id];
                              const over = p.maximum_students && val !== '' && val != null && Number(val) > Number(p.maximum_students);
                              return (
                                <input type="number" min="0" max={p.maximum_students || undefined}
                                  value={val ?? ''}
                                  onChange={e => setEnrollmentEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                                  title={over ? `Cannot exceed max of ${p.maximum_students}` : ''}
                                  className={`w-14 rounded border px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 ${over ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-300' : 'border-gray-300 focus:ring-[#1e3a5f]'}`} />
                              );
                            })()}
                            <span className="text-xs text-gray-400">/ {p.maximum_students || '—'}</span>
                          </div>
                        ) : (
                          p.number_enrolled != null ? `${p.number_enrolled} / ${p.maximum_students || '—'}` : '—'
                        )}
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CopyableTable>
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
