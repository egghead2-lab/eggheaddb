import { useState, useMemo, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import api from '../../api/client';

const FALLBACK_GROUPS = [
  { label: 'Dashboard', items: [{ to: '/', label: 'Home' }] },
  { label: 'Operations', items: [
    { to: '/programs', label: 'Programs' }, { to: '/parties', label: 'Parties' },
    { to: '/professors', label: 'Professors' }, { to: '/locations', label: 'Locations' },
  ]},
];

// Groups that should always start expanded
const ALWAYS_OPEN = new Set(['Dashboard', 'Operations', 'My Classes']);
// Groups with <= this many tools auto-collapse
const AUTO_COLLAPSE_THRESHOLD = 2;

function SidebarGroup({ group, isOpen, onToggle, compact }) {
  const location = useLocation();
  const isActive = group.items.some(item =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
  );

  if (group.label === 'Dashboard') {
    return (
      <div className="mb-1">
        {group.items.map(item => (
          <NavLink key={item.to} to={item.to} end
            className={({ isActive }) =>
              `flex items-center ${compact ? 'justify-center px-1 py-2' : 'px-3 py-2'} rounded text-sm transition-colors ${
                isActive ? 'bg-white/15 text-white font-medium' : 'text-white/70 hover:text-white hover:bg-white/10'
              }`
            } title={compact ? item.label : undefined}>
            {compact ? item.label.charAt(0) : item.label}
          </NavLink>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button type="button" onClick={onToggle}
        className={`w-full flex items-center justify-between ${compact ? 'px-1 py-1' : 'px-3 py-1.5'} rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
          isActive ? 'text-white/90' : 'text-white/40 hover:text-white/60'
        }`} title={compact ? group.label : undefined}>
        {compact ? group.label.slice(0, 3) : group.label}
        {!compact && <span className="text-[10px]">{isOpen ? '▾' : '▸'}</span>}
      </button>
      {isOpen && (
        <div className="mt-0.5 space-y-0.5">
          {group.items.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) =>
                `flex items-center ${compact ? 'pl-1 pr-1 py-1 text-[10px]' : 'pl-6 pr-3 py-1.5 text-sm'} rounded transition-colors ${
                  isActive ? 'bg-white/15 text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/10'
                }`
              } title={compact ? item.label : undefined}>
              {compact ? item.label.slice(0, 6) : item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();

  // Compact mode
  const [compact, setCompact] = useState(() => localStorage.getItem('sidebar-compact') === 'true');
  const toggleCompact = () => {
    setCompact(prev => { const next = !prev; localStorage.setItem('sidebar-compact', next); return next; });
  };

  // Pinned tools
  const [pins, setPins] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sidebar-pins') || '[]'); } catch { return []; }
  });
  const togglePin = (path) => {
    setPins(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path];
      localStorage.setItem('sidebar-pins', JSON.stringify(next));
      return next;
    });
  };

  // Group order (user-customizable)
  const [groupOrder, setGroupOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sidebar-group-order') || 'null'); } catch { return null; }
  });
  const [reordering, setReordering] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);

  const { data: permData } = useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => api.get('/tools/my-permissions').then(r => r.data),
    staleTime: 2 * 60 * 1000,
  });

  // Build nav groups
  const navGroups = useMemo(() => {
    if (!permData?.data?.length) return FALLBACK_GROUPS;

    const groups = {};
    permData.data.forEach(t => {
      const g = t.nav_group || 'Other';
      if (!groups[g]) groups[g] = { label: g, items: [] };
      groups[g].items.push({ to: t.path, label: t.label });
    });

    // Use custom order if set, otherwise default
    const defaultOrder = ['My Classes', 'Dashboard', 'Operations', 'People', 'Parties', 'Sales', 'Scheduling', 'Hiring', 'Onboarding', 'Field Managing', 'FM Tools', 'Curriculum', 'Client Management', 'Human Resources', 'Warehouse Tools', 'Admin', 'Tools'];
    const order = groupOrder || defaultOrder;
    const sorted = [];
    for (const name of order) {
      if (groups[name]) { sorted.push(groups[name]); delete groups[name]; }
    }
    for (const g of Object.values(groups)) sorted.push(g);
    return sorted;
  }, [permData, groupOrder]);

  // All tools flat (for pins)
  const allTools = useMemo(() => {
    if (!permData?.data) return [];
    return permData.data;
  }, [permData]);

  const pinnedTools = allTools.filter(t => pins.includes(t.path));

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = new Set(['Operations']);
    navGroups.forEach(g => {
      if (g.items.some(item => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))) {
        initial.add(g.label);
      }
    });
    return initial;
  });

  // Auto-expand group containing current page, auto-collapse small groups
  useEffect(() => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      navGroups.forEach(g => {
        const hasActivePage = g.items.some(item => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to));
        if (hasActivePage) next.add(g.label);
        // Auto-collapse small groups that aren't active and aren't always-open
        if (!hasActivePage && !ALWAYS_OPEN.has(g.label) && g.items.length <= AUTO_COLLAPSE_THRESHOLD && !prev.has(g.label)) {
          next.delete(g.label);
        }
      });
      // Always keep these open
      ALWAYS_OPEN.forEach(name => next.add(name));
      return next;
    });
  }, [location.pathname, navGroups]);

  const toggleGroup = (label) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const handleGroupDrop = (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const labels = navGroups.map(g => g.label);
    const [moved] = labels.splice(dragIdx, 1);
    labels.splice(targetIdx, 0, moved);
    setGroupOrder(labels);
    localStorage.setItem('sidebar-group-order', JSON.stringify(labels));
    setDragIdx(null);
  };

  const sidebarWidth = compact ? 'w-[60px]' : 'w-[220px]';

  return (
    <div className={`${sidebarWidth} h-screen bg-[#152a47] flex flex-col fixed left-0 top-0 z-10 transition-all duration-200`}>
      {/* Header */}
      <div className={`${compact ? 'px-2 py-3' : 'px-5 py-5'} border-b border-white/10 flex items-center justify-between`}>
        {!compact && (
          <div>
            <div className="text-white font-bold text-base leading-tight">Professor Egghead</div>
            <div className="text-white/50 text-xs mt-0.5">Operations Hub</div>
          </div>
        )}
        <button onClick={toggleCompact} className="text-white/40 hover:text-white text-xs" title={compact ? 'Expand sidebar' : 'Compact sidebar'}>
          {compact ? '▸' : '◂'}
        </button>
      </div>

      {/* Pinned tools */}
      {pinnedTools.length > 0 && (
        <div className={`${compact ? 'px-1' : 'px-2'} py-2 border-b border-white/10`}>
          {!compact && <div className="text-[9px] text-white/30 uppercase tracking-wider px-1 mb-1">Pinned</div>}
          {pinnedTools.map(t => (
            <NavLink key={t.path} to={t.path}
              className={({ isActive }) =>
                `flex items-center ${compact ? 'justify-center px-1 py-1' : 'px-3 py-1'} rounded text-xs transition-colors ${
                  isActive ? 'bg-white/15 text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/10'
                }`
              } title={t.label}>
              {compact ? t.label.charAt(0) : t.label}
            </NavLink>
          ))}
        </div>
      )}

      {/* Nav groups */}
      <nav className="flex-1 py-2 px-1 overflow-y-auto">
        {!compact && reordering && <div className="text-[9px] text-amber-400 px-2 mb-1">Drag groups to reorder</div>}
        {navGroups.map((group, idx) => (
          <div key={group.label}
            draggable={reordering && !compact}
            onDragStart={() => setDragIdx(idx)}
            onDragOver={e => { if (reordering) e.preventDefault(); }}
            onDrop={() => handleGroupDrop(idx)}
            className={reordering ? 'cursor-grab' : ''}>
            <div className="flex items-center group">
              <div className="flex-1">
                <SidebarGroup group={group} compact={compact}
                  isOpen={openGroups.has(group.label)} onToggle={() => toggleGroup(group.label)} />
              </div>
              {/* Pin stars — always visible for pinned, show on hover for others */}
              {!compact && !reordering && openGroups.has(group.label) && group.label !== 'Dashboard' && (
                <div className="flex flex-col gap-0.5 pr-1">
                  {group.items.map(item => {
                    const isPinned = pins.includes(item.to);
                    return (
                      <button key={item.to} onClick={() => togglePin(item.to)} title={isPinned ? 'Unpin' : 'Pin to top'}
                        className={`text-sm leading-none transition-colors ${isPinned ? 'text-amber-400' : 'text-white/10 group-hover:text-white/30 hover:!text-amber-400'}`}>
                        {isPinned ? '★' : '☆'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={`${compact ? 'px-1 py-2' : 'px-4 py-4'} border-t border-white/10`}>
        {user && (
          <>
            {!compact && <div className="text-white text-sm font-medium truncate">{user.name}</div>}
            {!compact && <div className="text-white/50 text-xs capitalize">{user.role?.replace(/_/g, ' ')}</div>}
            <div className={`flex ${compact ? 'flex-col gap-1 items-center' : 'gap-3 mt-2'}`}>
              {!compact && (
                <button onClick={() => setReordering(r => !r)}
                  className={`text-[10px] transition-colors ${reordering ? 'text-amber-400' : 'text-white/30 hover:text-white/50'}`}>
                  {reordering ? 'Done' : 'Reorder'}
                </button>
              )}
              <button onClick={() => logout()}
                className={`text-xs text-white/50 hover:text-white transition-colors ${compact ? 'text-[10px]' : ''}`}>
                {compact ? '⏻' : 'Sign out'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
