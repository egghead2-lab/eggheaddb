import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLocations, updateLocation } from '../api/locations';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { SortTh } from '../components/ui/SortTh';
import { exportToCsv } from '../lib/exportCsv';
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import { ColumnPicker } from '../components/ui/ColumnPicker';
import { useRowSelection } from '../hooks/useRowSelection';
import { BulkEditBar } from '../components/ui/BulkEditBar';

const COLUMNS = [
  { key: 'nickname', label: 'Nickname' },
  { key: 'area', label: 'Area' },
  { key: 'phone', label: 'Phone Number', default: false },
  { key: 'contact_name', label: 'Contact Name', default: false },
  { key: 'contact_email', label: 'Contact Email', default: false },
  { key: 'contact_phone', label: 'Contact Phone', default: false },
  { key: 'info_sheet', label: 'Info Sheet', default: false },
  { key: 'client_manager', label: 'Client Manager' },
  { key: 'contractor', label: 'Contractor' },
  { key: 'retained', label: 'Retained' },
  { key: 'classes', label: 'Classes' },
  { key: 'compliance', label: 'Compliance' },
];

export default function LocationsPage() {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [area, setArea] = useState('');
  const [contractor, setContractor] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('');
  const [dir, setDir] = useState('asc');
  const qc = useQueryClient();

  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  // Get Client Manager users
  const { data: cmUsersData } = useQuery({
    queryKey: ['users-cm'],
    queryFn: () => api.get('/users?role=Client+Manager&limit=100').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const cmUsers = cmUsersData?.data || [];

  const handleSort = (col) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('asc'); }
    setPage(1);
  };

  const filters = {
    search: search || undefined,
    active: active || undefined,
    area: area || undefined,
    contractor: contractor || undefined,
    sort: sort || undefined,
    dir: sort ? dir : undefined,
    page,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['locations', filters],
    queryFn: () => getLocations(filters),
  });

  const locations = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 50;

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateLocation(id, data),
    onSuccess: () => qc.invalidateQueries(['locations']),
  });

  const inlineUpdate = (locId, field, value) => {
    updateMutation.mutate({ id: locId, data: { [field]: value } });
  };

  const colPrefs = useColumnPrefs('locations', COLUMNS);
  const v = (key) => colPrefs.isColumnVisible(key);
  const selection = useRowSelection(locations);

  const bulkFields = [
    { key: 'geographic_area_id_online', label: 'Area', type: 'select', options: (ref.areas || []).map(a => ({ value: a.id, label: a.geographic_area_name })) },
    { key: 'client_manager_user_id', label: 'Client Manager', type: 'select', options: cmUsers.map(u => ({ value: u.id, label: `${u.first_name} ${u.last_name}` })) },
    { key: 'contractor_id', label: 'Contractor', type: 'select', options: (ref.contractors || []).map(c => ({ value: c.id, label: c.contractor_name })) },
    { key: 'retained', label: 'Retained', type: 'toggle' },
    { key: 'active', label: 'Active', type: 'toggle' },
    { key: 'payment_through_us', label: 'Payment Through Us', type: 'toggle' },
    { key: 'virtus_required', label: 'Virtus Required', type: 'toggle' },
    { key: 'tb_required', label: 'TB Required', type: 'toggle' },
    { key: 'livescan_required', label: 'Livescan Required', type: 'toggle' },
    { key: 'demo_allowed', label: 'Demo Allowed', type: 'toggle' },
    { key: 'flyer_required', label: 'Flyer Required', type: 'toggle' },
  ];

  const reset = () => { setSearch(''); setActive(''); setArea(''); setContractor(''); setPage(1); };
  const hasFilters = search || active || area || contractor;

  return (
    <AppShell>
      <BulkEditBar count={selection.count} selected={selection.selected} onClear={selection.clearAll}
        table="location" queryKey="locations" fields={bulkFields} />
      <PageHeader title="Locations" action={
        <div className="flex gap-2">
          <button type="button" onClick={() => exportToCsv('locations.csv', locations, [
            { label: 'Nickname', key: 'nickname' }, { label: 'School Name', key: 'school_name' },
            { label: 'Area', key: 'geographic_area_name' }, { label: 'Contractor', key: 'contractor_name' },
            { label: 'Client Manager', key: 'client_manager' }, { label: 'Retained', key: r => r.retained ? 'Yes' : 'No' },
            { label: 'Classes', key: 'class_count' },
          ])} className="text-xs text-gray-400 hover:text-[#1e3a5f] py-2">Export CSV</button>
          <Link to="/locations/new"><Button>+ New Location</Button></Link>
          <ColumnPicker {...colPrefs} />
        </div>
      }>
        <Input placeholder="Search by name…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-60" />
        <Select value={active} onChange={e => { setActive(e.target.value); setPage(1); }} className="w-32">
          <option value="">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
        <Select value={area} onChange={e => { setArea(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Areas</option>
          {(ref.areas || []).map(a => (
            <option key={a.id} value={a.geographic_area_name}>{a.geographic_area_name}</option>
          ))}
        </Select>
        <Select value={contractor} onChange={e => { setContractor(e.target.value); setPage(1); }} className="w-40">
          <option value="">All Contractors</option>
          {(ref.contractors || []).map(c => (
            <option key={c.id} value={c.contractor_name}>{c.contractor_name}</option>
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
                    <th className="w-8 px-2 py-3">
                      <input type="checkbox" checked={selection.isAllSelected} onChange={selection.toggleAll}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
                    </th>
                    {v('nickname') && <SortTh col="nickname" sort={sort} dir={dir} onSort={handleSort}>Nickname</SortTh>}
                    {v('area') && <SortTh col="area" sort={sort} dir={dir} onSort={handleSort}>Area</SortTh>}
                    {v('phone') && <th className="text-left px-3 py-3 font-semibold text-gray-700">Phone</th>}
                    {v('contact_name') && <th className="text-left px-3 py-3 font-semibold text-gray-700">Contact</th>}
                    {v('contact_email') && <th className="text-left px-3 py-3 font-semibold text-gray-700">Contact Email</th>}
                    {v('contact_phone') && <th className="text-left px-3 py-3 font-semibold text-gray-700">Contact Phone</th>}
                    {v('info_sheet') && <th className="text-left px-3 py-3 font-semibold text-gray-700">Info Sheet</th>}
                    {v('client_manager') && <th className="text-left px-3 py-3 font-semibold text-gray-700">Client Manager</th>}
                    {v('contractor') && <SortTh col="contractor" sort={sort} dir={dir} onSort={handleSort}>Contractor</SortTh>}
                    {v('retained') && <th className="text-center px-2 py-3 font-semibold text-gray-700 w-20">Retained</th>}
                    {v('classes') && <th className="text-center px-3 py-3 font-semibold text-gray-700 w-16">Classes</th>}
                    {v('compliance') && <th className="text-center px-3 py-3 font-semibold text-gray-700 w-24">Compliance</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {locations.length === 0 ? (
                    <tr><td colSpan={colPrefs.visibleKeys.length} className="text-center py-12 text-gray-400">No locations found</td></tr>
                  ) : locations.map((l) => (
                    <tr key={l.id} className={`${l.retained ? 'bg-blue-50/30' : ''} ${selection.isSelected(l.id) ? '!bg-[#1e3a5f]/5' : ''}`}>
                      <td className="w-8 px-2 py-2">
                        <input type="checkbox" checked={selection.isSelected(l.id)} onChange={() => selection.toggle(l.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
                      </td>
                      {v('nickname') && <td className="px-4 py-2">
                        <Link to={`/locations/${l.id}`} className="font-medium text-[#1e3a5f] hover:underline">{l.nickname}</Link>
                        {l.school_name && l.school_name !== l.nickname && (
                          <div className="text-xs text-gray-400 truncate max-w-[250px]">{l.school_name}</div>
                        )}
                      </td>}
                      {v('area') && <td className="px-3 py-2 text-gray-600 text-xs">{l.geographic_area_name || '—'}</td>}
                      {v('phone') && <td className="px-3 py-2 text-gray-600 text-xs">{l.location_phone || '—'}</td>}
                      {v('contact_name') && <td className="px-3 py-2 text-gray-600 text-xs">{l.point_of_contact || '—'}</td>}
                      {v('contact_email') && <td className="px-3 py-2 text-gray-600 text-xs">
                        {l.poc_email ? <a href={`mailto:${l.poc_email}`} className="text-[#1e3a5f] hover:underline">{l.poc_email}</a> : '—'}
                      </td>}
                      {v('contact_phone') && <td className="px-3 py-2 text-gray-600 text-xs">{l.poc_phone || '—'}</td>}
                      {v('info_sheet') && <td className="px-3 py-2 text-xs">
                        {l.school_calendar_link ? <a href={l.school_calendar_link} target="_blank" rel="noopener noreferrer" className="text-[#1e3a5f] hover:underline">View</a> : '—'}
                      </td>}
                      {v('client_manager') && <td className="px-3 py-2 text-gray-600 text-xs">{l.client_manager || '—'}</td>}
                      {v('contractor') && <td className="px-3 py-2 text-gray-600 text-xs">{l.contractor_id ? <Link to={`/contractors/${l.contractor_id}`} className="text-[#1e3a5f] hover:underline">{l.contractor_name}</Link> : '—'}</td>}
                      {v('retained') && <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!l.retained}
                          onChange={() => inlineUpdate(l.id, 'retained', l.retained ? 0 : 1)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          title={l.retained ? 'Retained client' : 'Not retained'}
                        />
                      </td>}
                      {v('classes') && <td className="px-3 py-2 text-center">
                        <Link to={`/locations/${l.id}`} className="text-[#1e3a5f] hover:underline font-medium">{l.class_count || 0}</Link>
                      </td>}
                      {v('compliance') && <td className="px-3 py-2 text-center text-xs font-medium">
                        <span className={`mr-1.5 ${l.tb_required ? 'text-amber-600' : 'text-gray-300'}`}>TB</span>
                        <span className={`mr-1.5 ${l.livescan_required ? 'text-amber-600' : 'text-gray-300'}`}>LS</span>
                        <span className={l.virtus_required ? 'text-amber-600' : 'text-gray-300'}>V</span>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>{total} location{total !== 1 ? 's' : ''}</span>
              {total > limit && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <span className="py-1.5 px-2">Page {page}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={locations.length < limit}>Next</Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
