import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import { formatDate, formatTime } from '../lib/utils';

const CATEGORIES = [
  { key: 'category_physical', label: 'Physical' },
  { key: 'category_verbal', label: 'Verbal' },
  { key: 'category_accident', label: 'Accident' },
  { key: 'category_behavior', label: 'Behavior' },
  { key: 'category_illness', label: 'Illness' },
  { key: 'category_injury', label: 'Injury' },
  { key: 'category_bullying', label: 'Bullying' },
];

const SEVERITY_DESC = {
  minor: 'Scrapes, bruises, disagreements, falling, crying — not related to serious injury',
  major: 'Violence, broken bones, blood, fainting, repeated/severe bullying, "stranger danger", bathroom accidents',
};

export default function IncidentReportPage() {
  const { user } = useAuth();
  const role = user?.role || '';
  const ADMIN_ROLES = ['Admin', 'CEO', 'Scheduling Coordinator', 'Field Manager', 'Client Manager'];
  const isAdmin = ADMIN_ROLES.includes(role);
  const isProfessor = role === 'Professor';

  const [tab, setTab] = useState(isProfessor ? 'report' : 'log');

  return (
    <AppShell>
      <PageHeader title="Incident Reports" action={
        <div className="flex items-center gap-2">
          {(isProfessor || isAdmin) && (
            <button onClick={() => setTab('report')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tab === 'report' ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600'}`}>
              {isProfessor ? 'New Report' : 'File Report'}
            </button>
          )}
          <button onClick={() => setTab('log')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tab === 'log' ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600'}`}>
            {isProfessor ? 'My Reports' : 'Incident Log'}
          </button>
        </div>
      } />

      {tab === 'report' ? <ReportForm isAdmin={isAdmin} onSubmitted={() => setTab('log')} /> : <IncidentLog isAdmin={isAdmin} />}
    </AppShell>
  );
}

function ReportForm({ isAdmin, onSubmitted }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    incident_date: today,
    incident_time: '',
    severity: 'minor',
    professors_involved: '',
    students_involved: '',
    description: '',
    program_id: '',
    category_physical: false,
    category_verbal: false,
    category_accident: false,
    category_behavior: false,
    category_illness: false,
    category_injury: false,
    category_bullying: false,
  });

  const mutation = useMutation({
    mutationFn: (data) => api.post('/incidents', data),
    onSuccess: () => {
      qc.invalidateQueries(['incidents']);
      setForm({
        incident_date: today, incident_time: '', severity: 'minor',
        professors_involved: '', students_involved: '', description: '', program_id: '',
        category_physical: false, category_verbal: false, category_accident: false,
        category_behavior: false, category_illness: false, category_injury: false, category_bullying: false,
      });
      onSubmitted();
    },
  });

  // Get professor's programs for dropdown
  const { data: progData } = useQuery({
    queryKey: ['my-attendance'],
    queryFn: () => api.get('/schedule/my-attendance').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const programs = progData?.data || [];

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
  const toggleCat = (key) => setForm(prev => ({ ...prev, [key]: !prev[key] }));

  const canSubmit = form.incident_date && form.description && (form.severity === 'minor' || form.severity === 'major');

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-red-50 border-b border-red-200">
          <h2 className="font-bold text-red-800">Incident Report Form</h2>
          <p className="text-xs text-red-600 mt-0.5">All incidents must be reported. This form goes directly to your scheduling coordinator for review.</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Incident *</label>
              <input type="date" value={form.incident_date} onChange={e => set('incident_date', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input type="time" value={form.incident_time} onChange={e => set('incident_time', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
          </div>

          {/* Program */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Program / Class</label>
            <select value={form.program_id} onChange={e => set('program_id', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]">
              <option value="">Select program...</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.program_nickname}</option>)}
            </select>
          </div>

          {/* People involved */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Professor(s) Involved</label>
              <input type="text" value={form.professors_involved} onChange={e => set('professors_involved', e.target.value)}
                placeholder="Names of professors"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student(s) Involved</label>
              <input type="text" value={form.students_involved} onChange={e => set('students_involved', e.target.value)}
                placeholder="Names of students"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Severity *</label>
            <div className="grid grid-cols-2 gap-3">
              {['minor', 'major'].map(sev => (
                <button key={sev} type="button" onClick={() => set('severity', sev)}
                  className={`text-left rounded-lg border-2 p-3 transition-colors ${
                    form.severity === sev
                      ? sev === 'major' ? 'border-red-400 bg-red-50' : 'border-amber-400 bg-amber-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <div className={`text-sm font-bold ${sev === 'major' ? 'text-red-700' : 'text-amber-700'}`}>
                    {sev.charAt(0).toUpperCase() + sev.slice(1)}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{SEVERITY_DESC[sev]}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Categories (check all that apply)</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat.key} type="button" onClick={() => toggleCat(cat.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form[cat.key] ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description of Incident *</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={5}
              placeholder="Please describe what happened in detail..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={() => mutation.mutate(form)} disabled={!canSubmit || mutation.isPending}>
              {mutation.isPending ? 'Submitting...' : 'Submit Incident Report'}
            </Button>
            {mutation.isError && <p className="text-xs text-red-600">{mutation.error?.response?.data?.error || 'Failed to submit'}</p>}
            {mutation.isSuccess && <p className="text-xs text-green-600">Report submitted</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_BADGE = {
  pending: { label: 'Pending', className: 'bg-red-100 text-red-700' },
  acknowledged: { label: 'Acknowledged', className: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-700' },
  resolved: { label: 'Resolved', className: 'bg-green-100 text-green-700' },
};

function IncidentLog({ isAdmin }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('open');
  const [expandedId, setExpandedId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', filter],
    queryFn: () => api.get('/incidents', { params: { reviewed: filter === 'open' ? 'false' : filter === 'resolved' ? 'true' : undefined } }).then(r => r.data),
  });
  const incidents = data?.data || [];

  const reviewMutation = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/incidents/${id}/review`, body),
    onSuccess: () => qc.invalidateQueries(['incidents']),
  });

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: 'open', label: 'Open' },
          { key: 'resolved', label: 'Resolved' },
          { key: 'all', label: 'All' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${filter === f.key ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No incident reports</div>
      ) : (
        <div className="space-y-3">
          {incidents.map(ir => {
            const expanded = expandedId === ir.id;
            const status = STATUS_BADGE[ir.review_status] || STATUS_BADGE.pending;
            return (
              <div key={ir.id} className={`bg-white rounded-xl border overflow-hidden ${
                ir.severity === 'major' ? 'border-red-300' : 'border-gray-200'
              } ${ir.review_status === 'pending' ? 'ring-1 ring-red-200' : ''}`}>
                {/* Header */}
                <div className={`px-5 py-3 flex items-center gap-3 cursor-pointer ${ir.severity === 'major' ? 'bg-red-50' : 'bg-gray-50'}`}
                  onClick={() => setExpandedId(expanded ? null : ir.id)}>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                    ir.severity === 'major' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-700'
                  }`}>{ir.severity}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${status.className}`}>{status.label}</span>
                  <span className="font-medium text-sm text-gray-900">{formatDate(ir.incident_date)}</span>
                  {ir.incident_time && <span className="text-xs text-gray-400">{ir.incident_time}</span>}
                  <span className="text-sm text-gray-600 flex-1 truncate">
                    {ir.professor_name} {ir.program_nickname ? `— ${ir.program_nickname}` : ''}
                  </span>
                  <span className="text-[10px] text-gray-400">{expanded ? '▾' : '▸'}</span>
                </div>

                {expanded && (
                  <div className="border-t border-gray-100">
                    {/* Details grid */}
                    <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-3">
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Reported By</div>
                        <div className="text-sm text-gray-800">{ir.professor_name}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Date / Time</div>
                        <div className="text-sm text-gray-800">{formatDate(ir.incident_date)} {ir.incident_time || ''}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Program</div>
                        <div className="text-sm text-gray-800">{ir.program_nickname || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Location</div>
                        <div className="text-sm text-gray-800">{ir.location_nickname || '—'}</div>
                      </div>
                      {ir.professors_involved && (
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Professors Involved</div>
                          <div className="text-sm text-gray-800">{ir.professors_involved}</div>
                        </div>
                      )}
                      {ir.students_involved && (
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Students Involved</div>
                          <div className="text-sm text-gray-800">{ir.students_involved}</div>
                        </div>
                      )}
                      <div className="col-span-2">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Categories</div>
                        <div className="flex flex-wrap gap-1">
                          {CATEGORIES.filter(c => ir[c.key]).map(c => (
                            <span key={c.key} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">{c.label}</span>
                          ))}
                          {CATEGORIES.every(c => !ir[c.key]) && <span className="text-xs text-gray-400">None selected</span>}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Description</div>
                        <div className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{ir.description}</div>
                      </div>
                    </div>

                    {/* Resolution section */}
                    {(ir.review_status !== 'pending' || ir.review_notes || ir.resolution) && (
                      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                        {ir.reviewed_by_name && (
                          <div className="text-[10px] text-gray-400 mb-1">
                            Handled by {ir.reviewed_by_name}
                            {ir.reviewed_at ? ` · Resolved ${formatDate(ir.reviewed_at)}` : ''}
                          </div>
                        )}
                        {ir.review_notes && (
                          <div className="mb-1">
                            <span className="text-[10px] text-gray-400 uppercase">Notes: </span>
                            <span className="text-sm text-gray-700">{ir.review_notes}</span>
                          </div>
                        )}
                        {ir.resolution && (
                          <div>
                            <span className="text-[10px] text-gray-400 uppercase">Resolution: </span>
                            <span className="text-sm text-gray-800 font-medium">{ir.resolution}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Activity thread */}
                    {expanded && <IncidentNotes incidentId={ir.id} isAdmin={isAdmin} />}

                    {/* Admin actions */}
                    {isAdmin && (
                      <IncidentActions ir={ir} mutation={reviewMutation} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IncidentNotes({ incidentId, isAdmin }) {
  const qc = useQueryClient();
  const [newNote, setNewNote] = useState('');

  const { data } = useQuery({
    queryKey: ['incident-notes', incidentId],
    queryFn: () => api.get(`/incidents/${incidentId}/notes`).then(r => r.data),
  });
  const notes = data?.data || [];

  const addMutation = useMutation({
    mutationFn: (note) => api.post(`/incidents/${incidentId}/notes`, { note }),
    onSuccess: () => { qc.invalidateQueries(['incident-notes', incidentId]); setNewNote(''); },
  });

  return (
    <div className="px-5 py-3 border-t border-gray-100">
      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Activity</div>
      {notes.length > 0 && (
        <div className="space-y-2 mb-3">
          {notes.map(n => (
            <div key={n.id} className="flex gap-2 text-xs">
              <div className="w-6 h-6 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[10px] font-bold text-[#1e3a5f] shrink-0">
                {(n.author_name || '?').charAt(0)}
              </div>
              <div className="flex-1">
                <div className="text-gray-500">
                  <span className="font-medium text-gray-800">{n.author_name}</span>
                  {n.tagged_name && <span className="ml-1 text-blue-600">@{n.tagged_name}</span>}
                  <span className="ml-2 text-[10px] text-gray-400">{formatDate(n.ts_inserted)}</span>
                </div>
                <p className="text-gray-700 mt-0.5">{n.note}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {isAdmin && (
        <div className="flex gap-2">
          <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newNote.trim() && addMutation.mutate(newNote.trim())}
            placeholder="Add a note..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
          <button onClick={() => newNote.trim() && addMutation.mutate(newNote.trim())}
            disabled={!newNote.trim() || addMutation.isPending}
            className="px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-white text-xs font-medium hover:bg-[#152a47] disabled:opacity-50">
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function IncidentActions({ ir, mutation }) {
  const [notes, setNotes] = useState(ir.review_notes || '');
  const [resolution, setResolution] = useState(ir.resolution || '');
  const status = ir.review_status || 'pending';
  const isResolved = status === 'resolved';

  return (
    <div className="px-5 py-3 border-t border-gray-200 bg-white space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider">Review Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Internal notes..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider">Resolution {isResolved ? '' : '(required to resolve)'}</label>
          <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={2}
            placeholder="What was done to resolve this..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status === 'pending' && (
          <Button onClick={() => mutation.mutate({ id: ir.id, review_status: 'acknowledged', review_notes: notes })}
            disabled={mutation.isPending}>Acknowledge</Button>
        )}
        {status === 'acknowledged' && (
          <Button onClick={() => mutation.mutate({ id: ir.id, review_status: 'in_progress', review_notes: notes })}
            disabled={mutation.isPending}>Mark In Progress</Button>
        )}
        {(status === 'acknowledged' || status === 'in_progress') && (
          <Button onClick={() => mutation.mutate({ id: ir.id, review_status: 'resolved', review_notes: notes, resolution })}
            disabled={mutation.isPending || !resolution}>
            Resolve
          </Button>
        )}
        <button onClick={() => mutation.mutate({ id: ir.id, review_notes: notes, resolution: resolution || undefined })}
          disabled={mutation.isPending}
          className="text-xs text-gray-500 hover:text-[#1e3a5f]">
          {isResolved ? 'Update Notes' : 'Save Notes'}
        </button>
        {isResolved && (
          <button onClick={() => mutation.mutate({ id: ir.id, review_status: 'in_progress', review_notes: notes })}
            disabled={mutation.isPending}
            className="text-xs text-amber-600 hover:text-amber-700 font-medium">Reopen</button>
        )}
      </div>
    </div>
  );
}
