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

  // Group lessons by class type
  const grouped = {};
  (currentWeek?.lessons || []).forEach(item => {
    const type = item.class_type_name || 'Other';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(item);
  });

  const totalLessons = (currentWeek?.lessons || []).reduce((sum, i) => sum + (parseInt(i.standard_count) || 0) + (parseInt(i.for_20_count) || 0), 0);
  const totalStartKits = (currentWeek?.start_kits || []).reduce((sum, i) => sum + (parseInt(i.standard_count) || 0) + (parseInt(i.for_20_count) || 0), 0);
  const totalDegrees = currentWeek?.degree_count || 0;
  const totalBins = (currentWeek?.bins || []).reduce((sum, b) => sum + (parseInt(b.needed) || 0), 0);

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
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-500">Lesson Kits</div>
                <div className="text-2xl font-bold text-[#1e3a5f]">{totalLessons}</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-500">Start Kits</div>
                <div className="text-2xl font-bold text-green-700">{totalStartKits}</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-500">Degrees</div>
                <div className="text-2xl font-bold text-purple-700">{totalDegrees}</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-500">Bins Needed</div>
                <div className="text-2xl font-bold text-orange-700">{totalBins}</div>
              </div>
            </div>

            {/* Lesson kits by type */}
            {Object.entries(grouped).sort().map(([type, items]) => (
              <div key={type} className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">{type}</h3>
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-700">Lesson</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-700 w-24">Standard</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-700 w-24">For 20</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-700 w-24">Total</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-700 w-24">In Stock</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-gray-700 w-24">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item, i) => {
                        const std = parseInt(item.standard_count) || 0;
                        const f20 = parseInt(item.for_20_count) || 0;
                        const total = std + f20;
                        const inStock = stockMap[item.lesson_name.toLowerCase()] || 0;
                        const net = total - inStock;
                        return (
                          <tr key={i}>
                            <td className="px-4 py-2 text-gray-900">{item.lesson_name}</td>
                            <td className="px-4 py-2 text-right text-gray-600">{std}</td>
                            <td className="px-4 py-2 text-right text-gray-600">{f20 || '—'}</td>
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

            {/* Start Kits */}
            {(currentWeek.start_kits || []).length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-2">Start Kits</h3>
                <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-green-50 border-b border-green-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-green-700">Class</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-green-700">Type</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-green-700 w-24">Standard</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-green-700 w-24">For 20</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-green-100">
                      {currentWeek.start_kits.map((sk, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 text-gray-900">{sk.class_name}</td>
                          <td className="px-4 py-2 text-gray-600 text-xs">{sk.class_type_name}</td>
                          <td className="px-4 py-2 text-right">{parseInt(sk.standard_count) || 0}</td>
                          <td className="px-4 py-2 text-right">{parseInt(sk.for_20_count) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Degrees */}
            {totalDegrees > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-purple-700 uppercase tracking-wider mb-2">Degrees</h3>
                <div className="bg-white rounded-lg border border-purple-200 p-4">
                  <span className="text-sm text-gray-700"><strong>{totalDegrees}</strong> degree set{totalDegrees !== 1 ? 's' : ''} needed this week (programs ending)</span>
                </div>
              </div>
            )}

            {/* Bins */}
            {(currentWeek.bins || []).length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-orange-700 uppercase tracking-wider mb-2">Bins Needed</h3>
                <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-orange-50 border-b border-orange-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold text-orange-700">Bin Type</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-orange-700 w-24">Needed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-100">
                      {currentWeek.bins.map((b, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 text-gray-900">{b.bin_name}</td>
                          <td className="px-4 py-2 text-right font-medium">{b.needed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {Object.keys(grouped).length === 0 && totalStartKits === 0 && totalDegrees === 0 && totalBins === 0 && (
              <div className="bg-white rounded-lg border p-12 text-center text-gray-400">No sessions scheduled for this week</div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
