import { Link } from 'react-router-dom';
import { ClientEmailTool, getDays, formatDate } from '../../components/ClientEmailTool';

export default function StartingEmailsPage() {
  return (
    <ClientEmailTool
      title="Starting Emails"
      category="starting_email"
      endpoint="/client-management/starting-emails"
      defaultRange="today"
      columns={[
        { key: 'program_nickname', label: 'Class', render: r => <Link to={`/programs/${r.id}`} onClick={e => e.stopPropagation()} className="font-medium text-[#1e3a5f] hover:underline">{r.program_nickname}</Link> },
        { key: 'payment_through_us', label: 'Through EH', render: r => r.payment_through_us ? <span className="text-amber-600 font-medium">Yes</span> : <span className="text-gray-400">No</span> },
        { key: 'livescan_required', label: 'Vax Card', render: r => r.livescan_required ? <span className="text-amber-600">Yes</span> : <span className="text-gray-300">—</span> },
        { key: 'virtus_required', label: 'Virtus', render: r => r.virtus_required ? <span className="text-amber-600">Yes</span> : <span className="text-gray-300">—</span> },
        { key: 'tb_required', label: 'TB Test', render: r => r.tb_required ? <span className="text-amber-600">Yes</span> : <span className="text-gray-300">—</span> },
      ]}
      getRecipient={r => r.site_coordinator_email || r.poc_email || ''}
      getMergeData={r => ({
        school_name: r.school_name || r.location_nickname || '',
        class_name: r.class_name || r.program_nickname || '',
        professor_name: r.professor_name || '',
        start_date: r.first_session_date ? formatDate(r.first_session_date) : '',
        session_days: getDays(r),
        through_egghead: r.payment_through_us ? 'Yes' : 'No',
        vaccination_card_required: r.livescan_required ? 'Yes' : 'No',
        virtus_required: r.virtus_required ? 'Yes' : 'No',
        tb_test_required: r.tb_required ? 'Yes' : 'No',
      })}
    />
  );
}
