import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getProfessor, createProfessor, updateProfessor, createLivescan, updateLivescan, deleteLivescan } from '../api/professors';
import { useGeneralData, useLocationList } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { SearchSelect } from '../components/ui/SearchSelect';
import { Spinner } from '../components/ui/Spinner';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { TRAINING_FIELDS } from '../lib/constants';
import { formatDate, formatTime, toFormData } from '../lib/utils';

function LivescanForm({ form, setForm, contractors, locations, onSave, onCancel, isPending }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const contractorOptions = contractors.map(c => ({ id: String(c.id), label: c.contractor_name }));
  const locationOptions = locations.map(l => ({ id: String(l.id), label: l.nickname }));

  return (
    <div className="border border-gray-200 rounded-md p-3 bg-gray-50 space-y-3">
      {/* Contractor vs Location toggle */}
      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={form.lsType === 'contractor'} onChange={() => set('lsType', 'contractor')} className="accent-[#1e3a5f]" />
          Contractor
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={form.lsType === 'location'} onChange={() => set('lsType', 'location')} className="accent-[#1e3a5f]" />
          Specific Location
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {form.lsType === 'contractor' ? (
          <SearchSelect
            label="Contractor" required
            options={contractorOptions} displayKey="label" valueKey="id"
            value={form.contractorId} onChange={v => set('contractorId', v)}
            placeholder="Search contractors…"
          />
        ) : (
          <SearchSelect
            label="Location" required
            options={locationOptions} displayKey="label" valueKey="id"
            value={form.locationId} onChange={v => set('locationId', v)}
            placeholder="Search locations…"
          />
        )}
        <Input label="Date" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        <div className="flex items-end pb-1">
          <Toggle label="Pass" checked={form.pass} onChange={v => set('pass', v)} />
        </div>
        <Input label="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
        <div className="col-span-2">
          <Input label="Livescan Link" value={form.link} onChange={e => set('link', e.target.value)} />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
        <Button type="button" onClick={onSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export default function ProfessorDetailPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: profData, isLoading } = useQuery({
    queryKey: ['professors', id],
    queryFn: () => getProfessor(id),
    enabled: !isNew,
  });
  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};
  const { data: locationListData } = useLocationList();
  const locationList = locationListData?.data || [];

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

  const emptyLsForm = () => ({ lsType: 'contractor', contractorId: '', locationId: '', date: '', pass: true, notes: '', link: '' });
  const [lsAdding, setLsAdding] = useState(false);
  const [lsEdit, setLsEdit] = useState(null); // ls.id being edited
  const [lsForm, setLsForm] = useState(emptyLsForm());

  const lsCreate = useMutation({
    mutationFn: (data) => createLivescan(id, data),
    onSuccess: () => { qc.invalidateQueries(['professors', id]); setLsAdding(false); setLsForm(emptyLsForm()); },
    onError: (e) => alert('Save failed: ' + (e?.response?.data?.error || e.message)),
  });
  const lsUpdate = useMutation({
    mutationFn: ({ lsId, data }) => updateLivescan(id, lsId, data),
    onSuccess: () => { qc.invalidateQueries(['professors', id]); setLsEdit(null); setLsForm(emptyLsForm()); },
    onError: (e) => alert('Save failed: ' + (e?.response?.data?.error || e.message)),
  });
  const lsDelete = useMutation({
    mutationFn: (lsId) => deleteLivescan(id, lsId),
    onSuccess: () => qc.invalidateQueries(['professors', id]),
    onError: (e) => alert('Delete failed: ' + (e?.response?.data?.error || e.message)),
  });

  const startLsEdit = (ls) => {
    setLsEdit(ls.id);
    setLsAdding(false);
    setLsForm({
      lsType: ls.contractor_id ? 'contractor' : 'location',
      contractorId: ls.contractor_id ? String(ls.contractor_id) : '',
      locationId: ls.location_id ? String(ls.location_id) : '',
      date: ls.livescan_date ? ls.livescan_date.split('T')[0] : '',
      pass: !!ls.pass,
      notes: ls.notes || '',
      link: ls.livescan_link || '',
    });
  };

  const lsFormToPayload = () => ({
    contractor_id: lsForm.lsType === 'contractor' ? lsForm.contractorId || null : null,
    location_id: lsForm.lsType === 'location' ? lsForm.locationId || null : null,
    livescan_date: lsForm.date || null,
    livescan_link: lsForm.link || null,
    notes: lsForm.notes || null,
    pass: lsForm.pass ? 1 : 0,
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
            {/* Livescans */}
            {!isNew && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700">Livescans</span>
                  {!lsAdding && lsEdit === null && (
                    <button type="button" onClick={() => { setLsAdding(true); setLsForm(emptyLsForm()); }}
                      className="text-xs text-[#1e3a5f] hover:underline">+ Add</button>
                  )}
                </div>

                <div className="space-y-1">
                  {(prof.livescans || []).map(ls => (
                    <div key={ls.id}>
                      {lsEdit === ls.id ? (
                        <LivescanForm
                          form={lsForm} setForm={setLsForm}
                          contractors={ref.contractors || []} locations={locationList}
                          onSave={() => lsUpdate.mutate({ lsId: ls.id, data: lsFormToPayload() })}
                          onCancel={() => { setLsEdit(null); setLsForm(emptyLsForm()); }}
                          isPending={lsUpdate.isPending}
                        />
                      ) : (
                        <div className="text-sm text-gray-600 flex gap-3 items-center py-0.5">
                          <span className="flex-1 truncate">{ls.display_name || ls.location_nickname || ls.contractor_name || 'Unknown'}</span>
                          <span className="text-gray-500 shrink-0">{ls.livescan_date ? formatDate(ls.livescan_date) : '—'}</span>
                          <span className={`shrink-0 ${ls.pass ? 'text-green-600' : 'text-red-500'}`}>{ls.pass ? 'Pass' : 'Fail'}</span>
                          <button type="button" onClick={() => startLsEdit(ls)}
                            className="text-xs text-gray-400 hover:text-[#1e3a5f] shrink-0">Edit</button>
                          <button type="button" onClick={() => { if (confirm('Delete this livescan?')) lsDelete.mutate(ls.id); }}
                            className="text-xs text-gray-400 hover:text-red-500 shrink-0">Delete</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {prof.livescans?.length === 0 && lsEdit === null && !lsAdding && (
                    <p className="text-sm text-gray-400">No livescans on file</p>
                  )}
                </div>

                {lsAdding && (
                  <div className="mt-2">
                    <LivescanForm
                      form={lsForm} setForm={setLsForm}
                      contractors={ref.contractors || []} locations={locationList}
                      onSave={() => lsCreate.mutate(lsFormToPayload())}
                      onCancel={() => { setLsAdding(false); setLsForm(emptyLsForm()); }}
                      isPending={lsCreate.isPending}
                    />
                  </div>
                )}
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

          {/* Upcoming Sessions Preview */}
          {prof.upcomingSessions && prof.upcomingSessions.length > 0 && (
            <Section title={`Upcoming Sessions (${prof.upcomingSessions.length})`} defaultOpen={true}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Time</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {prof.upcomingSessions.map((s, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{s.session_date ? formatDate(s.session_date) : '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{s.session_time ? formatTime(s.session_time) : '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{s.program_nickname}</td>
                      <td className="px-3 py-2 text-gray-500">{s.location_nickname || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link to={`/schedule/${id}`} className="text-xs text-[#1e3a5f] hover:underline mt-2 inline-block">View full schedule →</Link>
            </Section>
          )}

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
