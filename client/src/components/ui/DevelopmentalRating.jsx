// Developmental Rating Scale — used across observations, evaluations, professor pages
// Stores as 1-5 numeric for calculations, displays as named scale

const SCALE = [
  { value: 1, label: 'Emerging', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 2, label: 'Developing', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 3, label: 'Performing', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 4, label: 'Excelling', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 5, label: 'Distinguished', color: 'bg-blue-100 text-blue-700 border-blue-300' },
];

export function ratingLabel(num) {
  if (!num) return null;
  const r = Math.round(Number(num));
  return SCALE.find(s => s.value === r)?.label || null;
}

export function ratingColor(num) {
  if (!num) return '';
  const r = Math.round(Number(num));
  return SCALE.find(s => s.value === r)?.color || 'bg-gray-100 text-gray-600';
}

export function RatingBadge({ rating, size = 'sm' }) {
  if (!rating && rating !== 0) return <span className="text-gray-300 text-xs">—</span>;
  const r = Math.round(Number(rating));
  const item = SCALE.find(s => s.value === r);
  if (!item) return <span className="text-gray-300 text-xs">—</span>;
  const sizeClass = size === 'xs' ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5';
  return (
    <span className={`inline-flex items-center rounded border font-bold ${sizeClass} ${item.color}`}>
      {item.label}
    </span>
  );
}

export function RatingPicker({ value, onChange, label }) {
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-xs text-gray-600 w-32 shrink-0">{label}</span>}
      {SCALE.map(r => (
        <button key={r.value} type="button" onClick={() => onChange(r.value)}
          title={r.label}
          className={`w-7 h-7 rounded text-xs font-bold border transition-all ${
            value === r.value ? `${r.color} ring-2 ring-offset-1 ring-current` : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
          }`}>{r.value}</button>
      ))}
    </div>
  );
}

export function RatingLegend() {
  return (
    <div className="flex gap-2 text-[10px]">
      {SCALE.map(r => (
        <span key={r.value} className={`px-1.5 py-0.5 rounded border ${r.color}`}>{r.value} = {r.label}</span>
      ))}
    </div>
  );
}

export { SCALE as RATING_SCALE };
