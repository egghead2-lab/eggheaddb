import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

export default function RosterApprovalsPage() {
  const { user } = useAuth();
  const isAdmin = ['Admin', 'CEO'].includes(user?.role);
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(isAdmin);
  const [selected, setSelected] = useState(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['pending-roster', showAll],
    queryFn: () => api.get('/programs/pending-roster', { params: { show_all: showAll ? 'true' : undefined } }).then(r => r.data),
  });
  const items = data?.data || [];

  const approveMutation = useMutation({
    mutationFn: (roster_ids) => api.post('/programs/pending-roster/approve', { roster_ids }),
    onSuccess: () => { qc.invalidateQueries(['pending-roster']); qc.invalidateQueries(['sidebar-counts']); setSelected(new Set()); },
  });

  const rejectMutation = useMutation({
    mutationFn: (roster_ids) => api.post('/programs/pending-roster/reject', { roster_ids }),
    onSuccess: () => { qc.invalidateQueries(['pending-roster']); qc.invalidateQueries(['sidebar-counts']); setSelected(new Set()); },
  });

  const toggleSelect = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelected(prev => prev.size === items.length ? new Set() : new Set(items.map(i => i.roster_id)));

  // Group by program
  const byProgram = {};
  items.forEach(i => {
    if (!byProgram[i.program_id]) byProgram[i.program_id] = { ...i, students: [] };
    byProgram[i.program_id].students.push(i);
  });

  return (
    <AppShell>
      <PageHeader title="Roster Approvals" action={
        <div className="flex items-center gap-3">
          {items.length > 0 && (
            <>
              <button onClick={selectAll} className="text-xs text-gray-500 hover:text-gray-700 underline">
                {selected.size === items.length ? 'Deselect All' : 'Select All'}
              </button>
              {selected.size > 0 && (
                <>
                  <Button size="sm" onClick={() => approveMutation.mutate([...selected])} disabled={approveMutation.isPending}>
                    {approveMutation.isPending ? '…' : `Approve ${selected.size}`}
                  </Button>
                  <button onClick={() => rejectMutation.mutate([...selected])} disabled={rejectMutation.isPending}
                    className="text-xs text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-50">
                    Reject {selected.size}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      }>
        {isAdmin && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" />
            Show all areas
          </label>
        )}
      </PageHeader>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">No pending roster approvals</div>
        ) : (
          <div className="space-y-4">
            {Object.values(byProgram).map(prog => (
              <div key={prog.program_id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <Link to={`/programs/${prog.program_id}`} className="text-sm font-medium text-[#1e3a5f] hover:underline">{prog.program_nickname}</Link>
                    <span className="text-xs text-gray-400 ml-2">{prog.location_nickname || ''}</span>
                  </div>
                  <span className="text-xs text-amber-600 font-medium">{prog.students.length} pending</span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {prog.students.map(s => (
                      <tr key={s.roster_id} className={selected.has(s.roster_id) ? 'bg-blue-50/30' : ''}>
                        <td className="px-3 py-2 w-8">
                          <input type="checkbox" checked={selected.has(s.roster_id)} onChange={() => toggleSelect(s.roster_id)}
                            className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f]" />
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900">{s.student_last ? `${s.student_last}, ` : ''}{s.student_first}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{s.added_by_name || '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-400">{s.date_applied ? formatDate(s.date_applied) : '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-400">{s.roster_notes || ''}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => approveMutation.mutate([s.roster_id])}
                            className="text-xs text-green-600 hover:underline mr-2">Accept</button>
                          <button onClick={() => rejectMutation.mutate([s.roster_id])}
                            className="text-xs text-red-500 hover:underline">Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
