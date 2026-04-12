import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEntities, getReports, createReport, updateReport, deleteReport, runReport, getFieldOptions } from '../api/reports';
import { getRoles } from '../api/reference';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { CopyableTable } from '../components/ui/CopyableTable';
import { formatDate, formatCurrency } from '../lib/utils';

const OPERATORS = {
  text: [
    { value: '=', label: 'is' }, { value: 'not', label: 'is not' },
    { value: 'contains', label: 'contains' }, { value: 'starts_with', label: 'starts with' },
    { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
  ],
  number: [
    { value: '=', label: '=' }, { value: '!=', label: '!=' },
    { value: '>', label: '>' }, { value: '<', label: '<' },
    { value: '>=', label: '>=' }, { value: '<=', label: '<=' },
    { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
  ],
  select: [
    { value: '=', label: 'is' }, { value: 'not', label: 'is not' },
    { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
  ],
  date: [
    { value: '=', label: 'is' }, { value: '!=', label: 'is not' },
    { value: '>', label: 'after' }, { value: '<', label: 'before' },
    { value: '>=', label: 'on or after' }, { value: '<=', label: 'on or before' },
    { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
  ],
  boolean: [{ value: '=', label: 'is' }],
  timeframe: [{ value: '=', label: 'is' }],
  invoice: [{ value: '=', label: 'is' }],
};

export default function ReportBuilderPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  // Form — used for both create and edit
  const [form, setForm] = useState({ name: '', description: '', entity: '', display_mode: 'task', kpi_format: 'count', filters: [], role_ids: [], user_ids: [] });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: entitiesData } = useQuery({ queryKey: ['report-entities'], queryFn: getEntities });
  const entities = entitiesData?.data || {};

  const { data: reportsData, isLoading } = useQuery({ queryKey: ['reports'], queryFn: getReports });
  const reports = reportsData?.data || [];

  const { data: rolesData } = useQuery({ queryKey: ['roles'], queryFn: getRoles });
  const roles = rolesData?.data || [];

  const { data: usersData } = useQuery({
    queryKey: ['all-users-for-reports'],
    queryFn: () => import('../api/client').then(m => m.default.get('/users?limit=100').then(r => r.data)),
    staleTime: 5 * 60 * 1000,
  });
  const allUsers = usersData?.data || [];

  const createMutation = useMutation({ mutationFn: (d) => createReport(d), onSuccess: () => { qc.invalidateQueries(['reports']); setShowCreate(false); resetForm(); } });
  const updateMutation = useMutation({ mutationFn: ({ id, data }) => updateReport(id, data), onSuccess: () => { qc.invalidateQueries(['reports']); setEditingId(null); setShowCreate(false); resetForm(); } });
  const deleteMutation = useMutation({ mutationFn: (id) => deleteReport(id), onSuccess: () => qc.invalidateQueries(['reports']) });

  const resetForm = () => { setForm({ name: '', description: '', entity: '', display_mode: 'task', kpi_format: 'count', filters: [], role_ids: [], user_ids: [] }); setEditingId(null); };

  const startEdit = (report) => {
    setForm({
      name: report.name || '', description: report.description || '', entity: report.entity || '',
      display_mode: report.display_mode || 'task', kpi_format: report.kpi_format || 'count',
      filters: report.filters || [], role_ids: report.role_ids || [], user_ids: report.user_ids || [],
    });
    setEditingId(report.id);
    setShowCreate(true);
  };

  const handleSave = () => {
    if (!form.name || !form.entity) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const addFilter = () => {
    const entityFields = entities[form.entity]?.fields || [];
    set('filters', [...form.filters, { field: entityFields[0]?.key || '', operator: '=', value: '' }]);
  };

  const updateFilter = (i, key, val) => {
    set('filters', form.filters.map((f, idx) => idx === i ? { ...f, [key]: val } : f));
  };

  const removeFilter = (i) => set('filters', form.filters.filter((_, idx) => idx !== i));

  const toggleRole = (roleId) => {
    set('role_ids', form.role_ids.includes(roleId) ? form.role_ids.filter(id => id !== roleId) : [...form.role_ids, roleId]);
  };

  const toggleUser = (userId) => {
    set('user_ids', form.user_ids.includes(userId) ? form.user_ids.filter(id => id !== userId) : [...form.user_ids, userId]);
  };

  const handlePreview = async (id) => {
    if (previewId === id) { setPreviewId(null); setPreviewData(null); return; }
    try {
      const res = await runReport(id);
      setPreviewData(res);
      setPreviewId(id);
    } catch (err) {
      // error is surfaced in previewData.error below
      setPreviewData({ data: [], count: 0, error: err.message });
      setPreviewId(id);
    }
  };

  const entityFields = entities[form.entity]?.fields || [];

  return (
    <AppShell>
      <PageHeader title="Report Builder" action={
        <Button onClick={() => { if (showCreate) { setShowCreate(false); resetForm(); } else { setShowCreate(true); } }}>
          {showCreate ? 'Cancel' : '+ New Report'}
        </Button>
      } />
      <div className="p-6 space-y-4">
        {/* Create form */}
        {showCreate && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">{editingId ? 'Edit Report' : 'New Report'}</h3>
            <div className="grid grid-cols-4 gap-4">
              <Input label="Report Name" value={form.name} onChange={e => set('name', e.target.value)} />
              <Select label="Entity" value={form.entity} onChange={e => { set('entity', e.target.value); set('filters', []); }}>
                <option value="">Select…</option>
                {Object.entries(entities).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
              <Select label="Display As" value={form.display_mode} onChange={e => set('display_mode', e.target.value)}>
                <option value="task">Daily Task</option>
                <option value="kpi">KPI</option>
                <option value="both">Both</option>
              </Select>
              <Select label="KPI Format" value={form.kpi_format} onChange={e => set('kpi_format', e.target.value)}>
                <option value="count">Count</option>
                <option value="list">List</option>
              </Select>
            </div>
            <Input label="Description" value={form.description} onChange={e => set('description', e.target.value)} />

            {/* Assignment — prominent */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Who Sees This Report?</h4>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">By Role (everyone with this role)</label>
                <div className="flex flex-wrap gap-2">
                  {roles.map(r => (
                    <label key={r.id} className="flex items-center gap-1.5 text-sm cursor-pointer bg-white px-2 py-1 rounded border border-gray-200">
                      <input type="checkbox" checked={form.role_ids.includes(r.id)} onChange={() => toggleRole(r.id)} className="accent-[#1e3a5f]" />
                      {r.role_name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">By Person (specific individuals)</label>
                <div className="flex flex-wrap gap-2">
                  {allUsers.map(u => (
                    <label key={u.id} className="flex items-center gap-1.5 text-sm cursor-pointer bg-white px-2 py-1 rounded border border-gray-200">
                      <input type="checkbox" checked={form.user_ids.includes(u.id)} onChange={() => toggleUser(u.id)} className="accent-[#1e3a5f]" />
                      {u.first_name} {u.last_name}
                    </label>
                  ))}
                </div>
              </div>
              {!form.role_ids.length && !form.user_ids.length && (
                <p className="text-xs text-amber-600">No one assigned — only Admin/CEO will see this report</p>
              )}
            </div>

            {/* Filters */}
            {form.entity && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-700">Filters</label>
                  <button type="button" onClick={addFilter} className="text-xs text-[#1e3a5f] hover:underline">+ Add Filter</button>
                </div>
                {form.filters.map((f, i) => {
                  const fieldDef = entityFields.find(ef => ef.key === f.field);
                  const ops = OPERATORS[fieldDef?.type || 'text'] || OPERATORS.text;
                  return (
                    <div key={i} className="flex gap-2 items-center mb-2">
                      <select value={f.field} onChange={e => updateFilter(i, 'field', e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-sm flex-1">
                        {entityFields.map(ef => <option key={ef.key} value={ef.key}>{ef.label || ef.key}</option>)}
                      </select>
                      <select value={f.operator} onChange={e => updateFilter(i, 'operator', e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-sm w-28">
                        {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {f.operator === 'is_empty' || f.operator === 'is_not_empty' ? (
                        <span className="text-xs text-gray-400 flex-1 py-1">(no value needed)</span>
                      ) : fieldDef?.type === 'boolean' ? (
                        <select value={f.value} onChange={e => updateFilter(i, 'value', e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm flex-1">
                          <option value="1">Yes</option>
                          <option value="0">No</option>
                        </select>
                      ) : fieldDef?.type === 'select' && Array.isArray(fieldDef.options) ? (
                        <select value={f.value} onChange={e => updateFilter(i, 'value', e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm flex-1">
                          <option value="">Select…</option>
                          {fieldDef.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : fieldDef?.type === 'timeframe' ? (
                        <select value={f.value} onChange={e => updateFilter(i, 'value', e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm flex-1">
                          <option value="current">Current & Future</option>
                          <option value="past">Past</option>
                          <option value="all">All</option>
                        </select>
                      ) : fieldDef?.type === 'invoice' ? (
                        <select value={f.value} onChange={e => updateFilter(i, 'value', e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm flex-1">
                          <option value="paid">Paid</option>
                          <option value="sent">Sent</option>
                          <option value="not_sent">Not Sent</option>
                        </select>
                      ) : fieldDef?.type === 'date' ? (
                        <input type="date" value={f.value || ''} onChange={e => updateFilter(i, 'value', e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-sm flex-1" />
                      ) : (
                        <DynamicValueInput entity={form.entity} field={f.field} value={f.value}
                          onChange={val => updateFilter(i, 'value', val)} />
                      )}
                      <button onClick={() => removeFilter(i)} className="text-red-400 hover:text-red-600 text-sm">×</button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={!form.name || !form.entity || createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'Saving…' : editingId ? 'Save Changes' : 'Create Report'}
              </Button>
              {createMutation.isSuccess && <span className="text-sm text-green-600 font-medium">Report created!</span>}
              {updateMutation.isSuccess && <span className="text-sm text-green-600 font-medium">Changes saved!</span>}
              {(createMutation.isError || updateMutation.isError) && <span className="text-sm text-red-600">Save failed</span>}
            </div>
          </div>
        )}

        {/* Existing reports */}
        {isLoading ? <Spinner className="w-6 h-6" /> : (
          <CopyableTable className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Report Name</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Entity</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Filters</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Assigned To</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No reports yet — create one above</td></tr>
                ) : reports.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2"><Badge status={entities[r.entity]?.label || r.entity} /></td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                        r.display_mode === 'task' ? 'bg-blue-100 text-blue-700' : r.display_mode === 'kpi' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                      }`}>{r.display_mode === 'both' ? 'Task + KPI' : r.display_mode === 'kpi' ? 'KPI' : 'Task'}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{(r.filters || []).length} filter{(r.filters || []).length !== 1 ? 's' : ''}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {(r.role_ids || []).length > 0 && <span>{r.role_ids.length} role{r.role_ids.length !== 1 ? 's' : ''}</span>}
                      {(r.user_ids || []).length > 0 && <span>{r.role_ids?.length ? ', ' : ''}{r.user_ids.length} user{r.user_ids.length !== 1 ? 's' : ''}</span>}
                      {!(r.role_ids?.length || r.user_ids?.length) && '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => startEdit(r)} className="text-xs text-[#1e3a5f] hover:underline">Edit</button>
                        <button onClick={() => handlePreview(r.id)} className="text-xs text-[#1e3a5f] hover:underline">{previewId === r.id ? 'Hide' : 'Run'}</button>
                        <button onClick={() => { if (window.confirm('Delete this report?')) deleteMutation.mutate(r.id); }} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CopyableTable>
        )}

        {/* Preview results */}
        {previewId && previewData && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{previewData.report?.name} — {previewData.count} results</span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {previewData.data?.[0] && Object.keys(previewData.data[0]).filter(k => k !== 'id').map(k => (
                    <th key={k} className="text-left px-3 py-2 font-medium text-gray-600">{k.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(previewData.data || []).slice(0, 50).map((row, i) => (
                  <tr key={row.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    {Object.entries(row).filter(([k]) => k !== 'id').map(([k, v]) => (
                      <td key={k} className="px-3 py-1.5 text-gray-600">{v === null ? '—' : typeof v === 'number' && k.includes('pay') ? formatCurrency(v) : String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {previewData.count > 50 && <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">Showing 50 of {previewData.count}</div>}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function DynamicValueInput({ entity, field, value, onChange }) {
  const { data, isLoading } = useQuery({
    queryKey: ['field-options', entity, field],
    queryFn: () => getFieldOptions(entity, field),
    staleTime: 5 * 60 * 1000,
    enabled: !!entity && !!field,
  });
  const options = data?.data || [];

  if (isLoading) return <input value={value} onChange={e => onChange(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm flex-1" placeholder="Loading..." />;

  if (options.length > 0) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1 text-sm flex-1">
        <option value="">Select...</option>
        <option value="CURRENT_USER" className="font-bold text-blue-700">Current User (dynamic)</option>
        <option value="CURRENT_USER_AREAS" className="font-bold text-blue-700">Current User's Areas (dynamic)</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <div className="flex-1 flex gap-1">
      <input value={value} onChange={e => onChange(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm flex-1" placeholder="Value..." />
      <button type="button" onClick={() => onChange('CURRENT_USER')}
        className={`text-[9px] px-1.5 py-1 rounded border whitespace-nowrap ${value === 'CURRENT_USER' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'border-gray-200 text-gray-400 hover:text-blue-600'}`}>
        Current User
      </button>
    </div>
  );
}
