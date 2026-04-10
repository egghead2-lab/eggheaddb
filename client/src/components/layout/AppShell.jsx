import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { GlobalSearch } from './GlobalSearch';
import { BugReportButton } from '../BugReportButton';
import { useAuth } from '../../hooks/useAuth';

export function AppShell({ children }) {
  const { user } = useAuth();
  const hideSearch = ['Professor', 'Candidate'].includes(user?.role);
  const [compact, setCompact] = useState(() => localStorage.getItem('sidebar-compact') === 'true');

  // Listen for storage changes (sidebar toggles compact mode)
  useEffect(() => {
    const handler = () => setCompact(localStorage.getItem('sidebar-compact') === 'true');
    window.addEventListener('storage', handler);
    // Also poll since same-tab storage events don't fire
    const interval = setInterval(handler, 200);
    return () => { window.removeEventListener('storage', handler); clearInterval(interval); };
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className={`flex-1 ${compact ? 'ml-[60px]' : 'ml-[220px]'} min-h-screen overflow-auto bg-gray-50 transition-all duration-200`}>
        {!hideSearch && <GlobalSearch />}
        {children}
      </main>
      <BugReportButton />
    </div>
  );
}
