import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

const TABS = [
  { key: 'link', label: 'Create Links', field: 'registration_opened_online' },
  { key: 'open', label: 'Open Blast', field: 'open_blast_sent' },
  { key: '2week', label: '2 Week Blast', field: 'two_week_blast_sent' },
  { key: '1week', label: '1 Week Blast', field: 'one_week_blast_sent' },
  { key: 'final', label: 'Final Blast', field: 'final_blast_sent' },
];

const DATA_KEYS = { link: 'needsLink', open: 'needsOpen', '2week': 'needs2Week', '1week': 'needs1Week', final: 'needsFinal' };

function daysUntil(date) {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((d - now) / (1000*60*60*24));
}

export default function EmailBlastToolPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isClientManager = user?.role === 'Client Manager';
  const [tab, setTab] = useState('link');
  const [daysOverride, setDaysOverride] = useState('');
  const [showFull, setShowFull] = useState(false);
  const [areaScope, setAreaScope] = useState(isClientManager ? 'mine' : 'all'); // 'mine' | 'all' | <area_id string>
  const [selected, setSelected] = useState(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  const scopeParams = areaScope === 'mine' ? { scope: 'mine' }
    : areaScope === 'all' ? {}
    : { area_id: areaScope };

  const { data, isLoading } = useQuery({
    queryKey: ['registration-blasts', daysOverride, showFull, areaScope],
    queryFn: () => api.get('/registration-blasts', { params: { days_override: daysOverride || undefined, show_full: showFull ? 1 : undefined, ...scopeParams } }).then(r => r.data),
  });

  const markMutation = useMutation({
    mutationFn: (d) => api.post('/registration-blasts/mark', d),
    onSuccess: () => qc.invalidateQueries(['registration-blasts']),
  });

  const unmarkMutation = useMutation({
    mutationFn: (d) => api.post('/registration-blasts/unmark', d),
    onSuccess: () => qc.invalidateQueries(['registration-blasts']),
  });

  const bulkMarkMutation = useMutation({
    mutationFn: (d) => api.post('/registration-blasts/bulk-mark', d),
    onSuccess: () => { qc.invalidateQueries(['registration-blasts']); setSelected(new Set()); setConfirmBulk(false); },
  });

  const allData = data?.data || {};
  const cfg = data?.config || {};
  const currentTab = TABS.find(t => t.key === tab);
  const items = allData[DATA_KEYS[tab]] || [];

  const counts = {};
  TABS.forEach(t => { counts[t.key] = (allData[DATA_KEYS[t.key]] || []).length; });

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <AppShell>
      <div className="bg-white border-b border-gray-200 px-6 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900">Email Blast Tool</h1>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <select value={areaScope} onChange={e => setAreaScope(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm">
              <option value="mine">My Areas</option>
              <option value="all">All Areas</option>
              <optgroup label="Single area">
                {areas.map(a => <option key={a.id} value={String(a.id)}>{a.geographic_area_name}</option>)}
              </optgroup>
            </select>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs" title="Include full classes so you can diagnose their blast state">
              <input type="checkbox" checked={showFull} onChange={e => setShowFull(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" />
              <span>Show full</span>
            </label>
            <div className="flex items-center gap-2">
              <span>Show programs starting within</span>
              <input type="number" value={daysOverride || cfg.regDays || 30}
                onChange={e => setDaysOverride(e.target.value)}
                className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-center" />
              <span>days</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setSelected(new Set()); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === t.key ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
              {counts[t.key] > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  tab === t.key ? 'bg-[#1e3a5f] text-white' : 'bg-gray-200 text-gray-600'
                }`}>{counts[t.key]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
            <span className="text-sm text-blue-800 font-medium">{selected.size} selected</span>
            {confirmBulk ? (
              <>
                <Button size="sm" onClick={() => bulkMarkMutation.mutate({ program_ids: [...selected], field: currentTab.field })}
                  disabled={bulkMarkMutation.isPending}>
                  {bulkMarkMutation.isPending ? 'Marking...' : 'Yes, Mark All'}
                </Button>
                <button onClick={() => setConfirmBulk(false)} className="text-xs text-gray-500">Cancel</button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => setConfirmBulk(true)}>Mark Complete</Button>
                <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500">Clear</button>
              </>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-lg border border-green-200 p-12 text-center">
            <div className="text-green-600 font-bold text-lg mb-1">All Clear</div>
            <div className="text-sm text-gray-400">No programs need action for this stage</div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input type="checkbox" checked={items.length > 0 && items.every(p => selected.has(p.id))}
                      onChange={() => {
                        const all = items.every(p => selected.has(p.id));
                        setSelected(all ? new Set() : new Set(items.map(p => p.id)));
                      }} className="accent-[#1e3a5f]" />
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Area</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Starts</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Days Out</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Enrolled</th>
                  <th className="w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((p, i) => {
                  const days = daysUntil(p.first_session_date);
                  const full = p.maximum_students && p.number_enrolled >= p.maximum_students;
                  return (
                    <tr key={p.id} className={`hover:bg-gray-50/50 ${selected.has(p.id) ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)} className="accent-[#1e3a5f]" />
                      </td>
                      <td className="px-3 py-2">
                        <Link to={`/programs/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{p.location_nickname || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{p.area || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{formatDate(p.first_session_date)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs font-medium ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-gray-500'}`}>
                          {days}d
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-xs">
                        {p.number_enrolled || 0}{p.maximum_students ? `/${p.maximum_students}` : ''}
                        {full && <span className="ml-1 text-green-600 font-bold">FULL</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => markMutation.mutate({ program_id: p.id, field: currentTab.field })}
                          disabled={markMutation.isPending}
                          className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 font-medium">
                          Done
                        </button>
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
