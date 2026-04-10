import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';

export default function ProfessorPayPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-pay', search],
    queryFn: () => api.get('/schedule/my-pay', { params: { search: search || undefined } }).then(r => r.data),
  });
  const rows = data?.data || [];

  // Group by program nickname
  const grouped = {};
  rows.forEach(r => {
    const key = r.program_nickname || 'Unknown';
    if (!grouped[key]) grouped[key] = { nickname: key, sessions: [], total: 0 };
    grouped[key].sessions.push(r);
    grouped[key].total += parseFloat(r.pay_amount) || 0;
  });
  const programs = Object.values(grouped).sort((a, b) => b.total - a.total);
  const grandTotal = rows.reduce((sum, r) => sum + (parseFloat(r.pay_amount) || 0), 0);

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Pay History</h1>
        <p className="text-sm text-gray-500 mb-4">{rows.length} session{rows.length !== 1 ? 's' : ''} · ${grandTotal.toFixed(2)} total</p>

        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by class name…"
          className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]" />

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
        ) : programs.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No pay records found</div>
        ) : (
          <div className="space-y-3">
            {programs.map(prog => (
              <details key={prog.nickname} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <summary className="px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{prog.nickname}</div>
                    <div className="text-xs text-gray-400">{prog.sessions.length} session{prog.sessions.length !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="text-sm font-bold text-green-700">${prog.total.toFixed(2)}</div>
                </summary>
                <div className="border-t border-gray-100">
                  {prog.sessions.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="text-xs text-gray-600">{formatDate(s.session_date)}</div>
                        <div className="text-[10px] text-gray-400">
                          {s.role}{s.is_substitute ? ' (Sub)' : ''} · {s.location_nickname || ''}
                        </div>
                      </div>
                      <div className="text-sm font-medium text-green-700">${parseFloat(s.pay_amount || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
