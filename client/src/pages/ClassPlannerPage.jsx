import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import api from '../api/client';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const COLUMNS = [
  { key: 'nickname',  label: 'Nickname',  sortable: false },
  { key: 'time',      label: 'Time',      sortable: true },
  { key: 'location',  label: 'Location',  sortable: true },
  { key: 'className', label: 'Class',     sortable: true },
  { key: 'professor', label: 'Professor', sortable: true },
  { key: 'dateRange', label: 'Dates',     sortable: true },
  { key: 'enrolled',  label: 'Enrolled',  sortable: true },
  { key: 'status',    label: 'Status',    sortable: true },
];

const CATEGORY_STYLES = {
  robotics:    { cell: 'bg-blue-50',    badge: 'bg-blue-100 text-blue-700' },
  engineering: { cell: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700' },
  science:     { cell: 'bg-violet-50',  badge: 'bg-violet-100 text-violet-700' },
  finlit:      { cell: 'bg-amber-50',   badge: 'bg-amber-100 text-amber-700' },
  mix:         { cell: 'bg-orange-50',  badge: 'bg-orange-100 text-orange-700' },
};

function copyTable(data, visibleCols) {
  const cols = COLUMNS.filter(c => visibleCols.has(c.key));
  const headers = ['Day', ...cols.map(c => c.label)];
  const htmlRows = [];
  const textRows = [headers.join('\t')];

  for (const day of DAYS) {
    for (const r of data[day] || []) {
      const cells = cols.map(c => String(r[c.key] ?? ''));
      htmlRows.push(
        `<tr><td style="border:1px solid #ccc;padding:4px 6px;font-weight:600">${day}</td>` +
        cells.map(v => `<td style="border:1px solid #ccc;padding:4px 6px">${v}</td>`).join('') +
        '</tr>'
      );
      textRows.push([day, ...cells].join('\t'));
    }
  }

  const headerHtml = headers
    .map(h => `<th style="border:1px solid #ccc;padding:4px 6px;background:#eaf2fb;text-align:left">${h}</th>`)
    .join('');
  const html = `<table style="border-collapse:collapse;font-family:Arial;font-size:12px"><thead><tr>${headerHtml}</tr></thead><tbody>${htmlRows.join('')}</tbody></table>`;
  const text = textRows.join('\n');

  if (navigator.clipboard && window.ClipboardItem) {
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })
    ]).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }
}

export default function ClassPlannerPage() {
  const [contractor, setContractor] = useState('');
  const [area, setArea] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const [sortState, setSortState] = useState({});
  const [visibleCols, setVisibleCols] = useState(new Set(COLUMNS.map(c => c.key)));

  // Load filter options
  const { data: filterData } = useQuery({
    queryKey: ['planner-filters'],
    queryFn: () => api.get('/planner/filters').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const contractors = filterData?.contractors || [];
  const areas = filterData?.areas || [];

  // Fetch planner data
  const canSearch = startDate && endDate && (contractor || area);
  const { data: plannerData, isLoading, error } = useQuery({
    queryKey: ['planner', contractor, area, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (contractor) params.set('contractor', contractor);
      if (area) params.set('area', area);
      return api.get(`/planner?${params}`).then(r => r.data);
    },
    enabled: hasSearched && !!canSearch,
  });
  const data = plannerData?.data || null;

  const handleGenerate = useCallback(() => {
    if (!canSearch) return;
    setHasSearched(true);
    setSortState({});
  }, [canSearch]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleGenerate();
  };

  // Per-day sorting
  const sortedData = useMemo(() => {
    if (!data) return null;
    const out = {};
    for (const day of DAYS) {
      const entries = data[day] || [];
      const s = sortState[day];
      if (!s) {
        out[day] = entries;
      } else {
        out[day] = [...entries].sort((a, b) => {
          const av = String(a[s.col] ?? '');
          const bv = String(b[s.col] ?? '');
          return s.dir === 'asc'
            ? av.localeCompare(bv, undefined, { numeric: true })
            : bv.localeCompare(av, undefined, { numeric: true });
        });
      }
    }
    return out;
  }, [data, sortState]);

  function handleSort(day, col) {
    setSortState(prev => {
      const cur = prev[day];
      const dir = cur?.col === col && cur.dir === 'asc' ? 'desc' : 'asc';
      return { ...prev, [day]: { col, dir } };
    });
  }

  function toggleCol(key) {
    setVisibleCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function handleCopy() {
    if (!sortedData) return;
    copyTable(sortedData, visibleCols);
    setCopyMsg('Copied!');
    setTimeout(() => setCopyMsg(''), 2000);
  }

  const activeCols = COLUMNS.filter(c => visibleCols.has(c.key));
  const maxRows = sortedData
    ? Math.max(0, ...DAYS.map(d => sortedData[d]?.length ?? 0))
    : 0;
  const totalEntries = sortedData
    ? DAYS.reduce((n, d) => n + (sortedData[d]?.length ?? 0), 0)
    : 0;

  return (
    <AppShell>
      <PageHeader title="Class Planner" subtitle="View class schedules by contractor, area, and date range" />
      <div className="p-6 max-w-[1800px]">
        {/* Filter card */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-5">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contractor</label>
              <select value={contractor} onChange={e => setContractor(e.target.value)} onKeyDown={handleKeyDown}
                className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30">
                <option value="">All Contractors</option>
                {contractors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Area</label>
              <select value={area} onChange={e => setArea(e.target.value)} onKeyDown={handleKeyDown}
                className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30">
                <option value="">All Areas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} onKeyDown={handleKeyDown}
                className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} onKeyDown={handleKeyDown}
                className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
            </div>

            <Button onClick={handleGenerate} disabled={isLoading || !canSearch}>
              {isLoading ? 'Loading...' : 'Generate'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error.response?.data?.error || 'Failed to load planner data'}
          </div>
        )}

        {hasSearched && !isLoading && sortedData && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-800">{totalEntries}</span> class slots across{' '}
                  <span className="font-semibold text-gray-800">
                    {DAYS.filter(d => (sortedData[d]?.length ?? 0) > 0).length}
                  </span> days
                </span>

                <div className="flex items-center gap-2">
                  {Object.entries(CATEGORY_STYLES).map(([cat, styles]) => (
                    <span key={cat} className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles.badge}`}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                  {COLUMNS.filter(c => c.key !== 'nickname').map(c => (
                    <label key={c.key} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
                      <input type="checkbox" checked={visibleCols.has(c.key)}
                        onChange={() => toggleCol(c.key)} className="rounded border-gray-300 text-[#1e3a5f]" />
                      {c.label}
                    </label>
                  ))}
                </div>

                <button onClick={handleCopy}
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
                  {copyMsg || 'Copy Table'}
                </button>
              </div>
            </div>

            {/* Table */}
            {maxRows === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-16 text-center">
                <p className="font-medium text-gray-500">No classes found for this period</p>
                <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or date range.</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      {/* Day header row */}
                      <tr>
                        {DAYS.map(day => {
                          const count = sortedData[day]?.length ?? 0;
                          return (
                            <th key={day} colSpan={activeCols.length}
                              className="px-3 py-2 bg-gray-100 border border-gray-200 text-center text-xs font-bold text-gray-700 whitespace-nowrap">
                              {day}
                              {count > 0 && <span className="ml-1.5 text-gray-400 font-normal">({count})</span>}
                            </th>
                          );
                        })}
                      </tr>
                      {/* Sub-column header row */}
                      <tr>
                        {DAYS.flatMap(day =>
                          activeCols.map(col => {
                            const s = sortState[day];
                            const isActive = s?.col === col.key;
                            return (
                              <th key={`${day}-${col.key}`}
                                onClick={() => col.sortable ? handleSort(day, col.key) : undefined}
                                className={`px-2 py-1.5 bg-gray-50 border border-gray-200 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${col.sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}`}>
                                {col.label}
                                {col.sortable && (
                                  <span className={`ml-1 ${isActive ? 'text-[#1e3a5f]' : 'text-gray-300'}`}>
                                    {isActive ? (s?.dir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}
                                  </span>
                                )}
                              </th>
                            );
                          })
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {Array.from({ length: maxRows }, (_, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                          {DAYS.flatMap(day => {
                            const entry = sortedData[day]?.[i];
                            return activeCols.map(col => {
                              const catStyle = entry?.category ? CATEGORY_STYLES[entry.category] : null;

                              if (!entry) {
                                return (
                                  <td key={`${day}-${col.key}`} className="border border-gray-100 px-2 py-1.5 text-gray-200">
                                    —
                                  </td>
                                );
                              }

                              const value = entry[col.key] ?? '';

                              return (
                                <td key={`${day}-${col.key}`}
                                  className={`border border-gray-100 px-2 py-1.5 whitespace-nowrap align-top ${catStyle ? catStyle.cell : ''}`}>
                                  {col.key === 'nickname' ? (
                                    <span className="flex items-center gap-1.5">
                                      <Link to={`/programs/${entry.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                                        {value}
                                      </Link>
                                      {entry.dayBadge && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-200 text-gray-500">
                                          {entry.dayBadge}
                                        </span>
                                      )}
                                    </span>
                                  ) : col.key === 'enrolled' ? (
                                    <span className={`text-xs font-medium ${
                                      entry.enrolled < entry.minimum ? 'text-red-600' :
                                      entry.enrolled >= entry.maximum ? 'text-green-600' : 'text-gray-600'
                                    }`}>
                                      {entry.enrolled}
                                      {entry.minimum ? <span className="text-gray-400">/{entry.minimum}</span> : ''}
                                    </span>
                                  ) : col.key === 'status' ? (
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                      value === 'Confirmed' ? 'bg-green-100 text-green-700' :
                                      value === 'Unconfirmed' ? 'bg-amber-100 text-amber-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>{value}</span>
                                  ) : (
                                    <span className="text-gray-600">{value || <span className="text-gray-300">—</span>}</span>
                                  )}
                                </td>
                              );
                            });
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {!hasSearched && !isLoading && (
          <div className="mt-8 text-center text-gray-400">
            <p className="font-medium text-gray-500">Select a contractor or area and a date range to generate the planner</p>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
        )}
      </div>
    </AppShell>
  );
}
