import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

const RESOLUTIONS = [
  { value: 'request_to_ship', label: 'Request to Ship', needsQty: true },
  { value: 'dropped_by_field_manager', label: 'Dropped by Field Manager' },
  { value: 'catapult_kit_used', label: 'Catapult Kit Used' },
  { value: 'car_kit_substitute', label: 'Car Kit Substitute' },
  { value: 'not_needed_has_enough', label: 'Not Needed — Has Enough' },
  { value: 'ship_next_scheduled', label: 'Ship Next Scheduled', needsQty: true },
  { value: 'other', label: 'Other' },
];

function LeadTimeWarning({ item }) {
  if (!item.earliest_session_date || !item.shipping_lead_days) return null;
  const sessionDate = new Date(item.earliest_session_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilSession = Math.ceil((sessionDate - today) / (1000 * 60 * 60 * 24));
  const leadDays = item.shipping_lead_days;
  if (daysUntilSession <= 0) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white ml-2">PAST DUE</span>;
  if (daysUntilSession < leadDays) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 ml-2">{daysUntilSession}d left — needs {leadDays}d lead</span>;
  return null;
}

export default function ResolutionCenterPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState('resolutions');
  const [selectedCycle, setSelectedCycle] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [myOnly, setMyOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  const { data: cyclesData } = useQuery({
    queryKey: ['shipment-cycles'],
    queryFn: () => api.get('/materials/cycles').then(r => r.data),
  });
  const cycles = (cyclesData?.data || []).filter(c => c.status !== 'draft');
  const activeCycleId = selectedCycle || cycles[0]?.id;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['mid-cycle-flags', activeCycleId],
    queryFn: () => api.get(`/materials/cycles/${activeCycleId}/mid-cycle-flags`).then(r => r.data),
    enabled: !!activeCycleId,
    refetchOnWindowFocus: false,
  });

  const resolveMutation = useMutation({
    mutationFn: (d) => api.post('/materials/resolutions/resolve', d),
    onSuccess: () => qc.invalidateQueries(['mid-cycle-flags']),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (d) => api.post('/materials/resolutions/acknowledge', d),
    onSuccess: () => qc.invalidateQueries(['mid-cycle-flags']),
  });

  const unacknowledgeMutation = useMutation({
    mutationFn: (d) => api.post('/materials/resolutions/unacknowledge', d),
    onSuccess: () => qc.invalidateQueries(['mid-cycle-flags']),
  });

  const shipMutation = useMutation({
    mutationFn: (d) => api.post('/materials/resolutions/ship', d),
    onSuccess: () => qc.invalidateQueries(['mid-cycle-flags']),
  });

  const bulkShipMutation = useMutation({
    mutationFn: (d) => api.post('/materials/resolutions/bulk-ship', d),
    onSuccess: () => { qc.invalidateQueries(['mid-cycle-flags']); setSelectedIds(new Set()); },
  });

  const allFlags = data?.data || [];

  // Filter
  let filtered = allFlags;
  if (areaFilter) {
    const areaName = areas.find(a => String(a.id) === areaFilter)?.geographic_area_name;
    filtered = filtered.filter(f => f.area === areaName);
  }
  if (myOnly) filtered = filtered.filter(f => f.sc_owner_id === user?.userId);

  // Categorize
  const unresolved = filtered.filter(f => !f.resolution_id);
  const resolved = filtered.filter(f => f.resolution_id && !f.acknowledged_at && !f.shipped_at);
  const acknowledged = filtered.filter(f => f.acknowledged_at && !f.shipped_at);
  const shipped = filtered.filter(f => f.shipped_at);

  const groupByArea = (items) => {
    const g = {};
    items.forEach(i => { const a = i.area || 'Unknown'; if (!g[a]) g[a] = []; g[a].push(i); });
    return g;
  };

  return (
    <AppShell>
      <div className="bg-white border-b border-gray-200 px-6 pt-4 pb-0">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Resolutions & Shipments</h1>
        <div className="flex gap-1">
          {[['resolutions', 'Mid-Cycle Resolutions'], ['lookup', 'Shipment Lookup']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === k ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'lookup' && <ShipmentLookup />}

      {tab === 'resolutions' && <div className="p-6">
        {/* Controls */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <Select value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)} className="w-56">
            <option value="">Latest cycle</option>
            {cycles.map(c => <option key={c.id} value={c.id}>{formatDate(c.start_date)} – {formatDate(c.end_date)}</option>)}
          </Select>
          <Select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="w-40">
            <option value="">All Areas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
          </Select>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={myOnly} onChange={e => setMyOnly(e.target.checked)} className="accent-[#1e3a5f]" />
            My professors only
          </label>
          {isFetching && <Spinner className="w-4 h-4" />}
          <div className="ml-auto text-sm text-gray-500">
            <span className="text-red-600 font-medium">{unresolved.length} unresolved</span>
            {' '}&middot;{' '}<span className="text-blue-600 font-medium">{resolved.length} resolved</span>
            {' '}&middot;{' '}<span className="text-amber-600 font-medium">{acknowledged.length} acknowledged</span>
            {' '}&middot;{' '}<span className="text-green-600">{shipped.length} shipped</span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">No mid-cycle flags for this cycle.</div>
        ) : (
          <div className="space-y-8">
            {/* ── Unresolved (schedulers need to act) ──── */}
            {unresolved.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-3">
                  Needs Resolution — Schedulers ({unresolved.length})
                </h2>
                {Object.entries(groupByArea(unresolved)).sort().map(([area, items]) => (
                  <div key={area} className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">{area}</h3>
                    <div className="bg-white rounded-lg border border-red-200 divide-y divide-red-100">
                      {items.map(f => <ResolutionRow key={f.line_id} item={f} onResolve={resolveMutation.mutate} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Resolved (warehouse needs to acknowledge) ──── */}
            {resolved.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-blue-700 uppercase tracking-wider mb-3">
                  Resolved — Awaiting Warehouse ({resolved.length})
                </h2>
                <div className="bg-white rounded-lg border border-blue-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-blue-50 border-b border-blue-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-blue-700">Professor</th>
                        <th className="text-left px-3 py-2 font-medium text-blue-700">Item</th>
                        <th className="text-left px-3 py-2 font-medium text-blue-700">Resolution</th>
                        <th className="text-center px-3 py-2 font-medium text-blue-700 w-16">Qty</th>
                        <th className="text-left px-3 py-2 font-medium text-blue-700">Notes</th>
                        <th className="text-left px-3 py-2 font-medium text-blue-700">By</th>
                        <th className="w-32"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-100">
                      {resolved.map(f => (
                        <tr key={f.line_id} className="hover:bg-blue-50/30">
                          <td className="px-3 py-2 font-medium">{f.professor_name}</td>
                          <td className="px-3 py-2">{f.item_name}<LeadTimeWarning item={f} /></td>
                          <td className="px-3 py-2">
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                              {RESOLUTIONS.find(r => r.value === f.resolution)?.label || f.resolution}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">{f.quantity_resolved || '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{f.resolution_notes || '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{f.resolved_by_name || '—'}</td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => acknowledgeMutation.mutate({ order_line_id: f.line_id })}
                              className="px-2 py-1 bg-amber-500 text-white text-xs rounded hover:bg-amber-600 font-medium">
                              Acknowledge
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Acknowledged (ready to ship) ──── */}
            {acknowledged.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wider">
                    Acknowledged — Ready to Ship ({acknowledged.length})
                  </h2>
                  {selectedIds.size > 0 && (
                    <Button size="sm" onClick={() => bulkShipMutation.mutate({ order_line_ids: [...selectedIds] })}
                      disabled={bulkShipMutation.isPending}>
                      {bulkShipMutation.isPending ? 'Shipping...' : `Ship ${selectedIds.size} Selected`}
                    </Button>
                  )}
                </div>
                <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-50 border-b border-amber-200">
                      <tr>
                        <th className="w-10 px-3 py-2">
                          <input type="checkbox"
                            checked={acknowledged.every(f => selectedIds.has(f.line_id))}
                            onChange={() => {
                              const all = acknowledged.every(f => selectedIds.has(f.line_id));
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                acknowledged.forEach(f => all ? next.delete(f.line_id) : next.add(f.line_id));
                                return next;
                              });
                            }} className="accent-[#1e3a5f]" />
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-amber-700">Professor</th>
                        <th className="text-left px-3 py-2 font-medium text-amber-700">Item</th>
                        <th className="text-left px-3 py-2 font-medium text-amber-700">Resolution</th>
                        <th className="text-center px-3 py-2 font-medium text-amber-700 w-16">Qty</th>
                        <th className="w-32"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {acknowledged.map(f => (
                        <tr key={f.line_id} className={`hover:bg-amber-50/30 ${selectedIds.has(f.line_id) ? 'bg-amber-50/30' : ''}`}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={selectedIds.has(f.line_id)}
                              onChange={() => setSelectedIds(prev => {
                                const next = new Set(prev);
                                next.has(f.line_id) ? next.delete(f.line_id) : next.add(f.line_id);
                                return next;
                              })} className="accent-[#1e3a5f]" />
                          </td>
                          <td className="px-3 py-2 font-medium">{f.professor_name}</td>
                          <td className="px-3 py-2">{f.item_name}<LeadTimeWarning item={f} /></td>
                          <td className="px-3 py-2">
                            <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                              {RESOLUTIONS.find(r => r.value === f.resolution)?.label || f.resolution}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">{f.quantity_resolved || '—'}</td>
                          <td className="px-3 py-2 text-right flex items-center gap-1 justify-end">
                            <button onClick={() => shipMutation.mutate({ order_line_id: f.line_id })}
                              className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 font-medium">Ship</button>
                            <button onClick={() => unacknowledgeMutation.mutate({ order_line_id: f.line_id })}
                              className="text-[10px] text-gray-400 hover:text-gray-600">undo</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Shipped ──── */}
            {shipped.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-3">Shipped ({shipped.length})</h2>
                <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-green-50 border-b border-green-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-green-700">Professor</th>
                        <th className="text-left px-3 py-2 font-medium text-green-700">Item</th>
                        <th className="text-left px-3 py-2 font-medium text-green-700">Resolution</th>
                        <th className="text-left px-3 py-2 font-medium text-green-700">Area</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-green-100">
                      {shipped.map(f => (
                        <tr key={f.line_id} className="bg-green-50/20">
                          <td className="px-3 py-2">{f.professor_name}</td>
                          <td className="px-3 py-2">{f.item_name}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{RESOLUTIONS.find(r => r.value === f.resolution)?.label || f.resolution}</td>
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
      </div>}
    </AppShell>
  );
}

// Shipment Lookup tab
function ShipmentLookup() {
  const [search, setSearch] = useState('');
  const [selectedProfId, setSelectedProfId] = useState(null);

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['prof-search-shipments', search],
    queryFn: () => api.get('/professors', { params: { search, status: 'Active', limit: 20 } }).then(r => r.data),
    enabled: search.length >= 2,
  });
  const searchResults = searchData?.data || [];

  const { data: shipmentsData, isLoading: shipmentsLoading } = useQuery({
    queryKey: ['prof-shipments', selectedProfId],
    queryFn: () => api.get(`/materials/shipments/professor/${selectedProfId}`).then(r => r.data),
    enabled: !!selectedProfId,
  });
  const shipments = shipmentsData?.data || [];
  const selectedProf = searchResults.find(p => p.id === selectedProfId);

  return (
    <div className="p-6">
      <div className="flex items-end gap-4 mb-6">
        <div className="flex-1 max-w-sm">
          <Input label="Search Professor" placeholder="Type a name..." value={search}
            onChange={e => { setSearch(e.target.value); setSelectedProfId(null); }} />
        </div>
      </div>

      {/* Search results */}
      {search.length >= 2 && !selectedProfId && (
        <div className="bg-white rounded-lg border border-gray-200 mb-6 max-w-sm">
          {searchLoading ? (
            <div className="p-4 text-center"><Spinner className="w-5 h-5" /></div>
          ) : searchResults.length === 0 ? (
            <div className="p-4 text-sm text-gray-400">No professors found</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {searchResults.map(p => (
                <button key={p.id} onClick={() => setSelectedProfId(p.id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors">
                  <div className="text-sm font-medium text-gray-900">{p.professor_nickname} {p.last_name}</div>
                  <div className="text-xs text-gray-400">{p.geographic_area_name || 'No area'}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shipment history */}
      {selectedProfId && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-sm font-semibold text-gray-700">
              Shipments for {selectedProf?.professor_nickname || 'Professor'}
            </h3>
            <Link to={`/professors/${selectedProfId}`} className="text-xs text-[#1e3a5f] hover:underline">View Profile</Link>
            <button onClick={() => { setSelectedProfId(null); setSearch(''); }} className="text-xs text-gray-400 hover:text-gray-600 ml-auto">Clear</button>
          </div>

          {shipmentsLoading ? (
            <div className="flex justify-center py-8"><Spinner className="w-6 h-6" /></div>
          ) : shipments.length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-400 text-sm">No shipments found for this professor</div>
          ) : (
            <div className="space-y-3">
              {shipments.map(o => (
                <div key={o.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between bg-gray-50 border-b border-gray-200">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{o.order_name}</span>
                      {o.cycle_start && (
                        <span className="text-xs text-gray-400 ml-3">Week of {formatDate(o.cycle_start)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        o.status === 'shipped' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>{o.status}</span>
                      {o.shipped_at && <span className="text-xs text-gray-400">Shipped {formatDate(o.shipped_at)}</span>}
                    </div>
                  </div>
                  <div className="px-4 py-2">
                    {/* Tracking */}
                    <div className="mb-2">
                      {o.tracking_number ? (
                        <div className="text-xs">
                          <span className="text-gray-500 font-medium">Tracking: </span>
                          {o.tracking_number.split(',').map((t, i) => (
                            <span key={i} className="font-mono text-[#1e3a5f]">
                              {i > 0 && ', '}{t.trim()}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-amber-500 font-medium">No Tracking Data</span>
                      )}
                    </div>
                    {/* Items */}
                    {o.lines && o.lines.length > 0 && (
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-gray-100">
                          {o.lines.map((l, i) => (
                            <tr key={i}>
                              <td className="py-1 text-gray-800">{l.item_name}</td>
                              <td className="py-1 w-20">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  l.item_type === 'lesson' ? 'bg-blue-100 text-blue-700' :
                                  l.item_type === 'start_kit' ? 'bg-green-100 text-green-700' :
                                  l.item_type === 'degree' ? 'bg-purple-100 text-purple-700' :
                                  l.item_type === 'bin' ? 'bg-orange-100 text-orange-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{l.item_type.replace('_', ' ')}</span>
                              </td>
                              <td className="py-1 w-10 text-center text-gray-500">x{l.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Inline resolution form for schedulers
function ResolutionRow({ item, onResolve }) {
  const [resolution, setResolution] = useState('');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const selectedRes = RESOLUTIONS.find(r => r.value === resolution);

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-red-50/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{item.professor_name}</span>
          <span className="text-gray-400">—</span>
          <span className="text-sm text-gray-700">{item.item_name}</span>
          <LeadTimeWarning item={item} />
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{item.program_nickname || '—'} &middot; {item.area || '—'}</div>
      </div>
      <select value={resolution} onChange={e => setResolution(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1.5 text-xs bg-white min-w-[170px]">
        <option value="">Select resolution...</option>
        {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      {selectedRes?.needsQty && (
        <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="Qty"
          className="w-14 rounded border border-gray-300 px-2 py-1.5 text-xs" />
      )}
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes"
        className="rounded border border-gray-300 px-2 py-1.5 text-xs w-28" />
      <button onClick={() => resolution && onResolve({ order_line_id: item.line_id, resolution, quantity_resolved: qty || null, notes })}
        disabled={!resolution}
        className="px-3 py-1.5 bg-[#1e3a5f] text-white text-xs rounded hover:bg-[#152a47] disabled:opacity-40 font-medium whitespace-nowrap">
        Submit
      </button>
    </div>
  );
}
