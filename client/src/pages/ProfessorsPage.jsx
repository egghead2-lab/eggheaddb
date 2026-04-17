import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProfessors } from '../api/professors';
import { syncTrainual, archiveTrainualUser, getProfessorIssues } from '../api/trainual';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';
import { RatingBadge } from '../components/ui/DevelopmentalRating';
import { formatCurrency } from '../lib/utils';
import { TRAINING_FIELDS } from '../lib/constants';
import { exportToCsv } from '../lib/exportCsv';
import { SortTh } from '../components/ui/SortTh';
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import { ColumnPicker } from '../components/ui/ColumnPicker';
import { useRowSelection } from '../hooks/useRowSelection';
import { BulkEditBar } from '../components/ui/BulkEditBar';
import { CopyableTable } from '../components/ui/CopyableTable';

const COLUMNS = [
  { key: 'nickname', label: 'Preferred Name' },
  { key: 'status', label: 'Status' },
  { key: 'area', label: 'Area' },
  { key: 'sc_owner', label: 'SC Owner' },
  { key: 'trained', label: 'Trained In' },
  { key: 'base_pay', label: 'Base Pay' },
  { key: 'programs', label: 'Programs' },
  { key: 'last_eval', label: 'Last Eval' },
  { key: 'trainual', label: 'Trainual %' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'actions', label: 'Actions' },
];

export default function ProfessorsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [area, setArea] = useState('');
  const [training, setTraining] = useState('');
  const [coordinator, setCoordinator] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('');
  const [dir, setDir] = useState('asc');
  const [showIssues, setShowIssues] = useState(false);

  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const { data: issuesData, refetch: refetchIssues } = useQuery({
    queryKey: ['trainual-professor-issues'],
    queryFn: getProfessorIssues,
    staleTime: 5 * 60 * 1000,
  });
  const issues = issuesData?.data || { missingFromTrainual: [], shouldBeArchived: [] };
  const issuesCount = (issues.missingFromTrainual?.length || 0) + (issues.shouldBeArchived?.length || 0);

  const syncMutation = useMutation({
    mutationFn: syncTrainual,
    onSuccess: (res) => {
      qc.invalidateQueries(['professors']);
      qc.invalidateQueries(['trainual-professor-issues']);
      alert(`Synced ${res.synced} Trainual users`);
    },
    onError: (err) => alert('Sync failed: ' + (err?.response?.data?.error || err.message)),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveTrainualUser,
    onSuccess: () => {
      qc.invalidateQueries(['professors']);
      qc.invalidateQueries(['trainual-professor-issues']);
    },
    onError: (err) => alert('Archive failed: ' + (err?.response?.data?.error || err.message)),
  });

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
    coordinator: coordinator || undefined,
    sort: sort || undefined,
    dir: sort ? dir : undefined,
    page,
  };

  const colPrefs = useColumnPrefs('professors', COLUMNS);
  const v = (key) => colPrefs.isColumnVisible(key);

  const { data, isLoading } = useQuery({
    queryKey: ['professors', filters],
    queryFn: () => getProfessors(filters),
  });

  const professors = data?.data || [];
  const total = data?.total || 0;
  const selection = useRowSelection(professors);

  const bulkFields = [
    { key: 'professor_status_id', label: 'Status', type: 'select', options: (ref.professorStatuses || []).map(s => ({ value: s.id, label: s.professor_status_name })) },
    { key: 'geographic_area_id', label: 'Area', type: 'select', options: (ref.areas || []).map(a => ({ value: a.id, label: a.geographic_area_name })) },
    { key: 'base_pay', label: 'Base Pay', type: 'number' },
    { key: 'active', label: 'Active', type: 'toggle' },
    { key: 'science_trained_id', label: 'Science Trained', type: 'toggle' },
    { key: 'engineering_trained_id', label: 'Engineering Trained', type: 'toggle' },
    { key: 'show_party_trained_id', label: 'Dry Ice Show Trained', type: 'toggle' },
    { key: 'camp_trained_id', label: 'Camp Trained', type: 'toggle' },
    { key: 'studysmart_trained_id', label: 'StudySmart Trained', type: 'toggle' },
    { key: 'robotics_trained_id', label: 'Robotics Trained', type: 'toggle' },
  ];
  const limit = data?.limit || 50;

  const reset = () => { setSearch(''); setStatus(''); setArea(''); setTraining(''); setCoordinator(''); setPage(1); };
  const hasFilters = search || status || area || training || coordinator;

  return (
    <AppShell>
      <BulkEditBar count={selection.count} selected={selection.selected} onClear={selection.clearAll}
        table="professor" queryKey="professors" fields={bulkFields} />
      <PageHeader title="Professors" action={
        <div className="flex gap-2">
          <button type="button" onClick={() => exportToCsv('professors.csv', professors, [
            { label: 'Preferred Name', key: 'professor_nickname' }, { label: 'Status', key: 'professor_status_name' },
            { label: 'Area', key: 'geographic_area_name' }, { label: 'Email', key: 'email' },
            { label: 'Phone', key: 'phone_number' }, { label: 'Base Pay', key: 'base_pay' },
            { label: 'Programs', key: 'active_program_count' },
          ])} className="text-xs text-gray-400 hover:text-[#1e3a5f] py-2">Export CSV</button>
          <button type="button" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
            className="text-xs text-gray-400 hover:text-[#1e3a5f] py-2">
            {syncMutation.isPending ? 'Syncing…' : 'Sync Trainual'}
          </button>
          <Link to="/professors/new"><Button>+ New Professor</Button></Link>
          <ColumnPicker {...colPrefs} />
        </div>
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
        <Select value={coordinator} onChange={e => { setCoordinator(e.target.value); setPage(1); }} className="w-44">
          <option value="">All Coordinators</option>
          {(ref.staffUsers || []).map(u => (
            <option key={u.id} value={u.id}>{u.display_name}</option>
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
        {issuesCount > 0 && (
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-amber-800 font-medium">⚠ {issuesCount} Trainual issue{issuesCount !== 1 ? 's' : ''} need attention</span>
              <button onClick={() => setShowIssues(!showIssues)} className="text-xs text-[#1e3a5f] hover:underline">
                {showIssues ? 'Hide' : 'View'}
              </button>
            </div>
            {showIssues && (
              <div className="mt-3 space-y-3">
                {issues.shouldBeArchived?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-amber-800 mb-1">
                      Inactive/Terminated but still active in Trainual ({issues.shouldBeArchived.length})
                    </div>
                    <ul className="text-xs space-y-1">
                      {issues.shouldBeArchived.map(p => (
                        <li key={p.id} className="flex items-center gap-2">
                          <Link to={`/professors/${p.id}`} className="text-[#1e3a5f] hover:underline">{p.professor_nickname}</Link>
                          <span className="text-gray-500">— {p.professor_status_name}</span>
                          <button onClick={() => archiveMutation.mutate(p.trainual_user_id)}
                            disabled={archiveMutation.isPending}
                            className="text-[10px] px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded font-medium ml-auto">
                            Archive in Trainual
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {issues.missingFromTrainual?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-amber-800 mb-1">
                      Active but missing from Trainual ({issues.missingFromTrainual.length})
                    </div>
                    <ul className="text-xs space-y-1">
                      {issues.missingFromTrainual.map(p => (
                        <li key={p.id}>
                          <Link to={`/professors/${p.id}`} className="text-[#1e3a5f] hover:underline">{p.professor_nickname}</Link>
                          <span className="text-gray-500"> — {p.professor_status_name}{p.trainual_status ? ` (Trainual: ${p.trainual_status})` : ' (no Trainual account)'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            <CopyableTable className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="w-8 px-2 py-3">
                      <input type="checkbox" checked={selection.isAllSelected} onChange={selection.toggleAll}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
                    </th>
                    {v('nickname') && <SortTh col="nickname" sort={sort} dir={dir} onSort={handleSort}>Preferred Name</SortTh>}
                    {v('status') && <SortTh col="status" sort={sort} dir={dir} onSort={handleSort}>Status</SortTh>}
                    {v('area') && <SortTh col="area" sort={sort} dir={dir} onSort={handleSort}>Area</SortTh>}
                    {v('sc_owner') && <th className="text-left px-4 py-3 font-semibold text-gray-700">SC Owner</th>}
                    {v('trained') && <th className="text-left px-4 py-3 font-semibold text-gray-700">Trained In</th>}
                    {v('base_pay') && <SortTh col="base_pay" sort={sort} dir={dir} onSort={handleSort} align="right">Base Pay</SortTh>}
                    {v('programs') && <SortTh col="programs" sort={sort} dir={dir} onSort={handleSort} align="center">Programs</SortTh>}
                    {v('last_eval') && <th className="text-center px-4 py-3 font-semibold text-gray-700">Last Eval</th>}
                    {v('trainual') && <SortTh col="trainual" sort={sort} dir={dir} onSort={handleSort} align="center">Trainual %</SortTh>}
                    {v('compliance') && <th className="text-center px-4 py-3 font-semibold text-gray-700">Compliance</th>}
                    {v('actions') && <th className="w-16"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {professors.length === 0 ? (
                    <tr><td colSpan={colPrefs.visibleKeys.length} className="text-center py-12 text-gray-400">No professors found</td></tr>
                  ) : professors.map((p, i) => (
                    <tr key={p.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${selection.isSelected(p.id) ? '!bg-[#1e3a5f]/5' : ''}`}>
                      <td className="w-8 px-2 py-2.5">
                        <input type="checkbox" checked={selection.isSelected(p.id)} onChange={() => selection.toggle(p.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
                      </td>
                      {v('nickname') && <td className="px-4 py-2.5">
                        <Link to={`/professors/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                          {p.professor_nickname} {p.last_name || ''}
                        </Link>
                      </td>}
                      {v('status') && <td className="px-4 py-2.5"><Badge status={p.professor_status_name} /></td>}
                      {v('area') && <td className="px-4 py-2.5 text-gray-600">{p.geographic_area_name || '—'}</td>}
                      {v('sc_owner') && <td className="px-4 py-2.5 text-gray-600">{p.scheduling_coordinator || '—'}</td>}
                      {v('trained') && <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {TRAINING_FIELDS.filter(t => p[t.key]).map(t => (
                            <span key={t.key} title={t.label} className="inline-block px-1.5 py-0.5 text-xs bg-[#1e3a5f]/10 text-[#1e3a5f] rounded font-medium cursor-help">{t.short}</span>
                          ))}
                        </div>
                      </td>}
                      {v('base_pay') && <td className="px-4 py-2.5 text-right text-gray-700">{formatCurrency(p.base_pay)}</td>}
                      {v('programs') && <td className="px-3 py-2.5 text-center text-gray-600">{p.active_program_count || 0}</td>}
                      {v('last_eval') && <td className="px-3 py-2.5 text-center">
                        {p.last_evaluation_date ? (
                          <div>
                            <div className="text-xs text-gray-600 mb-0.5">{formatDate(p.last_evaluation_date)}</div>
                            <RatingBadge rating={p.rating} size="xs" />
                          </div>
                        ) : p.active_program_count > 0 ? <span className="text-[10px] text-red-500 font-medium">Never</span> : <span className="text-gray-300">—</span>}
                      </td>}
                      {v('trainual') && <td className="px-3 py-2.5 text-center">
                        {(() => {
                          const pct = p.trainual_completion;
                          const isActiveProfessor = ['Active', 'Substitute', 'Training', 'In Training'].includes(p.professor_status_name);
                          const isInactiveProfessor = ['Inactive - Items Pending', 'Terminated', 'Inactive'].includes(p.professor_status_name);
                          // Status mismatch: inactive in our system but active in Trainual
                          const shouldArchive = isInactiveProfessor && p.trainual_status === 'active' && p.trainual_user_id;
                          // Active professor with no Trainual account
                          const noAccount = isActiveProfessor && (!p.trainual_user_id || p.trainual_status !== 'active');
                          if (pct == null && noAccount) {
                            return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">No Account</span>;
                          }
                          if (pct == null) return <span className="text-gray-300">—</span>;
                          const n = Number(pct);
                          const cls = n >= 80 ? 'text-green-600' : n >= 50 ? 'text-amber-600' : 'text-red-600';
                          return (
                            <div className="flex items-center gap-1 justify-center">
                              {shouldArchive && (
                                <button onClick={() => { if (confirm(`Archive ${p.professor_nickname} in Trainual?`)) archiveMutation.mutate(p.trainual_user_id); }}
                                  title="Status mismatch — click to archive in Trainual"
                                  className="text-red-500 hover:text-red-700 text-[10px]">⚠</button>
                              )}
                              <span className={`text-xs font-semibold ${cls}`}>{Math.round(n)}%</span>
                            </div>
                          );
                        })()}
                      </td>}
                      {v('compliance') && <td className="px-4 py-2.5 text-center text-xs font-medium">
                        <span className={`mr-1.5 ${p.tb_test ? 'text-green-600' : 'text-gray-300'}`}>TB</span>
                        <span className={`mr-1.5 ${p.livescan_count > 0 ? 'text-green-600' : 'text-gray-300'}`}>LS</span>
                        <span className={p.virtus ? 'text-green-600' : 'text-gray-300'}>V</span>
                      </td>}
                      {v('actions') && <td className="px-2 py-2.5 text-center">
                        <Link to={`/schedule/${p.id}`} className="text-xs text-[#1e3a5f] hover:underline" title="View schedule">Schedule</Link>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CopyableTable>
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
