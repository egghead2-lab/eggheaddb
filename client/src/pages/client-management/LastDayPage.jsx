import { Link } from 'react-router-dom';
import { ClientEmailTool, formatDate } from '../../components/ClientEmailTool';

export default function LastDayPage() {
  return (
    <ClientEmailTool
      title="Last Day Emails"
      category="last_day"
      endpoint="/client-management/last-day"
      defaultRange="today"
      tabs={[
        { key: 'school', label: 'School' },
        { key: 'parent', label: 'Parent' },
      ]}
      tabParam="tab"
      columns={[
        { key: 'program_nickname', label: 'Class', render: r => <Link to={`/programs/${r.id}`} onClick={e => e.stopPropagation()} className="font-medium text-[#1e3a5f] hover:underline">{r.program_nickname}</Link> },
        { key: 'last_session_date', label: 'Last Day', render: r => formatDate(r.last_session_date) },
        { key: 'next_session_start_date', label: 'Next Start', render: r => r.next_session_start_date ? formatDate(r.next_session_start_date) : <span className="text-gray-400">—</span> },
        { key: 'payment_through_us', label: 'Through EH', render: r => r.payment_through_us ? <span className="text-amber-600 font-medium">Yes</span> : <span className="text-gray-400">No</span> },
      ]}
      getRecipient={r => r.site_coordinator_email || r.poc_email || ''}
      getMergeData={r => ({
        school_name: r.school_name || '',
        class_name: r.class_name || r.program_nickname || '',
        next_session_start_date: r.next_session_start_date ? formatDate(r.next_session_start_date) : 'TBD',
        through_egghead: r.payment_through_us ? 'Yes' : 'No',
        is_contract_class: r.payment_through_us ? 'Yes' : 'No',
        registration_link: r.registration_link_for_flyer || r.loc_reg_link || '',
      })}
    />
  );
}
