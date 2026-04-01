import { useEffect } from 'react';

export function UnsavedChangesModal({ when }) {
  // Warn on browser close/refresh
  useEffect(() => {
    if (!when) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);

  // No in-app navigation blocking for now — beforeunload covers browser close/refresh
  return null;
}
