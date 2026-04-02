import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getContractor, updateContractor } from '../api/contractors';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { toFormData } from '../lib/utils';

const STRENGTH_OPTIONS = ['Strong', 'Good', 'Moderate', 'Weak'];

export default function ContractorDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();

  const { data: contractorData, isLoading } = useQuery({
    queryKey: ['contractors', id],
    queryFn: () => getContractor(id),
  });

  // Get users for salesperson dropdown
  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => fetch('http://localhost:3002/api/users', { credentials: 'include' }).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const users = usersData?.data || [];

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty } } = useForm();

  useEffect(() => {
    if (contractorData?.data) reset(toFormData(contractorData.data));
  }, [contractorData]);

  const mutation = useMutation({
    mutationFn: (data) => updateContractor(id, data),
    onSuccess: () => { qc.invalidateQueries(['contractors']); },
  });

  const contractor = contractorData?.data || {};
  const locations = contractor.locations || [];
  const onSubmit = (data) => mutation.mutate(data);

  if (isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  return (
    <AppShell>
      <UnsavedChangesModal when={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <Link to="/contractors" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Contractors</Link>
          <div className="flex items-center gap-3 mt-0.5">
            <h1 className="text-xl font-bold text-gray-900">{contractor.contractor_name || 'Contractor'}</h1>
            {contractor.relationship_strength && (
              <Badge status={contractor.relationship_strength} />
            )}
          </div>
          {contractor.last_updated && (
            <span className="text-xs text-gray-400">Last updated: {new Date(contractor.last_updated).toLocaleDateString()}</span>
          )}
        </div>

        <div className="p-6 space-y-4 pb-32">
          {/* Egghead Internal */}
          <Section title="Egghead Internal" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Contractor Name" required {...register('contractor_name', { required: 'Required' })} error={errors.contractor_name?.message} />
              <Select label="Salesperson" {...register('salesperson_user_id')}>
                <option value="">None</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </Select>
              <Input label="Client Since" {...register('client_since')} placeholder="e.g. March of 2025" />
              <Select label="Relationship Strength" {...register('relationship_strength')}>
                <option value="">Not Set</option>
                {STRENGTH_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Input label="Last Updated" type="date" {...register('last_updated')} />
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-gray-700 block mb-1">Rebooking / Contract Notes</label>
              <textarea {...register('rebooking_notes')} rows={3}
                className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Minimum Needed to Run</label>
                <textarea {...register('minimum_to_run')} rows={2}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Last Price Raise</label>
                <textarea {...register('last_price_raise')} rows={2}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
            </div>
          </Section>

          {/* Key Contact */}
          <Section title="Key Contact" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Contact Name" {...register('key_contact_name')} />
              <Input label="Email" type="email" {...register('key_contact_email')} />
              <Input label="Phone" {...register('key_contact_phone')} />
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-gray-700 block mb-1">Day-Of Notifications Go To</label>
              <textarea {...register('day_of_notifications')} rows={2}
                className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-gray-700 block mb-1">Vibe / Relationship Notes</label>
              <textarea {...register('client_vibe')} rows={3}
                className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
          </Section>

          {/* Professor Requirements */}
          <Section title="Professor Requirements" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-4">
              <Toggle label="Livescan Required" checked={!!watch('livescan_required')} onChange={v => setValue('livescan_required', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="TB Required" checked={!!watch('tb_required')} onChange={v => setValue('tb_required', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Livescan Multiple Sites" checked={!!watch('livescan_multiple')} onChange={v => setValue('livescan_multiple', v ? 1 : 0, { shouldDirty: true })} />
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-gray-700 block mb-1">Miscellaneous Professor Notes</label>
              <textarea {...register('professor_misc_notes')} rows={3}
                className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
          </Section>

          {/* District Expectations */}
          <Section title="General District Expectations" defaultOpen={true}>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Behavioral Guidelines</label>
                <textarea {...register('behavioral_guidelines')} rows={2}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Area Demographic</label>
                <textarea {...register('area_demographic')} rows={2}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Flexibility Notes</label>
                <textarea {...register('flexibility_notes')} rows={2}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Invoice Notes</label>
                <textarea {...register('invoice_notes')} rows={2}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">General Notes</label>
                <textarea {...register('general_notes')} rows={3}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
            </div>
          </Section>

          {/* Assigned Locations */}
          <Section title={`Locations (${locations.length})`} defaultOpen={true}>
            {locations.length === 0 ? (
              <p className="text-sm text-gray-400">No locations assigned to this contractor</p>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Location</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Area</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {locations.map((loc, i) => (
                      <tr key={loc.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-2">
                          <Link to={`/locations/${loc.id}`} className="text-[#1e3a5f] hover:underline">{loc.nickname || loc.school_name}</Link>
                        </td>
                        <td className="px-4 py-2 text-gray-600">{loc.geographic_area_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>}
          {mutation.isSuccess && <p className="text-sm text-green-600">Saved successfully</p>}
          <div className="ml-auto flex gap-3">
            <Link to="/contractors" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
