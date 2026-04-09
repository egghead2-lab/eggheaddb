import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { useProfessorList } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { SearchSelect } from '../components/ui/SearchSelect';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

import { RatingBadge } from '../components/ui/DevelopmentalRating';

const TYPE_LABELS = { formal: 'Formal', peer_to_peer: 'Peer to Peer', support_session: 'Support', follow_up: 'Follow-up', routine: 'Routine', initial: 'Initial' };
const TYPE_COLORS = { formal: 'bg-blue-100 text-blue-700', peer_to_peer: 'bg-violet-100 text-violet-700', support_session: 'bg-gray-100 text-gray-600', follow_up: 'bg-amber-100 text-amber-700' };

export default function ObservationHistoryPage() {
  const { data: profListData } = useProfessorList();
  const professors = profListData?.data || [];

  const [professorId, setProfessorId] = useState('');
  const [evaluatorId, setEvaluatorId] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const params = {
    professor_id: professorId || undefined,
    evaluator: evaluatorId || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['observation-history', params],
    queryFn: () => api.get('/evaluations/observations/history', { params }).then(r => r.data),
  });

  const rows = data?.data || [];

  const profOptions = professors.map(p => ({ id: String(p.id), label: p.display_name || p.professor_nickname }));

  return (
    <AppShell>
      <PageHeader title="Observation History" action={
        <span className="text-sm text-gray-500">{rows.length} observation{rows.length !== 1 ? 's' : ''}</span>
      } />

      <div className="px-6 pt-4 flex items-end gap-3 flex-wrap">
        <div className="w-52">
          <label className="text-[10px] font-medium text-gray-500 block mb-0.5">Professor</label>
          <SearchSelect placeholder="All professors…" value={professorId} onChange={v => setProfessorId(v)}
            options={profOptions} displayKey="label" valueKey="id" />
        </div>
        <div className="w-52">
          <label className="text-[10px] font-medium text-gray-500 block mb-0.5">Evaluator / FM</label>
          <SearchSelect placeholder="All evaluators…" value={evaluatorId} onChange={v => setEvaluatorId(v)}
            options={profOptions} displayKey="label" valueKey="id" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-0.5">Start</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-0.5">End</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        </div>
        {(professorId || evaluatorId) && (
          <button onClick={() => { setProfessorId(''); setEvaluatorId(''); }}
            className="text-[10px] text-gray-400 hover:text-gray-600 underline py-2">Clear filters</button>
        )}
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">No observations found for this period</div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{ width: '8%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '5%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '11%' }} />
              </colgroup>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Submitted</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Professor</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Obs Date</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Class</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Type</th>
                  <th className="text-center px-1 py-2 font-medium text-gray-600">Form</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">Rating</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">Previous</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Remediation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => {
                  const fd = typeof r.form_data === 'string' ? JSON.parse(r.form_data || '{}') : (r.form_data || {});
                  const formLink = r.form_link || fd.form_link || null;
                  const className = fd.location || r.class_name || '—';
                  const obsType = r.observation_type || r.evaluation_type;
                  const remed = r.remediation || r.remediation_followup;

                  return (
                    <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-2 py-1.5 text-gray-500">{formatDate(r.ts_inserted)}</td>
                      <td className="px-2 py-1.5 truncate">
                        <Link to={`/professors/${r.professor_id}`} className="text-[#1e3a5f] hover:underline font-medium">{r.professor_name}</Link>
                      </td>
                      <td className="px-2 py-1.5 text-gray-600">{formatDate(r.evaluation_date)}</td>
                      <td className="px-2 py-1.5 text-gray-600 truncate">{className}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium ${TYPE_COLORS[obsType] || 'bg-gray-100 text-gray-600'}`}>
                          {TYPE_LABELS[obsType] || obsType || '—'}
                        </span>
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        {formLink ? (
                          <a href={formLink} target="_blank" rel="noopener noreferrer"
                            className="text-[#1e3a5f] hover:underline text-[10px]">View</a>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-center"><RatingBadge rating={r.overall_rating} /></td>
                      <td className="px-2 py-1.5 text-center"><RatingBadge rating={r.previous_rating} /></td>
                      <td className="px-2 py-1.5">
                        {remed && remed !== 'none' && remed !== 'No' ? (
                          <span className="text-[10px] text-red-600 font-medium">{remed}</span>
                        ) : <span className="text-gray-300 text-[10px]">No</span>}
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
