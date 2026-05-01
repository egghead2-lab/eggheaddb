import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { SearchSelect } from '../components/ui/SearchSelect';
import { useProfessorList } from '../hooks/useReferenceData';
import { formatDate, formatCurrency } from '../lib/utils';

function defaultRange() {
  // Default to last 14 days
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 13);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export default function PaystubCheckPage() {
  const [profId, setProfId] = useState('');
  const [{ start, end }, setRange] = useState(defaultRange());

  const { data: profsData } = useProfessorList({ assignable: 0 });
  const professors = profsData?.data || [];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['paystub-check', profId, start, end],
    queryFn: () => api.get('/payroll/paystub-check', { params: { professor_id: profId, start, end } }).then(r => r.data),
    enabled: !!profId && !!start && !!end,
  });

  const cats = data?.categories;
  const totals = data?.totals;

  return (
    <AppShell>
      <PageHeader title="Paystub Check" />
      <div className="p-6 max-w-5xl">
        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Professor</label>
              <SearchSelect value={profId} onChange={setProfId}
                options={professors}
                displayKey="display_name"
                valueKey="id"
                placeholder="Search professors…" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Start Date</label>
              <input type="date" value={start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))}
                className="block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">End Date</label>
              <input type="date" value={end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))}
                className="block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
            </div>
          </div>
        </div>

        {!profId ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-400">
            Pick a professor to see their paystub
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : data ? (
          <>
            {/* Top totals */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Stat label="Pay" value={formatCurrency(totals.pay_total)} />
              <Stat label="Reimbursements" value={formatCurrency(totals.reimbursement_total)} />
              <Stat label="Grand Total" value={formatCurrency(totals.grand_total)} highlight />
            </div>

            {/* Category breakdowns */}
            <Section title="Class Sessions" count={cats.class_sessions.count}
              subtotal={`Pay ${formatCurrency(cats.class_sessions.pay_total)} · Reimb ${formatCurrency(cats.class_sessions.reimbursement_total)}`}>
              <ClassSessionsTable rows={cats.class_sessions.rows} />
            </Section>

            <Section title="Parties" count={cats.party_sessions.count}
              subtotal={`Pay ${formatCurrency(cats.party_sessions.pay_total)} · Drive ${formatCurrency(cats.party_sessions.drive_fee_total)} · Tip ${formatCurrency(cats.party_sessions.tip_total)} · Reimb ${formatCurrency(cats.party_sessions.reimbursement_total)}`}>
              <PartiesTable rows={cats.party_sessions.rows} />
            </Section>

            <Section title="Misc Pay" count={cats.misc_pay.count}
              subtotal={`Pay ${formatCurrency(cats.misc_pay.pay_total)} · Reimb ${formatCurrency(cats.misc_pay.reimbursement_total)}`}>
              <MiscTable rows={cats.misc_pay.rows} />
            </Section>

            <Section title="Training / Onboarding" count={cats.training.count}
              subtotal={formatCurrency(cats.training.pay_total)}>
              <TrainingTable rows={cats.training.rows} />
            </Section>

            <Section title="Mileage" count={cats.mileage.count}
              subtotal={formatCurrency(cats.mileage.total)}>
              <MileageTable rows={cats.mileage.rows} />
            </Section>

            <Section title="Gas Reimbursement" count={cats.gas_reimbursement.count}
              subtotal={formatCurrency(cats.gas_reimbursement.total)}>
              <GasTable rows={cats.gas_reimbursement.rows} />
            </Section>

            {isFetching && <div className="text-xs text-gray-400 mt-2">Refreshing…</div>}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`bg-white rounded-lg border px-4 py-3 ${highlight ? 'border-[#1e3a5f] bg-[#1e3a5f]/5' : 'border-gray-200'}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${highlight ? 'text-[#1e3a5f]' : 'text-gray-800'}`}>{value}</div>
    </div>
  );
}

function Section({ title, count, subtotal, children }) {
  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold text-gray-800">
          {title}
          <span className="ml-2 text-[11px] text-gray-400 font-normal">{count} {count === 1 ? 'item' : 'items'}</span>
        </h2>
        <span className="text-xs font-medium text-gray-700 tabular-nums">{subtotal}</span>
      </div>
      {count === 0 ? (
        <div className="bg-gray-50 rounded text-center py-3 text-xs text-gray-400">No entries in this range</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">{children}</div>
      )}
    </div>
  );
}

function ClassSessionsTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Lesson</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600 w-20">Role</th>
          <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">Sub</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Pay</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Reimb</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <td className="px-3 py-1.5 text-xs text-gray-600">{formatDate(r.session_date)}</td>
            <td className="px-3 py-1.5 text-xs">{r.program_nickname}</td>
            <td className="px-3 py-1.5 text-xs text-gray-500">{r.lesson_name || '—'}</td>
            <td className="px-3 py-1.5 text-xs">{r.role}{r.assist_pay_flag ? ` (${r.assist_pay_flag})` : ''}</td>
            <td className="px-3 py-1.5 text-center text-xs">{r.is_substitute ? '✓' : ''}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(r.pay_amount)}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-500">{r.reimbursement_amount > 0 ? formatCurrency(r.reimbursement_amount) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PartiesTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Party</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600 w-20">Role</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-20">Pay</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-20">Drive</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-20">Tip</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-20">Reimb</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <td className="px-3 py-1.5 text-xs text-gray-600">{formatDate(r.session_date)}</td>
            <td className="px-3 py-1.5 text-xs">{r.program_nickname}</td>
            <td className="px-3 py-1.5 text-xs">{r.role}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(r.pay_amount)}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-500">{r.drive_fee > 0 ? formatCurrency(r.drive_fee) : '—'}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-500">{r.tip_amount > 0 ? formatCurrency(r.tip_amount) : '—'}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-500">{r.total_reimbursement > 0 ? formatCurrency(r.total_reimbursement) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MiscTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Pay</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Reimb</th>
          <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Reviewed</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r, i) => {
          const total = parseFloat(r.manual_total_override) || parseFloat(r.total_pay) || parseFloat(r.dollar_amount)
            || (parseFloat(r.hourly_pay || 0) * parseFloat(r.hours || 0));
          return (
            <tr key={i} className="hover:bg-gray-50/50">
              <td className="px-3 py-1.5 text-xs text-gray-600">{formatDate(r.pay_date)}</td>
              <td className="px-3 py-1.5 text-xs">{r.pay_type}{r.subtype ? ` · ${r.subtype}` : ''}</td>
              <td className="px-3 py-1.5 text-xs text-gray-500">{r.description || r.program_nickname || r.location || '—'}</td>
              <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(total)}</td>
              <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-500">{r.total_reimbursement > 0 ? formatCurrency(r.total_reimbursement) : '—'}</td>
              <td className="px-3 py-1.5 text-center text-xs">{r.is_reviewed ? '✓' : <span className="text-amber-600">pending</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TrainingTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Trainer</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Trainual</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Virtual</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">BG Check</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <td className="px-3 py-1.5 text-xs text-gray-600">{formatDate(r.training_date)}</td>
            <td className="px-3 py-1.5 text-xs">{r.trainer || '—'}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-500">{r.trainual_pay > 0 ? formatCurrency(r.trainual_pay) : '—'}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-500">{r.virtual_training_pay > 0 ? formatCurrency(r.virtual_training_pay) : '—'}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-500">{r.bg_check_cost > 0 ? formatCurrency(r.bg_check_cost) : '—'}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency((parseFloat(r.total_training_pay) || 0) + (parseFloat(r.bg_check_cost) || 0))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MileageTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Week</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Miles</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Rate</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600 w-24">Status</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <td className="px-3 py-1.5 text-xs text-gray-600">{formatDate(r.week_start)} – {formatDate(r.week_end)}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">{r.total_miles}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-500">${parseFloat(r.reimbursement_rate).toFixed(3)}</td>
            <td className="px-3 py-1.5 text-xs text-gray-500">{r.status}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(r.reimbursement_total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GasTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Cycle</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600">Range</th>
          <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Sessions</th>
          <th className="text-left px-3 py-2 font-medium text-gray-600 w-24">Status</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50/50">
            <td className="px-3 py-1.5 text-xs">{r.cycle_name}</td>
            <td className="px-3 py-1.5 text-xs text-gray-600">{formatDate(r.start_date)} – {formatDate(r.end_date)}</td>
            <td className="px-3 py-1.5 text-center text-xs">{r.num_sessions}</td>
            <td className="px-3 py-1.5 text-xs text-gray-500">{r.status}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatCurrency(r.total_amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
