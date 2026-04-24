import { useState, useRef, useEffect } from 'react';
import { useViewMode } from '../../contexts/ViewModeContext';

export function SearchSelect({ label, required, error, value, onChange, options, placeholder = 'Search…', displayKey = 'label', valueKey = 'id' }) {
  const isViewMode = useViewMode();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = options.find(o => String(o[valueKey]) === String(value));
  const filtered = query
    ? options.filter(o => o[displayKey].toLowerCase().includes(query.toLowerCase())).slice(0, 20)
    : [];

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (isViewMode) {
    return (
      <div className="flex flex-col gap-1">
        {label && <label className="text-xs font-medium text-gray-500">{label}</label>}
        <div className="text-sm text-gray-800 py-1.5">
          {selected ? selected[displayKey] : <span className="text-gray-400">—</span>}
        </div>
      </div>
    );
  }

  const handleSelect = (opt) => {
    onChange(String(opt[valueKey]));
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      {label && (
        <label className="text-xs font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {selected && !open ? (
        <div className="flex items-center gap-2 rounded border border-gray-300 px-3 py-1.5 text-sm bg-white">
          <span className="flex-1 truncate">{selected[displayKey]}</span>
          <button type="button" onClick={() => { setOpen(true); setQuery(''); }} className="text-gray-400 hover:text-gray-600 text-xs">change</button>
          <button type="button" onClick={handleClear} className="text-gray-400 hover:text-red-500 text-xs">clear</button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={`block w-full rounded border text-sm shadow-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] ${error ? 'border-red-400' : 'border-gray-300'}`}
          />
          {open && query && filtered.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
              {filtered.map(o => (
                <li
                  key={o[valueKey]}
                  onClick={() => handleSelect(o)}
                  className="px-3 py-1.5 text-sm cursor-pointer hover:bg-[#1e3a5f]/10 truncate"
                >
                  {o[displayKey]}
                </li>
              ))}
            </ul>
          )}
          {open && query && filtered.length === 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-sm text-gray-400">
              No matches
            </div>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
