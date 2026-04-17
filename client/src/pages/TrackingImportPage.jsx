import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { OrderManagementTabs } from '../components/OrderManagementTabs';
import { Button } from '../components/ui/Button';

// Parse CSV handling quoted fields with commas
function parseCSV(text) {
  const rows = [];
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.length > 0 || lines.length > 0) { lines.push(current); current = ''; }
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (lines.length > 0) { rows.push(lines.splice(0)); }
    } else if (ch === ',' && !inQuotes) {
      lines.push(current); current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0) lines.push(current);
  if (lines.length > 0) rows.push(lines);
  return rows;
}

export default function TrackingImportPage() {
  const [csvData, setCsvData] = useState(null); // { headers, orders: Map<orderNum, {tracking, products}> }
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
      const text = ev.target.result.replace(/^\uFEFF/, ''); // strip BOM
      const parsed = parseCSV(text);
      if (parsed.length < 2) { setCsvData({ headers: [], orders: new Map() }); return; }

      const headers = parsed[0].map(h => h.trim());
      const orderIdx = headers.findIndex(h => h === 'OrderNumber');
      const trackIdx = headers.findIndex(h => h === 'ShippingTrackingNumber' || h === 'TrackingNumber');
      const productIdx = headers.findIndex(h => h === 'ProductName');
      const productQtyIdx = headers.findIndex(h => h === 'ProductQuantity');
      const productSkuIdx = headers.findIndex(h => h === 'ProductSKU');

      if (orderIdx < 0) {
        setCsvData({ error: 'CSV must have an OrderNumber column' });
        return;
      }

      // Group by order, extract tracking + products
      const orders = new Map();
      const allRows = [];
      for (let i = 1; i < parsed.length; i++) {
        const cols = parsed[i];
        const orderNum = (cols[orderIdx] || '').trim();
        if (!orderNum) continue;

        const tracking = trackIdx >= 0 ? (cols[trackIdx] || '').trim() : '';
        const product = productIdx >= 0 ? (cols[productIdx] || '').trim() : '';
        const qty = productQtyIdx >= 0 ? (cols[productQtyIdx] || '').trim() : '';
        const sku = productSkuIdx >= 0 ? (cols[productSkuIdx] || '').trim() : '';

        if (!orders.has(orderNum)) {
          orders.set(orderNum, { tracking: '', products: [], trackingNumbers: [] });
        }
        const entry = orders.get(orderNum);
        if (tracking && !entry.tracking) {
          entry.tracking = tracking;
          entry.trackingNumbers = tracking.split(',').map(t => t.trim()).filter(Boolean);
        }
        if (product) entry.products.push({ name: product, qty, sku });

        allRows.push({ OrderNumber: orderNum, ShippingTrackingNumber: tracking, ProductName: product, ProductQuantity: qty, ProductSKU: sku });
      }

      setCsvData({ headers, orders, allRows });
    };
    reader.readAsText(file);
  };

  const result = importMutation.data;
  const orders = csvData?.orders;
  const ordersArray = orders ? [...orders.entries()] : [];

  return (
    <AppShell>
      <OrderManagementTabs />

      <div className="p-6 max-w-4xl">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Import Inflow Sales Order CSV</h3>
          <p className="text-sm text-gray-500 mb-4">
            Upload the sales order export from Inflow. The system will match by OrderNumber, extract tracking numbers, and mark orders as shipped.
          </p>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#1e3a5f]/40 transition-colors">
            <input type="file" accept=".csv" onChange={handleFile} className="hidden" id="tracking-csv" />
            <label htmlFor="tracking-csv" className="cursor-pointer">
              <div className="text-gray-400 mb-2">
                <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="text-sm text-gray-600 font-medium">{fileName || 'Click to select Inflow CSV'}</div>
              <div className="text-xs text-gray-400 mt-1">Inflow Sales Order export with OrderNumber and ShippingTrackingNumber</div>
            </label>
          </div>

          {csvData?.error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{csvData.error}</div>
          )}

          {orders && orders.size > 0 && (
            <div className="mt-4">
              <div className="text-sm text-gray-700 mb-3">
                <strong>{orders.size}</strong> unique orders found with <strong>{ordersArray.reduce((s, [, v]) => s + v.products.length, 0)}</strong> total line items
              </div>

              {/* Preview */}
              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded mb-4">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600">Order</th>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600">Items</th>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600">Tracking</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ordersArray.slice(0, 50).map(([orderNum, data]) => (
                      <tr key={orderNum}>
                        <td className="px-3 py-1.5 font-medium text-gray-800 whitespace-nowrap">{orderNum}</td>
                        <td className="px-3 py-1.5 text-gray-600">
                          {data.products.map((p, i) => (
                            <span key={i}>{i > 0 && ', '}{p.name}{parseFloat(p.qty) > 1 ? ` (${p.qty})` : ''}</span>
                          ))}
                        </td>
                        <td className="px-3 py-1.5 text-gray-500 font-mono">
                          {data.trackingNumbers.length > 0 ? (
                            <div>{data.trackingNumbers.map((t, i) => <div key={i}>{t}</div>)}</div>
                          ) : <span className="text-gray-300">none</span>}
                        </td>
                      </tr>
                    ))}
                    {ordersArray.length > 50 && (
                      <tr><td colSpan={3} className="px-3 py-1.5 text-center text-gray-400">...and {ordersArray.length - 50} more</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Button onClick={() => importMutation.mutate(csvData.allRows)} disabled={importMutation.isPending}>
                {importMutation.isPending ? 'Importing...' : `Import ${orders.size} Orders`}
              </Button>

              {result && (
                <div className="mt-4 p-4 rounded-lg border bg-gray-50 space-y-2">
                  <div className="text-sm font-medium text-gray-900">Import Results ({result.totalOrders} orders processed)</div>
                  <div className="text-sm text-green-600"><strong>{result.matched}</strong> matched and tracking assigned</div>
                  {result.skipped > 0 && (
                    <div>
                      <div className="text-sm text-amber-600"><strong>{result.skipped}</strong> skipped (already have tracking)</div>
                      <div className="text-xs text-amber-500 mt-1 max-h-20 overflow-y-auto">
                        {result.skippedOrders?.map((o, i) => <div key={i}>{o}</div>)}
                      </div>
                    </div>
                  )}
                  {result.notFound > 0 && (
                    <div>
                      <div className="text-sm text-red-600"><strong>{result.notFound}</strong> not found in system:</div>
                      <div className="text-xs text-red-500 mt-1 max-h-32 overflow-y-auto">
                        {result.notFoundOrders?.map((o, i) => <div key={i}>{o}</div>)}
                      </div>
                    </div>
                  )}
                  {result.matchedOrders?.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer">Show matched details</summary>
                      <div className="text-xs text-gray-500 mt-1 max-h-40 overflow-y-auto">
                        {result.matchedOrders.map((o, i) => (
                          <div key={i}>{o.orderNum} — {o.trackingCount} tracking #s, {o.productCount} products</div>
                        ))}
                      </div>
                    </details>
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
