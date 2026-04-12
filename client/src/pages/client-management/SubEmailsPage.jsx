import { ClientEmailTool, formatDate } from '../../components/ClientEmailTool';

export default function SubEmailsPage() {
  return (
    <ClientEmailTool
      title="Sub Emails"
      category="sub_email"
      endpoint="/client-management/sub-emails"
      idField="program_id"
      rowId={r => r.session_id}
      columns={[
        { key: 'program_nickname', label: 'Class', render: r => <span className="font-medium text-gray-900">{r.program_nickname}</span> },
        { key: 'sub_name', label: 'Sub Professor' },
        { key: 'regular_name', label: 'Subbing For' },
        { key: 'livescan_required', label: 'Vax Card', render: r => r.livescan_required ? <span className="text-amber-600">Yes</span> : <span className="text-gray-300">—</span> },
        { key: 'virtus_required', label: 'Virtus', render: r => r.virtus_required ? <span className="text-amber-600">Yes</span> : <span className="text-gray-300">—</span> },
        { key: 'tb_required', label: 'TB', render: r => r.tb_required ? <span className="text-amber-600">Yes</span> : <span className="text-gray-300">—</span> },
      ]}
      getRecipient={r => r.site_coordinator_email || r.poc_email || ''}
      getMergeData={r => ({
        school_name: r.school_name || '',
        class_name: r.class_name || r.program_nickname || '',
        sub_name: r.sub_name || '',
        subbing_for: r.regular_name || '',
        class_date: r.session_date ? formatDate(r.session_date) : '',
        vaccination_card_required: r.livescan_required ? 'Yes' : 'No',
        virtus_required: r.virtus_required ? 'Yes' : 'No',
        tb_test_required: r.tb_required ? 'Yes' : 'No',
        through_egghead: r.payment_through_us ? 'Yes' : 'No',
      })}
    />
  );
}
