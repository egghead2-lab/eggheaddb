import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';

export default function PartyShipmentsPage() {
  const [timeframe, setTimeframe] = useState('upcoming');

  // Get parties (programs with party_format_id)
  const { data, isLoading } = useQuery({
    queryKey: ['party-shipments', timeframe],
    queryFn: () => api.get('/parties', { params: { timeframe: timeframe === 'upcoming' ? 'current' : 'past', limit: 100 } }).then(r => r.data),
  });

  const { data: kitTypesData } = useQuery({
    queryKey: ['party-kit-types'],
    queryFn: () => api.get('/materials/party-kit-types').then(r => r.data),
  });

  const parties = data?.data || [];
  const kitTypes = kitTypesData?.data || [];

  return (
    <AppShell>
      <PageHeader title="Party Shipments">
        <Select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="w-40">
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
        </Select>
        <div className="text-sm text-gray-500">{parties.length} parties</div>
      </PageHeader>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : parties.length === 0 ? (
          <div className="bg-white rounded-lg border p-12 text-center text-gray-400">No parties in this window</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Time</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Professor</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Format</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Theme</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">#Kids</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Location</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Confirmed</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Materials</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parties.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <Link to={`/parties/${p.id}`} className="text-[#1e3a5f] hover:underline font-medium">
                        {p.party_date ? formatDate(p.party_date) : '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{formatTime(p.party_start)}</td>
                    <td className="px-4 py-2.5 text-gray-700">{p.lead_professor_nickname || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{p.party_format_name || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{p.party_theme || p.class_name || '—'}</td>
                    <td className="px-4 py-2.5 text-center text-gray-700">{p.total_kids_attended ?? p.maximum_students ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{p.party_city || p.party_location_text || '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      {p.details_confirmed ? <span className="text-green-600">&#10003;</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {p.materials_prepared ? (
                        <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">Ready</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Kit Types reference */}
        {kitTypes.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Party Kit Types</h3>
            <div className="flex flex-wrap gap-2">
              {kitTypes.map(kt => (
                <span key={kt.id} className="text-xs px-2 py-1 bg-white border border-gray-200 rounded text-gray-600">
                  {kt.kit_name} <span className="text-gray-400">({kt.event_type})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
