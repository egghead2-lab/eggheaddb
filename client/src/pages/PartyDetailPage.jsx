import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getParty, createParty, updateParty } from '../api/parties';
import { useGeneralData, useProfessorList, useLocationList } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { formatDate, formatTime, formatCurrency } from '../lib/utils';

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
  const { data: professorListData } = useProfessorList();
  const { data: locationListData } = useLocationList();
  const ref = refData?.data || {};
  const professors = professorListData?.data || [];
  const locations = locationListData?.data || [];

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm();

  useEffect(() => {
    if (partyData?.data) reset(partyData.data);
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
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <Link to="/parties" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Parties</Link>
            <div className="flex items-center gap-3 mt-0.5">
              <h1 className="text-xl font-bold text-gray-900">
                {isNew ? 'New Party' : (party.program_nickname || `Party #${id}`)}
              </h1>
              {party.class_status_name && <Badge status={party.class_status_name} />}
            </div>
            {!isNew && party.demo_date && (
              <div className="text-sm text-gray-500 mt-0.5">
                {formatDate(party.demo_date)} {party.demo_start_time ? formatTime(party.demo_start_time) : ''}
                {party.demo_end_time ? ` – ${formatTime(party.demo_end_time)}` : ''}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4 pb-32">
          {/* Section 1: General Info */}
          <Section title="General Info" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Party Nickname" {...register('program_nickname')} />
              <Select label="Status" {...register('class_status_id')}>
                <option value="">Select status…</option>
                {(ref.classStatuses || []).map(s => (
                  <option key={s.id} value={s.id}>{s.class_status_name}</option>
                ))}
              </Select>
              <Select label="Location" {...register('location_id')}>
                <option value="">Select location…</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.nickname}</option>
                ))}
              </Select>
              <Select label="Party Class" {...register('class_id')}>
                <option value="">Select class…</option>
                {(ref.classTypes || []).map(ct => (
                  <option key={ct.id} value={ct.id}>{ct.class_type_name}</option>
                ))}
              </Select>
              <div className="col-span-2">
                <Input label="General Notes" {...register('general_notes')} />
              </div>
            </div>
          </Section>

          {/* Section 2: Date & Time */}
          <Section title="Date & Time" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Party Date" type="date" {...register('demo_date')} />
              <div className="col-span-1" />
              <Input label="Start Time" type="time" {...register('demo_start_time')} />
              <Input label="End Time" type="time" {...register('demo_end_time')} />
            </div>
          </Section>

          {/* Section 3: Professors */}
          <Section title="Professors">
            <div className="grid grid-cols-2 gap-4">
              <Select label="Lead Professor" {...register('lead_professor_id')}>
                <option value="">None</option>
                {professors.map(p => (
                  <option key={p.id} value={p.id}>{p.professor_nickname}</option>
                ))}
              </Select>
              <Input label="Lead Professor Pay" type="number" step="0.01" {...register('lead_professor_pay')} />
              <Input label="Lead Drive Fee" type="number" step="0.01" {...register('lead_professor_drive_fee')} />
              <Input label="Lead Tip" type="number" step="0.01" {...register('lead_professor_tip')} />
              <Toggle
                label="Lead Reimbursements Paid"
                checked={!!watch('lead_reimbursements_paid')}
                onChange={v => setValue('lead_reimbursements_paid', v ? 1 : 0, { shouldDirty: true })}
              />
              <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
                <Toggle
                  label="Assistant Required"
                  checked={!!watch('assistant_required')}
                  onChange={v => setValue('assistant_required', v ? 1 : 0, { shouldDirty: true })}
                />
              </div>
              <Select label="Assistant Professor" {...register('assistant_professor_id')}>
                <option value="">None</option>
                {professors.map(p => (
                  <option key={p.id} value={p.id}>{p.professor_nickname}</option>
                ))}
              </Select>
              <Input label="Assistant Pay" type="number" step="0.01" {...register('assistant_professor_pay')} />
              <Input label="Assistant Drive Fee" type="number" step="0.01" {...register('assistant_professor_drive_fee')} />
              <Input label="Assistant Tip" type="number" step="0.01" {...register('assistant_professor_tip')} />
            </div>
          </Section>

          {/* Section 4: Pricing */}
          <Section title="Pricing & Payment" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Base Party Price" type="number" step="0.01" {...register('base_party_price')} />
              <Input label="Drive Fee" type="number" step="0.01" {...register('drive_fee')} />
              <Input label="Late Booking Fee" type="number" step="0.01" {...register('late_booking_fee')} />
              <Input label="Extra Kids Fee" type="number" step="0.01" {...register('extra_kids_fee')} />
              <Input label="Extra Time Fee" type="number" step="0.01" {...register('extra_time_fee')} />
              <Input label="Total Party Cost" type="number" step="0.01" {...register('total_party_cost')} />
              <Input label="Deposit Amount" type="number" step="0.01" {...register('deposit_amount')} />
              <Input label="Deposit Date" type="date" {...register('deposit_date')} />
              <Toggle
                label="Charge Confirmed"
                checked={!!watch('charge_confirmed')}
                onChange={v => setValue('charge_confirmed', v ? 1 : 0, { shouldDirty: true })}
              />
              <Input label="Final Charge Date" type="date" {...register('final_charge_date')} />
              <Input label="Final Charge Type" {...register('final_charge_type')} />
              <Toggle
                label="Payment Through Us"
                checked={!!watch('payment_through_us')}
                onChange={v => setValue('payment_through_us', v ? 1 : 0, { shouldDirty: true })}
              />
            </div>
          </Section>

          {/* Section 5: Party Details */}
          <Section title="Party Details">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Total Kids Attended" type="number" {...register('total_kids_attended')} />
              <Input label="Shirt Size" {...register('shirt_size')} />
              <Input label="Glow Slime Amount" {...register('glow_slime_amount_needed')} />
              <Select label="Demo Type" {...register('demo_type_id')}>
                <option value="">None</option>
                {(ref.demoTypes || []).map(t => (
                  <option key={t.id} value={t.id}>{t.demo_type_name}</option>
                ))}
              </Select>
              <Toggle
                label="Emailed Follow Up"
                checked={!!watch('emailed_follow_up')}
                onChange={v => setValue('emailed_follow_up', v ? 1 : 0, { shouldDirty: true })}
              />
            </div>
          </Section>
        </div>

        {/* Sticky Footer */}
        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && (
            <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>
          )}
          {mutation.isSuccess && <p className="text-sm text-green-600">Saved successfully</p>}
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
