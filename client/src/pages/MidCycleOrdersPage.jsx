import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { formatDate, authUrl } from '../lib/utils';

export default function MidCycleOrdersPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const cycleId = searchParams.get('cycle');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [filterArea, setFilterArea] = useState('');

  const { data: cyclesData } = useQuery({
    queryKey: ['shipment-cycles'],
    queryFn: () => api.get('/materials/cycles').then(r => r.data),
  });
  const cycles = (cyclesData?.data || []).filter(c => c.cycle_type === 'mid_cycle');
  const activeCycle = cycles.find(c => String(c.id) === cycleId) || cycles.find(c => c.status === 'draft');

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['cycle-orders', activeCycle?.id],
    queryFn: () => api.get(`/materials/cycles/${activeCycle.id}/orders`).then(r => r.data),
    enabled: !!activeCycle?.id,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post(`/materials/cycles/${activeCycle.id}/generate-orders`),
    onSuccess: () => { qc.invalidateQueries(['cycle-orders', activeCycle?.id]); qc.invalidateQueries(['shipment-cycles']); },
  });

  const orders = ordersData?.data || [];
  let filtered = orders;
  if (filterArea) filtered = filtered.filter(o => o.area === filterArea);
  const areas = [...new Set(orders.map(o => o.area).filter(Boolean))].sort();

  // Items needing resolution (qty = 0 flagged items)
  const flaggedCount = orders.reduce((sum, o) => sum + (o.lines || []).filter(l => l.quantity === 0 && !l.skip_flag).length, 0);

  return (
    <AppShell>
      <PageHeader title="Mid-Cycle Orders" action={
        activeCycle && activeCycle.status === 'draft' && (
          <div className="flex items-center gap-2">
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? 'Generating...' : 'Generate Mid-Cycle Orders'}
            </Button>
            {orders.length > 0 && (
              <a href={authUrl(`${api.defaults.baseURL}/materials/cycles/${activeCycle.id}/export-csv`)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-[#1e3a5f]">
                Export CSV
              </a>
            )}
          </div>
        )
      }>
        {activeCycle && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Window: {formatDate(activeCycle.start_date)} – {formatDate(activeCycle.end_date)} &middot; Ship: {formatDate(activeCycle.ship_date)}
            </span>
            {flaggedCount > 0 && (
              <Link to={`/materials/resolutions?cycle_id=${activeCycle.id}`}>
                <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-lg font-medium hover:bg-amber-200">
                  {flaggedCount} items need resolution &rarr;
                </span>
              </Link>
            )}
          </div>
        )}
      </PageHeader>

      <div className="p-6">
        {!activeCycle ? (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
            No mid-cycle in progress. <Link to="/materials/cycles" className="text-[#1e3a5f] hover:underline">Create one</Link>.
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-sm text-gray-500"><strong>{orders.length}</strong> professors &middot; <strong>{orders.reduce((s, o) => s + o.line_count, 0)}</strong> items</div>
              <Select value={filterArea} onChange={e => setFilterArea(e.target.value)} className="w-40">
                <option value="">All Areas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </Select>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Professor</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Area</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Items</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Flagged</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-gray-400">No orders</td></tr>
                  ) : filtered.map(o => {
                    const flagged = (o.lines || []).filter(l => l.quantity === 0 && !l.skip_flag).length;
                    return (
                      <>
                        <tr key={o.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}>
                          <td className="px-4 py-2.5 font-medium text-gray-900">{o.professor_name}</td>
                          <td className="px-4 py-2.5 text-gray-600 text-xs">{o.area || '—'}</td>
                          <td className="px-4 py-2.5 text-center">{o.line_count}</td>
                          <td className="px-4 py-2.5 text-center">
                            {flagged > 0 ? <span className="text-amber-600 font-medium">{flagged}</span> : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-center"><Badge status={o.status === 'shipped' ? 'Completed' : 'Pending'} /></td>
                        </tr>
                        {expandedOrder === o.id && o.lines && (
                          <tr key={`${o.id}-exp`}>
                            <td colSpan={5} className="px-8 py-3 bg-blue-50/30">
                              <table className="w-full text-xs">
                                <tbody>
                                  {o.lines.map(l => (
                                    <tr key={l.id} className={`${l.skip_flag ? 'opacity-30 line-through' : ''} ${l.quantity === 0 ? 'bg-amber-50' : ''}`}>
                                      <td className="py-1 text-gray-800">{l.item_name}</td>
                                      <td className="py-1 w-20"><span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">{l.item_type}</span></td>
                                      <td className="py-1 text-center w-16">{l.quantity_override ?? l.quantity}</td>
                                      <td className="py-1 text-gray-500">{l.notes || ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
