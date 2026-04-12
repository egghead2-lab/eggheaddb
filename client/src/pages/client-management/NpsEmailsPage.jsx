import { ClientEmailTool } from '../../components/ClientEmailTool';

export default function NpsEmailsPage() {
  return (
    <ClientEmailTool
      title="NPS Emails"
      category="nps_email"
      endpoint="/client-management/nps-emails"
      idField="location_id"
      columns={[
        { key: 'school_name', label: 'Location', render: r => <span className="font-medium text-gray-900">{r.school_name || r.nickname}</span> },
        { key: 'point_of_contact', label: 'Contact' },
        { key: 'poc_email', label: 'Email', render: r => <span className="text-gray-600">{r.site_coordinator_email || r.poc_email || '—'}</span> },
        { key: 'geographic_area_name', label: 'Area' },
      ]}
      getRecipient={r => r.site_coordinator_email || r.poc_email || ''}
      getMergeData={r => ({
        school_name: r.school_name || r.nickname || '',
        contact_name: r.point_of_contact || '',
        area_name: r.geographic_area_name || '',
      })}
    />
  );
}
