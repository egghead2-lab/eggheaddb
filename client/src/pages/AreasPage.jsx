import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

const ROLES = [
  { key: 'scheduling_coordinator_user_id', label: 'Sched. Coord.', nameKey: 'scheduling_coordinator_name', color: 'bg-blue-50 text-blue-700' },
  { key: 'field_manager_user_id', label: 'Field Mgr', nameKey: 'field_manager_name', color: 'bg-emerald-50 text-emerald-700' },
  { key: 'client_manager_user_id', label: 'Client Mgr', nameKey: 'client_manager_name', color: 'bg-violet-50 text-violet-700' },
  { key: 'sales_user_id', label: 'Sales', nameKey: 'sales_name', color: 'bg-amber-50 text-amber-700' },
  { key: 'recruiter_user_id', label: 'Recruiter', nameKey: 'recruiter_name', color: 'bg-teal-50 text-teal-700' },
  { key: 'onboarder_user_id', label: 'Onboarder', nameKey: 'onboarder_name', color: 'bg-pink-50 text-pink-700' },
  { key: 'client_specialist_user_id', label: 'Client Spec.', nameKey: 'client_specialist_name', color: 'bg-indigo-50 text-indigo-700' },
  { key: 'scheduling_specialist_user_id', label: 'Sched. Spec.', nameKey: 'scheduling_specialist_name', color: 'bg-sky-50 text-sky-700' },
  { key: 'trainer_user_id', label: 'Trainer', nameKey: 'trainer_name', color: 'bg-orange-50 text-orange-700' },
];

const selectCls = `w-full rounded border border-gray-200 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] appearance-none pr-6 bg-[length:12px_12px] bg-[position:right_0.25rem_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]`;

// ── Manage Areas Modal ──────────────────────────────────────────────

function ManageAreasPanel({ areas, regions, states, users, onClose }) {
  const qc = useQueryClient();
  const [newAreaName, setNewAreaName] = useState('');
  const [newRegionName, setNewRegionName] = useState('');

  const createArea = useMutation({
    mutationFn: (data) => api.post('/areas', data),
    onSuccess: () => { qc.invalidateQueries(['areas']); setNewAreaName(''); },
  });
  const updateArea = useMutation({
    mutationFn: ({ id, data }) => api.put(`/areas/${id}`, data),
    onSuccess: () => qc.invalidateQueries(['areas']),
  });
  const deleteArea = useMutation({
    mutationFn: (id) => api.delete(`/areas/${id}`),
    onSuccess: () => qc.invalidateQueries(['areas']),
  });
  const createRegion = useMutation({
    mutationFn: (data) => api.post('/regions', data),
    onSuccess: () => { qc.invalidateQueries(['regions']); qc.invalidateQueries(['areas']); setNewRegionName(''); },
  });
  const deleteRegion = useMutation({
    mutationFn: (id) => api.delete(`/regions/${id}`),
    onSuccess: () => { qc.invalidateQueries(['regions']); qc.invalidateQueries(['areas']); },
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-16 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Manage Areas & Regions</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Regions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Regions</h3>
            <div className="space-y-1.5">
              {regions.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="text-sm flex-1">{r.region_name}</span>
                  <span className="text-xs text-gray-400">{r.area_count} area{r.area_count !== 1 ? 's' : ''}</span>
                  <button onClick={() => { if (confirm(`Delete region "${r.region_name}"? Areas will become unassigned.`)) deleteRegion.mutate(r.id); }}
                    className="text-gray-300 hover:text-red-500 text-xs px-1">Delete</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input value={newRegionName} onChange={e => setNewRegionName(e.target.value)}
                placeholder="New region name" onKeyDown={e => e.key === 'Enter' && newRegionName.trim() && createRegion.mutate({ region_name: newRegionName.trim() })}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              <Button size="sm" onClick={() => createRegion.mutate({ region_name: newRegionName.trim() })}
                disabled={!newRegionName.trim()}>Add</Button>
            </div>
          </div>

          {/* Areas */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Areas</h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-1.5 text-xs font-semibold text-gray-500">Area Name</th>
                  <th className="text-left px-2 py-1.5 text-xs font-semibold text-gray-500 w-44">Region</th>
                  <th className="text-left px-2 py-1.5 text-xs font-semibold text-gray-500 w-36">State</th>
                  <th className="text-center px-2 py-1.5 text-xs font-semibold text-gray-500 w-20">Locations</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {areas.map(a => (
                  <ManageAreaRow key={a.id} area={a} regions={regions} states={states}
                    onUpdate={(data) => updateArea.mutate({ id: a.id, data })}
                    onDelete={() => { if (confirm(`Delete "${a.geographic_area_name}"?`)) deleteArea.mutate(a.id); }} />
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 mt-3">
              <input value={newAreaName} onChange={e => setNewAreaName(e.target.value)}
                placeholder="New area name" onKeyDown={e => e.key === 'Enter' && newAreaName.trim() && createArea.mutate({ geographic_area_name: newAreaName.trim() })}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              <Button size="sm" onClick={() => createArea.mutate({ geographic_area_name: newAreaName.trim() })}
                disabled={!newAreaName.trim()}>Add Area</Button>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

function ManageAreaRow({ area, regions, states, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(area.geographic_area_name);

  return (
    <tr className="hover:bg-gray-50/50">
      <td className="px-2 py-1.5">
        {editing ? (
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onBlur={() => { if (name.trim() && name !== area.geographic_area_name) onUpdate({ geographic_area_name: name.trim() }); setEditing(false); }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setName(area.geographic_area_name); setEditing(false); } }}
            className="w-full rounded border border-[#1e3a5f] px-1.5 py-0.5 text-sm focus:outline-none" />
        ) : (
          <button onClick={() => setEditing(true)} className="text-sm text-[#1e3a5f] hover:underline text-left">{area.geographic_area_name}</button>
        )}
      </td>
      <td className="px-2 py-1.5">
        <select value={area.region_id || ''} onChange={e => onUpdate({ region_id: e.target.value || null })} className={selectCls}>
          <option value="">No region</option>
          {regions.map(r => <option key={r.id} value={r.id}>{r.region_name}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select value={area.state_id || ''} onChange={e => onUpdate({ state_id: e.target.value || null })} className={selectCls}>
          <option value="">No state</option>
          {states.map(s => <option key={s.id} value={s.id}>{s.state_name}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5 text-center text-xs text-gray-500">{area.location_count}</td>
      <td className="px-2 py-1.5 text-center">
        <button onClick={onDelete} className="text-gray-300 hover:text-red-500">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </td>
    </tr>
  );
}

// ── Region Group (collapsible) ──────────────────────────────────────

function RegionGroup({ regionName, areas, users, isOpen, onToggle, inlineUpdate, onDelete }) {
  const totalLocations = areas.reduce((sum, a) => sum + (a.location_count || 0), 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400">{isOpen ? '▾' : '▸'}</span>
          <h3 className="text-sm font-bold text-gray-800">{regionName}</h3>
          <span className="text-xs text-gray-400">{areas.length} area{areas.length !== 1 ? 's' : ''} &middot; {totalLocations} location{totalLocations !== 1 ? 's' : ''}</span>
        </div>
      </button>

      {isOpen && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs w-44">Area</th>
                {ROLES.map(r => (
                  <th key={r.key} className="text-left px-1.5 py-2 text-[11px] uppercase tracking-wider min-w-[120px]">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${r.color}`}>{r.label}</span>
                  </th>
                ))}
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {areas.map(area => (
                <AreaRow key={area.id} area={area} users={users} inlineUpdate={inlineUpdate} onDelete={onDelete} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AreaRow({ area, users, inlineUpdate, onDelete }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(area.geographic_area_name);

  const saveName = () => {
    if (name.trim() && name !== area.geographic_area_name) inlineUpdate(area.id, 'geographic_area_name', name.trim());
    setEditingName(false);
  };

  return (
    <tr className="hover:bg-gray-50/50">
      <td className="px-3 py-2">
        {editingName ? (
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onBlur={saveName} onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(area.geographic_area_name); setEditingName(false); } }}
            className="w-full rounded border border-[#1e3a5f] px-2 py-0.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        ) : (
          <button onClick={() => setEditingName(true)} className="text-sm font-medium text-[#1e3a5f] hover:underline text-left">
            {area.geographic_area_name}
          </button>
        )}
        <div className="text-[11px] text-gray-400">{area.location_count} location{area.location_count !== 1 ? 's' : ''}{area.state_code ? ` \u00b7 ${area.state_code}` : ''}</div>
      </td>
      {ROLES.map(r => (
        <td key={r.key} className="px-1.5 py-1">
          <select value={area[r.key] || ''} onChange={e => inlineUpdate(area.id, r.key, e.target.value || null)} className={selectCls}>
            <option value="">—</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
          </select>
        </td>
      ))}
      <td className="px-2 py-2 text-center">
        <button onClick={() => { if (confirm(`Delete "${area.geographic_area_name}"?`)) onDelete(area.id); }}
          className="text-gray-300 hover:text-red-500 transition-colors" title="Delete area">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function AreasPage() {
  const qc = useQueryClient();
  const [showManage, setShowManage] = useState(false);
  const [openRegions, setOpenRegions] = useState(new Set());
  const [allOpen, setAllOpen] = useState(true);

  const { data: areasData, isLoading } = useQuery({
    queryKey: ['areas'],
    queryFn: () => api.get('/areas').then(r => r.data),
  });

  const { data: regionsData } = useQuery({
    queryKey: ['regions'],
    queryFn: () => api.get('/regions').then(r => r.data),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => api.get('/users?limit=200').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data: statesData } = useQuery({
    queryKey: ['states'],
    queryFn: () => api.get('/general-data').then(r => r.data),
    staleTime: 10 * 60 * 1000,
    select: (d) => d?.data?.states || [],
  });

  const areas = areasData?.data || [];
  const regions = regionsData?.data || [];
  const users = usersData?.data || [];
  const states = statesData || [];

  // Group areas by region
  const grouped = useMemo(() => {
    const groups = [];
    const regionMap = new Map();

    for (const area of areas) {
      const key = area.region_id || 'unassigned';
      if (!regionMap.has(key)) {
        regionMap.set(key, {
          regionId: area.region_id,
          regionName: area.region_name || 'Unassigned',
          areas: [],
        });
      }
      regionMap.get(key).areas.push(area);
    }

    // Sort: assigned regions first (by sort_order via query), unassigned last
    const assigned = [];
    const unassigned = regionMap.get('unassigned');
    for (const [key, group] of regionMap) {
      if (key !== 'unassigned') assigned.push(group);
    }
    groups.push(...assigned);
    if (unassigned) groups.push(unassigned);

    return groups;
  }, [areas]);

  // Initialize all regions as open
  const isRegionOpen = (name) => allOpen || openRegions.has(name);
  const toggleRegion = (name) => {
    if (allOpen) {
      // Switch to manual mode, all open except the one clicked
      const all = new Set(grouped.map(g => g.regionName));
      all.delete(name);
      setOpenRegions(all);
      setAllOpen(false);
    } else {
      setOpenRegions(prev => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name); else next.add(name);
        return next;
      });
    }
  };

  const toggleAll = () => {
    if (allOpen) {
      setOpenRegions(new Set());
      setAllOpen(false);
    } else {
      setAllOpen(true);
    }
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/areas/${id}`, data),
    onSuccess: () => qc.invalidateQueries(['areas']),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/areas/${id}`),
    onSuccess: () => qc.invalidateQueries(['areas']),
  });

  const inlineUpdate = (areaId, field, value) => {
    updateMutation.mutate({ id: areaId, data: { [field]: value } });
  };

  return (
    <AppShell>
      <PageHeader title="Areas" action={
        <div className="flex gap-2">
          <button onClick={toggleAll}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded">
            {allOpen ? 'Collapse All' : 'Expand All'}
          </button>
          <Button variant="secondary" onClick={() => setShowManage(true)}>Manage Areas</Button>
        </div>
      } />

      <div className="p-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No areas found. Click "Manage Areas" to add some.</div>
        ) : (
          grouped.map(group => (
            <RegionGroup
              key={group.regionName}
              regionName={group.regionName}
              areas={group.areas}
              users={users}
              isOpen={isRegionOpen(group.regionName)}
              onToggle={() => toggleRegion(group.regionName)}
              inlineUpdate={inlineUpdate}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))
        )}
      </div>

      {showManage && (
        <ManageAreasPanel
          areas={areas}
          regions={regions}
          states={states}
          users={users}
          onClose={() => setShowManage(false)}
        />
      )}
    </AppShell>
  );
}
