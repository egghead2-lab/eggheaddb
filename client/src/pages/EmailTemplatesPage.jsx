import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { RichTextEditor } from '../components/ui/RichTextEditor';

// Merge fields available for hiring/onboarding email templates
const MERGE_FIELDS = [
  { key: '{{candidate_name}}', label: 'Full Name', description: 'Candidate full name' },
  { key: '{{first_name}}', label: 'First Name', description: 'Candidate first name' },
  { key: '{{email}}', label: 'Email', description: 'Candidate email address' },
  { key: '{{phone}}', label: 'Phone', description: 'Candidate phone number' },
  { key: '{{area}}', label: 'Area', description: 'Geographic area name' },
  { key: '{{start_date}}', label: 'Start Date', description: 'First class date' },
  { key: '{{lead_pay}}', label: 'Lead Pay', description: 'Lead pay rate' },
  { key: '{{assist_pay}}', label: 'Assist Pay', description: 'Assist pay rate' },
  { key: '{{onboarder}}', label: 'Onboarder', description: 'Assigned onboarder name' },
  { key: '{{trainer}}', label: 'Trainer', description: 'Assigned trainer name' },
  { key: '{{status}}', label: 'Status', description: 'Candidate status' },
  { key: '{{portal_username}}', label: 'Portal Username', description: 'Candidate portal login username' },
  { key: '{{portal_password}}', label: 'Portal Password', description: 'Candidate portal login password' },
];

export default function EmailTemplatesPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get('/onboarding/email-templates').then(r => r.data),
  });

  const templates = data?.data || [];
  const selected = templates.find(t => t.id === selectedId);

  const saveMutation = useMutation({
    mutationFn: (data) => isNew
      ? api.post('/onboarding/email-templates', data)
      : api.put(`/onboarding/email-templates/${selectedId}`, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['email-templates']);
      if (isNew && res?.data?.id) { setSelectedId(res.data.id); setIsNew(false); }
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/onboarding/email-templates/${id}`),
    onSuccess: () => { qc.invalidateQueries(['email-templates']); setSelectedId(null); setEditing(null); },
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/onboarding/email-templates/${selectedId}/upload`, fd).then(r => r.data);
    },
    onSuccess: () => qc.invalidateQueries(['email-templates']),
  });

  const removeAttachmentMutation = useMutation({
    mutationFn: (storageName) => api.delete(`/onboarding/email-templates/${selectedId}/attachment/${storageName}`),
    onSuccess: () => qc.invalidateQueries(['email-templates']),
  });

  const startNew = () => {
    setIsNew(true);
    setSelectedId(null);
    setEditing({ name: '', subject: '', body_html: '', category: '' });
  };

  const startEdit = (template) => {
    setIsNew(false);
    setSelectedId(template.id);
    setEditing({ name: template.name, subject: template.subject, body_html: template.body_html, category: template.category || '' });
  };

  const selectTemplate = (t) => {
    setSelectedId(t.id);
    setEditing(null);
    setIsNew(false);
  };

  const insertField = (fieldKey) => {
    const subjectInput = document.getElementById('template-subject');
    if (subjectInput && document.activeElement === subjectInput) {
      const start = subjectInput.selectionStart;
      const end = subjectInput.selectionEnd;
      const val = editing.subject;
      setEditing({ ...editing, subject: val.slice(0, start) + fieldKey + val.slice(end) });
      setTimeout(() => {
        subjectInput.focus();
        subjectInput.setSelectionRange(start + fieldKey.length, start + fieldKey.length);
      }, 0);
    } else if (editorRef.current) {
      editorRef.current.chain().focus().insertContent(fieldKey).run();
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = '';
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <AppShell>
      <PageHeader title="Email Templates" action={
        <Button onClick={startNew}>+ New Template</Button>
      } />

      <div className="p-6 flex gap-6" style={{ minHeight: 'calc(100vh - 140px)' }}>
        {/* Left: template list */}
        <div className="w-64 shrink-0 space-y-1.5 overflow-y-auto">
          {isLoading ? <Spinner className="w-6 h-6 mx-auto" /> : templates.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No templates yet</p>
          ) : templates.map(t => (
            <button key={t.id} onClick={() => selectTemplate(t)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                selectedId === t.id ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white border-gray-200 hover:border-[#1e3a5f]/30'
              }`}>
              <div className="text-sm font-medium truncate">{t.name}</div>
              <div className={`text-xs mt-0.5 truncate ${selectedId === t.id ? 'text-white/60' : 'text-gray-400'}`}>
                {t.subject}
              </div>
              <div className="flex gap-1 mt-1">
                {t.category && (
                  <span className={`text-[10px] inline-block px-1.5 py-0.5 rounded ${
                    selectedId === t.id ? 'bg-white/20 text-white/80' : 'bg-gray-100 text-gray-500'
                  }`}>{t.category}</span>
                )}
                {(t.attachments || []).length > 0 && (
                  <span className={`text-[10px] inline-block px-1.5 py-0.5 rounded ${
                    selectedId === t.id ? 'bg-white/20 text-white/80' : 'bg-blue-50 text-blue-500'
                  }`}>{t.attachments.length} file{t.attachments.length > 1 ? 's' : ''}</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Right: template detail / editor */}
        <div className="flex-1">
          {!selectedId && !isNew ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
              Select a template to view or edit, or create a new one
            </div>
          ) : editing ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">{isNew ? 'New Email Template' : 'Edit Template'}</h3>
                <button onClick={() => { setEditing(null); if (isNew) { setIsNew(false); } }}
                  className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="Template Name" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                <Input label="Category (optional)" value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} placeholder="e.g. Welcome, Follow-up" />
              </div>
              <Input id="template-subject" label="Subject Line" value={editing.subject} onChange={e => setEditing({ ...editing, subject: e.target.value })}
                placeholder="e.g. Welcome to Professor Egghead, {{first_name}}!" />

              {/* Merge fields panel */}
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                <div className="text-xs font-semibold text-gray-600 mb-2">
                  Insert Merge Field <span className="font-normal text-gray-400">— click to insert at cursor (works in subject and body)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MERGE_FIELDS.map(f => (
                    <button key={f.key} type="button" onClick={() => insertField(f.key)}
                      title={f.description}
                      className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-[#1e3a5f] font-mono hover:bg-[#1e3a5f] hover:text-white transition-colors">
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Body</label>
                <RichTextEditor value={editing.body_html} onChange={html => setEditing({ ...editing, body_html: html })}
                  placeholder="Write your email template..." minHeight="250px" editorRef={editorRef} />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                {!isNew && (
                  <button onClick={() => { if (confirm('Delete this template?')) deleteMutation.mutate(selectedId); }}
                    className="text-sm text-red-500 hover:text-red-700 mr-auto">Delete</button>
                )}
                <Button onClick={() => saveMutation.mutate(editing)} disabled={!editing.name || !editing.subject || !editing.body_html || saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving...' : 'Save Template'}
                </Button>
              </div>
              {saveMutation.isError && <p className="text-sm text-red-600">{saveMutation.error?.response?.data?.error || 'Save failed'}</p>}
            </div>
          ) : selected ? (
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">{selected.name}</h3>
                  <div className="text-sm text-gray-500 mt-0.5">Subject: {selected.subject}</div>
                </div>
                <Button variant="secondary" onClick={() => startEdit(selected)}>Edit</Button>
              </div>
              <div className="px-6 py-4">
                <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: selected.body_html }} />
              </div>

              {/* Attachments section */}
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-gray-600 uppercase">Attachments</h4>
                  <div>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-[#1e3a5f] hover:underline font-medium">+ Add File</button>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                  </div>
                </div>
                {(selected.attachments || []).length === 0 ? (
                  <p className="text-xs text-gray-400">No attachments. Files added here will be included when this template is used to email candidates.</p>
                ) : (
                  <div className="space-y-1">
                    {selected.attachments.map(a => (
                      <div key={a.storageName} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded">
                        <span className="text-sm text-gray-700 flex-1">{a.filename}</span>
                        <span className="text-xs text-gray-400">{formatSize(a.size)}</span>
                        <button onClick={() => { if (confirm(`Remove ${a.filename}?`)) removeAttachmentMutation.mutate(a.storageName); }}
                          className="text-xs text-gray-300 hover:text-red-500">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
                {uploadMutation.isPending && <p className="text-xs text-gray-400 mt-1">Uploading...</p>}
                {uploadMutation.isError && <p className="text-xs text-red-600 mt-1">{uploadMutation.error?.response?.data?.error || 'Upload failed'}</p>}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
