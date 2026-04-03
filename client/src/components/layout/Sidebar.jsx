import { useState, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import api from '../../api/client';

// Fallback groups if API hasn't loaded yet
const FALLBACK_GROUPS = [
  { label: 'Dashboard', items: [{ to: '/', label: 'Home' }] },
  { label: 'Operations', items: [
    { to: '/programs', label: 'Programs' }, { to: '/parties', label: 'Parties' },
    { to: '/professors', label: 'Professors' }, { to: '/locations', label: 'Locations' },
  ]},
];

const BADGE_MAP = {
  '/programs': 'unconfirmedPrograms',
  '/lessons': 'overdueLessons',
};

function SidebarGroup({ group, isOpen, onToggle, badgeCounts }) {
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
              `flex items-center px-3 py-2 rounded text-sm transition-colors ${
                isActive ? 'bg-white/15 text-white font-medium' : 'text-white/70 hover:text-white hover:bg-white/10'
              }`
            }>{item.label}</NavLink>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button type="button" onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
          isActive ? 'text-white/90' : 'text-white/40 hover:text-white/60'
        }`}>
        {group.label}
        <span className="text-[10px]">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && (
        <div className="mt-0.5 space-y-0.5">
          {group.items.map(item => {
            const badgeKey = BADGE_MAP[item.to];
            const count = badgeKey ? (badgeCounts?.[badgeKey] || 0) : 0;
            return (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-between pl-6 pr-3 py-1.5 rounded text-sm transition-colors ${
                    isActive ? 'bg-white/15 text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`
                }>
                {item.label}
                {count > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{count}</span>}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  // Sidebar badge counts
  const { data: countsData } = useQuery({
    queryKey: ['sidebar-counts'],
    queryFn: () => api.get('/sidebar-counts').then(r => r.data),
    staleTime: 60 * 1000,
    enabled: !!user,
  });
  const badgeCounts = countsData?.data || {};

  // Fetch user's accessible tools from DB
  const { data: permData } = useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => api.get('/tools/my-permissions').then(r => r.data),
    staleTime: 2 * 60 * 1000,
  });

  // Build nav groups from API response
  const navGroups = useMemo(() => {
    if (!permData?.data?.length) return FALLBACK_GROUPS;

    const groups = {};
    permData.data.forEach(t => {
      const g = t.nav_group || 'Other';
      if (!groups[g]) groups[g] = { label: g, items: [] };
      groups[g].items.push({ to: t.path, label: t.label });
    });

    // Order groups: Dashboard first, then known order, then rest
    const order = ['Dashboard', 'Operations', 'People', 'Sales', 'Scheduling', 'Curriculum', 'Admin', 'Tools'];
    const sorted = [];
    for (const name of order) {
      if (groups[name]) { sorted.push(groups[name]); delete groups[name]; }
    }
    // Append any remaining
    for (const g of Object.values(groups)) sorted.push(g);
    return sorted;
  }, [permData]);

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = new Set(['Operations']);
    navGroups.forEach(g => {
      if (g.items.some(item => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))) {
        initial.add(g.label);
      }
    });
    return initial;
  });

  const toggleGroup = (label) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  return (
    <div className="w-[220px] min-h-screen bg-[#152a47] flex flex-col fixed left-0 top-0 z-10">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-white font-bold text-base leading-tight">Professor Egghead</div>
        <div className="text-white/50 text-xs mt-0.5">Operations Hub</div>
      </div>

      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        {navGroups.map(group => (
          <SidebarGroup key={group.label} group={group} badgeCounts={badgeCounts}
            isOpen={openGroups.has(group.label)} onToggle={() => toggleGroup(group.label)} />
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        {user && (
          <>
            <div className="text-white text-sm font-medium truncate">{user.name}</div>
            <div className="text-white/50 text-xs capitalize">{user.role?.replace(/_/g, ' ')}</div>
            <button onClick={() => logout()}
              className="mt-2 text-xs text-white/50 hover:text-white transition-colors">Sign out</button>
          </>
        )}
      </div>
    </div>
  );
}
