import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getLocation, createLocation, updateLocation } from '../api/locations';
import { useGeneralData } from '../hooks/useReferenceData';
import { toFormData } from '../lib/utils';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

export default function LocationDetailPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: locData, isLoading } = useQuery({
    queryKey: ['locations', id],
    queryFn: () => getLocation(id),
    enabled: !isNew,
  });

  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm();

  useEffect(() => {
    if (locData?.data) reset(toFormData(locData.data));
  }, [locData]);

  const mutation = useMutation({
    mutationFn: (data) => isNew ? createLocation(data) : updateLocation(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['locations']);
      if (isNew && res?.id) navigate(`/locations/${res.id}`);
    },
  });

  const loc = locData?.data || {};

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
            <Link to="/locations" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Locations</Link>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">
              {isNew ? 'New Location' : (loc.nickname || loc.school_name || `Location #${id}`)}
            </h1>
          </div>
        </div>

        <div className="p-6 space-y-4 pb-32">
          {/* Section 1: General Info */}
          <Section title="General Info" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Nickname" {...register('nickname')} />
              <Input label="School Name" {...register('school_name')} />
              <Select label="Location Type" {...register('location_type_id')}>
                <option value="">Select type…</option>
                {(ref.locationTypes || []).map(t => (
                  <option key={t.id} value={t.id}>{t.location_type_name}</option>
                ))}
              </Select>
              <Select label="Geographic Area" {...register('geographic_area_id_online')}>
                <option value="">Select area…</option>
                {(ref.areas || []).map(a => (
                  <option key={a.id} value={a.id}>{a.geographic_area_name}</option>
                ))}
              </Select>
              <Input label="Address" {...register('address')} className="col-span-2" />
              <Select label="City" {...register('city_id')}>
                <option value="">Select city…</option>
                {(ref.cities || []).map(c => (
                  <option key={c.id} value={c.id}>{c.city_name}</option>
                ))}
              </Select>
              <Input label="Location Phone" {...register('location_phone')} />
              <Select label="Contractor" {...register('contractor_id')}>
                <option value="">None</option>
                {(ref.contractors || []).map(c => (
                  <option key={c.id} value={c.id}>{c.contractor_name}</option>
                ))}
              </Select>
              <Toggle
                label="Active"
                checked={!!watch('active')}
                onChange={v => setValue('active', v ? 1 : 0, { shouldDirty: true })}
              />
            </div>
          </Section>

          {/* Section 2: Point of Contact */}
          <Section title="Point of Contact">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Point of Contact" {...register('point_of_contact')} />
              <Select label="Title" {...register('poc_title_id')}>
                <option value="">Select title…</option>
                {(ref.pocTitles || []).map(t => (
                  <option key={t.id} value={t.id}>{t.poc_title_name}</option>
                ))}
              </Select>
              <Input label="POC Phone" {...register('poc_phone')} />
              <Input label="POC Email" type="email" {...register('poc_email')} />
            </div>
          </Section>

          {/* Section 3: Compliance */}
          <Section title="Compliance Requirements" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Toggle
                label="Virtus Required"
                checked={!!watch('virtus_required')}
                onChange={v => setValue('virtus_required', v ? 1 : 0, { shouldDirty: true })}
              />
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
              <div className="col-span-2">
                <Input label="Livescan Info" {...register('livescan_info')} />
              </div>
              <Toggle
                label="Contract/Permit Required"
                checked={!!watch('contract_permit_required')}
                onChange={v => setValue('contract_permit_required', v ? 1 : 0, { shouldDirty: true })}
              />
              <div className="col-span-2">
                <Input label="Contract/Permit Notes" {...register('contract_permit_notes')} />
              </div>
            </div>
          </Section>

          {/* Section 4: Program Settings */}
          <Section title="Program Settings">
            <div className="grid grid-cols-2 gap-4">
              <Select label="Class Pricing Type" {...register('class_pricing_type_id')}>
                <option value="">Select…</option>
                {(ref.classPricingTypes || []).map(t => (
                  <option key={t.id} value={t.id}>{t.class_pricing_type_name}</option>
                ))}
              </Select>
              <Input label="Location Enrollment" type="number" {...register('location_enrollment')} />
              <Toggle
                label="Payment Through Us"
                checked={!!watch('payment_through_us')}
                onChange={v => setValue('payment_through_us', v ? 1 : 0, { shouldDirty: true })}
              />
              <Toggle
                label="Demo Allowed"
                checked={!!watch('demo_allowed')}
                onChange={v => setValue('demo_allowed', v ? 1 : 0, { shouldDirty: true })}
              />
              <Select label="Demo Type" {...register('demo_type_id')}>
                <option value="">None</option>
                {(ref.demoTypes || []).map(t => (
                  <option key={t.id} value={t.id}>{t.demo_type_name}</option>
                ))}
              </Select>
              <Input label="Demo Pay" type="number" step="0.01" {...register('demo_pay')} />
              <div className="col-span-2">
                <Input label="Demo Notes" {...register('demo_notes')} />
              </div>
            </div>
          </Section>

          {/* Section 5: Flyer & Registration */}
          <Section title="Flyer & Registration">
            <div className="grid grid-cols-2 gap-4">
              <Toggle
                label="Flyer Required"
                checked={!!watch('flyer_required')}
                onChange={v => setValue('flyer_required', v ? 1 : 0, { shouldDirty: true })}
              />
              <Toggle
                label="Custom Flyer Required"
                checked={!!watch('custom_flyer_required')}
                onChange={v => setValue('custom_flyer_required', v ? 1 : 0, { shouldDirty: true })}
              />
              <Input label="Flyer Quantity" type="number" {...register('flyer_quantity')} />
              <div className="col-span-2">
                <Input label="Registration Link for Flyer" {...register('registration_link_for_flyer')} />
              </div>
            </div>
          </Section>

          {/* Section 6: Logistics */}
          <Section title="Logistics & Notes">
            <div className="grid grid-cols-2 gap-4">
              <Select label="Parking Difficulty" {...register('parking_difficulty_id')}>
                <option value="">Select…</option>
                {(ref.parkingDifficulties || []).map(p => (
                  <option key={p.id} value={p.id}>{p.parking_difficulty_name}</option>
                ))}
              </Select>
              <div className="col-span-2">
                <Input label="Parking Information" {...register('parking_information')} />
              </div>
              <div className="col-span-2">
                <Input label="School Procedure Info" {...register('school_procedure_Info')} />
              </div>
              <Toggle
                label="Jewish Calendar"
                checked={!!watch('jewish')}
                onChange={v => setValue('jewish', v ? 1 : 0, { shouldDirty: true })}
              />
              <Toggle
                label="Observes Allowed"
                checked={!!watch('observes_allowed')}
                onChange={v => setValue('observes_allowed', v ? 1 : 0, { shouldDirty: true })}
              />
              <Input label="Number of Weeks" type="number" {...register('number_of_weeks')} />
              <div className="col-span-2">
                <Input label="School Calendar Link" {...register('school_calendar_link')} />
              </div>
              <div className="col-span-2">
                <Input label="Invoicing Notes" {...register('invoicing_notes')} />
              </div>
              <div className="col-span-2">
                <Input label="Internal Notes" {...register('internal_notes')} />
              </div>
            </div>
          </Section>

          {/* Section 7: Class Types */}
          {loc.classTypes && loc.classTypes.length > 0 && (
            <Section title="Default Class Types">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Class Type</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Lab Fee Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loc.classTypes.map(ct => (
                    <tr key={ct.id}>
                      <td className="px-3 py-2">{ct.class_type_name || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{ct.lab_fee_type_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <Link to="/locations" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
