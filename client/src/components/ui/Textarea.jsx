import { useFormContext } from 'react-hook-form';
import { useViewMode } from '../../contexts/ViewModeContext';

export function Textarea({ label, rows = 2, className = '', ...props }) {
  const isViewMode = useViewMode();
  const formCtx = useFormContext();

  if (isViewMode) {
    const watched = props.name && formCtx ? formCtx.watch(props.name) : undefined;
    const val = watched ?? props.value ?? props.defaultValue ?? '';
    const isEmpty = !val || String(val).trim() === '';
    return (
      <div className="flex flex-col gap-1">
        {label && <label className="text-xs font-medium text-gray-500">{label}</label>}
        <div className="text-sm text-gray-800 whitespace-pre-wrap py-1">
          {isEmpty ? <span className="text-gray-400">—</span> : String(val)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-gray-700">{label}</label>}
      <textarea rows={rows}
        className={`block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] ${className}`}
        {...props} />
    </div>
  );
}
