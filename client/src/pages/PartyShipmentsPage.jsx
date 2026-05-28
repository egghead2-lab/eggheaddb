import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  bg: 'bg-gray-100',   text: 'text-gray-600',   next: 'prepped',  nextLabel: 'Mark Prepped →' },
  prepped:  { label: 'Prepped',  bg: 'bg-amber-100',  text: 'text-amber-700',  next: 'shipped',  nextLabel: 'Mark Shipped →' },
  shipped:  { label: 'Shipped',  bg: 'bg-green-100',  text: 'text-green-700',  next: 'pending',  nextLabel: 'Undo Shipped'   },
};

// Default window: most recent Tuesday → +12 days
function defaultWindow() {
  const today = new Date();
  const dow = today.getDay();
  const daysBack = dow >= 2 ? dow - 2 : dow + 5;
  const start = new Date(today); start.setDate(today.getDate() - daysBack);
  const end = new Date(start); end.setDate(start.getDate() + 12);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export default function PartyShipmentsPage() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [dateRange, setDateRange] = useState(defaultWindow);

  const { data, isLoading } = useQuery({
    queryKey: ['party-shipping-window', dateRange.start, dateRange.end],
    queryFn: () => api.get('/parties/shipping-window', { params: { start: dateRange.start, end: dateRange.end } }).then(r => r.data),
    staleTime: 2 * 60 * 1000,
  });

  const parties = data?.data || [];
  const windowStart = data?.windowStart;
  const windowEnd = data?.windowEnd;
  const unshipped = parties.filter(p => p.party_ship_status !== 'shipped').length;
  const shipped = parties.filter(p => p.party_ship_status === 'shipped').length;

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/parties/${id}/ship-status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['party-shipping-window'] });
      qc.invalidateQueries({ queryKey: ['nav-party-ship-badge'] });
    },
  });

  return (
    <AppShell>
      <PageHeader title="Party Shipments">
        <div className="flex items-center gap-2">
          <Input type="date" value={dateRange.start}
            onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))}
            className="w-36 text-xs" />
          <span className="text-gray-400 text-sm">—</span>
          <Input type="date" value={dateRange.end}
            onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))}
            className="w-36 text-xs" />
          <button type="button"
            onClick={() => setDateRange(defaultWindow())}
            className="text-xs text-[#1e3a5f] hover:underline whitespace-nowrap">
            Reset to current
          </button>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {unshipped > 0 && (
            <span className="font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              {unshipped} unshipped
            </span>
          )}
          {shipped > 0 && (
            <span className="text-gray-500">{shipped} shipped</span>
          )}
        </div>
      </PageHeader>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : parties.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
            No parties in the current shipping window
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Time</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Theme / Format</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Professor</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">#Kids</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Shirt</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Location</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parties.map(p => {
                  const isExpanded = expandedId === p.id;
                  const cfg = STATUS_CONFIG[p.party_ship_status] || STATUS_CONFIG.pending;
                  const isOverdue = p.party_ship_status !== 'shipped';
                  return (
                    <>
                      <tr key={p.id}
                        className={`hover:bg-gray-50/50 cursor-pointer ${isOverdue && p.party_ship_status === 'pending' ? 'bg-amber-50/30' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                        <td className="px-4 py-2.5">
                          <Link to={`/parties/${p.id}`}
                            className="text-[#1e3a5f] hover:underline font-medium"
                            onClick={e => e.stopPropagation()}>
                            {p.party_date ? formatDate(p.party_date) : '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">
                          {p.party_start ? formatTime(p.party_start) : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-800">{p.party_theme || '—'}</div>
                          <div className="text-xs text-gray-500">{p.party_format_name || '—'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{p.lead_professor_nickname || '—'}</td>
                        <td className="px-4 py-2.5 text-center text-gray-700 font-medium">
                          {p.kids_attended ?? p.kids_expected ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {p.shirt_size ? (
                            <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                              {p.shirt_size}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">
                          {p.party_city || p.party_location_text || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            disabled={statusMut.isPending}
                            onClick={e => { e.stopPropagation(); statusMut.mutate({ id: p.id, status: cfg.next }); }}
                            className="text-xs text-[#1e3a5f] hover:underline whitespace-nowrap font-medium disabled:opacity-50">
                            {cfg.nextLabel}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${p.id}-detail`}>
                          <td colSpan={9} className="bg-blue-50/30 px-6 py-3 border-b border-blue-100">
                            <div className="grid grid-cols-4 gap-4 text-xs">
                              <div>
                                <div className="text-gray-500 font-medium uppercase tracking-wider text-[10px] mb-1">Birthday Kid</div>
                                <div className="text-gray-800">
                                  {p.birthday_kid_name || '—'}
                                  {p.birthday_kid_age ? <span className="text-gray-500 ml-1">(turning {p.birthday_kid_age})</span> : null}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-500 font-medium uppercase tracking-wider text-[10px] mb-1">Shirt</div>
                                <div className="text-gray-800">{p.shirt_size || 'None needed'}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 font-medium uppercase tracking-wider text-[10px] mb-1">Kids</div>
                                <div className="text-gray-800">
                                  {p.kids_attended != null ? `${p.kids_attended} attended` : p.kids_expected != null ? `${p.kids_expected} expected` : '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-500 font-medium uppercase tracking-wider text-[10px] mb-1">Location</div>
                                <div className="text-gray-800">
                                  {[p.party_address, p.party_city, p.party_state].filter(Boolean).join(', ') || p.party_location_text || '—'}
                                </div>
                              </div>
                              {p.general_notes && (
                                <div className="col-span-4">
                                  <div className="text-gray-500 font-medium uppercase tracking-wider text-[10px] mb-1">Notes</div>
                                  <div className="text-gray-800">{p.general_notes}</div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
