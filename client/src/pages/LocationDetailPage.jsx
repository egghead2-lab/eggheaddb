import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getLocation, createLocation, updateLocation } from '../api/locations';
import { updateProgram } from '../api/programs';
import { useGeneralData } from '../hooks/useReferenceData';
import api from '../api/client';
import { toFormData, formatDate } from '../lib/utils';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { AuditHistory } from '../components/AuditHistory';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';

export default function LocationDetailPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
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
    queryFn: () => api.get('/users?role=Client+Manager&limit=100').then(r => r.data),
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
              {!isNew && <Toggle label="Active" checked={watch('active') !== 0 && watch('active') !== '0'} onChange={v => setValue('active', v ? 1 : 0, { shouldDirty: true })} />}
              <div className="col-span-3">
                <label className="text-xs font-medium text-gray-700 block mb-1">Internal Notes</label>
                <textarea {...register('internal_notes')} rows={2}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
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
              <Input label="Number of Weeks" type="number" {...register('number_of_weeks')} />
              <div className="col-span-2"><Input label="School Calendar Link" {...register('school_calendar_link')} /></div>
              <Toggle label="Jewish Calendar" checked={!!watch('jewish')} onChange={v => setValue('jewish', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Set Dates Ourselves" checked={!!watch('set_dates_ourselves')} onChange={v => setValue('set_dates_ourselves', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Observes Allowed" checked={!!watch('observes_allowed')} onChange={v => setValue('observes_allowed', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="TBD" checked={!!watch('tbd')} onChange={v => setValue('tbd', v ? 1 : 0, { shouldDirty: true })} />
              {watch('tbd') && watch('tbd') !== '0' && watch('tbd') !== 0 ? <div className="col-span-2"><Input label="TBD Notes" {...register('tbd_notes')} /></div> : null}
            </div>
          </Section>

          {/* School Cut */}
          {!isNew && loc.cutTypes && loc.cutTypes.length > 0 && (
            <Section title="School Cut" defaultOpen={true}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Cut Type</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Amount</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loc.cutTypes.map(ct => (
                    <tr key={ct.id}>
                      <td className="px-3 py-2">{ct.cut_type_name || '—'}</td>
                      <td className="px-3 py-2">
                        {ct.amount != null
                          ? ct.cut_type_unit === 'Percentage'
                            ? `${parseFloat(ct.amount)}%`
                            : `$${parseFloat(ct.amount).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{ct.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Invoicing */}
          <Section title="Invoicing" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Invoice Type</label>
                <select {...register('invoice_type')}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]">
                  <option value="">Not Set (defaults to 2nd Week)</option>
                  <option value="Monthly">Monthly</option>
                  <option value="2nd Week">2nd Week</option>
                  <option value="After Last Class">After Last Class</option>
                </select>
              </div>
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


          {/* School Info Sheet fields */}
          <Section title="School Info Sheet" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Classroom Location" placeholder="Room #, building, etc." {...register('classroom_location')} />
              <Select label="Parking Difficulty" {...register('parking_difficulty_id')}>
                <option value="">Select…</option>
                {(ref.parkingDifficulties || []).map(p => <option key={p.id} value={p.id}>{p.parking_difficulty_name}</option>)}
              </Select>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-700 block mb-1">Parking Information</label>
                <textarea {...register('parking_information')} rows={2} placeholder="Parking instructions, lots, street parking, etc."
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div className="flex items-end pb-1">
                <Toggle label="Attendance Required" checked={!!watch('attendance_required')} onChange={v => setValue('attendance_required', v ? 1 : 0, { shouldDirty: true })} />
              </div>
              {watch('attendance_required') && (
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-700 block mb-1">Attendance Directions</label>
                  <textarea {...register('attendance_directions')} rows={2} placeholder="How to take attendance at this location…"
                    className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                </div>
              )}
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-700 block mb-1">Arrival & Check-in Procedures</label>
                <textarea {...register('arrival_checkin_procedures')} rows={2} placeholder="How to arrive and check in…"
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-700 block mb-1">Student Pick-up & Classroom Procedures</label>
                <textarea {...register('student_pickup_procedures')} rows={2} placeholder="How students are brought to class…"
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-700 block mb-1">Student Dismissal Procedures</label>
                <textarea {...register('dismissal_procedures')} rows={2} placeholder="How students are dismissed after class…"
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-700 block mb-1">Emergency Procedures</label>
                <textarea {...register('emergency_procedures')} rows={2} placeholder="Leave blank for standard Egghead procedures…"
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-700 block mb-1">Egghead Tips for Success</label>
                <textarea {...register('egghead_tips')} rows={2} placeholder="Behavioral tips, school-specific instructions…"
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
            </div>
            {!isNew && (
              <div className="mt-3">
                <Link to={`/locations/${id}/info-sheet`} className="text-xs text-[#1e3a5f] hover:underline">Preview Info Sheet →</Link>
              </div>
            )}
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

          {/* Programs & Invoicing at this location */}
          {!isNew && loc.programs && loc.programs.length > 0 && (() => {
            const today = new Date().toISOString().split('T')[0];
            const getInvoiceStatus = (p) => {
              if (p.invoice_paid) return 'paid';
              if (p.invoice_date_sent) return 'sent';
              return 'not_sent';
            };
            const isCurrent = (p) => p.last_session_date && p.last_session_date.split('T')[0] >= today;
            const currentPrograms = loc.programs.filter(isCurrent);
            const pastPrograms = loc.programs.filter(p => !isCurrent(p));
            const unpaidPast = pastPrograms.filter(p => !p.invoice_paid);
            const paidPast = pastPrograms.filter(p => p.invoice_paid);

            const statusColor = {
              paid: 'bg-green-50 text-green-700 border-green-200',
              sent: 'bg-amber-50 text-amber-700 border-amber-200',
              not_sent: 'bg-red-50 text-red-700 border-red-200',
            };
            const statusLabel = { paid: 'Paid', sent: 'Sent', not_sent: 'Not Sent' };

            const inlineInvoiceUpdate = async (progId, data) => {
              await updateProgram(progId, data);
              qc.invalidateQueries(['locations', id]);
            };

            const renderRow = (p, i) => {
              const invStatus = getInvoiceStatus(p);
              const current = isCurrent(p);
              return (
                <tr key={p.id} className={current && invStatus === 'paid' ? 'bg-green-50/30' : invStatus === 'not_sent' && !current ? 'bg-red-50/30' : invStatus === 'sent' && !current ? 'bg-amber-50/30' : ''}>
                  <td className="px-3 py-2"><Link to={`/programs/${p.id}`} className="text-[#1e3a5f] hover:underline font-medium">{p.program_nickname}</Link></td>
                  <td className="px-3 py-2"><Badge status={p.class_status_name} /></td>
                  <td className="px-3 py-2 text-gray-600">{p.lead_professor || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{p.first_session_date ? formatDate(p.first_session_date) : '—'}{p.last_session_date ? ` — ${formatDate(p.last_session_date)}` : ''}</td>
                  <td className="px-3 py-1 text-center">
                    <select defaultValue={invStatus}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === 'paid') inlineInvoiceUpdate(p.id, { invoice_paid: 1, invoice_date_sent: p.invoice_date_sent || new Date().toISOString().split('T')[0] });
                        else if (v === 'sent') inlineInvoiceUpdate(p.id, { invoice_paid: 0, invoice_date_sent: new Date().toISOString().split('T')[0] });
                        else inlineInvoiceUpdate(p.id, { invoice_paid: 0, invoice_date_sent: null });
                      }}
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium appearance-none cursor-pointer ${statusColor[invStatus]}`}>
                      <option value="not_sent">Not Sent</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{p.invoice_date_sent ? formatDate(p.invoice_date_sent) : '—'}</td>
                </tr>
              );
            };

            return (
              <>
                {/* Current Programs */}
                <Section title={`Current Programs (${currentPrograms.length})`} defaultOpen={true}>
                  {currentPrograms.length === 0 ? <p className="text-sm text-gray-400">No current programs</p> : (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Lead</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Dates</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Invoice</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600 w-24">Sent</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">{currentPrograms.map(renderRow)}</tbody>
                      </table>
                    </div>
                  )}
                </Section>

                {/* Unpaid Past Programs */}
                {unpaidPast.length > 0 && (
                  <Section title={`Outstanding Invoices (${unpaidPast.length})`} defaultOpen={true}>
                    <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-red-50 border-b border-red-200">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-red-700">Program</th>
                            <th className="text-left px-3 py-2 font-medium text-red-700">Status</th>
                            <th className="text-left px-3 py-2 font-medium text-red-700">Lead</th>
                            <th className="text-left px-3 py-2 font-medium text-red-700">Dates</th>
                            <th className="text-center px-3 py-2 font-medium text-red-700 w-20">Invoice</th>
                            <th className="text-left px-3 py-2 font-medium text-red-700 w-24">Sent</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">{unpaidPast.map(renderRow)}</tbody>
                      </table>
                    </div>
                  </Section>
                )}

                {/* Paid Past Programs */}
                {paidPast.length > 0 && (
                  <Section title={`Paid Programs (${paidPast.length})`} defaultOpen={false}>
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Lead</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Dates</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Invoice</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600 w-24">Sent</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">{paidPast.map(renderRow)}</tbody>
                      </table>
                    </div>
                  </Section>
                )}
              </>
            );
          })()}

          {/* Audit History */}
          {!isNew && <AuditHistory table="location" recordId={id} />}
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
