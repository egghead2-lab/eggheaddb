import { createContext, useContext, useState, useCallback, useMemo } from 'react';

// Lightweight global toast system. Replaces browser alert() with non-blocking
// stack-of-pills in the corner. Usage: const toast = useToast(); toast.error('Save failed');
const ToastContext = createContext({ show: () => {}, success: () => {}, error: () => {}, info: () => {} });

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);
  const show = useCallback((msg, type = 'info', ms = 4000) => {
    const id = nextId++;
    setToasts(t => [...t, { id, msg, type }]);
    if (ms > 0) setTimeout(() => remove(id), ms);
  }, [remove]);

  // Memoized so consumers can safely depend on `toast` in useEffect/useCallback.
  const api = useMemo(() => ({
    show,
    success: (m, ms) => show(m, 'success', ms),
    error: (m, ms) => show(m, 'error', ms ?? 6000),
    info: (m, ms) => show(m, 'info', ms),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} onClick={() => remove(t.id)}
            className={`pointer-events-auto px-4 py-2 rounded-lg shadow-lg text-sm font-medium cursor-pointer transition-all ${
              t.type === 'error' ? 'bg-red-600 text-white' :
              t.type === 'success' ? 'bg-emerald-600 text-white' :
              'bg-[#1e3a5f] text-white'
            }`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
