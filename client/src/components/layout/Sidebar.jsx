import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/programs', label: 'Programs' },
  { to: '/professors', label: 'Professors' },
  { to: '/locations', label: 'Locations' },
  { to: '/parties', label: 'Parties' },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  return (
    <div className="w-[220px] min-h-screen bg-[#152a47] flex flex-col fixed left-0 top-0 z-10">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-white font-bold text-base leading-tight">Professor Egghead</div>
        <div className="text-white/50 text-xs mt-0.5">Science Academy</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center px-3 py-2 rounded text-sm transition-colors ${
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-white/10">
        {user && (
          <>
            <div className="text-white text-sm font-medium truncate">{user.name}</div>
            <div className="text-white/50 text-xs capitalize">{user.role?.replace(/_/g, ' ')}</div>
            <button
              onClick={() => logout()}
              className="mt-2 text-xs text-white/50 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
