import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';

const TYPE_COLORS = {
  text: 'bg-gray-100 text-gray-600',
  number: 'bg-blue-100 text-blue-700',
  select: 'bg-violet-100 text-violet-700',
  boolean: 'bg-amber-100 text-amber-700',
  timeframe: 'bg-teal-100 text-teal-700',
  invoice: 'bg-pink-100 text-pink-700',
};

export default function ReportFieldConfigPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['report-entities-all'],
    queryFn: () => api.get('/reports/entities?include_all=true').then(r => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ entity, field_key, enabled }) => api.put('/reports/field-config', { entity, field_key, enabled }),
    onSuccess: () => qc.invalidateQueries(['report-entities-all']),
  });

  const entities = data?.data || {};

  return (
    <AppShell>
      <PageHeader title="Report Builder Fields" />

      <div className="p-6 space-y-6">
        <p className="text-sm text-gray-500">Toggle which fields are available in the Report Builder for each database. Disabled fields won't appear as filter or display options.</p>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : Object.entries(entities).map(([entityKey, entity]) => (
          <div key={entityKey} className="bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{entity.label}</h3>
              <span className="text-xs text-gray-400">
                {entity.fields.filter(f => f.enabled).length}/{entity.fields.length} enabled
              </span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {entity.fields.map(field => (
                  <label key={field.key}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      field.enabled ? 'bg-white border border-gray-200 hover:border-[#1e3a5f]/30' : 'bg-gray-50 border border-gray-100 opacity-60'
                    }`}>
                    <input type="checkbox" checked={field.enabled}
                      onChange={() => toggleMutation.mutate({ entity: entityKey, field_key: field.key, enabled: !field.enabled })}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-800 truncate">{field.label}</div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${TYPE_COLORS[field.type] || TYPE_COLORS.text}`}>
                      {field.type}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
