import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { Section } from './ui/Section';
import { Spinner } from './ui/Spinner';
import { CopyTableButton, CopyButton } from './ui/CopyTableButton';
import { formatDate, formatCurrency } from '../lib/utils';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TYPE_BADGE = {
  science: 'bg-purple-100 text-purple-700',
  engineering: 'bg-green-100 text-green-700',
  robotics: 'bg-blue-100 text-blue-700',
  'financial literacy': 'bg-yellow-100 text-yellow-800',
  party: 'bg-pink-100 text-pink-700',
  camp: 'bg-orange-100 text-orange-700',
};

function getDays(prog) {
  return DAYS.map((d, i) => prog[d] ? DAY_SHORT[i] : null).filter(Boolean).join(', ');
}

function getTypeBadge(name) {
  const key = (name || '').toLowerCase();
  for (const [k, v] of Object.entries(TYPE_BADGE)) {
    if (key.includes(k)) return v;
  }
  return 'bg-gray-100 text-gray-600';
}

export default function PastProgramsPanel({ locationId }) {
  const tableRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['past-programs', locationId],
    queryFn: () => api.get(`/locations/${locationId}/past-programs`).then(r => r.data),
    enabled: !!locationId,
  });
  const programs = data?.data || [];

  if (!locationId) return null;

  return (
    <Section title={`Past Programs at This Location (${isLoading ? '...' : programs.length})`} defaultOpen={programs.length > 0 || isLoading}
      action={
        programs.length > 0 && <CopyTableButton tableRef={tableRef} />
      }>
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner className="w-5 h-5" /></div>
      ) : programs.length === 0 ? (
        <p className="text-sm text-gray-400">No programs have been booked at this location</p>
      ) : (
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">Program</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">Type</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">Status</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">Day(s)</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">Start</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">End</th>
                <th className="text-right px-2 py-1.5 font-medium text-gray-600">Cost/Sess</th>
                <th className="text-right px-2 py-1.5 font-medium text-gray-600">Our Cut</th>
                <th className="text-right px-2 py-1.5 font-medium text-gray-600">Lab Fee</th>
                <th className="text-center px-2 py-1.5 font-medium text-gray-600">Enrolled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {programs.map((p, i) => {
                const cancelled = (p.class_status_name || '').toLowerCase().includes('cancel');
                return (
                  <tr key={p.id} className={`${cancelled ? 'opacity-40' : ''} ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-gray-900 truncate max-w-[200px]">{p.program_nickname}</span>
                        <CopyButton text={p.program_nickname} label="copy" />
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${getTypeBadge(p.program_type_name)}`}>
                        {p.program_type_name || '—'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-500">{p.class_status_name || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-600">{getDays(p) || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-600">{p.first_session_date ? formatDate(p.first_session_date) : '—'}</td>
                    <td className="px-2 py-1.5 text-gray-600">{p.last_session_date ? formatDate(p.last_session_date) : '—'}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{p.parent_cost != null ? formatCurrency(p.parent_cost) : '—'}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{p.our_cut != null ? formatCurrency(p.our_cut) : '—'}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{p.lab_fee != null ? formatCurrency(p.lab_fee) : '—'}</td>
                    <td className="px-2 py-1.5 text-center text-gray-700">{p.number_enrolled ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
