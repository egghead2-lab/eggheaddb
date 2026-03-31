export function Spinner({ className = '' }) {
  return (
    <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-[#1e3a5f] ${className}`} style={{ width: 20, height: 20 }} />
  );
}
