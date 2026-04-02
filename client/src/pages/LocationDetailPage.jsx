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
import { Badge } from '../components/ui/Badge';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';

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

  // Client manager users
  const { data: cmUsersData } = useQuery({
    queryKey: ['users-cm'],
    queryFn: () => fetch('http://localhost:3002/api/users?role=Client+Manager&limit=100', { credentials: 'include' }).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const cmUsers = cmUsersData?.data || [];

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty } } = useForm();

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
      <UnsavedChangesModal when={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <Link to="/locations" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Locations</Link>
          <div className="flex items-center gap-3 mt-0.5">
            <h1 className="text-xl font-bold text-gray-900">
              {isNew ? 'New Location' : (loc.nickname || loc.school_name || `Location #${id}`)}
            </h1>
            {loc.retained ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Retained</span> : null}
          </div>
        </div>

        <div className="p-6 space-y-4 pb-32">
          {/* General Info */}
          <Section title="General Info" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Nickname" {...register('nickname')} />
              <Input label="School Name" {...register('school_name')} />
              <Select label="Location Type" {...register('location_type_id')}>
                <option value="">Select type…</option>
                {(ref.locationTypes || []).map(t => <option key={t.id} value={t.id}>{t.location_type_name}</option>)}
              </Select>
              <div className="col-span-2">
                <Input label="Address" {...register('address')} />
              </div>
              <Input label="City" {...register('city_name_text')} placeholder="City name" defaultValue={loc.city_name || ''} />
              <Input label="Zip Code" {...register('zip_code_text')} placeholder="Zip code" defaultValue={loc.zip_code || ''} />
              <Input label="Location Phone" {...register('location_phone')} />
              <Select label="Geographic Area" {...register('geographic_area_id_online')}>
                <option value="">Select area…</option>
                {(ref.areas || []).map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
              </Select>
              <Select label="Client Manager" {...register('client_manager_user_id')}>
                <option value="">Inherited from area</option>
                {cmUsers.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </Select>
              <Select label="Contractor" {...register('contractor_id')}>
                <option value="">None</option>
                {(ref.contractors || []).map(c => <option key={c.id} value={c.id}>{c.contractor_name}</option>)}
              </Select>
              <Toggle label="Retained Client" checked={!!watch('retained')} onChange={v => setValue('retained', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Active" checked={watch('active') !== 0 && watch('active') !== '0'} onChange={v => setValue('active', v ? 1 : 0, { shouldDirty: true })} />
            </div>
          </Section>

          {/* Point of Contact */}
          <Section title="Point of Contact" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Contact Name" {...register('point_of_contact')} />
              <Input label="Title" {...register('poc_title')} />
              <Input label="Phone" {...register('poc_phone')} />
              <Input label="Email" type="email" {...register('poc_email')} />
            </div>
          </Section>

          {/* Site Coordinator */}
          <Section title="Site Coordinator" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Name" {...register('site_coordinator_name')} />
              <Input label="Role" {...register('site_coordinator_role')} placeholder="e.g. After-School Director" />
              <Input label="Phone" {...register('site_coordinator_phone')} />
              <Input label="Email" type="email" {...register('site_coordinator_email')} />
            </div>
          </Section>

          {/* Compliance */}
          <Section title="Compliance Requirements" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-4">
              <Toggle label="Virtus Required" checked={!!watch('virtus_required')} onChange={v => setValue('virtus_required', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="TB Required" checked={!!watch('tb_required')} onChange={v => setValue('tb_required', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Livescan Required" checked={!!watch('livescan_required')} onChange={v => setValue('livescan_required', v ? 1 : 0, { shouldDirty: true })} />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Input label="Livescan Info" {...register('livescan_info')} />
              <Toggle label="Contract/Permit Required" checked={!!watch('contract_permit_required')} onChange={v => setValue('contract_permit_required', v ? 1 : 0, { shouldDirty: true })} />
              <div className="col-span-2">
                <Input label="Contract/Permit Notes" {...register('contract_permit_notes')} />
              </div>
            </div>
          </Section>

          {/* Program Settings */}
          <Section title="Program Settings">
            <div className="grid grid-cols-3 gap-4">
              <Select label="Class Pricing Type" {...register('class_pricing_type_id')}>
                <option value="">Select…</option>
                {(ref.classPricingTypes || []).map(t => <option key={t.id} value={t.id}>{t.class_pricing_type_name}</option>)}
              </Select>
              <Input label="Location Enrollment" type="number" {...register('location_enrollment')} />
              <Toggle label="Payment Through Us" checked={!!watch('payment_through_us')} onChange={v => setValue('payment_through_us', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Demo Allowed" checked={!!watch('demo_allowed')} onChange={v => setValue('demo_allowed', v ? 1 : 0, { shouldDirty: true })} />
              <Select label="Demo Type" {...register('demo_type_id')}>
                <option value="">None</option>
                {(ref.demoTypes || []).map(t => <option key={t.id} value={t.id}>{t.demo_type_name}</option>)}
              </Select>
              <Input label="Demo Pay" type="number" step="0.01" prefix="$" {...register('demo_pay')} />
              <div className="col-span-3">
                <Input label="Demo Notes" {...register('demo_notes')} />
              </div>
            </div>
          </Section>

          {/* Invoicing */}
          <Section title="Invoicing" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-4">
              <Toggle label="Invoice at District Level" checked={!!watch('invoice_at_district')} onChange={v => setValue('invoice_at_district', v ? 1 : 0, { shouldDirty: true })} />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <Input label="Invoice Contact Name" {...register('invoice_contact_name')} />
              <Input label="Invoice Contact Email" type="email" {...register('invoice_contact_email')} />
              <Input label="Invoice Contact Phone" {...register('invoice_contact_phone')} />
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-gray-700 block mb-1">Invoicing Notes</label>
              <textarea {...register('invoicing_notes')} rows={3}
                className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
          </Section>

          {/* Flyer & Registration */}
          <Section title="Flyer & Registration">
            <div className="grid grid-cols-2 gap-4">
              <Toggle label="Flyer Required" checked={!!watch('flyer_required')} onChange={v => setValue('flyer_required', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Custom Flyer Required" checked={!!watch('custom_flyer_required')} onChange={v => setValue('custom_flyer_required', v ? 1 : 0, { shouldDirty: true })} />
              <Input label="Flyer Quantity" type="number" {...register('flyer_quantity')} />
              <div className="col-span-2">
                <Input label="Registration Link for Flyer" {...register('registration_link_for_flyer')} />
              </div>
            </div>
          </Section>

          {/* Logistics */}
          <Section title="Logistics & Notes">
            <div className="grid grid-cols-2 gap-4">
              <Select label="Parking Difficulty" {...register('parking_difficulty_id')}>
                <option value="">Select…</option>
                {(ref.parkingDifficulties || []).map(p => <option key={p.id} value={p.id}>{p.parking_difficulty_name}</option>)}
              </Select>
              <Input label="Number of Weeks" type="number" {...register('number_of_weeks')} />
              <div className="col-span-2"><Input label="Parking Information" {...register('parking_information')} /></div>
              <div className="col-span-2"><Input label="School Procedure Info" {...register('school_procedure_Info')} /></div>
              <div className="col-span-2"><Input label="School Calendar Link" {...register('school_calendar_link')} /></div>
              <Toggle label="Jewish Calendar" checked={!!watch('jewish')} onChange={v => setValue('jewish', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Set Dates Ourselves" checked={!!watch('set_dates_ourselves')} onChange={v => setValue('set_dates_ourselves', v ? 1 : 0, { shouldDirty: true })} />
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-700 block mb-1">Internal Notes</label>
                <textarea {...register('internal_notes')} rows={3}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
            </div>
          </Section>

          {/* Class Types */}
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

        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>}
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
