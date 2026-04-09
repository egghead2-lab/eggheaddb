import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { formatDate, formatTime } from '../lib/utils';

const STATUS_COLORS = { open: 'bg-red-100 text-red-700', in_progress: 'bg-amber-100 text-amber-700', filled: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500' };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const PROG_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

export default function HiringRequestsPage() {
  const qc = useQueryClient();
  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [activeId, setActiveId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['hiring-requests', statusFilter],
    queryFn: () => api.get('/hiring-requests', { params: { status: statusFilter || undefined } }).then(r => r.data),
  });
  const requests = data?.data || [];

  return (
    <AppShell>
      <PageHeader title="Hiring Requests" action={
        <div className="flex gap-2 items-center">
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-36">
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="filled">Filled</option>
          </Select>
          <Button onClick={() => setShowForm(true)}>+ New Request</Button>
        </div>
      } />

      <div className="p-6">
        {showForm && <HiringRequestForm areas={ref.areas || []} onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); qc.invalidateQueries(['hiring-requests']); }} />}

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : requests.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No hiring requests</div>
        ) : (
          <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{width:'5%'}}/><col style={{width:'12%'}}/><col style={{width:'14%'}}/><col style={{width:'12%'}}/>
                <col style={{width:'10%'}}/><col style={{width:'10%'}}/><col style={{width:'8%'}}/><col style={{width:'12%'}}/>
                <col style={{width:'9%'}}/><col style={{width:'8%'}}/>
              </colgroup>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">#</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Area</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">City / Type</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Submitted By</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Fulfillment</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Start Date</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">Programs</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Candidate</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-600">Status</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((r, i) => (
                  <tr key={r.id} onClick={() => setActiveId(activeId === r.id ? null : r.id)}
                    className={`cursor-pointer transition-colors ${activeId === r.id ? 'bg-[#1e3a5f]/5' : i % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'}`}>
                    <td className="px-2 py-1.5 text-gray-400">#{r.id}</td>
                    <td className="px-2 py-1.5 font-medium truncate">{r.geographic_area_name}</td>
                    <td className="px-2 py-1.5 text-gray-600 truncate">{r.city_detail || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-600 truncate">{r.submitted_by_name}</td>
                    <td className="px-2 py-1.5 text-gray-600">{r.fulfillment_date ? formatDate(r.fulfillment_date) : '—'}</td>
                    <td className="px-2 py-1.5 text-gray-600">{r.earliest_start_date ? formatDate(r.earliest_start_date) : '—'}</td>
                    <td className="px-2 py-1.5 text-center text-gray-600">{r.program_count}</td>
                    <td className="px-2 py-1.5 truncate" onClick={e => e.stopPropagation()}>
                      {r.candidate_id ? (
                        <Link to={`/candidates/${r.candidate_id}`} className="text-[#1e3a5f] hover:underline">{r.candidate_name}</Link>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-400">{formatDate(r.ts_inserted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeId && <HiringRequestDetail requestId={activeId} onClose={() => setActiveId(null)} />}
          </>
        )}
      </div>
    </AppShell>
  );
}

function HiringRequestDetail({ requestId, onClose }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['hiring-request', requestId],
    queryFn: () => api.get(`/hiring-requests/${requestId}`).then(r => r.data),
  });
  const hr = data?.data || {};
  const programs = hr.programs || [];
  const classTypes = (() => { try { return JSON.parse(hr.class_types || '[]'); } catch(e) { return []; } })();
  const programTypes = (() => { try { return JSON.parse(hr.program_types || '[]'); } catch(e) { return []; } })();

  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateResults, setCandidateResults] = useState([]);
  const searchTimeout = useRef(null);

  const statusMutation = useMutation({
    mutationFn: (status) => api.put(`/hiring-requests/${requestId}`, { status }),
    onSuccess: () => { qc.invalidateQueries(['hiring-requests']); qc.invalidateQueries(['hiring-request', requestId]); },
  });

  const linkMutation = useMutation({
    mutationFn: (candidate_id) => api.post(`/hiring-requests/${requestId}/link-candidate`, { candidate_id }),
    onSuccess: () => { qc.invalidateQueries(['hiring-requests']); qc.invalidateQueries(['hiring-request', requestId]); setCandidateSearch(''); setCandidateResults([]); },
  });

  const handleCandidateSearch = (val) => {
    setCandidateSearch(val);
    if (val.length < 2) { setCandidateResults([]); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await api.get('/onboarding/candidates', { params: { search: val, limit: 10 } });
        setCandidateResults(res.data?.data || []);
      } catch { setCandidateResults([]); }
    }, 200);
  };

  if (isLoading) return <div className="mt-4 flex justify-center py-8"><Spinner className="w-6 h-6" /></div>;

  const availDays = DAYS.map((d, i) => {
    const am = hr[`avail_${d}_am`];
    const pm = hr[`avail_${d}_pm`];
    if (!am && !pm) return null;
    return `${DAY_LABELS[i]} ${am && pm ? 'All Day' : am ? 'AM' : 'PM'}`;
  }).filter(Boolean);

  return (
    <div className="mt-4 bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">Request #{hr.id} — {hr.geographic_area_name}</div>
          <div className="text-xs text-gray-500">Submitted by {hr.submitted_by_name} on {formatDate(hr.ts_inserted)}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[hr.status]}`}>{hr.status}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Key details grid */}
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div><span className="text-gray-400 block">City / Type</span><span className="text-gray-800 font-medium">{hr.city_detail || '—'}</span></div>
          <div><span className="text-gray-400 block">Fulfillment Date</span><span className="text-gray-800 font-medium">{hr.fulfillment_date ? formatDate(hr.fulfillment_date) : '—'}</span></div>
          <div><span className="text-gray-400 block">Earliest Start</span><span className="text-gray-800 font-medium">{hr.earliest_start_date ? formatDate(hr.earliest_start_date) : '—'}</span></div>
          <div><span className="text-gray-400 block">Base Pay</span><span className="text-gray-800 font-medium">{hr.base_pay ? `$${hr.base_pay}` : '—'}</span></div>
          <div><span className="text-gray-400 block">Availability</span><span className="text-gray-800">{availDays.join(', ') || '—'}</span></div>
          <div><span className="text-gray-400 block">Training Type</span><span className="text-gray-800">{hr.training_type === 'virtual' ? 'Virtual' : 'In Person'}</span></div>
          <div><span className="text-gray-400 block">Experience</span><span className="text-gray-800">{hr.experience_level ? hr.experience_level.replace('_', ' ') : '—'}</span></div>
          <div>
            <span className="text-gray-400 block">Requirements</span>
            <div className="flex gap-1">
              {hr.requires_livescan ? <span className="bg-blue-50 text-blue-600 px-1 py-0.5 rounded text-[9px]">LS</span> : null}
              {hr.requires_virtus ? <span className="bg-purple-50 text-purple-600 px-1 py-0.5 rounded text-[9px]">Virtus</span> : null}
              {hr.requires_tb ? <span className="bg-amber-50 text-amber-600 px-1 py-0.5 rounded text-[9px]">TB</span> : null}
              {!hr.requires_livescan && !hr.requires_virtus && !hr.requires_tb && <span className="text-gray-300">None</span>}
            </div>
          </div>
        </div>

        {/* Class types + program types */}
        <div className="flex gap-6 text-xs">
          {classTypes.length > 0 && (
            <div><span className="text-gray-400">Class Types:</span> {classTypes.join(', ')}</div>
          )}
          {programTypes.length > 0 && (
            <div><span className="text-gray-400">Program Types:</span> {programTypes.join(', ')}</div>
          )}
        </div>

        {/* Programs */}
        {programs.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">Programs ({programs.length})</div>
            <div className="space-y-1">
              {programs.map(p => (
                <div key={p.link_id} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1">
                  <Link to={`/programs/${p.program_id}`} className="text-[#1e3a5f] hover:underline font-medium flex-1" onClick={e => e.stopPropagation()}>{p.program_nickname}</Link>
                  <span className="text-gray-400">{p.location_nickname || ''}</span>
                  {p.first_session_date && <span className="text-gray-400">{formatDate(p.first_session_date)}</span>}
                  <div className="flex gap-0.5">
                    {p.livescan_required ? <span className="text-[8px] bg-blue-50 text-blue-600 px-0.5 rounded">LS</span> : null}
                    {p.virtus_required ? <span className="text-[8px] bg-purple-50 text-purple-600 px-0.5 rounded">V</span> : null}
                    {p.tb_required ? <span className="text-[8px] bg-amber-50 text-amber-600 px-0.5 rounded">TB</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {hr.fulfillment_notes && (
          <div className="text-xs"><span className="text-gray-400">Fulfillment Notes:</span> <span className="text-gray-700">{hr.fulfillment_notes}</span></div>
        )}
        {hr.special_notes && (
          <div className="text-xs"><span className="text-gray-400">Special Notes:</span> <span className="text-gray-700">{hr.special_notes}</span></div>
        )}

        {/* Candidate linking */}
        <div className="border-t border-gray-200 pt-3">
          {hr.candidate_id ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Linked Candidate:</span>
              <Link to={`/candidates/${hr.candidate_id}`} className="text-[#1e3a5f] hover:underline font-medium">{hr.candidate_name}</Link>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[hr.candidate_status] || 'bg-gray-100 text-gray-600'}`}>{hr.candidate_status}</span>
            </div>
          ) : (
            <div>
              <div className="text-xs text-gray-500 mb-1">Link a candidate to this request:</div>
              <div className="relative">
                <input type="text" value={candidateSearch} onChange={e => handleCandidateSearch(e.target.value)}
                  placeholder="Search candidates…"
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                {candidateResults.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {candidateResults.map(c => (
                      <li key={c.id} onMouseDown={e => { e.preventDefault(); linkMutation.mutate(c.id); }}
                        className="px-3 py-1.5 text-xs cursor-pointer hover:bg-[#1e3a5f]/10 flex justify-between">
                        <span className="font-medium">{c.full_name}</span>
                        <span className="text-gray-400">{c.geographic_area_name || ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {linkMutation.isSuccess && <p className="text-xs text-green-600 mt-1">Linked! Programs added to candidate schedule.</p>}
            </div>
          )}
        </div>

        {/* Status actions */}
        <div className="flex gap-2 border-t border-gray-200 pt-3">
          {hr.status === 'open' && (
            <button onClick={() => statusMutation.mutate('in_progress')} className="text-xs text-[#1e3a5f] border border-[#1e3a5f]/30 px-2.5 py-1 rounded-lg hover:bg-[#1e3a5f]/5">Mark In Progress</button>
          )}
          {(hr.status === 'open' || hr.status === 'in_progress') && (
            <>
              <button onClick={() => statusMutation.mutate('filled')} className="text-xs text-green-600 border border-green-200 px-2.5 py-1 rounded-lg hover:bg-green-50">Mark Filled</button>
              <button onClick={() => statusMutation.mutate('cancelled')} className="text-xs text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50">Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HiringRequestForm({ areas, onClose, onSuccess }) {
  const [form, setForm] = useState({
    geographic_area_id: '', city_detail: '',
    avail_mon_am: false, avail_mon_pm: false, avail_tue_am: false, avail_tue_pm: false,
    avail_wed_am: false, avail_wed_pm: false, avail_thu_am: false, avail_thu_pm: false,
    avail_fri_am: false, avail_fri_pm: false,
    fulfillment_date: '', earliest_start_date: '',
    fulfillment_notes: '',
    requires_livescan: false, requires_virtus: false, requires_tb: false,
    experience_level: '', training_type: 'in_person',
    class_types: [], program_types: [],
    base_pay: '', special_notes: '',
  });
  const [programs, setPrograms] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [areaDefaults, setAreaDefaults] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const searchTimeout = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleArray = (key, val) => setForm(f => ({ ...f, [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val] }));

  const today = new Date().toISOString().split('T')[0];
  const threeWeeksOut = new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0];

  // Fetch area defaults when area changes
  const handleAreaChange = async (areaId) => {
    set('geographic_area_id', areaId);
    if (!areaId) { setAreaDefaults(null); return; }
    try {
      const res = await api.get(`/hiring-requests/area-defaults/${areaId}`);
      const d = res.data?.data;
      setAreaDefaults(d);
      if (d?.base_pay_rate) set('base_pay', d.base_pay_rate);
    } catch {}
  };

  // Check for program time conflicts
  const checkConflicts = (progs) => {
    const warns = [];
    for (let i = 0; i < progs.length; i++) {
      for (let j = i + 1; j < progs.length; j++) {
        const a = progs[i], b = progs[j];
        PROG_DAYS.forEach(day => {
          if (a[day] && b[day] && a.start_time && b.start_time) {
            const aEnd = parseInt(a.start_time) * 60 + parseInt(a.start_time?.split(':')[1] || 0) + (a.class_length_minutes || 60);
            const bStart = parseInt(b.start_time) * 60 + parseInt(b.start_time?.split(':')[1] || 0);
            const aStart = parseInt(a.start_time) * 60 + parseInt(a.start_time?.split(':')[1] || 0);
            const bEnd = bStart + (b.class_length_minutes || 60);
            if (aStart < bEnd && bStart < aEnd) {
              warns.push(`${a.program_nickname} and ${b.program_nickname} overlap on ${day}`);
            }
          }
        });
      }
    }
    return warns;
  };

  // Search programs
  const handleSearch = (val) => {
    setSearchQuery(val);
    if (val.length < 2) { setSearchResults([]); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await api.get('/programs', { params: { search: val, limit: 15 } });
        const existingIds = new Set(programs.map(p => p.id));
        setSearchResults((res.data?.data || []).filter(p => !existingIds.has(p.id)));
      } catch { setSearchResults([]); }
    }, 200);
  };

  const addProgram = (prog) => {
    const updated = [...programs, prog];
    setPrograms(updated);
    setSearchQuery(''); setSearchResults([]);
    // Auto-set requirements from location
    if (prog.livescan_required) set('requires_livescan', true);
    if (prog.virtus_required) set('requires_virtus', true);
    if (prog.tb_required) set('requires_tb', true);
    // Auto-set earliest start date
    const futureDate = prog.first_session_date?.split('T')[0];
    if (futureDate && futureDate >= today && (!form.earliest_start_date || futureDate < form.earliest_start_date)) {
      set('earliest_start_date', futureDate);
    }
    setWarnings(checkConflicts(updated));
  };

  const removeProgram = (progId) => {
    const updated = programs.filter(p => p.id !== progId);
    setPrograms(updated);
    setWarnings(checkConflicts(updated));
  };

  // Quick avail presets
  const setAllAM = () => setForm(f => ({ ...f, avail_mon_am: true, avail_tue_am: true, avail_wed_am: true, avail_thu_am: true, avail_fri_am: true }));
  const setAllPM = () => setForm(f => ({ ...f, avail_mon_pm: true, avail_tue_pm: true, avail_wed_pm: true, avail_thu_pm: true, avail_fri_pm: true }));
  const setAllDay = () => setForm(f => ({ ...f, avail_mon_am: true, avail_mon_pm: true, avail_tue_am: true, avail_tue_pm: true, avail_wed_am: true, avail_wed_pm: true, avail_thu_am: true, avail_thu_pm: true, avail_fri_am: true, avail_fri_pm: true }));

  // Date warnings
  const fulfillWarning = form.fulfillment_date && form.fulfillment_date < threeWeeksOut;
  const startWarning = form.earliest_start_date && form.earliest_start_date < threeWeeksOut;

  const submitMutation = useMutation({
    mutationFn: () => api.post('/hiring-requests', { ...form, program_ids: programs.map(p => p.id) }),
    onSuccess: onSuccess,
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">New Hiring Request</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
      </div>

      <div className="space-y-5">
        {/* Area + City */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Select label="Territory / Area *" value={form.geographic_area_id} onChange={e => handleAreaChange(e.target.value)}>
              <option value="">Select area…</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
            </Select>
          </div>
          <Input label="City / Special Type Detail" placeholder='e.g. Tarzana, Reseda (PARTY)' value={form.city_detail} onChange={e => set('city_detail', e.target.value)} />
        </div>

        {/* Availability */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-2">Desired Availability (AM: 10AM-2PM, PM: 2PM-6PM)</label>
          <div className="flex gap-1 mb-2">
            <button type="button" onClick={setAllAM} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">M-F AM</button>
            <button type="button" onClick={setAllPM} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">M-F PM</button>
            <button type="button" onClick={setAllDay} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">M-F All Day</button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {DAYS.map((d, i) => (
              <div key={d} className="text-center">
                <div className="text-xs font-medium text-gray-600 mb-1">{DAY_LABELS[i]}</div>
                <label className="flex items-center gap-1 justify-center text-[10px] cursor-pointer">
                  <input type="checkbox" checked={form[`avail_${d}_am`]} onChange={e => set(`avail_${d}_am`, e.target.checked)}
                    className="w-3 h-3 rounded border-gray-300 text-[#1e3a5f]" /> AM
                </label>
                <label className="flex items-center gap-1 justify-center text-[10px] cursor-pointer">
                  <input type="checkbox" checked={form[`avail_${d}_pm`]} onChange={e => set(`avail_${d}_pm`, e.target.checked)}
                    className="w-3 h-3 rounded border-gray-300 text-[#1e3a5f]" /> PM
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Programs */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Programs to Staff</label>
          {programs.length > 0 && (
            <div className="space-y-1 mb-2">
              {programs.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1">
                  <span className="font-medium flex-1">{p.program_nickname}</span>
                  <span className="text-gray-400">{p.location_nickname || ''}</span>
                  <button type="button" onClick={() => removeProgram(p.id)} className="text-gray-300 hover:text-red-500">&times;</button>
                </div>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="mb-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {warnings.map((w, i) => <div key={i}>Schedule conflict: {w}</div>)}
            </div>
          )}
          <div className="relative">
            <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
              placeholder="Search programs to add…"
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            {searchResults.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map(p => (
                  <li key={p.id} onMouseDown={e => { e.preventDefault(); addProgram(p); }}
                    className="px-3 py-2 text-xs cursor-pointer hover:bg-[#1e3a5f]/10">
                    <div className="font-medium">{p.program_nickname}</div>
                    <div className="text-gray-400">{p.location_nickname || ''}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Input label="Desired Fulfillment Date" type="date" value={form.fulfillment_date} onChange={e => set('fulfillment_date', e.target.value)} />
            {fulfillWarning && <p className="text-[10px] text-amber-600 mt-0.5 font-medium">Less than 3 weeks — fulfillment not guaranteed</p>}
          </div>
          <div>
            <Input label="Earliest Program Start Date" type="date" value={form.earliest_start_date} onChange={e => set('earliest_start_date', e.target.value)} />
            {startWarning && <p className="text-[10px] text-amber-600 mt-0.5 font-medium">Less than 3 weeks away</p>}
          </div>
        </div>

        {/* Requirements */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-2">Requirements</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={form.requires_livescan} onChange={e => set('requires_livescan', e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" /> LiveScan
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={form.requires_virtus} onChange={e => set('requires_virtus', e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" /> Virtus
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={form.requires_tb} onChange={e => set('requires_tb', e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" /> District TB Test
            </label>
          </div>
        </div>

        {/* Experience + Training + Class/Program Types */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Experience Desired</label>
            <div className="space-y-1">
              {[['15_students', '15 Students'], ['20_students', '20 Students']].map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="radio" name="experience" checked={form.experience_level === val} onChange={() => set('experience_level', val)}
                    className="w-3.5 h-3.5 border-gray-300 text-[#1e3a5f]" /> {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Training Type</label>
            <div className="space-y-1">
              {[['in_person', 'In Person Observations'], ['virtual', 'Virtual Class Training']].map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="radio" name="training" checked={form.training_type === val} onChange={() => set('training_type', val)}
                    className="w-3.5 h-3.5 border-gray-300 text-[#1e3a5f]" /> {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Class Types</label>
            <div className="space-y-1">
              {['Science', 'Engineering', 'Robotics', 'Financial Literacy'].map(ct => (
                <label key={ct} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={form.class_types.includes(ct)} onChange={() => toggleArray('class_types', ct)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" /> {ct}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Program Type + Pay */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Program Type</label>
            <div className="flex gap-3">
              {['Contract Class', 'Non Contract Class', 'Party'].map(pt => (
                <label key={pt} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={form.program_types.includes(pt)} onChange={() => {
                    toggleArray('program_types', pt);
                    if (pt === 'Party' && !form.program_types.includes('Party') && areaDefaults?.party_pay_rate) {
                      set('base_pay', areaDefaults.party_pay_rate);
                    }
                  }} className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f]" /> {pt}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Input label="Base Pay Rate ($)" type="number" value={form.base_pay} onChange={e => set('base_pay', e.target.value)} />
            {areaDefaults && <p className="text-[10px] text-gray-400 mt-0.5">Area default: ${areaDefaults.base_pay_rate}{areaDefaults.party_pay_rate ? ` / Party: $${areaDefaults.party_pay_rate}` : ''}</p>}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Fulfillment Notes / Special Instructions</label>
          <textarea value={form.fulfillment_notes} onChange={e => set('fulfillment_notes', e.target.value)} rows={2}
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Special Training / Notes for Hiring Team</label>
          <textarea value={form.special_notes} onChange={e => set('special_notes', e.target.value)} rows={2}
            placeholder="Special programs, training requirements, anything useful…"
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-3 border-t border-gray-200">
          <Button onClick={() => submitMutation.mutate()} disabled={!form.geographic_area_id || submitMutation.isPending}>
            {submitMutation.isPending ? 'Submitting…' : 'Submit Hiring Request'}
          </Button>
          <button type="button" onClick={onClose} className="text-sm text-gray-500">Cancel</button>
          {submitMutation.isError && <span className="text-sm text-red-600">{submitMutation.error?.response?.data?.error || 'Failed'}</span>}
        </div>
      </div>
    </div>
  );
}
