import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export default function WeeklyRequirementsPage() {
  const [weekStart] = useState(getMonday(new Date()));
  const [selectedWeek, setSelectedWeek] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['weekly-requirements', weekStart],
    queryFn: () => api.get('/materials/weekly-requirements', { params: { week_start: weekStart, weeks: 5 } }).then(r => r.data),
  });

  const weeks = data?.data?.weeks || [];
  const stockMap = data?.data?.stock || {};
  const currentWeek = weeks[selectedWeek];

  // Group items by class type
  const grouped = {};
  (currentWeek?.items || []).forEach(item => {
    const type = item.class_type_name || 'Other';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(item);
  });

  // Totals across selected weeks for aggregate mode
  const totalItems = (currentWeek?.items || []).reduce((sum, i) => sum + i.standard_count + i.for_20_count, 0);

  return (
    <AppShell>
      <PageHeader title="Weekly Requirements">
        <div className="text-sm text-gray-500">5-week lookahead from {weekStart}</div>
      </PageHeader>

      <div className="p-6">
        {/* Week tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          {weeks.map((w, i) => (
            <button key={i} onClick={() => setSelectedWeek(i)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                selectedWeek === i ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {i === 0 ? 'This Week' : `+${i} Week${i > 1 ? 's' : ''}`}
              <div className="text-[10px] text-gray-400 mt-0.5">{w.week_start.slice(5)}</div>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : !currentWeek ? (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">No data</div>
        ) : (
          <>
            <div className="text-sm text-gray-500 mb-4">
              {currentWeek.week_start} – {currentWeek.week_end} &middot; <strong>{totalItems}</strong> total kits needed
            </div>

            {Object.entries(grouped).sort().map(([type, items]) => (
              <div key={type} className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">{type} Lessons</h3>
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-700">Lesson</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-700 w-24">Standard</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-700 w-24">For 20</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-700 w-24">Total</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-700 w-24">In Stock</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-700 w-24">Net to Build</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item, i) => {
                        const inStock = stockMap[item.lesson_name.toLowerCase()] || 0;
                        const total = item.standard_count + item.for_20_count;
                        const net = total - inStock;
                        return (
                          <tr key={i}>
                            <td className="px-4 py-2 text-gray-900">{item.lesson_name}</td>
                            <td className="px-4 py-2 text-right text-gray-600">{item.standard_count}</td>
                            <td className="px-4 py-2 text-right text-gray-600">{item.for_20_count || '—'}</td>
                            <td className="px-4 py-2 text-right font-medium text-gray-900">{total}</td>
                            <td className="px-4 py-2 text-right text-gray-500">{inStock}</td>
                            <td className={`px-4 py-2 text-right font-bold ${net > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {net > 0 ? `+${net}` : net}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {Object.keys(grouped).length === 0 && (
              <div className="bg-white rounded-lg border p-12 text-center text-gray-400">No sessions scheduled for this week</div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
