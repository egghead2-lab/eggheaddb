export function SortTh({ col, sort, dir, onSort, children, className = '', align = 'left' }) {
  const active = sort === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`text-${align} px-4 py-3 font-semibold text-gray-700 cursor-pointer select-none hover:text-gray-900 whitespace-nowrap ${className}`}
    >
      {children}
      <span className="ml-1 text-gray-400">{active ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  );
}
