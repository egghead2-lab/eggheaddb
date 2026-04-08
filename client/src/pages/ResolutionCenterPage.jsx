import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';

const RESOLUTIONS = [
  { value: 'dropped_by_field_manager', label: 'Dropped by Field Manager' },
  { value: 'request_to_ship', label: 'Request to Ship' },
  { value: 'catapult_kit_used', label: 'Catapult Kit Used' },
  { value: 'car_kit_substitute', label: 'Car Kit Substitute' },
  { value: 'not_needed_has_enough', label: 'Not Needed - Has Enough' },
  { value: 'ship_next_scheduled', label: 'Ship Next Scheduled' },
  { value: 'other', label: 'Other' },
];

export default function ResolutionCenterPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const cycleId = searchParams.get('cycle_id');
  const [areaFilter, setAreaFilter] = useState('');

  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  const { data: cyclesData } = useQuery({
    queryKey: ['shipment-cycles'],
    queryFn: () => api.get('/materials/cycles').then(r => r.data),
  });
  const midCycles = (cyclesData?.data || []).filter(c => c.cycle_type === 'mid_cycle');
  const [selectedCycle, setSelectedCycle] = useState(cycleId || '');
  const activeCycleId = selectedCycle || midCycles[0]?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['resolutions', activeCycleId, areaFilter],
    queryFn: () => api.get('/materials/resolutions', { params: { cycle_id: activeCycleId, area_id: areaFilter || undefined } }).then(r => r.data),
    enabled: !!activeCycleId,
  });

  const resolveMutation = useMutation({
    mutationFn: (data) => api.post('/materials/resolutions', data),
    onSuccess: () => qc.invalidateQueries(['resolutions']),
  });

  const items = data?.data || [];

  // Group by area
  const grouped = {};
  items.forEach(item => {
    const area = item.area || 'Unknown';
    if (!grouped[area]) grouped[area] = [];
    grouped[area].push(item);
  });

  const unresolvedCount = items.filter(i => !i.resolution_id).length;
  const resolvedCount = items.filter(i => i.resolution_id).length;

  return (
    <AppShell>
      <PageHeader title="Resolution Center">
        <Select value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)} className="w-48">
          <option value="">Latest mid-cycle</option>
          {midCycles.map(c => <option key={c.id} value={c.id}>Mid-Cycle {c.start_date?.split('T')[0]}</option>)}
        </Select>
        <Select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="w-40">
          <option value="">All Areas</option>
          {areas.map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
        </Select>
        <div className="text-sm text-gray-500">
          <span className="text-amber-600 font-medium">{unresolvedCount} unresolved</span> &middot; {resolvedCount} resolved
        </div>
      </PageHeader>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">No flagged items to resolve</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).sort().map(([area, areaItems]) => (
              <div key={area}>
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">{area}</h3>
                <div className="space-y-2">
                  {areaItems.map(item => (
                    <ResolutionCard key={item.id} item={item} onResolve={(data) => resolveMutation.mutate(data)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ResolutionCard({ item, onResolve }) {
  const [resolution, setResolution] = useState(item.resolution || '');
  const [qty, setQty] = useState(item.quantity_resolved || '');
  const [notes, setNotes] = useState(item.resolution_notes || '');
  const isResolved = !!item.resolution_id;

  return (
    <div className={`bg-white rounded-lg border p-4 ${isResolved ? 'border-green-200 bg-green-50/20' : 'border-amber-200'}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{item.professor_name}</span>
            <span className="text-gray-400">&mdash;</span>
            <span className="text-sm text-gray-700">{item.item_name}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Order: {item.order_name}</div>
        </div>

        {isResolved ? (
          <div className="text-right">
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
              {RESOLUTIONS.find(r => r.value === item.resolution)?.label || item.resolution}
            </span>
            {item.quantity_resolved && <div className="text-xs text-gray-500 mt-0.5">Qty: {item.quantity_resolved}</div>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select value={resolution} onChange={e => setResolution(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs bg-white min-w-[180px]">
              <option value="">Select resolution...</option>
              {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {(resolution === 'request_to_ship' || resolution === 'ship_next_scheduled') && (
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="Qty"
                className="w-16 rounded border border-gray-300 px-2 py-1.5 text-xs" />
            )}
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes"
              className="rounded border border-gray-300 px-2 py-1.5 text-xs w-32" />
            <button onClick={() => resolution && onResolve({ order_line_id: item.id, resolution, quantity_resolved: qty || null, notes })}
              disabled={!resolution}
              className="px-3 py-1.5 bg-[#1e3a5f] text-white text-xs rounded hover:bg-[#152a47] disabled:opacity-40 font-medium">
              Resolve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
