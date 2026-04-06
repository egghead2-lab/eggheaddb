import { useState, useRef, useEffect } from 'react';

/**
 * Gear icon that opens a dropdown checklist for showing/hiding table columns.
 *
 * @param {{ visibleKeys: string[], setVisibleKeys: (keys: string[]) => void, allColumns: Array<{key: string, label: string}>, resetToDefaults: () => void }} props
 */
export function ColumnPicker({ visibleKeys, setVisibleKeys, allColumns, resetToDefaults }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (key) => {
    const next = visibleKeys.includes(key)
      ? visibleKeys.filter(k => k !== key)
      : [...visibleKeys, key];
    // Don't allow hiding all columns
    if (next.length === 0) return;
    setVisibleKeys(next);
  };

  const visibleCount = visibleKeys.length;
  const totalCount = allColumns.length;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)}
        className={`p-1.5 rounded transition-colors ${open ? 'bg-gray-200 text-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
        title="Show/hide columns">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 w-56 max-h-80 overflow-y-auto">
          <div className="px-3 pb-2 mb-1 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Columns ({visibleCount}/{totalCount})
            </span>
            <button onClick={resetToDefaults}
              className="text-[11px] text-gray-400 hover:text-[#1e3a5f] hover:underline">
              Reset
            </button>
          </div>
          {allColumns.map(col => (
            <label key={col.key}
              className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer select-none">
              <input type="checkbox" checked={visibleKeys.includes(col.key)}
                onChange={() => toggle(col.key)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
              <span className="text-xs text-gray-700">{col.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
