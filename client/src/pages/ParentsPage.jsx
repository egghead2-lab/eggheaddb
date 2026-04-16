import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getParents } from '../api/parents';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { SortTh } from '../components/ui/SortTh';

export default function ParentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('last_name');
  const [dir, setDir] = useState('asc');

  const handleSort = (col) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('asc'); }
    setPage(1);
  };

  const filters = {
    search: search || undefined,
    sort,
    dir,
    page,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['parents', filters],
    queryFn: () => getParents(filters),
  });

  const parents = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 50;
  const totalPages = Math.ceil(total / limit);

  return (
    <AppShell>
      <PageHeader title="Parents" action={
        <Link to="/parents/new"><Button>+ New Parent</Button></Link>
      }>
        <Input
          placeholder="Search by name, email, or phone…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-64"
        />
        {search && (
          <button onClick={() => { setSearch(''); setPage(1); }} className="text-xs text-gray-400 hover:text-gray-700 underline">Clear</button>
        )}
      </PageHeader>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            <div className="text-xs text-gray-400 mb-2">{total} parent{total !== 1 ? 's' : ''}</div>
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <SortTh col="last_name" sort={sort} dir={dir} onSort={handleSort}>Name</SortTh>
                    <SortTh col="email" sort={sort} dir={dir} onSort={handleSort}>Email</SortTh>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Phone</th>
                    <SortTh col="students" sort={sort} dir={dir} onSort={handleSort} align="center">Students</SortTh>
                    <SortTh col="parties" sort={sort} dir={dir} onSort={handleSort} align="center">Parties</SortTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parents.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-gray-400">No parents found</td></tr>
                  ) : parents.map((p, i) => (
                    <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5">
                        <Link to={`/parents/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                          {p.first_name} {p.last_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{p.email || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{p.phone || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-gray-700">{p.student_count || 0}</td>
                      <td className="px-4 py-2.5 text-center text-gray-700">{p.party_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                <span>Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
