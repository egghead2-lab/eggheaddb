import { STATUS_COLORS } from '../../lib/constants';

const FALLBACK_COLORS = [
  'bg-rose-100 text-rose-800',
  'bg-fuchsia-100 text-fuchsia-800',
  'bg-cyan-100 text-cyan-800',
  'bg-lime-100 text-lime-800',
  'bg-yellow-100 text-yellow-800',
  'bg-stone-100 text-stone-800',
  'bg-teal-100 text-teal-800',
  'bg-violet-100 text-violet-800',
];

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

export function Badge({ status, className = '' }) {
  const color = STATUS_COLORS[status] || hashColor(status || '');
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color} ${className}`}>
      {status}
    </span>
  );
}
