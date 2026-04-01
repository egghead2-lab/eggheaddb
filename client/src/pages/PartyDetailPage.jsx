import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getParty, createParty, updateParty } from '../api/parties';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { formatDate, formatTime, toFormData } from '../lib/utils';

export default function PartyDetailPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: partyData, isLoading } = useQuery({
    queryKey: ['parties', id],
    queryFn: () => getParty(id),
    enabled: !isNew,
  });

  const { data: refData } = useGeneralData();
  const ref = refData?.data || {};
  const partyLeadProfessors = ref.partyLeadProfessors || [];
  const partyAssistProfessors = ref.partyAssistProfessors || [];

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm();

  useEffect(() => {
    if (partyData?.data) reset(toFormData(partyData.data));
  }, [partyData]);

  const mutation = useMutation({
    mutationFn: (data) => isNew ? createParty(data) : updateParty(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['parties']);
      if (isNew && res?.id) navigate(`/parties/${res.id}`);
    },
  });

  const party = partyData?.data || {};
  const onSubmit = (data) => mutation.mutate(data);

  if (!isNew && isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  return (
    <AppShell>
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div>
            <Link to="/parties" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Parties</Link>
            <div className="flex items-center gap-3 mt-0.5">
              <h1 className="text-lg font-bold text-gray-900">
                {isNew ? 'New Party' : (party.party_theme_name || party.party_format_name || `Party #${id}`)}
              </h1>
              {party.class_status_name && <Badge status={party.class_status_name} />}
              {!isNew && party.first_session_date && (
                <span className="text-sm text-gray-500">
                  {formatDate(party.first_session_date)}{party.start_time ? ` · ${formatTime(party.start_time)}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3 pb-24">
          {/* Section 1: Key Info */}
          <Section title="Party Info" defaultOpen={true}>
            <div className="grid grid-cols-5 gap-3">
              <Select label="Status" required {...register('class_status_id', { required: 'Required' })} error={errors.class_status_id?.message}>
                <option value="">Select…</option>
                {(ref.classStatuses || []).map(s => (
                  <option key={s.id} value={s.id}>{s.class_status_name}</option>
                ))}
              </Select>
              <Select label="Format" {...register('party_format_id')}>
                <option value="">Select format…</option>
                {(ref.partyFormats || []).map(f => (
                  <option key={f.id} value={f.id}>{f.party_format_name}</option>
                ))}
              </Select>
              <Select label="Theme" {...register('class_id')}>
                <option value="">Select theme…</option>
                {(ref.partyThemes || []).map(t => (
                  <option key={t.id} value={t.id}>{t.class_name}</option>
                ))}
              </Select>
              <Input label="Date" type="date" {...register('first_session_date')} />
              <Input label="Start Time" type="time" {...register('start_time')} />
              <Input label="# Kids" type="number" {...register('total_kids_attended')} />
              <Input label="Duration (min)" type="number" {...register('class_length_minutes')} />
              <Input label="Shirt Size" {...register('shirt_size')} />
              <div className="col-span-5">
                <Input label="Location Name / Address" placeholder="e.g. Willard Elementary, 12345 Main St, Los Angeles" {...register('party_location_text')} />
              </div>
              <div className="col-span-5">
                <Input label="Notes" {...register('general_notes')} />
              </div>
            </div>
          </Section>

          {/* Section 2: Professors */}
          <Section title="Professors" defaultOpen={true}>
            <div className="grid grid-cols-5 gap-3">
              <Select label="Lead Professor" {...register('lead_professor_id')}>
                <option value="">None</option>
                {partyLeadProfessors.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>
                ))}
              </Select>
              <Input label="Lead Pay" prefix="$" type="number" step="0.01" {...register('lead_professor_pay')} />
              <Input label="Lead Drive Fee" prefix="$" type="number" step="0.01" {...register('lead_professor_drive_fee')} />
              <Input label="Lead Tip" prefix="$" type="number" step="0.01" {...register('lead_professor_tip')} />
              <Toggle label="Lead Reimb. Paid" checked={!!watch('lead_reimbursements_paid')} onChange={v => setValue('lead_reimbursements_paid', v ? 1 : 0, { shouldDirty: true })} />
              <Select label="Assistant Professor" {...register('assistant_professor_id')}>
                <option value="">None</option>
                {partyAssistProfessors.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>
                ))}
              </Select>
              <Input label="Assist Pay" prefix="$" type="number" step="0.01" {...register('assistant_professor_pay')} />
              <Input label="Assist Drive Fee" prefix="$" type="number" step="0.01" {...register('assistant_professor_drive_fee')} />
              <Input label="Assist Tip" prefix="$" type="number" step="0.01" {...register('assistant_professor_tip')} />
              <Toggle label="Assist Reimb. Paid" checked={!!watch('assistant_reimbursements_paid')} onChange={v => setValue('assistant_reimbursements_paid', v ? 1 : 0, { shouldDirty: true })} />
            </div>
          </Section>

          {/* Section 3: Pricing */}
          <Section title="Pricing & Payment" defaultOpen={true}>
            <div className="grid grid-cols-5 gap-3">
              <Input label="Base Price" prefix="$" type="number" step="0.01" {...register('base_party_price')} />
              <Input label="Drive Fee" prefix="$" type="number" step="0.01" {...register('drive_fee')} />
              <Input label="Total Cost" prefix="$" type="number" step="0.01" {...register('total_party_cost')} />
              <Input label="Deposit Amount" prefix="$" type="number" step="0.01" {...register('deposit_amount')} />
              <Input label="Deposit Date" type="date" {...register('deposit_date')} />
              <Input label="Final Charge Date" type="date" {...register('final_charge_date')} />
              <Select label="Final Charge Type" {...register('final_charge_type')}>
                <option value="">Select…</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Check">Check</option>
                <option value="Stripe Link">Stripe Link</option>
                <option value="Other">Other</option>
              </Select>
              <Toggle label="Charge Confirmed" checked={!!watch('charge_confirmed')} onChange={v => setValue('charge_confirmed', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Emailed Follow Up" checked={!!watch('emailed_follow_up')} onChange={v => setValue('emailed_follow_up', v ? 1 : 0, { shouldDirty: true })} />
            </div>
          </Section>
        </div>

        {/* Sticky Footer */}
        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>}
          {mutation.isSuccess && <p className="text-sm text-green-600">Saved</p>}
          <div className="ml-auto flex gap-3">
            <Link to="/parties" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
