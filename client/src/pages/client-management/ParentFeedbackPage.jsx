import { ClientEmailTool } from '../../components/ClientEmailTool';

export default function ParentFeedbackPage() {
  return (
    <ClientEmailTool
      title="Parent Feedback Emails"
      category="parent_feedback"
      endpoint="/client-management/parent-feedback"
      columns={[
        { key: 'program_nickname', label: 'Class', render: r => <span className="font-medium text-gray-900">{r.program_nickname}</span> },
        { key: 'payment_through_us', label: 'Reg Type', render: r => r.payment_through_us ? 'Through EH' : 'Direct' },
        { key: 'has_parent_emails', label: 'Parent Emails?', render: r => r.has_parent_emails ? <span className="text-green-600">Yes ({r.parent_email_count})</span> : <span className="text-gray-400">No</span> },
      ]}
      getRecipient={r => ''}
      getMergeData={r => ({
        class_name: r.class_name || r.program_nickname || '',
        professor_name: r.professor_name || '',
      })}
    />
  );
}
