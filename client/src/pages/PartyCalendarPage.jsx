import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';

export default function PartyCalendarPage() {
  const qc = useQueryClient();
  const [preview, setPreview] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['party-calendar-pending'],
    queryFn: () => api.get('/parties/calendar/pending').then(r => r.data),
  });
  const parties = data?.data || [];

  const previewMutation = useMutation({
    mutationFn: (id) => api.post(`/parties/${id}/calendar?dry_run=true`).then(r => r.data),
    onSuccess: (res) => setPreview(res),
  });

  const addMutation = useMutation({
    mutationFn: (id) => api.post(`/parties/${id}/calendar`),
    onSuccess: () => qc.invalidateQueries(['party-calendar-pending']),
  });

  const addAllMutation = useMutation({
    mutationFn: async () => {
      for (const p of parties) {
        await api.post(`/parties/${p.id}/calendar`);
      }
    },
    onSuccess: () => qc.invalidateQueries(['party-calendar-pending']),
  });

  return (
    <AppShell>
      <PageHeader title="Party Calendar" action={
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-600 font-medium">{parties.length} pending</span>
          {parties.length > 0 && (
            <Button onClick={() => { if (confirm(`Add all ${parties.length} parties to Google Calendar?`)) addAllMutation.mutate(); }}
              disabled={addAllMutation.isPending}>
              {addAllMutation.isPending ? 'Adding all…' : 'Add All to Calendar'}
            </Button>
          )}
        </div>
      } />

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : parties.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">All confirmed parties are on the calendar</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Party</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Time</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Location</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Professor</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Contact</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Birthday</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parties.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2">
                      <Link to={`/parties/${p.id}`} className="text-[#1e3a5f] hover:underline font-medium">{p.program_nickname}</Link>
                      <div className="text-[10px] text-gray-400">{p.party_format_name} {p.party_theme ? `— ${p.party_theme}` : ''}</div>
                    </td>
                    <td className="px-2 py-2 text-gray-600">{formatDate(p.first_session_date)}</td>
                    <td className="px-2 py-2 text-gray-600">{p.start_time ? formatTime(p.start_time) : '—'}</td>
                    <td className="px-2 py-2 text-gray-600 truncate max-w-[150px]">{p.party_location_text || '—'}</td>
                    <td className="px-2 py-2 text-gray-600">{p.lead_professor_name || '—'}</td>
                    <td className="px-2 py-2 text-gray-600">{p.contact_name || '—'}</td>
                    <td className="px-2 py-2 text-gray-600">
                      {p.birthday_kid_name ? `${p.birthday_kid_name}${p.birthday_kid_age ? ` (${p.birthday_kid_age})` : ''}` : '—'}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => previewMutation.mutate(p.id)} disabled={previewMutation.isPending}
                          className="text-[10px] text-gray-500 hover:text-[#1e3a5f] underline">
                          Preview
                        </button>
                        <button onClick={() => addMutation.mutate(p.id)} disabled={addMutation.isPending}
                          className="text-xs text-white bg-[#1e3a5f] px-2 py-0.5 rounded hover:bg-[#152a47] disabled:opacity-50">
                          Add
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Preview panel */}
        {preview?.event && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-blue-800">Preview (Dry Run — nothing sent)</div>
              <button onClick={() => setPreview(null)} className="text-xs text-gray-400 hover:text-gray-600">&times; Close</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-blue-600 font-medium">Summary:</span> {preview.event.summary}</div>
              <div><span className="text-blue-600 font-medium">Location:</span> {preview.event.location}</div>
              <div><span className="text-blue-600 font-medium">Start:</span> {preview.event.start?.dateTime}</div>
              <div><span className="text-blue-600 font-medium">End:</span> {preview.event.end?.dateTime}</div>
              <div><span className="text-blue-600 font-medium">Calendar:</span> {preview.calendarId}</div>
              <div><span className="text-blue-600 font-medium">Attendees:</span> {preview.event.attendees?.map(a => a.email).join(', ')}</div>
            </div>
            <div className="mt-2">
              <span className="text-blue-600 font-medium text-xs">Description:</span>
              <pre className="text-xs text-gray-700 bg-white rounded p-2 mt-1 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto border border-blue-100">{preview.event.description}</pre>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
