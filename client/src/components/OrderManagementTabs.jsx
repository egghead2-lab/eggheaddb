import { useLocation, Link } from 'react-router-dom';

const TABS = [
  { path: '/materials/orders', label: 'Cycles' },
  { path: '/materials/orders/builder', label: 'Order Builder' },
  { path: '/materials/orders/shipments', label: 'Shipments' },
  { path: '/materials/orders/tracking', label: 'Tracking Import' },
];

export function OrderManagementTabs() {
  const { pathname } = useLocation();

  return (
    <div className="bg-white border-b border-gray-200 px-6 pt-4 pb-0">
      <h1 className="text-xl font-bold text-gray-900 mb-3">Order Management</h1>
      <div className="flex gap-1">
        {TABS.map(t => {
          const isActive = t.path === '/materials/orders'
            ? pathname === '/materials/orders' || pathname === '/materials/orders/'
            : pathname.startsWith(t.path);
          return (
            <Link key={t.path} to={t.path}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-[#1e3a5f] text-[#1e3a5f]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
