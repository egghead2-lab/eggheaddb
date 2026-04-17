import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { OrderManagementTabs } from '../components/OrderManagementTabs';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

export default function MarkShippedPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [confirmingShip, setConfirmingShip] = useState(null); // order id for inline confirm
  const [confirmingUnship, setConfirmingUnship] = useState(null);
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [binInputs, setBinInputs] = useState({}); // { orderId: [{ bin_id, bin_number }] }

  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  const { data, isLoading } = useQuery({
    queryKey: ['shipments', search, areaFilter, statusFilter, startDate, endDate, page],
    queryFn: () => api.get('/materials/shipments', {
      params: {
        search: search || undefined,
        area_id: areaFilter || undefined,
        status: statusFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
        limit: 50,
      }
    }).then(r => r.data),
  });

  const orders = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  const shipOneMutation = useMutation({
    mutationFn: ({ id, bin_number_entries }) => api.patch(`/materials/orders/${id}/ship`, { bin_number_entries }),
    onSuccess: () => { qc.invalidateQueries(['shipments']); setConfirmingShip(null); },
  });

  const unshipMutation = useMutation({
    mutationFn: (id) => api.patch(`/materials/orders/${id}/unship`),
    onSuccess: () => { qc.invalidateQueries(['shipments']); setConfirmingUnship(null); },
  });

  const [bulkResult, setBulkResult] = useState(null);

  const bulkShipMutation = useMutation({
    mutationFn: () => api.post('/materials/orders/bulk-ship', { order_ids: [...selected] }).then(r => r.data),
    onSuccess: (data) => { qc.invalidateQueries(['shipments']); setSelected(new Set()); setConfirmingBulk(false); setBulkResult(data); },
  });

  const bulkUnshipMutation = useMutation({
    mutationFn: () => api.post('/materials/orders/bulk-unship', { order_ids: [...selected] }).then(r => r.data),
    onSuccess: (data) => { qc.invalidateQueries(['shipments']); setSelected(new Set()); setConfirmingBulk(false); setBulkResult(data); },
  });

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectableOnPage = orders.filter(o => o.status === 'pending' || (o.status === 'shipped' && !o.tracking_number));
  const allSelectableIds = data?.allSelectableIds || [];

  return (
    <AppShell>
      <OrderManagementTabs />

      <div className="p-6">
        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input label="Search" placeholder="Professor or order name..." value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <div className="w-44">
              <Select label="Area" value={areaFilter} onChange={e => { setAreaFilter(e.target.value); setPage(1); }}>
                <option value="">All Areas</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
              </Select>
            </div>
            <div className="w-36">
              <Select label="Status" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="shipped">Shipped</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>
            <div className="w-36">
              <Input label="Cycle from" type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} />
            </div>
            <div className="w-36">
              <Input label="Cycle to" type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} />
            </div>
          </div>
        </div>

        {/* Bulk result banner */}
        {bulkResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
            <span className="text-sm text-green-800 font-medium">
              {bulkResult.shipped != null && `${bulkResult.shipped} shipped`}
              {bulkResult.unshipped != null && `${bulkResult.unshipped} unshipped`}
            </span>
            {bulkResult.skippedBin > 0 && (
              <span className="text-sm text-amber-600">{bulkResult.skippedBin} skipped (have bins — ship individually)</span>
            )}
            <button onClick={() => setBulkResult(null)} className="text-xs text-gray-400 ml-auto">dismiss</button>
          </div>
        )}

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
            <span className="text-sm text-blue-800 font-medium">{selected.size} selected</span>
            {confirmingBulk ? (
              <>
                <span className="text-sm text-blue-700">{confirmingBulk} {selected.size} orders?</span>
                {confirmingBulk === 'Ship' && (
                  <Button size="sm" onClick={() => bulkShipMutation.mutate()} disabled={bulkShipMutation.isPending}>
                    {bulkShipMutation.isPending ? 'Shipping...' : 'Yes, Ship'}
                  </Button>
                )}
                {confirmingBulk === 'Unship' && (
                  <Button size="sm" onClick={() => bulkUnshipMutation.mutate()} disabled={bulkUnshipMutation.isPending}>
                    {bulkUnshipMutation.isPending ? 'Unshipping...' : 'Yes, Unship'}
                  </Button>
                )}
                <button onClick={() => setConfirmingBulk(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => setConfirmingBulk('Ship')}>Mark Shipped</Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmingBulk('Unship')}>Unship</Button>
                <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
              </>
            )}
          </div>
        )}

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            <div className="text-xs text-gray-500 mb-2">{total} shipments found</div>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input type="checkbox"
                        checked={allSelectableIds.length > 0 && allSelectableIds.every(id => selected.has(id))}
                        onChange={() => {
                          const allSelected = allSelectableIds.every(id => selected.has(id));
                          setSelected(allSelected ? new Set() : new Set(allSelectableIds));
                        }}
                        className="accent-[#1e3a5f]" />
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Order</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Area</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Cycle</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">Items</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Tracking</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-32"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-gray-400">No shipments match your filters</td></tr>
                  ) : orders.map(o => (
                    <tr key={o.id} className={`hover:bg-gray-50/50 ${o.status === 'shipped' ? '' : 'bg-amber-50/20'}`}>
                      <td className="px-3 py-2">
                        {(o.status === 'pending' || (o.status === 'shipped' && !o.tracking_number)) && (
                          <input type="checkbox" checked={selected.has(o.id)}
                            onChange={() => toggleSelect(o.id)} className="accent-[#1e3a5f]" />
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">{o.professor_name}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{o.order_name}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{o.area || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">
                        {o.cycle_start ? `${formatDate(o.cycle_start)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {o.line_count}
                        {o.bin_count > 0 && <span className="ml-1 text-[10px] px-1 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">bin</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          o.status === 'shipped' ? 'bg-green-100 text-green-700' :
                          o.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>{o.status}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400 font-mono">{o.tracking_number || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {o.status === 'pending' && (
                          <>
                            {confirmingShip === o.id ? (
                              <div className="space-y-1">
                                {o.bin_lines && o.bin_lines.length > 0 && (
                                  <div className="flex flex-col gap-1">
                                    {o.bin_lines.map((bl, idx) => (
                                      <div key={bl.id} className="flex items-center gap-1 justify-end">
                                        <span className="text-[10px] text-orange-700 whitespace-nowrap">{bl.item_name}:</span>
                                        <input placeholder="#" className="w-14 text-xs border rounded px-1.5 py-0.5"
                                          value={binInputs[o.id]?.[idx]?.bin_number || ''}
                                          onChange={e => setBinInputs(prev => {
                                            const entries = [...(prev[o.id] || o.bin_lines.map(() => ({ bin_id: null, bin_number: '' })))];
                                            entries[idx] = { bin_id: bl.id, bin_number: e.target.value };
                                            return { ...prev, [o.id]: entries };
                                          })} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center gap-1 justify-end">
                                  {(() => {
                                    const binsFilled = !o.bin_lines?.length || (binInputs[o.id] || []).every(b => b.bin_number);
                                    return (
                                      <button onClick={() => {
                                        shipOneMutation.mutate({ id: o.id, bin_number_entries: binInputs[o.id] || [] });
                                      }}
                                        disabled={shipOneMutation.isPending || !binsFilled}
                                        className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 font-medium disabled:opacity-40">
                                        {shipOneMutation.isPending ? '...' : 'Confirm Ship'}
                                      </button>
                                    );
                                  })()}
                                  <button onClick={() => setConfirmingShip(null)} className="text-xs text-gray-400 hover:text-gray-600">X</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmingShip(o.id)}
                                className="text-xs px-2 py-1 bg-[#1e3a5f] text-white rounded hover:bg-[#152a47] font-medium">
                                Ship
                              </button>
                            )}
                          </>
                        )}
                        {o.status === 'shipped' && !o.tracking_number && (
                          <>
                            {confirmingUnship === o.id ? (
                              <div className="flex items-center gap-1 justify-end">
                                <span className="text-xs text-gray-500">Undo ship?</span>
                                <button onClick={() => unshipMutation.mutate(o.id)}
                                  disabled={unshipMutation.isPending}
                                  className="px-2 py-1 bg-amber-500 text-white text-xs rounded hover:bg-amber-600 font-medium">
                                  {unshipMutation.isPending ? '...' : 'Yes'}
                                </button>
                                <button onClick={() => setConfirmingUnship(null)} className="text-xs text-gray-400 hover:text-gray-600">X</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmingUnship(o.id)}
                                className="text-xs text-amber-500 hover:text-amber-700">
                                Unship
                              </button>
                            )}
                          </>
                        )}
                        {o.status === 'shipped' && o.tracking_number && (
                          <span className="text-[10px] text-green-600">Confirmed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1 text-xs border rounded disabled:opacity-30">Prev</button>
                <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1 text-xs border rounded disabled:opacity-30">Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
