import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { RichTextEditor } from '../components/ui/RichTextEditor';

export default function EmailTemplatesPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null); // { name, subject, body_html, category }
  const [isNew, setIsNew] = useState(false);

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
              {t.category && (
                <span className={`text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded ${
                  selectedId === t.id ? 'bg-white/20 text-white/80' : 'bg-gray-100 text-gray-500'
                }`}>{t.category}</span>
              )}
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
              <Input label="Subject Line" value={editing.subject} onChange={e => setEditing({ ...editing, subject: e.target.value })} />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Body</label>
                <RichTextEditor value={editing.body_html} onChange={html => setEditing({ ...editing, body_html: html })} placeholder="Write your email template…" minHeight="250px" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                {!isNew && (
                  <button onClick={() => { if (confirm('Delete this template?')) deleteMutation.mutate(selectedId); }}
                    className="text-sm text-red-500 hover:text-red-700 mr-auto">Delete</button>
                )}
                <Button onClick={() => saveMutation.mutate(editing)} disabled={!editing.name || !editing.subject || !editing.body_html || saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : 'Save Template'}
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
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
