import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createFmTime, createMileage } from '../api/payroll';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../lib/utils';
import api from '../api/client';

const FIELD_ACTIVITIES = [
  'Conducted formal observation(s)',
  'Conducted casual observation(s)',
  'Visited a site',
  'Substituted',
  'Materials Pickup/Dropoff',
  'Conducted a demonstration at a school',
];

const WFH_ACTIVITIES = [
  'Lesson practice',
  'Text/email/phone check-ins with Professors',
  'Observation follow-up emails',
  'Meetings (Weekly Scheduler Meeting/Biweekly Development, etc.)',
  'Schedule building',
  'Restocking supplies for self or Professors',
  'Materials organization',
];

const LOCATION_OPTIONS = [
  { value: 'field_majority', label: 'Yes — majority of shift in the field' },
  { value: 'field_and_home', label: 'Yes — some field, some WFH' },
  { value: 'home', label: 'No — worked from home today' },
];

const LOC_LABEL = { field_majority: 'Field', field_and_home: 'Field + WFH', home: 'WFH' };
const LOC_CLASS = { field_majority: 'bg-green-100 text-green-700', field_and_home: 'bg-blue-100 text-blue-700', home: 'bg-gray-100 text-gray-600' };

function calcHours(time_in, time_out, break_minutes) {
  if (!time_in || !time_out) return null;
  const [hi, mi] = time_in.split(':').map(Number);
  const [ho, mo] = time_out.split(':').map(Number);
  const total = ((ho * 60 + mo) - (hi * 60 + mi) - (parseInt(break_minutes) || 0)) / 60;
  return total > 0 ? total.toFixed(2) : null;
}

export default function FmWorkdayPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('log');
  const [showLogForm, setShowLogForm] = useState(false);
  const [showMileageForm, setShowMileageForm] = useState(false);

  // Resolve logged-in user to professor_id
  const { data: profMatch, isLoading: profLoading } = useQuery({
    queryKey: ['my-fm-professor', user?.userId],
    queryFn: async () => {
      const res = await api.get('/professors?status=Active&limit=500');
      const profs = res.data?.data || [];
      // Match by user name
      const [first, ...rest] = (user?.name || '').split(' ');
      const last = rest.join(' ');
      const match = profs.find(p =>
        (p.first_name?.toLowerCase() === first?.toLowerCase() && p.last_name?.toLowerCase() === last?.toLowerCase()) ||
        p.email?.toLowerCase() === user?.email?.toLowerCase()
      );
      return match || null;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });
  const myProfId = profMatch?.id;

  // Daily log / timesheet entries
  const { data: logData, isLoading: logLoading } = useQuery({
    queryKey: ['fm-time', 'mine', myProfId],
    queryFn: () => api.get(`/payroll/fm-time?professor_id=${myProfId}`).then(r => r.data),
    enabled: !!myProfId,
  });
  const logEntries = logData?.data || [];

  // Mileage entries
  const { data: mileData, isLoading: mileLoading } = useQuery({
    queryKey: ['mileage', 'mine', myProfId],
    queryFn: () => api.get(`/payroll/mileage?professor_id=${myProfId}`).then(r => r.data),
    enabled: !!myProfId,
  });
  const mileEntries = mileData?.data || [];

  // Weekly summary
  const weekSummary = useMemo(() => {
    if (!logEntries.length) return null;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const thisWeek = logEntries.filter(e => {
      const d = new Date(e.work_date);
      return d >= monday && d <= sunday;
    });
    const totalHours = thisWeek.reduce((sum, e) => sum + (parseFloat(e.total_hours) || 0), 0);
    return { days: thisWeek.length, hours: totalHours.toFixed(2) };
  }, [logEntries]);

  // --- Daily Log Form ---
  const [logForm, setLogForm] = useState({
    work_date: new Date().toISOString().split('T')[0],
    time_in: '09:00', time_out: '17:00', break_minutes: '30',
    work_location: '', field_activities: [], wfh_activities: [],
    field_other: '', wfh_other: '',
    professors_contacted: '', concerns: '',
  });
  const setLog = (k, v) => setLogForm(f => ({ ...f, [k]: v }));
  const toggleLogCheck = (list, item) => {
    setLogForm(f => {
      const arr = f[list];
      return { ...f, [list]: arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item] };
    });
  };

  const logMutation = useMutation({
    mutationFn: (d) => createFmTime(d),
    onSuccess: () => {
      qc.invalidateQueries(['fm-time']);
      setShowLogForm(false);
      setLogForm(f => ({ ...f, work_location: '', field_activities: [], wfh_activities: [], field_other: '', wfh_other: '', professors_contacted: '', concerns: '' }));
    },
  });

  const submitLog = () => {
    if (!myProfId || !logForm.work_date || !logForm.time_in || !logForm.time_out || !logForm.work_location) return;
    const fieldActs = [...logForm.field_activities, logForm.field_other].filter(Boolean).join(', ');
    const wfhActs = [...logForm.wfh_activities, logForm.wfh_other].filter(Boolean).join(', ');
    logMutation.mutate({
      professor_id: myProfId,
      work_date: logForm.work_date,
      time_in: logForm.time_in,
      time_out: logForm.time_out,
      break_minutes: parseInt(logForm.break_minutes) || 0,
      work_location: logForm.work_location,
      field_activities: fieldActs || null,
      wfh_activities: wfhActs || null,
      professors_contacted: logForm.professors_contacted || null,
      concerns: logForm.concerns || null,
    });
  };

  // --- Mileage Form ---
  const [mileForm, setMileForm] = useState({
    submission_date: new Date().toISOString().split('T')[0],
    miles_claimed: '', reimbursement_total: '', pdf_link: '',
  });
  const setMile = (k, v) => setMileForm(f => ({ ...f, [k]: v }));

  const mileMutation = useMutation({
    mutationFn: (d) => createMileage(d),
    onSuccess: () => {
      qc.invalidateQueries(['mileage']);
      setShowMileageForm(false);
      setMileForm({ submission_date: new Date().toISOString().split('T')[0], miles_claimed: '', reimbursement_total: '', pdf_link: '' });
    },
  });

  const submitMileage = () => {
    if (!myProfId || !mileForm.miles_claimed) return;
    mileMutation.mutate({
      professor_id: myProfId,
      submission_date: mileForm.submission_date,
      miles_claimed: parseInt(mileForm.miles_claimed),
      reimbursement_total: parseFloat(mileForm.reimbursement_total) || 0,
      pdf_link: mileForm.pdf_link || null,
      submitted_by: user?.name || '',
    });
  };

  if (profLoading) return <AppShell><div className="flex items-center justify-center h-64"><Spinner className="w-8 h-8" /></div></AppShell>;

  if (!myProfId) {
    return (
      <AppShell>
        <PageHeader title="My Workday" />
        <div className="p-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            Unable to match your account to a professor profile. Please contact an admin to link your account.
          </div>
        </div>
      </AppShell>
    );
  }

  const pendingLogs = logEntries.filter(e => !e.is_approved).length;
  const pendingMiles = mileEntries.filter(e => !e.is_processed).length;

  return (
    <AppShell>
      <PageHeader title="My Workday" />

      <div className="p-6">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">This Week</div>
            <div className="text-2xl font-bold text-[#1e3a5f] mt-1">{weekSummary?.hours || '0.00'} <span className="text-sm font-normal text-gray-500">hrs</span></div>
            <div className="text-xs text-gray-400 mt-0.5">{weekSummary?.days || 0} days logged</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Pending Logs</div>
            <div className={`text-2xl font-bold mt-1 ${pendingLogs > 0 ? 'text-amber-600' : 'text-green-600'}`}>{pendingLogs}</div>
            <div className="text-xs text-gray-400 mt-0.5">awaiting approval</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Pending Mileage</div>
            <div className={`text-2xl font-bold mt-1 ${pendingMiles > 0 ? 'text-amber-600' : 'text-green-600'}`}>{pendingMiles}</div>
            <div className="text-xs text-gray-400 mt-0.5">awaiting processing</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          {[['log', 'Daily Log & Timesheet'], ['mileage', 'Mileage']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === key ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{label}</button>
          ))}
        </div>

        {/* ========== DAILY LOG / TIMESHEET TAB ========== */}
        {tab === 'log' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowLogForm(!showLogForm)}>{showLogForm ? 'Cancel' : '+ New Daily Log'}</Button>
            </div>

            {showLogForm && (
              <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-800">Daily Activity Log</h3>

                <div className="grid grid-cols-4 gap-4">
                  <Input label="Date" type="date" required value={logForm.work_date} onChange={e => setLog('work_date', e.target.value)} />
                  <Input label="Time In" type="time" required value={logForm.time_in} onChange={e => setLog('time_in', e.target.value)} />
                  <Input label="Time Out" type="time" required value={logForm.time_out} onChange={e => setLog('time_out', e.target.value)} />
                  <Input label="Break (min)" type="number" value={logForm.break_minutes} onChange={e => setLog('break_minutes', e.target.value)} />
                </div>

                {logForm.time_in && logForm.time_out && (
                  <div className="text-sm text-gray-500">
                    Total hours: <strong className="text-gray-700">{calcHours(logForm.time_in, logForm.time_out, logForm.break_minutes) || '—'}</strong> hrs
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-2">Were you out in the field today?</label>
                  <div className="space-y-1">
                    {LOCATION_OPTIONS.map(o => (
                      <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="work_location" checked={logForm.work_location === o.value}
                          onChange={() => setLog('work_location', o.value)} className="accent-[#1e3a5f]" />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>

                {(logForm.work_location === 'field_majority' || logForm.work_location === 'field_and_home') && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-2">In Field: Select all that apply</label>
                    <div className="grid grid-cols-2 gap-1">
                      {FIELD_ACTIVITIES.map(a => (
                        <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={logForm.field_activities.includes(a)}
                            onChange={() => toggleLogCheck('field_activities', a)} className="accent-[#1e3a5f]" />
                          {a}
                        </label>
                      ))}
                    </div>
                    <Input label="Other (specify)" value={logForm.field_other} onChange={e => setLog('field_other', e.target.value)} className="mt-2" />
                  </div>
                )}

                {(logForm.work_location === 'home' || logForm.work_location === 'field_and_home') && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-2">WFH: Select all that apply</label>
                    <div className="grid grid-cols-2 gap-1">
                      {WFH_ACTIVITIES.map(a => (
                        <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={logForm.wfh_activities.includes(a)}
                            onChange={() => toggleLogCheck('wfh_activities', a)} className="accent-[#1e3a5f]" />
                          {a}
                        </label>
                      ))}
                    </div>
                    <Input label="Other (specify)" value={logForm.wfh_other} onChange={e => setLog('wfh_other', e.target.value)} className="mt-2" />
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Which Professors did you observe or speak with today?</label>
                  <textarea value={logForm.professors_contacted} onChange={e => setLog('professors_contacted', e.target.value)}
                    rows={2} placeholder="Include classroom support, phone calls, remote or in-person observations. Write N/A if none."
                    className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Any concerns or feedback?</label>
                  <textarea value={logForm.concerns} onChange={e => setLog('concerns', e.target.value)}
                    rows={2} placeholder="Optional"
                    className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                </div>

                <div className="flex gap-3 items-center">
                  <Button onClick={submitLog} disabled={logMutation.isPending || !logForm.work_location}>
                    {logMutation.isPending ? 'Submitting...' : 'Submit Log'}
                  </Button>
                  {logMutation.isError && <span className="text-sm text-red-600">{logMutation.error?.response?.data?.error || 'Failed to submit'}</span>}
                  {logMutation.isSuccess && <span className="text-sm text-green-600">Log submitted!</span>}
                </div>
              </div>
            )}

            {/* Timesheet table */}
            {logLoading ? <Spinner className="w-6 h-6" /> : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Time In</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Time Out</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Break</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Hours</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Activities</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logEntries.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-8 text-gray-400">No log entries yet</td></tr>
                    ) : logEntries.map((e, i) => (
                      <tr key={e.id} className={!e.is_approved ? 'bg-amber-50/30' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2 font-medium">{formatDate(e.work_date)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${LOC_CLASS[e.work_location] || 'bg-gray-100 text-gray-600'}`}>
                            {LOC_LABEL[e.work_location] || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{e.time_in?.slice(0, 5)}</td>
                        <td className="px-3 py-2 text-gray-600">{e.time_out?.slice(0, 5)}</td>
                        <td className="px-3 py-2 text-gray-500">{e.break_minutes || 0}m</td>
                        <td className="px-3 py-2 text-right font-medium">{e.total_hours || calcHours(e.time_in, e.time_out, e.break_minutes) || '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[250px]">
                          {[e.field_activities, e.wfh_activities].filter(Boolean).join('; ') || '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {e.is_approved ? (
                            <span className="text-xs text-green-600 font-medium">Approved</span>
                          ) : (
                            <span className="text-xs text-amber-600 font-medium">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========== MILEAGE TAB ========== */}
        {tab === 'mileage' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowMileageForm(!showMileageForm)}>{showMileageForm ? 'Cancel' : '+ New Mileage'}</Button>
            </div>

            {showMileageForm && (
              <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-800">Mileage Submission</h3>
                <div className="grid grid-cols-4 gap-4">
                  <Input label="Date" type="date" value={mileForm.submission_date} onChange={e => setMile('submission_date', e.target.value)} />
                  <Input label="Miles Claimed" type="number" value={mileForm.miles_claimed} onChange={e => setMile('miles_claimed', e.target.value)} />
                  <Input label="Reimbursement Total" type="number" step="0.01" prefix="$" value={mileForm.reimbursement_total} onChange={e => setMile('reimbursement_total', e.target.value)} />
                  <Input label="PDF Link (optional)" value={mileForm.pdf_link} onChange={e => setMile('pdf_link', e.target.value)} placeholder="URL..." />
                </div>
                <div className="flex gap-3 items-center">
                  <Button onClick={submitMileage} disabled={mileMutation.isPending || !mileForm.miles_claimed}>
                    {mileMutation.isPending ? 'Submitting...' : 'Submit Mileage'}
                  </Button>
                  {mileMutation.isError && <span className="text-sm text-red-600">{mileMutation.error?.response?.data?.error || 'Failed'}</span>}
                  {mileMutation.isSuccess && <span className="text-sm text-green-600">Mileage submitted!</span>}
                </div>
              </div>
            )}

            {mileLoading ? <Spinner className="w-6 h-6" /> : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Miles</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Reimbursement</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">PDF</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mileEntries.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-gray-400">No mileage submissions</td></tr>
                    ) : mileEntries.map((e, i) => (
                      <tr key={e.id} className={!e.is_processed ? 'bg-amber-50/30' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2 font-medium">{formatDate(e.submission_date)}</td>
                        <td className="px-3 py-2 text-right">{e.miles_claimed}</td>
                        <td className="px-3 py-2 text-right font-medium">${parseFloat(e.reimbursement_total || 0).toFixed(2)}</td>
                        <td className="px-3 py-2">
                          {e.pdf_link ? <a href={e.pdf_link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1e3a5f] hover:underline">View</a> : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {e.is_processed ? (
                            <span className="text-xs text-green-600 font-medium">Processed</span>
                          ) : (
                            <span className="text-xs text-amber-600 font-medium">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
