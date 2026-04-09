import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

const PAY_FIELDS = [
  { key: 'base_pay_rate', label: 'Base Pay', profField: 'base_pay' },
  { key: 'assist_pay_rate', label: 'Assist Pay', profField: 'assist_pay' },
  { key: 'party_pay_rate', label: 'Party Pay', profField: 'party_pay' },
  { key: 'camp_pay_rate', label: 'Camp Pay', profField: 'camp_pay' },
];

export default function AreaPayRatesPage() {
  const qc = useQueryClient();
  const [confirmArea, setConfirmArea] = useState(null); // { areaId, areaName, field, oldVal, newVal, profCount, higherCount }

  const { data, isLoading } = useQuery({
    queryKey: ['area-pay-rates'],
    queryFn: () => api.get('/area-pay-rates').then(r => r.data),
  });
  const areas = data?.data || [];

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/area-pay-rates/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['area-pay-rates']); setConfirmArea(null); },
  });

  const handleChange = async (area, field, newVal) => {
    const oldVal = area[field];
    if (String(newVal) === String(oldVal || '')) return;
    if (!newVal && !oldVal) return;

    // Fetch how many professors would be affected
    try {
      const profField = PAY_FIELDS.find(f => f.key === field)?.profField;
      const res = await api.get('/area-pay-rates/impact', { params: { area_id: area.id, field: profField, new_rate: newVal || 0 } });
      const impact = res.data?.data || {};

      setConfirmArea({
        areaId: area.id,
        areaName: area.geographic_area_name,
        field,
        fieldLabel: PAY_FIELDS.find(f => f.key === field)?.label,
        oldVal: oldVal || 0,
        newVal: newVal || 0,
        profCount: impact.total || 0,
        wouldUpdate: impact.would_update || 0,
        alreadyHigher: impact.already_higher || 0,
      });
    } catch {
      // If impact check fails, just save the area rate without cascade
      saveMutation.mutate({ id: area.id, data: { [field]: newVal || null, cascade: false } });
    }
  };

  const confirmSave = (cascade) => {
    if (!confirmArea) return;
    saveMutation.mutate({
      id: confirmArea.areaId,
      data: { [confirmArea.field]: confirmArea.newVal || null, cascade, protect_higher: true },
    });
  };

  return (
    <AppShell>
      <PageHeader title="Area Pay Rates" />

      <div className="p-6">
        <p className="text-xs text-gray-500 mb-4">
          Set default pay rates per area. When you change a rate, you'll be asked whether to update existing professors.
          Professors with pay already higher than the new rate will not be lowered.
        </p>

        {/* Confirmation dialog */}
        {confirmArea && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="text-sm font-semibold text-amber-800 mb-2">
              Update {confirmArea.fieldLabel} for {confirmArea.areaName}
            </div>
            <div className="text-xs text-amber-700 mb-3">
              Changing from <strong>${Number(confirmArea.oldVal).toFixed(2)}</strong> to <strong>${Number(confirmArea.newVal).toFixed(2)}</strong>
            </div>

            {confirmArea.profCount > 0 ? (
              <div className="text-xs text-gray-700 mb-3 space-y-1">
                <div><strong>{confirmArea.profCount}</strong> active professor{confirmArea.profCount !== 1 ? 's' : ''} in this area</div>
                {confirmArea.wouldUpdate > 0 && (
                  <div className="text-green-700"><strong>{confirmArea.wouldUpdate}</strong> would be updated to ${Number(confirmArea.newVal).toFixed(2)}</div>
                )}
                {confirmArea.alreadyHigher > 0 && (
                  <div className="text-blue-700"><strong>{confirmArea.alreadyHigher}</strong> already earn more — will NOT be lowered</div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500 mb-3">No active professors in this area.</div>
            )}

            <div className="flex gap-2">
              {confirmArea.wouldUpdate > 0 && (
                <button onClick={() => confirmSave(true)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700">
                  Update Rate + {confirmArea.wouldUpdate} Professor{confirmArea.wouldUpdate !== 1 ? 's' : ''}
                </button>
              )}
              <button onClick={() => confirmSave(false)}
                className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                Update Rate Only
              </button>
              <button onClick={() => setConfirmArea(null)} className="text-xs text-gray-500">Cancel</button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-40">Area</th>
                  {PAY_FIELDS.map(f => (
                    <th key={f.key} className="text-center px-2 py-2.5 font-medium text-gray-600">{f.label}</th>
                  ))}
                  <th className="text-center px-2 py-2.5 font-medium text-gray-600 w-16">Profs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {areas.map((a, i) => (
                  <tr key={a.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2 font-medium text-gray-800">{a.geographic_area_name}</td>
                    {PAY_FIELDS.map(f => (
                      <td key={f.key} className="px-2 py-1 text-center">
                        <input type="number" step="0.01"
                          defaultValue={a[f.key] ?? ''}
                          onBlur={e => handleChange(a, f.key, e.target.value)}
                          className="w-20 rounded border border-gray-200 px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                          placeholder="—" />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center text-gray-500">{a.professor_count}</td>
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
