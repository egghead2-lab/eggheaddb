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

  const approveMutation = useMutation({
    mutationFn: ({ reqId, action }) => api.post(`/onboarding/candidate-requirements/${reqId}/approve`, { action }),
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
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
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
              {!isNew && (
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  {candidate.phone && <span>Phone: <a href={`tel:${candidate.phone}`} className="text-[#1e3a5f] font-medium">{candidate.phone}</a></span>}
                  {candidate.email && <span>Email: <a href={`mailto:${candidate.email}`} className="text-[#1e3a5f] font-medium">{candidate.email}</a></span>}
                  {candidate.geographic_area_name && <span>Area: <strong>{candidate.geographic_area_name}</strong></span>}
                  {candidate.first_class_date && <span>First Class: <strong>{formatDate(candidate.first_class_date)}</strong></span>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isNew && <Link to={`/candidates/${id}/profile`} className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">Profile & Settings</Link>}
              {!isNew && candidate.status !== 'hired' && (
                <>
                  <button type="button"
                    onClick={() => { if (confirm(`Remove ${candidate.full_name}?`)) deleteMutation.mutate(); }}
                    className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                    Uninvite
                  </button>
                  <Button type="button" size="sm" onClick={() => setShowHire(true)}>Hire</Button>
                </>
              )}
            </div>
          </div>

          {/* Team card — inline */}
          {!isNew && (candidate.onboarder_name || candidate.trainer_name || candidate.scheduling_coordinator_name || candidate.field_manager_name) && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
              {[
                { role: 'Onboarder', name: candidate.onboarder_name, color: 'text-pink-700' },
                { role: 'Trainer', name: candidate.trainer_name, color: 'text-orange-700' },
                { role: 'Sched.', name: candidate.scheduling_coordinator_name, color: 'text-blue-700' },
                { role: 'FM', name: candidate.field_manager_name, color: 'text-emerald-700' },
                { role: 'Recruiter', name: candidate.recruiter_name, color: 'text-teal-700' },
              ].filter(t => t.name).map(t => (
                <span key={t.role} className="text-xs text-gray-500">
                  {t.role}: <strong className={t.color}>{t.name}</strong>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 space-y-4 pb-32">
          {/* New candidate form — only show when creating */}
          {isNew && (
            <Section title="New Candidate" defaultOpen={true}>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Full Name" required {...register('full_name', { required: true })} />
                <Input label="Email" type="email" required {...register('email', { required: true })} />
                <Input label="Phone" {...register('phone')} />
                <Select label="Area (auto-assigns team)" {...register('geographic_area_id')}>
                  <option value="">Select area…</option>
                  {(ref.areas || []).map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
                </Select>
              </div>
            </Section>
          )}

          {/* Internal Notes — status update feed (hidden from candidates) */}
          {!isNew && <CandidateNotesSection candidateId={id} />}

          {/* ══ CHECKLIST — the main event ══ */}
          {!isNew && (
            <ChecklistSection requirements={requirements} templates={templates} appliedTemplates={appliedTemplates}
              candidateId={id} today={today} reqMutation={reqMutation} approveMutation={approveMutation}
              applyTemplateMutation={applyTemplateMutation} allRequirements={[]} users={users} />
          )}

          {/* Login Credentials */}
          {!isNew && (
            <Section title="Login Credentials" defaultOpen={false}>
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
                      <span className="text-xs font-medium text-amber-800">New Password (copy now)</span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm font-mono bg-white px-2 py-1 rounded border border-amber-200 select-all">{generatedPassword}</code>
                        <button type="button" onClick={() => navigator.clipboard.writeText(generatedPassword)}
                          className="text-xs text-amber-700 hover:text-amber-900 underline">Copy</button>
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => { if (confirm('Generate a new password?')) regenPasswordMutation.mutate(); }}
                    className="text-xs text-[#1e3a5f] hover:underline">
                    {regenPasswordMutation.isPending ? 'Generating…' : 'Reset Password'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">No login credentials generated yet.</p>
                  <Button type="button" size="sm" onClick={() => generateLoginMutation.mutate()} disabled={generateLoginMutation.isPending}>
                    {generateLoginMutation.isPending ? 'Generating…' : 'Generate Login'}
                  </Button>
                  {generateLoginMutation.isError && <p className="text-sm text-red-600">{generateLoginMutation.error?.response?.data?.error || 'Failed'}</p>}
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

          {/* Gmail Email */}
          {!isNew && <EmailSection candidateId={id} candidateEmail={candidate.email} />}
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

// ── Checklist Section (rebuilt) ──────────────────────────────────────

const ROLE_LABELS = { scheduler: 'Scheduler', field_manager: 'Field Mgr', recruiter: 'Recruiter', onboarder: 'Onboarder', trainer: 'Trainer' };
const ROLE_COLORS = { scheduler: 'bg-blue-100 text-blue-700', field_manager: 'bg-emerald-100 text-emerald-700', recruiter: 'bg-teal-100 text-teal-700', onboarder: 'bg-pink-100 text-pink-700', trainer: 'bg-orange-100 text-orange-700' };

function ChecklistSection({ requirements, templates, appliedTemplates, candidateId, today, reqMutation, approveMutation, applyTemplateMutation, users }) {
  const qc = useQueryClient();
  const [sortBy, setSortBy] = useState('urgency'); // urgency, due_date, owner, type
  const [filterRole, setFilterRole] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAddReq, setShowAddReq] = useState(false);
  const [addReqId, setAddReqId] = useState('');

  const { data: allReqsData } = useQuery({
    queryKey: ['onboarding-requirements'],
    queryFn: () => api.get('/onboarding/requirements').then(r => r.data),
    staleTime: 60 * 1000,
  });
  const allReqs = allReqsData?.data || [];
  const existingReqIds = new Set(requirements.map(r => r.requirement_id));

  const addSingleReq = useMutation({
    mutationFn: (data) => api.post('/onboarding/candidate-requirements-add', data),
    onSuccess: () => { qc.invalidateQueries(['candidate', candidateId]); setAddReqId(''); setShowAddReq(false); },
  });

  let filtered = [...requirements];
  if (!showCompleted) filtered = filtered.filter(r => !r.completed);
  if (filterRole) filtered = filtered.filter(r => r.assigned_role === filterRole);

  // Sort
  filtered.sort((a, b) => {
    if (sortBy === 'due_date') {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    if (sortBy === 'owner') return (a.assigned_role || 'z').localeCompare(b.assigned_role || 'z');
    if (sortBy === 'type') return (a.type || '').localeCompare(b.type || '');
    // Default: urgency (overdue first, then by due date)
    const aOvr = a.due_date && a.due_date < today;
    const bOvr = b.due_date && b.due_date < today;
    if (aOvr && !bOvr) return -1;
    if (!aOvr && bOvr) return 1;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    return 0;
  });

  const completedCount = requirements.filter(r => r.completed).length;
  const overdueCount = requirements.filter(r => !r.completed && r.due_date && r.due_date < today).length;
  const pendingApprovalCount = requirements.filter(r => r.approval_status === 'pending_approval').length;

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-gray-900">Requirements</h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500">{completedCount}/{requirements.length} complete</span>
              {overdueCount > 0 && <span className="text-red-600 font-medium">{overdueCount} overdue</span>}
              {pendingApprovalCount > 0 && <span className="text-amber-600 font-medium">{pendingApprovalCount} pending approval</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select onChange={e => { if (e.target.value) applyTemplateMutation.mutate(e.target.value); e.target.value = ''; }}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs bg-white">
              <option value="">Apply template…</option>
              {templates.filter(t => !appliedTemplates.some(at => at.template_id === t.id))
                .map(t => <option key={t.id} value={t.id}>{t.name} ({t.item_count})</option>)}
            </select>
            <button type="button" onClick={() => setShowAddReq(!showAddReq)}
              className="text-xs bg-[#1e3a5f] text-white px-3 py-1.5 rounded hover:bg-[#152a47] font-medium">
              + Add
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {requirements.length > 0 && (
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${completedCount === requirements.length ? 'bg-green-500' : 'bg-[#1e3a5f]'}`}
              style={{ width: `${Math.round((completedCount / requirements.length) * 100)}%` }} />
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Sort:</span>
            {[['urgency','Urgency'],['due_date','Due Date'],['owner','Owner'],['type','Type']].map(([k,l]) => (
              <button key={k} type="button" onClick={() => setSortBy(k)}
                className={`text-xs px-2 py-0.5 rounded ${sortBy === k ? 'bg-[#1e3a5f] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{l}</button>
            ))}
          </div>
          <div className="w-px h-4 bg-gray-200" />
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="text-xs rounded border border-gray-200 px-2 py-1 bg-white">
            <option value="">All roles</option>
            {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer ml-auto">
            <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} className="w-3 h-3 rounded" />
            Show completed
          </label>
        </div>
      </div>

      {/* Add requirement */}
      {showAddReq && (
        <div className="px-5 py-3 bg-blue-50/50 border-b border-gray-200 flex items-center gap-2">
          <select value={addReqId} onChange={e => setAddReqId(e.target.value)} className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Select a requirement to add…</option>
            {allReqs.filter(r => !existingReqIds.has(r.id)).map(r => (
              <option key={r.id} value={r.id}>{r.title} ({r.type}{r.assigned_role ? ` · ${ROLE_LABELS[r.assigned_role]}` : ''})</option>
            ))}
          </select>
          <button type="button" onClick={() => { if (addReqId) addSingleReq.mutate({ candidate_id: candidateId, requirement_id: Number(addReqId) }); }}
            disabled={!addReqId || addSingleReq.isPending} className="text-xs bg-[#1e3a5f] text-white px-3 py-1.5 rounded disabled:opacity-40">
            {addSingleReq.isPending ? 'Adding…' : 'Add'}</button>
          <button type="button" onClick={() => setShowAddReq(false)} className="text-xs text-gray-500">Cancel</button>
        </div>
      )}

      {/* Requirement rows */}
      <div className="divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400">
            {requirements.length === 0 ? 'No requirements yet. Apply a template or add individually.' : 'No requirements match the current filters.'}
          </div>
        ) : filtered.map(r => {
          const isOverdue = r.due_date && r.due_date < today && !r.completed;
          const daysUntilDue = r.due_date ? Math.ceil((new Date(r.due_date) - new Date(today)) / 86400000) : null;
          const isUpcoming = daysUntilDue !== null && daysUntilDue > 7;
          const isPendingApproval = r.approval_status === 'pending_approval';
          return (
            <div key={r.id} className={`flex items-center gap-4 px-5 py-3 transition-colors ${
              r.completed ? 'bg-green-50/30' :
              isPendingApproval ? 'bg-amber-50/40' :
              isOverdue ? 'bg-red-50/40' :
              isUpcoming ? 'opacity-50' : ''
            }`}>
              <input type="checkbox" checked={!!r.completed}
                onChange={() => reqMutation.mutate({ reqId: r.id, data: { completed: r.completed ? 0 : 1, status: r.completed ? 'not_started' : 'complete' } })}
                className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${r.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{r.title}</span>
                  {r.needs_approval === 1 && <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded font-medium">Approval</span>}
                  {r.requires_document === 1 && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Document</span>}
                </div>
                {r.description && <div className="text-sm text-gray-400 mt-0.5">{r.description}</div>}
                {isPendingApproval && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-sm text-amber-700 font-medium">Awaiting approval</span>
                    <button type="button" onClick={() => approveMutation.mutate({ reqId: r.id, action: 'approve' })}
                      className="text-xs bg-green-600 text-white px-2.5 py-1 rounded hover:bg-green-700 font-medium">Approve</button>
                    <button type="button" onClick={() => approveMutation.mutate({ reqId: r.id, action: 'reject' })}
                      className="text-xs bg-red-500 text-white px-2.5 py-1 rounded hover:bg-red-600 font-medium">Reject</button>
                  </div>
                )}
              </div>

              {/* Type */}
              <span className={`text-xs px-2 py-1 rounded font-medium shrink-0 ${
                r.type === 'document' ? 'bg-blue-100 text-blue-700' :
                r.type === 'training' ? 'bg-purple-100 text-purple-700' :
                r.type === 'compliance' ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-600'
              }`}>{r.type}</span>

              {/* Owner */}
              <div className="w-24 shrink-0 text-right">
                {r.assigned_role ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[r.assigned_role] || 'bg-gray-100 text-gray-500'}`}>
                    {ROLE_LABELS[r.assigned_role]}
                  </span>
                ) : <span className="text-xs text-gray-300">—</span>}
              </div>

              {/* Due date */}
              <div className="w-28 shrink-0 text-right">
                {r.due_date ? (
                  <div>
                    <div className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
                      {formatDate(r.due_date)}
                    </div>
                    {isOverdue && <div className="text-[10px] text-red-500 font-bold">OVERDUE</div>}
                    {daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 7 && !r.completed && (
                      <div className="text-[10px] text-amber-600">{daysUntilDue === 0 ? 'Due today' : `${daysUntilDue}d left`}</div>
                    )}
                  </div>
                ) : <span className="text-xs text-gray-300">No date</span>}
              </div>

              {/* Assignee */}
              <div className="w-24 shrink-0 text-right">
                <span className="text-xs text-gray-400">{r.assigned_to_name || '—'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Internal Notes (status updates) ─────────────────────────────────

function CandidateNotesSection({ candidateId }) {
  const qc = useQueryClient();
  const [noteBody, setNoteBody] = useState('');

  const { data } = useQuery({
    queryKey: ['candidate-notes', candidateId],
    queryFn: () => api.get(`/onboarding/candidates/${candidateId}/notes`).then(r => r.data),
  });

  const addNote = useMutation({
    mutationFn: (body) => api.post(`/onboarding/candidates/${candidateId}/notes`, { body }),
    onSuccess: () => { setNoteBody(''); qc.invalidateQueries(['candidate-notes', candidateId]); },
  });

  const deleteNote = useMutation({
    mutationFn: (noteId) => api.delete(`/onboarding/candidate-notes/${noteId}`),
    onSuccess: () => qc.invalidateQueries(['candidate-notes', candidateId]),
  });

  const notes = data?.data || [];

  return (
    <Section title={`Internal Notes (${notes.length})`} defaultOpen={notes.length > 0}>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Hidden from candidate</p>
      <div className="flex gap-2 mb-3">
        <input value={noteBody} onChange={e => setNoteBody(e.target.value)}
          placeholder="Add a status update or note…"
          onKeyDown={e => { if (e.key === 'Enter' && noteBody.trim()) { e.preventDefault(); addNote.mutate(noteBody); } }}
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        <button type="button" onClick={() => noteBody.trim() && addNote.mutate(noteBody)}
          disabled={!noteBody.trim() || addNote.isPending}
          className="px-3 py-1.5 bg-[#1e3a5f] text-white text-xs font-medium rounded hover:bg-[#152a47] disabled:opacity-40">
          {addNote.isPending ? '…' : 'Add'}
        </button>
      </div>
      {notes.length > 0 && (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {notes.map(n => (
            <div key={n.id} className="flex items-start gap-2 text-sm">
              <div className="flex-1">
                <span className="font-medium text-gray-700">{n.author_name}</span>
                <span className="text-gray-400 mx-1.5">&middot;</span>
                <span className="text-[10px] text-gray-400">{new Date(n.ts_inserted).toLocaleString()}</span>
                <div className="text-gray-600 mt-0.5">{n.body}</div>
              </div>
              <button type="button" onClick={() => deleteNote.mutate(n.id)}
                className="text-gray-300 hover:text-red-500 text-xs shrink-0 mt-1">&times;</button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Gmail Email Section ─────────────────────────────────────────────

import { RichTextEditor } from '../components/ui/RichTextEditor';

function EmailSection({ candidateId, candidateEmail }) {
  const qc = useQueryClient();
  const [showCompose, setShowCompose] = useState(false);
  const [expandedThread, setExpandedThread] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [replyThreadId, setReplyThreadId] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);

  const { data: emailTemplatesData } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get('/onboarding/email-templates').then(r => r.data),
  });
  const emailTemplates = emailTemplatesData?.data || [];

  const { data, isLoading } = useQuery({
    queryKey: ['candidate-emails', candidateId],
    queryFn: () => api.get(`/onboarding/candidates/${candidateId}/emails`).then(r => r.data),
    staleTime: 60 * 1000,
  });

  const sendMutation = useMutation({
    mutationFn: (formData) => api.post(`/onboarding/candidates/${candidateId}/emails`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
    onSuccess: () => {
      qc.invalidateQueries(['candidate-emails', candidateId]);
      setShowCompose(false);
      setSubject('');
      setBody('');
      setReplyThreadId(null);
      setAttachments([]);
    },
  });

  const emailData = data?.data || {};
  const threads = emailData.threads || [];
  const connected = emailData.connected;

  const startReply = (thread) => {
    setReplyThreadId(thread.threadId);
    setSubject(thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`);
    setBody('');
    setAttachments([]);
    setShowCompose(true);
  };

  const startNew = () => {
    setReplyThreadId(null);
    setSubject('');
    setBody('');
    setAttachments([]);
    setShowCompose(true);
  };

  const handleSend = () => {
    const formData = new FormData();
    formData.append('subject', subject);
    formData.append('body', body);
    if (replyThreadId) formData.append('threadId', replyThreadId);
    for (const file of attachments) formData.append('attachments', file);
    sendMutation.mutate(formData);
  };

  const addFiles = (e) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  return (
    <Section title={`Email (${threads.length} thread${threads.length !== 1 ? 's' : ''})`} defaultOpen={true}>
      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner className="w-5 h-5" /></div>
      ) : !connected ? (
        <div className="text-sm text-gray-500 py-2">
          Gmail not connected. <a href="/api/auth/google" className="text-[#1e3a5f] hover:underline">Sign in with Google</a> to enable email.
          {emailData.expired && <span className="text-amber-600 ml-2">(Token expired — please re-authenticate)</span>}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400">
              Connected as {emailData.connectedEmail} &middot; Emails with {candidateEmail}
            </span>
            <button type="button" onClick={startNew}
              className="text-xs bg-[#1e3a5f] text-white px-3 py-1.5 rounded hover:bg-[#152a47] transition-colors font-medium">
              + Compose
            </button>
          </div>

          {/* Compose / Reply */}
          {showCompose && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{replyThreadId ? 'Reply' : 'New Email'}</span>
                <button type="button" onClick={() => setShowCompose(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-gray-500">To: <strong>{candidateEmail}</strong></div>
                {emailTemplates.length > 0 && (
                  <select onChange={e => {
                    const tmpl = emailTemplates.find(t => t.id === Number(e.target.value));
                    if (tmpl) { setSubject(tmpl.subject); setBody(tmpl.body_html); }
                    e.target.value = '';
                  }} className="text-xs rounded border border-gray-300 px-2 py-1 bg-white">
                    <option value="">Load template…</option>
                    {emailTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              <RichTextEditor value={body} onChange={setBody} placeholder="Write your email…" minHeight="150px" />

              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-600">
                      <span className="truncate max-w-[150px]">{f.name}</span>
                      <span className="text-gray-300">({(f.size / 1024).toFixed(0)}KB)</span>
                      <button type="button" onClick={() => removeAttachment(i)} className="text-gray-400 hover:text-red-500">&times;</button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <input ref={fileInputRef} type="file" multiple onChange={addFiles} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-gray-500 hover:text-[#1e3a5f] flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    Attach files
                  </button>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowCompose(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancel</button>
                  <button type="button" onClick={handleSend}
                    disabled={!subject.trim() || !body.trim() || body === '<p></p>' || sendMutation.isPending}
                    className="text-xs bg-[#1e3a5f] text-white px-4 py-1.5 rounded hover:bg-[#152a47] disabled:opacity-40 transition-colors font-medium">
                    {sendMutation.isPending ? 'Sending…' : `Send${attachments.length ? ` (${attachments.length} file${attachments.length > 1 ? 's' : ''})` : ''}`}
                  </button>
                </div>
              </div>
              {sendMutation.isError && <p className="text-xs text-red-600">{sendMutation.error?.response?.data?.error || 'Failed to send'}</p>}
            </div>
          )}

          {/* Thread list — most recent first */}
          {threads.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">No email threads found with this candidate.</p>
          ) : (
            <div className="space-y-2">
              {threads.map(thread => {
                const lastMsg = thread.messages[thread.messages.length - 1];
                const isExpanded = expandedThread === thread.threadId;
                return (
                  <div key={thread.threadId} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button type="button"
                      onClick={() => setExpandedThread(isExpanded ? null : thread.threadId)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left">
                      <span className="text-[10px] text-gray-300 shrink-0">{isExpanded ? '▾' : '▸'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 truncate">{thread.subject || '(no subject)'}</span>
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{thread.messages.length}</span>
                        </div>
                        <div className="text-xs text-gray-400 truncate mt-0.5">
                          {lastMsg.from.split('<')[0].trim()} — {lastMsg.text?.substring(0, 80) || '(html)'}…
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] text-gray-400">{new Date(Number(thread.lastMessageAt)).toLocaleDateString()}</span>
                        <button type="button" onClick={e => { e.stopPropagation(); startReply(thread); }}
                          className="text-[10px] text-[#1e3a5f] hover:underline font-medium">Reply</button>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 max-h-[500px] overflow-y-auto">
                        {thread.messages.map((msg, mi) => (
                          <div key={msg.id} className={`px-5 py-4 ${mi > 0 ? 'border-t border-gray-100' : ''}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <span className="text-xs font-semibold text-gray-700">{msg.from.split('<')[0].trim()}</span>
                                <span className="text-[10px] text-gray-400 ml-2">to {msg.to.split('<')[0].trim()}</span>
                              </div>
                              <span className="text-[10px] text-gray-400">{new Date(msg.date).toLocaleString()}</span>
                            </div>
                            {msg.html ? (
                              <div className="text-sm text-gray-700 prose prose-sm max-w-none [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500 [&_blockquote]:text-xs"
                                dangerouslySetInnerHTML={{ __html: msg.html }} />
                            ) : (
                              <div className="text-sm text-gray-700 whitespace-pre-wrap">{msg.text}</div>
                            )}
                          </div>
                        ))}
                        <div className="px-5 py-2 bg-gray-50 border-t border-gray-100">
                          <button type="button" onClick={() => startReply(thread)}
                            className="text-xs text-[#1e3a5f] hover:underline font-medium">Reply to this thread</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
