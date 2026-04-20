import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { RichTextEditor } from '../components/ui/RichTextEditor';

const CATEGORIES = [
  { value: 'confirmation', label: 'Confirmation' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'charge', label: 'Charge' },
];

// Common party fields available to all templates
const COMMON_FIELDS = [
  { key: '{{contact_name}}', label: 'Contact Name' },
  { key: '{{contact_email}}', label: 'Contact Email' },
  { key: '{{contact_phone}}', label: 'Contact Phone' },
  { key: '{{program_name}}', label: 'Program Name' },
  { key: '{{party_date}}', label: 'Party Date' },
  { key: '{{party_time}}', label: 'Party Time' },
  { key: '{{duration}}', label: 'Duration' },
  { key: '{{party_format}}', label: 'Format' },
  { key: '{{party_theme}}', label: 'Theme' },
  { key: '{{location}}', label: 'Location' },
  { key: '{{address}}', label: 'Address' },
  { key: '{{lead_professor}}', label: 'Lead Professor' },
  { key: '{{lead_phone}}', label: 'Lead Phone' },
  { key: '{{birthday_kid_name}}', label: 'Birthday Kid' },
  { key: '{{birthday_kid_age}}', label: 'Birthday Age' },
  { key: '{{kids_expected}}', label: 'Kids Expected' },
];

const FINANCIAL_FIELDS = [
  { key: '{{total_party_cost}}', label: 'Total Cost' },
  { key: '{{base_party_price}}', label: 'Base Price' },
  { key: '{{deposit_amount}}', label: 'Deposit Amount' },
  { key: '{{deposit_date}}', label: 'Deposit Date' },
  { key: '{{remaining_balance}}', label: 'Amount Owed' },
  { key: '{{drive_fee}}', label: 'Drive Fee' },
];

const CHARGE_FIELDS = [
  { key: '{{final_charge_date}}', label: 'Charge Date' },
  { key: '{{final_charge_type}}', label: 'Charge Type' },
];

const MERGE_FIELDS_BY_CATEGORY = {
  confirmation: COMMON_FIELDS,
  follow_up: [...COMMON_FIELDS, ...FINANCIAL_FIELDS],
  charge: [...COMMON_FIELDS, ...FINANCIAL_FIELDS, ...CHARGE_FIELDS],
  _default: COMMON_FIELDS,
};

export default function PartyEmailTemplatesPage() {
  const qc = useQueryClient();
  const [filterCat, setFilterCat] = useState('');
  const [editing, setEditing] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['party-email-templates-all', filterCat],
    queryFn: () => api.get('/parties/email-templates', { params: filterCat ? { category: filterCat } : {} }).then(r => r.data),
  });
  const templates = data?.data || [];

  const saveMutation = useMutation({
    mutationFn: (tpl) => tpl.isNew
      ? api.post('/parties/email-templates', tpl)
      : api.put(`/parties/email-templates/${tpl.id}`, tpl),
    onSuccess: () => {
      qc.invalidateQueries(['party-email-templates-all']);
      qc.invalidateQueries(['party-email-templates']);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/parties/email-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['party-email-templates-all']);
      qc.invalidateQueries(['party-email-templates']);
    },
  });

  return (
    <AppShell>
      <PageHeader title="Party Email Templates" action={
        <Button onClick={() => setEditing({ isNew: true, name: '', subject: '', body: '', category: filterCat || CATEGORIES[0].value })}>
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm text-gray-900 truncate">{t.name}</div>
                      {t.is_default ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium shrink-0">Default</span> : null}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 truncate">{t.subject}</div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium shrink-0 ml-2">
                    {CATEGORIES.find(c => c.value === t.category)?.label || t.category || 'Confirmation'}
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
                onSetDefault={(id) => saveMutation.mutate({ id, is_default: 1 })}
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

function TemplateEditor({ template, onSave, onDelete, onClose, onSetDefault, isPending, error }) {
  const [form, setForm] = useState({
    name: template.name || '',
    subject: template.subject || '',
    body: template.body || '',
    category: template.category || 'confirmation',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const editorRef = useRef(null);

  const mergeFields = MERGE_FIELDS_BY_CATEGORY[form.category] || MERGE_FIELDS_BY_CATEGORY._default;

  const insertField = (fieldKey) => {
    const subjectInput = document.getElementById('party-template-subject');
    if (subjectInput && document.activeElement === subjectInput) {
      const start = subjectInput.selectionStart;
      const end = subjectInput.selectionEnd;
      const val = form.subject;
      set('subject', val.slice(0, start) + fieldKey + val.slice(end));
      setTimeout(() => { subjectInput.focus(); subjectInput.setSelectionRange(start + fieldKey.length, start + fieldKey.length); }, 0);
    } else if (editorRef.current) {
      editorRef.current.chain().focus().insertContent(fieldKey).run();
    }
  };

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
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Subject</label>
          <input id="party-template-subject" type="text" value={form.subject} onChange={e => set('subject', e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        </div>
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
          <div className="text-[10px] font-semibold text-gray-600 mb-1.5">
            Insert Merge Field <span className="font-normal text-gray-400">— click to insert at cursor (works in subject and body)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {mergeFields.map(f => (
              <button key={f.key} type="button" onClick={() => insertField(f.key)}
                className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-[#1e3a5f] font-mono hover:bg-[#1e3a5f] hover:text-white transition-colors">
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Body</label>
          <RichTextEditor value={form.body} onChange={html => set('body', html)}
            placeholder="Write your email template..." minHeight="250px" editorRef={editorRef} />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => onSave({ ...form, id: template.id, isNew: template.isNew })} disabled={isPending || !form.name || !form.category}>
            {isPending ? 'Saving...' : 'Save Template'}
          </Button>
          {!template.isNew && !template.is_default && (
            <button onClick={() => onSetDefault(template.id)} className="text-xs text-gray-500 hover:text-[#1e3a5f]">Set as default</button>
          )}
          {!template.isNew && (
            <button onClick={() => onDelete(template.id)} className="text-xs text-red-500 hover:text-red-700 ml-auto">Delete</button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
