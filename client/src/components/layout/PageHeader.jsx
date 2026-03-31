export function PageHeader({ title, action, children }) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {action}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
