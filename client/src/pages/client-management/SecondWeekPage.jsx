import { ClientEmailTool } from '../../components/ClientEmailTool';

export default function SecondWeekPage() {
  return (
    <ClientEmailTool
      title="2nd Week Emails"
      category="second_week_email"
      endpoint="/client-management/second-week"
      columns={[
        { key: 'program_nickname', label: 'Class', render: r => <span className="font-medium text-gray-900">{r.program_nickname}</span> },
        { key: 'class_name', label: 'Description' },
        { key: 'payment_through_us', label: 'Through EH', render: r => r.payment_through_us ? <span className="text-amber-600 font-medium">Yes</span> : <span className="text-gray-400">No</span> },
      ]}
      getRecipient={r => r.site_coordinator_email || r.poc_email || ''}
      getMergeData={r => ({
        school_name: r.school_name || '',
        class_name: r.class_name || r.program_nickname || '',
        enrolled_count: String(r.number_enrolled || 0),
        through_egghead: r.payment_through_us ? 'Yes' : 'No',
      })}
    />
  );
}
