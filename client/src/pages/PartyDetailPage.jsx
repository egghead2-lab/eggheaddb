import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getParty, createParty, updateParty } from '../api/parties';
import api from '../api/client';
import { searchParents } from '../api/parents';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { formatDate, formatTime, toFormData } from '../lib/utils';

export default function PartyDetailPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
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

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty, dirtyFields } } = useForm();

  useEffect(() => {
    if (partyData?.data) reset(toFormData(partyData.data));
  }, [partyData]);

  // Fields that, when changed, warrant a calendar re-sync prompt
  const CAL_SYNC_FIELDS = ['first_session_date', 'start_time', 'class_length_minutes', 'parent_id',
    'party_address', 'party_city', 'party_state', 'party_zip', 'party_location_text',
    'lead_professor_id', 'assistant_professor_id', 'birthday_kid_name', 'birthday_kid_age', 'general_notes'];

  const mutation = useMutation({
    mutationFn: (data) => isNew ? createParty(data) : updateParty(id, data),
    onSuccess: async (res) => {
      qc.invalidateQueries(['parties']);
      if (isNew && res?.id) { navigate(`/parties/${res.id}`); return; }
      // Auto-sync calendar if any sync-relevant field changed and party is on calendar
      const changed = CAL_SYNC_FIELDS.filter(f => dirtyFields[f]);
      if (changed.length > 0 && party.calendar_event_id) {
        if (confirm(`Calendar-relevant fields changed (${changed.join(', ')}).\n\nSync the Google Calendar event now?`)) {
          try { await api.post(`/parties/${id}/calendar/sync`); }
          catch (e) { alert('Calendar sync failed: ' + (e?.response?.data?.error || e.message)); }
        }
      }
    },
  });

  const party = partyData?.data || {};
  const onSubmit = (data) => mutation.mutate(data);

  // Contact search
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);

  useEffect(() => {
    if (partyData?.data) {
      const d = partyData.data;
      if (d.parent_id && d.contact_name) {
        setSelectedContact({ id: d.parent_id, name: d.contact_name, email: d.contact_email, phone: d.contact_phone });
      }
    }
  }, [partyData]);

  const handleContactSearch = async (q) => {
    setContactSearch(q);
    if (q.length < 2) { setContactResults([]); return; }
    const res = await searchParents(q);
    setContactResults(res.data || []);
  };

  const handleContactSelect = (c) => {
    setSelectedContact({ id: c.id, name: `${c.first_name} ${c.last_name}`, email: c.email, phone: c.phone });
    setValue('parent_id', c.id, { shouldDirty: true });
    setContactSearch('');
    setContactResults([]);
  };

  const handleContactClear = () => {
    setSelectedContact(null);
    setValue('parent_id', '', { shouldDirty: true });
  };

  if (!isNew && isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  return (
    <AppShell>
      <UnsavedChangesModal when={isDirty} />
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
            {!isNew && party.program_nickname && (
              <div className="text-xs text-gray-500 mt-1 font-mono break-all" title="Auto-generated party nickname">
                {party.program_nickname}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3 pb-24">
          {/* Calendar (top) */}
          {!isNew && (
            <Section title="Google Calendar" defaultOpen={false}>
              {party.calendar_event_id ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-green-600 font-medium">✓ On calendar</span>
                  <a href={`https://www.google.com/calendar/event?eid=${btoa(`${party.calendar_event_id} losangeles@professoregghead.com`).replace(/=+$/, '')}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs text-[#1e3a5f] hover:underline font-medium">
                    Open in Google Calendar ↗
                  </a>
                  <span className="text-[10px] text-gray-400 font-mono truncate" title={party.calendar_event_id}>{party.calendar_event_id.substring(0, 12)}…</span>
                  <CalendarSyncButton partyId={id} />
                  <CalendarDeleteButton partyId={id} />
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">Not on calendar yet</span>
                  <CalendarCreateButton partyId={id} />
                </div>
              )}
            </Section>
          )}

          {/* Section 1: Key Info */}
          <Section title="Party Info" defaultOpen={true}>
            <div className="grid grid-cols-5 gap-3">
              <Select label="Status" required {...register('class_status_id', { required: 'Required' })} error={errors.class_status_id?.message}>
                <option value="">Select…</option>
                {(ref.classStatuses || []).filter(s => !isNew || !s.class_status_name.startsWith('Cancelled')).map(s => (
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
              <Input label="Birthday Kid" placeholder="Name" {...register('birthday_kid_name')} />
              <Input label="Turning Age" type="number" {...register('birthday_kid_age')} />
              <div className="col-span-3">
                <label className="text-xs font-medium text-gray-700 block mb-1">Quick Address <span className="text-gray-400 font-normal">— paste any format, auto-fills the fields below</span></label>
                <input placeholder="123 Main St, Los Angeles, CA 90001 (or paste from Google Maps)"
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] bg-gray-50"
                  onBlur={e => {
                    const raw = e.target.value;
                    if (!raw.trim()) return;
                    // Normalize: replace newlines/tabs/semicolons with commas, strip trailing "USA"/"United States" + periods
                    let text = raw.replace(/[\r\n\t;]+/g, ', ').replace(/,?\s*(United States|USA)\.?\s*$/i, '').replace(/\s+/g, ' ').trim();
                    // Try comma-separated formats first
                    let m = text.match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2}),?\s*(\d{5}(?:-\d{4})?)$/i)
                      || text.match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2})$/i);
                    // Fall back: state+zip glued at the end (no comma before state)
                    if (!m) m = text.match(/^(.+?),\s*([^,]+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
                    // Last resort: split by commas and try to detect state/zip
                    if (!m) {
                      const parts = text.split(',').map(s => s.trim()).filter(Boolean);
                      if (parts.length >= 2) {
                        const last = parts[parts.length - 1];
                        const stateZip = last.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i);
                        if (stateZip && parts.length >= 3) {
                          m = [text, parts.slice(0, -2).join(', '), parts[parts.length - 2], stateZip[1], stateZip[2]];
                        }
                      }
                    }
                    if (m) {
                      setValue('party_address', m[1].trim(), { shouldDirty: true });
                      setValue('party_city', m[2].trim(), { shouldDirty: true });
                      setValue('party_state', m[3].trim().toUpperCase(), { shouldDirty: true });
                      if (m[4]) setValue('party_zip', m[4].trim(), { shouldDirty: true });
                      e.target.value = '';
                    } else {
                      alert(`Couldn't parse address. Expected format like:\n  123 Main St, Los Angeles, CA 90001\n\nFill in the fields below manually.`);
                    }
                  }} />
              </div>
              <div className="col-span-2" />
              <div className="col-span-2">
                <Input label="Street Address" placeholder="123 Main St" {...register('party_address')} />
              </div>
              <Input label="City" placeholder="Los Angeles" {...register('party_city')} />
              <Input label="State" placeholder="CA" maxLength={2} {...register('party_state')} />
              <Input label="Zip" placeholder="90001" {...register('party_zip')} />
              <Select label="Area" {...register('geographic_area_id')}>
                <option value="">Select area…</option>
                {(ref.areas || []).map(a => <option key={a.id} value={a.id}>{a.geographic_area_name}</option>)}
              </Select>
              <div className="col-span-5">
                <Input label="Notes" {...register('general_notes')} />
              </div>
            </div>
          </Section>

          {/* Section 2: Contact */}
          <Section title="Contact" defaultOpen={true}>
            <input type="hidden" {...register('parent_id')} />
            <div className="grid grid-cols-5 gap-3 items-end">
              <div className="col-span-2">
                {selectedContact ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">Contact</label>
                    <div className="flex items-center gap-2 rounded border border-gray-300 px-3 py-1.5 text-sm bg-white">
                      <Link to={`/parents/${selectedContact.id}`} className="text-[#1e3a5f] hover:underline font-medium flex-1">
                        {selectedContact.name}
                      </Link>
                      <button type="button" onClick={() => { setContactSearch(''); setSelectedContact(null); setValue('parent_id', '', { shouldDirty: true }); setContactResults([]); }} className="text-gray-400 hover:text-gray-600 text-xs">change</button>
                      <button type="button" onClick={handleContactClear} className="text-gray-400 hover:text-red-500 text-xs">clear</button>
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                      {selectedContact.email && <span>📧 {selectedContact.email}</span>}
                      {selectedContact.phone && <span>📞 <a href={`tel:${selectedContact.phone}`} className="text-[#1e3a5f] hover:underline">{selectedContact.phone}</a></span>}
                    </div>
                  </div>
                ) : (
                  <div className="relative flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">Contact</label>
                    <input
                      type="text"
                      placeholder="Search parents…"
                      value={contactSearch}
                      onChange={e => handleContactSearch(e.target.value)}
                      className="block w-full rounded border border-gray-300 text-sm shadow-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                    />
                    {contactResults.length > 0 && (
                      <ul className="absolute top-full z-20 mt-1 w-full bg-white border border-gray-200 rounded shadow max-h-48 overflow-y-auto">
                        {contactResults.map(c => (
                          <li key={c.id} onClick={() => handleContactSelect(c)} className="px-3 py-2 text-sm cursor-pointer hover:bg-[#1e3a5f]/10">
                            <span className="font-medium">{c.first_name} {c.last_name}</span>
                            {c.email && <span className="text-gray-400 ml-2 text-xs">{c.email}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <Link
                to="/parents/new"
                target="_blank"
                className="text-xs text-[#1e3a5f] hover:underline pb-1.5"
              >
                + New Parent
              </Link>
            </div>
          </Section>

          {/* Section 3: Professors */}
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
              <Input label="Emailed Follow Up" type="date" {...register('emailed_follow_up')} />
              <Toggle label="Invoice Needed" checked={!!watch('invoice_needed')} onChange={v => setValue('invoice_needed', v ? 1 : 0, { shouldDirty: true })} />
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium text-gray-700 block mb-1">Invoice Notes</label>
              <textarea {...register('invoice_notes')} rows={2} placeholder="Notes for invoicing (visible on Follow Up tool)…"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
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

function CalendarCreateButton({ partyId }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.post(`/parties/${partyId}/calendar`),
    onSuccess: () => qc.invalidateQueries(['parties', partyId]),
    onError: (err) => alert('Failed to add: ' + (err?.response?.data?.error || err.message)),
  });
  return (
    <button onClick={() => mut.mutate()} disabled={mut.isPending}
      className="text-xs text-white bg-[#1e3a5f] px-3 py-1 rounded hover:bg-[#152a47] disabled:opacity-50">
      {mut.isPending ? 'Creating…' : 'Add to Calendar'}
    </button>
  );
}

function CalendarSyncButton({ partyId }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.post(`/parties/${partyId}/calendar/sync`),
    onSuccess: () => qc.invalidateQueries(['parties', partyId]),
    onError: (err) => alert('Sync failed: ' + (err?.response?.data?.error || err.message)),
  });
  return (
    <button onClick={() => mut.mutate()} disabled={mut.isPending}
      className="text-[10px] text-[#1e3a5f] hover:underline">
      {mut.isPending ? 'Syncing…' : mut.isSuccess ? 'Synced!' : 'Sync now'}
    </button>
  );
}

function CalendarDeleteButton({ partyId }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.delete(`/parties/${partyId}/calendar`),
    onSuccess: () => qc.invalidateQueries(['parties', partyId]),
  });
  return (
    <button onClick={() => { if (confirm('Remove from Google Calendar?')) mut.mutate(); }} disabled={mut.isPending}
      className="text-[10px] text-red-500 hover:underline">
      {mut.isPending ? 'Removing…' : 'Remove from calendar'}
    </button>
  );
}
