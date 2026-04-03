import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

const TYPE_MAP = {
  program: { path: '/programs', icon: 'P', color: 'bg-blue-100 text-blue-700' },
  professor: { path: '/professors', icon: 'Pr', color: 'bg-green-100 text-green-700' },
  location: { path: '/locations', icon: 'L', color: 'bg-orange-100 text-orange-700' },
  student: { path: '/students', icon: 'S', color: 'bg-purple-100 text-purple-700' },
  contractor: { path: '/contractors', icon: 'C', color: 'bg-amber-100 text-amber-700' },
};

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (val) => {
    setQuery(val);
    if (val.length < 2) { setResults([]); setOpen(false); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get('/search', { params: { q: val } });
        setResults(res.data.data || []);
        setOpen(true);
      } catch { setResults([]); }
      setSearching(false);
    }, 200);
  };

  const handleSelect = (item) => {
    const t = TYPE_MAP[item.type];
    if (t) navigate(`${t.path}/${item.id}`);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <div className="bg-white border-b border-gray-100 px-6 py-2">
        <input
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search programs, professors, locations, students…"
          className="w-full max-w-md rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] bg-gray-50"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-6 z-30 mt-0 w-full max-w-md bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {results.map((r, i) => {
            const t = TYPE_MAP[r.type] || {};
            return (
              <button key={`${r.type}-${r.id}`} onClick={() => handleSelect(r)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold ${t.color || 'bg-gray-100 text-gray-600'}`}>{t.icon || '?'}</span>
                <span className="text-sm text-gray-800 flex-1 truncate">{r.name}</span>
                <span className="text-[10px] text-gray-400 capitalize">{r.type}</span>
              </button>
            );
          })}
        </div>
      )}
      {open && query.length >= 2 && results.length === 0 && !searching && (
        <div className="absolute top-full left-6 z-30 mt-0 w-full max-w-md bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm text-gray-400">
          No results found
        </div>
      )}
    </div>
  );
}
