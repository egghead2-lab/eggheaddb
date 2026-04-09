import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { Section } from './ui/Section';

const FIELD_LABELS = {
  professor_nickname: 'Preferred Name', professor_status_id: 'Status', first_name: 'First Name', last_name: 'Last Name',
  email: 'Email', phone_number: 'Phone', address: 'Address', city_id: 'City', general_notes: 'Notes',
  base_pay: 'Base Pay', assist_pay: 'Assist Pay', rating: 'Rating', hire_date: 'Hire Date',
  termination_date: 'Term Date', active: 'Active', geographic_area_id: 'Area',
  program_nickname: 'Program Name', class_status_id: 'Status', location_id: 'Location',
  lead_professor_id: 'Lead Professor', assistant_professor_id: 'Assistant', start_time: 'Start Time',
  number_enrolled: 'Enrolled', maximum_students: 'Max Students', our_cut: 'Our Cut',
  nickname: 'Nickname', school_name: 'School Name', point_of_contact: 'Contact',
  virtus_required: 'Virtus Required', livescan_required: 'Livescan Required',
};

function formatValue(val) {
  if (val === null || val === undefined) return '—';
  if (val === 1 || val === true) return 'Yes';
  if (val === 0 || val === false) return 'No';
  return String(val);
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' });
}

export function AuditHistory({ table, recordId }) {
  const { data } = useQuery({
    queryKey: ['audit', table, recordId],
    queryFn: () => api.get(`/audit/${table}/${recordId}`).then(r => r.data),
    staleTime: 30 * 1000,
  });

  const entries = data?.data || [];
  if (entries.length === 0) return null;

  return (
    <Section title={`Edit History (${entries.length})`} defaultOpen={false}>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {entries.map(e => {
          const changes = typeof e.changes === 'string' ? JSON.parse(e.changes) : e.changes;
          const fields = Object.entries(changes || {});
          return (
            <div key={e.id} className="text-xs border-b border-gray-100 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-700">{e.user_name || 'System'}</span>
                <span className="text-gray-400">{timeAgo(e.ts_inserted)}</span>
              </div>
              <div className="space-y-0.5">
                {fields.map(([field, { from, to }]) => (
                  <div key={field} className="flex items-baseline gap-1 text-[11px]">
                    <span className="text-gray-500 w-28 shrink-0">{FIELD_LABELS[field] || field}</span>
                    <span className="text-red-400 line-through truncate max-w-[120px]">{formatValue(from)}</span>
                    <span className="text-gray-300">→</span>
                    <span className="text-green-700 truncate max-w-[120px]">{formatValue(to)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
