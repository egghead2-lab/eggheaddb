import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { ClientEmailTool } from '../../components/ClientEmailTool';
import SiteCheckInsPage from './SiteCheckInsPage';

const TOOLS = [
  { key: 'nps', label: 'NPS Emails' },
  { key: 'parent_feedback', label: 'Parent Feedback' },
  { key: 'site_check_ins', label: 'Site Check-ins' },
];

function getToolConfig(key) {
  const defaultRecipient = r => r.site_coordinator_email || r.poc_email || '';
  switch (key) {
    case 'nps': return {
      title: 'NPS Emails', category: 'nps_email', endpoint: '/client-management/nps-emails', idField: 'location_id',
      columns: [
        { key: 'school_name', label: 'Location', render: r => <span className="font-medium text-gray-900">{r.school_name || r.nickname}</span> },
        { key: 'point_of_contact', label: 'Contact' },
        { key: 'poc_email', label: 'Email', render: r => <span className="text-gray-600">{r.site_coordinator_email || r.poc_email || '—'}</span> },
        { key: 'geographic_area_name', label: 'Area' },
      ],
      getRecipient: defaultRecipient,
      getMergeData: r => ({ school_name: r.school_name || r.nickname || '', contact_name: r.point_of_contact || '', area_name: r.geographic_area_name || '' }),
    };
    case 'parent_feedback': return {
      title: 'Parent Feedback Emails', category: 'parent_feedback', endpoint: '/client-management/parent-feedback',
      columns: [
        { key: 'program_nickname', label: 'Class', render: r => <Link to={`/programs/${r.id}`} onClick={e => e.stopPropagation()} className="font-medium text-[#1e3a5f] hover:underline">{r.program_nickname}</Link> },
        { key: 'payment_through_us', label: 'Reg Type', render: r => r.payment_through_us ? 'Through EH' : 'Direct' },
        { key: 'has_parent_emails', label: 'Parent Emails?', render: r => r.has_parent_emails ? <span className="text-green-600">Yes ({r.parent_email_count})</span> : <span className="text-gray-400">No</span> },
      ],
      getRecipient: r => '',
      getMergeData: r => ({ class_name: r.class_name || r.program_nickname || '', professor_name: r.professor_name || '' }),
    };
    default: return null;
  }
}

export default function FeedbackToolsPage() {
  const [activeTool, setActiveTool] = useState('nps');

  const { data: countsData } = useQuery({
    queryKey: ['client-email-counts'],
    queryFn: () => api.get('/client-management/counts').then(r => r.data),
    staleTime: 60 * 1000,
  });
  const counts = countsData?.data || {};

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

  if (activeTool === 'site_check_ins') {
    // SiteCheckInsPage has its own AppShell, just pass tabBar as a prop or render above
    return <SiteCheckInsPage toolSelector={tabBar} />;
  }

  const config = getToolConfig(activeTool);
  if (!config) return null;
  return <ClientEmailTool key={activeTool} {...config} toolSelector={tabBar} />;
}
