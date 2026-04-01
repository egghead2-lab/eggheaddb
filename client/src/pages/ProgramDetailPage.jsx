import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getProgram, createProgram, updateProgram } from '../api/programs';
import { useGeneralData, useProfessorList, useLocationList } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { SearchSelect } from '../components/ui/SearchSelect';
import { RosterPanel } from '../components/RosterPanel';
import { formatDate, formatTime, toFormData } from '../lib/utils';
import { WEEKDAY_KEYS, WEEKDAYS } from '../lib/constants';

export default function ProgramDetailPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: progData, isLoading } = useQuery({
    queryKey: ['programs', id],
    queryFn: () => getProgram(id),
    enabled: !isNew,
  });

  const { data: refData } = useGeneralData();
  const { data: professorListData } = useProfessorList();
  const { data: locationListData } = useLocationList();
  const ref = refData?.data || {};
  const professors = professorListData?.data || [];
  const locations = locationListData?.data || [];

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm();

  useEffect(() => {
    if (progData?.data) reset(toFormData(progData.data));
  }, [progData]);

  const mutation = useMutation({
    mutationFn: (data) => isNew ? createProgram(data) : updateProgram(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['programs']);
      if (isNew && res?.id) navigate(`/programs/${res.id}`);
    },
  });

  const prog = progData?.data || {};

  const onSubmit = (data) => mutation.mutate(data);

  if (!isNew && isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  return (
    <AppShell>
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <Link to="/programs" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Programs</Link>
            <div className="flex items-center gap-3 mt-0.5">
              <h1 className="text-xl font-bold text-gray-900">
                {isNew ? 'New Program' : (prog.program_nickname || `Program #${id}`)}
              </h1>
              {prog.class_status_name && <Badge status={prog.class_status_name} />}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4 pb-32">
          {/* Section 1: General Info */}
          <Section title="General Info" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Program Nickname" {...register('program_nickname')} />
              <Select label="Status" {...register('class_status_id')}>
                <option value="">Select status…</option>
                {(ref.classStatuses || []).map(s => (
                  <option key={s.id} value={s.id}>{s.class_status_name}</option>
                ))}
              </Select>
              <SearchSelect
                label="Location"
                value={watch('location_id')}
                onChange={v => setValue('location_id', v, { shouldDirty: true })}
                options={locations}
                displayKey="nickname"
                valueKey="id"
                placeholder="Search locations…"
              />
              <Select label="Lead Professor" {...register('lead_professor_id')}>
                <option value="">None</option>
                {professors.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>
                ))}
              </Select>
              <Select label="Assistant Professor" {...register('assistant_professor_id')}>
                <option value="">None</option>
                {professors.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>
                ))}
              </Select>
              <div className="col-span-2">
                <Input label="General Notes" {...register('general_notes')} />
              </div>
            </div>
          </Section>

          {/* Section 2: Schedule */}
          <Section title="Schedule" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Start Time" type="time" {...register('start_time')} />
              <Input label="Class Length (minutes)" type="number" {...register('class_length_minutes')} />
              <Input label="First Session Date" type="date" {...register('first_session_date')} />
              <Input label="Last Session Date" type="date" {...register('last_session_date')} />
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-700 block mb-2">Day of Week</label>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAY_KEYS.map((key, i) => (
                    <Toggle
                      key={key}
                      label={WEEKDAYS[i]}
                      checked={!!watch(key)}
                      onChange={v => setValue(key, v ? 1 : 0, { shouldDirty: true })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* Roster */}
          {!isNew && (
            <Section title={`Roster (${(prog.roster || []).length}${prog.maximum_students ? ' / ' + prog.maximum_students : ''} students)`} defaultOpen={true}>
              <RosterPanel
                programId={id}
                roster={prog.roster || []}
                maxStudents={prog.maximum_students}
              />
            </Section>
          )}

          {/* Section 3: Enrollment */}
          <Section title="Enrollment & Pricing">
            <div className="grid grid-cols-3 gap-4">
              <Input label="Min Students" type="number" {...register('minimum_students')} />
              <Input label="Max Students" type="number" {...register('maximum_students')} />
              <Input label="Enrolled" type="number" {...register('number_enrolled')} />
              <Input label="Parent Cost" type="number" step="0.01" {...register('parent_cost')} />
              <Input label="Lab Fee" type="number" step="0.01" {...register('lab_fee')} />
              <Toggle
                label="Payment Through Us"
                checked={!!watch('payment_through_us')}
                onChange={v => setValue('payment_through_us', v ? 1 : 0, { shouldDirty: true })}
              />
            </div>
          </Section>

          {/* Section 4: Professor Pay */}
          <Section title="Professor Pay">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Lead Professor Pay" type="number" step="0.01" {...register('lead_professor_pay')} />
              <Input label="Lead Drive Fee" type="number" step="0.01" {...register('lead_professor_drive_fee')} />
              <Toggle
                label="Assistant Required"
                checked={!!watch('assistant_required')}
                onChange={v => setValue('assistant_required', v ? 1 : 0, { shouldDirty: true })}
              />
              <Input label="Assistant Pay" type="number" step="0.01" {...register('assistant_professor_pay')} />
              <Input label="Assistant Drive Fee" type="number" step="0.01" {...register('assistant_professor_drive_fee')} />
            </div>
          </Section>

          {/* Section 5: Compliance */}
          <Section title="Compliance Requirements">
            <div className="grid grid-cols-3 gap-4">
              <Toggle
                label="TB Required"
                checked={!!watch('tb_required')}
                onChange={v => setValue('tb_required', v ? 1 : 0, { shouldDirty: true })}
              />
              <Toggle
                label="Livescan Required"
                checked={!!watch('livescan_required')}
                onChange={v => setValue('livescan_required', v ? 1 : 0, { shouldDirty: true })}
              />
              <Toggle
                label="Virtus Required"
                checked={!!watch('virtus_required')}
                onChange={v => setValue('virtus_required', v ? 1 : 0, { shouldDirty: true })}
              />
            </div>
          </Section>

          {/* Section 6: Demo */}
          <Section title="Demo">
            <div className="grid grid-cols-2 gap-4">
              <Toggle
                label="Demo Required"
                checked={!!watch('demo_required')}
                onChange={v => setValue('demo_required', v ? 1 : 0, { shouldDirty: true })}
              />
              <Select label="Demo Type" {...register('demo_type_id')}>
                <option value="">None</option>
                {(ref.demoTypes || []).map(t => (
                  <option key={t.id} value={t.id}>{t.demo_type_name}</option>
                ))}
              </Select>
              <Input label="Demo Date" type="date" {...register('demo_date')} />
              <Input label="Demo Start Time" type="time" {...register('demo_start_time')} />
              <Input label="Demo End Time" type="time" {...register('demo_end_time')} />
              <Input label="Demo Pay" type="number" step="0.01" {...register('demo_pay')} />
              <Select label="Demo Professor" {...register('demo_professor_id')}>
                <option value="">None</option>
                {professors.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>
                ))}
              </Select>
              <div className="col-span-2">
                <Input label="Demo Notes" {...register('demo_notes')} />
              </div>
            </div>
          </Section>

          {/* Section 7: Flyer & Marketing */}
          <Section title="Flyer & Marketing">
            <div className="grid grid-cols-2 gap-4">
              <Toggle
                label="Flyer Required"
                checked={!!watch('flyer_required')}
                onChange={v => setValue('flyer_required', v ? 1 : 0, { shouldDirty: true })}
              />
              <Toggle
                label="Flyer Made"
                checked={!!watch('flyer_made')}
                onChange={v => setValue('flyer_made', v ? 1 : 0, { shouldDirty: true })}
              />
              <Toggle
                label="Flyer Sent Electronic"
                checked={!!watch('flyer_sent_electronic')}
                onChange={v => setValue('flyer_sent_electronic', v ? 1 : 0, { shouldDirty: true })}
              />
              <Toggle
                label="Flyer Dropped Physical"
                checked={!!watch('flyer_dropped_physical')}
                onChange={v => setValue('flyer_dropped_physical', v ? 1 : 0, { shouldDirty: true })}
              />
              <Toggle
                label="Registration Opened Online"
                checked={!!watch('registration_opened_online')}
                onChange={v => setValue('registration_opened_online', v ? 1 : 0, { shouldDirty: true })}
              />
            </div>
          </Section>

          {/* Section 9: Sessions */}
          {prog.sessions && prog.sessions.length > 0 && (
            <Section title={`Sessions (${prog.sessions.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">#</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Professor</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Lesson</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {prog.sessions.map((s, idx) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2">{s.session_date ? formatDate(s.session_date) : '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{s.session_time ? formatTime(s.session_time) : '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{s.professor_nickname || '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{s.lesson_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && (
            <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>
          )}
          {mutation.isSuccess && <p className="text-sm text-green-600">Saved successfully</p>}
          <div className="ml-auto flex gap-3">
            <Link to="/programs" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
