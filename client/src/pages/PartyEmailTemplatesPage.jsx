import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

export default function PartyEmailTemplatesPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', subject: '', body: '' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', subject: '', body: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['party-email-templates'],
    queryFn: () => api.get('/parties/email-templates').then(r => r.data),
  });
  const templates = data?.data || [];

  const addMutation = useMutation({
    mutationFn: (d) => api.post('/parties/email-templates', d),
    onSuccess: () => { qc.invalidateQueries(['party-email-templates']); setShowAdd(false); setAddForm({ name: '', subject: '', body: '' }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/parties/email-templates/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['party-email-templates']); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/parties/email-templates/${id}`),
    onSuccess: () => qc.invalidateQueries(['party-email-templates']),
  });

  const defaultMutation = useMutation({
    mutationFn: (id) => api.put(`/parties/email-templates/${id}`, { is_default: 1 }),
    onSuccess: () => qc.invalidateQueries(['party-email-templates']),
  });

  return (
    <AppShell>
      <PageHeader title="Party Email Templates" action={
        !showAdd ? (
          <Button onClick={() => setShowAdd(true)}>+ New Template</Button>
        ) : null
      } />

      <div className="p-6 max-w-[800px]">
        <p className="text-xs text-gray-500 mb-4">
          Templates use variables like {'{{contact_name}}, {{party_date}}, {{party_time}}, {{party_format}}, {{party_theme}}, {{location}}, {{address}}, {{lead_professor}}, {{lead_phone}}, {{program_name}}, {{duration}}'} which get filled automatically.
        </p>

        {showAdd && (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-6 space-y-3">
            <div className="text-sm font-semibold text-gray-700">New Template</div>
            <Input label="Name" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="Subject" value={addForm.subject} onChange={e => setAddForm(f => ({ ...f, subject: e.target.value }))} placeholder="Party Confirmation - {{party_date}}" />
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Body</label>
              <textarea value={addForm.body} onChange={e => setAddForm(f => ({ ...f, body: e.target.value }))} rows={8}
                placeholder="Hi {{contact_name}},&#10;&#10;This is a confirmation..."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] font-mono" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => addMutation.mutate(addForm)} disabled={!addForm.name || !addForm.subject || !addForm.body || addMutation.isPending}>
                {addMutation.isPending ? '…' : 'Create'}
              </Button>
              <button onClick={() => setShowAdd(false)} className="text-sm text-gray-500">Cancel</button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="w-8 h-8" /></div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No templates yet</div>
        ) : (
          <div className="space-y-4">
            {templates.map(t => (
              <div key={t.id} className="bg-white rounded-lg border border-gray-200">
                {editingId === t.id ? (
                  <div className="p-4 space-y-3">
                    <Input label="Name" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                    <Input label="Subject" value={editForm.subject} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} />
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">Body</label>
                      <textarea value={editForm.body} onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))} rows={8}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] font-mono" />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => updateMutation.mutate({ id: t.id, data: editForm })} disabled={updateMutation.isPending}>Save</Button>
                      <button onClick={() => setEditingId(null)} className="text-sm text-gray-500">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{t.name}</span>
                        {t.is_default ? (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Default</span>
                        ) : (
                          <button onClick={() => defaultMutation.mutate(t.id)} className="text-[10px] text-gray-400 hover:text-[#1e3a5f]">Set as default</button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingId(t.id); setEditForm({ name: t.name, subject: t.subject, body: t.body }); }}
                          className="text-xs text-[#1e3a5f] hover:underline">Edit</button>
                        <button onClick={() => { if (confirm('Delete this template?')) deleteMutation.mutate(t.id); }}
                          className="text-xs text-red-500 hover:underline">Delete</button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 mb-1"><strong>Subject:</strong> {t.subject}</div>
                    <pre className="text-xs text-gray-500 bg-gray-50 rounded p-2 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">{t.body}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
