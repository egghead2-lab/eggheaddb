import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

/**
 * Hook for per-user column visibility preferences.
 *
 * @param {string} pageKey - Unique key for the page (e.g. 'programs', 'locations')
 * @param {Array<{key: string, label: string, default?: boolean}>} allColumns - All available columns
 * @returns {{ visibleKeys: string[], setVisibleKeys: (keys: string[]) => void, isColumnVisible: (key: string) => boolean, allColumns }}
 */
export function useColumnPrefs(pageKey, allColumns) {
  const qc = useQueryClient();
  const defaultKeys = allColumns.filter(c => c.default !== false).map(c => c.key);

  const { data } = useQuery({
    queryKey: ['column-prefs', pageKey],
    queryFn: () => api.get(`/column-prefs/${pageKey}`).then(r => r.data),
    staleTime: Infinity,
  });

  const [visibleKeys, setVisibleKeysLocal] = useState(defaultKeys);

  useEffect(() => {
    if (data?.data) {
      // Filter to only keys that still exist in allColumns
      const validKeys = data.data.filter(k => allColumns.some(c => c.key === k));
      if (validKeys.length > 0) setVisibleKeysLocal(validKeys);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (columns) => api.put(`/column-prefs/${pageKey}`, { columns }),
    onSuccess: () => qc.invalidateQueries(['column-prefs', pageKey]),
  });

  const setVisibleKeys = useCallback((keys) => {
    setVisibleKeysLocal(keys);
    saveMutation.mutate(keys);
  }, [saveMutation]);

  const isColumnVisible = useCallback((key) => visibleKeys.includes(key), [visibleKeys]);

  const resetToDefaults = useCallback(() => {
    setVisibleKeysLocal(defaultKeys);
    saveMutation.mutate(defaultKeys);
  }, [defaultKeys, saveMutation]);

  return { visibleKeys, setVisibleKeys, isColumnVisible, allColumns, resetToDefaults };
}
