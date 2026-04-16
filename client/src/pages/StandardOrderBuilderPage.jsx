import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

const STATUS_BADGE = {
  no_programs: { label: 'No Programs', cls: 'bg-gray-100 text-gray-500' },
  not_built: { label: 'Not Built', cls: 'bg-red-100 text-red-700' },
  generated: { label: 'Generated', cls: 'bg-amber-100 text-amber-700' },
  shipped: { label: 'Shipped', cls: 'bg-green-100 text-green-700' },
};

export default function StandardOrderBuilderPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const cycleId = searchParams.get('cycle');
  const [selectedArea, setSelectedArea] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);

  // Get cycles
  const { data: cyclesData } = useQuery({
    queryKey: ['shipment-cycles'],
    queryFn: () => api.get('/materials/cycles').then(r => r.data),
  });
  const cycles = cyclesData?.data || [];
  const activeCycle = cycles.find(c => String(c.id) === cycleId) || cycles.find(c => c.status === 'draft') || cycles[0];

  // Area status for this cycle
  const { data: areaStatusData, isLoading: areaLoading } = useQuery({
    queryKey: ['cycle-area-status', activeCycle?.id],
    queryFn: () => api.get(`/materials/cycles/${activeCycle.id}/area-status`).then(r => r.data),
    enabled: !!activeCycle?.id,
  });
  const areaStatus = areaStatusData?.data || [];

  // Orders for selected area
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['cycle-orders', activeCycle?.id],
    queryFn: () => api.get(`/materials/cycles/${activeCycle.id}/orders`).then(r => r.data),
    enabled: !!activeCycle?.id,
  });
  const allOrders = ordersData?.data || [];
  const areaOrders = selectedArea
    ? allOrders.filter(o => o.area === areaStatus.find(a => a.area_id === selectedArea)?.area_name)
    : [];

  // Generate orders for an area
  const generateMutation = useMutation({
    mutationFn: (area_id) => api.post(`/materials/cycles/${activeCycle.id}/generate-orders`, { area_id }),
    onSuccess: () => {
      qc.invalidateQueries(['cycle-area-status', activeCycle?.id]);
      qc.invalidateQueries(['cycle-orders', activeCycle?.id]);
      qc.invalidateQueries(['shipment-cycles']);
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
  const allBuilt = areasWithPrograms.length > 0 && areasWithPrograms.every(a => a.status !== 'not_built');
  const allShipped = areasWithPrograms.length > 0 && areasWithPrograms.every(a => a.status === 'shipped');

  return (
    <AppShell>
      <PageHeader title="Standard Order Builder">
        <div className="text-sm text-gray-500">
          Week: <strong>{formatDate(activeCycle.start_date)} – {formatDate(activeCycle.end_date)}</strong>
          {' '}&middot; Ship: <strong>{formatDate(activeCycle.ship_date)}</strong>
          {' '}&middot; Status: <strong>{activeCycle.status}</strong>
        </div>
      </PageHeader>

      <div className="p-6">
        {/* Generation results banner */}
        {lastGenResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div className="text-sm font-medium text-green-800">
              Generated {lastGenResult.ordersCreated} orders with {lastGenResult.linesCreated} line items from {lastGenResult.programCount} programs
            </div>
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

        {/* ── Area Dashboard ─────────────────────────────── */}
        {areaLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-8 h-8" /></div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Areas</h3>
              <div className="text-xs text-gray-500">
                {areasWithPrograms.filter(a => a.status === 'not_built').length > 0 && (
                  <span className="text-red-600 font-medium">{areasWithPrograms.filter(a => a.status === 'not_built').length} areas not built</span>
                )}
                {allBuilt && !allShipped && <span className="text-amber-600 font-medium">All areas built</span>}
                {allShipped && <span className="text-green-600 font-medium">All areas shipped</span>}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Area</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600 w-24">Lead Days</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600 w-28">Professors</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600 w-24">Orders</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600 w-28">Status</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600 w-48">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {areaStatus.filter(a => a.status !== 'no_programs').map(a => (
                  <tr key={a.area_id} className={`hover:bg-gray-50/50 ${selectedArea === a.area_id ? 'bg-blue-50/30' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{a.area_name}</td>
                    <td className="px-4 py-2.5 text-center text-gray-500">{a.shipping_lead_days}d</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">{a.professor_count}</td>
                    <td className="px-4 py-2.5 text-center">
                      {a.order_count > 0 ? (
                        <button onClick={() => setSelectedArea(selectedArea === a.area_id ? null : a.area_id)}
                          className="text-[#1e3a5f] hover:underline font-medium">
                          {a.order_count}
                        </button>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_BADGE[a.status]?.cls || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_BADGE[a.status]?.label || a.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {a.status === 'not_built' && (
                          <Button size="sm" onClick={() => { setSelectedArea(a.area_id); generateMutation.mutate(a.area_id); }}
                            disabled={generateMutation.isPending}>
                            {generateMutation.isPending ? 'Generating...' : 'Generate'}
                          </Button>
                        )}
                        {a.order_count > 0 && (
                          <>
                            <button onClick={() => setSelectedArea(selectedArea === a.area_id ? null : a.area_id)}
                              className="text-xs text-[#1e3a5f] hover:underline">
                              {selectedArea === a.area_id ? 'Hide' : 'View'}
                            </button>
                            <a href={`${api.defaults.baseURL}/materials/cycles/${activeCycle.id}/export-csv?area_id=${a.area_id}`}
                              className="text-xs text-[#1e3a5f] hover:underline">CSV</a>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Orders for selected area ───────────────────── */}
        {selectedArea && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Orders — {areaStatus.find(a => a.area_id === selectedArea)?.area_name}
            </h3>
            {ordersLoading ? (
              <div className="flex justify-center py-8"><Spinner className="w-6 h-6" /></div>
            ) : areaOrders.length === 0 ? (
              <div className="bg-white rounded-lg border p-8 text-center text-gray-400">No orders for this area yet</div>
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
                    {areaOrders.map(o => (
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
      </div>
    </AppShell>
  );
}
