import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

const CATEGORIES = [
  { value: 'starting_email', label: 'Starting Emails' },
  { value: 'first_day_parent', label: 'First Day Parent' },
  { value: 'second_week_email', label: '2nd Week Emails' },
  { value: 'sub_email', label: 'Sub Emails' },
  { value: 'new_professor_email', label: 'New Professor' },
  { value: 'last_day_school', label: 'Last Day (School)' },
  { value: 'last_day_parent', label: 'Last Day (Parent)' },
  { value: 'parent_feedback', label: 'Parent Feedback' },
  { value: 'site_check_in', label: 'Site Check-in' },
  { value: 'nps_email', label: 'NPS Email' },
  { value: 'roster_email', label: 'Roster Email' },
  { value: 'set_dates_email', label: 'Set Dates (Rebook)' },
  { value: 'rebook_receive_email', label: 'Rebook Receive' },
];

export default function ClientTemplatesPage() {
  const qc = useQueryClient();
  const [filterCat, setFilterCat] = useState('');
  const [editing, setEditing] = useState(null); // template object or { isNew: true }

  const { data, isLoading } = useQuery({
    queryKey: ['cm-all-templates', filterCat],
    queryFn: () => api.get('/client-management/templates', { params: filterCat ? { category: filterCat } : {} }).then(r => r.data),
  });
  const templates = data?.data || [];

  const saveMutation = useMutation({
    mutationFn: (tpl) => tpl.isNew
      ? api.post('/client-management/templates', tpl)
      : api.put(`/client-management/templates/${tpl.id}`, tpl),
    onSuccess: () => { qc.invalidateQueries(['cm-all-templates']); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/client-management/templates/${id}`),
    onSuccess: () => qc.invalidateQueries(['cm-all-templates']),
  });

  return (
    <AppShell>
      <PageHeader title="Email Template Builder" action={
        <Button onClick={() => setEditing({ isNew: true, name: '', subject: '', body_html: '', category: filterCat || CATEGORIES[0].value })}>
          + New Template
        </Button>
      } />

      <div className="p-6">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button onClick={() => setFilterCat('')}
            className={`text-xs px-2.5 py-1.5 rounded-lg font-medium ${!filterCat ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            All
          </button>
          {CATEGORIES.map(c => (
            <button key={c.value} onClick={() => setFilterCat(c.value)}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium ${filterCat === c.value ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex gap-6">
          {/* Template list */}
          <div className={`${editing ? 'w-[40%]' : 'w-full'} space-y-2`}>
            {isLoading ? (
              <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No templates{filterCat ? ` for ${CATEGORIES.find(c => c.value === filterCat)?.label}` : ''}</div>
            ) : templates.map(t => (
              <div key={t.id} onClick={() => setEditing(t)}
                className={`bg-white rounded-lg border p-3 cursor-pointer transition-colors ${
                  editing?.id === t.id ? 'border-[#1e3a5f] ring-1 ring-[#1e3a5f]/20' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm text-gray-900">{t.name}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{t.subject}</div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                    {CATEGORIES.find(c => c.value === t.category)?.label || t.category}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Editor */}
          {editing && (
            <div className="w-[60%] sticky top-4 self-start">
              <TemplateEditor
                template={editing}
                onSave={(tpl) => saveMutation.mutate(tpl)}
                onDelete={(id) => { if (confirm('Delete this template?')) { deleteMutation.mutate(id); setEditing(null); } }}
                onClose={() => setEditing(null)}
                isPending={saveMutation.isPending}
                error={saveMutation.isError ? saveMutation.error?.response?.data?.error : null}
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function TemplateEditor({ template, onSave, onDelete, onClose, isPending, error }) {
  const [form, setForm] = useState({
    name: template.name || '',
    subject: template.subject || '',
    body_html: template.body_html || '',
    category: template.category || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex justify-between items-center">
        <div className="text-sm font-semibold text-gray-900">{template.isNew ? 'New Template' : 'Edit Template'}</div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Name</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]">
              <option value="">Select...</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Subject</label>
          <input type="text" value={form.subject} onChange={e => set('subject', e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Body (HTML / plain text with {'{{merge_fields}}'} )</label>
          <textarea value={form.body_html} onChange={e => set('body_html', e.target.value)} rows={14}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        </div>
        <div className="text-[10px] text-gray-400">
          Common merge fields: {'{{school_name}} {{class_name}} {{professor_name}} {{start_date}} {{session_days}} {{contact_name}} {{client_manager_name}}'}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => onSave({ ...form, id: template.id, isNew: template.isNew })} disabled={isPending || !form.name || !form.category}>
            {isPending ? 'Saving...' : 'Save Template'}
          </Button>
          {!template.isNew && (
            <button onClick={() => onDelete(template.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
