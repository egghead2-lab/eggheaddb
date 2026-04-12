import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Section } from '../components/ui/Section';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatDate } from '../lib/utils';
import { RatingBadge, RatingPicker as SharedRatingPicker, RatingLegend, RATING_SCALE } from '../components/ui/DevelopmentalRating';

export default function ObservationLookupPage() {
  const { user } = useAuth();
  const isAdmin = ['Admin', 'CEO'].includes(user?.role);
  const qc = useQueryClient();
  const { data: refData } = useGeneralData();
  const areas = refData?.data?.areas || [];

  const [areaFilter, setAreaFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [activeItem, setActiveItem] = useState(null); // item being acted on
  const [action, setAction] = useState(null); // 'delete' | 'form'
  const [deleteReasonId, setDeleteReasonId] = useState('');
  const [deleteNotes, setDeleteNotes] = useState('');
  const [showManageReasons, setShowManageReasons] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['outstanding-observations', areaFilter, typeFilter],
    queryFn: () => api.get('/evaluations/observations/outstanding', {
      params: { area_id: areaFilter || undefined, type: typeFilter !== 'all' ? typeFilter : undefined }
    }).then(r => r.data),
  });
  const items = data?.data || [];

  const { data: reasonsData } = useQuery({
    queryKey: ['observation-delete-reasons'],
    queryFn: () => api.get('/evaluations/observations/delete-reasons').then(r => r.data),
  });
  const reasons = reasonsData?.data || [];

  const deleteMutation = useMutation({
    mutationFn: () => api.post(`/evaluations/observations/${activeItem.id}/delete-with-reason`, {
      record_type: activeItem.record_type,
      delete_reason_id: deleteReasonId,
      delete_notes: deleteNotes,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['outstanding-observations']);
      setActiveItem(null); setAction(null); setDeleteReasonId(''); setDeleteNotes('');
    },
  });

  const addReasonMutation = useMutation({
    mutationFn: (name) => api.post('/evaluations/observations/delete-reasons', { reason_name: name }),
    onSuccess: () => qc.invalidateQueries(['observation-delete-reasons']),
  });

  const deleteReasonMutation = useMutation({
    mutationFn: (id) => api.delete(`/evaluations/observations/delete-reasons/${id}`),
    onSuccess: () => qc.invalidateQueries(['observation-delete-reasons']),
  });

  const outstanding = items.filter(i => i.form_status === 'pending' || !i.form_status);

  return (
    <AppShell>
      <PageHeader title="Observation Lookup" action={
        <div className="text-sm text-gray-500">{outstanding.length} outstanding</div>
      }>
        <Select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="w-44">
          <option value="">All My Areas</option>
          {areas.map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
        </Select>
        <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-36">
          <option value="all">All Types</option>
          <option value="observation">Observations</option>
          <option value="evaluation">Evaluations</option>
        </Select>
        {isAdmin && (
          <button type="button" onClick={() => setShowManageReasons(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 underline">Manage Reasons</button>
        )}
      </PageHeader>

      <div className="p-6">
        {/* Admin: manage delete reasons */}
        {showManageReasons && (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-6">
            <div className="text-xs font-semibold text-gray-600 mb-2">Delete Reasons (admin)</div>
            <div className="space-y-1">
              {reasons.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-700 flex-1">{r.reason_name}</span>
                  <button type="button" onClick={() => deleteReasonMutation.mutate(r.id)}
                    className="text-gray-300 hover:text-red-500 text-xs">&times;</button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input type="text" placeholder="New reason…" id="new-reason-input"
                  onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { addReasonMutation.mutate(e.target.value.trim()); e.target.value = ''; } }}
                  className="rounded border border-gray-300 px-2 py-1 text-xs flex-1" />
                <button type="button" onClick={() => {
                  const input = document.getElementById('new-reason-input');
                  if (input?.value.trim()) { addReasonMutation.mutate(input.value.trim()); input.value = ''; }
                }} className="text-xs text-[#1e3a5f] hover:underline">Add</button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : outstanding.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-lg mb-1">All caught up</div>
            <div className="text-sm">No outstanding observations or evaluations need forms.</div>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* List */}
            <div className={`${activeItem ? 'w-[55%]' : 'w-full'} space-y-2 transition-all`}>
              {outstanding.map(item => {
                const isEval = item.observation_type === 'evaluation' || item.record_type === 'evaluation';
                const isActive = activeItem?.id === item.id && activeItem?.record_type === item.record_type;
                return (
                  <div key={`${item.record_type}-${item.id}`}
                    className={`bg-white rounded-lg border p-4 transition-colors cursor-pointer ${
                      isActive ? 'border-[#1e3a5f] ring-1 ring-[#1e3a5f]/20' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => { setActiveItem(item); setAction(null); }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">{formatDate((item.observation_date || '').split('T')[0])}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          isEval ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
                        }`}>{isEval ? 'Evaluation' : 'Observation'}</span>
                        {item.geographic_area_name && <span className="text-[10px] text-gray-400">{item.geographic_area_name}</span>}
                      </div>
                    </div>
                    {item.program_nickname && (
                      <div className="text-sm text-gray-700">{item.program_nickname}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-0.5">
                      {item.record_type === 'evaluation' ? 'Professor' : 'Observer'}: <strong>{item.record_type === 'evaluation' ? item.lead_professor_name : item.observer_name}</strong>
                      {item.record_type === 'observation' && item.lead_professor_name && (
                        <span> &bull; Lead: <strong>{item.lead_professor_name}</strong></span>
                      )}
                    </div>
                    {item.location_nickname && (
                      <div className="text-xs text-gray-400 mt-0.5">{item.location_nickname}{item.address ? ` — ${item.address}` : ''}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Action panel */}
            {activeItem && (
              <div className="w-[45%] sticky top-4 self-start">
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {formatDate((activeItem.observation_date || '').split('T')[0])} — {activeItem.program_nickname || activeItem.lead_professor_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {activeItem.record_type === 'evaluation' ? 'Evaluation' : 'Observation'}
                        {activeItem.observer_name && ` by ${activeItem.observer_name}`}
                      </div>
                    </div>
                    <button onClick={() => { setActiveItem(null); setAction(null); }} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
                  </div>

                  <div className="p-4">
                    {!action && (
                      <div className="flex gap-3">
                        <Button onClick={() => setAction('form')}>Fill Out Form</Button>
                        <button type="button" onClick={() => setAction('delete')}
                          className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                          Didn't Happen
                        </button>
                      </div>
                    )}

                    {/* Delete with reason */}
                    {action === 'delete' && (
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-gray-700">Why didn't this happen?</div>
                        <select value={deleteReasonId} onChange={e => setDeleteReasonId(e.target.value)}
                          className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm">
                          <option value="">Select reason…</option>
                          {reasons.map(r => <option key={r.id} value={r.id}>{r.reason_name}</option>)}
                        </select>
                        <textarea value={deleteNotes} onChange={e => setDeleteNotes(e.target.value)}
                          placeholder="Additional notes (optional)…" rows={2}
                          className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                        <div className="flex gap-2">
                          <Button onClick={() => deleteMutation.mutate()} disabled={!deleteReasonId || deleteMutation.isPending}>
                            {deleteMutation.isPending ? 'Removing…' : 'Remove Observation'}
                          </Button>
                          <button type="button" onClick={() => setAction(null)} className="text-sm text-gray-500">Back</button>
                        </div>
                        {deleteMutation.isError && <p className="text-sm text-red-600">{deleteMutation.error?.response?.data?.error || 'Failed'}</p>}
                      </div>
                    )}

                    {/* Observation Form */}
                    {action === 'form' && (
                      <ObservationForm item={activeItem} onSuccess={() => {
                        qc.invalidateQueries(['outstanding-observations']);
                        setActiveItem(null); setAction(null);
                      }} onBack={() => setAction(null)} />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

const CATEGORIES = ['Professional Conduct', 'Organization', 'Authority', 'Education', 'Rapport', 'Flexibility'];
const RatingPicker = SharedRatingPicker;

const PDF_KEYS = {
  formal: 'observation_pdf_formal',
  peer_to_peer: 'observation_pdf_peer_to_peer',
  support_session: 'observation_pdf_support_session',
};

function ObservationForm({ item, onSuccess, onBack }) {
  // Fetch PDF links from system settings
  const { data: settingsData } = useQuery({
    queryKey: ['settings-observation-pdfs'],
    queryFn: () => api.get('/settings', { params: { prefix: 'observation_pdf' } }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const pdfUrls = settingsData?.data || {};

  const [form, setForm] = useState({
    observation_type: 'formal',
    mode: 'in_person',
    professor_id: item.professor_id || '',
    location: item.location_nickname || '',
    evaluator_name: item.observer_name || '',
    ratings: Object.fromEntries(CATEGORIES.map(c => [c, 0])),
    remediation: 'none',
    school_notes: '',
    recommend_party: '',
    support_level_change: '',
    notes: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setRating = (cat, val) => setForm(f => ({ ...f, ratings: { ...f.ratings, [cat]: val } }));

  const isFormalOrPeer = form.observation_type === 'formal' || form.observation_type === 'peer_to_peer';
  const isSupportSession = form.observation_type === 'support_session';

  // Compute average rating
  const ratingValues = Object.values(form.ratings).filter(v => v > 0);
  const avgRating = ratingValues.length > 0 ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(1) : null;
  const avgRounded = avgRating ? Math.round(Number(avgRating)) : null;

  // Result stored as the old pass/needs_improvement/fail for backward compat, but numeric is primary
  const resultFromAvg = avgRounded
    ? (avgRounded >= 4 ? 'pass' : avgRounded >= 2.5 ? 'needs_improvement' : 'fail')
    : null;

  const submitMutation = useMutation({
    mutationFn: () => api.post(`/evaluations/observations/${item.id}/submit-form`, {
      record_type: item.record_type,
      observation_type: form.observation_type,
      form_data: form,
      result: resultFromAvg,
      notes: form.notes || null,
      remediation_followup: form.remediation !== 'none' ? form.remediation : null,
    }),
    onSuccess,
  });

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]';

  return (
    <div className="space-y-5">
      {/* Step 1: Type & Mode */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Observation Type</div>
        <div className="flex gap-2">
          {[['formal', 'Formal'], ['peer_to_peer', 'Peer to Peer'], ['support_session', 'Support / Check-in']].map(([val, label]) => (
            <button key={val} type="button" onClick={() => set('observation_type', val)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                form.observation_type === val
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>{label}</button>
          ))}
        </div>
        {pdfUrls[PDF_KEYS[form.observation_type]] && (
          <a href={pdfUrls[PDF_KEYS[form.observation_type]]} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-xs text-[#1e3a5f] font-medium hover:underline">
            View {form.observation_type === 'formal' ? 'Formal' : form.observation_type === 'peer_to_peer' ? 'Peer to Peer' : 'Support Session'} PDF Template
          </a>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Mode</div>
        <div className="flex gap-2">
          {[['in_person', 'In Person'], ['virtual', 'Virtual'], ...(isSupportSession ? [['phone', 'Phone']] : [])].map(([val, label]) => (
            <button key={val} type="button" onClick={() => set('mode', val)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                form.mode === val
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>{label}</button>
          ))}
        </div>
        {!isSupportSession && form.mode === 'phone' && set('mode', 'in_person')}
      </div>

      {/* Step 2: Professor & Location */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Professor Observed</label>
          <input value={item.lead_professor_name || item.observer_name || ''} disabled className={`${inputCls} bg-gray-50`} />
        </div>
        {!isSupportSession && (
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Location</label>
            <input value={form.location} onChange={e => set('location', e.target.value)} className={inputCls} />
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Evaluator</label>
          <input value={form.evaluator_name} disabled className={`${inputCls} bg-gray-50`} />
        </div>
      </div>

      {/* Step 3: Ratings (Formal & Peer to Peer only) */}
      {isFormalOrPeer && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Developmental Ratings</div>
          <div className="mb-3"><RatingLegend /></div>
          <div className="space-y-2 bg-gray-50 rounded-lg p-3">
            {CATEGORIES.map(cat => (
              <RatingPicker key={cat} label={cat} value={form.ratings[cat]} onChange={v => setRating(cat, v)} />
            ))}
          </div>
          {avgRating && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-500">Average:</span>
              <RatingBadge rating={avgRounded} />
            </div>
          )}
        </div>
      )}

      {/* Step 4: Remediation (Formal & Peer to Peer only) */}
      {isFormalOrPeer && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Is remediation follow-up needed?</label>
          <div className="flex gap-2">
            {[['none', 'No'], ['within_2_weeks', 'Yes, Within 2 Weeks'], ['within_1_month', 'Yes, Within 1 Month']].map(([val, label]) => (
              <button key={val} type="button" onClick={() => set('remediation', val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  form.remediation === val
                    ? (val === 'none' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600')
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>{label}</button>
            ))}
          </div>
          {form.remediation !== 'none' && (
            <p className="text-[10px] text-red-600 mt-1">A follow-up observation will be automatically scheduled.</p>
          )}
        </div>
      )}

      {/* Step 5: School notes */}
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">
          School discoveries (parking, check-in, classroom location, etc.)
        </label>
        <textarea value={form.school_notes} onChange={e => set('school_notes', e.target.value)} rows={2}
          placeholder="Anything useful for a new professor at this school…" className={inputCls} />
      </div>

      {/* Step 6: Party recommendation (Formal & Peer to Peer) */}
      {isFormalOrPeer && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Recommend as Party Professor? (based on energy & interest)
          </label>
          <div className="flex gap-2">
            {[['yes', 'Yes'], ['no', 'No']].map(([val, label]) => (
              <button key={val} type="button" onClick={() => set('recommend_party', val)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  form.recommend_party === val
                    ? (val === 'yes' ? 'bg-green-600 text-white border-green-600' : 'bg-gray-600 text-white border-gray-600')
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Step 7: Support Session level change */}
      {isSupportSession && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Based on this session, do you anticipate the professor's level to change at the next formal observation?
          </label>
          <div className="flex gap-2">
            {[['same', 'No — stays the same'], ['up', 'Yes — expected to go up'], ['down', 'Yes — expected to go down']].map(([val, label]) => (
              <button key={val} type="button" onClick={() => set('support_level_change', val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  form.support_level_change === val
                    ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Additional notes */}
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Additional Notes</label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
          placeholder="Any other feedback, follow-up items…" className={inputCls} />
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
        <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
          {submitMutation.isPending ? 'Submitting…' : 'Submit Observation'}
        </Button>
        <button type="button" onClick={onBack} className="text-sm text-gray-500">Back</button>
        {submitMutation.isError && <span className="text-sm text-red-600">Failed to submit</span>}
      </div>
    </div>
  );
}
