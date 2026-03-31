import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getLocations } from '../api/locations';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { SortTh } from '../components/ui/SortTh';

export default function LocationsPage() {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [area, setArea] = useState('');
  const [clientManager, setClientManager] = useState('');
  const [contractor, setContractor] = useState('');
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
    active: active || undefined,
    area: area || undefined,
    client_manager: clientManager || undefined,
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

  const reset = () => { setSearch(''); setActive(''); setArea(''); setClientManager(''); setContractor(''); setPage(1); };
  const hasFilters = search || active || area || clientManager || contractor;

  // Build unique client manager and contractor lists from loaded data
  const clientManagers = [...new Set((ref.areas || []).map(a => a.geographic_area_name))];

  return (
    <AppShell>
      <PageHeader title="Locations" action={
        <Link to="/locations/new"><Button>+ New Location</Button></Link>
      }>
        <Input
          placeholder="Search by name…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-60"
        />
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
                    <SortTh col="nickname" sort={sort} dir={dir} onSort={handleSort}>Nickname</SortTh>
                    <SortTh col="school_name" sort={sort} dir={dir} onSort={handleSort}>School Name</SortTh>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Active</th>
                    <SortTh col="area" sort={sort} dir={dir} onSort={handleSort}>Area</SortTh>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Client Manager</th>
                    <SortTh col="contractor" sort={sort} dir={dir} onSort={handleSort}>Contractor</SortTh>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Classes</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {locations.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-gray-400">No locations found</td></tr>
                  ) : locations.map((l, i) => (
                    <tr key={l.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5">
                        <Link to={`/locations/${l.id}`} className="font-medium text-[#1e3a5f] hover:underline">{l.nickname}</Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{l.school_name}</td>
                      <td className="px-4 py-2.5 text-center"><Badge status={l.active ? 'Active' : 'Inactive'} /></td>
                      <td className="px-4 py-2.5 text-gray-600">{l.geographic_area_name || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{l.client_manager || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{l.contractor_name || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-gray-700">{l.class_count || 0}</td>
                      <td className="px-4 py-2.5 text-center text-xs font-medium">
                        <span className={`mr-1.5 ${l.tb_required ? 'text-amber-600' : 'text-gray-300'}`}>TB</span>
                        <span className={`mr-1.5 ${l.livescan_required ? 'text-amber-600' : 'text-gray-300'}`}>LS</span>
                        <span className={l.virtus_required ? 'text-amber-600' : 'text-gray-300'}>V</span>
                      </td>
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
