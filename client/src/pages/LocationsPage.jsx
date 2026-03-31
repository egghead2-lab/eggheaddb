import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getLocations } from '../api/locations';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';

export default function LocationsPage() {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['locations', { search, active, page }],
    queryFn: () => getLocations({ search: search || undefined, active: active || undefined, page }),
  });

  const locations = data?.data || [];
  const meta = data;

  return (
    <AppShell>
      <PageHeader title="Locations" action={
        <Link to="/locations/new">
          <Button>+ New Location</Button>
        </Link>
      }>
        <Input placeholder="Search by name…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-64" />
        <Select value={active} onChange={e => { setActive(e.target.value); setPage(1); }} className="w-36">
          <option value="">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
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
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Nickname</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">School Name</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Active</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Area</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Client Manager</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Contractor</th>
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
                    <td className="px-4 py-2.5 text-center text-xs">
                      <span className={l.tb_required ? 'text-amber-600 mr-1' : 'text-gray-300 mr-1'}>TB</span>
                      <span className={l.livescan_required ? 'text-amber-600 mr-1' : 'text-gray-300 mr-1'}>LS</span>
                      <span className={l.virtus_required ? 'text-amber-600' : 'text-gray-300'}>V</span>
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
