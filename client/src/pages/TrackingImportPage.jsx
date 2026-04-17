import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { OrderManagementTabs } from '../components/OrderManagementTabs';
import { Button } from '../components/ui/Button';

export default function TrackingImportPage() {
  const [csvRows, setCsvRows] = useState(null);
  const [fileName, setFileName] = useState('');

  const importMutation = useMutation({
    mutationFn: (rows) => api.post('/materials/tracking/import', { rows }).then(r => r.data),
  });

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { setCsvRows([]); return; }
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      const orderIdx = headers.findIndex(h => h.toLowerCase().includes('ordernumber') || h.toLowerCase() === 'order number');
      const trackIdx = headers.findIndex(h => h.toLowerCase().includes('trackingnumber') || h.toLowerCase() === 'tracking number');
      if (orderIdx < 0 || trackIdx < 0) { alert('CSV must have OrderNumber and TrackingNumber columns'); return; }

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
        if (cols[orderIdx] && cols[trackIdx]) {
          rows.push({ OrderNumber: cols[orderIdx], TrackingNumber: cols[trackIdx] });
        }
      }
      setCsvRows(rows);
    };
    reader.readAsText(file);
  };

  const result = importMutation.data;

  return (
    <AppShell>
      <OrderManagementTabs />

      <div className="p-6 max-w-3xl">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Upload Inflow Tracking CSV</h3>
          <p className="text-sm text-gray-500 mb-4">
            Upload the tracking export from Inflow. The system will match OrderNumber to existing shipment orders and attach tracking numbers.
          </p>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#1e3a5f]/40 transition-colors">
            <input type="file" accept=".csv" onChange={handleFile} className="hidden" id="tracking-csv" />
            <label htmlFor="tracking-csv" className="cursor-pointer">
              <div className="text-gray-400 mb-2">
                <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="text-sm text-gray-600 font-medium">{fileName || 'Click to select CSV file'}</div>
              <div className="text-xs text-gray-400 mt-1">Must contain OrderNumber and TrackingNumber columns</div>
            </label>
          </div>

          {csvRows && (
            <div className="mt-4">
              <div className="text-sm text-gray-700 mb-2"><strong>{csvRows.length}</strong> tracking entries found</div>

              {csvRows.length > 0 && (
                <>
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded mb-3">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium text-gray-600">Order Number</th>
                          <th className="text-left px-3 py-1.5 font-medium text-gray-600">Tracking Number</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {csvRows.slice(0, 50).map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1 text-gray-800">{r.OrderNumber}</td>
                            <td className="px-3 py-1 text-gray-600 font-mono">{r.TrackingNumber}</td>
                          </tr>
                        ))}
                        {csvRows.length > 50 && <tr><td colSpan={2} className="px-3 py-1 text-gray-400 text-center">...and {csvRows.length - 50} more</td></tr>}
                      </tbody>
                    </table>
                  </div>

                  <Button onClick={() => importMutation.mutate(csvRows)} disabled={importMutation.isPending}>
                    {importMutation.isPending ? 'Importing...' : `Import ${csvRows.length} Tracking Numbers`}
                  </Button>
                </>
              )}

              {result && (
                <div className="mt-4 p-4 rounded-lg border bg-gray-50">
                  <div className="text-sm font-medium text-gray-900">Import Results</div>
                  <div className="text-sm text-green-600 mt-1"><strong>{result.matched}</strong> matched and updated</div>
                  {result.unmatched > 0 && (
                    <div className="mt-2">
                      <div className="text-sm text-red-600"><strong>{result.unmatched}</strong> unmatched orders:</div>
                      <div className="text-xs text-red-500 mt-1 max-h-32 overflow-y-auto">
                        {result.unmatchedOrders?.map((o, i) => <div key={i}>{o}</div>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
