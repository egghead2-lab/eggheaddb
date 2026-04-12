import { ClientEmailTool } from '../../components/ClientEmailTool';
import { formatCurrency } from '../../lib/utils';

export default function RosterEmailsPage() {
  return (
    <ClientEmailTool
      title="Roster Emails"
      category="roster_email"
      endpoint="/client-management/roster-emails"
      columns={[
        { key: 'program_nickname', label: 'Class', render: r => <span className="font-medium text-gray-900">{r.program_nickname}</span> },
        { key: 'number_enrolled', label: 'Our #', render: r => <span className="font-medium">{r.number_enrolled ?? '—'}</span> },
        { key: 'roster_count', label: 'Roster #', render: r => <span className="font-medium">{r.roster_count}</span> },
        { key: 'discrepancy', label: 'Diff', render: r => {
          const d = r.discrepancy || 0;
          return <span className={`font-bold ${d > 0 ? 'text-green-600' : d < 0 ? 'text-red-600' : 'text-gray-400'}`}>{d > 0 ? '+' : ''}{d}</span>;
        }},
        { key: 'cost_type', label: 'Cost Type' },
      ]}
      getRecipient={r => r.site_coordinator_email || r.poc_email || ''}
      getMergeData={r => ({
        school_name: r.school_name || '',
        class_name: r.class_name || r.program_nickname || '',
        our_number: String(r.number_enrolled || 0),
        roster_count: String(r.roster_count || 0),
        discrepancy: String(r.discrepancy || 0),
        cost_type: r.cost_type || '',
      })}
    />
  );
}
