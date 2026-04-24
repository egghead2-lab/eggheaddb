import { Children } from 'react';
import { useFormContext } from 'react-hook-form';
import { useViewMode } from '../../contexts/ViewModeContext';

function flattenOptions(children) {
  const out = [];
  Children.forEach(children, (c) => {
    if (!c || !c.props) return;
    if (c.type === 'option') out.push(c);
    else if (c.props.children) out.push(...flattenOptions(c.props.children));
  });
  return out;
}

export function Select({ label, error, required, children, className = '', ...props }) {
  const isViewMode = useViewMode();
  const formCtx = useFormContext();

  if (isViewMode) {
    const watched = props.name && formCtx ? formCtx.watch(props.name) : undefined;
    const val = watched ?? props.value ?? props.defaultValue ?? '';
    const options = flattenOptions(children);
    const match = options.find(o => String(o.props.value ?? '') === String(val ?? ''));
    const display = match?.props.children;
    const isEmpty = display === undefined || display === null || display === '' || val === '';
    return (
      <div className="flex flex-col gap-1">
        {label && <label className="text-xs font-medium text-gray-500">{label}</label>}
        <div className="text-sm text-gray-800 py-1.5">
          {isEmpty ? <span className="text-gray-400">—</span> : display}
        </div>
      </div>
    );
  }

  const filteredClassName = className.replace(/\bw-\[?\d+[^\s]*/g, '').trim();
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        required={required}
        className={`block w-auto rounded border text-sm shadow-sm pl-3 pr-8 py-1.5 appearance-none bg-[length:16px_16px] bg-[position:right_0.5rem_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] ${error ? 'border-red-400' : 'border-gray-300'} ${filteredClassName}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
