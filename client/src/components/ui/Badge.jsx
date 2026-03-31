import { STATUS_COLORS } from '../../lib/constants';

export function Badge({ status, className = '' }) {
  const color = STATUS_COLORS[status] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color} ${className}`}>
      {status}
    </span>
  );
}
