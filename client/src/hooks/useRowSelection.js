import { useState, useCallback, useMemo } from 'react';

/**
 * Hook for managing row selection with select-all support.
 *
 * @param {Array} rows - The current page of rows (must have .id)
 * @returns {{ selected, toggle, toggleAll, clearAll, isSelected, isAllSelected, count }}
 */
export function useRowSelection(rows) {
  const [selected, setSelected] = useState(new Set());

  const toggle = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected(prev => {
      const allIds = rows.map(r => r.id);
      const allSelected = allIds.length > 0 && allIds.every(id => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }, [rows]);

  const clearAll = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id) => selected.has(id), [selected]);

  const isAllSelected = useMemo(() => {
    return rows.length > 0 && rows.every(r => selected.has(r.id));
  }, [rows, selected]);

  const count = selected.size;

  return { selected, toggle, toggleAll, clearAll, isSelected, isAllSelected, count };
}
