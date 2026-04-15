import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';

const STATUS_COLORS = {
  confirmed: 'bg-green-100 text-green-700',
  no_outstanding: 'bg-amber-100 text-amber-700',
  unrecognized_response: 'bg-red-100 text-red-700',
  unknown_sender: 'bg-gray-100 text-gray-500',
  ignored: 'bg-gray-100 text-gray-400',
};
const STATUS_LABELS = {
  confirmed: 'Auto-Confirmed',
  no_outstanding: 'No Outstanding Classes',
  unrecognized_response: 'Unrecognized',
  unknown_sender: 'Unknown Number',
  ignored: 'Ignored',
};

export default function TwilioResponsesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['twilio-responses'],
    queryFn: () => api.get('/notifications/responses').then(r => r.data),
  });
  const responses = data?.data || [];

  return (
    <AppShell>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <Link to="/notifications" className="text-sm text-gray-500 hover:text-[#1e3a5f]">&larr; Back to Notifications</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Twilio Responses</h1>
        <p className="text-sm text-gray-500">Inbound SMS from the last 24 hours</p>
      </div>
      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
        ) : responses.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No responses in the last 24 hours</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Time</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">From</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Professor</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Message</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Matched</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {responses.map((r, i) => {
                  const status = r.match_status || 'unknown_sender';
                  const isAlert = status === 'unrecognized_response' || status === 'no_outstanding';
                  return (
                    <tr key={r.id || i} className={isAlert ? 'bg-red-50/30' : i % 2 ? 'bg-gray-50/30' : ''}>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                        {r.received_at ? new Date(r.received_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{r.from_phone || '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        {r.professor_name || <span className="text-gray-400">Unknown</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`font-medium ${isAlert ? 'text-red-700' : 'text-gray-700'}`}>
                          "{r.body || '—'}"
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-500">
                        {r.matched_count > 0 ? <span className="text-green-700 font-medium">{r.matched_count} class{r.matched_count !== 1 ? 'es' : ''}</span> : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABELS[status] || status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
