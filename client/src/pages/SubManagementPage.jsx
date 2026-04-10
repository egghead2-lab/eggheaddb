import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { Section } from '../components/ui/Section';
import { formatDate, formatTime, formatPhone } from '../lib/utils';

function SubNeedCard({ need, onFindSub }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-[#1e3a5f]/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/programs/${need.program_id}`} className="font-medium text-[#1e3a5f] hover:underline text-sm">
              {need.program_nickname}
            </Link>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
              need.role_needing_sub === 'Lead' ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'bg-gray-100 text-gray-600'
            }`}>{need.role_needing_sub}</span>
            <Badge status={need.class_status_name} />
          </div>
          <div className="mt-1.5 flex items-center gap-4 text-xs text-gray-500">
            <span>{need.session_time ? formatTime(need.session_time) : formatTime(need.start_time)}</span>
            {need.class_length_minutes && <span>{need.class_length_minutes} min</span>}
            <Link to={`/locations/${need.location_id}`} className="text-[#1e3a5f] hover:underline">
              {need.location_nickname || need.school_name}
            </Link>
          </div>
          {need.address && <div className="text-xs text-gray-400 mt-0.5">{need.address}</div>}
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            <span className="text-gray-500">
              Out: <Link to={`/professors/${need.off_professor_id}`} className="text-[#1e3a5f] hover:underline font-medium">{need.off_professor_name} {need.off_professor_last}</Link>
            </span>
            {need.reason_name && <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{need.reason_name}</span>}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
            {need.virtus_required ? <span className="bg-purple-50 text-purple-600 px-1 py-0.5 rounded">Virtus</span> : null}
            {need.livescan_required ? <span className="bg-blue-50 text-blue-600 px-1 py-0.5 rounded">Livescan</span> : null}
            {need.tb_required ? <span className="bg-amber-50 text-amber-600 px-1 py-0.5 rounded">TB</span> : null}
          </div>
        </div>
        <Button size="sm" onClick={() => onFindSub(need)}>Find Sub</Button>
      </div>
    </div>
  );
}

function ProfessorRow({ prof, need, onAssign, isPending }) {
  const flags = [];
  if (prof.has_day_off) flags.push({ label: 'Requested Off', color: 'bg-red-100 text-red-700' });
  if (prof.already_working) flags.push({ label: 'Working', color: 'bg-amber-100 text-amber-700' });
  if (!prof.generally_available) flags.push({ label: 'Not Avail', color: 'bg-gray-100 text-gray-600' });
  if (!prof.in_target_area) flags.push({ label: 'Other Area', color: 'bg-blue-100 text-blue-600' });
  if (need?.virtus_required && !prof.virtus) flags.push({ label: 'No Virtus', color: 'bg-purple-100 text-purple-600' });
  if (need?.livescan_required) flags.push({ label: 'Check LS', color: 'bg-blue-50 text-blue-500' });

  const isIdeal = !prof.has_day_off && !prof.already_working && prof.generally_available && prof.in_target_area;

  return (
    <tr className={`${prof.has_day_off ? 'opacity-40' : ''} ${isIdeal ? 'bg-green-50/30' : ''}`}>
      <td className="px-3 py-2">
        <Link to={`/professors/${prof.id}`} className="font-medium text-[#1e3a5f] hover:underline text-sm">
          {prof.professor_nickname} {prof.last_name}
        </Link>
        <div className="text-[10px] text-gray-400">{prof.professor_status_name}</div>
      </td>
      <td className="px-3 py-2 text-xs text-gray-600">{prof.geographic_area_name || '—'}</td>
      <td className="px-3 py-2 text-xs text-gray-500">{formatPhone(prof.phone_number)}</td>
      <td className="px-3 py-2 text-xs text-gray-500">{prof.email || '—'}</td>
      <td className="px-3 py-2">
        {prof.generally_available ? (
          <span className="text-green-600 text-xs">{prof.availability_times}</span>
        ) : (
          <span className="text-gray-400 text-xs">Not set</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {flags.map((f, i) => (
            <span key={i} className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium ${f.color}`}>{f.label}</span>
          ))}
          {flags.length === 0 && <span className="text-[10px] text-green-600 font-medium">Available</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        {!prof.has_day_off && (
          <button onClick={() => onAssign(prof)} disabled={isPending}
            className="text-xs text-[#1e3a5f] hover:underline font-medium disabled:opacity-40">
            Assign
          </button>
        )}
      </td>
    </tr>
  );
}

export default function SubManagementPage() {
  const qc = useQueryClient();
  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const [days, setDays] = useState('14');
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [activeSub, setActiveSub] = useState(null); // the sub need we're finding a prof for
  const [searchAreas, setSearchAreas] = useState([]); // areas to search for available profs
  const [showAll, setShowAll] = useState(false);

  const needsFilters = {
    days,
    areas: selectedAreas.length ? selectedAreas.join(',') : undefined,
  };

  const { data: needsData, isLoading } = useQuery({
    queryKey: ['sub-needs', needsFilters],
    queryFn: () => api.get('/sub-management/needs', { params: needsFilters }).then(r => r.data),
  });
  const needs = needsData?.data || [];

  // Group needs by date
  const groupedNeeds = useMemo(() => {
    const groups = {};
    needs.forEach(n => {
      const dateStr = (n.date_requested || '').split('T')[0];
      if (!groups[dateStr]) groups[dateStr] = { date: dateStr, items: [] };
      groups[dateStr].items.push(n);
    });
    return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
  }, [needs]);

  // Available professors query (only when finding a sub)
  const profFilters = activeSub ? {
    date: (activeSub.date_requested || '').split('T')[0],
    area_id: activeSub.area_id || undefined,
    search_areas: searchAreas.length ? searchAreas.join(',') : (activeSub.area_id ? String(activeSub.area_id) : undefined),
    show_all: showAll ? 'true' : undefined,
  } : null;

  const { data: profsData, isLoading: profsLoading } = useQuery({
    queryKey: ['sub-available-profs', profFilters],
    queryFn: () => api.get('/sub-management/available-professors', { params: profFilters }).then(r => r.data),
    enabled: !!activeSub,
  });
  const professors = profsData?.data || [];

  const assignMutation = useMutation({
    mutationFn: ({ session_id, professor_id, role }) =>
      api.post('/sub-management/assign', { session_id, professor_id, role }),
    onSuccess: () => {
      qc.invalidateQueries(['sub-needs']);
      qc.invalidateQueries(['sub-available-profs']);
      setActiveSub(null);
    },
  });

  const handleFindSub = (need) => {
    setActiveSub(need);
    setSearchAreas(need.area_id ? [need.area_id] : []);
    setShowAll(false);
  };

  const handleAssign = (prof) => {
    if (!activeSub) return;
    if (confirm(`Assign ${prof.professor_nickname} ${prof.last_name} as ${activeSub.role_needing_sub} sub for ${activeSub.program_nickname} on ${formatDate((activeSub.date_requested || '').split('T')[0])}?`)) {
      assignMutation.mutate({
        session_id: activeSub.session_id,
        professor_id: prof.id,
        role: activeSub.role_needing_sub,
      });
    }
  };

  const toggleArea = (id) => {
    setSelectedAreas(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const toggleSearchArea = (id) => {
    setSearchAreas(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <AppShell>
      <PageHeader title="Sub Management" action={
        <div className="text-sm text-gray-500">{needs.length} session{needs.length !== 1 ? 's' : ''} needing subs</div>
      }>
        <Select value={days} onChange={e => setDays(e.target.value)} className="w-36">
          <option value="7">Next 7 days</option>
          <option value="14">Next 14 days</option>
          <option value="30">Next 30 days</option>
          <option value="60">Next 60 days</option>
          <option value="90">Next 90 days</option>
        </Select>
      </PageHeader>

      <div className="p-6">
        {/* Area filter chips */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className="text-xs text-gray-500 py-1 mr-1">Areas:</span>
          {selectedAreas.length > 0 && (
            <button onClick={() => setSelectedAreas([])}
              className="text-[10px] text-gray-400 hover:text-gray-600 underline py-1 mr-1">Clear</button>
          )}
          {(ref.areas || []).map(a => (
            <button key={a.id} onClick={() => toggleArea(a.id)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                selectedAreas.includes(a.id)
                  ? 'bg-[#1e3a5f] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{a.geographic_area_name}</button>
          ))}
        </div>

        <div className="flex gap-6">
          {/* Left: Needs list */}
          <div className={`${activeSub ? 'w-[45%]' : 'w-full'} space-y-4 transition-all`}>
            {isLoading ? (
              <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
            ) : needs.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="text-lg mb-1">No subs needed</div>
                <div className="text-sm">All sessions in the next {days} days are covered</div>
              </div>
            ) : (
              groupedNeeds.map(group => {
                const dow = new Date(group.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
                const isToday = group.date === today;
                return (
                  <div key={group.date}>
                    <div className={`text-sm font-semibold mb-2 flex items-center gap-2 ${isToday ? 'text-blue-700' : 'text-gray-700'}`}>
                      {dow}, {formatDate(group.date)}
                      {isToday && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">TODAY</span>}
                      <span className="text-xs font-normal text-gray-400">({group.items.length} session{group.items.length !== 1 ? 's' : ''})</span>
                    </div>
                    <div className="space-y-2">
                      {group.items.map(n => (
                        <SubNeedCard key={`${n.day_off_id}-${n.session_id}`} need={n}
                          onFindSub={handleFindSub} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Professor finder panel */}
          {activeSub && (
            <div className="w-[55%] sticky top-0 self-start">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Find Sub — {formatDate((activeSub.date_requested || '').split('T')[0])}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {activeSub.program_nickname} &bull; {activeSub.role_needing_sub} &bull; {formatTime(activeSub.session_time || activeSub.start_time)}
                        {activeSub.location_nickname && ` &bull; ${activeSub.location_nickname}`}
                      </div>
                    </div>
                    <button onClick={() => setActiveSub(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
                  </div>

                  {/* Search area chips */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-[10px] text-gray-400 py-0.5 mr-1">Search in:</span>
                    {(ref.areas || []).map(a => (
                      <button key={a.id} onClick={() => toggleSearchArea(a.id)}
                        className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                          searchAreas.includes(a.id)
                            ? 'bg-[#1e3a5f] text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>{a.geographic_area_name}</button>
                    ))}
                    <label className="flex items-center gap-1 ml-2 text-[10px] text-gray-500 cursor-pointer">
                      <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}
                        className="w-3 h-3 rounded border-gray-300" />
                      All areas
                    </label>
                  </div>
                </div>

                {/* Professor table */}
                <div className="max-h-[600px] overflow-y-auto">
                  {profsLoading ? (
                    <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>
                  ) : professors.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">No professors found in selected areas</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Area</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Phone</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Email</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Avail</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Flags</th>
                          <th className="w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {professors.map(p => (
                          <ProfessorRow key={p.id} prof={p} need={activeSub}
                            onAssign={handleAssign} isPending={assignMutation.isPending} />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {assignMutation.isError && (
                  <div className="px-4 py-2 text-sm text-red-600 border-t">{assignMutation.error?.response?.data?.error || 'Assignment failed'}</div>
                )}
                {assignMutation.isSuccess && (
                  <div className="px-4 py-2 text-sm text-green-600 border-t">Sub assigned!</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
