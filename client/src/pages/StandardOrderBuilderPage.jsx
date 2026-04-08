import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

export default function StandardOrderBuilderPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const cycleId = searchParams.get('cycle');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [filterArea, setFilterArea] = useState('');
  const [filterType, setFilterType] = useState('');

  const { data: cyclesData } = useQuery({
    queryKey: ['shipment-cycles'],
    queryFn: () => api.get('/materials/cycles').then(r => r.data),
  });
  const cycles = cyclesData?.data || [];
  const activeCycle = cycles.find(c => String(c.id) === cycleId) || cycles.find(c => c.status === 'draft');

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['cycle-orders', activeCycle?.id],
    queryFn: () => api.get(`/materials/cycles/${activeCycle.id}/orders`).then(r => r.data),
    enabled: !!activeCycle?.id,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post(`/materials/cycles/${activeCycle.id}/generate-orders`),
    onSuccess: (res) => { qc.invalidateQueries(['cycle-orders', activeCycle?.id]); qc.invalidateQueries(['shipment-cycles']); },
  });

  const orders = ordersData?.data || [];
  const lastGenResult = generateMutation.data?.data;

  // Filter orders
  let filtered = orders;
  if (filterArea) filtered = filtered.filter(o => o.area === filterArea);

  const areas = [...new Set(orders.map(o => o.area).filter(Boolean))].sort();
  const totalLines = orders.reduce((sum, o) => sum + (o.line_count || 0), 0);
  const totalSkips = orders.reduce((sum, o) => sum + (o.skip_count || 0), 0);

  return (
    <AppShell>
      <PageHeader title="Standard Order Builder" action={
        activeCycle && activeCycle.status === 'draft' && (
          <div className="flex items-center gap-2">
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? 'Generating...' : orders.length > 0 ? 'Regenerate Orders' : 'Generate Orders'}
            </Button>
            {orders.length > 0 && (
              <a href={`${api.defaults.baseURL}/materials/cycles/${activeCycle.id}/export-csv`}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-[#1e3a5f]">
                Export CSV
              </a>
            )}
          </div>
        )
      }>
        {activeCycle && (
          <div className="text-sm text-gray-500">
            Cycle: <strong>{activeCycle.cycle_type.replace('_', ' ')}</strong> &middot;
            Week: {formatDate(activeCycle.start_date)} – {formatDate(activeCycle.end_date)} &middot;
            Ship: {formatDate(activeCycle.ship_date)} &middot;
            Status: <strong>{activeCycle.status}</strong>
          </div>
        )}
      </PageHeader>

      <div className="p-6">
        {/* Generation results */}
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
                {lastGenResult.warnings.length > 10 && <div className="text-xs text-amber-500">...and {lastGenResult.warnings.length - 10} more</div>}
              </div>
            )}
          </div>
        )}

        {!activeCycle ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
            No active cycle selected. <Link to="/materials/cycles" className="text-[#1e3a5f] hover:underline">Create or select a cycle</Link>.
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            {/* Summary + filters */}
            <div className="flex items-center gap-4 mb-4">
              <div className="text-sm text-gray-500">
                <strong>{orders.length}</strong> professors &middot; <strong>{totalLines}</strong> items {totalSkips > 0 && <span className="text-amber-600">({totalSkips} skipped)</span>}
              </div>
              <Select value={filterArea} onChange={e => setFilterArea(e.target.value)} className="w-40">
                <option value="">All Areas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </Select>
            </div>

            {/* Orders table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Professor</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Order Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Area</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Items</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-gray-400">{orders.length === 0 ? 'No orders generated yet. Click "Generate Orders".' : 'No orders match filters.'}</td></tr>
                  ) : filtered.map(o => (
                    <>
                      <tr key={o.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{o.professor_name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{o.order_name}</td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{o.area || '—'}</td>
                        <td className="px-4 py-2.5 text-center">{o.line_count}{o.skip_count > 0 && <span className="text-amber-500 ml-1">({o.skip_count} skip)</span>}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            o.status === 'shipped' ? 'bg-green-100 text-green-700' :
                            o.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{o.status}</span>
                        </td>
                      </tr>
                      {expandedOrder === o.id && o.lines && (
                        <tr key={`${o.id}-lines`}>
                          <td colSpan={5} className="px-8 py-3 bg-blue-50/30">
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
          </>
        )}
      </div>
    </AppShell>
  );
}
