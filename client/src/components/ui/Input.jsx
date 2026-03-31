export function Input({ label, error, required, prefix, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {prefix ? (
        <div className="flex rounded border shadow-sm overflow-hidden focus-within:ring-1 focus-within:ring-[#1e3a5f] focus-within:border-[#1e3a5f]" style={{borderColor: error ? '#f87171' : '#d1d5db'}}>
          <span className="flex items-center px-2 text-sm text-gray-500 bg-gray-50 border-r border-gray-300 select-none">{prefix}</span>
          <input
            required={required}
            className={`block w-full text-sm px-3 py-1.5 focus:outline-none ${className}`}
            {...props}
          />
        </div>
      ) : (
        <input
          required={required}
          className={`block w-full rounded border text-sm shadow-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] ${error ? 'border-red-400' : 'border-gray-300'} ${className}`}
          {...props}
        />
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
