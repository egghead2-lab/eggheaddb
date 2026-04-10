import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatCurrency } from '../lib/utils';

function getDefaultRange() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
}

export default function ProfessorPayPage() {
  const defaults = getDefaultRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-pay', dateFrom, dateTo, search],
    queryFn: () => api.get('/schedule/my-pay', {
      params: { date_from: dateFrom, date_to: dateTo, search: search || undefined }
    }).then(r => r.data),
  });

  const sessions = data?.data?.sessions || [];
  const upcoming = data?.data?.upcoming || [];
  const misc = data?.data?.misc || [];
  const observations = data?.data?.observations || [];

  // Combine earned items for grouping
  const earnedItems = useMemo(() => {
    const items = [];
    sessions.forEach(s => items.push({
      id: `s-${s.id}`, date: s.pay_date, amount: parseFloat(s.pay_amount) || 0,
      program: s.program_nickname || 'Unknown', programId: s.program_id,
      label: `${s.role || 'Session'}${s.is_substitute ? ' (Sub)' : ''}`,
      location: s.location_nickname, type: 'session',
    }));
    misc.forEach(m => items.push({
      id: `m-${m.id}`, date: m.pay_date, amount: parseFloat(m.pay_amount) || 0,
      program: m.program_nickname || m.description || m.misc_type || 'Misc Pay',
      programId: m.program_id,
      label: [m.misc_type, m.subtype, m.description].filter(Boolean).join(' · '),
      location: m.location, type: 'misc',
      reimbursement: parseFloat(m.total_reimbursement) || 0,
    }));
    observations.forEach(o => items.push({
      id: `o-${o.id}`, date: o.pay_date, amount: parseFloat(o.pay_amount) || 0,
      program: o.program_nickname || 'Observation',
      programId: o.program_id,
      label: `${o.observation_type === 'evaluation' ? 'Evaluation' : 'Observation'} — ${o.observed_professor || ''}`,
      type: 'observation',
    }));
    return items;
  }, [sessions, misc, observations]);

  // Group upcoming by program
  const upcomingGrouped = useMemo(() => {
    const map = {};
    upcoming.forEach(s => {
      const key = s.program_nickname || 'Unknown';
      if (!map[key]) map[key] = { program: key, programId: s.program_id, items: [], total: 0 };
      const amount = parseFloat(s.pay_amount) || 0;
      map[key].items.push({
        id: `u-${s.id}`, date: s.pay_date, amount,
        label: `${s.role || 'Session'}`,
        location: s.location_nickname, lesson: s.lesson_name,
      });
      map[key].total += amount;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [upcoming]);
  const upcomingTotal = upcoming.reduce((sum, s) => sum + (parseFloat(s.pay_amount) || 0), 0);

  // Group earned by program
  const earnedGrouped = useMemo(() => {
    const map = {};
    earnedItems.filter(i => i.type === 'session').forEach(item => {
      const key = item.program;
      if (!map[key]) map[key] = { program: key, programId: item.programId, items: [], total: 0, category: 'class' };
      map[key].items.push(item);
      map[key].total += item.amount;
    });
    const miscItems = earnedItems.filter(i => i.type === 'misc');
    if (miscItems.length > 0) {
      map['__misc__'] = { program: 'Miscellaneous Pay', items: miscItems, total: miscItems.reduce((s, i) => s + i.amount, 0), category: 'misc' };
    }
    const obsItems = earnedItems.filter(i => i.type === 'observation');
    if (obsItems.length > 0) {
      map['__obs__'] = { program: 'Observation Pay', items: obsItems, total: obsItems.reduce((s, i) => s + i.amount, 0), category: 'observation' };
    }
    return Object.values(map).sort((a, b) => {
      const order = { class: 0, observation: 1, misc: 2 };
      if (order[a.category] !== order[b.category]) return order[a.category] - order[b.category];
      return b.total - a.total;
    });
  }, [earnedItems]);

  const earnedTotal = earnedItems.reduce((sum, i) => sum + i.amount, 0);
  const totalReimbursement = misc.reduce((sum, m) => sum + (parseFloat(m.total_reimbursement) || 0), 0);

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Pay History</h1>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
          </div>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search programs…"
            className="flex-1 min-w-[150px] rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            <div className="text-lg font-bold text-green-700">{formatCurrency(earnedTotal)}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Earned</div>
          </div>
          <div className="bg-white rounded-xl border border-blue-200 px-4 py-3 text-center">
            <div className="text-lg font-bold text-blue-700">{formatCurrency(upcomingTotal)}</div>
            <div className="text-[10px] text-blue-400 uppercase tracking-wider">Expected</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            <div className="text-lg font-bold text-gray-800">{sessions.length + upcoming.length}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Total Sessions</div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
        ) : upcomingGrouped.length === 0 && earnedGrouped.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No pay records found in this range</div>
        ) : (
          <div className="space-y-6">
            {/* Upcoming / Expected Pay */}
            {upcomingGrouped.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-blue-800 uppercase tracking-wider mb-2">Expected Pay — Upcoming Sessions</h2>
                <div className="space-y-2">
                  {upcomingGrouped.map(group => (
                    <details key={group.program} className="bg-blue-50/40 rounded-xl border border-blue-200 overflow-hidden" open>
                      <summary className="px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-blue-50 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-gray-900 text-sm">{group.program}</div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">{group.items.length} sessions</span>
                        </div>
                        <div className="text-sm font-bold text-blue-700">{formatCurrency(group.total)}</div>
                      </summary>
                      <div className="border-t border-blue-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] text-blue-400 uppercase tracking-wider border-b border-blue-100">
                              <th className="text-left px-4 py-1.5 font-medium">Date</th>
                              <th className="text-left px-4 py-1.5 font-medium">Details</th>
                              <th className="text-left px-4 py-1.5 font-medium">Lesson</th>
                              <th className="text-right px-4 py-1.5 font-medium">Expected</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(item => (
                              <tr key={item.id} className="border-b border-blue-50 last:border-0">
                                <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">{formatDate(item.date)}</td>
                                <td className="px-4 py-2 text-xs text-gray-500">
                                  {item.label}
                                  {item.location && <span className="text-gray-400"> · {item.location}</span>}
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-500">{item.lesson || '—'}</td>
                                <td className="px-4 py-2 text-right font-medium text-blue-700 whitespace-nowrap">{formatCurrency(item.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* Earned Pay */}
            {earnedGrouped.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-green-800 uppercase tracking-wider mb-2">Earned Pay</h2>
                <div className="space-y-2">
                  {earnedGrouped.map(group => (
                    <details key={group.program} className="bg-white rounded-xl border border-gray-200 overflow-hidden" open={group.items.length <= 20}>
                      <summary className="px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-gray-900 text-sm">{group.program}</div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            group.category === 'misc' ? 'bg-violet-100 text-violet-700' :
                            group.category === 'observation' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {group.category === 'misc' ? 'Misc' : group.category === 'observation' ? 'Obs' : `${group.items.length} sessions`}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-green-700">{formatCurrency(group.total)}</div>
                      </summary>
                      <div className="border-t border-gray-100">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
                              <th className="text-left px-4 py-1.5 font-medium">Date</th>
                              <th className="text-left px-4 py-1.5 font-medium">Details</th>
                              <th className="text-right px-4 py-1.5 font-medium">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(item => (
                              <tr key={item.id} className="border-b border-gray-50 last:border-0">
                                <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">{formatDate(item.date)}</td>
                                <td className="px-4 py-2 text-xs text-gray-500">
                                  {item.label}
                                  {item.location && <span className="text-gray-400"> · {item.location}</span>}
                                </td>
                                <td className="px-4 py-2 text-right font-medium text-green-700 whitespace-nowrap">{formatCurrency(item.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {totalReimbursement > 0 && (
          <div className="mt-4 bg-violet-50 rounded-xl border border-violet-200 px-4 py-3 text-center">
            <div className="text-sm font-bold text-violet-700">{formatCurrency(totalReimbursement)}</div>
            <div className="text-[10px] text-violet-500 uppercase tracking-wider">Total Reimbursements</div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
