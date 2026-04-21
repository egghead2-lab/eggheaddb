import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { PayrollTabBar } from './PayrollDashboardPage';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatCurrency } from '../lib/utils';
import api from '../api/client';

const CYCLE_NAMES = ['Fall', 'Winter', 'Spring', 'Summer'];

const STATUS_STYLES = {
  Draft: 'bg-gray-100 text-gray-700',
  Calculated: 'bg-blue-100 text-blue-700',
  Pushed: 'bg-green-100 text-green-700',
};

export default function GasReimbursementsPage() {
  const qc = useQueryClient();
  const [selectedCycleId, setSelectedCycleId] = useState(null);
  const [expandedEntryId, setExpandedEntryId] = useState(null);
  const [newCycle, setNewCycle] = useState({ cycle_name: 'Fall', cycle_year: new Date().getFullYear(), start_date: '', end_date: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmPushAll, setConfirmPushAll] = useState(false);
  const [actionResult, setActionResult] = useState(null);

  const { data: cyclesData, isLoading: cyclesLoading } = useQuery({
    queryKey: ['gas-cycles'],
    queryFn: () => api.get('/gas-reimbursements/cycles').then(r => r.data),
  });
  const cycles = cyclesData?.data || [];

  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['gas-entries', selectedCycleId],
    queryFn: () => api.get(`/gas-reimbursements/cycles/${selectedCycleId}/entries`).then(r => r.data),
    enabled: !!selectedCycleId,
  });
  const entries = entriesData?.data || [];

  const selectedCycle = cycles.find(c => c.id === selectedCycleId);

  const createCycleMut = useMutation({
    mutationFn: (d) => api.post('/gas-reimbursements/cycles', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['gas-cycles']); setNewCycle({ ...newCycle, start_date: '', end_date: '' }); },
    onError: (err) => setActionResult({ error: err.response?.data?.error || 'Failed' }),
  });

  const deleteCycleMut = useMutation({
    mutationFn: (id) => api.delete(`/gas-reimbursements/cycles/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['gas-cycles']); setConfirmDelete(null); if (confirmDelete === selectedCycleId) setSelectedCycleId(null); },
    onError: (err) => setActionResult({ error: err.response?.data?.error || 'Failed' }),
  });

  const calcCycleMut = useMutation({
    mutationFn: (id) => api.post(`/gas-reimbursements/cycles/${id}/calculate`, {}, { timeout: 600000 }).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries(['gas-cycles']);
      qc.invalidateQueries(['gas-entries', selectedCycleId]);
      setActionResult({ success: `Calculated ${data.processedCount} professors` });
    },
    onError: (err) => setActionResult({ error: err.response?.data?.error || 'Failed' }),
  });

  const pushAllMut = useMutation({
    mutationFn: (id) => api.post(`/gas-reimbursements/cycles/${id}/push-all`).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries(['gas-cycles']);
      qc.invalidateQueries(['gas-entries', selectedCycleId]);
      setConfirmPushAll(false);
      setActionResult({ success: `Pushed ${data.pushed} to payroll (${data.errors} errors)` });
    },
    onError: (err) => setActionResult({ error: err.response?.data?.error || 'Failed' }),
  });

  const pushEntryMut = useMutation({
    mutationFn: (id) => api.post(`/gas-reimbursements/entries/${id}/push`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['gas-entries', selectedCycleId]),
  });

  const recalcEntryMut = useMutation({
    mutationFn: (id) => api.post(`/gas-reimbursements/entries/${id}/recalculate`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['gas-entries', selectedCycleId]),
  });

  const totalAmount = entries.reduce((s, e) => s + parseFloat(e.total_amount || 0), 0);
  const pushedCount = entries.filter(e => e.status === 'Pushed').length;

  return (
    <AppShell>
      <PayrollTabBar />
      <div className="p-6 space-y-4 max-w-[1200px]">
        {actionResult?.success && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 flex justify-between items-center">
            <span className="text-sm text-green-700">{actionResult.success}</span>
            <button onClick={() => setActionResult(null)} className="text-xs text-green-500">Dismiss</button>
          </div>
        )}
        {actionResult?.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex justify-between items-center">
            <span className="text-sm text-red-700">{actionResult.error}</span>
            <button onClick={() => setActionResult(null)} className="text-xs text-red-500">Dismiss</button>
          </div>
        )}

        {/* Cycles list + create */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">Reimbursement Cycles</h2>
            <div className="text-xs text-gray-500">4 per year — Fall, Winter, Spring, Summer</div>
          </div>

          <div className="flex items-end gap-2 mb-3 pb-3 border-b border-gray-100">
            <div>
              <label className="text-[10px] text-gray-500">Cycle</label>
              <select value={newCycle.cycle_name} onChange={e => setNewCycle({ ...newCycle, cycle_name: e.target.value })}
                className="block rounded border border-gray-300 px-2 py-1 text-xs w-24">
                {CYCLE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Year</label>
              <input type="number" value={newCycle.cycle_year} onChange={e => setNewCycle({ ...newCycle, cycle_year: Number(e.target.value) })}
                className="block rounded border border-gray-300 px-2 py-1 text-xs w-20" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Start</label>
              <input type="date" value={newCycle.start_date} onChange={e => setNewCycle({ ...newCycle, start_date: e.target.value })}
                className="block rounded border border-gray-300 px-2 py-1 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">End</label>
              <input type="date" value={newCycle.end_date} onChange={e => setNewCycle({ ...newCycle, end_date: e.target.value })}
                className="block rounded border border-gray-300 px-2 py-1 text-xs" />
            </div>
            <Button size="sm" onClick={() => createCycleMut.mutate(newCycle)}
              disabled={!newCycle.start_date || !newCycle.end_date || createCycleMut.isPending}>
              Create Cycle
            </Button>
          </div>

          {cyclesLoading ? <Spinner className="w-5 h-5" /> : cycles.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-4">No cycles yet — create one above</div>
          ) : (
            <div className="grid grid-cols-1 gap-1">
              {cycles.map(c => (
                <div key={c.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded border text-sm cursor-pointer transition ${selectedCycleId === c.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                  onClick={() => setSelectedCycleId(c.id)}>
                  <span className="font-medium text-gray-800 w-32">{c.cycle_name} {c.cycle_year}</span>
                  <span className="text-xs text-gray-500">{formatDate(c.start_date)} — {formatDate(c.end_date)}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ml-auto ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                  <div className="flex items-center gap-2 ml-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => calcCycleMut.mutate(c.id)} disabled={calcCycleMut.isPending}
                      className="text-xs text-[#1e3a5f] hover:underline disabled:opacity-50">
                      {calcCycleMut.isPending && calcCycleMut.variables === c.id ? 'Calculating...' : c.status === 'Draft' ? 'Calculate' : 'Recalculate'}
                    </button>
                    {confirmDelete === c.id ? (
                      <span className="flex items-center gap-1">
                        <button onClick={() => deleteCycleMut.mutate(c.id)}
                          className="text-xs px-2 py-0.5 bg-red-500 text-white rounded font-medium">Yes Delete</button>
                        <button onClick={() => setConfirmDelete(null)} className="text-[10px] text-gray-400">Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDelete(c.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected cycle entries */}
        {selectedCycleId && selectedCycle && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800">{selectedCycle.cycle_name} {selectedCycle.cycle_year}</div>
                <div className="text-xs text-gray-500">{formatDate(selectedCycle.start_date)} — {formatDate(selectedCycle.end_date)} · {entries.length} professors · Total {formatCurrency(totalAmount)} · {pushedCount} pushed</div>
              </div>
              {entries.some(e => e.status === 'Draft' && parseFloat(e.total_amount) > 0) && (
                confirmPushAll ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Push all non-zero drafts to payroll?</span>
                    <button onClick={() => pushAllMut.mutate(selectedCycleId)} disabled={pushAllMut.isPending}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded font-medium">
                      {pushAllMut.isPending ? 'Pushing...' : 'Yes, Push All'}
                    </button>
                    <button onClick={() => setConfirmPushAll(false)} className="text-xs text-gray-400">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmPushAll(true)}
                    className="text-xs px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 font-medium">
                    Push All to Payroll
                  </button>
                )
              )}
            </div>

            {entriesLoading ? (
              <div className="flex justify-center py-8"><Spinner className="w-6 h-6" /></div>
            ) : entries.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No data — click Calculate on the cycle above</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Area</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Sessions</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Total</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600 w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map(e => (
                    <FragRow key={e.id}>
                      <tr onClick={() => setExpandedEntryId(expandedEntryId === e.id ? null : e.id)}
                        className={`cursor-pointer hover:bg-gray-50 ${expandedEntryId === e.id ? 'bg-blue-50/40' : ''}`}>
                        <td className="px-3 py-1.5 font-medium">
                          <Link to={`/professors/${e.professor_id}`} onClick={ev => ev.stopPropagation()}
                            className="text-[#1e3a5f] hover:underline">{e.professor_nickname} {e.last_name}</Link>
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">{e.area || '—'}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{e.num_sessions}</td>
                        <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatCurrency(e.total_amount)}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_STYLES[e.status]}`}>{e.status}</span>
                        </td>
                        <td className="px-3 py-1.5 text-center" onClick={ev => ev.stopPropagation()}>
                          <div className="flex gap-2 justify-center">
                            {e.status === 'Draft' && (
                              <>
                                <button onClick={() => recalcEntryMut.mutate(e.id)}
                                  className="text-xs text-[#1e3a5f] hover:underline">Recalc</button>
                                {parseFloat(e.total_amount) > 0 && (
                                  <button onClick={() => pushEntryMut.mutate(e.id)}
                                    disabled={pushEntryMut.isPending}
                                    className="text-xs text-green-600 hover:underline font-medium">Push</button>
                                )}
                              </>
                            )}
                            {e.status === 'Pushed' && e.pushed_by && (
                              <span className="text-[10px] text-gray-400">by {e.pushed_by}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedEntryId === e.id && (
                        <tr>
                          <td colSpan={6} className="bg-gray-50/80 px-4 py-3">
                            <EntryDetail entryId={e.id} />
                          </td>
                        </tr>
                      )}
                    </FragRow>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr className="font-bold text-xs">
                    <td colSpan={3} className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right text-green-700">{formatCurrency(totalAmount)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function FragRow({ children }) { return <>{children}</>; }

function EntryDetail({ entryId }) {
  const [expandedProgs, setExpandedProgs] = useState(new Set());
  const { data, isLoading } = useQuery({
    queryKey: ['gas-entry-detail', entryId],
    queryFn: () => api.get(`/gas-reimbursements/entries/${entryId}`).then(r => r.data),
  });
  if (isLoading) return <Spinner className="w-4 h-4" />;
  const entry = data?.data;
  const lines = entry?.lines || [];
  if (lines.length === 0) return <div className="text-xs text-gray-400">No line items</div>;

  // Group by program
  const byProgram = {};
  lines.forEach(l => {
    const key = l.program_id || 'unknown';
    if (!byProgram[key]) byProgram[key] = { program_id: l.program_id, program_nickname: l.program_nickname, location_nickname: l.location_nickname, lines: [] };
    byProgram[key].lines.push(l);
  });

  const groups = Object.values(byProgram).sort((a, b) => (a.program_nickname || '').localeCompare(b.program_nickname || ''));

  const toggleProg = (pid) => setExpandedProgs(prev => {
    const next = new Set(prev);
    next.has(pid) ? next.delete(pid) : next.add(pid);
    return next;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>Home: <span className="text-gray-700">{entry.home_address || 'No address on file'}</span></span>
        <div className="flex gap-3">
          <button onClick={() => setExpandedProgs(new Set(groups.map(g => g.program_id)))}
            className="text-[#1e3a5f] hover:underline">Expand all</button>
          <button onClick={() => setExpandedProgs(new Set())}
            className="text-gray-400 hover:text-gray-600">Collapse all</button>
        </div>
      </div>

      {groups.map(g => {
        const total = g.lines.reduce((s, l) => s + parseFloat(l.amount || 0), 0);
        const paidSessions = g.lines.filter(l => parseFloat(l.amount || 0) > 0).length;
        const expanded = expandedProgs.has(g.program_id);
        const firstLine = g.lines[0];

        return (
          <div key={g.program_id || 'unknown'} className="bg-white rounded border border-gray-200 overflow-hidden">
            <button onClick={() => toggleProg(g.program_id)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left">
              <span className="text-gray-400 text-[10px] w-3">{expanded ? '▾' : '▸'}</span>
              <Link to={`/programs/${g.program_id}`} onClick={e => e.stopPropagation()}
                className="font-medium text-[#1e3a5f] hover:underline text-xs truncate max-w-[400px]">{g.program_nickname}</Link>
              <span className="text-[10px] text-gray-400">{g.location_nickname}</span>
              <span className="text-[10px] text-gray-500 ml-auto">{g.lines.length} session{g.lines.length !== 1 ? 's' : ''}{paidSessions !== g.lines.length ? ` (${paidSessions} paid)` : ''}</span>
              <span className="text-[10px] text-gray-400">{firstLine?.miles != null ? `${parseFloat(firstLine.miles).toFixed(1)}mi` : '—'}</span>
              <span className="text-xs font-bold text-green-700 w-16 text-right">{formatCurrency(total)}</span>
            </button>

            {expanded && (
              <div className="border-t border-gray-100 px-3 py-2 space-y-0.5 bg-gray-50/50">
                {g.lines
                  .slice()
                  .sort((a, b) => a.session_date.localeCompare(b.session_date))
                  .map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-[11px] text-gray-500">
                      <span className="text-gray-600 w-16">{formatDate(l.session_date)}</span>
                      <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${l.leg_type === 'primary' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {l.leg_type === 'primary' ? '1st' : '2nd+'}
                      </span>
                      <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${l.role === 'Lead' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {l.role}
                      </span>
                      <span className="text-gray-600 ml-auto">{l.miles != null ? `${parseFloat(l.miles).toFixed(1)}mi` : '—'}</span>
                      <span className="text-gray-400 text-[9px] min-w-[80px] text-right">{l.calc_method}</span>
                      <span className={`font-medium w-16 text-right ${parseFloat(l.amount) > 0 ? 'text-gray-700' : 'text-gray-400'}`}>{formatCurrency(l.amount)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
