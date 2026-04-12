import { ClientEmailTool, getDays, formatDate } from '../../components/ClientEmailTool';

export default function FirstDayParentPage() {
  return (
    <ClientEmailTool
      title="First Day Parent Emails"
      category="first_day_parent"
      endpoint="/client-management/first-day-parent"
      columns={[
        { key: 'program_nickname', label: 'Class', render: r => <span className="font-medium text-gray-900">{r.program_nickname}</span> },
        { key: 'first_session_date', label: 'Start Date', render: r => formatDate(r.first_session_date) },
        { key: 'day', label: 'Day', render: r => getDays(r) },
        { key: 'program_type_name', label: 'Type' },
        { key: 'has_parent_emails', label: 'Parent Emails?', render: r => r.has_parent_emails ? <span className="text-green-600">Yes ({r.parent_email_count})</span> : <span className="text-gray-400">No</span> },
      ]}
      getRecipient={r => r.site_coordinator_email || r.poc_email || ''}
      getMergeData={r => ({
        school_name: r.school_name || '',
        class_name: r.class_name || r.program_nickname || '',
        program_type: r.program_type_name || '',
      })}
    />
  );
}
