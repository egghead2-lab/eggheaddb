import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

const TYPES = ['task', 'document', 'training', 'compliance'];
const ROLES = ['scheduler', 'field_manager', 'recruiter', 'onboarder', 'trainer'];
const ROLE_LABELS = { scheduler: 'Scheduler', field_manager: 'Field Manager', recruiter: 'Recruiter', onboarder: 'Onboarder', trainer: 'Trainer' };
const ROLE_COLORS = { scheduler: 'bg-blue-100 text-blue-700', field_manager: 'bg-emerald-100 text-emerald-700', recruiter: 'bg-teal-100 text-teal-700', onboarder: 'bg-pink-100 text-pink-700', trainer: 'bg-orange-100 text-orange-700' };
const TYPE_COLORS = {
  task: 'bg-gray-100 text-gray-700', document: 'bg-blue-100 text-blue-700',
  training: 'bg-purple-100 text-purple-700', compliance: 'bg-amber-100 text-amber-700',
};

export default function OnboardingRequirementsPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newReq, setNewReq] = useState({ title: '', description: '', category: '', type: 'task', requires_document: false, assigned_role: '', needs_approval: false, due_basis: '', due_days: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-requirements'],
    queryFn: () => api.get('/onboarding/requirements').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/onboarding/requirements', data),
    onSuccess: () => { qc.invalidateQueries(['onboarding-requirements']); setNewReq({ title: '', description: '', category: '', type: 'task', requires_document: false, assigned_role: '', needs_approval: false, due_basis: '', due_days: '' }); setShowAdd(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/onboarding/requirements/${id}`),
    onSuccess: () => qc.invalidateQueries(['onboarding-requirements']),
  });

  const requirements = data?.data || [];
  const categories = [...new Set(requirements.map(r => r.category).filter(Boolean))];

  return (
    <AppShell>
      <PageHeader title="Onboarding Requirements" action={
        <Button onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Cancel' : '+ New Requirement'}</Button>
      } />

      <div className="p-6">
        {showAdd && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input value={newReq.title} onChange={e => setNewReq({ ...newReq, title: e.target.value })} placeholder="Requirement title"
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <input value={newReq.description} onChange={e => setNewReq({ ...newReq, description: e.target.value })} placeholder="Description (optional)"
                className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              <input value={newReq.category} onChange={e => setNewReq({ ...newReq, category: e.target.value })} placeholder="Category (optional)" list="categories"
                className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              <datalist id="categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
              <select value={newReq.type} onChange={e => setNewReq({ ...newReq, type: e.target.value })}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm">
                {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
              <select value={newReq.assigned_role} onChange={e => setNewReq({ ...newReq, assigned_role: e.target.value })}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm">
                <option value="">No role assigned</option>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={newReq.requires_document} onChange={e => setNewReq({ ...newReq, requires_document: e.target.checked })} />
                Requires document
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={newReq.needs_approval} onChange={e => setNewReq({ ...newReq, needs_approval: e.target.checked })} />
                Needs approval
              </label>
              <select value={newReq.due_basis} onChange={e => setNewReq({ ...newReq, due_basis: e.target.value })}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm">
                <option value="">No auto due date</option>
                <option value="days_after_hire">Days after hire</option>
                <option value="days_before_hire">Days before hire</option>
                <option value="days_after_start">Days after start date</option>
                <option value="days_before_start">Days before start date</option>
              </select>
              {newReq.due_basis && (
                <input type="number" value={newReq.due_days} onChange={e => setNewReq({ ...newReq, due_days: e.target.value })}
                  placeholder="# days" className="rounded border border-gray-300 px-3 py-1.5 text-sm w-24" />
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={() => createMutation.mutate(newReq)} disabled={!newReq.title || createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Title</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Category</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Assigned Role</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700 w-20">Doc</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requirements.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">No requirements defined</td></tr>
                ) : requirements.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{r.title}</div>
                      {r.description && <div className="text-xs text-gray-400">{r.description}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{r.category || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[r.type]}`}>{r.type}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.assigned_role ? (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[r.assigned_role] || 'bg-gray-100 text-gray-600'}`}>
                          {ROLE_LABELS[r.assigned_role] || r.assigned_role}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">{r.requires_document ? '📄' : '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => { if (confirm(`Delete "${r.title}"?`)) deleteMutation.mutate(r.id); }}
                        className="text-gray-300 hover:text-red-500 text-xs">Delete</button>
                    </td>
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
