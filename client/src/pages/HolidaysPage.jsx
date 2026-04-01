import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getHolidays, bulkCreateHolidays } from '../api/holidays';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { SortTh } from '../components/ui/SortTh';
import { formatDate } from '../lib/utils';

export default function HolidaysPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('date');
  const [dir, setDir] = useState('asc');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkRows, setBulkRows] = useState([{ holiday_name: '', holiday_date: '' }]);
  const qc = useQueryClient();

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
    queryKey: ['holidays', filters],
    queryFn: () => getHolidays(filters),
  });

  const bulkMutation = useMutation({
    mutationFn: (holidays) => bulkCreateHolidays(holidays),
    onSuccess: () => {
      qc.invalidateQueries(['holidays']);
      setBulkRows([{ holiday_name: '', holiday_date: '' }]);
      setShowBulk(false);
    },
  });

  const holidays = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 50;

  const reset = () => { setSearch(''); setPage(1); };

  const addBulkRow = () => setBulkRows(r => [...r, { holiday_name: '', holiday_date: '' }]);
  const updateBulkRow = (i, field, value) => {
    setBulkRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  };
  const removeBulkRow = (i) => setBulkRows(r => r.filter((_, idx) => idx !== i));

  const submitBulk = () => {
    const valid = bulkRows.filter(r => r.holiday_name && r.holiday_date);
    if (valid.length === 0) return;
    bulkMutation.mutate(valid.map(r => ({ ...r, generic: 1 })));
  };

  return (
    <AppShell>
      <PageHeader title="Holidays" action={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowBulk(!showBulk)}>
            {showBulk ? 'Cancel' : 'Bulk Add'}
          </Button>
          <Link to="/holidays/new"><Button>+ New Holiday</Button></Link>
        </div>
      }>
        <Input
          placeholder="Search by name…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-48"
        />
        {search && (
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700 underline">Clear</button>
        )}
      </PageHeader>

      <div className="p-6">
        {/* Bulk Add Panel */}
        {showBulk && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Bulk Add Holidays</h3>
            <div className="space-y-2">
              {bulkRows.map((row, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <input
                    type="text"
                    placeholder="Holiday name"
                    value={row.holiday_name}
                    onChange={e => updateBulkRow(i, 'holiday_name', e.target.value)}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
                  />
                  <input
                    type="date"
                    value={row.holiday_date}
                    onChange={e => updateBulkRow(i, 'holiday_date', e.target.value)}
                    className="w-44 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
                  />
                  {bulkRows.length > 1 && (
                    <button onClick={() => removeBulkRow(i)} className="text-red-400 hover:text-red-600 text-sm px-1">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-3">
              <button onClick={addBulkRow} className="text-sm text-[#1e3a5f] hover:underline">+ Add another</button>
              <div className="ml-auto">
                <Button onClick={submitBulk} disabled={bulkMutation.isPending}>
                  {bulkMutation.isPending ? 'Saving…' : `Save ${bulkRows.filter(r => r.holiday_name && r.holiday_date).length} Holiday(s)`}
                </Button>
              </div>
            </div>
            {bulkMutation.isError && (
              <p className="text-sm text-red-600 mt-2">{bulkMutation.error?.response?.data?.error || 'Bulk add failed'}</p>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <SortTh col="name" sort={sort} dir={dir} onSort={handleSort}>Holiday Name</SortTh>
                    <SortTh col="date" sort={sort} dir={dir} onSort={handleSort}>Date</SortTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {holidays.length === 0 ? (
                    <tr><td colSpan={2} className="text-center py-12 text-gray-400">No upcoming holidays</td></tr>
                  ) : holidays.map((h, i) => (
                    <tr key={h.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5">
                        <Link to={`/holidays/${h.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                          {h.holiday_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{formatDate(h.holiday_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>{total} holiday{total !== 1 ? 's' : ''}</span>
              {total > limit && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <span className="py-1.5 px-2">Page {page}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={holidays.length < limit}>Next</Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
