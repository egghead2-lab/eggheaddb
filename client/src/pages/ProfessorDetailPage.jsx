import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getProfessor, createProfessor, updateProfessor } from '../api/professors';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { TRAINING_FIELDS } from '../lib/constants';
import { formatDate, toFormData } from '../lib/utils';

export default function ProfessorDetailPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: profData, isLoading } = useQuery({
    queryKey: ['professors', id],
    queryFn: () => getProfessor(id),
    enabled: !isNew,
  });
  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty } } = useForm();

  useEffect(() => {
    if (profData?.data) reset(toFormData(profData.data));
  }, [profData]);

  const mutation = useMutation({
    mutationFn: (data) => isNew ? createProfessor(data) : updateProfessor(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['professors']);
      if (isNew && res?.id) navigate(`/professors/${res.id}`);
    },
  });

  const prof = profData?.data || {};

  const onSubmit = (data) => mutation.mutate(data);

  if (!isNew && isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  return (
    <AppShell>
      <UnsavedChangesModal when={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <Link to="/professors" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Professors</Link>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">
              {isNew ? 'New Professor' : (prof.professor_nickname || [prof.first_name, prof.last_name].filter(Boolean).join(' ') || 'Professor')}
            </h1>
          </div>
          {!isNew && (
            <Link to={`/schedule/${id}`} className="text-sm text-[#1e3a5f] hover:underline">View Schedule →</Link>
          )}
        </div>

        <div className="p-6 space-y-4 pb-32">
          {/* Section 1: General Info */}
          <Section title="General Info" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Preferred Name" required {...register('professor_nickname', { required: 'Required' })} error={errors.professor_nickname?.message} />
              <Select label="Status" required {...register('professor_status_id', { required: 'Required' })} error={errors.professor_status_id?.message}>
                <option value="">Select status…</option>
                {(ref.professorStatuses || []).filter(s => !isNew || ['Active', 'Substitute', 'Training'].includes(s.professor_status_name)).map(s => (
                  <option key={s.id} value={s.id}>{s.professor_status_name}</option>
                ))}
              </Select>
              <Input label="First Name" required {...register('first_name', { required: 'Required' })} error={errors.first_name?.message} />
              <Input label="Last Name" required {...register('last_name', { required: 'Required' })} error={errors.last_name?.message} />
              <Input label="Email" type="email" {...register('email')} />
              <Input label="Phone Number" {...register('phone_number')} />
              <div className="col-span-2">
                <Input label="Address" {...register('address')} />
              </div>
              <Select label="Geographic Area" {...register('scheduling_coordinator_owner_id')}>
                <option value="">None</option>
                {(ref.areas || []).map(a => (
                  <option key={a.id} value={a.id}>{a.geographic_area_name}</option>
                ))}
              </Select>
              <div className="col-span-2">
                <Input label="General Notes" {...register('general_notes')} />
              </div>
            </div>
          </Section>

          {/* Section 2: Pay Info */}
          <Section title="Pay Info">
            <div className="grid grid-cols-3 gap-4">
              <Input label="Base Pay" type="number" step="0.01" {...register('base_pay')} />
              <Input label="Assist Pay" type="number" step="0.01" {...register('assist_pay')} />
              <Input label="Pickup Pay" type="number" step="0.01" {...register('pickup_pay')} />
              <Input label="Party Pay" type="number" step="0.01" {...register('party_pay')} />
              <Input label="Camp Pay" type="number" step="0.01" {...register('camp_pay')} />
            </div>
          </Section>

          {/* Section 3: Training */}
          <Section title="Training" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-3">
              {TRAINING_FIELDS.map(t => (
                <Toggle
                  key={t.key}
                  label={t.label}
                  checked={!!watch(t.key)}
                  onChange={v => setValue(t.key, v ? 1 : 0, { shouldDirty: true })}
                />
              ))}
            </div>
          </Section>

          {/* Section 4: Compliance */}
          <Section title="Compliance & Qualifications" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Toggle label="Virtus" checked={!!watch('virtus')} onChange={v => setValue('virtus', v ? 1 : 0, { shouldDirty: true })} />
              <Input label="Virtus Date" type="date" {...register('virtus_date')} />
              <Toggle label="TB Test" checked={!!watch('tb_test')} onChange={v => setValue('tb_test', v ? 1 : 0, { shouldDirty: true })} />
              <Input label="TB Date" type="date" {...register('tb_date')} />
            </div>
            {prof.livescans && prof.livescans.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-medium text-gray-700 mb-2">Livescans</div>
                <div className="space-y-1">
                  {prof.livescans.map(ls => (
                    <div key={ls.id} className="text-sm text-gray-600 flex gap-4">
                      <span>{ls.location_nickname || 'Unknown location'}</span>
                      <span>{ls.livescan_date ? formatDate(ls.livescan_date) : '—'}</span>
                      <span className={ls.pass ? 'text-green-600' : 'text-red-500'}>{ls.pass ? 'Pass' : 'Fail'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Section 5: Emergency & HR */}
          <Section title="Emergency & HR Info">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Emergency Contact" {...register('emergency_contact')} />
              <Input label="Emergency Contact Number" {...register('emergency_contact_number')} />
              <Input label="Birthday" type="date" {...register('birthday')} />
              <Input label="Hire Date" type="date" {...register('hire_date')} />
              <Input label="Termination Date" type="date" {...register('termination_date')} />
              <Input label="Termination Reason" {...register('termination_rason')} />
              <div className="col-span-2">
                <Input label="Schedule Link" {...register('schedule_link')} />
              </div>
              <Select label="Onboard Status" {...register('onboard_status_id')}>
                <option value="">None</option>
                {(ref.onboardStatuses || []).map(s => (
                  <option key={s.id} value={s.id}>{s.onboard_status_name}</option>
                ))}
              </Select>
              <Input label="Rating" type="number" step="0.1" min="0" max="5" {...register('rating')} />
            </div>
          </Section>

          {/* Section 6: Availability */}
          <Section title="Availability">
            {prof.availability && prof.availability.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Day</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">From</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Until</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {prof.availability.map(a => (
                    <tr key={a.id}>
                      <td className="px-3 py-2">{a.weekday_name}</td>
                      <td className="px-3 py-2">{a.time_from || '—'}</td>
                      <td className="px-3 py-2">{a.time_to || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{a.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-gray-400">No availability on file</p>}
          </Section>

          {/* Section 7: Sub History */}
          <Section title="Substitute History">
            {prof.daysOff && prof.daysOff.length > 0 ? (
              <div className="space-y-1">
                {prof.daysOff.map(d => (
                  <div key={d.id} className="text-sm flex gap-4">
                    <span className="text-gray-600">{d.date_requested ? formatDate(d.date_requested) : '—'}</span>
                    <span className="text-gray-500">{d.notes}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-400">No sub history</p>}
          </Section>

          {/* Section 8: Materials / Bins */}
          <Section title="Materials / Bins">
            {prof.bins && prof.bins.length > 0 ? (
              <div className="space-y-1">
                {prof.bins.map(b => (
                  <div key={b.id} className="text-sm flex gap-4">
                    <span className="font-medium">{b.bin_name}</span>
                    <span className="text-gray-600">#{b.bin_number}</span>
                    <span className="text-gray-500">{b.comment}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-400">No bins assigned</p>}
          </Section>
        </div>

        {/* Sticky Footer */}
        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && (
            <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>
          )}
          {mutation.isSuccess && <p className="text-sm text-green-600">Saved successfully</p>}
          <div className="ml-auto flex gap-3">
            <Link to="/professors" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
