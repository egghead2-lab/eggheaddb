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

function IncidentLog({ isAdmin }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('unreviewed');
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [resolution, setResolution] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', filter],
    queryFn: () => api.get('/incidents', { params: { reviewed: filter === 'unreviewed' ? 'false' : filter === 'reviewed' ? 'true' : undefined } }).then(r => r.data),
  });
  const incidents = data?.data || [];

  const reviewMutation = useMutation({
    mutationFn: ({ id, review_notes, resolution }) => api.patch(`/incidents/${id}/review`, { review_notes, resolution }),
    onSuccess: () => {
      qc.invalidateQueries(['incidents']);
      setReviewingId(null);
      setReviewNotes('');
      setResolution('');
    },
  });

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        {['unreviewed', 'reviewed', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${filter === f ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f === 'unreviewed' ? `Needs Review (${incidents.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No incident reports</div>
      ) : (
        <div className="space-y-3">
          {incidents.map(ir => (
            <div key={ir.id} className={`bg-white rounded-lg border overflow-hidden ${
              ir.severity === 'major' ? 'border-red-300' : 'border-gray-200'
            } ${!ir.reviewed ? 'ring-1 ring-amber-200' : ''}`}>
              <div className={`px-4 py-3 flex items-center justify-between ${ir.severity === 'major' ? 'bg-red-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                    ir.severity === 'major' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-700'
                  }`}>{ir.severity}</span>
                  <span className="font-medium text-sm text-gray-900">{formatDate(ir.incident_date)}</span>
                  {ir.incident_time && <span className="text-xs text-gray-500">{ir.incident_time}</span>}
                  <span className="text-xs text-gray-400">—</span>
                  <span className="text-sm text-gray-700">{ir.professor_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {ir.reviewed ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Reviewed</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Pending Review</span>
                  )}
                </div>
              </div>

              <div className="px-4 py-3">
                <div className="flex flex-wrap gap-1 mb-2">
                  {CATEGORIES.filter(c => ir[c.key]).map(c => (
                    <span key={c.key} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">{c.label}</span>
                  ))}
                </div>
                <div className="text-xs text-gray-500 mb-1">
                  {ir.program_nickname && <span>Program: <strong>{ir.program_nickname}</strong> · </span>}
                  {ir.location_nickname && <span>Location: <strong>{ir.location_nickname}</strong> · </span>}
                  {ir.professors_involved && <span>Professors: {ir.professors_involved} · </span>}
                  {ir.students_involved && <span>Students: {ir.students_involved}</span>}
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{ir.description}</p>

                {ir.reviewed && (
                  <div className="mt-3 pt-2 border-t border-gray-100">
                    <div className="text-[10px] text-green-600 font-medium">Reviewed by {ir.reviewed_by_name} on {formatDate(ir.reviewed_at)}</div>
                    {ir.review_notes && <p className="text-xs text-gray-600 mt-0.5">{ir.review_notes}</p>}
                    {ir.resolution && <p className="text-xs text-gray-800 mt-0.5"><strong>Resolution:</strong> {ir.resolution}</p>}
                  </div>
                )}

                {/* Review action — admin only */}
                {isAdmin && !ir.reviewed && (
                  <div className="mt-3 pt-2 border-t border-gray-100">
                    {reviewingId === ir.id ? (
                      <div className="space-y-2">
                        <input type="text" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                          placeholder="Review notes (optional)"
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                        <input type="text" value={resolution} onChange={e => setResolution(e.target.value)}
                          placeholder="Resolution taken"
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                        <div className="flex gap-2">
                          <Button onClick={() => reviewMutation.mutate({ id: ir.id, review_notes: reviewNotes, resolution })}
                            disabled={reviewMutation.isPending}>
                            {reviewMutation.isPending ? 'Saving...' : 'Mark Reviewed'}
                          </Button>
                          <button onClick={() => setReviewingId(null)} className="text-xs text-gray-500">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setReviewingId(ir.id)}
                        className="text-xs text-[#1e3a5f] font-medium hover:underline">
                        Review & Acknowledge
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
