import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { CopyableTable } from '../../components/ui/CopyableTable';
import { formatPhone } from '../../lib/utils';

const CONTACT_TYPES = ['Emailed', 'Called', 'Left Voicemail', 'Spoke With', 'No Answer'];

export default function SiteCheckInsPage({ toolSelector }) {
  const qc = useQueryClient();
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const [dateFrom, setDateFrom] = useState(weekStart.toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(weekEnd.toISOString().split('T')[0]);
  const [loggingId, setLoggingId] = useState(null);
  const [contactType, setContactType] = useState('');
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['site-check-ins', dateFrom, dateTo],
    queryFn: () => api.get('/client-management/site-check-ins', { params: { date_from: dateFrom, date_to: dateTo } }).then(r => r.data),
  });
  const locations = data?.data || [];
  const sentCount = locations.filter(l => l.sent).length;

  const logMutation = useMutation({
    mutationFn: ({ id, contact_type, notes }) => api.post(`/client-management/site-check-ins/${id}/log`, { contact_type, notes }),
    onSuccess: () => { qc.invalidateQueries(['site-check-ins']); setLoggingId(null); setContactType(''); setNotes(''); },
  });

  return (
    <AppShell>
      {toolSelector}
      <PageHeader title="Site Check-Ins (Retained)" action={
        <span className={`text-xs px-2 py-1 rounded font-medium ${sentCount === locations.length && locations.length > 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {sentCount}/{locations.length} contacted
        </span>
      } />

      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
        <label className="text-xs text-gray-500">From</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs" />
        <label className="text-xs text-gray-500">To</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs" />
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : locations.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No retained locations with active programs in this range</div>
        ) : (
          <CopyableTable className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-12 px-2 py-2"></th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Contact</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Phone</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Email</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Area</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600 w-14">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {locations.map((l, i) => (
                  <>
                    <tr key={l.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-2 py-2 text-center">
                        {l.sent ? (
                          <span className="text-green-600 text-sm">&#10003;</span>
                        ) : (
                          <button onClick={() => setLoggingId(loggingId === l.id ? null : l.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e3a5f] text-white hover:bg-[#152a47]">Log</button>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">{l.school_name || l.nickname}</td>
                      <td className="px-3 py-2 text-gray-700">{l.site_coordinator_name || l.point_of_contact || '—'}</td>
                      <td className="px-2 py-2 text-gray-600">{formatPhone(l.poc_phone)}</td>
                      <td className="px-2 py-2 text-gray-600">{l.site_coordinator_email || l.poc_email || '—'}</td>
                      <td className="px-2 py-2 text-gray-500">{l.geographic_area_name || '—'}</td>
                      <td className="px-2 py-2 text-center">
                        {l.sent ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Done</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">—</span>}
                      </td>
                    </tr>
                    {loggingId === l.id && (
                      <tr key={`${l.id}-log`}>
                        <td colSpan={7} className="bg-blue-50/30 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <select value={contactType} onChange={e => setContactType(e.target.value)}
                              className="rounded border border-gray-300 px-2 py-1 text-xs">
                              <option value="">Contact type...</option>
                              {CONTACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                              placeholder="Notes..."
                              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
                            <Button onClick={() => logMutation.mutate({ id: l.id, contact_type: contactType, notes })}
                              disabled={!contactType || logMutation.isPending}>
                              {logMutation.isPending ? 'Logging...' : 'Log Contact'}
                            </Button>
                            <button onClick={() => setLoggingId(null)} className="text-xs text-gray-500">Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </CopyableTable>
        )}
      </div>
    </AppShell>
  );
}
