import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

/**
 * Sticky bar that appears when rows are selected, allowing bulk field updates.
 *
 * @param {{
 *   count: number,
 *   selected: Set<number>,
 *   onClear: () => void,
 *   table: string,           // e.g. 'location', 'program', 'professor'
 *   queryKey: string,        // react-query key to invalidate
 *   fields: Array<{ key: string, label: string, type: 'select'|'toggle'|'text'|'number', options?: Array<{value, label}> }>
 * }} props
 */
export function BulkEditBar({ count, selected, onClear, table, queryKey, fields }) {
  const qc = useQueryClient();
  const [activeFields, setActiveFields] = useState([]);
  const [values, setValues] = useState({});

  const mutation = useMutation({
    mutationFn: (data) => api.put('/bulk-update', data),
    onSuccess: () => {
      qc.invalidateQueries([queryKey]);
      onClear();
      setActiveFields([]);
      setValues({});
    },
  });

  if (count === 0) return null;

  const addField = (key) => {
    if (!activeFields.includes(key)) {
      setActiveFields([...activeFields, key]);
      setValues(prev => ({ ...prev, [key]: '' }));
    }
  };

  const removeField = (key) => {
    setActiveFields(activeFields.filter(k => k !== key));
    setValues(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const handleApply = () => {
    const updates = {};
    activeFields.forEach(key => {
      const field = fields.find(f => f.key === key);
      let val = values[key];
      if (val === '') val = null;
      else if (field?.type === 'toggle') val = val === '1' ? 1 : 0;
      else if (field?.type === 'number' && val !== null) val = Number(val);
      updates[key] = val;
    });
    if (Object.keys(updates).length === 0) return;
    mutation.mutate({ table, ids: [...selected], updates });
  };

  const availableFields = fields.filter(f => !activeFields.includes(f.key));

  return (
    <div className="sticky top-0 z-30 bg-[#1e3a5f] text-white px-6 py-3 shadow-lg flex items-start gap-4 flex-wrap">
      {/* Left: count + clear */}
      <div className="flex items-center gap-3 shrink-0 pt-1">
        <span className="text-sm font-medium">{count} selected</span>
        <button onClick={onClear} className="text-xs text-white/60 hover:text-white underline">Clear</button>
      </div>

      {/* Middle: active field editors */}
      <div className="flex-1 flex flex-wrap gap-2 items-start">
        {activeFields.map(key => {
          const field = fields.find(f => f.key === key);
          if (!field) return null;
          return (
            <div key={key} className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1.5">
              <span className="text-xs font-medium text-white/70">{field.label}:</span>
              {field.type === 'select' && (
                <select value={values[key] || ''} onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                  className="rounded border-0 bg-white/20 text-white text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-white/40 min-w-[120px]">
                  <option value="" className="text-gray-900">Select…</option>
                  {(field.options || []).map(o => (
                    <option key={o.value} value={o.value} className="text-gray-900">{o.label}</option>
                  ))}
                </select>
              )}
              {field.type === 'toggle' && (
                <select value={values[key] || ''} onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                  className="rounded border-0 bg-white/20 text-white text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-white/40">
                  <option value="" className="text-gray-900">Select…</option>
                  <option value="1" className="text-gray-900">Yes</option>
                  <option value="0" className="text-gray-900">No</option>
                </select>
              )}
              {field.type === 'text' && (
                <input value={values[key] || ''} onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="Value…"
                  className="rounded border-0 bg-white/20 text-white text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-white/40 w-32 placeholder-white/40" />
              )}
              {field.type === 'number' && (
                <input type="number" value={values[key] || ''} onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="Value…"
                  className="rounded border-0 bg-white/20 text-white text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-white/40 w-20 placeholder-white/40" />
              )}
              <button onClick={() => removeField(key)} className="text-white/40 hover:text-white text-sm ml-0.5">&times;</button>
            </div>
          );
        })}

        {/* Add field dropdown */}
        {availableFields.length > 0 && (
          <select value="" onChange={e => { if (e.target.value) addField(e.target.value); }}
            className="rounded bg-white/10 border border-white/20 text-white/70 text-xs px-2 py-1.5 focus:outline-none hover:bg-white/20 cursor-pointer">
            <option value="" className="text-gray-900">+ Add field…</option>
            {availableFields.map(f => (
              <option key={f.key} value={f.key} className="text-gray-900">{f.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Right: apply button */}
      <div className="shrink-0 flex items-center gap-2 pt-0.5">
        {mutation.isError && <span className="text-xs text-red-300">{mutation.error?.response?.data?.error || 'Failed'}</span>}
        <button onClick={handleApply}
          disabled={activeFields.length === 0 || mutation.isPending}
          className="bg-white text-[#1e3a5f] font-semibold text-xs px-4 py-1.5 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors">
          {mutation.isPending ? 'Applying…' : `Apply to ${count}`}
        </button>
      </div>
    </div>
  );
}
