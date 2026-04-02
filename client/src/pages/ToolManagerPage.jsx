import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import api from '../api/client';

const NAV_GROUP_OPTIONS = ['Dashboard', 'Operations', 'People', 'Sales', 'Scheduling', 'Curriculum', 'Admin', 'Tools'];

export default function ToolManagerPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newUniversal, setNewUniversal] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tools-admin'],
    queryFn: () => api.get('/tools').then(r => r.data),
  });

  const tools = data?.data || [];
  const roles = data?.roles || [];

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/tools/${id}`, data),
    onSuccess: () => qc.invalidateQueries(['tools-admin']),
  });

  const rolesMutation = useMutation({
    mutationFn: ({ id, role_ids }) => api.put(`/tools/${id}/roles`, { role_ids }),
    onSuccess: () => qc.invalidateQueries(['tools-admin']),
  });

  const createMutation = useMutation({
    mutationFn: (d) => api.post('/tools', d),
    onSuccess: () => { qc.invalidateQueries(['tools-admin']); setShowAdd(false); setNewPath(''); setNewLabel(''); setNewGroup(''); setNewUniversal(false); },
  });

  const toggleRole = (tool, roleId) => {
    const current = tool.role_ids || [];
    const next = current.includes(roleId) ? current.filter(id => id !== roleId) : [...current, roleId];
    rolesMutation.mutate({ id: tool.id, role_ids: next });
  };

  const toggleUniversal = (tool) => {
    updateMutation.mutate({ id: tool.id, data: { universal: tool.universal ? 0 : 1 } });
  };

  // Group tools
  const grouped = {};
  tools.forEach(t => {
    const g = t.nav_group || 'Other';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(t);
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;

  return (
    <AppShell>
      <PageHeader title="Tool Manager" action={
        showAdd ? (
          <div className="flex gap-2 items-center">
            <input type="text" placeholder="/path" value={newPath} onChange={e => setNewPath(e.target.value)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            <input type="text" placeholder="Label" value={newLabel} onChange={e => setNewLabel(e.target.value)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            <select value={newGroup} onChange={e => setNewGroup(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]">
              <option value="">Group…</option>
              {NAV_GROUP_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={newUniversal} onChange={e => setNewUniversal(e.target.checked)} />
              Universal
            </label>
            <Button onClick={() => newPath && newLabel && createMutation.mutate({ path: newPath, label: newLabel, nav_group: newGroup, universal: newUniversal })}
              disabled={!newPath || !newLabel || createMutation.isPending}>
              {createMutation.isPending ? '…' : 'Add'}
            </Button>
            <button onClick={() => setShowAdd(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        ) : (
          <Button onClick={() => setShowAdd(true)}>+ New Tool</Button>
        )
      } />

      <div className="p-6">
        <p className="text-xs text-gray-500 mb-4">
          Admin and CEO roles always have access to all tools. Toggle "All" for universal access, or check individual roles.
        </p>

        {Object.entries(grouped).map(([groupName, groupTools]) => (
          <div key={groupName} className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{groupName}</h3>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-36">Path</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600 w-40">Label</th>
                    <th className="text-center px-2 py-2 font-medium text-gray-600 w-12">All</th>
                    {roles.map(r => (
                      <th key={r.id} className="text-center px-1 py-2 font-medium text-gray-600 text-xs" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', maxWidth: '28px' }}>
                        {r.role_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groupTools.map(tool => (
                    <tr key={tool.id} className={tool.universal ? 'bg-green-50/30' : ''}>
                      <td className="px-4 py-2 text-xs text-gray-500 font-mono">{tool.path}</td>
                      <td className="px-3 py-1">
                        <input defaultValue={tool.label}
                          onBlur={e => { if (e.target.value !== tool.label) updateMutation.mutate({ id: tool.id, data: { label: e.target.value } }); }}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={!!tool.universal} onChange={() => toggleUniversal(tool)}
                          className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                          title="Universal — all roles" />
                      </td>
                      {roles.map(r => (
                        <td key={r.id} className="px-1 py-2 text-center">
                          <input type="checkbox"
                            checked={tool.universal || (tool.role_ids || []).includes(r.id)}
                            disabled={tool.universal}
                            onChange={() => toggleRole(tool, r.id)}
                            className={`w-3.5 h-3.5 rounded border-gray-300 cursor-pointer ${
                              tool.universal ? 'text-green-300' : 'text-[#1e3a5f] focus:ring-[#1e3a5f]'
                            }`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
