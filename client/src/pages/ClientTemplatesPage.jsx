import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { RichTextEditor } from '../components/ui/RichTextEditor';

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
  { value: 'lab_fee_followup', label: 'Lab Fee Follow-Up' },
  { value: 'send_flyer', label: 'Send Flyer' },
];

export default function ClientTemplatesPage() {
  const qc = useQueryClient();
  const [filterCat, setFilterCat] = useState('');
  const [editing, setEditing] = useState(null); // template object or { isNew: true }

  const { data, isLoading } = useQuery({
    queryKey: ['cm-all-templates', filterCat],
    queryFn: () => api.get('/client-management/templates', { params: filterCat ? { category: filterCat } : {} }).then(r => r.data),
  });
  const CM_CATS = new Set(CATEGORIES.map(c => c.value));
  const allTemplates = data?.data || [];
  const templates = filterCat ? allTemplates : allTemplates.filter(t => CM_CATS.has(t.category));

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

const MERGE_FIELDS_BY_CATEGORY = {
  _default: [
    { key: '{{school_name}}', label: 'School Name' },
    { key: '{{class_name}}', label: 'Class Name' },
    { key: '{{professor_name}}', label: 'Professor Name' },
    { key: '{{start_date}}', label: 'Start Date' },
    { key: '{{session_days}}', label: 'Session Days' },
    { key: '{{contact_name}}', label: 'Contact Name' },
    { key: '{{client_manager_name}}', label: 'Client Manager' },
  ],
  lab_fee_followup: [
    { key: '{{parent_name}}', label: 'Parent Name' },
    { key: '{{student_name}}', label: 'Student Name' },
    { key: '{{class_name}}', label: 'Class Name' },
    { key: '{{lab_fee_amount}}', label: 'Lab Fee Amount' },
    { key: '{{payment_link}}', label: 'Payment Link URL' },
    { key: '{{start_date}}', label: 'Start Date' },
  ],
  send_flyer: [
    { key: '{{contact_name}}', label: 'Contact Name (POC)' },
    { key: '{{school_name}}', label: 'School Name' },
    { key: '{{class_name}}', label: 'Class Name' },
    { key: '{{program_nickname}}', label: 'Program Nickname' },
    { key: '{{start_date}}', label: 'Start Date' },
    { key: '{{registration_link}}', label: 'Registration Link' },
    { key: '{{class_cost}}', label: 'Class Cost' },
  ],
};

function TemplateEditor({ template, onSave, onDelete, onClose, isPending, error }) {
  const [form, setForm] = useState({
    name: template.name || '',
    subject: template.subject || '',
    body_html: template.body_html || '',
    category: template.category || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const editorRef = useRef(null);

  const mergeFields = MERGE_FIELDS_BY_CATEGORY[form.category] || MERGE_FIELDS_BY_CATEGORY._default;

  const insertField = (fieldKey) => {
    const subjectInput = document.getElementById('cm-template-subject');
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
              <option value="">Select...</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Subject</label>
          <input id="cm-template-subject" type="text" value={form.subject} onChange={e => set('subject', e.target.value)}
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
          <RichTextEditor value={form.body_html} onChange={html => set('body_html', html)}
            placeholder="Write your email template..." minHeight="250px" editorRef={editorRef} />
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
