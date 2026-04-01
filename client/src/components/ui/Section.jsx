import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

export function Section({ title, children, defaultOpen = false, className = '', overflow = 'hidden' }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`border border-gray-200 rounded-lg overflow-${overflow} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <span className="font-semibold text-sm text-gray-800">{title}</span>
        {open
          ? <ChevronDownIcon className="w-4 h-4 text-gray-500" />
          : <ChevronRightIcon className="w-4 h-4 text-gray-500" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}
