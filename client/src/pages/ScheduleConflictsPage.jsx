import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

const TYPE_LABELS = {
  lead: 'Lead Professor',
  assist: 'Assistant',
  party_lead: 'Party Lead',
  party_assist: 'Party Assistant',
  being_observed: 'Being Observed',
  observing: 'Peer Observing',
  candidate_lead: 'Candidate (Lead)',
  candidate_assist: 'Candidate (Assist)',
};

const TYPE_COLORS = {
  lead: 'bg-blue-100 text-blue-700',
  assist: 'bg-gray-100 text-gray-600',
  party_lead: 'bg-pink-100 text-pink-700',
  party_assist: 'bg-pink-50 text-pink-600',
  being_observed: 'bg-green-100 text-green-700',
  observing: 'bg-green-50 text-green-600',
  candidate_lead: 'bg-violet-100 text-violet-700',
  candidate_assist: 'bg-violet-50 text-violet-600',
};

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function ScheduleConflictsPage() {
  const [areaFilter, setAreaFilter] = useState('');

  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  const { data, isLoading } = useQuery({
    queryKey: ['schedule-conflicts', areaFilter],
    queryFn: () => api.get('/schedule-conflicts', { params: { area_id: areaFilter || undefined } }).then(r => r.data),
  });

  const conflicts = data?.data || [];

  // Group by date
  const byDate = {};
  conflicts.forEach(c => {
    if (!byDate[c.date]) byDate[c.date] = [];
    byDate[c.date].push(c);
  });

  return (
    <AppShell>
      <PageHeader title="Schedule Conflicts" action={
        <Select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="w-48">
          <option value="">All Areas</option>
          {areas.map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
        </Select>
      }>
        {conflicts.length > 0 && (
          <div className="text-sm">
            <span className="text-red-600 font-bold">{conflicts.length}</span>
            <span className="text-gray-500"> conflict{conflicts.length !== 1 ? 's' : ''} found</span>
          </div>
        )}
      </PageHeader>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : conflicts.length === 0 ? (
          <div className="bg-white rounded-lg border border-green-200 p-12 text-center">
            <div className="text-green-600 font-bold text-lg mb-1">No Conflicts</div>
            <div className="text-sm text-gray-400">All professors are scheduled without overlaps</div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byDate).sort().map(([date, dateConflicts]) => {
              const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
              const isToday = date === new Date().toISOString().split('T')[0];
              return (
                <div key={date}>
                  <h2 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                    {dayLabel}
                    {isToday && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">TODAY</span>}
                    <span className="text-xs text-red-500 font-normal">({dateConflicts.length} conflict{dateConflicts.length !== 1 ? 's' : ''})</span>
                  </h2>
                  <div className="space-y-2">
                    {dateConflicts.map((c, i) => (
                      <div key={i} className="bg-white rounded-lg border border-red-200 p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="font-medium text-gray-900">
                            {c.is_candidate ? (
                              <span>{c.professor_name} <span className="text-xs text-violet-600">(Candidate)</span></span>
                            ) : (
                              <Link to={`/professors/${c.professor_id}`} className="text-[#1e3a5f] hover:underline">{c.professor_name}</Link>
                            )}
                          </div>
                          {c.area && <span className="text-xs text-gray-400">{c.area}</span>}
                          <span className="text-xs text-gray-400">{formatDate(c.date)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <ActivityCard activity={c.activity_a} />
                          <ActivityCard activity={c.activity_b} />
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

function ActivityCard({ activity: a }) {
  return (
    <div className="bg-red-50/50 rounded border border-red-100 p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[a.type] || 'bg-gray-100 text-gray-600'}`}>
          {TYPE_LABELS[a.type] || a.type}
        </span>
        <span className="text-xs text-red-600 font-medium">
          {minutesToTime(a.start)} – {minutesToTime(a.end)}
        </span>
      </div>
      <div className="text-sm text-gray-800">
        {a.programId ? (
          <Link to={`/programs/${a.programId}`} className="text-[#1e3a5f] hover:underline">{a.label}</Link>
        ) : a.label}
      </div>
    </div>
  );
}
