import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getContractors, createContractor, updateContractor } from '../api/contractors';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { SortTh } from '../components/ui/SortTh';

const STRENGTH_OPTIONS = ['Strong', 'Good', 'Moderate', 'Weak'];
const STRENGTH_COLORS = {
  Strong: 'bg-green-100 text-green-800 border-green-200',
  Good: 'bg-blue-100 text-blue-800 border-blue-200',
  Moderate: 'bg-amber-100 text-amber-800 border-amber-200',
  Weak: 'bg-red-100 text-red-800 border-red-200',
};
const STRENGTH_ROW = {
  Strong: '', Good: '', Moderate: 'bg-amber-50/30', Weak: 'bg-red-50/30',
};

export default function ContractorsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState('asc');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const qc = useQueryClient();

  // Get sales users for dropdown
  const { data: usersData } = useQuery({
    queryKey: ['users-sales'],
    queryFn: () => fetch('http://localhost:3002/api/users?role=Sales&limit=100', { credentials: 'include' }).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const salesUsers = usersData?.data || [];

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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateContractor(id, data),
    onSuccess: () => qc.invalidateQueries(['contractors']),
  });

  const inlineUpdate = (contractorId, field, value) => {
    updateMutation.mutate({ id: contractorId, data: { [field]: value || null } });
  };

  return (
    <AppShell>
      <PageHeader title="Contractors" action={
        showAdd ? (
          <div className="flex gap-2 items-center">
            <input type="text" placeholder="Contractor name" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newName && addMutation.mutate({ contractor_name: newName })}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]" autoFocus />
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
                    <th className="text-left px-3 py-3 font-semibold text-gray-700">Salesperson</th>
                    <SortTh col="contact" sort={sort} dir={dir} onSort={handleSort}>Key Contact</SortTh>
                    <th className="text-left px-3 py-3 font-semibold text-gray-700">Contact Email</th>
                    <SortTh col="strength" sort={sort} dir={dir} onSort={handleSort}>Strength</SortTh>
                    <th className="text-center px-3 py-3 font-semibold text-gray-700 w-16">Sites</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contractors.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">No contractors found</td></tr>
                  ) : contractors.map((c) => (
                    <tr key={c.id} className={STRENGTH_ROW[c.relationship_strength] || ''}>
                      <td className="px-4 py-2">
                        <Link to={`/contractors/${c.id}`} className="font-medium text-[#1e3a5f] hover:underline">{c.contractor_name}</Link>
                      </td>
                      <td className="px-3 py-1">
                        <select
                          defaultValue={c.salesperson_user_id || ''}
                          onChange={e => inlineUpdate(c.id, 'salesperson_user_id', e.target.value)}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] appearance-none pr-6 bg-[length:12px_12px] bg-[position:right_0.25rem_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]"
                        >
                          <option value="">—</option>
                          {salesUsers.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1">
                        <input
                          defaultValue={c.key_contact_name || ''}
                          onBlur={e => { if (e.target.value !== (c.key_contact_name || '')) inlineUpdate(c.id, 'key_contact_name', e.target.value); }}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
                          placeholder="Contact name…"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <input
                          defaultValue={c.key_contact_email || ''}
                          onBlur={e => { if (e.target.value !== (c.key_contact_email || '')) inlineUpdate(c.id, 'key_contact_email', e.target.value); }}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
                          placeholder="email@…"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <select
                          defaultValue={c.relationship_strength || ''}
                          onChange={e => inlineUpdate(c.id, 'relationship_strength', e.target.value)}
                          className={`w-full rounded border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] appearance-none pr-6 bg-[length:12px_12px] bg-[position:right_0.25rem_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] ${STRENGTH_COLORS[c.relationship_strength] || 'bg-white border-gray-200 text-gray-600'}`}
                        >
                          <option value="">—</option>
                          {STRENGTH_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">{c.location_count || 0}</td>
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
