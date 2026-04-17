import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';

export default function UpcomingEvaluationsPage() {
  const qc = useQueryClient();
  const [daysAhead, setDaysAhead] = useState(14);
  const [areaFilter, setAreaFilter] = useState('');
  const [fmFilter, setFmFilter] = useState('my'); // 'my', 'all', or a user_id
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  // FM users for filter
  const { data: fmUsersData } = useQuery({
    queryKey: ['fm-users'],
    queryFn: () => api.get('/users?role=Field+Manager&limit=100').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const fmUsers = fmUsersData?.data || [];

  const { data, isLoading } = useQuery({
    queryKey: ['upcoming-evals', daysAhead, areaFilter, fmFilter],
    queryFn: () => api.get('/evaluations/upcoming', { params: {
      days: daysAhead,
      area_id: areaFilter || undefined,
      fm: fmFilter === 'all' ? undefined : fmFilter,
    } }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/evaluations/${id}`),
    onSuccess: () => { qc.invalidateQueries(['upcoming-evals']); setConfirmDelete(null); },
  });

  const evals = data?.data || [];

  // Group by date
  const byDate = {};
  evals.forEach(e => {
    const d = e.evaluation_date?.split('T')[0] || '';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(e);
  });

  const today = new Date().toISOString().split('T')[0];
  const issueCount = evals.filter(e => e.has_issue).length;

  return (
    <AppShell>
      <PageHeader title="Upcoming Evaluations" action={
        <div className="flex items-center gap-3">
          <Select value={fmFilter} onChange={e => setFmFilter(e.target.value)} className="w-48">
            <option value="my">My Areas</option>
            <option value="all">All Areas</option>
            {fmUsers.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
          </Select>
          <Select value={daysAhead} onChange={e => setDaysAhead(parseInt(e.target.value))} className="w-36">
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
          </Select>
          <Select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="w-40">
            <option value="">All Areas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
          </Select>
        </div>
      }>
        {issueCount > 0 && (
          <span className="text-sm text-red-600 font-medium">{issueCount} issue{issueCount !== 1 ? 's' : ''} need attention</span>
        )}
      </PageHeader>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : evals.length === 0 ? (
          <div className="bg-white rounded-lg border border-green-200 p-12 text-center">
            <div className="text-green-600 font-bold text-lg mb-1">No Upcoming Evaluations</div>
            <div className="text-sm text-gray-400">Nothing scheduled in the next {daysAhead} days</div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byDate).sort().map(([date, dateEvals]) => {
              const isToday = date === today;
              const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
              return (
                <div key={date}>
                  <h2 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                    {dayLabel}
                    {isToday && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">TODAY</span>}
                    <span className="text-xs text-gray-400 font-normal">({dateEvals.length})</span>
                  </h2>
                  <div className="space-y-2">
                    {dateEvals.map(e => (
                      <div key={e.id} className={`bg-white rounded-lg border p-4 ${e.has_issue ? 'border-red-300' : 'border-gray-200'}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link to={`/professors/${e.professor_id}`} className="font-medium text-[#1e3a5f] hover:underline">
                                {e.professor_name}
                              </Link>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                e.evaluation_type === 'peer_to_peer' ? 'bg-violet-100 text-violet-700' :
                                e.evaluation_type === 'fm_evaluation' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>{e.evaluation_type === 'peer_to_peer' ? 'Peer to Peer' : e.evaluation_type === 'fm_evaluation' ? 'FM Evaluation' : e.evaluation_type || 'Formal'}</span>
                              {e.area && <span className="text-xs text-gray-400">{e.area}</span>}
                            </div>
                            {e.program_nickname && (
                              <div className="text-sm text-gray-600 mt-0.5">
                                <Link to={`/programs/${e.program_id}`} className="hover:underline">{e.program_nickname}</Link>
                                {e.session_time && <span className="ml-2 text-gray-400">{formatTime(e.session_time)}</span>}
                                {e.location_nickname && <span className="ml-2 text-gray-400">{e.location_nickname}</span>}
                              </div>
                            )}
                            {e.evaluator_name && (
                              <div className="text-xs text-gray-500 mt-0.5">Observer: {e.evaluator_name}</div>
                            )}

                            {/* Issue alerts */}
                            {e.has_issue && (
                              <div className="mt-2 bg-red-50 border border-red-200 rounded px-3 py-1.5">
                                <span className="text-xs text-red-700 font-medium">{e.issue_message}</span>
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 ml-3">
                            {confirmDelete === e.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => deleteMutation.mutate(e.id)}
                                  className="text-xs px-2 py-1 bg-red-500 text-white rounded font-medium">Delete</button>
                                <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-400">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDelete(e.id)}
                                className="text-xs text-red-400 hover:text-red-600">Remove</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
