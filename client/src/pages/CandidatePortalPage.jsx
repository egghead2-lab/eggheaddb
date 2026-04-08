import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatTime } from '../lib/utils';

const STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', complete: 'Complete', hired: 'Hired' };

export default function CandidatePortalPage() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [msgBody, setMsgBody] = useState('');
  const messagesEndRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['my-portal'],
    queryFn: () => api.get('/onboarding/my-portal').then(r => r.data),
  });

  const portal = data?.data || {};
  const requirements = portal.requirements || [];
  const tasks = portal.tasks || [];
  const messages = portal.messages || [];
  const today = new Date().toISOString().split('T')[0];

  const completedReqs = requirements.filter(r => r.completed).length;
  const totalReqs = requirements.length;
  const openTasks = tasks.filter(t => !t.completed).length;

  const sendMessage = useMutation({
    mutationFn: (body) => api.post('/onboarding/my-portal/messages', { body }),
    onSuccess: () => { setMsgBody(''); qc.invalidateQueries(['my-portal']); },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#152a47] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <div className="font-bold text-lg">Professor Egghead</div>
          <div className="text-white/50 text-xs">Candidate Portal</div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/80">{user?.name}</span>
          <button onClick={() => logout()} className="text-xs text-white/50 hover:text-white">Sign out</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {portal.full_name?.split(' ')[0]}</h1>
          <div className="flex items-center gap-3 mt-1">
            <Badge status={STATUS_LABELS[portal.status] || portal.status} />
            {portal.first_class_date && (
              <span className="text-sm text-gray-500">First class: {formatDate(portal.first_class_date)}</span>
            )}
            {portal.geographic_area_name && (
              <span className="text-sm text-gray-500">Area: {portal.geographic_area_name}</span>
            )}
          </div>
          {(portal.onboarder_name || portal.trainer_name) && (
            <div className="text-sm text-gray-500 mt-1">
              {portal.onboarder_name && <span>Onboarder: <strong>{portal.onboarder_name}</strong></span>}
              {portal.onboarder_name && portal.trainer_name && <span className="mx-2">|</span>}
              {portal.trainer_name && <span>Trainer: <strong>{portal.trainer_name}</strong></span>}
            </div>
          )}
        </div>

        {/* Progress summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-[#1e3a5f]">{completedReqs}/{totalReqs}</div>
            <div className="text-xs text-gray-500 mt-0.5">Requirements Complete</div>
            {totalReqs > 0 && (
              <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                <div className={`h-full rounded-full ${completedReqs === totalReqs ? 'bg-green-500' : 'bg-[#1e3a5f]'}`}
                  style={{ width: `${Math.round((completedReqs / totalReqs) * 100)}%` }} />
              </div>
            )}
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className={`text-2xl font-bold ${openTasks > 0 ? 'text-amber-600' : 'text-green-600'}`}>{openTasks}</div>
            <div className="text-xs text-gray-500 mt-0.5">Open Tasks</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-violet-600">{messages.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Messages</div>
          </div>
        </div>

        {/* Info completion banner */}
        {!portal.availability?.personal_info_completed && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
            <span className="text-amber-600 text-xl">!</span>
            <div>
              <div className="text-sm font-medium text-amber-800">Please complete your information</div>
              <div className="text-xs text-amber-600">Fill out your personal info and availability below to get started.</div>
            </div>
          </div>
        )}

        {/* Personal Info Form */}
        <PersonalInfoForm portal={portal} />

        {/* Tentative Schedule */}
        {(portal.schedule || []).length > 0 && (
          <CandidateScheduleView schedule={portal.schedule} scheduleReady={portal.schedule_ready}
            scheduleConfirmedAt={portal.schedule_confirmed_at} scheduleChanged={portal.schedule_changed_since_confirm} />
        )}

        {/* Requirements checklist */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Onboarding Requirements</h2>
          </div>
          <div className="p-4 space-y-2">
            {requirements.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No requirements assigned yet.</p>
            ) : [...requirements].sort((a, b) => {
              if (a.completed && !b.completed) return 1;
              if (!a.completed && b.completed) return -1;
              const aOvr = a.due_date && a.due_date < today && !a.completed;
              const bOvr = b.due_date && b.due_date < today && !b.completed;
              if (aOvr && !bOvr) return -1;
              if (!aOvr && bOvr) return 1;
              if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
              if (a.due_date) return -1;
              return 0;
            }).map(r => {
              const isOverdue = r.due_date && r.due_date < today && !r.completed;
              const daysUntil = r.due_date ? Math.ceil((new Date(r.due_date) - new Date(today)) / 86400000) : null;
              const isUpcoming = daysUntil !== null && daysUntil > 7 && !r.completed;
              const isPendingApproval = r.approval_status === 'pending_approval';
              const canSelfComplete = !r.completed && !r.needs_approval;
              return (
                <PortalRequirementRow key={r.id} r={r} isOverdue={isOverdue} isUpcoming={isUpcoming}
                  isPendingApproval={isPendingApproval} canSelfComplete={canSelfComplete} qc={qc} />
              );
            })}
          </div>
        </div>

        {/* Tasks */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Tasks</h2>
          </div>
          <div className="p-4 space-y-1.5">
            {tasks.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No tasks assigned yet.</p>
            ) : tasks.map(t => (
              <div key={t.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                t.completed ? 'bg-green-50/30' :
                t.due_date && t.due_date < today ? 'bg-red-50/30' :
                'bg-gray-50'
              }`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  t.completed ? 'border-green-500 bg-green-500' : 'border-gray-300'
                }`}>
                  {t.completed && <span className="text-white text-xs">&#10003;</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${t.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</div>
                  {t.description && <div className="text-xs text-gray-400">{t.description}</div>}
                </div>
                {t.due_date && (
                  <span className={`text-xs ${t.due_date < today && !t.completed ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                    {formatDate(t.due_date)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Messages</h2>
          </div>
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No messages yet. Send a message to your onboarding team below.</p>
            )}
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.is_from_candidate ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                  m.is_from_candidate
                    ? 'bg-[#1e3a5f] text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {!m.is_from_candidate && (
                    <div className="text-xs font-medium mb-0.5 opacity-70">{m.sender_name}</div>
                  )}
                  <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                  <div className={`text-[10px] mt-1 ${m.is_from_candidate ? 'text-white/50' : 'text-gray-400'}`}>
                    {new Date(m.ts_inserted).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-gray-200 px-4 py-3">
            <form onSubmit={e => { e.preventDefault(); if (msgBody.trim()) sendMessage.mutate(msgBody); }}
              className="flex gap-2">
              <input type="text" value={msgBody} onChange={e => setMsgBody(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]" />
              <button type="submit" disabled={!msgBody.trim() || sendMessage.isPending}
                className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a47] disabled:opacity-50 transition-colors">
                {sendMessage.isPending ? 'Sending…' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function PortalRequirementRow({ r, isOverdue, isUpcoming, isPendingApproval, canSelfComplete, qc }) {
  const fileRef = useRef(null);
  const [stagedFiles, setStagedFiles] = useState([]);

  const uploadAndSubmit = useMutation({
    mutationFn: async () => {
      if (stagedFiles.length > 0) {
        const fd = new FormData();
        stagedFiles.forEach(f => fd.append('files', f));
        fd.append('candidate_requirement_id', r.id);
        await api.post('/onboarding/my-portal/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      await api.post('/onboarding/my-portal/submit-requirement', { candidate_requirement_id: r.id });
    },
    onSuccess: () => { setStagedFiles([]); qc.invalidateQueries(['my-portal']); },
  });

  const completeMutation = useMutation({
    mutationFn: () => api.post('/onboarding/my-portal/complete-requirement', { candidate_requirement_id: r.id }),
    onSuccess: () => qc.invalidateQueries(['my-portal']),
  });

  const addFiles = (e) => {
    const files = Array.from(e.target.files || []);
    setStagedFiles(prev => [...prev, ...files].slice(0, 3));
    e.target.value = '';
  };

  return (
    <div className={`px-4 py-4 rounded-lg ${
      r.completed ? 'bg-green-50/60' :
      isPendingApproval ? 'bg-amber-50/60 border border-amber-200' :
      isOverdue ? 'bg-red-50/60 border border-red-200' :
      isUpcoming ? 'bg-gray-50/50 opacity-60' :
      'bg-gray-50'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
          r.completed ? 'border-green-500 bg-green-500' :
          isPendingApproval ? 'border-amber-400 bg-amber-400' :
          'border-gray-300'
        }`}>
          {r.completed && <span className="text-white text-sm">&#10003;</span>}
          {isPendingApproval && <span className="text-white text-sm font-bold">!</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-base font-medium ${r.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{r.title}</div>
          {r.description && <div className="text-sm text-gray-500 mt-0.5">{r.description}</div>}
          {isPendingApproval && <div className="text-sm text-amber-700 font-medium mt-1">Submitted — awaiting review from your team</div>}

          {/* Actions */}
          {!r.completed && !isPendingApproval && (
            <div className="mt-3 space-y-2">
              {/* File upload area */}
              {r.requires_document === 1 && (
                <div>
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={addFiles} accept="*/*" />
                  {stagedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {stagedFiles.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-600">
                          {f.name} <span className="text-gray-300">({(f.size/1024).toFixed(0)}KB)</span>
                          <button type="button" onClick={() => setStagedFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-0.5">&times;</button>
                        </span>
                      ))}
                    </div>
                  )}
                  {stagedFiles.length < 3 && (
                    <button type="button" onClick={() => fileRef.current?.click()}
                      className="text-sm text-[#1e3a5f] hover:underline flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      {stagedFiles.length > 0 ? `Add more (${3 - stagedFiles.length} remaining)` : 'Upload documents (max 3)'}
                    </button>
                  )}
                </div>
              )}

              {/* Submit buttons */}
              <div className="flex items-center gap-2">
                {r.needs_approval === 1 ? (
                  <button type="button" onClick={() => uploadAndSubmit.mutate()}
                    disabled={uploadAndSubmit.isPending || (r.requires_document === 1 && stagedFiles.length === 0)}
                    className="text-sm bg-[#1e3a5f] text-white px-4 py-1.5 rounded-lg hover:bg-[#152a47] disabled:opacity-40 font-medium">
                    {uploadAndSubmit.isPending ? 'Submitting…' : 'Submit for Approval'}
                  </button>
                ) : canSelfComplete && (
                  <button type="button" onClick={() => { if (stagedFiles.length > 0) uploadAndSubmit.mutate(); else completeMutation.mutate(); }}
                    disabled={completeMutation.isPending || uploadAndSubmit.isPending}
                    className="text-sm bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-40 font-medium">
                    {(completeMutation.isPending || uploadAndSubmit.isPending) ? 'Completing…' : 'Mark Complete'}
                  </button>
                )}
                {uploadAndSubmit.isError && <span className="text-xs text-red-600">Failed to submit</span>}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            r.type === 'document' ? 'bg-blue-100 text-blue-700' :
            r.type === 'training' ? 'bg-purple-100 text-purple-700' :
            r.type === 'compliance' ? 'bg-amber-100 text-amber-700' :
            'bg-gray-100 text-gray-600'
          }`}>{r.type}</span>
          {r.due_date && (
            <span className={`text-xs ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
              {isOverdue ? 'OVERDUE' : formatDate(r.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const SCHED_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const SCHED_DAY_ABBR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function getSchedDays(p) { return SCHED_DAYS.map((d, i) => p[d] ? SCHED_DAY_ABBR[i] : null).filter(Boolean).join(', '); }

function CandidateScheduleView({ schedule, scheduleReady, scheduleConfirmedAt, scheduleChanged }) {
  const qc = useQueryClient();

  const confirmMutation = useMutation({
    mutationFn: () => api.post('/onboarding/my-portal/confirm-schedule'),
    onSuccess: () => qc.invalidateQueries(['my-portal']),
  });

  const needsConfirm = scheduleReady && (!scheduleConfirmedAt || scheduleChanged);
  const isConfirmed = scheduleConfirmedAt && !scheduleChanged;

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900">Your Schedule</h2>
          {isConfirmed && <span className="text-[10px] text-green-600 bg-green-100 px-1.5 py-0.5 rounded font-medium">Confirmed</span>}
          {scheduleChanged && <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-medium">Updated — Please Re-confirm</span>}
          {!scheduleReady && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded font-medium">Being Built</span>}
        </div>
      </div>
      <div className="p-4">
        {!scheduleReady && (
          <p className="text-sm text-gray-500 mb-3">Your scheduler is building your class schedule. You'll be asked to confirm once it's ready.</p>
        )}

        {/* Class cards */}
        <div className="space-y-3">
          {schedule.map(s => (
            <div key={s.id} className={`rounded-lg border p-4 ${
              s.status === 'changed' ? 'border-amber-300 bg-amber-50' :
              s.status === 'confirmed' ? 'border-green-200 bg-green-50/30' :
              'border-gray-200'
            }`}>
              <div className="font-medium text-gray-900">{s.program_nickname}</div>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div><span className="text-gray-400 text-xs">Day(s)</span><div className="text-gray-800">{getSchedDays(s)}</div></div>
                <div><span className="text-gray-400 text-xs">Time</span><div className="text-gray-800">{formatTime(s.start_time)}{s.class_length_minutes ? ` (${s.class_length_minutes} min)` : ''}</div></div>
                <div><span className="text-gray-400 text-xs">Dates</span><div className="text-gray-800">{s.first_session_date ? formatDate(s.first_session_date) : '—'} – {s.last_session_date ? formatDate(s.last_session_date) : 'TBD'}</div></div>
                <div><span className="text-gray-400 text-xs">Role</span><div className="text-gray-800">{s.role} Professor</div></div>
                <div><span className="text-gray-400 text-xs">Pay Per Class</span><div className="text-green-700 font-medium">{(() => {
                  const hourly = s.role === 'Lead' ? (portal.lead_pay || 0) : (portal.assist_pay || 0);
                  const calc = hourly * ((s.class_length_minutes || 60) / 60);
                  const progPay = s.role === 'Lead' ? s.program_lead_pay : s.program_assist_pay;
                  const pay = Math.max(calc, progPay || 0);
                  return pay > 0 ? `$${pay.toFixed(2)}` : '—';
                })()}</div></div>
                {s.session_count > 0 && <div><span className="text-gray-400 text-xs">Sessions</span><div className="text-gray-800">{s.session_count}</div></div>}
              </div>
              <div className="mt-2 border-t border-gray-100 pt-2">
                <span className="text-gray-400 text-xs">Location</span>
                <div className="text-sm text-gray-800 font-medium">{s.location_nickname}</div>
                {s.address && <div className="text-sm text-gray-600">{s.address}</div>}
              </div>
              {s.status === 'changed' && <div className="text-xs text-amber-700 mt-2 font-medium">This class was added or changed since you last confirmed.</div>}
            </div>
          ))}
        </div>

        {/* Confirmation section */}
        {needsConfirm && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm font-medium text-blue-900 mb-1">Please review and confirm your schedule</div>
            <p className="text-xs text-blue-700 mb-3">
              By confirming, you are verifying that you have reviewed each class above — including the locations, addresses,
              travel distances, days of the week, times, and date ranges — and that this schedule works with your
              current availability. If anything doesn't work, please message your scheduling coordinator before confirming.
            </p>
            <button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
              {confirmMutation.isPending ? 'Confirming…' : 'I Have Reviewed & Confirm This Schedule'}
            </button>
          </div>
        )}
        {confirmMutation.isSuccess && <p className="text-sm text-green-600 mt-3">Schedule confirmed! Thank you.</p>}
      </div>
    </div>
  );
}

function PersonalInfoForm({ portal }) {
  const qc = useQueryClient();
  const avail = portal.availability || {};

  const { register: regProfile, handleSubmit: submitProfile } = useForm({
    defaultValues: { phone: portal.phone || '', address: portal.address || '', city: portal.city || '', state: portal.state || '', zip: portal.zip || '', shirt_size: portal.shirt_size || '' },
  });
  const { register: regAvail, handleSubmit: submitAvail, watch: watchAvail } = useForm({
    defaultValues: {
      monday: !!avail.monday, monday_notes: avail.monday_notes || '',
      tuesday: !!avail.tuesday, tuesday_notes: avail.tuesday_notes || '',
      wednesday: !!avail.wednesday, wednesday_notes: avail.wednesday_notes || '',
      thursday: !!avail.thursday, thursday_notes: avail.thursday_notes || '',
      friday: !!avail.friday, friday_notes: avail.friday_notes || '',
      additional_notes: avail.additional_notes || '',
    },
  });

  const profileMutation = useMutation({
    mutationFn: (data) => api.put('/onboarding/my-portal/profile', data),
    onSuccess: () => qc.invalidateQueries(['my-portal']),
  });
  const availMutation = useMutation({
    mutationFn: (data) => api.put('/onboarding/my-portal/availability', data),
    onSuccess: () => qc.invalidateQueries(['my-portal']),
  });

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]';
  const DAYS = [
    { key: 'monday', label: 'Monday' }, { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' }, { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
  ];

  return (
    <div className="space-y-6">
      {/* Personal Info */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Your Information</h2>
          {profileMutation.isSuccess && <span className="text-xs text-green-600">Saved!</span>}
        </div>
        <form onSubmit={submitProfile(d => profileMutation.mutate(d))} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Phone</label><input {...regProfile('phone')} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Shirt Size</label><input {...regProfile('shirt_size')} placeholder="S, M, L, XL…" className={inputCls} /></div>
            <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Address</label><input {...regProfile('address')} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">City</label><input {...regProfile('city')} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">State</label><input {...regProfile('state')} maxLength={2} className={inputCls} /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Zip</label><input {...regProfile('zip')} className={inputCls} /></div>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={profileMutation.isPending}
              className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a47] disabled:opacity-50">
              {profileMutation.isPending ? 'Saving…' : 'Save Info'}
            </button>
          </div>
        </form>
      </div>

      {/* Availability */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Availability</h2>
            <p className="text-xs text-gray-400 mt-0.5">Check each day you're available. General hours are 2:00 - 6:00 PM. Add time restrictions if needed.</p>
          </div>
          {availMutation.isSuccess && <span className="text-xs text-green-600">Saved!</span>}
        </div>
        <form onSubmit={submitAvail(d => availMutation.mutate(d))} className="p-4 space-y-3">
          {DAYS.map(day => (
            <div key={day.key} className="flex items-center gap-3">
              <label className="flex items-center gap-2 w-32 shrink-0 cursor-pointer">
                <input type="checkbox" {...regAvail(day.key)}
                  className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" />
                <span className="text-sm font-medium text-gray-700">{day.label}</span>
              </label>
              <input {...regAvail(`${day.key}_notes`)} placeholder="Time restrictions (e.g. only after 3pm)"
                className={`flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] ${watchAvail(day.key) ? '' : 'opacity-40'}`} />
            </div>
          ))}
          <div className="pt-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Additional notes</label>
            <textarea {...regAvail('additional_notes')} rows={2} placeholder="Any other availability details…" className={inputCls} />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={availMutation.isPending}
              className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a47] disabled:opacity-50">
              {availMutation.isPending ? 'Saving…' : 'Save Availability'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
