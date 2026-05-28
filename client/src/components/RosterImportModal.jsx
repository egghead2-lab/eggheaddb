// Roster import modal — drop a CSV/XLSX/pasted-text file, map columns,
// preview the parsed rows, commit via /roster/bulk-import.
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import {
  TARGET_FIELDS, NAME_MODES,
  parseDelimited, parseWorkbook, guessMapping, detectNameMode, buildStudents,
} from '../lib/rosterImport';

export function RosterImportModal({ programId, existingRoster = [], onClose, onSuccess }) {
  const toast = useToast();

  // Step 0: file/paste input → headers + rows
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [pasteText, setPasteText] = useState('');
  const [parseError, setParseError] = useState('');
  const [fileName, setFileName] = useState('');

  // Step 1: mapping
  const [mapping, setMapping] = useState({});

  // Step 2: name format
  const [nameMode, setNameMode] = useState('first_last');

  // Re-run guesses whenever headers change
  useEffect(() => {
    if (headers.length) {
      setMapping(guessMapping(headers));
    } else {
      setMapping({});
    }
  }, [headers]);

  // Auto-detect name mode whenever the "Full Name" column changes
  useEffect(() => {
    if (mapping.full_name) {
      const values = rows.map(r => r[mapping.full_name]).filter(Boolean);
      setNameMode(detectNameMode(values));
    }
  }, [mapping.full_name, rows]);

  const handleFile = async (file) => {
    setParseError(''); setFileName(file.name);
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const buf = await file.arrayBuffer();
        const { headers, rows } = await parseWorkbook(buf);
        if (!rows.length) { setParseError('No data rows found in the workbook.'); return; }
        setHeaders(headers); setRows(rows);
      } else {
        const text = await file.text();
        const { headers, rows } = parseDelimited(text);
        if (!rows.length) { setParseError('No data rows found in the file.'); return; }
        setHeaders(headers); setRows(rows);
      }
    } catch (err) {
      setParseError(err.message || 'Failed to parse file');
    }
  };

  const handlePaste = () => {
    setParseError('');
    if (!pasteText.trim()) { setParseError('Paste something first.'); return; }
    try {
      const { headers, rows } = parseDelimited(pasteText);
      if (!rows.length) { setParseError('Could not detect rows. Make sure the first line is column headers.'); return; }
      setHeaders(headers); setRows(rows); setFileName('(pasted)');
    } catch (err) {
      setParseError(err.message || 'Failed to parse');
    }
  };

  const reset = () => {
    setHeaders([]); setRows([]); setPasteText(''); setMapping({}); setFileName(''); setParseError('');
  };

  // Build student records and tag each with validation flags.
  const existingNameSet = useMemo(() => {
    return new Set(existingRoster
      .filter(r => !r.date_dropped)
      .map(r => `${String(r.first_name || '').toLowerCase().trim()}|${String(r.last_name || '').toLowerCase().trim()}`));
  }, [existingRoster]);

  const students = useMemo(() => {
    if (!rows.length) return [];
    const built = buildStudents(rows, mapping, nameMode);
    // Tag duplicates within the file
    const seen = new Map();
    built.forEach((s, i) => {
      const key = `${s.first_name.toLowerCase().trim()}|${s.last_name.toLowerCase().trim()}`;
      if (!s.first_name) { s._flags = ['missing-name']; return; }
      s._flags = [];
      if (existingNameSet.has(key)) s._flags.push('already-on-roster');
      if (seen.has(key)) s._flags.push('duplicate-in-file');
      seen.set(key, i);
    });
    return built;
  }, [rows, mapping, nameMode, existingNameSet]);

  // Default selection: every row that isn't flagged "missing-name" or already on roster.
  const [included, setIncluded] = useState(new Set());
  useEffect(() => {
    const idx = new Set();
    students.forEach((s, i) => {
      const blocked = s._flags?.includes('missing-name') || s._flags?.includes('already-on-roster');
      if (!blocked) idx.add(i);
    });
    setIncluded(idx);
  }, [students]);

  const toggleRow = (i) => {
    setIncluded(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };
  const toggleAll = () => {
    if (included.size === students.length) setIncluded(new Set());
    else setIncluded(new Set(students.map((_, i) => i)));
  };

  const importMutation = useMutation({
    mutationFn: () => {
      const payload = [...included].map(i => {
        const s = students[i];
        return {
          first_name: s.first_name,
          last_name: s.last_name,
          grade: s.grade,
          parent_name: s.parent_name,
          parent_email: s.parent_email,
          notes: s.notes,
        };
      });
      return api.post(`/programs/${programId}/roster/bulk-import`, { students: payload }).then(r => r.data);
    },
    onSuccess: (res) => {
      const added = res.data?.added || 0;
      const skipped = res.data?.skipped || 0;
      toast.success(`Imported ${added}${skipped ? ` (${skipped} skipped)` : ''}`);
      onSuccess?.(res);
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Import failed'),
  });

  const hasFile = headers.length > 0;
  const fullNameMapped = !!mapping.full_name;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Import Roster from CSV / Excel / Paste</h3>
            {fileName && <p className="text-xs text-gray-500 mt-0.5">{fileName} · {rows.length} rows</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!hasFile ? (
            <UploadStep onFile={handleFile} pasteText={pasteText} setPasteText={setPasteText} onPaste={handlePaste} parseError={parseError} />
          ) : (
            <>
              {/* Mapping */}
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-700">1. Column Mapping</div>
                  <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600">choose a different file</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {TARGET_FIELDS.map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] uppercase tracking-wider text-gray-500 block">{f.label}{f.hint && <span className="normal-case text-gray-400 ml-1">({f.hint})</span>}</label>
                      <select value={mapping[f.key] || ''}
                        onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value || null }))}
                        className="block w-full rounded border border-gray-300 text-sm px-2 py-1 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]">
                        <option value="">— skip —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Name format toggle (only when one Full Name col is in play) */}
              {fullNameMapped && (
                <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
                  <div className="text-sm font-semibold text-gray-700 mb-1">2. Name Format</div>
                  <div className="flex gap-3 items-center text-sm">
                    {NAME_MODES.map(m => (
                      <label key={m.value} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="name_mode" checked={nameMode === m.value}
                          onChange={() => setNameMode(m.value)} className="accent-[#1e3a5f]" />
                        {m.label}
                      </label>
                    ))}
                    <span className="text-xs text-gray-500 ml-2">Preview the table below; flip if names look wrong.</span>
                  </div>
                </div>
              )}

              {/* Preview */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-semibold text-gray-700">{fullNameMapped ? '3.' : '2.'} Preview ({included.size} of {students.length} selected)</div>
                  <div className="text-[10px] text-gray-500">
                    <Legend swatch="bg-red-100 text-red-700">missing name</Legend>
                    <Legend swatch="bg-amber-100 text-amber-700">already on roster</Legend>
                    <Legend swatch="bg-yellow-100 text-yellow-700">duplicate in file</Legend>
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto max-h-80">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 w-8">
                          <input type="checkbox" checked={included.size === students.length && students.length > 0}
                            onChange={toggleAll} className="w-3.5 h-3.5" />
                        </th>
                        <th className="text-left px-2 py-1.5 font-medium text-gray-600">Student Name</th>
                        <th className="text-left px-2 py-1.5 font-medium text-gray-600">Grade</th>
                        <th className="text-left px-2 py-1.5 font-medium text-gray-600">Parent</th>
                        <th className="text-left px-2 py-1.5 font-medium text-gray-600">Parent Email</th>
                        <th className="text-left px-2 py-1.5 font-medium text-gray-600">Notes</th>
                        <th className="text-left px-2 py-1.5 font-medium text-gray-600">Flags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {students.map((s, i) => {
                        const flagCls =
                          s._flags?.includes('missing-name') ? 'bg-red-50' :
                          s._flags?.includes('already-on-roster') ? 'bg-amber-50' :
                          s._flags?.includes('duplicate-in-file') ? 'bg-yellow-50' : '';
                        return (
                          <tr key={i} className={flagCls}>
                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" checked={included.has(i)}
                                onChange={() => toggleRow(i)} className="w-3.5 h-3.5" />
                            </td>
                            <td className="px-2 py-1.5">{`${s.first_name} ${s.last_name}`.trim() || <em className="text-red-500">—</em>}</td>
                            <td className="px-2 py-1.5 text-gray-600">{s.grade ?? ''}</td>
                            <td className="px-2 py-1.5 text-gray-600">{s.parent_name ?? ''}</td>
                            <td className="px-2 py-1.5 text-gray-500 truncate" style={{ maxWidth: '160px' }}>{s.parent_email ?? ''}</td>
                            <td className="px-2 py-1.5 text-gray-500 truncate" style={{ maxWidth: '160px' }}>{s.notes ?? ''}</td>
                            <td className="px-2 py-1.5">
                              {(s._flags || []).map(f => (
                                <span key={f} className={`text-[10px] mr-1 px-1 py-0.5 rounded font-medium ${
                                  f === 'missing-name' ? 'bg-red-100 text-red-700' :
                                  f === 'already-on-roster' ? 'bg-amber-100 text-amber-700' :
                                  'bg-yellow-100 text-yellow-700'
                                }`}>{f}</span>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {hasFile && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-3">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <Button onClick={() => importMutation.mutate()} disabled={included.size === 0 || importMutation.isPending}>
              {importMutation.isPending ? 'Importing…' : `Import ${included.size} Student${included.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ swatch, children }) {
  return <span className="inline-block mr-2"><span className={`inline-block w-3 h-3 rounded-sm align-middle mr-1 ${swatch}`}></span>{children}</span>;
}

function UploadStep({ onFile, pasteText, setPasteText, onPaste, parseError }) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg border border-dashed border-gray-300 p-6 text-center">
        <p className="text-sm text-gray-700 mb-2">Upload a <strong>.csv</strong>, <strong>.xlsx</strong>, or <strong>.xls</strong> file with one student per row.</p>
        <input type="file" accept=".csv,.xlsx,.xls,text/csv"
          onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
          className="block mx-auto text-sm" />
        <p className="text-xs text-gray-400 mt-2">The first row should be column headers (Name, Grade, etc.)</p>
      </div>

      <div className="text-center text-xs text-gray-400">— or —</div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Paste table data</label>
        <p className="text-xs text-gray-500 mb-1">Copy a range from Excel/Google Sheets/an email and paste here. Include the header row.</p>
        <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
          rows={6} placeholder={'Name\tGrade\nJohn Smith\t3\nJane Doe\t4'}
          className="block w-full rounded border border-gray-300 text-sm px-2 py-1.5 font-mono focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        <div className="mt-2">
          <Button size="sm" onClick={onPaste} disabled={!pasteText.trim()}>Parse pasted data</Button>
        </div>
      </div>

      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">{parseError}</div>
      )}
    </div>
  );
}
