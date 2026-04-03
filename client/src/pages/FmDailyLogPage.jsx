import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFmTime, createFmTime, approveFmTime } from '../api/payroll';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
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

export default function FmDailyLogPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const canApprove = ['Admin', 'CEO', 'Human Resources'].includes(user?.role);
  const canSubmit = ['Field Manager', 'Admin', 'CEO'].includes(user?.role);

  // Get field managers — match FM users to professors by name since emails may differ
  const { data: fmUsersData } = useQuery({
    queryKey: ['fm-users'],
    queryFn: () => api.get('/users?role=Field+Manager&limit=100').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const { data: fmProfsData } = useQuery({
    queryKey: ['fm-professors'],
    queryFn: () => api.get('/professors?status=Active&limit=500').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const fmUsers = fmUsersData?.data || [];
  const allProfs = fmProfsData?.data || [];
  const fieldManagers = fmUsers.map(u => {
    // Try to find matching professor by name
    const prof = allProfs.find(p =>
      p.email?.toLowerCase() === u.email?.toLowerCase() ||
      (p.first_name?.toLowerCase() === u.first_name?.toLowerCase() && p.last_name?.toLowerCase() === u.last_name?.toLowerCase())
    );
    return { id: prof?.id || u.id, name: `${u.first_name} ${u.last_name}`, userId: u.id, professorId: prof?.id };
  }).filter(f => f.id);

  // Form state
  const [form, setForm] = useState({
    professor_id: '', work_date: new Date().toISOString().split('T')[0],
    time_in: '09:00', time_out: '17:00', break_minutes: '30',
    work_location: '', field_activities: [], wfh_activities: [],
    field_other: '', wfh_other: '',
    professors_contacted: '', concerns: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleCheck = (list, item) => {
    setForm(f => {
      const arr = f[list];
      return { ...f, [list]: arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item] };
    });
  };

  // Data
  const { data, isLoading } = useQuery({
    queryKey: ['fm-time'],
    queryFn: () => getFmTime({}),
  });
  const entries = data?.data || [];

  const createMutation = useMutation({
    mutationFn: (d) => createFmTime(d),
    onSuccess: () => {
      qc.invalidateQueries(['fm-time']);
      setShowForm(false);
      setForm({ professor_id: '', work_date: new Date().toISOString().split('T')[0], time_in: '09:00', time_out: '17:00', break_minutes: '30', work_location: '', field_activities: [], wfh_activities: [], field_other: '', wfh_other: '', professors_contacted: '', concerns: '' });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id) => approveFmTime(id, { approved_by: user?.name }),
    onSuccess: () => qc.invalidateQueries(['fm-time']),
  });

  const handleSubmit = () => {
    if (!form.professor_id || !form.work_date || !form.time_in || !form.time_out || !form.work_location) return;
    const fieldActs = [...form.field_activities, form.field_other].filter(Boolean).join(', ');
    const wfhActs = [...form.wfh_activities, form.wfh_other].filter(Boolean).join(', ');
    createMutation.mutate({
      professor_id: parseInt(form.professor_id),
      work_date: form.work_date,
      time_in: form.time_in,
      time_out: form.time_out,
      break_minutes: parseInt(form.break_minutes) || 0,
      work_location: form.work_location,
      field_activities: fieldActs || null,
      wfh_activities: wfhActs || null,
      professors_contacted: form.professors_contacted || null,
      concerns: form.concerns || null,
    });
  };

  return (
    <AppShell>
      <PageHeader title="Field Manager Daily Log" action={
        canSubmit ? <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Log Entry'}</Button> : null
      } />

      <div className="p-6 space-y-4">
        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Daily Activity Log</h3>

            <div className="grid grid-cols-3 gap-4">
              <Select label="Name" required value={form.professor_id} onChange={e => set('professor_id', e.target.value)}>
                <option value="">Select…</option>
                {fieldManagers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
              <Input label="Date Being Logged" type="date" required value={form.work_date} onChange={e => set('work_date', e.target.value)} />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input label="Time In" type="time" required value={form.time_in} onChange={e => set('time_in', e.target.value)} />
              <Input label="Time Out" type="time" required value={form.time_out} onChange={e => set('time_out', e.target.value)} />
              <Input label="Break (minutes)" type="number" value={form.break_minutes} onChange={e => set('break_minutes', e.target.value)} />
            </div>

            {/* Were you in the field? */}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-2">Were you out in the field today?</label>
              <div className="space-y-1">
                {LOCATION_OPTIONS.map(o => (
                  <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="work_location" checked={form.work_location === o.value}
                      onChange={() => set('work_location', o.value)} className="accent-[#1e3a5f]" />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Field activities */}
            {(form.work_location === 'field_majority' || form.work_location === 'field_and_home') && (
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-2">In Field: Select all that apply</label>
                <div className="grid grid-cols-2 gap-1">
                  {FIELD_ACTIVITIES.map(a => (
                    <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.field_activities.includes(a)}
                        onChange={() => toggleCheck('field_activities', a)} className="accent-[#1e3a5f]" />
                      {a}
                    </label>
                  ))}
                </div>
                <Input label="Other (specify)" value={form.field_other} onChange={e => set('field_other', e.target.value)} className="mt-2" />
              </div>
            )}

            {/* WFH activities */}
            {(form.work_location === 'home' || form.work_location === 'field_and_home') && (
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-2">WFH: Select all that apply</label>
                <div className="grid grid-cols-2 gap-1">
                  {WFH_ACTIVITIES.map(a => (
                    <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.wfh_activities.includes(a)}
                        onChange={() => toggleCheck('wfh_activities', a)} className="accent-[#1e3a5f]" />
                      {a}
                    </label>
                  ))}
                </div>
                <Input label="Other (specify)" value={form.wfh_other} onChange={e => set('wfh_other', e.target.value)} className="mt-2" />
              </div>
            )}

            {/* Professors contacted */}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Which Professors did you observe or speak with today?</label>
              <textarea value={form.professors_contacted} onChange={e => set('professors_contacted', e.target.value)}
                rows={2} placeholder="Include classroom support, phone calls, remote or in-person observations. Write N/A if none."
                className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>

            {/* Concerns */}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Any concerns or feedback about your day?</label>
              <textarea value={form.concerns} onChange={e => set('concerns', e.target.value)}
                rows={2} placeholder="Optional"
                className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>

            {/* Calculated hours */}
            {form.time_in && form.time_out && (
              <div className="text-sm text-gray-500">
                Total hours: <strong className="text-gray-700">
                  {(() => {
                    const [hi, mi] = form.time_in.split(':').map(Number);
                    const [ho, mo] = form.time_out.split(':').map(Number);
                    const total = ((ho * 60 + mo) - (hi * 60 + mi) - (parseInt(form.break_minutes) || 0)) / 60;
                    return total > 0 ? total.toFixed(2) : '—';
                  })()}
                </strong> hrs
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={handleSubmit} disabled={createMutation.isPending || !form.professor_id || !form.work_location}>
                {createMutation.isPending ? 'Submitting…' : 'Submit Log'}
              </Button>
              {createMutation.isError && <span className="text-sm text-red-600">{createMutation.error?.response?.data?.error || 'Failed'}</span>}
            </div>
          </div>
        )}

        {/* Entries */}
        {isLoading ? <Spinner className="w-6 h-6" /> : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Hours</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Activities</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Professors</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Status</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-gray-400">No log entries</td></tr>
                ) : entries.map((e, i) => {
                  const locLabel = e.work_location === 'field_majority' ? 'Field' : e.work_location === 'field_and_home' ? 'Field + WFH' : e.work_location === 'home' ? 'WFH' : '—';
                  return (
                    <tr key={e.id} className={!e.is_approved ? 'bg-amber-50/30' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-3 py-2">{formatDate(e.work_date)}</td>
                      <td className="px-3 py-2 font-medium">{e.professor_name || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          e.work_location === 'field_majority' ? 'bg-green-100 text-green-700' :
                          e.work_location === 'field_and_home' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{locLabel}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{e.time_in?.slice(0, 5)} – {e.time_out?.slice(0, 5)}</td>
                      <td className="px-3 py-2 text-right font-medium">{e.total_hours || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[200px]">{e.field_activities || e.wfh_activities || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[150px]">{e.professors_contacted || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {e.is_approved ? (
                          <div>
                            <span className="text-xs text-green-600 font-medium">Approved</span>
                            {e.approved_by && <div className="text-[10px] text-gray-400">{e.approved_by}</div>}
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">Pending</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!e.is_approved && canApprove && (
                          <button onClick={() => approveMutation.mutate(e.id)} disabled={approveMutation.isPending}
                            className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 font-medium">
                            {approveMutation.isPending ? '…' : '✓'}
                          </button>
                        )}
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
