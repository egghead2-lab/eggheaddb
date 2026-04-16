import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';

const STATUS_COLORS = { draft: 'Pending', approved: 'Confirmed', shipped: 'Completed', complete: 'Completed' };

export default function ShipmentCyclesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ start_date: '', end_date: '', ship_date: '', notes: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['shipment-cycles'],
    queryFn: () => api.get('/materials/cycles').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/materials/cycles', data),
    onSuccess: () => { qc.invalidateQueries(['shipment-cycles']); setShowCreate(false); setForm({ start_date: '', end_date: '', ship_date: '', notes: '' }); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/materials/cycles/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries(['shipment-cycles']),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/materials/cycles/${id}`),
    onSuccess: () => qc.invalidateQueries(['shipment-cycles']),
  });

  const cycles = data?.data || [];

  // Auto-fill end date and ship date when start date changes
  const handleStartChange = (val) => {
    const start = new Date(val);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const ship = new Date(start);
    ship.setDate(ship.getDate() - 7);
    setForm({ ...form, start_date: val, end_date: end.toISOString().split('T')[0], ship_date: ship.toISOString().split('T')[0] });
  };

  const nextStatus = { draft: 'approved', approved: 'shipped', shipped: 'complete' };
  const nextLabel = { draft: 'Approve', approved: 'Mark Shipped', shipped: 'Complete' };

  return (
    <AppShell>
      <PageHeader title="Shipment Cycles" action={
        <Button onClick={() => setShowCreate(!showCreate)}>{showCreate ? 'Cancel' : '+ New Cycle'}</Button>
      } />

      <div className="p-6">
        {showCreate && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3">Create Standard Order Cycle</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Program Week Start (Monday)" type="date" value={form.start_date} onChange={e => handleStartChange(e.target.value)} />
              <Input label="Program Week End (Sunday)" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              <Input label="Ship Date" type="date" value={form.ship_date} onChange={e => setForm({ ...form, ship_date: e.target.value })} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => createMutation.mutate(form)} disabled={!form.start_date || !form.ship_date || createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Cycle'}
              </Button>
            </div>
            {createMutation.isError && <p className="text-sm text-red-600 mt-2">{createMutation.error?.response?.data?.error || 'Failed'}</p>}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Program Week</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Ship Date</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Orders</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cycles.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400">No cycles yet</td></tr>
                ) : cycles.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-700 font-medium">
                      {formatDate(c.start_date)} – {formatDate(c.end_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(c.ship_date)}</td>
                    <td className="px-4 py-3 text-center">
                      {c.order_count > 0 ? (
                        <Link to={`/materials/standard-order?cycle=${c.id}`} className="text-[#1e3a5f] hover:underline font-medium">{c.order_count}</Link>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center"><Badge status={STATUS_COLORS[c.status] || c.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {c.status === 'draft' && (
                          <Link to={`/materials/standard-order?cycle=${c.id}`}>
                            <Button size="sm" variant="secondary">Build Orders</Button>
                          </Link>
                        )}
                        {nextStatus[c.status] && (
                          <Button size="sm" onClick={() => { if (confirm(`${nextLabel[c.status]} this cycle?`)) statusMutation.mutate({ id: c.id, status: nextStatus[c.status] }); }}>
                            {nextLabel[c.status]}
                          </Button>
                        )}
                        {(c.status === 'approved' || c.status === 'shipped') && (
                          <a href={`${api.defaults.baseURL}/materials/cycles/${c.id}/export-csv`}
                            className="text-xs text-[#1e3a5f] hover:underline">CSV</a>
                        )}
                        <button onClick={() => { if (confirm('Delete this cycle and all its orders? This cannot be undone.')) deleteMutation.mutate(c.id); }}
                          className="text-xs text-red-400 hover:text-red-600 ml-2">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
