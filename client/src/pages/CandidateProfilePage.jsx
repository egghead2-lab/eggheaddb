import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import api from '../api/client';
import { useGeneralData } from '../hooks/useReferenceData';
import { toFormData } from '../lib/utils';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';

export default function CandidateProfilePage() {
  const { id } = useParams();
  const qc = useQueryClient();
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
  });

  const { register, handleSubmit, reset, formState: { isDirty } } = useForm();

  useEffect(() => {
    if (candidateData?.data) {
      const { requirements, tasks, appliedTemplates, ...c } = candidateData.data;
      reset(toFormData(c));
    }
  }, [candidateData]);

  const saveMutation = useMutation({
    mutationFn: (data) => api.put(`/onboarding/candidates/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['candidate', id]); },
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  const candidate = candidateData?.data || {};

  return (
    <AppShell>
      <UnsavedChangesModal when={isDirty} />
      <form onSubmit={handleSubmit(d => saveMutation.mutate(d))}>
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <Link to={`/candidates/${id}`} className="text-sm text-gray-500 hover:text-[#1e3a5f]">&larr; Back to {candidate.full_name}</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-0.5">Profile & Settings</h1>
        </div>

        <div className="p-6 space-y-4 pb-32">
          <Section title="Candidate Info" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Full Name" required {...register('full_name', { required: true })} />
              <Input label="Email" type="email" required {...register('email', { required: true })} />
              <Input label="Phone" {...register('phone')} />
              <Select label="Status" {...register('status')}>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="rejected">Rejected</option>
              </Select>
              <Select label="Area" {...register('geographic_area_id')}>
                <option value="">Select area…</option>
                {(ref.areas || []).map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
              </Select>
              <Input label="First Class Date" type="date" {...register('first_class_date')} />
              <Input label="Lead Pay ($/hr)" type="number" step="0.01" {...register('lead_pay')} />
              <Input label="Assist Pay ($/hr)" type="number" step="0.01" {...register('assist_pay')} />
              <Input label="How Heard" {...register('how_heard')} />
              <Input label="Resume Link" {...register('resume_link')} />
            </div>
          </Section>

          <Section title="Team Assignments" defaultOpen={true}>
            <p className="text-xs text-gray-400 mb-3">These auto-populate when you set an area. Override individually if needed.</p>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Onboarder" {...register('onboarder_user_id')}>
                <option value="">Select…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </Select>
              <Select label="Trainer" {...register('trainer_user_id')}>
                <option value="">Select…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </Select>
              <Select label="Scheduling Coordinator" {...register('scheduling_coordinator_user_id')}>
                <option value="">Select…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </Select>
              <Select label="Field Manager" {...register('field_manager_user_id')}>
                <option value="">Select…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </Select>
              <Select label="Recruiter" {...register('recruiter_user_id')}>
                <option value="">Select…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </Select>
            </div>
          </Section>

          <Section title="Personal Info" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Input label="Address" {...register('address')} /></div>
              <Input label="City" {...register('city')} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="State" {...register('state')} maxLength={2} />
                <Input label="Zip" {...register('zip')} />
              </div>
              <Input label="Shirt Size" {...register('shirt_size')} />
            </div>
          </Section>

          <AvailabilityView candidateId={id} />
        </div>

        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {saveMutation.isError && <p className="text-sm text-red-600">{saveMutation.error?.response?.data?.error || 'Save failed'}</p>}
          {saveMutation.isSuccess && <p className="text-sm text-green-600">Saved</p>}
          <div className="ml-auto flex gap-3">
            <Link to={`/candidates/${id}`} className="text-sm text-gray-500 hover:text-gray-700 py-2">Back</Link>
            <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}

function AvailabilityView({ candidateId }) {
  const { data } = useQuery({
    queryKey: ['candidate-availability', candidateId],
    queryFn: () => api.get(`/onboarding/candidates/${candidateId}/availability`).then(r => r.data),
  });
  const avail = data?.data;

  return (
    <Section title="Availability" defaultOpen={false}>
      {!avail || !avail.personal_info_completed ? (
        <p className="text-sm text-gray-400">{avail ? "Candidate hasn't completed their availability yet." : 'No availability data.'}</p>
      ) : (
        <div className="space-y-2">
          {['monday','tuesday','wednesday','thursday','friday'].map(day => (
            <div key={day} className={`flex items-center gap-3 px-3 py-2 rounded ${avail[day] ? 'bg-green-50' : 'bg-gray-50 opacity-50'}`}>
              <span className={`w-3 h-3 rounded-full shrink-0 ${avail[day] ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm font-medium text-gray-700 w-28 capitalize">{day}</span>
              <span className="text-sm text-gray-500">{avail[day] ? (avail[`${day}_notes`] || '2:00 - 6:00 PM (general)') : 'Not available'}</span>
            </div>
          ))}
          {avail.additional_notes && (
            <div className="pt-2 border-t border-gray-100">
              <div className="text-xs text-gray-500 font-medium mb-1">Additional Notes</div>
              <div className="text-sm text-gray-700">{avail.additional_notes}</div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
