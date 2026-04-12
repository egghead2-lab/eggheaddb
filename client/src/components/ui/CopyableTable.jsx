import { useRef } from 'react';
import { CopyTableButton } from './CopyTableButton';

/**
 * Wraps a <table> and adds a "Copy Table" button in the top-right corner.
 * Usage: <CopyableTable>...</CopyableTable> where children includes a <table>.
 */
export function CopyableTable({ children, className = '' }) {
  const ref = useRef(null);

  return (
    <div className={`relative ${className}`}>
      <div className="absolute top-1 right-1 z-10">
        <CopyTableButton tableRef={ref} />
      </div>
      <div ref={ref}>
        {children}
      </div>
    </div>
  );
}
