import { useState } from 'react';
import { Link } from 'react-router-dom';
import { calcAge } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { getStudents } from '../api/students';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { SortTh } from '../components/ui/SortTh';

export default function StudentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState('asc');

  const handleSort = (col) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('asc'); }
    setPage(1);
  };

  const filters = {
    search: search || undefined,
    sort: sort || undefined,
    dir: sort ? dir : undefined,
    page,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['students', filters],
    queryFn: () => getStudents(filters),
  });

  const students = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 50;

  return (
    <AppShell>
      <PageHeader title="Students" action={
        <Link to="/students/new"><Button>+ New Student</Button></Link>
      }>
        <Input
          placeholder="Search by name…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-60"
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
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <SortTh col="name" sort={sort} dir={dir} onSort={handleSort}>Student Name</SortTh>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Age</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Grade</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Parent</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Parent Email</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">No students found</td></tr>
                  ) : students.map((s, i) => (
                    <tr key={s.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5">
                        <Link to={`/students/${s.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                          {s.first_name} {s.last_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{calcAge(s.birthday) ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{s.current_grade_name || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {s.parent_id
                          ? <Link to={`/parents/${s.parent_id}`} className="text-[#1e3a5f] hover:underline">{s.parent_first_name} {s.parent_last_name}</Link>
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{s.parent_email || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{s.location_nickname || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>{total} student{total !== 1 ? 's' : ''}</span>
              {total > limit && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <span className="py-1.5 px-2">Page {page}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={students.length < limit}>Next</Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
