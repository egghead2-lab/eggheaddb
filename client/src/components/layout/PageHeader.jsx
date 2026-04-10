import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function PageHeader({ title, action, children }) {
  const location = useLocation();
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    try {
      const pins = JSON.parse(localStorage.getItem('sidebar-pins') || '[]');
      setPinned(pins.includes(location.pathname));
    } catch { setPinned(false); }
  }, [location.pathname]);

  const togglePin = () => {
    try {
      const pins = JSON.parse(localStorage.getItem('sidebar-pins') || '[]');
      const next = pinned ? pins.filter(p => p !== location.pathname) : [...pins, location.pathname];
      localStorage.setItem('sidebar-pins', JSON.stringify(next));
      setPinned(!pinned);
      // Trigger sidebar update
      window.dispatchEvent(new Event('storage'));
    } catch {}
  };

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <button onClick={togglePin} title={pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
            className={`text-lg transition-colors ${pinned ? 'text-amber-400 hover:text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}>
            {pinned ? '★' : '☆'}
          </button>
        </div>
        {action}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
