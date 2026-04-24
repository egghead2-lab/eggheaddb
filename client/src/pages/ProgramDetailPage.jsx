import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, FormProvider } from 'react-hook-form';
import { ViewModeProvider } from '../contexts/ViewModeContext';
import api from '../api/client';
import { getProgram, createProgram, updateProgram, copyProgram } from '../api/programs';
import { useGeneralData, useProfessorList, useLocationList, useLessons } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { AuditHistory } from '../components/AuditHistory';
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
  // Include IDs of currently-assigned professors so they stay visible even if their status changed
  const prog0 = progData?.data || {};
  const includeIds = useMemo(() => {
    const ids = new Set();
    if (prog0.lead_professor_id) ids.add(prog0.lead_professor_id);
    if (prog0.assistant_professor_id) ids.add(prog0.assistant_professor_id);
    if (prog0.demo_professor_id) ids.add(prog0.demo_professor_id);
    (prog0.sessions || []).forEach(s => {
      if (s.professor_id) ids.add(s.professor_id);
      if (s.assistant_id) ids.add(s.assistant_id);
      if (s.observer_id) ids.add(s.observer_id);
    });
    return [...ids].join(',');
  }, [prog0.lead_professor_id, prog0.assistant_professor_id, prog0.demo_professor_id, prog0.sessions]);
  const { data: professorListData } = useProfessorList({ assignable: 1, include_ids: includeIds || undefined });
  const { data: locationListData } = useLocationList();
  const { data: lessonsData } = useLessons();
  const ref = refData?.data || {};
  const professors = professorListData?.data || [];
  const locations = locationListData?.data || [];
  const lessons = lessonsData?.data || [];

  const { data: classesData } = useQuery({
    queryKey: ['classes-list'],
    queryFn: () => api.get('/classes').then(r => r.data),
    staleTime: 10 * 60 * 1000,
  });
  const classes = classesData?.data || [];

  const formMethods = useForm();
  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty } } = formMethods;

  // View mode on by default for existing programs; new programs go straight to edit
  const [viewMode, setViewMode] = useState(!isNew);

  useEffect(() => {
    if (progData?.data) reset(toFormData(progData.data));
  }, [progData]);

  const mutation = useMutation({
    mutationFn: (data) => isNew ? createProgram(data) : updateProgram(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['programs']);
      if (isNew && res?.id) navigate(`/programs/${res.id}`);
      else setViewMode(true);
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
      <FormProvider {...formMethods}>
      <ViewModeProvider value={viewMode}>
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
            {!isNew && (
              <div className="flex items-center gap-3">
                {viewMode ? (
                  <button type="button" onClick={() => setViewMode(false)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium hover:bg-[#152a47] transition-colors shadow-sm">
                    ✎ Edit
                  </button>
                ) : (
                  <button type="button" onClick={() => { reset(toFormData(prog)); setViewMode(true); }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
                    Cancel Edit
                  </button>
                )}
                <Link to={`/programs/${id}/classroom`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium hover:bg-[#152a47] transition-colors shadow-sm">
                  Classroom & Attendance
                </Link>
                <button type="button" onClick={async () => {
                  const res = await copyProgram(id);
                  if (res?.id) navigate(`/programs/${res.id}`);
                }} className="text-xs text-gray-400 hover:text-[#1e3a5f]">Duplicate</button>
              </div>
            )}
          </div>
          {!isNew && prog.payment_through_us ? (
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-gray-500">
              <span className="text-green-600 font-medium">Payment Through Us</span>
            </div>
          ) : null}
        </div>

        <div className="p-6 space-y-4 pb-32">
          {/* General Info + Professors + Pay */}
          <Section title="General Info" defaultOpen={true}>
            <div className="grid grid-cols-4 gap-4">
              <Input label="Program Nickname" {...register('program_nickname')} />
              <Input label="Grade Range *" placeholder="e.g. K-3, 4-6" {...register('grade_range')} />
              <Select label="Status *" {...register('class_status_id')}>
                <option value="">Select status…</option>
                {(ref.classStatuses || []).filter(s => !isNew || !s.class_status_name.startsWith('Cancelled')).map(s => (
                  <option key={s.id} value={s.id}>{s.class_status_name}</option>
                ))}
              </Select>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">Location *</label>
                  {watch('location_id') && (
                    <Link to={`/locations/${watch('location_id')}`} target="_blank"
                      className="text-[10px] text-[#1e3a5f] hover:underline">Open ↗</Link>
                  )}
                </div>
                <SearchSelect
                  value={watch('location_id')}
                  onChange={v => setValue('location_id', v, { shouldDirty: true })}
                  options={locations}
                  displayKey="nickname"
                  valueKey="id"
                  placeholder="Search locations…"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4">
              <SearchSelect
                label="Class / Curriculum *"
                value={watch('class_id')}
                onChange={v => setValue('class_id', v, { shouldDirty: true })}
                options={classes}
                displayKey="class_name"
                valueKey="id"
                placeholder="Search classes…"
              />
              <div className="col-span-3 flex items-end gap-2 text-xs text-gray-500 pb-2">
                {(() => {
                  const sel = classes.find(c => String(c.id) === String(watch('class_id')));
                  return sel ? (
                    <>
                      <span>Program Type: <strong className="text-gray-700">{sel.program_type_name || '—'}</strong></span>
                      <span>·</span>
                      <span>Class Type: <strong className="text-gray-700">{sel.class_type_name || '—'}</strong></span>
                    </>
                  ) : <span className="text-gray-400">Pick a class to set program/class type</span>;
                })()}
              </div>
            </div>

            {/* Team (read-only, inherited from area + location) */}
            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                <span>Team</span>
                <span className="text-gray-400 normal-case font-normal lowercase">— set on area / location, not editable here</span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-[10px] text-gray-500">Client Manager</div>
                  <div className="text-gray-800 font-medium">{prog.client_manager_name?.trim() || <span className="text-amber-600">— missing —</span>}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Scheduler</div>
                  <div className="text-gray-800 font-medium">{prog.scheduling_coordinator_name?.trim() || <span className="text-amber-600">— missing —</span>}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Field Manager</div>
                  <div className="text-gray-800 font-medium">{prog.field_manager_name?.trim() || <span className="text-amber-600">— missing —</span>}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">
                    Salesperson{(prog.salespeople || []).length > 1 ? 's' : ''}
                    {(prog.salespeople || [])[0]?.source ? (
                      <span className="ml-1 text-gray-400">(from {(prog.salespeople || [])[0].source})</span>
                    ) : null}
                  </div>
                  <div className="text-gray-800 font-medium">
                    {(prog.salespeople || []).length === 0 ? (
                      <span className="text-amber-600">— missing —</span>
                    ) : (
                      (prog.salespeople || []).map((s, i) => (
                        <span key={s.id}>
                          {i > 0 ? ', ' : ''}{s.name}
                          {s.split_pct && parseFloat(s.split_pct) < 1 ? <span className="text-gray-400 ml-0.5">({Math.round(parseFloat(s.split_pct) * 100)}%)</span> : null}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {(() => {
              const leadId = watch('lead_professor_id');
              const assistId = watch('assistant_professor_id');
              const unassignable = (pid) => {
                const p = professors.find(x => String(x.id) === String(pid));
                if (!p) return null;
                if (p.is_field_manager) return null;
                const ok = ['Active', 'Training', 'Substitute'].includes(p.professor_status_name);
                return ok ? null : p.professor_status_name;
              };
              const leadWarn = unassignable(leadId);
              const assistWarn = unassignable(assistId);
              return (
                <div className="grid grid-cols-4 gap-4 mt-4">
                  <div>
                    <Select label="Lead Professor" value={leadId || ''}
                      onChange={e => {
                        const v = e.target.value;
                        setValue('lead_professor_id', v || null, { shouldDirty: true });
                        const pick = professors.find(p => String(p.id) === String(v));
                        if (pick?.is_field_manager) setValue('lead_professor_pay', 0, { shouldDirty: true });
                      }}>
                      <option value="">None</option>
                      {professors.map(p => (
                        <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}{p.is_field_manager ? ' (FM)' : ''}</option>
                      ))}
                    </Select>
                    {leadWarn && <div className="mt-1 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 inline-block">⚠ Assigned prof is {leadWarn}</div>}
                  </div>
                  {(() => {
                    const leadIsFM = professors.find(p => String(p.id) === String(leadId))?.is_field_manager;
                    const payVal = leadIsFM ? 0 : watch('lead_professor_pay');
                    return (
                      <div className="flex flex-col gap-1">
                        <label className={`text-xs font-medium ${viewMode ? 'text-gray-500' : 'text-gray-700'}`}>Lead Pay</label>
                        {viewMode ? (
                          <div className="text-sm text-gray-800 py-1.5">{payVal === '' || payVal == null ? <span className="text-gray-400">—</span> : `$${payVal}`}</div>
                        ) : (
                          <input type="number" step="0.01" value={payVal ?? ''}
                            disabled={leadIsFM}
                            onChange={e => setValue('lead_professor_pay', e.target.value || null, { shouldDirty: true })}
                            title={leadIsFM ? 'Field Managers are not paid for class sessions' : undefined}
                            className={`rounded border border-gray-300 px-2 py-1.5 text-sm ${leadIsFM ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`} placeholder="$" />
                        )}
                      </div>
                    );
                  })()}
                  <div>
                    <Select label="Assistant Professor" value={assistId || ''}
                      onChange={e => {
                        const v = e.target.value;
                        setValue('assistant_professor_id', v || null, { shouldDirty: true });
                        const pick = professors.find(p => String(p.id) === String(v));
                        if (pick?.is_field_manager) setValue('assistant_professor_pay', 0, { shouldDirty: true });
                      }}>
                      <option value="">None</option>
                      {professors.map(p => (
                        <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}{p.is_field_manager ? ' (FM)' : ''}</option>
                      ))}
                    </Select>
                    {assistWarn && <div className="mt-1 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 inline-block">⚠ Assigned prof is {assistWarn}</div>}
                  </div>
                  {(() => {
                    const assistIsFM = professors.find(p => String(p.id) === String(assistId))?.is_field_manager;
                    const payVal = assistIsFM ? 0 : watch('assistant_professor_pay');
                    return (
                      <div className="flex flex-col gap-1">
                        <label className={`text-xs font-medium ${viewMode ? 'text-gray-500' : 'text-gray-700'}`}>Assist Pay</label>
                        {viewMode ? (
                          <div className="text-sm text-gray-800 py-1.5">{payVal === '' || payVal == null ? <span className="text-gray-400">—</span> : `$${payVal}`}</div>
                        ) : (
                          <input type="number" step="0.01" value={payVal ?? ''}
                            disabled={assistIsFM}
                            onChange={e => setValue('assistant_professor_pay', e.target.value || null, { shouldDirty: true })}
                            title={assistIsFM ? 'Field Managers are not paid for class sessions' : undefined}
                            className={`rounded border border-gray-300 px-2 py-1.5 text-sm ${assistIsFM ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`} placeholder="$" />
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
            <div className="grid grid-cols-5 gap-4 mt-4">
              <Input label="Parent Cost *" type="number" step="0.01" prefix="$" {...register('parent_cost')} />
              <Input label="Our Cut (per session) *" type="number" step="0.01" prefix="$" {...register('our_cut')} />
              <Input label="Lab Fee" type="number" step="0.01" prefix="$" {...register('lab_fee')} />
              {(parseFloat(watch('lab_fee')) > 0) && (
                <>
                  <Toggle label="Lab Fee Link Created" checked={!!watch('stripe_payment_link_id')}
                    onChange={v => {
                      if (!v) { setValue('stripe_payment_link_id', null, { shouldDirty: true }); setValue('stripe_payment_link_url', null, { shouldDirty: true }); setValue('stripe_payment_link_qr_url', null, { shouldDirty: true }); }
                    }} />
                  <Toggle label="Lab Fee Link Not Needed" checked={!!watch('lab_fee_link_not_needed')}
                    onChange={v => setValue('lab_fee_link_not_needed', v ? 1 : 0, { shouldDirty: true })} />
                </>
              )}
              {(() => {
                const ourCut = parseFloat(watch('our_cut')) || 0;
                const labFee = parseFloat(watch('lab_fee')) || 0;
                const enrolled = parseInt(prog.number_enrolled) || 0;
                const billable = (prog.sessions || []).filter(s => !s.not_billed);
                const isPerStudent = prog.class_pricing_type_name === 'Per Student';

                // Billable cost calculation
                let billableCost = 0;
                if (isPerStudent) {
                  // Per student: (Our Cut + Lab Fee) × enrolled students × billable sessions
                  const perStudentPerSession = ourCut + labFee;
                  billableCost = perStudentPerSession * enrolled * billable.length;
                } else {
                  // Flat fee: Our Cut × billable sessions
                  billableCost = ourCut * billable.length;
                }

                const perSession = billable.length > 0 && ourCut > 0 ? (isPerStudent ? (ourCut + labFee) * enrolled : ourCut) : null;
                const totalProfPay = billable.reduce((sum, s) => sum + (parseFloat(s.professor_pay) || 0) + (parseFloat(s.assistant_pay) || 0), 0);

                return (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-700">Per Session Revenue</label>
                      <span className="text-sm text-gray-500 py-1.5 px-3 bg-gray-50 rounded border border-gray-200">
                        {perSession ? formatCurrency(perSession) : '—'}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {isPerStudent ? `Per Student × ${enrolled} enrolled` : 'Flat Fee'}
                        {' · '}{billable.length} billable
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-700">Total Billable</label>
                      <span className={`text-sm font-medium py-1.5 px-3 rounded border ${billableCost > 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                        {billableCost > 0 ? formatCurrency(billableCost) : '—'}
                      </span>
                      {totalProfPay > 0 && billableCost > 0 && (
                        <span className={`text-[10px] ${totalProfPay > billableCost ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                          Prof cost: {formatCurrency(totalProfPay)} {totalProfPay > billableCost ? '(exceeds revenue!)' : `(${Math.round(totalProfPay / billableCost * 100)}% of revenue)`}
                        </span>
                      )}
                    </div>
                  </>
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
              <Input label="Start Time *" type="time" {...register('start_time')} />
              <Input label="Class Length (minutes) *" type="number" {...register('class_length_minutes')} />
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
              <label className="text-xs font-medium text-gray-700 block mb-2">Day of Week * <span className="text-gray-400 font-normal">(at least one)</span></label>
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
                holidays={ref.holidays || []}
                programClassId={prog.class_id}
                defaultTime={prog.start_time}
                program={prog}
              />
            </Section>
          )}

          {/* Roster — now includes enrollment info */}
          {!isNew && (() => {
            const rosterCount = (prog.roster || []).filter(r => !r.date_dropped).length;
            const enrolledVal = parseInt(watch('number_enrolled')) || 0;
            const maxStudentsVal = parseInt(watch('maximum_students')) || 0;
            const mismatch = rosterCount > 0 && enrolledVal !== rosterCount;
            const overMax = maxStudentsVal > 0 && enrolledVal > maxStudentsVal;
            return (
              <Section title={`Roster (${rosterCount}${prog.maximum_students ? ' / ' + prog.maximum_students : ''} students)`} defaultOpen={true}>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <Input label="Enrolled #" type="number" max={maxStudentsVal || undefined}
                      {...register('number_enrolled')}
                      className={overMax ? 'border-red-400 bg-red-50 text-red-700' : ''} />
                    {overMax && (
                      <div className="text-[10px] text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-medium mt-1 inline-block">
                        Enrolled exceeds Max ({maxStudentsVal}) — save will be blocked
                      </div>
                    )}
                    {!overMax && mismatch && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-medium">
                          Roster has {rosterCount} — enrolled shows {enrolledVal}
                        </span>
                        <button type="button" onClick={() => setValue('number_enrolled', rosterCount, { shouldDirty: true })}
                          className="text-[10px] text-[#1e3a5f] hover:underline font-medium">Sync</button>
                      </div>
                    )}
                  </div>
                  <Input label="Min Students *" type="number" {...register('minimum_students')} />
                  <Input label="Max Students *" type="number" {...register('maximum_students')} />
                </div>
                <RosterPanel
                  programId={id}
                  roster={prog.roster || []}
                  maxStudents={watch('maximum_students') || prog.maximum_students}
                  numberEnrolled={enrolledVal}
                  onEnrolledSync={(count) => setValue('number_enrolled', count, { shouldDirty: true })}
                />
              </Section>
            );
          })()}

          {/* Invoicing (below Roster) */}
          <Section title={(() => {
            const paid = watch('invoice_paid');
            const sent = watch('invoice_date_sent');
            const qbNum = prog.qb_invoice_number;
            const qbStatus = prog.qb_invoice_status;
            const status = paid ? 'Paid' : qbStatus === 'Paid' ? 'Paid (QB)' : sent ? 'Sent' : 'Not Sent';
            const color = paid || qbStatus === 'Paid' ? 'text-green-600' : sent ? 'text-amber-600' : 'text-red-500';
            return <span>Invoicing <span className={`text-xs font-medium ${color}`}>({status})</span>{qbNum ? <span className="text-xs text-gray-400 ml-2">#{qbNum}</span> : ''}</span>;
          })()} defaultOpen={false}>
            <div className="grid grid-cols-4 gap-4">
              <Toggle label="Invoice Needed" checked={!!watch('invoice_needed')} onChange={v => setValue('invoice_needed', v ? 1 : 0, { shouldDirty: true })} />
              <Toggle label="Invoice Paid" checked={!!watch('invoice_paid')} onChange={v => setValue('invoice_paid', v ? 1 : 0, { shouldDirty: true })} />
              <Input label="Invoice Date Sent" type="date" {...register('invoice_date_sent')} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Quick Actions</label>
                <button type="button" onClick={() => { setValue('invoice_date_sent', new Date().toISOString().split('T')[0], { shouldDirty: true }); }}
                  className="text-xs text-[#1e3a5f] hover:underline text-left py-1.5">Mark Sent Today</button>
              </div>
            </div>
            {prog.qb_invoice_number && (
              <div className="mt-3 flex items-center gap-4 text-xs">
                <span className="text-gray-500">QB Invoice: <span className="font-medium text-gray-800">#{prog.qb_invoice_number}</span></span>
                {prog.qb_invoice_status && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    prog.qb_invoice_status === 'Paid' ? 'bg-green-100 text-green-700' :
                    prog.qb_invoice_status === 'Overdue' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{prog.qb_invoice_status}</span>
                )}
                {prog.qb_invoice_balance > 0 && <span className="text-gray-400">Balance: {formatCurrency(prog.qb_invoice_balance)}</span>}
              </div>
            )}
            <div className="mt-3">
              <Input label="Invoice Notes" {...register('invoice_notes')} />
            </div>
          </Section>

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

        {/* Audit History */}
          {!isNew && <AuditHistory table="program" recordId={id} />}

        {/* Sticky Footer — only visible in edit mode */}
        {!viewMode && (
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
        )}
      </form>
      </ViewModeProvider>
      </FormProvider>
    </AppShell>
  );
}
