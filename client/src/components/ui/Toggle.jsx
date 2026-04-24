import { useViewMode } from '../../contexts/ViewModeContext';

export function Toggle({ label, checked, onChange, disabled = false }) {
  const isViewMode = useViewMode();

  if (isViewMode) {
    return (
      <div className="flex flex-col gap-1">
        {label && <label className="text-xs font-medium text-gray-500">{label}</label>}
        <div className="text-sm py-1.5">
          <span className={checked ? 'text-emerald-600 font-medium' : 'text-gray-400'}>{checked ? 'Yes' : 'No'}</span>
        </div>
      </div>
    );
  }

  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div className="relative">
        <input type="checkbox" className="sr-only" checked={!!checked} onChange={e => onChange(e.target.checked)} disabled={disabled} />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-[#1e3a5f]' : 'bg-gray-300'} ${disabled ? 'opacity-50' : ''}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  );
}
