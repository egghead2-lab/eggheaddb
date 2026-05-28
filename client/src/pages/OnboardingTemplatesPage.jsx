import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmButton } from '../components/ui/ConfirmButton';

export default function OnboardingTemplatesPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [addReqId, setAddReqId] = useState('');

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['onboarding-templates'],
    queryFn: () => api.get('/onboarding/templates').then(r => r.data),
  });

  const { data: templateDetail } = useQuery({
    queryKey: ['onboarding-template', selectedId],
    queryFn: () => api.get(`/onboarding/templates/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
  });

  const { data: reqsData } = useQuery({
    queryKey: ['onboarding-requirements'],
    queryFn: () => api.get('/onboarding/requirements').then(r => r.data),
  });

  const templates = templatesData?.data || [];
  const detail = templateDetail?.data || null;
  const allReqs = reqsData?.data || [];
  const usedReqIds = new Set((detail?.items || []).map(i => i.requirement_id));

  const createMutation = useMutation({
    mutationFn: () => api.post('/onboarding/templates', { name: newName }),
    onSuccess: (res) => { qc.invalidateQueries(['onboarding-templates']); setNewName(''); setShowAdd(false); setSelectedId(res.data.id); },
  });

  const addItemMutation = useMutation({
    mutationFn: (reqId) => api.post(`/onboarding/templates/${selectedId}/items`, { requirement_id: reqId }),
    onSuccess: () => { qc.invalidateQueries(['onboarding-template', selectedId]); qc.invalidateQueries(['onboarding-templates']); setAddReqId(''); },
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId) => api.delete(`/onboarding/template-items/${itemId}`),
    onSuccess: () => { qc.invalidateQueries(['onboarding-template', selectedId]); qc.invalidateQueries(['onboarding-templates']); },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id) => api.delete(`/onboarding/templates/${id}`),
    onSuccess: () => { qc.invalidateQueries(['onboarding-templates']); setSelectedId(null); },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }) => api.put(`/onboarding/templates/${id}`, { name }),
    onSuccess: () => { qc.invalidateQueries(['onboarding-templates']); qc.invalidateQueries(['onboarding-template', selectedId]); setEditingName(false); },
  });

  const reorderMutation = useMutation({
    mutationFn: ({ id, item_ids }) => api.put(`/onboarding/templates/${id}/reorder`, { item_ids }),
    onSuccess: () => { qc.invalidateQueries(['onboarding-template', selectedId]); },
  });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  // Move an item up (dir=-1) or down (dir=+1) and persist the new order.
  const moveItem = (index, dir) => {
    const items = detail?.items || [];
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const ids = items.map(i => i.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderMutation.mutate({ id: selectedId, item_ids: ids });
  };

  return (
    <AppShell>
      <PageHeader title="Onboarding Templates" action={
        <Button onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ New Template'}</Button>
      } />

      <div className="p-6 flex gap-6">
        {/* Left: template list */}
        <div className="w-64 shrink-0 space-y-2">
          {showAdd && (
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Template name"
                onKeyDown={e => e.key === 'Enter' && newName && createMutation.mutate()}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              <Button size="sm" onClick={() => createMutation.mutate()} disabled={!newName}>Create</Button>
            </div>
          )}

          {isLoading ? <Spinner className="w-6 h-6 mx-auto" /> : templates.map(t => (
            <button key={t.id} onClick={() => setSelectedId(t.id)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                selectedId === t.id ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white border-gray-200 hover:border-[#1e3a5f]/30'
              }`}>
              <div className="text-sm font-medium">{t.name}</div>
              <div className={`text-xs mt-0.5 ${selectedId === t.id ? 'text-white/60' : 'text-gray-400'}`}>
                {t.item_count} requirement{t.item_count !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
        </div>

        {/* Right: template detail */}
        <div className="flex-1">
          {!selectedId ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
              Select a template to view its requirements
            </div>
          ) : !detail ? (
            <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                {editingName ? (
                  <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && nameDraft.trim()) renameMutation.mutate({ id: selectedId, name: nameDraft.trim() });
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    onBlur={() => { if (nameDraft.trim() && nameDraft.trim() !== detail.name) renameMutation.mutate({ id: selectedId, name: nameDraft.trim() }); else setEditingName(false); }}
                    className="font-bold text-gray-900 rounded border border-[#1e3a5f] px-2 py-0.5 text-base focus:outline-none" />
                ) : (
                  <button type="button" onClick={() => { setNameDraft(detail.name); setEditingName(true); }}
                    className="font-bold text-gray-900 hover:underline decoration-dotted" title="Click to rename">
                    {detail.name}
                  </button>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{detail.items?.length || 0} requirements</span>
                  <ConfirmButton onConfirm={() => deleteTemplateMutation.mutate(selectedId)}
                    className="text-xs text-gray-300 hover:text-red-500">Delete</ConfirmButton>
                </div>
              </div>

              <div className="p-4">
                {(detail.items || []).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No requirements in this template. Add some below.</p>
                ) : (
                  <div className="space-y-1 mb-4">
                    {detail.items.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded">
                        <div className="flex flex-col -my-1 text-gray-300">
                          <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0 || reorderMutation.isPending}
                            className="leading-none hover:text-[#1e3a5f] disabled:opacity-30 disabled:hover:text-gray-300" title="Move up">▲</button>
                          <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === detail.items.length - 1 || reorderMutation.isPending}
                            className="leading-none hover:text-[#1e3a5f] disabled:opacity-30 disabled:hover:text-gray-300" title="Move down">▼</button>
                        </div>
                        <span className="text-xs text-gray-300 w-4 text-right">{idx + 1}</span>
                        <div className="flex-1">
                          <div className="text-sm text-gray-800">{item.title}</div>
                          {item.category && <span className="text-xs text-gray-400">{item.category}</span>}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          item.type === 'document' ? 'bg-blue-100 text-blue-700' :
                          item.type === 'training' ? 'bg-purple-100 text-purple-700' :
                          item.type === 'compliance' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{item.type}</span>
                        {item.due_offset_days && <span className="text-[10px] text-gray-400">+{item.due_offset_days}d</span>}
                        <button onClick={() => removeItemMutation.mutate(item.id)}
                          className="text-gray-300 hover:text-red-500 text-xs">&times;</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add requirement */}
                <div className="flex gap-2 items-center border-t border-gray-100 pt-3">
                  <select value={addReqId} onChange={e => setAddReqId(e.target.value)}
                    className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm">
                    <option value="">Add requirement…</option>
                    {allReqs.filter(r => !usedReqIds.has(r.id)).map(r => (
                      <option key={r.id} value={r.id}>{r.title} ({r.type})</option>
                    ))}
                  </select>
                  <Button size="sm" onClick={() => addItemMutation.mutate(addReqId)} disabled={!addReqId}>Add</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
