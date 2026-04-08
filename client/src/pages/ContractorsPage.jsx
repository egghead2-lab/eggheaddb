import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getContractors, createContractor } from '../api/contractors';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { SortTh } from '../components/ui/SortTh';

const STRENGTH_COLORS = {
  Strong: 'bg-green-100 text-green-700',
  Good: 'bg-blue-100 text-blue-700',
  Moderate: 'bg-amber-100 text-amber-700',
  Weak: 'bg-red-100 text-red-700',
};

export default function ContractorsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState('asc');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const qc = useQueryClient();

  const handleSort = (col) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('asc'); }
    setPage(1);
  };

  const filters = { search: search || undefined, sort, dir, page };

  const { data, isLoading } = useQuery({
    queryKey: ['contractors', filters],
    queryFn: () => getContractors(filters),
  });

  const contractors = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 50;

  const addMutation = useMutation({
    mutationFn: (d) => createContractor(d),
    onSuccess: () => { qc.invalidateQueries(['contractors']); setNewName(''); setShowAdd(false); },
  });

  return (
    <AppShell>
      <PageHeader title="Contractors" action={
        showAdd ? (
          <div className="flex gap-2 items-center">
            <input type="text" placeholder="Contractor name" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newName && addMutation.mutate({ contractor_name: newName })}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" autoFocus />
            <Button onClick={() => newName && addMutation.mutate({ contractor_name: newName })} disabled={!newName || addMutation.isPending}>
              {addMutation.isPending ? '…' : 'Create'}
            </Button>
            <button onClick={() => setShowAdd(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        ) : (
          <Button onClick={() => setShowAdd(true)}>+ New Contractor</Button>
        )
      }>
        <Input placeholder="Search contractors…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-60" />
        {search && <button onClick={() => { setSearch(''); setPage(1); }} className="text-xs text-gray-400 hover:text-gray-700 underline">Clear</button>}
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
                    <SortTh col="name" sort={sort} dir={dir} onSort={handleSort}>Name</SortTh>
                    <SortTh col="contact" sort={sort} dir={dir} onSort={handleSort}>Key Contact</SortTh>
                    <th className="text-left px-3 py-3 font-semibold text-gray-700">Contact Email</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-700">Salesperson</th>
                    <SortTh col="strength" sort={sort} dir={dir} onSort={handleSort}>Strength</SortTh>
                    <th className="text-center px-3 py-3 font-semibold text-gray-700 w-16">Sites</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contractors.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">No contractors found</td></tr>
                  ) : contractors.map((c, i) => (
                    <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5">
                        <Link to={`/contractors/${c.id}`} className="font-medium text-[#1e3a5f] hover:underline">{c.contractor_name}</Link>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{c.key_contact_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-gray-500">{c.key_contact_email || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-gray-600">{c.salesperson_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5">
                        {c.relationship_strength ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STRENGTH_COLORS[c.relationship_strength] || 'bg-gray-100 text-gray-600'}`}>
                            {c.relationship_strength}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{c.location_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>{total} contractor{total !== 1 ? 's' : ''}</span>
              {total > limit && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <span className="py-1.5 px-2">Page {page}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={contractors.length < limit}>Next</Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
