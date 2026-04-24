import { useRef } from 'react';
import { CopyTableButton } from './CopyTableButton';

/**
 * Wraps a <table> and adds a "Copy Table" button in the top-right corner.
 * Usage: <CopyableTable>...</CopyableTable> where children includes a <table>.
 */
export function CopyableTable({ children, className = '' }) {
  const ref = useRef(null);

  return (
    <div className={className}>
      <div className="flex justify-end mb-1">
        <CopyTableButton tableRef={ref} />
      </div>
      <div ref={ref} className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
