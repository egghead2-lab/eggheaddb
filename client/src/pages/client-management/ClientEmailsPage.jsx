import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { ClientEmailTool, getDays, formatDate } from '../../components/ClientEmailTool';
import { AppShell } from '../../components/layout/AppShell';
import { Spinner } from '../../components/ui/Spinner';

const TOOLS = [
  { key: 'starting', label: 'Starting Emails' },
  { key: 'first_day', label: 'First Day Parent' },
  { key: 'second_week', label: '2nd Week' },
  { key: 'sub', label: 'Sub Emails' },
  { key: 'new_professor', label: 'New Professor' },
  { key: 'last_day', label: 'Last Day' },
  { key: 'roster', label: 'Roster Emails' },
];

// Each tool's ClientEmailTool config
function getToolConfig(key) {
  const linkCol = (label = 'Class') => ({
    key: 'program_nickname', label,
    render: r => <Link to={`/programs/${r.id || r.program_id}`} onClick={e => e.stopPropagation()} className="font-medium text-[#1e3a5f] hover:underline">{r.program_nickname}</Link>,
  });
  const throughEh = { key: 'payment_through_us', label: 'Through EH', render: r => r.payment_through_us ? <span className="text-amber-600 font-medium">Yes</span> : <span className="text-gray-400">No</span> };
  const complianceCols = [
    { key: 'livescan_required', label: 'Vax Card', render: r => r.livescan_required ? <span className="text-amber-600">Yes</span> : <span className="text-gray-300">-</span> },
    { key: 'virtus_required', label: 'Virtus', render: r => r.virtus_required ? <span className="text-amber-600">Yes</span> : <span className="text-gray-300">-</span> },
    { key: 'tb_required', label: 'TB', render: r => r.tb_required ? <span className="text-amber-600">Yes</span> : <span className="text-gray-300">-</span> },
  ];
  const defaultRecipient = r => r.site_coordinator_email || r.poc_email || '';

  switch (key) {
    case 'starting': return {
      title: 'Starting Emails', category: 'starting_email', endpoint: '/client-management/starting-emails', defaultRange: 'today',
      columns: [linkCol(), throughEh, ...complianceCols],
      getRecipient: defaultRecipient,
      getMergeData: r => ({ school_name: r.school_name || r.location_nickname || '', class_name: r.class_name || r.program_nickname || '', professor_name: r.professor_name || '', start_date: r.first_session_date ? formatDate(r.first_session_date) : '', session_days: getDays(r), through_egghead: r.payment_through_us ? 'Yes' : 'No', vaccination_card_required: r.livescan_required ? 'Yes' : 'No', virtus_required: r.virtus_required ? 'Yes' : 'No', tb_test_required: r.tb_required ? 'Yes' : 'No' }),
    };
    case 'first_day': return {
      title: 'First Day Parent Emails', category: 'first_day_parent', endpoint: '/client-management/first-day-parent', defaultRange: 'today',
      columns: [linkCol(), { key: 'first_session_date', label: 'Start Date', render: r => formatDate(r.first_session_date) }, { key: 'day', label: 'Day', render: r => getDays(r) }, { key: 'program_type_name', label: 'Type' }, { key: 'has_parent_emails', label: 'Parent Emails?', render: r => r.has_parent_emails ? <span className="text-green-600">Yes ({r.parent_email_count})</span> : <span className="text-gray-400">No</span> }],
      getRecipient: defaultRecipient,
      getMergeData: r => ({ school_name: r.school_name || '', class_name: r.class_name || r.program_nickname || '', program_type: r.program_type_name || '' }),
    };
    case 'second_week': return {
      title: '2nd Week Emails', category: 'second_week_email', endpoint: '/client-management/second-week', defaultRange: 'today',
      columns: [linkCol(), { key: 'class_name', label: 'Description' }, throughEh],
      getRecipient: defaultRecipient,
      getMergeData: r => ({ school_name: r.school_name || '', class_name: r.class_name || r.program_nickname || '', enrolled_count: String(r.number_enrolled || 0), through_egghead: r.payment_through_us ? 'Yes' : 'No' }),
    };
    case 'sub': return {
      title: 'Sub Emails', category: 'sub_email', endpoint: '/client-management/sub-emails', defaultRange: 'today',
      idField: 'program_id', rowId: r => r.session_id,
      columns: [linkCol(), { key: 'sub_name', label: 'Sub Professor' }, { key: 'regular_name', label: 'Subbing For' }, ...complianceCols],
      getRecipient: defaultRecipient,
      getMergeData: r => ({ school_name: r.school_name || '', class_name: r.class_name || r.program_nickname || '', sub_name: r.sub_name || '', subbing_for: r.regular_name || '', class_date: r.session_date ? formatDate(r.session_date) : '', vaccination_card_required: r.livescan_required ? 'Yes' : 'No', virtus_required: r.virtus_required ? 'Yes' : 'No', tb_test_required: r.tb_required ? 'Yes' : 'No' }),
    };
    case 'new_professor': return {
      title: 'New Professor Emails', category: 'new_professor_email', endpoint: '/client-management/new-professor', defaultRange: 'today',
      columns: [linkCol(), throughEh, ...complianceCols],
      getRecipient: defaultRecipient,
      getMergeData: r => ({ school_name: r.school_name || '', class_name: r.class_name || r.program_nickname || '', new_professor_name: r.new_professor_name || '', through_egghead: r.payment_through_us ? 'Yes' : 'No', vaccination_card_required: r.livescan_required ? 'Yes' : 'No', virtus_required: r.virtus_required ? 'Yes' : 'No', tb_test_required: r.tb_required ? 'Yes' : 'No' }),
    };
    case 'last_day': return {
      title: 'Last Day Emails', category: 'last_day', endpoint: '/client-management/last-day', defaultRange: 'today',
      tabs: [{ key: 'school', label: 'School' }, { key: 'parent', label: 'Parent' }], tabParam: 'tab',
      columns: [linkCol(), { key: 'last_session_date', label: 'Last Day', render: r => formatDate(r.last_session_date) }, { key: 'next_session_start_date', label: 'Next Start', render: r => r.next_session_start_date ? formatDate(r.next_session_start_date) : <span className="text-gray-400">-</span> }, throughEh],
      getRecipient: defaultRecipient,
      getMergeData: r => ({ school_name: r.school_name || '', class_name: r.class_name || r.program_nickname || '', next_session_start_date: r.next_session_start_date ? formatDate(r.next_session_start_date) : 'TBD', through_egghead: r.payment_through_us ? 'Yes' : 'No', registration_link: r.registration_link_for_flyer || r.loc_reg_link || '' }),
    };
    case 'roster': return {
      title: 'Roster Emails', category: 'roster_email', endpoint: '/client-management/roster-emails',
      columns: [linkCol(), { key: 'number_enrolled', label: 'Our #', render: r => <span className="font-medium">{r.number_enrolled ?? '-'}</span> }, { key: 'roster_count', label: 'Roster #', render: r => <span className="font-medium">{r.roster_count}</span> }, { key: 'discrepancy', label: 'Diff', render: r => { const d = r.discrepancy || 0; return <span className={`font-bold ${d > 0 ? 'text-green-600' : d < 0 ? 'text-red-600' : 'text-gray-400'}`}>{d > 0 ? '+' : ''}{d}</span>; }}, { key: 'cost_type', label: 'Cost Type' }],
      getRecipient: defaultRecipient,
      getMergeData: r => ({ school_name: r.school_name || '', class_name: r.class_name || r.program_nickname || '', our_number: String(r.number_enrolled || 0), roster_count: String(r.roster_count || 0), discrepancy: String(r.discrepancy || 0), cost_type: r.cost_type || '' }),
    };
    default: return null;
  }
}

export default function ClientEmailsPage() {
  const [activeTool, setActiveTool] = useState('starting');

  // Fetch badge counts
  const { data: countsData } = useQuery({
    queryKey: ['client-email-counts'],
    queryFn: () => api.get('/client-management/counts').then(r => r.data),
    staleTime: 60 * 1000,
  });
  const counts = countsData?.data || {};

  const config = getToolConfig(activeTool);

  const tabBar = (
    <div className="px-6 py-2 bg-white border-b border-gray-200 flex gap-1 flex-wrap">
      {TOOLS.map(t => {
        const count = counts[t.key] || 0;
        return (
          <button key={t.key} onClick={() => setActiveTool(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTool === t.key ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {t.label}
            {count > 0 && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTool === t.key ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
              }`}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  if (!config) return null;
  return <ClientEmailTool key={activeTool} {...config} toolSelector={tabBar} />;
}
