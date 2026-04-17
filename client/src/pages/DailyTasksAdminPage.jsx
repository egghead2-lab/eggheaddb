import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { SearchSelect } from '../components/ui/SearchSelect';
import { useGeneralData } from '../hooks/useReferenceData';
import { formatDate } from '../lib/utils';

const TEAMS = ['Scheduling', 'Field Managing', 'Client Management', 'Onboarding', 'Warehouse', 'Curriculum', 'Operations'];
const TASK_TYPES = [
  { value: 'page', label: 'Page Link' },
  { value: 'report', label: 'Saved Report' },
  { value: 'query', label: 'Custom Count Query' },
  { value: 'manual', label: 'Manual' },
];

export default function DailyTasksAdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('delegations');

  return (
    <AppShell>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Daily Tasks Admin</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage task definitions, delegations, and vacation coverage</p>
      </div>
      <div className="p-6 space-y-4 pb-32">
        <div className="flex gap-1">
          {['delegations', 'definitions'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded font-medium ${tab === t ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t === 'delegations' ? 'Delegations & Coverage' : 'Task Definitions'}
            </button>
          ))}
        </div>
        {tab === 'delegations' && <DelegationsPanel />}
        {tab === 'definitions' && <DefinitionsPanel />}
      </div>
    </AppShell>
  );
}

// ── Delegations Panel ─────────────────────────────────────────
function DelegationsPanel() {
  const qc = useQueryClient();
  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};
  const staffUsers = (ref.staffUsers || []).map(u => ({ id: String(u.id), label: u.display_name }));

  // Get ALL active users for delegation (not just coordinators)
  const { data: usersData } = useQuery({
    queryKey: ['users-all-brief'],
    queryFn: () => api.get('/users?limit=200').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const allUsers = (usersData?.data || []).filter(u => u.active !== 0).map(u => ({
    id: String(u.id), label: `${u.first_name} ${u.last_name}`, role: u.role_name,
  }));

  const { data: delegData, isLoading } = useQuery({
    queryKey: ['delegations'],
    queryFn: () => api.get('/daily-tasks/delegations').then(r => r.data),
  });
  const delegations = delegData?.data || [];
  const today = new Date().toISOString().split('T')[0];
  const active = delegations.filter(d => d.start_date.split('T')[0] <= today && (!d.end_date || d.end_date.split('T')[0] >= today));
  const upcoming = delegations.filter(d => d.start_date.split('T')[0] > today);
  const past = delegations.filter(d => d.end_date && d.end_date.split('T')[0] < today);

  // Task definitions for per-task delegation
  const { data: defsData } = useQuery({
    queryKey: ['task-definitions'],
    queryFn: () => api.get('/daily-tasks/definitions').then(r => r.data),
  });
  const taskDefs = (defsData?.data || []).map(d => ({ id: String(d.id), label: `${d.name} (${d.team})` }));

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [taskDefId, setTaskDefId] = useState('');
  const [notes, setNotes] = useState('');

  const createMut = useMutation({
    mutationFn: (data) => api.post('/daily-tasks/delegations', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['delegations']);
      setShowAdd(false); setFromId(''); setToId(''); setStartDate(today); setEndDate(''); setTaskDefId(''); setNotes('');
    },
    onError: (e) => alert('Error: ' + (e?.response?.data?.error || e.message)),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/daily-tasks/delegations/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['delegations']),
  });

  const DelegationRow = ({ d }) => (
    <div className="flex items-center gap-3 py-2 px-3 text-sm">
      <div className="flex-1">
        <span className="font-medium text-gray-900">{d.from_first} {d.from_last}</span>
        <span className="text-gray-400 mx-1.5">→</span>
        <span className="font-medium text-[#1e3a5f]">{d.to_first} {d.to_last}</span>
        {d.task_name && <span className="text-xs text-gray-400 ml-2">({d.task_name} only)</span>}
        {!d.task_definition_id && <span className="text-xs text-gray-400 ml-2">(all tasks)</span>}
      </div>
      <span className="text-xs text-gray-500">
        {formatDate(d.start_date)}{d.end_date ? ` — ${formatDate(d.end_date)}` : ' — ongoing'}
      </span>
      {d.from_role && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{d.from_role}</span>}
      {d.notes && <span className="text-xs text-gray-400 truncate max-w-[150px]" title={d.notes}>{d.notes}</span>}
      <button onClick={() => { if (confirm('Remove this delegation?')) deleteMut.mutate(d.id); }}
        className="text-xs text-red-400 hover:text-red-600">Remove</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Active now */}
      <Section title={`Active Coverage (${active.length})`} defaultOpen={true}
        action={<button onClick={() => setShowAdd(!showAdd)} className="text-xs text-[#1e3a5f] hover:underline">{showAdd ? 'Cancel' : '+ Add'}</button>}>
        {showAdd && (
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <SearchSelect label="Person Out" required options={allUsers} displayKey="label" valueKey="id"
                value={fromId} onChange={setFromId} placeholder="Who's out..." />
              <SearchSelect label="Covered By" required options={allUsers} displayKey="label" valueKey="id"
                value={toId} onChange={setToId} placeholder="Who's covering..." />
              <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              <SearchSelect label="Specific Task (optional)" options={[{ id: '', label: 'All Tasks' }, ...taskDefs]}
                displayKey="label" valueKey="id" value={taskDefId} onChange={setTaskDefId} placeholder="All tasks..." />
              <Input label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Vacation" />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => {
                if (!fromId || !toId || !startDate) return alert('Person out, covered by, and start date are required');
                createMut.mutate({
                  from_user_id: Number(fromId), to_user_id: Number(toId),
                  start_date: startDate, end_date: endDate || null,
                  task_definition_id: taskDefId ? Number(taskDefId) : null, notes: notes || null,
                });
              }} disabled={createMut.isPending} size="sm">
                {createMut.isPending ? 'Saving...' : 'Create Delegation'}
              </Button>
            </div>
          </div>
        )}
        {isLoading ? <Spinner className="w-5 h-5" /> : active.length === 0 ? (
          <p className="text-sm text-gray-400">No active delegations — everyone is in</p>
        ) : (
          <div className="divide-y divide-gray-100">{active.map(d => <DelegationRow key={d.id} d={d} />)}</div>
        )}
      </Section>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <Section title={`Upcoming (${upcoming.length})`} defaultOpen={false}>
          <div className="divide-y divide-gray-100">{upcoming.map(d => <DelegationRow key={d.id} d={d} />)}</div>
        </Section>
      )}

      {/* Past */}
      {past.length > 0 && (
        <Section title={`Past (${past.length})`} defaultOpen={false}>
          <div className="divide-y divide-gray-100">{past.map(d => <DelegationRow key={d.id} d={d} />)}</div>
        </Section>
      )}
    </div>
  );
}

// ── Definitions Panel ─────────────────────────────────────────
function DefinitionsPanel() {
  const qc = useQueryClient();
  const { data: defsData, isLoading } = useQuery({
    queryKey: ['task-definitions'],
    queryFn: () => api.get('/daily-tasks/definitions').then(r => r.data),
  });
  const defs = defsData?.data || [];
  const { data: refData } = useGeneralData();
  const roles = refData?.data?.staffUsers ? [] : []; // We need actual roles
  const { data: rolesData } = useQuery({
    queryKey: ['roles-list'],
    queryFn: () => api.get('/roles').then(r => r.data),
    staleTime: 10 * 60 * 1000,
  });
  const allRoles = rolesData?.data || [];

  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const grouped = {};
  defs.forEach(d => { if (!grouped[d.team]) grouped[d.team] = []; grouped[d.team].push(d); });

  const saveMut = useMutation({
    mutationFn: ({ id, ...data }) => id ? api.put(`/daily-tasks/definitions/${id}`, data).then(r => r.data)
      : api.post('/daily-tasks/definitions', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['task-definitions']); setEditing(null); setShowAdd(false); },
    onError: (e) => alert('Error: ' + (e?.response?.data?.error || e.message)),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/daily-tasks/definitions/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['task-definitions']),
  });

  const TaskForm = ({ initial, onSave, onCancel }) => {
    const [form, setForm] = useState(initial || { name: '', description: '', role_id: '', team: 'Scheduling', task_type: 'page', page_path: '', count_query: '', count_label: 'items', sort_order: 0 });
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    return (
      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Input label="Name" value={form.name} onChange={e => set('name', e.target.value)} />
          <Select label="Team" value={form.team} onChange={e => set('team', e.target.value)}>
            {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select label="Role" value={form.role_id || ''} onChange={e => set('role_id', e.target.value || null)}>
            <option value="">Any (team-wide)</option>
            {allRoles.map(r => <option key={r.id} value={r.id}>{r.role_name}</option>)}
          </Select>
          <Select label="Type" value={form.task_type} onChange={e => set('task_type', e.target.value)}>
            {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <Input label="Page Path" value={form.page_path || ''} onChange={e => set('page_path', e.target.value)} placeholder="/notifications" />
          <Input label="Sort Order" type="number" value={form.sort_order} onChange={e => set('sort_order', Number(e.target.value))} />
        </div>
        <Input label="Description" value={form.description || ''} onChange={e => set('description', e.target.value)} />
        {form.task_type === 'query' && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Count Query (must return `cnt`)</label>
              <textarea value={form.count_query || ''} onChange={e => set('count_query', e.target.value)} rows={3}
                className="block w-full rounded border border-gray-300 text-xs font-mono px-2 py-1 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
            <Input label="Count Label" value={form.count_label || ''} onChange={e => set('count_label', e.target.value)} placeholder="items" />
          </>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
          <Button onClick={() => onSave(form)} disabled={saveMut.isPending} size="sm">
            {saveMut.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    );
  };

  if (isLoading) return <div className="flex justify-center py-8"><Spinner className="w-6 h-6" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!showAdd && <Button onClick={() => setShowAdd(true)} size="sm">+ Add Task</Button>}
      </div>
      {showAdd && (
        <TaskForm onSave={(form) => saveMut.mutate(form)} onCancel={() => setShowAdd(false)} />
      )}
      {Object.entries(grouped).map(([team, tasks]) => (
        <Section key={team} title={`${team} (${tasks.length})`} defaultOpen={true}>
          <div className="divide-y divide-gray-100">
            {tasks.map(t => (
              <div key={t.id}>
                {editing === t.id ? (
                  <TaskForm initial={{ ...t, role_id: t.role_id || '' }}
                    onSave={(form) => saveMut.mutate({ id: t.id, ...form })}
                    onCancel={() => setEditing(null)} />
                ) : (
                  <div className="flex items-center gap-3 py-2 px-1 text-sm">
                    <div className="flex-1">
                      <span className="font-medium text-gray-900">{t.name}</span>
                      {t.description && <span className="text-xs text-gray-400 ml-2">{t.description}</span>}
                    </div>
                    {t.role_name && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{t.role_name}</span>}
                    {t.page_path && <span className="text-xs text-[#1e3a5f]">{t.page_path}</span>}
                    <span className="text-xs text-gray-400">{t.task_type}</span>
                    <button onClick={() => setEditing(t.id)} className="text-xs text-gray-400 hover:text-[#1e3a5f]">Edit</button>
                    <button onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteMut.mutate(t.id); }}
                      className="text-xs text-gray-400 hover:text-red-500">Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
