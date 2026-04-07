import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { toFormData, formatDate } from '../lib/utils';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';

const STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', complete: 'Complete', rejected: 'Rejected', hired: 'Hired' };
const STATUS_OPTIONS = ['pending', 'in_progress', 'complete', 'rejected'];

export default function CandidateDetailPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showHire, setShowHire] = useState(false);
  const [hireNickname, setHireNickname] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', due_date: '', assigned_to_user_id: '' });
  const [generatedPassword, setGeneratedPassword] = useState(null);
  const [msgBody, setMsgBody] = useState('');
  const messagesEndRef = useRef(null);

  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const { data: usersData } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => api.get('/users?limit=200').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const users = usersData?.data || [];

  const { data: candidateData, isLoading } = useQuery({
    queryKey: ['candidate', id],
    queryFn: () => api.get(`/onboarding/candidates/${id}`).then(r => r.data),
    enabled: !isNew,
  });

  const { data: templatesData } = useQuery({
    queryKey: ['onboarding-templates'],
    queryFn: () => api.get('/onboarding/templates').then(r => r.data),
  });
  const templates = templatesData?.data || [];

  const { data: messagesData } = useQuery({
    queryKey: ['candidate-messages', id],
    queryFn: () => api.get(`/onboarding/candidates/${id}/messages`).then(r => r.data),
    enabled: !isNew && !!id,
    refetchInterval: 30000,
  });
  const messages = messagesData?.data || [];

  const { register, handleSubmit, reset, setValue, watch, formState: { isDirty } } = useForm();

  useEffect(() => {
    if (candidateData?.data) {
      const { requirements, tasks, appliedTemplates, ...c } = candidateData.data;
      reset(toFormData(c));
      setHireNickname(c.full_name);
    }
  }, [candidateData]);

  const candidate = candidateData?.data || {};
  const requirements = candidate.requirements || [];
  const tasks = candidate.tasks || [];
  const appliedTemplates = candidate.appliedTemplates || [];

  const saveMutation = useMutation({
    mutationFn: (data) => isNew ? api.post('/onboarding/candidates', data).then(r => r.data) : api.put(`/onboarding/candidates/${id}`, data).then(r => r.data),
    onSuccess: (res) => { qc.invalidateQueries(['candidates']); qc.invalidateQueries(['candidate', id]); if (isNew && res?.id) navigate(`/candidates/${res.id}`); },
  });

  const reqMutation = useMutation({
    mutationFn: ({ reqId, data }) => api.put(`/onboarding/candidate-requirements/${reqId}`, data),
    onSuccess: () => qc.invalidateQueries(['candidate', id]),
  });

  const applyTemplateMutation = useMutation({
    mutationFn: (templateId) => api.post(`/onboarding/candidates/${id}/apply-template`, { template_id: templateId }),
    onSuccess: () => qc.invalidateQueries(['candidate', id]),
  });

  const addTaskMutation = useMutation({
    mutationFn: (data) => api.post('/onboarding/candidate-tasks', data),
    onSuccess: () => { qc.invalidateQueries(['candidate', id]); setNewTask({ title: '', due_date: '', assigned_to_user_id: '' }); setShowAddTask(false); },
  });

  const toggleTask = useMutation({
    mutationFn: ({ taskId, completed }) => api.put(`/onboarding/candidate-tasks/${taskId}`, { completed: completed ? 1 : 0 }),
    onSuccess: () => qc.invalidateQueries(['candidate', id]),
  });

  const deleteTask = useMutation({
    mutationFn: (taskId) => api.delete(`/onboarding/candidate-tasks/${taskId}`),
    onSuccess: () => qc.invalidateQueries(['candidate', id]),
  });

  const sendMessageMutation = useMutation({
    mutationFn: (body) => api.post(`/onboarding/candidates/${id}/messages`, { body }),
    onSuccess: () => { setMsgBody(''); qc.invalidateQueries(['candidate-messages', id]); },
  });

  const generateLoginMutation = useMutation({
    mutationFn: () => api.post(`/onboarding/candidates/${id}/generate-login`).then(r => r.data),
    onSuccess: (res) => { setGeneratedPassword(res.password); qc.invalidateQueries(['candidate', id]); },
  });

  const regenPasswordMutation = useMutation({
    mutationFn: () => api.post(`/onboarding/candidates/${id}/regenerate-password`).then(r => r.data),
    onSuccess: (res) => { setGeneratedPassword(res.password); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/onboarding/candidates/${id}`),
    onSuccess: () => { qc.invalidateQueries(['candidates']); navigate('/candidates'); },
  });

  const hireMutation = useMutation({
    mutationFn: () => api.post(`/onboarding/candidates/${id}/hire`, { professor_nickname: hireNickname }),
    onSuccess: (res) => { qc.invalidateQueries(['candidate', id]); setShowHire(false); },
  });

  const onSubmit = (data) => saveMutation.mutate(data);

  if (!isNew && isLoading) return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;

  const today = new Date().toISOString().split('T')[0];

  return (
    <AppShell>
      <UnsavedChangesModal when={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <Link to="/candidates" className="text-sm text-gray-500 hover:text-[#1e3a5f]">&larr; Candidates</Link>
            <div className="flex items-center gap-3 mt-0.5">
              <h1 className="text-xl font-bold text-gray-900">{isNew ? 'New Candidate' : candidate.full_name}</h1>
              {!isNew && <Badge status={STATUS_LABELS[candidate.status] || candidate.status} />}
              {candidate.professor_id && (
                <Link to={`/professors/${candidate.professor_id}`} className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded font-medium hover:underline">
                  View Professor Profile &rarr;
                </Link>
              )}
            </div>
          </div>
          {!isNew && candidate.status !== 'hired' && (
            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => { if (confirm(`Remove ${candidate.full_name}? This will deactivate their candidate record${candidate.user_id ? ' and disable their login' : ''}.`)) deleteMutation.mutate(); }}
                className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                {deleteMutation.isPending ? 'Removing…' : 'Uninvite'}
              </button>
              <Button type="button" onClick={() => setShowHire(true)}>Hire as Professor</Button>
            </div>
          )}
        </div>

        <div className="p-6 space-y-4 pb-32">
          {/* Info */}
          <Section title="Candidate Info" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Full Name" required {...register('full_name', { required: true })} />
              <Input label="Email" type="email" required {...register('email', { required: true })} />
              <Input label="Phone" {...register('phone')} />
              <Select label="Status" {...register('status')}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </Select>
              <Select label="Area" {...register('geographic_area_id')}>
                <option value="">Select area…</option>
                {(ref.areas || []).map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
              </Select>
              <Input label="First Class Date" type="date" {...register('first_class_date')} />
              <Select label="Onboarder" {...register('onboarder_user_id')}>
                <option value="">Select…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </Select>
              <Select label="Trainer" {...register('trainer_user_id')}>
                <option value="">Select…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </Select>
              <Select label="Recruiter" {...register('recruiter_user_id')}>
                <option value="">Select…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </Select>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea {...register('notes')} rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
            </div>
          </Section>

          {/* Login Credentials */}
          {!isNew && (
            <Section title="Login Credentials" defaultOpen={true}>
              {candidate.user_id ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-6">
                    <div>
                      <label className="text-xs text-gray-500">Username</label>
                      <div className="text-sm font-mono font-medium text-gray-800">{candidate.login_username}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Role</label>
                      <div className="text-sm text-gray-600">{candidate.login_role || 'Candidate'}</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Account Status</label>
                      <div className={`text-sm font-medium ${candidate.login_active ? 'text-green-600' : 'text-red-600'}`}>
                        {candidate.login_active ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                  </div>
                  {generatedPassword && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-amber-800">New Password (copy now — it won't be shown again)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-white px-2 py-1 rounded border border-amber-200 select-all">{generatedPassword}</code>
                        <button type="button" onClick={() => { navigator.clipboard.writeText(generatedPassword); }}
                          className="text-xs text-amber-700 hover:text-amber-900 underline">Copy</button>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { if (confirm('Generate a new password? The current password will stop working.')) regenPasswordMutation.mutate(); }}
                      className="text-xs text-[#1e3a5f] hover:underline">Regenerate Password</button>
                    {regenPasswordMutation.isPending && <span className="text-xs text-gray-400">Generating…</span>}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">No login credentials have been generated yet.</p>
                  <Button type="button" size="sm" onClick={() => generateLoginMutation.mutate()}
                    disabled={generateLoginMutation.isPending}>
                    {generateLoginMutation.isPending ? 'Generating…' : 'Generate Login'}
                  </Button>
                  {generateLoginMutation.isError && (
                    <p className="text-sm text-red-600">{generateLoginMutation.error?.response?.data?.error || 'Failed to generate login'}</p>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* Checklist */}
          {!isNew && (
            <Section title={`Checklist (${requirements.filter(r => r.completed).length}/${requirements.length})`} defaultOpen={true}>
              {/* Apply template */}
              <div className="flex items-center gap-2 mb-3">
                <select onChange={e => { if (e.target.value) applyTemplateMutation.mutate(e.target.value); e.target.value = ''; }}
                  className="rounded border border-gray-300 px-2 py-1 text-xs bg-white">
                  <option value="">Apply template…</option>
                  {templates.filter(t => !appliedTemplates.some(at => at.template_id === t.id))
                    .map(t => <option key={t.id} value={t.id}>{t.name} ({t.item_count} items)</option>)}
                </select>
                {applyTemplateMutation.isSuccess && <span className="text-xs text-green-600">Applied!</span>}
              </div>

              {requirements.length === 0 ? (
                <p className="text-sm text-gray-400">No requirements assigned. Apply a template to get started.</p>
              ) : (
                <div className="space-y-1">
                  {requirements.map(r => (
                    <div key={r.id} className={`flex items-center gap-3 px-3 py-2 rounded ${r.completed ? 'bg-green-50/50' : r.due_date && r.due_date < today && !r.completed ? 'bg-red-50/50' : 'bg-gray-50'}`}>
                      <input type="checkbox" checked={!!r.completed}
                        onChange={() => reqMutation.mutate({ reqId: r.id, data: { completed: r.completed ? 0 : 1, status: r.completed ? 'not_started' : 'complete' } })}
                        className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer" />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm ${r.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{r.title}</div>
                        {r.description && <div className="text-xs text-gray-400 truncate">{r.description}</div>}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        r.type === 'document' ? 'bg-blue-100 text-blue-700' :
                        r.type === 'training' ? 'bg-purple-100 text-purple-700' :
                        r.type === 'compliance' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{r.type}</span>
                      {r.due_date && (
                        <span className={`text-[10px] ${r.due_date < today && !r.completed ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                          {formatDate(r.due_date)}
                        </span>
                      )}
                      {r.assigned_to_name && <span className="text-[10px] text-gray-400">{r.assigned_to_name}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Tasks */}
          {!isNew && (
            <Section title={`Tasks (${tasks.filter(t => !t.completed).length} open)`} defaultOpen={true}>
              <div className="space-y-1.5 mb-3">
                {tasks.map(t => (
                  <div key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded ${t.completed ? 'bg-green-50/30' : t.due_date && t.due_date < today ? 'bg-red-50/30' : 'bg-gray-50'}`}>
                    <input type="checkbox" checked={!!t.completed}
                      onChange={() => toggleTask.mutate({ taskId: t.id, completed: !t.completed })}
                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer" />
                    <div className="flex-1">
                      <div className={`text-sm ${t.completed ? 'line-through text-gray-400' : ''}`}>{t.title}</div>
                      {t.description && <div className="text-xs text-gray-400">{t.description}</div>}
                    </div>
                    {t.assigned_to_name && <span className="text-[10px] text-gray-400">{t.assigned_to_name}</span>}
                    {t.due_date && <span className={`text-[10px] ${t.due_date < today && !t.completed ? 'text-red-600' : 'text-gray-400'}`}>{formatDate(t.due_date)}</span>}
                    <button type="button" onClick={() => { if (confirm('Delete this task?')) deleteTask.mutate(t.id); }}
                      className="text-gray-300 hover:text-red-500 text-xs">&times;</button>
                  </div>
                ))}
                {tasks.length === 0 && !showAddTask && <p className="text-sm text-gray-400">No tasks</p>}
              </div>

              {showAddTask ? (
                <div className="bg-gray-50 rounded p-3 space-y-2">
                  <Input placeholder="Task title" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} />
                  <div className="flex gap-2">
                    <Input type="date" value={newTask.due_date} onChange={e => setNewTask({ ...newTask, due_date: e.target.value })} className="w-40" />
                    <select value={newTask.assigned_to_user_id} onChange={e => setNewTask({ ...newTask, assigned_to_user_id: e.target.value })}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm">
                      <option value="">Assign to…</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                    </select>
                    <Button size="sm" type="button" onClick={() => addTaskMutation.mutate({ candidate_id: id, ...newTask })}
                      disabled={!newTask.title}>Add</Button>
                    <button type="button" onClick={() => setShowAddTask(false)} className="text-xs text-gray-400">Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setShowAddTask(true)} className="text-xs text-[#1e3a5f] hover:underline">+ Add task</button>
              )}
            </Section>
          )}

          {/* Messages */}
          {!isNew && (
            <Section title={`Messages (${messages.length})`} defaultOpen={true}>
              <div className="space-y-2 max-h-80 overflow-y-auto mb-3">
                {messages.length === 0 && (
                  <p className="text-sm text-gray-400 py-2">No messages yet.</p>
                )}
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.is_from_candidate ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                      m.is_from_candidate
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-[#1e3a5f] text-white'
                    }`}>
                      <div className={`text-xs font-medium mb-0.5 ${m.is_from_candidate ? 'text-gray-500' : 'text-white/70'}`}>
                        {m.is_from_candidate ? 'Candidate' : m.sender_name}
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                      <div className={`text-[10px] mt-1 ${m.is_from_candidate ? 'text-gray-400' : 'text-white/50'}`}>
                        {new Date(m.ts_inserted).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="flex gap-2">
                <input type="text" value={msgBody} onChange={e => setMsgBody(e.target.value)}
                  placeholder="Send a message to the candidate…"
                  onKeyDown={e => { if (e.key === 'Enter' && msgBody.trim()) { e.preventDefault(); sendMessageMutation.mutate(msgBody); } }}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                <button type="button" onClick={() => { if (msgBody.trim()) sendMessageMutation.mutate(msgBody); }}
                  disabled={!msgBody.trim() || sendMessageMutation.isPending}
                  className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a47] disabled:opacity-50 transition-colors">
                  {sendMessageMutation.isPending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </Section>
          )}
        </div>

        {/* Save bar */}
        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {saveMutation.isError && <p className="text-sm text-red-600">{saveMutation.error?.response?.data?.error || 'Save failed'}</p>}
          {saveMutation.isSuccess && <p className="text-sm text-green-600">Saved</p>}
          <div className="ml-auto flex gap-3">
            <Link to="/candidates" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
            <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </div>
      </form>

      {/* Hire modal */}
      {showHire && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-96">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Hire as Professor</h3>
            <p className="text-sm text-gray-600 mb-4">This will create a professor profile for <strong>{candidate.full_name}</strong> and mark them as hired.</p>
            <Input label="Professor Preferred Name" value={hireNickname} onChange={e => setHireNickname(e.target.value)} />
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={() => setShowHire(false)} className="text-sm text-gray-500">Cancel</button>
              <Button onClick={() => hireMutation.mutate()} disabled={hireMutation.isPending || !hireNickname}>
                {hireMutation.isPending ? 'Creating…' : 'Hire & Create Professor'}
              </Button>
            </div>
            {hireMutation.isError && <p className="text-sm text-red-600 mt-2">{hireMutation.error?.response?.data?.error || 'Failed'}</p>}
            {hireMutation.isSuccess && <p className="text-sm text-green-600 mt-2">Professor created! <Link to={`/professors/${hireMutation.data?.data?.professor_id}`} className="underline">View profile</Link></p>}
          </div>
        </div>
      )}
    </AppShell>
  );
}
