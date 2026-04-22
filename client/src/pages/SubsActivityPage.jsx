import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.floor((now - d) / 86400000);
}

export default function SubsActivityPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['subs-activity'],
    queryFn: () => api.get('/professors/subs-activity').then(r => r.data),
    staleTime: 60 * 1000,
  });

  const subs = data?.data || [];
  const flagged = subs.filter(s => !s.last_session_date || daysAgo(s.last_session_date) > 30);
  const active = subs.filter(s => s.last_session_date && daysAgo(s.last_session_date) <= 30);

  return (
    <AppShell>
      <PageHeader title="Active Substitutes" />
      <div className="p-6 space-y-4 max-w-[1200px]">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Total Substitutes</div>
            <div className="text-2xl font-bold text-gray-800">{subs.length}</div>
          </div>
          <div className={`rounded-lg p-4 border ${active.length > 0 ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
            <div className="text-xs text-gray-500">Active (taught in last 30 days)</div>
            <div className={`text-2xl font-bold ${active.length > 0 ? 'text-green-700' : 'text-gray-300'}`}>{active.length}</div>
          </div>
          <div className={`rounded-lg p-4 border ${flagged.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <div className="text-xs text-gray-500">Flagged for Termination Review</div>
            <div className={`text-2xl font-bold ${flagged.length > 0 ? 'text-red-600' : 'text-gray-300'}`}>{flagged.length}</div>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          Subs who haven't taught a session in the past 30 days are flagged. Review each pay run to decide whether to retain or terminate.
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            {flagged.length > 0 && (
              <Section title={`Flagged for Termination Review — ${flagged.length}`} color="red">
                <SubTable subs={flagged} flagged />
              </Section>
            )}
            {active.length > 0 && (
              <Section title={`Active Subs — ${active.length}`} color="green">
                <SubTable subs={active} />
              </Section>
            )}
            {subs.length === 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <div className="text-gray-600 font-bold text-lg mb-1">No Substitutes</div>
                <div className="text-sm text-gray-400">No professors currently have the Substitute status.</div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Section({ title, color, children }) {
  const borderCls = color === 'red' ? 'border-red-200' : color === 'green' ? 'border-green-200' : 'border-gray-200';
  const titleCls = color === 'red' ? 'text-red-700' : color === 'green' ? 'text-green-700' : 'text-gray-800';
  const bgCls = color === 'red' ? 'bg-red-50' : color === 'green' ? 'bg-green-50' : 'bg-gray-50';
  return (
    <div className={`bg-white rounded-lg border ${borderCls} overflow-hidden`}>
      <div className={`${bgCls} px-4 py-2 border-b ${borderCls}`}>
        <span className={`text-sm font-semibold ${titleCls}`}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function SubTable({ subs, flagged }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Area</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Hire Date</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Last Taught</th>
          <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">30d</th>
          <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">60d</th>
          <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">90d</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600">Contact</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {subs.map(s => {
          const days = s.last_session_date ? daysAgo(s.last_session_date) : null;
          return (
            <tr key={s.id} className={flagged ? 'bg-red-50/20 hover:bg-red-50/40' : 'hover:bg-gray-50'}>
              <td className="px-3 py-2 font-medium">
                <Link to={`/professors/${s.id}`} className="text-[#1e3a5f] hover:underline">{s.professor_nickname} {s.last_name}</Link>
              </td>
              <td className="px-3 py-2 text-gray-600 text-xs">{s.area || '—'}</td>
              <td className="px-3 py-2 text-gray-500 text-xs">{s.hire_date ? formatDate(s.hire_date) : '—'}</td>
              <td className="px-3 py-2 text-xs">
                {s.last_session_date ? (
                  <span className={days > 30 ? 'text-red-600 font-medium' : days > 14 ? 'text-amber-600' : 'text-gray-600'}>
                    {formatDate(s.last_session_date)} <span className="text-gray-400">({days}d ago)</span>
                  </span>
                ) : (
                  <span className="text-red-600 font-medium">Never taught</span>
                )}
              </td>
              <td className={`px-3 py-2 text-center text-sm ${s.count_30d === 0 ? 'text-red-600 font-bold' : 'text-gray-700'}`}>{s.count_30d}</td>
              <td className="px-3 py-2 text-center text-sm text-gray-600">{s.count_60d}</td>
              <td className="px-3 py-2 text-center text-sm text-gray-600">{s.count_90d}</td>
              <td className="px-3 py-2 text-right text-[10px] text-gray-500">
                {s.email && <div className="truncate max-w-[180px]">{s.email}</div>}
                {s.phone_number && <div>{s.phone_number}</div>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
