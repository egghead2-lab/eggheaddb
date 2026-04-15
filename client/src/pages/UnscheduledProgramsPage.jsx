import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

function getUrgency(dateStr) {
  if (!dateStr) return 'green';
  const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  if (days <= 14) return 'red';
  if (days <= 30) return 'amber';
  return 'green';
}

const URGENCY_STYLES = {
  red: 'border-l-4 border-l-red-500 bg-red-50/30',
  amber: 'border-l-4 border-l-amber-500 bg-amber-50/30',
  green: 'border-l-4 border-l-green-500',
};

export default function UnscheduledProgramsPage() {
  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const [classTypeId, setClassTypeId] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [areaId, setAreaId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['unscheduled-programs', classTypeId, contractorId, areaId],
    queryFn: () => api.get('/curriculum/unscheduled', {
      params: { class_type_id: classTypeId || undefined, contractor_id: contractorId || undefined, area_id: areaId || undefined }
    }).then(r => r.data),
  });
  const programs = data?.data || [];

  return (
    <AppShell>
      <PageHeader title="Unscheduled Programs" subtitle={`${programs.length} program${programs.length !== 1 ? 's' : ''} with unset lessons in the next 90 days`} />

      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
        <Select value={classTypeId} onChange={e => setClassTypeId(e.target.value)} className="w-36">
          <option value="">All Types</option>
          {(ref.classTypes || []).map(ct => <option key={ct.id} value={ct.id}>{ct.class_type_name}</option>)}
        </Select>
        <Select value={contractorId} onChange={e => setContractorId(e.target.value)} className="w-48">
          <option value="">All Contractors</option>
          {(ref.contractors || []).map(c => <option key={c.id} value={c.id}>{c.contractor_name}</option>)}
        </Select>
        <Select value={areaId} onChange={e => setAreaId(e.target.value)} className="w-44">
          <option value="">All Areas</option>
          {(ref.areas || []).map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
        </Select>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
        ) : programs.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">All programs have lessons scheduled for the next 90 days</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Class / Module</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Contractor</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Next Unscheduled</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600">Unset Count</th>
                  <th className="w-28 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {programs.map((p, i) => {
                  const urgency = getUrgency(p.next_unscheduled_date);
                  return (
                    <tr key={p.id} className={`${URGENCY_STYLES[urgency]} ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                      <td className="px-3 py-2">
                        <Link to={`/programs/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{p.location_nickname || '—'}</td>
                      <td className="px-3 py-2">
                        <span className="text-gray-700">{p.class_name || '—'}</span>
                        {p.class_type_name && <span className="text-gray-400 ml-1">({p.class_type_name})</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{p.contractor_name || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`font-medium ${urgency === 'red' ? 'text-red-700' : urgency === 'amber' ? 'text-amber-700' : 'text-green-700'}`}>
                          {p.next_unscheduled_date ? formatDate(p.next_unscheduled_date) : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          urgency === 'red' ? 'bg-red-100 text-red-700' : urgency === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                        }`}>{p.unscheduled_count}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link to={`/curriculum-setting?class_id=${p.class_id || ''}`}
                          className="text-[10px] text-[#1e3a5f] border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 font-medium">
                          Set Curriculum
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
