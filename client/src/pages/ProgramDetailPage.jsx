import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getProgram, createProgram, updateProgram } from '../api/programs';
import { useGeneralData, useProfessorList, useLocationList, useLessons } from '../hooks/useReferenceData';
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
import { SessionsPanel } from '../components/SessionsPanel';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { formatDate, formatTime, formatCurrency, toFormData } from '../lib/utils';
import { WEEKDAY_KEYS, WEEKDAYS } from '../lib/constants';

export default function ProgramDetailPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
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
  const { data: lessonsData } = useLessons();
  const ref = refData?.data || {};
  const professors = professorListData?.data || [];
  const locations = locationListData?.data || [];
  const lessons = lessonsData?.data || [];

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty } } = useForm();

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
      <UnsavedChangesModal when={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link to="/programs" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Programs</Link>
              <div className="flex items-center gap-3 mt-0.5">
                <h1 className="text-xl font-bold text-gray-900">
                  {isNew ? 'New Program' : (prog.program_nickname || `Program #${id}`)}
                </h1>
                {prog.class_status_name && <Badge status={prog.class_status_name} />}
                {prog.location_retained ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Retained Client</span>
                ) : null}
              </div>
            </div>
          </div>
          {!isNew && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-gray-500">
              {prog.payment_through_us ? <span className="text-green-600 font-medium">Payment Through Us</span> : null}
              {prog.registration_opened_online ? <span className="text-green-600 font-medium">Registration Opened</span> : null}
            </div>
          )}
        </div>

        <div className="p-6 space-y-4 pb-32">
          {/* General Info + Professors + Pay */}
          <Section title="General Info" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Program Nickname" {...register('program_nickname')} />
              <Select label="Status" {...register('class_status_id')}>
                <option value="">Select status…</option>
                {(ref.classStatuses || []).filter(s => !isNew || !s.class_status_name.startsWith('Cancelled')).map(s => (
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
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4">
              <Select label="Lead Professor" {...register('lead_professor_id')}>
                <option value="">None</option>
                {professors.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>
                ))}
              </Select>
              <Input label="Lead Pay" type="number" step="0.01" prefix="$" {...register('lead_professor_pay')} />
              <Select label="Assistant Professor" {...register('assistant_professor_id')}>
                <option value="">None</option>
                {professors.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>
                ))}
              </Select>
              <Input label="Assist Pay" type="number" step="0.01" prefix="$" {...register('assistant_professor_pay')} />
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4">
              <Input label="Parent Cost" type="number" step="0.01" prefix="$" {...register('parent_cost')} />
              <Input label="Lab Fee" type="number" step="0.01" prefix="$" {...register('lab_fee')} />
              <Input label="Our Cut" type="number" step="0.01" prefix="$" {...register('our_cut')} />
              {(() => {
                const ourCut = parseFloat(watch('our_cut')) || 0;
                const billable = (prog.sessions || []).filter(s => !s.not_billed);
                const perSession = billable.length > 0 && ourCut > 0 ? ourCut / billable.length : null;
                const totalProfPay = billable.reduce((sum, s) => sum + (parseFloat(s.professor_pay) || 0) + (parseFloat(s.assistant_pay) || 0), 0);
                const mismatch = ourCut > 0 && totalProfPay > 0 && totalProfPay > ourCut;
                return (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">Per Session</label>
                    <span className="text-sm text-gray-500 py-1.5 px-3 bg-gray-50 rounded border border-gray-200">
                      {perSession ? formatCurrency(perSession) : '—'}
                      <span className="text-gray-400 text-xs ml-1">({billable.length} billable)</span>
                    </span>
                    {mismatch && (
                      <p className="text-xs text-amber-600">Total professor pay ({formatCurrency(totalProfPay)}) exceeds our cut ({formatCurrency(ourCut)})</p>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4">
              <Toggle label="Payment Through Us" checked={!!watch('payment_through_us')} onChange={v => setValue('payment_through_us', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Registration Opened" checked={!!watch('registration_opened_online')} onChange={v => setValue('registration_opened_online', v ? 1 : 0, { shouldDirty: true })} />
            </div>
            <div className="col-span-full mt-4">
              <Input label="General Notes" {...register('general_notes')} />
            </div>
          </Section>

          {/* Schedule */}
          <Section title="Schedule" defaultOpen={true}>
            <div className="grid grid-cols-4 gap-4">
              <Input label="Start Time" type="time" {...register('start_time')} />
              <Input label="Class Length (minutes)" type="number" {...register('class_length_minutes')} />
              {prog.first_session_date && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">First Session</label>
                  <span className="text-sm text-gray-600 py-1.5">{formatDate(prog.first_session_date)}</span>
                </div>
              )}
              {prog.last_session_date && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">Last Session</label>
                  <span className="text-sm text-gray-600 py-1.5">{formatDate(prog.last_session_date)}</span>
                </div>
              )}
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium text-gray-700 block mb-2">Day of Week</label>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_KEYS.map((key, i) => (
                  <Toggle key={key} label={WEEKDAYS[i]} checked={!!watch(key)} onChange={v => setValue(key, v ? 1 : 0, { shouldDirty: true })} />
                ))}
              </div>
            </div>
          </Section>

          {/* Sessions */}
          {!isNew && (
            <Section title={`Sessions (${(prog.sessions || []).length})`} defaultOpen={true}>
              <SessionsPanel
                programId={id}
                sessions={prog.sessions || []}
                professors={professors}
                lessons={lessons}
                programClassId={prog.class_id}
                defaultTime={prog.start_time}
                program={prog}
              />
            </Section>
          )}

          {/* Roster — now includes enrollment info */}
          {!isNew && (
            <Section title={`Roster (${(prog.roster || []).filter(r => !r.date_dropped).length}${prog.maximum_students ? ' / ' + prog.maximum_students : ''} students)`} defaultOpen={true}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Input label="Min Students" type="number" {...register('minimum_students')} />
                <Input label="Max Students" type="number" {...register('maximum_students')} />
              </div>
              <RosterPanel
                programId={id}
                roster={prog.roster || []}
                maxStudents={watch('maximum_students') || prog.maximum_students}
              />
            </Section>
          )}

          {/* Compliance */}
          <Section title="Compliance Requirements">
            <div className="grid grid-cols-3 gap-4">
              <Toggle label="TB Required" checked={!!watch('tb_required')} onChange={v => setValue('tb_required', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Livescan Required" checked={!!watch('livescan_required')} onChange={v => setValue('livescan_required', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Virtus Required" checked={!!watch('virtus_required')} onChange={v => setValue('virtus_required', v ? 1 : 0, { shouldDirty: true })} />
            </div>
          </Section>

          {/* Demo — toggle inline, fields show when enabled */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
              <span className="font-semibold text-sm text-gray-800">Demo</span>
              <Toggle label="Demo Required" checked={!!watch('demo_required')} onChange={v => setValue('demo_required', v ? 1 : 0, { shouldDirty: true })} />
            </div>
            {!!watch('demo_required') && (
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <Select label="Demo Type" {...register('demo_type_id')}>
                    <option value="">None</option>
                    {(ref.demoTypes || []).map(t => (
                      <option key={t.id} value={t.id}>{t.demo_type_name}</option>
                    ))}
                  </Select>
                  <Select label="Demo Professor" {...register('demo_professor_id')}>
                    <option value="">None</option>
                    {professors.map(p => (
                      <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>
                    ))}
                  </Select>
                  <Input label="Demo Date" type="date" {...register('demo_date')} />
                  <Input label="Demo Start Time" type="time" {...register('demo_start_time')} />
                  <Input label="Demo End Time" type="time" {...register('demo_end_time')} />
                  <Input label="Demo Pay" type="number" step="0.01" prefix="$" {...register('demo_pay')} />
                  <div className="col-span-2">
                    <Input label="Demo Notes" {...register('demo_notes')} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Flyer & Marketing */}
          <Section title="Flyer & Marketing">
            <div className="grid grid-cols-2 gap-4">
              <Toggle label="Flyer Required" checked={!!watch('flyer_required')} onChange={v => setValue('flyer_required', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Flyer Made" checked={!!watch('flyer_made')} onChange={v => setValue('flyer_made', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Flyer Sent Electronic" checked={!!watch('flyer_sent_electronic')} onChange={v => setValue('flyer_sent_electronic', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Flyer Dropped Physical" checked={!!watch('flyer_dropped_physical')} onChange={v => setValue('flyer_dropped_physical', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Registration Opened Online" checked={!!watch('registration_opened_online')} onChange={v => setValue('registration_opened_online', v ? 1 : 0, { shouldDirty: true })} />
            </div>
          </Section>
        </div>

        {/* Sticky Footer */}
        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>}
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
