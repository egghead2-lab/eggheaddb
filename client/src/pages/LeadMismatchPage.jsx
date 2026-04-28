import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

export default function LeadMismatchPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['lead-mismatches'],
    queryFn: () => api.get('/schedule/lead-mismatches').then(r => r.data),
  });
  const programs = data?.data || [];

  const clearProgramMut = useMutation({
    mutationFn: (programId) => api.post(`/schedule/clear-lead-mismatch/${programId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-mismatches'] });
      setExpanded(null);
    },
  });

  return (
    <AppShell>
      <PageHeader title="Stale Future Leads" />
      <div className="p-6 max-w-5xl">
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          Future sessions where the assigned <strong>session-level professor</strong> doesn't match the
          program's current Lead. These are usually stale pre-populations from before the program lead
          was reassigned. Clearing sets <code>session.professor_id</code> to NULL, which lets payroll fall
          back to the program's current lead at runtime.
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : programs.length === 0 ? (
          <div className="bg-white rounded-lg border border-green-200 p-12 text-center">
            <div className="text-green-600 font-bold text-lg mb-1">All Clear</div>
            <div className="text-sm text-gray-400">No future sessions have stale leads</div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Current Lead</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Stale on Sessions</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Mismatched</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-40">Date Range</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 w-44"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {programs.map(p => (
                  <Row key={p.program_id} p={p}
                    expanded={expanded === p.program_id}
                    onToggle={() => setExpanded(expanded === p.program_id ? null : p.program_id)}
                    onClearProgram={() => clearProgramMut.mutate(p.program_id)}
                    clearing={clearProgramMut.isPending && clearProgramMut.variables === p.program_id} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Row({ p, expanded, onToggle, onClearProgram, clearing }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <tr className="hover:bg-gray-50/50">
        <td className="px-3 py-2">
          <Link to={`/programs/${p.program_id}`} className="text-[#1e3a5f] hover:underline font-medium">{p.program_nickname}</Link>
        </td>
        <td className="px-3 py-2 text-gray-700">{p.current_lead_name || <span className="text-gray-400">—</span>}</td>
        <td className="px-3 py-2 text-amber-700 text-xs">{p.stale_leads || '—'}</td>
        <td className="px-3 py-2 text-center font-medium">{p.mismatched_count}</td>
        <td className="px-3 py-2 text-xs text-gray-500">{formatDate(p.earliest_date)} — {formatDate(p.latest_date)}</td>
        <td className="px-3 py-2 text-right">
          <button onClick={onToggle} className="text-xs text-gray-500 hover:text-gray-700 mr-2">
            {expanded ? 'Hide' : 'Review'}
          </button>
          {confirming ? (
            <>
              <button onClick={() => { onClearProgram(); setConfirming(false); }} disabled={clearing}
                className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 font-medium">
                {clearing ? '…' : 'Confirm Clear'}
              </button>
              <button onClick={() => setConfirming(false)} className="text-xs ml-1 text-gray-400">Cancel</button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)}
              className="text-xs px-2 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 font-medium">
              Clear All
            </button>
          )}
        </td>
      </tr>
      {expanded && <ExpandedRow programId={p.program_id} />}
    </>
  );
}

function ExpandedRow({ programId }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['lead-mismatches', programId],
    queryFn: () => api.get(`/schedule/lead-mismatches/${programId}`).then(r => r.data),
  });
  const sessions = data?.data || [];

  const clearOneMut = useMutation({
    mutationFn: (sessionId) => api.post(`/schedule/clear-lead-mismatch-session/${sessionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-mismatches'] });
      qc.invalidateQueries({ queryKey: ['lead-mismatches', programId] });
    },
  });

  return (
    <tr className="bg-gray-50/50">
      <td colSpan={6} className="px-6 py-3">
        {isLoading ? <Spinner className="w-4 h-4" /> : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left py-1">Date</th>
                <th className="text-left py-1">Stale Lead</th>
                <th className="text-right py-1 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className="border-t border-gray-200">
                  <td className="py-1">{formatDate(s.session_date)}</td>
                  <td className="py-1 text-amber-700">{s.stale_lead_name}</td>
                  <td className="py-1 text-right">
                    <button onClick={() => clearOneMut.mutate(s.id)} disabled={clearOneMut.isPending}
                      className="text-[10px] px-2 py-0.5 bg-amber-500 text-white rounded hover:bg-amber-600">
                      {clearOneMut.isPending && clearOneMut.variables === s.id ? '…' : 'Clear'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}
