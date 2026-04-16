import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createFmTime } from '../api/payroll';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import { formatDate, formatTime } from '../lib/utils';
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

  const myUserId = user?.userId;

  // Daily log / timesheet entries
  const { data: logData, isLoading: logLoading } = useQuery({
    queryKey: ['fm-time', 'mine', myUserId],
    queryFn: () => api.get(`/payroll/fm-time?user_id=${myUserId}`).then(r => r.data),
    enabled: !!myUserId,
  });
  const logEntries = logData?.data || [];

  // Weekly mileage submissions
  const { data: mileWeeksData, isLoading: mileLoading } = useQuery({
    queryKey: ['mileage-weeks', 'mine', myUserId],
    queryFn: () => api.get(`/payroll/mileage-weeks?user_id=${myUserId}`).then(r => r.data),
    enabled: !!myUserId,
  });
  const mileWeeks = mileWeeksData?.data || [];

  // Mileage reimbursement rate
  const { data: settingsData } = useQuery({
    queryKey: ['payroll-settings'],
    queryFn: () => api.get('/payroll/settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const mileageRate = parseFloat(settingsData?.data?.mileage_reimbursement_rate) || 0.70;

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
    if (!myUserId || !logForm.work_date || !logForm.time_in || !logForm.time_out || !logForm.work_location) return;
    const fieldActs = [...logForm.field_activities, logForm.field_other].filter(Boolean).join(', ');
    const wfhActs = [...logForm.wfh_activities, logForm.wfh_other].filter(Boolean).join(', ');
    logMutation.mutate({
      user_id: myUserId,
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

  // --- Weekly Mileage ---
  const [activeWeekId, setActiveWeekId] = useState(null);
  const [entryForm, setEntryForm] = useState({ entry_date: '', odometer_start: '', odometer_end: '', description: '' });
  const setEntry = (k, v) => setEntryForm(f => ({ ...f, [k]: v }));

  // Get current week's Monday
  const getMonday = useCallback((d = new Date()) => {
    const dt = new Date(d);
    const day = dt.getDay();
    dt.setDate(dt.getDate() - ((day + 6) % 7));
    return dt.toISOString().split('T')[0];
  }, []);

  // Active week detail
  const { data: activeWeekData } = useQuery({
    queryKey: ['mileage-week-detail', activeWeekId],
    queryFn: () => api.get(`/payroll/mileage-weeks/${activeWeekId}`).then(r => r.data),
    enabled: !!activeWeekId,
  });
  const activeWeek = activeWeekData?.data;

  const createWeekMutation = useMutation({
    mutationFn: (d) => api.post('/payroll/mileage-weeks', d).then(r => r.data),
    onSuccess: (res) => {
      setActiveWeekId(res.id);
      qc.invalidateQueries(['mileage-weeks']);
    },
  });

  const addEntryMutation = useMutation({
    mutationFn: (d) => api.post(`/payroll/mileage-weeks/${activeWeekId}/entries`, d).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['mileage-week-detail', activeWeekId]);
      qc.invalidateQueries(['mileage-weeks']);
      setEntryForm({ entry_date: '', odometer_start: '', odometer_end: '', description: '' });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (entryId) => api.delete(`/payroll/mileage-weeks/${activeWeekId}/entries/${entryId}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['mileage-week-detail', activeWeekId]);
      qc.invalidateQueries(['mileage-weeks']);
    },
  });

  const submitWeekMutation = useMutation({
    mutationFn: () => api.patch(`/payroll/mileage-weeks/${activeWeekId}/submit`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['mileage-week-detail', activeWeekId]);
      qc.invalidateQueries(['mileage-weeks']);
    },
  });

  const reopenWeekMutation = useMutation({
    mutationFn: () => api.patch(`/payroll/mileage-weeks/${activeWeekId}/reopen`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['mileage-week-detail', activeWeekId]);
      qc.invalidateQueries(['mileage-weeks']);
    },
  });

  const startCurrentWeek = () => {
    createWeekMutation.mutate({ user_id: myUserId, week_start: getMonday() });
  };

  const addDailyEntry = () => {
    if (!entryForm.entry_date || !entryForm.odometer_start || !entryForm.odometer_end || !entryForm.description) return;
    addEntryMutation.mutate(entryForm);
  };

  if (!myUserId) return <AppShell><div className="flex items-center justify-center h-64"><Spinner className="w-8 h-8" /></div></AppShell>;

  const pendingLogs = logEntries.filter(e => !e.is_approved).length;
  const pendingMiles = mileWeeks.filter(e => e.status === 'submitted').length;
  const draftMiles = mileWeeks.filter(e => e.status === 'draft').length;

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
            <div className="text-xs text-gray-500 uppercase tracking-wide">Mileage</div>
            <div className={`text-2xl font-bold mt-1 ${draftMiles > 0 ? 'text-amber-600' : pendingMiles > 0 ? 'text-blue-600' : 'text-green-600'}`}>
              {draftMiles > 0 ? draftMiles : pendingMiles}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{draftMiles > 0 ? 'draft — needs submission' : pendingMiles > 0 ? 'submitted — awaiting approval' : 'all clear'}</div>
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
                        <td className="px-3 py-2 text-gray-600">{e.time_in ? formatTime(e.time_in) : '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{e.time_out ? formatTime(e.time_out) : '—'}</td>
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
            {/* Rate info */}
            <div className="text-xs text-gray-400">
              Current reimbursement rate: <strong className="text-gray-600">${mileageRate.toFixed(2)}/mile</strong>
              <span className="ml-2">(Due by Monday at noon each week)</span>
            </div>

            {/* Active week editor */}
            {activeWeekId && activeWeek ? (
              <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">
                      Week of {formatDate(activeWeek.week_start)} — {formatDate(activeWeek.week_end)}
                    </h3>
                    <div className="flex gap-4 mt-1 text-sm">
                      <span className="text-gray-500">Total: <strong className="text-[#1e3a5f]">{parseFloat(activeWeek.total_miles || 0).toFixed(1)} miles</strong></span>
                      <span className="text-gray-500">Reimbursement: <strong className="text-green-700">${parseFloat(activeWeek.reimbursement_total || 0).toFixed(2)}</strong></span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        activeWeek.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                        activeWeek.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                        activeWeek.status === 'approved' ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-700'
                      }`}>{activeWeek.status}</span>
                    </div>
                  </div>
                  <button onClick={() => setActiveWeekId(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                </div>

                {activeWeek.status === 'rejected' && activeWeek.rejection_note && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                    <strong>Rejected:</strong> {activeWeek.rejection_note}
                    <div className="mt-2">
                      <Button size="sm" onClick={() => reopenWeekMutation.mutate()} disabled={reopenWeekMutation.isPending}>
                        {reopenWeekMutation.isPending ? 'Reopening...' : 'Reopen & Edit'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Daily entries table */}
                {(activeWeek.entries || []).length > 0 && (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Odometer Start</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Odometer End</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Miles</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Reimb.</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                        {activeWeek.status === 'draft' && <th className="w-12"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activeWeek.entries.map(e => (
                        <tr key={e.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">{formatDate(e.entry_date)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{parseFloat(e.odometer_start).toFixed(1)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{parseFloat(e.odometer_end).toFixed(1)}</td>
                          <td className="px-3 py-2 text-right font-medium">{parseFloat(e.miles).toFixed(1)}</td>
                          <td className="px-3 py-2 text-right text-green-700">${(parseFloat(e.miles) * activeWeek.reimbursement_rate).toFixed(2)}</td>
                          <td className="px-3 py-2 text-gray-600">{e.description}</td>
                          {activeWeek.status === 'draft' && (
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => { if (confirm('Remove this entry?')) deleteEntryMutation.mutate(e.id); }}
                                className="text-xs text-red-400 hover:text-red-600">Remove</button>
                            </td>
                          )}
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-medium">
                        <td className="px-3 py-2" colSpan={3}>Week Total</td>
                        <td className="px-3 py-2 text-right text-[#1e3a5f]">{parseFloat(activeWeek.total_miles || 0).toFixed(1)}</td>
                        <td className="px-3 py-2 text-right text-green-700">${parseFloat(activeWeek.reimbursement_total || 0).toFixed(2)}</td>
                        <td colSpan={activeWeek.status === 'draft' ? 2 : 1}></td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {/* Add entry form (draft only) */}
                {activeWeek.status === 'draft' && (
                  <div className="border-t border-gray-200 pt-4 space-y-3">
                    <h4 className="text-xs font-semibold text-gray-600 uppercase">Add Daily Entry</h4>
                    <div className="grid grid-cols-5 gap-3">
                      <Input label="Date" type="date" value={entryForm.entry_date}
                        min={activeWeek.week_start} max={activeWeek.week_end}
                        onChange={e => setEntry('entry_date', e.target.value)} />
                      <Input label="Odometer Start" type="number" step="0.1" value={entryForm.odometer_start}
                        onChange={e => setEntry('odometer_start', e.target.value)} />
                      <Input label="Odometer End" type="number" step="0.1" value={entryForm.odometer_end}
                        onChange={e => setEntry('odometer_end', e.target.value)} />
                      <div className="col-span-2">
                        <Input label="Where did you go?" value={entryForm.description}
                          onChange={e => setEntry('description', e.target.value)}
                          placeholder="e.g. Drove to Oak Park Elementary for observation" />
                      </div>
                    </div>
                    {entryForm.odometer_start && entryForm.odometer_end && parseFloat(entryForm.odometer_end) > parseFloat(entryForm.odometer_start) && (
                      <div className="text-sm text-gray-500">
                        This trip: <strong className="text-gray-700">{(parseFloat(entryForm.odometer_end) - parseFloat(entryForm.odometer_start)).toFixed(1)} miles</strong>
                        {' '}= <strong className="text-green-700">${((parseFloat(entryForm.odometer_end) - parseFloat(entryForm.odometer_start)) * mileageRate).toFixed(2)}</strong>
                      </div>
                    )}
                    <div className="flex gap-3 items-center">
                      <Button size="sm" onClick={addDailyEntry}
                        disabled={addEntryMutation.isPending || !entryForm.entry_date || !entryForm.odometer_start || !entryForm.odometer_end || !entryForm.description}>
                        {addEntryMutation.isPending ? 'Adding...' : '+ Add Entry'}
                      </Button>
                      {addEntryMutation.isError && <span className="text-xs text-red-600">{addEntryMutation.error?.response?.data?.error || 'Failed'}</span>}
                    </div>
                  </div>
                )}

                {/* Submit week button */}
                {activeWeek.status === 'draft' && (activeWeek.entries || []).length > 0 && (
                  <div className="border-t border-gray-200 pt-4 flex items-center gap-3">
                    <Button onClick={() => submitWeekMutation.mutate()} disabled={submitWeekMutation.isPending}>
                      {submitWeekMutation.isPending ? 'Submitting...' : 'Submit Week for Approval'}
                    </Button>
                    <span className="text-xs text-gray-400">Once submitted, you cannot edit entries until an admin reopens it.</span>
                    {submitWeekMutation.isError && <span className="text-xs text-red-600">{submitWeekMutation.error?.response?.data?.error || 'Failed'}</span>}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex justify-end">
                <Button onClick={startCurrentWeek} disabled={createWeekMutation.isPending}>
                  {createWeekMutation.isPending ? 'Creating...' : '+ Start Current Week'}
                </Button>
              </div>
            )}

            {/* Past weeks list */}
            <h3 className="text-sm font-semibold text-gray-700 mt-2">Weekly Submissions</h3>
            {mileLoading ? <Spinner className="w-6 h-6" /> : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Week</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Total Miles</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Rate</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Reimbursement</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Status</th>
                      <th className="w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mileWeeks.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-400">No mileage weeks yet</td></tr>
                    ) : mileWeeks.map((w, i) => (
                      <tr key={w.id} className={`hover:bg-gray-50 ${
                        w.status === 'rejected' ? 'bg-red-50/30' :
                        w.status === 'draft' ? 'bg-amber-50/30' :
                        i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                      }`}>
                        <td className="px-3 py-2 font-medium">{formatDate(w.week_start)} — {formatDate(w.week_end)}</td>
                        <td className="px-3 py-2 text-right">{parseFloat(w.total_miles || 0).toFixed(1)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">${parseFloat(w.reimbursement_rate).toFixed(2)}/mi</td>
                        <td className="px-3 py-2 text-right font-medium text-green-700">${parseFloat(w.reimbursement_total || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            w.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                            w.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                            w.status === 'approved' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>{w.status}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => setActiveWeekId(w.id)} className="text-xs text-[#1e3a5f] hover:underline">
                            {w.status === 'draft' ? 'Edit' : 'View'}
                          </button>
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
