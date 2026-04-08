import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

export default function MarkShippedPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(new Set());

  // Get most recent approved/draft cycle
  const { data: cyclesData } = useQuery({
    queryKey: ['shipment-cycles'],
    queryFn: () => api.get('/materials/cycles').then(r => r.data),
  });
  const activeCycle = (cyclesData?.data || []).find(c => c.status === 'approved' || c.status === 'draft');

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['cycle-orders', activeCycle?.id],
    queryFn: () => api.get(`/materials/cycles/${activeCycle.id}/orders`).then(r => r.data),
    enabled: !!activeCycle?.id,
  });

  const bulkShipMutation = useMutation({
    mutationFn: () => api.post('/materials/orders/bulk-ship', { order_ids: [...selected] }),
    onSuccess: () => { qc.invalidateQueries(['cycle-orders']); setSelected(new Set()); },
  });

  const shipOneMutation = useMutation({
    mutationFn: (id) => api.patch(`/materials/orders/${id}/ship`, {}),
    onSuccess: () => qc.invalidateQueries(['cycle-orders']),
  });

  const orders = ordersData?.data || [];
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const shippedOrders = orders.filter(o => o.status === 'shipped');

  const toggleAll = () => {
    if (selected.size === pendingOrders.length) setSelected(new Set());
    else setSelected(new Set(pendingOrders.map(o => o.id)));
  };

  const hasBinItems = (order) => order.lines?.some(l => l.item_type === 'bin');

  return (
    <AppShell>
      <PageHeader title="Mark Shipments Sent" action={
        selected.size > 0 && (
          <Button onClick={() => { if (confirm(`Mark ${selected.size} orders as shipped?`)) bulkShipMutation.mutate(); }}
            disabled={bulkShipMutation.isPending}>
            {bulkShipMutation.isPending ? 'Shipping...' : `Ship ${selected.size} Selected`}
          </Button>
        )
      }>
        {activeCycle && (
          <div className="text-sm text-gray-500">
            Cycle: {formatDate(activeCycle.start_date)} – {formatDate(activeCycle.end_date)} &middot; Ship date: {formatDate(activeCycle.ship_date)}
          </div>
        )}
      </PageHeader>

      <div className="p-6">
        {!activeCycle ? (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">No active cycle</div>
        ) : isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            {/* Pending */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Pending ({pendingOrders.length})</h3>
                {pendingOrders.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={selected.size === pendingOrders.length && pendingOrders.length > 0}
                      onChange={toggleAll} className="w-3.5 h-3.5 rounded" /> Select all
                  </label>
                )}
              </div>
              <div className="divide-y divide-gray-100">
                {pendingOrders.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-400">All orders shipped</div>
                ) : pendingOrders.map(o => (
                  <div key={o.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50/50">
                    <input type="checkbox" checked={selected.has(o.id)}
                      onChange={() => { const next = new Set(selected); if (next.has(o.id)) next.delete(o.id); else next.add(o.id); setSelected(next); }}
                      className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f]" />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{o.professor_name}</div>
                      <div className="text-xs text-gray-500">{o.order_name} &middot; {o.line_count} items &middot; {o.area || '—'}</div>
                    </div>
                    {hasBinItems(o) && (
                      <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">Has Bin</span>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => { if (confirm(`Ship "${o.order_name}"?`)) shipOneMutation.mutate(o.id); }}>
                      Ship
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Already shipped */}
            {shippedOrders.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Shipped ({shippedOrders.length})</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {shippedOrders.map(o => (
                    <div key={o.id} className="flex items-center gap-4 px-4 py-2.5 opacity-60">
                      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px]">&#10003;</span>
                      </div>
                      <div className="flex-1">
                        <span className="text-sm text-gray-700">{o.professor_name}</span>
                        <span className="text-xs text-gray-400 ml-2">{o.order_name}</span>
                      </div>
                      <span className="text-xs text-gray-400">{o.tracking_number || 'No tracking'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
