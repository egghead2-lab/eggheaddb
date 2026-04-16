import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

function LeadTimeWarning({ item }) {
  if (!item.earliest_session_date || !item.shipping_lead_days) return null;
  const sessionDate = new Date(item.earliest_session_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilSession = Math.ceil((sessionDate - today) / (1000 * 60 * 60 * 24));
  const leadDays = item.shipping_lead_days;

  if (daysUntilSession <= 0) {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white ml-2">PAST DUE</span>;
  }
  if (daysUntilSession < leadDays) {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 ml-2">
      {daysUntilSession}d left — needs {leadDays}d lead
    </span>;
  }
  return null;
}

export default function ResolutionCenterPage() {
  const qc = useQueryClient();
  const [selectedCycle, setSelectedCycle] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  // Get all cycles to pick from
  const { data: cyclesData } = useQuery({
    queryKey: ['shipment-cycles'],
    queryFn: () => api.get('/materials/cycles').then(r => r.data),
  });
  const cycles = (cyclesData?.data || []).filter(c => c.status !== 'draft');
  const activeCycleId = selectedCycle || cycles[0]?.id;

  // Auto-scan: load mid-cycle flags (detects missing items on load)
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['mid-cycle-flags', activeCycleId],
    queryFn: () => api.get(`/materials/cycles/${activeCycleId}/mid-cycle-flags`).then(r => r.data),
    enabled: !!activeCycleId,
    refetchOnWindowFocus: false,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (data) => api.post('/materials/resolutions/acknowledge', data),
    onSuccess: () => qc.invalidateQueries(['mid-cycle-flags']),
  });

  const shipMutation = useMutation({
    mutationFn: (data) => api.post('/materials/resolutions/ship', data),
    onSuccess: () => qc.invalidateQueries(['mid-cycle-flags']),
  });

  const bulkShipMutation = useMutation({
    mutationFn: (data) => api.post('/materials/resolutions/bulk-ship', data),
    onSuccess: () => { qc.invalidateQueries(['mid-cycle-flags']); setSelectedIds(new Set()); },
  });

  const allFlags = data?.data || [];
  const newFlags = data?.newFlags || 0;

  // Filter by area
  const filtered = areaFilter
    ? allFlags.filter(f => f.area === areas.find(a => String(a.id) === areaFilter)?.geographic_area_name)
    : allFlags;

  // Separate into categories
  const unacknowledged = filtered.filter(f => !f.resolution);
  const acknowledged = filtered.filter(f => f.resolution === 'acknowledged');
  const shipped = filtered.filter(f => f.resolution === 'shipped');

  // Group by area then professor
  const groupByArea = (items) => {
    const grouped = {};
    items.forEach(item => {
      const area = item.area || 'Unknown';
      if (!grouped[area]) grouped[area] = [];
      grouped[area].push(item);
    });
    return grouped;
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllAcknowledged = () => {
    const ids = new Set(acknowledged.map(f => f.line_id));
    setSelectedIds(ids);
  };

  const handleBulkShip = () => {
    if (selectedIds.size === 0) return;
    bulkShipMutation.mutate({ order_line_ids: [...selectedIds] });
  };

  return (
    <AppShell>
      <PageHeader title="Mid-Cycle Resolution Center" />

      <div className="p-6">
        {/* Controls */}
        <div className="flex items-center gap-4 mb-6">
          <Select value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)} className="w-56">
            <option value="">Latest cycle</option>
            {cycles.map(c => <option key={c.id} value={c.id}>{formatDate(c.start_date)} – {formatDate(c.end_date)}</option>)}
          </Select>
          <Select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="w-40">
            <option value="">All Areas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
          </Select>
          {isFetching && <Spinner className="w-4 h-4" />}
          <div className="ml-auto text-sm text-gray-500">
            {newFlags > 0 && <span className="text-amber-600 font-medium mr-3">{newFlags} new flags detected</span>}
            <span className="text-red-600 font-medium">{unacknowledged.length} pending</span>
            {' '}&middot;{' '}
            <span className="text-amber-600 font-medium">{acknowledged.length} acknowledged</span>
            {' '}&middot;{' '}
            <span className="text-green-600">{shipped.length} shipped</span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">
            No mid-cycle flags for this cycle. All items were included in the standard order.
          </div>
        ) : (
          <div className="space-y-8">
            {/* ── Pending (unacknowledged) ─────────────────────── */}
            {unacknowledged.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-3">
                  Pending Acknowledgement ({unacknowledged.length})
                </h2>
                {Object.entries(groupByArea(unacknowledged)).sort().map(([area, items]) => (
                  <div key={area} className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">{area}</h3>
                    <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-red-50 border-b border-red-200">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-red-700">Professor</th>
                            <th className="text-left px-3 py-2 font-medium text-red-700">Item</th>
                            <th className="text-left px-3 py-2 font-medium text-red-700">Type</th>
                            <th className="text-left px-3 py-2 font-medium text-red-700">Program</th>
                            <th className="w-24"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-100">
                          {items.map(f => (
                            <tr key={f.line_id} className="hover:bg-red-50/50">
                              <td className="px-3 py-2 font-medium">{f.professor_name}</td>
                              <td className="px-3 py-2">{f.item_name}<LeadTimeWarning item={f} /></td>
                              <td className="px-3 py-2 text-gray-500">{f.item_type}</td>
                              <td className="px-3 py-2 text-xs text-gray-500">{f.program_nickname || '—'}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => acknowledgeMutation.mutate({ order_line_id: f.line_id })}
                                  disabled={acknowledgeMutation.isPending}
                                  className="px-3 py-1 bg-amber-500 text-white text-xs rounded hover:bg-amber-600 font-medium">
                                  Acknowledge
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Acknowledged (ready to ship) ────────────────── */}
            {acknowledged.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wider">
                    Acknowledged — Ready to Ship ({acknowledged.length})
                  </h2>
                  <Button size="sm" onClick={selectAllAcknowledged}>Select All</Button>
                  {selectedIds.size > 0 && (
                    <Button size="sm" onClick={handleBulkShip} disabled={bulkShipMutation.isPending}>
                      {bulkShipMutation.isPending ? 'Shipping...' : `Mark ${selectedIds.size} Shipped`}
                    </Button>
                  )}
                </div>
                {Object.entries(groupByArea(acknowledged)).sort().map(([area, items]) => (
                  <div key={area} className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">{area}</h3>
                    <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-amber-50 border-b border-amber-200">
                          <tr>
                            <th className="w-10 px-3 py-2">
                              <input type="checkbox"
                                checked={items.every(f => selectedIds.has(f.line_id))}
                                onChange={() => {
                                  const allSelected = items.every(f => selectedIds.has(f.line_id));
                                  setSelectedIds(prev => {
                                    const next = new Set(prev);
                                    items.forEach(f => allSelected ? next.delete(f.line_id) : next.add(f.line_id));
                                    return next;
                                  });
                                }}
                                className="accent-[#1e3a5f]" />
                            </th>
                            <th className="text-left px-3 py-2 font-medium text-amber-700">Professor</th>
                            <th className="text-left px-3 py-2 font-medium text-amber-700">Item</th>
                            <th className="text-left px-3 py-2 font-medium text-amber-700">Type</th>
                            <th className="text-left px-3 py-2 font-medium text-amber-700">Program</th>
                            <th className="w-24"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {items.map(f => (
                            <tr key={f.line_id} className={`hover:bg-amber-50/50 ${selectedIds.has(f.line_id) ? 'bg-amber-50/30' : ''}`}>
                              <td className="px-3 py-2">
                                <input type="checkbox" checked={selectedIds.has(f.line_id)}
                                  onChange={() => toggleSelect(f.line_id)} className="accent-[#1e3a5f]" />
                              </td>
                              <td className="px-3 py-2 font-medium">{f.professor_name}</td>
                              <td className="px-3 py-2">{f.item_name}<LeadTimeWarning item={f} /></td>
                              <td className="px-3 py-2 text-gray-500">{f.item_type}</td>
                              <td className="px-3 py-2 text-xs text-gray-500">{f.program_nickname || '—'}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => shipMutation.mutate({ order_line_id: f.line_id })}
                                  disabled={shipMutation.isPending}
                                  className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 font-medium">
                                  Ship
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Shipped (completed) ─────────────────────────── */}
            {shipped.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-3">
                  Shipped ({shipped.length})
                </h2>
                <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-green-50 border-b border-green-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-green-700">Professor</th>
                        <th className="text-left px-3 py-2 font-medium text-green-700">Item</th>
                        <th className="text-left px-3 py-2 font-medium text-green-700">Type</th>
                        <th className="text-left px-3 py-2 font-medium text-green-700">Program</th>
                        <th className="text-left px-3 py-2 font-medium text-green-700">Area</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-green-100">
                      {shipped.map(f => (
                        <tr key={f.line_id} className="bg-green-50/20">
                          <td className="px-3 py-2 font-medium">{f.professor_name}</td>
                          <td className="px-3 py-2">{f.item_name}</td>
                          <td className="px-3 py-2 text-gray-500">{f.item_type}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{f.program_nickname || '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{f.area || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
