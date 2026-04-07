import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';

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

        {/* Personal Info Form */}
        <PersonalInfoForm portal={portal} />

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
  const completeMutation = useMutation({
    mutationFn: () => api.post('/onboarding/my-portal/complete-requirement', { candidate_requirement_id: r.id }),
    onSuccess: () => qc.invalidateQueries(['my-portal']),
  });
  const uploadMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('candidate_requirement_id', r.id);
      return api.post('/onboarding/my-portal/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => qc.invalidateQueries(['my-portal']),
  });

  return (
    <div className={`px-3 py-3 rounded-lg ${
      r.completed ? 'bg-green-50/60' :
      isPendingApproval ? 'bg-amber-50/60 border border-amber-200' :
      isOverdue ? 'bg-red-50/60 border border-red-200' :
      isUpcoming ? 'bg-gray-50/50 opacity-60' :
      'bg-gray-50'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          r.completed ? 'border-green-500 bg-green-500' :
          isPendingApproval ? 'border-amber-400 bg-amber-400' :
          'border-gray-300'
        }`}>
          {r.completed && <span className="text-white text-xs">&#10003;</span>}
          {isPendingApproval && <span className="text-white text-xs">!</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm ${r.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{r.title}</div>
          {r.description && <div className="text-xs text-gray-400">{r.description}</div>}
          {isPendingApproval && <div className="text-xs text-amber-700 font-medium mt-0.5">Submitted — awaiting approval</div>}
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
          r.type === 'document' ? 'bg-blue-100 text-blue-700' :
          r.type === 'training' ? 'bg-purple-100 text-purple-700' :
          r.type === 'compliance' ? 'bg-amber-100 text-amber-700' :
          'bg-gray-100 text-gray-600'
        }`}>{r.type}</span>
        {r.due_date && (
          <span className={`text-xs shrink-0 ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
            {isOverdue ? 'Overdue' : formatDate(r.due_date)}
          </span>
        )}
      </div>
      {/* Actions row */}
      {!r.completed && !isPendingApproval && (
        <div className="flex items-center gap-2 mt-2 ml-8">
          {r.requires_document === 1 && (
            <>
              <input ref={fileRef} type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadMutation.mutate(e.target.files[0]); }} />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="text-xs text-[#1e3a5f] hover:underline flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Upload document
              </button>
              {uploadMutation.isPending && <span className="text-xs text-gray-400">Uploading…</span>}
            </>
          )}
          {canSelfComplete && (
            <button type="button" onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="text-xs bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700 disabled:opacity-50">
              {completeMutation.isPending ? 'Completing…' : 'Mark Complete'}
            </button>
          )}
          {r.needs_approval === 1 && !r.requires_document && (
            <button type="button" onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded hover:bg-amber-700 disabled:opacity-50">
              {completeMutation.isPending ? 'Submitting…' : 'Submit for Approval'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PersonalInfoForm({ portal }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { isDirty } } = useForm({
    defaultValues: {
      phone: portal.phone || '',
      address: portal.address || '',
      city: portal.city || '',
      state: portal.state || '',
      zip: portal.zip || '',
      has_car: portal.has_car ?? '',
      car_details: portal.car_details || '',
      shirt_size: portal.shirt_size || '',
      emergency_contact_name: portal.emergency_contact_name || '',
      emergency_contact_phone: portal.emergency_contact_phone || '',
      emergency_contact_relation: portal.emergency_contact_relation || '',
      availability_notes: portal.availability_notes || '',
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data) => api.put('/onboarding/my-portal/profile', data),
    onSuccess: () => { qc.invalidateQueries(['my-portal']); },
  });

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]';

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Your Information</h2>
        {saveMutation.isSuccess && <span className="text-xs text-green-600">Saved!</span>}
      </div>
      <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
            <input {...register('phone')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Shirt Size</label>
            <input {...register('shirt_size')} placeholder="S, M, L, XL…" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
            <input {...register('address')} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
            <input {...register('city')} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
              <input {...register('state')} maxLength={2} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Zip</label>
              <input {...register('zip')} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Do you have a car?</label>
            <select {...register('has_car')} className={inputCls}>
              <option value="">Select…</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Car Details</label>
            <input {...register('car_details')} placeholder="Make, model, year" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Availability Notes</label>
            <textarea {...register('availability_notes')} rows={2} placeholder="Days/times you're available to teach"
              className={inputCls} />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Emergency Contact</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input {...register('emergency_contact_name')} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input {...register('emergency_contact_phone')} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Relationship</label>
              <input {...register('emergency_contact_relation')} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saveMutation.isPending}
            className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a47] disabled:opacity-50 transition-colors">
            {saveMutation.isPending ? 'Saving…' : 'Save Info'}
          </button>
        </div>
      </form>
    </div>
  );
}
