import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, authUrl } from '../lib/utils';

const STATUS_CLS = {
  no_programs: 'border-gray-200 bg-gray-50 text-gray-400',
  not_built: 'border-red-300 bg-white text-red-700 hover:bg-red-50 cursor-pointer',
  generated: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer',
  shipped: 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 cursor-pointer',
};

const STATUS_LABEL = { no_programs: 'No programs', not_built: 'Not built', generated: 'Generated', shipped: 'Shipped' };

export default function StandardOrderBuilderPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const cycleId = searchParams.get('cycle');
  const [selectedAreas, setSelectedAreas] = useState(new Set());
  const [viewArea, setViewArea] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);

  const { data: cyclesData } = useQuery({
    queryKey: ['shipment-cycles'],
    queryFn: () => api.get('/materials/cycles').then(r => r.data),
  });
  const cycles = cyclesData?.data || [];
  const activeCycle = cycles.find(c => String(c.id) === cycleId) || cycles.find(c => c.status === 'draft') || cycles[0];

  const { data: areaStatusData, isLoading: areaLoading } = useQuery({
    queryKey: ['cycle-area-status', activeCycle?.id],
    queryFn: () => api.get(`/materials/cycles/${activeCycle.id}/area-status`).then(r => r.data),
    enabled: !!activeCycle?.id,
  });
  const areaStatus = areaStatusData?.data || [];

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['cycle-orders', activeCycle?.id],
    queryFn: () => api.get(`/materials/cycles/${activeCycle.id}/orders`).then(r => r.data),
    enabled: !!activeCycle?.id,
  });
  const allOrders = ordersData?.data || [];

  const generateMutation = useMutation({
    mutationFn: (area_ids) => api.post(`/materials/cycles/${activeCycle.id}/generate-orders`, { area_ids }),
    onSuccess: () => {
      qc.invalidateQueries(['cycle-area-status', activeCycle?.id]);
      qc.invalidateQueries(['cycle-orders', activeCycle?.id]);
      qc.invalidateQueries(['shipment-cycles']);
      setSelectedAreas(new Set());
    },
  });

  const lastGenResult = generateMutation.data?.data;

  if (!activeCycle) {
    return (
      <AppShell>
        <PageHeader title="Standard Order Builder" />
        <div className="p-6">
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
            No cycle selected. <Link to="/materials/cycles" className="text-[#1e3a5f] hover:underline">Create or select a cycle</Link>.
          </div>
        </div>
      </AppShell>
    );
  }

  const areasWithPrograms = areaStatus.filter(a => a.status !== 'no_programs');
  const notBuilt = areasWithPrograms.filter(a => a.status === 'not_built');
  const buildable = areasWithPrograms.filter(a => a.status !== 'shipped');

  const toggleArea = (id) => {
    setSelectedAreas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllNotBuilt = () => {
    setSelectedAreas(new Set(buildable.map(a => a.area_id)));
  };

  const handleGenerate = () => {
    if (selectedAreas.size === 0) return;
    generateMutation.mutate([...selectedAreas]);
  };

  // Orders for the area being viewed
  const viewAreaName = areaStatus.find(a => a.area_id === viewArea)?.area_name;
  const viewOrders = viewArea ? allOrders.filter(o => o.area === viewAreaName) : [];

  return (
    <AppShell>
      <PageHeader title="Standard Order Builder">
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            Week: <strong>{formatDate(activeCycle.start_date)} – {formatDate(activeCycle.end_date)}</strong>
            {' '}&middot; Ship: <strong>{formatDate(activeCycle.ship_date)}</strong>
            {' '}&middot; Status: <strong>{activeCycle.status}</strong>
          </div>
          <a href={authUrl(`${api.defaults.baseURL}/materials/cycles/${activeCycle.id}/export-csv`)}
            className="px-3 py-1.5 bg-[#1e3a5f] text-white text-xs font-medium rounded-lg hover:bg-[#162d4a] transition-colors">
            Export All CSV
          </a>
        </div>
      </PageHeader>

      <div className="p-6">
        {/* Inflow warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center gap-2">
          <span className="text-amber-600 font-bold text-sm">!</span>
          <span className="text-xs text-amber-800 font-medium">Do NOT regenerate orders that have already been imported into Inflow.</span>
        </div>

        {/* Generation results */}
        {lastGenResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div className="text-sm font-medium text-green-800">
              Generated {lastGenResult.ordersCreated} orders with {lastGenResult.linesCreated} line items
              from {lastGenResult.programCount} programs across {lastGenResult.areasBuilt} area(s)
            </div>
            {lastGenResult.deletedOrders > 0 && (
              <div className="text-xs text-blue-600 mt-1">{lastGenResult.deletedOrders} existing pending order(s) replaced</div>
            )}
            {lastGenResult.areasSkipped > 0 && (
              <div className="text-xs text-amber-600 mt-1">{lastGenResult.areasSkipped} area(s) skipped (already shipped)</div>
            )}
            {lastGenResult.warnings?.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-medium text-amber-700 mb-1">Warnings ({lastGenResult.warnings.length}):</div>
                {lastGenResult.warnings.slice(0, 10).map((w, i) => (
                  <div key={i} className="text-xs text-amber-600">{w.program}: {w.issue}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {generateMutation.isError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">
            {generateMutation.error?.response?.data?.error || 'Failed to generate orders'}
          </div>
        )}

        {areaLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            {/* ── Area Bubbles ──────────────────────────────── */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Select Areas to Build</h3>
                <div className="flex items-center gap-3">
                  {notBuilt.length > 0 && (
                    <span className="text-xs text-red-600 font-medium">{notBuilt.length} outstanding</span>
                  )}
                  {buildable.length > 0 && (
                    <button onClick={selectAllNotBuilt} className="text-xs text-[#1e3a5f] hover:underline">
                      Select all buildable
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {areasWithPrograms.map(a => {
                  const isSelected = selectedAreas.has(a.area_id);
                  const canSelect = a.status !== 'shipped';
                  return (
                    <button key={a.area_id}
                      onClick={() => {
                        if (canSelect) toggleArea(a.area_id);
                        else setViewArea(viewArea === a.area_id ? null : a.area_id);
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        isSelected
                          ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white ring-2 ring-[#1e3a5f]/20'
                          : STATUS_CLS[a.status]
                      }`}>
                      {a.area_name}
                      <span className="opacity-70">({a.professor_count})</span>
                      {a.shipping_lead_days !== 7 && (
                        <span className="opacity-60">{a.shipping_lead_days}d</span>
                      )}
                      {a.status !== 'not_built' && (
                        <span className={`ml-0.5 text-[10px] ${
                          a.status === 'shipped' ? 'text-green-600' : 'text-amber-600'
                        }`}>{STATUS_LABEL[a.status]}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedAreas.size > 0 && (
                <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                  <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
                    {generateMutation.isPending ? 'Generating...' : `Generate Orders for ${selectedAreas.size} Area(s)`}
                  </Button>
                  <button onClick={() => setSelectedAreas(new Set())} className="text-xs text-gray-500 hover:text-gray-700">
                    Clear selection
                  </button>
                </div>
              )}
            </div>

            {/* ── Area Summary Table ───────────────────────── */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Area</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600 w-20">Lead</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600 w-24">Profs</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600 w-24">Orders</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600 w-28">Status</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 w-32"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {areasWithPrograms.map(a => (
                    <tr key={a.area_id} className={`hover:bg-gray-50/50 ${viewArea === a.area_id ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-4 py-2 font-medium text-gray-900">{a.area_name}</td>
                      <td className="px-4 py-2 text-center text-gray-500">{a.shipping_lead_days}d</td>
                      <td className="px-4 py-2 text-center text-gray-600">{a.professor_count}</td>
                      <td className="px-4 py-2 text-center">{a.order_count || '—'}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          a.status === 'not_built' ? 'bg-red-100 text-red-700' :
                          a.status === 'generated' ? 'bg-amber-100 text-amber-700' :
                          a.status === 'shipped' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{STATUS_LABEL[a.status]}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {a.order_count > 0 && (
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => setViewArea(viewArea === a.area_id ? null : a.area_id)}
                              className="text-xs text-[#1e3a5f] hover:underline">
                              {viewArea === a.area_id ? 'Hide' : 'View'}
                            </button>
                            <a href={authUrl(`${api.defaults.baseURL}/materials/cycles/${activeCycle.id}/export-csv?area_id=${a.area_id}`)}
                              className="text-xs text-[#1e3a5f] hover:underline">CSV</a>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Orders for viewed area ──────────────────── */}
            {viewArea && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Orders — {viewAreaName}
                </h3>
                {ordersLoading ? (
                  <div className="flex justify-center py-8"><Spinner className="w-6 h-6" /></div>
                ) : viewOrders.length === 0 ? (
                  <div className="bg-white rounded-lg border p-8 text-center text-gray-400">No orders for this area</div>
                ) : (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">Professor</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">Order Name</th>
                          <th className="text-center px-4 py-2 font-medium text-gray-600 w-20">Items</th>
                          <th className="text-center px-4 py-2 font-medium text-gray-600 w-24">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {viewOrders.map(o => (
                          <>
                            <tr key={o.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}>
                              <td className="px-4 py-2 font-medium text-gray-900">{o.professor_name}</td>
                              <td className="px-4 py-2 text-gray-600">{o.order_name}</td>
                              <td className="px-4 py-2 text-center">{o.line_count}{o.skip_count > 0 && <span className="text-amber-500 ml-1">({o.skip_count} skip)</span>}</td>
                              <td className="px-4 py-2 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                  o.status === 'shipped' ? 'bg-green-100 text-green-700' :
                                  o.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{o.status}</span>
                              </td>
                            </tr>
                            {expandedOrder === o.id && o.lines && (
                              <tr key={`${o.id}-lines`}>
                                <td colSpan={4} className="px-8 py-3 bg-blue-50/30">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-gray-500">
                                        <th className="text-left py-1">Item</th>
                                        <th className="text-left py-1 w-24">Type</th>
                                        <th className="text-center py-1 w-16">Qty</th>
                                        <th className="text-left py-1">Notes</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {o.lines.map(l => (
                                        <tr key={l.id} className={l.skip_flag ? 'opacity-40 line-through' : ''}>
                                          <td className="py-1 text-gray-800">{l.item_name}</td>
                                          <td className="py-1"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            l.item_type === 'lesson' ? 'bg-blue-100 text-blue-700' :
                                            l.item_type === 'start_kit' ? 'bg-green-100 text-green-700' :
                                            l.item_type === 'degree' ? 'bg-purple-100 text-purple-700' :
                                            l.item_type === 'bin' ? 'bg-orange-100 text-orange-700' :
                                            'bg-gray-100 text-gray-600'
                                          }`}>{l.item_type.replace('_', ' ')}</span></td>
                                          <td className="py-1 text-center">{l.quantity_override ?? l.quantity}</td>
                                          <td className="py-1 text-gray-500">{l.notes || ''}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
