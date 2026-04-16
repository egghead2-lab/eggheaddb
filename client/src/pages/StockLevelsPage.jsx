import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';

export default function StockLevelsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('stock'); // stock, skus, id_cards, shipping
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState('');

  // Stock
  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ['stock-levels'],
    queryFn: () => api.get('/materials/stock').then(r => r.data),
  });

  const updateStock = useMutation({
    mutationFn: ({ id, qty }) => api.patch(`/materials/stock/${id}`, { qty_on_hand: qty }),
    onSuccess: () => { qc.invalidateQueries(['stock-levels']); setEditingId(null); },
  });

  // SKU mapper
  const { data: skuData } = useQuery({
    queryKey: ['lesson-skus'],
    queryFn: () => api.get('/materials/lesson-skus').then(r => r.data),
    enabled: tab === 'skus',
  });

  const updateSku = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/materials/lesson-skus/${id}`, data),
    onSuccess: () => qc.invalidateQueries(['lesson-skus']),
  });

  // ID card config
  const { data: idCardData } = useQuery({
    queryKey: ['class-id-cards'],
    queryFn: () => api.get('/materials/class-id-cards').then(r => r.data),
    enabled: tab === 'id_cards',
  });

  const updateIdCard = useMutation({
    mutationFn: ({ id, val }) => api.patch(`/materials/class-id-cards/${id}`, { has_id_card: val }),
    onSuccess: () => qc.invalidateQueries(['class-id-cards']),
  });

  // Area shipping config
  const { data: areaShipData } = useQuery({
    queryKey: ['area-shipping'],
    queryFn: () => api.get('/materials/area-shipping').then(r => r.data),
    enabled: tab === 'shipping',
  });

  const updateAreaShipping = useMutation({
    mutationFn: ({ id, days }) => api.patch(`/materials/area-shipping/${id}`, { shipping_lead_days: days }),
    onSuccess: () => qc.invalidateQueries(['area-shipping']),
  });

  const stock = (stockData?.data || []).filter(s => !search || s.item_name.toLowerCase().includes(search.toLowerCase()) || s.sku.toLowerCase().includes(search.toLowerCase()));
  const lessons = (skuData?.data || []).filter(l => !search || l.lesson_name.toLowerCase().includes(search.toLowerCase()));
  const classes = idCardData?.data || [];

  return (
    <AppShell>
      <PageHeader title="Stock & Configuration">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[['stock', 'Stock Levels'], ['skus', 'SKU Mapper'], ['id_cards', 'Start Kit Config'], ['shipping', 'Shipping Config']].map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); setSearch(''); }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                tab === k ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500'
              }`}>{l}</button>
          ))}
        </div>
        <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-48" />
      </PageHeader>

      <div className="p-6">
        {tab === 'stock' && (
          stockLoading ? <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div> : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Item</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">SKU</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700 w-32">Qty On Hand</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stock.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-12 text-gray-400">No stock data. Import via CSV.</td></tr>
                  ) : stock.map(s => (
                    <tr key={s.id}>
                      <td className="px-4 py-2.5 text-gray-900">{s.item_name}</td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{s.sku}</td>
                      <td className="px-4 py-2.5 text-right">
                        {editingId === s.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)}
                              className="w-20 rounded border border-gray-300 px-2 py-0.5 text-sm text-right" autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') updateStock.mutate({ id: s.id, qty: Number(editQty) }); if (e.key === 'Escape') setEditingId(null); }} />
                            <button onClick={() => updateStock.mutate({ id: s.id, qty: Number(editQty) })}
                              className="text-xs text-green-600 hover:underline">Save</button>
                          </div>
                        ) : (
                          <span className={`font-medium ${s.qty_on_hand <= 0 ? 'text-red-600' : s.qty_on_hand < 5 ? 'text-amber-600' : 'text-gray-900'}`}>
                            {s.qty_on_hand}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {editingId !== s.id && (
                          <button onClick={() => { setEditingId(s.id); setEditQty(String(s.qty_on_hand)); }}
                            className="text-xs text-gray-400 hover:text-[#1e3a5f]">Edit</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'skus' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Lesson</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">SKU (standard)</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">SKU (For 20)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lessons.map(l => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 text-gray-900">{l.lesson_name}</td>
                    <td className="px-4 py-2">
                      <input defaultValue={l.sku || ''} placeholder="—"
                        onBlur={e => { if (e.target.value !== (l.sku || '')) updateSku.mutate({ id: l.id, data: { sku: e.target.value } }); }}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                    </td>
                    <td className="px-4 py-2">
                      <input defaultValue={l.sku_for_20 || ''} placeholder="—"
                        onBlur={e => { if (e.target.value !== (l.sku_for_20 || '')) updateSku.mutate({ id: l.id, data: { sku_for_20: e.target.value } }); }}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'id_cards' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <p className="text-xs text-gray-500">Classes with "Has Start Kit" enabled will generate Sci/Eng/Rob/Fin Start items in orders. Uncheck to exclude a class from start kit generation.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Class</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700 w-32">Has Start Kit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {classes.map(c => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 text-gray-900">{c.class_name}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{c.class_type_name || '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      <input type="checkbox" checked={!!c.has_id_card}
                        onChange={() => updateIdCard.mutate({ id: c.id, val: c.has_id_card ? 0 : 1 })}
                        className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'shipping' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <p className="text-xs text-gray-500">Set the number of days before a program week that materials must be shipped for each area. Items flagged in the resolution center will warn if a session date is too soon based on the area's lead time.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Area</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700 w-40">Shipping Lead Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(areaShipData?.data || []).map(a => (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 text-gray-900 font-medium">{a.geographic_area_name}</td>
                    <td className="px-4 py-2.5 text-center">
                      <input type="number" min="1" max="30"
                        defaultValue={a.shipping_lead_days}
                        onBlur={e => {
                          const val = parseInt(e.target.value);
                          if (val && val !== a.shipping_lead_days) updateAreaShipping.mutate({ id: a.id, days: val });
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                        className="w-20 text-center rounded border border-gray-300 px-2 py-1 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
