import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getBulkSetup, saveBulkPrograms } from '../api/bulk-input';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatCurrency } from '../lib/utils';
import PastProgramsPanel from '../components/PastProgramsPanel';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','M-F'];
const chevronSvg = "bg-[length:16px_16px] bg-[position:right_0.5rem_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]";
const dd = `w-full rounded border border-gray-300 pl-3 pr-8 py-1.5 text-sm appearance-none bg-white focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] ${chevronSvg}`;
const ii = "w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]";
const dds = `w-full rounded border border-gray-300 pl-2 pr-6 py-1 text-xs appearance-none bg-white focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] ${chevronSvg}`;
const iis = "w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]";

// --- Helpers ---
function isInvalidDay(dateStr, day, freqMode) {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const actual = names[dt.getDay()];
  if (day === 'M-F') return actual === 'Saturday' || actual === 'Sunday';
  if (freqMode === 'weekly') return actual !== day;
  return false;
}

function generateDates(startDateStr, sessions, day, freqMode, skipSet) {
  if (!startDateStr || sessions <= 0) return { valid: [], skipped: [] };
  if (isInvalidDay(startDateStr, day, freqMode)) return { valid: [], skipped: [] };
  const [y, m, d] = startDateStr.split('-').map(Number);
  const toKey = dt => dt.toISOString().split('T')[0];
  const fmt = dt => `${dt.getMonth()+1}/${dt.getDate()}/${String(dt.getFullYear()).slice(-2)}`;
  const valid = [], skipped = [];
  const cap = Math.min(sessions, 20);
  if (freqMode === 'weekly') {
    let count = 0, i = 0;
    while (count < cap && i < 200) {
      const dt = new Date(y, m - 1, d + i * 7);
      if (skipSet.has(toKey(dt))) skipped.push(fmt(dt));
      else { valid.push({ key: toKey(dt), display: fmt(dt) }); count++; }
      i++;
    }
  } else {
    let count = 0;
    const dt = new Date(y, m - 1, d);
    let iter = 0;
    while (count < cap && iter < 300) {
      const dow = dt.getDay();
      if (dow !== 0 && dow !== 6) {
        if (skipSet.has(toKey(dt))) skipped.push(fmt(new Date(dt)));
        else { valid.push({ key: toKey(new Date(dt)), display: fmt(new Date(dt)) }); count++; }
      }
      dt.setDate(dt.getDate() + 1);
      iter++;
    }
  }
  return { valid, skipped };
}

function makeNickname(locNick, grades, classCode, existingSet) {
  const base = `${locNick}${grades ? ` (${grades})` : ''} - ${classCode || 'TBD'}`;
  let name = base;
  let letter = 0;
  while (existingSet.has(name.toUpperCase())) {
    name = `${base} (${String.fromCharCode(65 + letter)})`;
    letter++;
  }
  existingSet.add(name.toUpperCase());
  return name;
}

function StepHeader({ current }) {
  const labels = ['Setup', 'Program Details', 'Enrollment', 'Dates', 'Costs', 'Review & Save'];
  return (
    <div className="flex gap-1 mb-6">
      {labels.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={step} className={`flex-1 text-center py-2 text-xs font-medium rounded ${
            active ? 'bg-[#1e3a5f] text-white' : done ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-400'
          }`}>{step}. {label}</div>
        );
      })}
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel, nextDisabled, loading }) {
  return (
    <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-200">
      {onBack ? <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">← Back</button> : <div />}
      <Button onClick={onNext} disabled={nextDisabled || loading}>
        {loading ? 'Loading…' : (nextLabel ?? 'Next →')}
      </Button>
    </div>
  );
}

function BulkBtn({ onClick, label }) {
  return <button type="button" onClick={onClick} className="px-1.5 py-1 text-xs bg-[#1e3a5f] hover:bg-[#152a47] text-white rounded font-medium whitespace-nowrap flex-shrink-0">
    {label ?? '↓'}
  </button>;
}

export default function BulkInputPage() {
  const [step, setStep] = useState(1);
  const { data: setupData, isLoading } = useQuery({ queryKey: ['bulk-setup'], queryFn: getBulkSetup });
  const setup = setupData?.data || {};

  // Step 1
  const [rowCount, setRowCount] = useState(5);
  const [mode, setMode] = useState('');
  const [contractor, setContractor] = useState('');
  const [locationId, setLocationId] = useState('');

  // Step 2
  const [globalStatus, setGlobalStatus] = useState('');
  const [globalProgramType, setGlobalProgramType] = useState('');
  const [salesRep, setSalesRep] = useState('');
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [nickToId, setNickToId] = useState({});
  const [bulk, setBulk] = useState({ locNickname: '', programType: '', classType: '', classId: '', grades: '', startTime: '', classLength: '60', day: 'Monday', notes: '' });

  // Accumulated program data
  const [programData, setProgramData] = useState([]);
  const [enrollRows, setEnrollRows] = useState([]);

  // Step 4
  const [freqMode, setFreqMode] = useState('weekly');
  const [skipDates, setSkipDates] = useState(['']);
  const [rows4, setRows4] = useState([]);
  const [bulkStartDate, setBulkStartDate] = useState('');

  // Step 5
  const [rows5, setRows5] = useState([]);
  const [bulkPerCost, setBulkPerCost] = useState('');

  // Save
  const [transitioning, setTransitioning] = useState(false);

  const skipSet = useMemo(() => new Set(skipDates.filter(Boolean)), [skipDates]);

  // Locations filtered by mode selection
  const filteredLocations = useMemo(() => {
    if (!setup.locations) return [];
    if (mode === 'contractor' && contractor) return setup.locations.filter(l => String(l.contractor_id) === contractor);
    if (mode === 'location' && locationId) return setup.locations.filter(l => String(l.id) === locationId);
    return [];
  }, [setup.locations, mode, contractor, locationId]);

  // Three-level filtering: Program Type → Class Type (subject) → Class Name
  const programTypeNames = useMemo(() => {
    const types = new Set();
    (setup.programTypes || []).forEach(t => types.add(t.program_type_name));
    return [...types].sort();
  }, [setup.programTypes]);

  function getClassTypesForProgramType(progType) {
    const types = new Set();
    (setup.classes || []).forEach(c => {
      if ((!progType || c.program_type_name === progType) && c.class_type_name) types.add(c.class_type_name);
    });
    return [...types].sort();
  }

  function getFilteredClasses(progType, clsType) {
    return (setup.classes || []).filter(c =>
      (!progType || c.program_type_name === progType) &&
      (!clsType || c.class_type_name === clsType)
    );
  }

  const classById = useMemo(() => {
    const m = {};
    (setup.classes || []).forEach(c => { m[c.id] = c; });
    return m;
  }, [setup.classes]);

  // Computed dates for step 4
  const computed4 = useMemo(() =>
    rows4.map((r, i) => {
      const prog = programData[i];
      if (!prog) return { valid: [], skipped: [], invalid: false };
      const invalid = r.startDate ? isInvalidDay(r.startDate, prog.day, freqMode) : false;
      if (invalid || !r.startDate || !r.sessions) return { valid: [], skipped: [], invalid };
      return { ...generateDates(r.startDate, Number(r.sessions), prog.day, freqMode, skipSet), invalid: false };
    }), [rows4, programData, freqMode, skipSet]);

  // --- Row helpers ---
  function makeBlankRow() {
    const loc = locations[0] || '';
    return { locNickname: loc, locId: nickToId[loc] || '', programType: '', classType: '', classId: '', grades: '', startTime: '', classLength: '60', day: 'Monday', notes: '' };
  }

  function updateRow(i, field, value) {
    setRows(prev => {
      const next = [...prev];
      const row = { ...next[i], [field]: value };
      if (field === 'locNickname') row.locId = nickToId[value] || '';
      if (field === 'programType') { row.classType = ''; row.classId = ''; }
      if (field === 'classType') {
        const filtered = getFilteredClasses(row.programType, value);
        row.classId = filtered[0]?.id || '';
      }
      next[i] = row;
      return next;
    });
  }

  function bulkFill(field, value) {
    setBulk(prev => ({ ...prev, [field]: value }));
    setRows(prev => prev.map(r => {
      const updated = { ...r, [field]: value };
      if (field === 'locNickname') updated.locId = nickToId[value] || '';
      if (field === 'programType') { updated.classType = ''; updated.classId = ''; }
      if (field === 'classType') {
        const filtered = getFilteredClasses(updated.programType, value);
        updated.classId = filtered[0]?.id || '';
      }
      return updated;
    }));
  }

  function copyFromPrevious(i) {
    if (i === 0) return;
    setRows(prev => { const next = [...prev]; next[i] = { ...prev[i - 1] }; return next; });
  }

  // --- Step transitions ---
  function goToStep2() {
    let locs = [], nti = {};
    if (mode === 'contractor') {
      const filtered = (setup.locations || []).filter(l => String(l.contractor_id) === contractor).sort((a, b) => a.nickname.localeCompare(b.nickname));
      locs = filtered.map(l => l.nickname);
      nti = Object.fromEntries(filtered.map(l => [l.nickname, String(l.id)]));
    } else {
      const loc = (setup.locations || []).find(l => String(l.id) === locationId);
      if (loc) { locs = [loc.nickname]; nti = { [loc.nickname]: String(loc.id) }; }
    }
    setLocations(locs);
    setNickToId(nti);
    if (!globalStatus && setup.classStatuses?.length) setGlobalStatus(String(setup.classStatuses[0].id));
    if (!globalProgramType && setup.programTypes?.length) setGlobalProgramType(setup.programTypes[0].program_type_name);
    const initRows = Array.from({ length: rowCount }, () => ({
      locNickname: locs[0] || '', locId: nti[locs[0]] || '',
      programType: '', classType: '', classId: '',
      grades: '', startTime: '', classLength: '60', day: 'Monday', notes: '',
    }));
    setRows(initRows);
    setStep(2);
  }

  function goToStep3() {
    const existingSet = new Set((setup.existingNicknames || []).map(n => n.toUpperCase()));
    const data = rows.map(r => {
      const cls = classById[r.classId];
      const nickname = makeNickname(r.locNickname, r.grades, cls?.class_code || '', existingSet);
      return {
        nickname, day: r.day, classStatusId: globalStatus, programType: globalProgramType,
        locId: r.locId, locNickname: r.locNickname, classType: r.classType, classId: r.classId,
        className: cls?.class_name || '', classCode: cls?.class_code || '',
        grades: r.grades, startTime: r.startTime, classLength: r.classLength, notes: r.notes,
      };
    });
    setProgramData(data);
    setEnrollRows(data.map(() => ({ min: '0', max: '20' })));
    setStep(3);
  }

  function goToStep4() {
    setProgramData(prev => prev.map((p, i) => ({ ...p, min: enrollRows[i]?.min || '', max: enrollRows[i]?.max || '' })));
    setRows4(programData.map(() => ({ startDate: '', sessions: '' })));
    setBulkStartDate('');
    setStep(4);
  }

  function goToStep5() {
    const existingSet = new Set((setup.existingNicknames || []).map(n => n.toUpperCase()));
    const batchSet = new Set();
    const updated = programData.map((p, i) => {
      const r4 = rows4[i];
      const c4 = computed4[i];
      const base = { ...p, startDate: r4.startDate, sessions: String(r4.sessions ?? ''),
        generatedDates: c4.valid.map(v => v.display).join(', '),
        skippedDates: c4.skipped.join(', '),
        sessionKeys: c4.valid.map(v => v.key) };
      if (!r4.startDate) return base;
      const yr = new Date(r4.startDate + 'T00:00:00').getFullYear().toString().slice(-2);
      let nick = p.nickname.replace(/\s?\d{2}\s*(\([A-Z]\))?$/, '').trim();
      nick = `${nick} ${yr}`;
      let final = nick;
      let letter = 65;
      while (existingSet.has(final.toUpperCase()) || batchSet.has(final.toUpperCase())) {
        final = `${nick} (${String.fromCharCode(letter++)})`;
      }
      batchSet.add(final.toUpperCase());
      existingSet.add(final.toUpperCase());
      return { ...base, nickname: final };
    });
    setProgramData(updated);
    setRows5(updated.map(() => ({ perCost: '' })));
    setBulkPerCost('');
    setStep(5);
  }

  function goToStep6() {
    setProgramData(prev => prev.map((p, i) => {
      const per = rows5[i]?.perCost;
      const sessions = parseInt(p.sessions || '0') || 0;
      const total = typeof per === 'number' ? per * sessions : 0;
      const loc = (setup.locations || []).find(l => String(l.id) === p.locId);
      return { ...p, perCost: per, totalPrice: total, classPricing: loc?.classPricing || '',
        tb: loc?.tb_required, livescan: loc?.livescan_required, virtus: loc?.virtus_required,
        flyer: loc?.flyer_required, contract: loc?.contract_permit_required, payment: loc?.payment_through_us };
    }));
    setStep(6);
  }

  const saveMutation = useMutation({ mutationFn: (progs) => saveBulkPrograms(progs) });

  function handleSave() {
    const progs = programData.map(p => ({
      program_nickname: p.nickname, class_status_id: p.classStatusId || 1,
      location_id: p.locId || null, class_id: p.classId || null,
      start_time: p.startTime || null, class_length_minutes: parseInt(p.classLength) || null,
      day: p.day, general_notes: p.notes || null,
      minimum_students: p.min || null, maximum_students: p.max || null,
      parent_cost: p.totalPrice || null, our_cut: p.totalPrice || null,
      first_session_date: p.sessionKeys?.[0] || null,
      last_session_date: p.sessionKeys?.[p.sessionKeys.length - 1] || null,
      session_dates: p.sessionKeys || [],
      tb_required: p.tb ? 1 : 0, livescan_required: p.livescan ? 1 : 0,
      virtus_required: p.virtus ? 1 : 0, payment_through_us: p.payment ? 1 : 0,
    }));
    saveMutation.mutate(progs);
  }

  function reset() {
    setStep(1); setMode(''); setContractor(''); setLocationId(''); setRowCount(5);
    setProgramData([]); setRows([]); setEnrollRows([]); setRows4([]); setRows5([]);
    setFreqMode('weekly'); setSkipDates(['']); setBulkStartDate(''); setBulkPerCost('');
    saveMutation.reset();
  }

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;

  // ===== RENDER =====
  return (
    <AppShell>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Bulk Program Input</h1>
      </div>
      <div className="p-6 max-w-[1600px]">
        <StepHeader current={step} />

        {/* ===== STEP 1: Setup ===== */}
        {step === 1 && (
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Setup</h2>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Number of Programs</label>
                <input type="number" min={1} max={100} value={rowCount} onChange={e => setRowCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`${ii} w-28`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Mode</label>
                <select value={mode} onChange={e => setMode(e.target.value)} className={dd}>
                  <option value="">Select…</option>
                  <option value="contractor">By Contractor</option>
                  <option value="location">By Location</option>
                </select>
              </div>
              {mode === 'contractor' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">Contractor</label>
                  <select value={contractor} onChange={e => setContractor(e.target.value)} className={`${dd} min-w-[200px]`}>
                    <option value="">Select…</option>
                    {(setup.contractors || []).map(c => <option key={c.id} value={c.id}>{c.contractor_name}</option>)}
                  </select>
                </div>
              )}
              {mode === 'location' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">Location</label>
                  <select value={locationId} onChange={e => setLocationId(e.target.value)} className={`${dd} min-w-[240px]`}>
                    <option value="">Select…</option>
                    {(setup.locations || []).map(l => <option key={l.id} value={l.id}>{l.nickname}</option>)}
                  </select>
                </div>
              )}
            </div>
            {filteredLocations.length > 0 && (
              <div className="mt-3 text-sm text-gray-500">{filteredLocations.length} active location{filteredLocations.length !== 1 ? 's' : ''} available</div>
            )}
            <NavButtons onNext={goToStep2} nextLabel="Next → Program Details"
              nextDisabled={!mode || (mode === 'contractor' && !contractor) || (mode === 'location' && !locationId)} />

            {/* Past programs at selected location */}
            {mode === 'location' && locationId && (
              <div className="mt-4">
                <PastProgramsPanel locationId={locationId} />
              </div>
            )}
          </div>
        )}

        {/* ===== STEP 2: Program Details ===== */}
        {step === 2 && (
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Program Details</h2>
            {/* Globals */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Class Status</label>
                <select value={globalStatus} onChange={e => setGlobalStatus(e.target.value)} className={dd}>
                  {(setup.classStatuses || []).map(s => <option key={s.id} value={s.id}>{s.class_status_name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Program Type</label>
                <select value={globalProgramType} onChange={e => setGlobalProgramType(e.target.value)} className={dd}>
                  {(setup.programTypes || []).map(t => <option key={t.id} value={t.program_type_name}>{t.program_type_name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Sales Rep</label>
                <select value={salesRep} onChange={e => setSalesRep(e.target.value)} className={dd}>
                  <option value="">None</option>
                  {(setup.salesUsers || []).map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                </select>
              </div>
            </div>

            {/* Table with inline bulk fill row */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">Loc ID</th>
                    {mode === 'contractor' && <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">Location</th>}
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">Program Type</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">Class Type</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">Class Name</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">Grades</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">Start Time</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">Length</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">Day</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">Notes</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs"></th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 text-xs"></th>
                  </tr>
                  {/* Bulk fill row */}
                  <tr className="bg-[#1e3a5f]/5 border-b-2 border-[#1e3a5f]/20">
                    <td className={`px-2 py-1 text-center text-[10px] text-blue-400`}>—</td>
                    {mode === 'contractor' && (
                      <td className="px-2 py-1"><div className="flex items-center gap-0.5">
                        <select value={bulk.locNickname} onChange={e => setBulk(p => ({ ...p, locNickname: e.target.value }))} className={`w-full ${dds} text-[10px] bg-blue-50`}>
                          {locations.map(l => <option key={l}>{l}</option>)}
                        </select>
                        <BulkBtn onClick={() => bulkFill('locNickname', bulk.locNickname)} />
                      </div></td>
                    )}
                    <td className="px-2 py-1"><div className="flex items-center gap-0.5">
                      <select value={bulk.programType} onChange={e => setBulk(p => ({ ...p, programType: e.target.value, classType: '', classId: '' }))} className={`w-full ${dds} text-[10px] bg-blue-50`}>
                        <option value="">All</option>
                        {programTypeNames.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <BulkBtn onClick={() => bulkFill('programType', bulk.programType)} />
                    </div></td>
                    <td className="px-2 py-1"><div className="flex items-center gap-0.5">
                      <select value={bulk.classType} onChange={e => { const v = e.target.value; setBulk(p => ({ ...p, classType: v, classId: getFilteredClasses(bulk.programType, v)[0]?.id || '' })); }} className={`w-full ${dds} text-[10px] bg-blue-50`}>
                        <option value="">All</option>
                        {getClassTypesForProgramType(bulk.programType).map(t => <option key={t}>{t}</option>)}
                      </select>
                      <BulkBtn onClick={() => bulkFill('classType', bulk.classType)} />
                    </div></td>
                    <td className="px-2 py-1"><div className="flex items-center gap-0.5">
                      <select value={bulk.classId} onChange={e => setBulk(p => ({ ...p, classId: e.target.value }))} className={`w-full ${dds} text-[10px] bg-blue-50`}>
                        <option value="">Select…</option>
                        {getFilteredClasses(bulk.programType, bulk.classType).map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
                      </select>
                      <BulkBtn onClick={() => setRows(prev => prev.map(r => ({ ...r, classId: bulk.classId })))} />
                    </div></td>
                    <td className="px-2 py-1"><div className="flex items-center gap-0.5">
                      <input value={bulk.grades} onChange={e => setBulk(p => ({ ...p, grades: e.target.value }))} placeholder="K-5" className={`w-full ${iis} text-[10px] bg-blue-50`} />
                      <BulkBtn onClick={() => bulkFill('grades', bulk.grades)} />
                    </div></td>
                    <td className="px-2 py-1"><div className="flex items-center gap-0.5">
                      <input type="time" step="60" value={bulk.startTime} onChange={e => setBulk(p => ({ ...p, startTime: e.target.value }))} className={`w-full ${iis} text-[10px] bg-blue-50`} />
                      <BulkBtn onClick={() => bulkFill('startTime', bulk.startTime)} />
                    </div></td>
                    <td className="px-2 py-1"><div className="flex items-center gap-0.5">
                      <input type="number" value={bulk.classLength} onChange={e => setBulk(p => ({ ...p, classLength: e.target.value }))} placeholder="60" className={`w-14 ${iis} text-[10px] bg-blue-50`} />
                      <BulkBtn onClick={() => bulkFill('classLength', bulk.classLength)} />
                    </div></td>
                    <td className="px-2 py-1"><div className="flex items-center gap-0.5">
                      <select value={bulk.day} onChange={e => setBulk(p => ({ ...p, day: e.target.value }))} className={`w-full ${dds} text-[10px] bg-blue-50`}>
                        {DAYS.map(d => <option key={d}>{d}</option>)}
                      </select>
                      <BulkBtn onClick={() => bulkFill('day', bulk.day)} />
                    </div></td>
                    <td className="px-2 py-1"><div className="flex items-center gap-0.5">
                      <input value={bulk.notes} onChange={e => setBulk(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" className={`w-full ${iis} text-[10px] bg-blue-50`} />
                      <BulkBtn onClick={() => bulkFill('notes', bulk.notes)} />
                    </div></td>
                    <td className="px-2 py-1"></td>
                    <td className={`px-2 py-1 text-center text-[10px] text-blue-500 font-medium`}>Bulk</td>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className={`px-2 py-1 font-mono text-gray-400 whitespace-nowrap px-2`}>{r.locId || '—'}</td>
                      {mode === 'contractor' && (
                        <td className="px-2 py-1"><select value={r.locNickname} onChange={e => updateRow(i, 'locNickname', e.target.value)} className={`w-full ${dds}`}>
                          {locations.map(l => <option key={l}>{l}</option>)}
                        </select></td>
                      )}
                      <td className="px-2 py-1"><select value={r.programType} onChange={e => updateRow(i, 'programType', e.target.value)} className={`w-full ${dds}`}>
                        <option value="">All</option>
                        {programTypeNames.map(t => <option key={t}>{t}</option>)}
                      </select></td>
                      <td className="px-2 py-1"><select value={r.classType} onChange={e => updateRow(i, 'classType', e.target.value)} className={`w-full ${dds}`}>
                        <option value="">All</option>
                        {getClassTypesForProgramType(r.programType).map(t => <option key={t}>{t}</option>)}
                      </select></td>
                      <td className="px-2 py-1"><select value={r.classId} onChange={e => updateRow(i, 'classId', e.target.value)} className={`w-full ${dds}`}>
                        <option value="">Select…</option>
                        {getFilteredClasses(r.programType, r.classType).map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
                      </select></td>
                      <td className="px-2 py-1"><input value={r.grades} onChange={e => updateRow(i, 'grades', e.target.value)} placeholder="K-5" className={`w-full ${iis}`} /></td>
                      <td className="px-2 py-1"><input type="time" step="60" value={r.startTime} onChange={e => updateRow(i, 'startTime', e.target.value)} className={`w-full ${iis}`} /></td>
                      <td className="px-2 py-1"><input type="number" value={r.classLength} onChange={e => updateRow(i, 'classLength', e.target.value)} placeholder="60" className={`w-20 ${iis}`} /></td>
                      <td className="px-2 py-1"><select value={r.day} onChange={e => updateRow(i, 'day', e.target.value)} className={`w-full ${dds}`}>
                        {DAYS.map(d => <option key={d}>{d}</option>)}
                      </select></td>
                      <td className="px-2 py-1"><input value={r.notes} onChange={e => updateRow(i, 'notes', e.target.value)} placeholder="Notes" className={`w-full ${iis}`} /></td>
                      <td className={`px-2 py-1 text-center px-2`}><button onClick={() => setRows(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">✕</button></td>
                      <td className={`px-2 py-1 px-2`}><button onClick={() => copyFromPrevious(i)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 hover:bg-gray-100 text-gray-500 whitespace-nowrap">Copy ↑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setRows(p => [...p, makeBlankRow()])} className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium">+ Add Row</button>
            <NavButtons onBack={() => setStep(1)} onNext={goToStep3} nextLabel="Next → Enrollment" nextDisabled={rows.length === 0} />
          </div>
        )}

        {/* ===== STEP 3: Enrollment ===== */}
        {step === 3 && (
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Enrollment</h2>
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50">
                  {['Program Nickname','Day','Min','Max'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">{h}</th>)}
                </tr></thead>
                <tbody>
                  {programData.map((p, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className={`px-2 py-1 px-3 py-2 font-medium text-gray-800`}>{p.nickname}</td>
                      <td className={`px-2 py-1 px-3 py-2 text-gray-600`}>{p.day}</td>
                      <td className={`px-2 py-1 w-20 px-2`}><input type="number" min={0} value={enrollRows[i]?.min ?? '0'}
                        onChange={e => setEnrollRows(prev => { const n = [...prev]; n[i] = { ...n[i], min: e.target.value }; return n; })} className={`w-full ${iis}`} /></td>
                      <td className={`px-2 py-1 w-20 px-2`}><input type="number" min={0} value={enrollRows[i]?.max ?? '20'}
                        onChange={e => setEnrollRows(prev => { const n = [...prev]; n[i] = { ...n[i], max: e.target.value }; return n; })} className={`w-full ${iis}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <NavButtons onBack={() => setStep(2)} onNext={goToStep4} nextLabel="Next → Dates" />
          </div>
        )}

        {/* ===== STEP 4: Dates ===== */}
        {step === 4 && (
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Dates</h2>
            <div className="flex items-center gap-4 mb-4">
              <span className="text-xs font-medium text-gray-700">Frequency</span>
              {['weekly', 'daily'].map(f => (
                <label key={f} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" checked={freqMode === f} onChange={() => setFreqMode(f)} className="text-blue-500" />
                  {f === 'weekly' ? 'Once per week' : 'Every day (skip weekends)'}
                </label>
              ))}
            </div>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs font-medium text-gray-700 mb-2">Skip Dates (apply to all)</p>
              <div className="flex flex-wrap gap-2 items-center">
                {skipDates.map((d, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input type="date" value={d} onChange={e => setSkipDates(prev => { const n = [...prev]; n[i] = e.target.value; return n; })} className={iis} />
                    <button onClick={() => setSkipDates(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                ))}
                <button onClick={() => setSkipDates(prev => [...prev, ''])} className="text-xs px-2 py-1 border border-blue-200 text-blue-600 rounded hover:bg-blue-50">+ Add</button>
              </div>
            </div>
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap gap-3 items-end">
              <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide self-center">Bulk Start Date</span>
              <div className="flex items-center gap-1">
                <input type="date" value={bulkStartDate} onChange={e => setBulkStartDate(e.target.value)} className={`${iis} bg-white`} />
                <BulkBtn onClick={() => { if (bulkStartDate) setRows4(prev => prev.map(r => ({ ...r, startDate: bulkStartDate }))); }} label="Apply to all ↓" />
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50">
                  {['Program Nickname', 'Day', 'Start Date', freqMode === 'weekly' ? 'Weeks' : 'Sessions', 'Generated Dates', 'Skipped Dates'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">{h}</th>)}
                </tr></thead>
                <tbody>
                  {programData.map((p, i) => {
                    const c = computed4[i];
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className={`px-2 py-1 px-2 py-1 font-medium text-gray-800 whitespace-nowrap`}>{p.nickname}</td>
                        <td className={`px-2 py-1 px-2 py-1 text-gray-600`}>{p.day}</td>
                        <td className={`px-2 py-1 px-1`}>
                          <input type="date" value={rows4[i]?.startDate ?? ''} onChange={e => setRows4(prev => { const n = [...prev]; n[i] = { ...n[i], startDate: e.target.value }; return n; })}
                            className={`${iis} ${c?.invalid ? 'border-red-400 bg-red-50 text-red-700' : ''}`} />
                          {c?.invalid && <p className="text-red-500 text-[10px] mt-0.5">Wrong day</p>}
                        </td>
                        <td className={`px-2 py-1 px-1`}><input type="number" min={1} max={20} value={rows4[i]?.sessions ?? ''}
                          onChange={e => setRows4(prev => { const n = [...prev]; n[i] = { ...n[i], sessions: parseInt(e.target.value) || '' }; return n; })}
                          className={`w-16 ${iis}`} /></td>
                        <td className={`px-2 py-1 px-2 text-gray-600 max-w-[200px] whitespace-normal leading-relaxed`}>
                          {c?.valid?.length ? c.valid.map(v => v.display).join(', ') : <span className="text-gray-300">—</span>}
                        </td>
                        <td className={`px-2 py-1 px-2 text-amber-600 max-w-[160px] whitespace-normal`}>
                          {c?.skipped?.length ? c.skipped.join(', ') : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <NavButtons onBack={() => setStep(3)} onNext={goToStep5} nextLabel="Next → Costs" loading={transitioning} />
          </div>
        )}

        {/* ===== STEP 5: Costs ===== */}
        {step === 5 && (
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Costs</h2>
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap gap-3 items-end">
              <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide self-center">Bulk Fill</span>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-medium text-gray-500 uppercase">Per-Session Cost ($)</label>
                <div className="flex items-center gap-1">
                  <input type="number" step="1" min={0} value={bulkPerCost} onChange={e => setBulkPerCost(e.target.value)} placeholder="0" className={`${iis} w-20 bg-white`} />
                  <BulkBtn onClick={() => { const n = parseFloat(bulkPerCost); setRows5(prev => prev.map(() => ({ perCost: isNaN(n) ? '' : n }))); }} label="Apply to all ↓" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50">
                  {['Program Nickname', 'Day', 'Length (min)', 'Sessions', 'Per-Session Cost ($)', 'Total Price ($)', 'Class Pricing (DB)'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">{h}</th>)}
                </tr></thead>
                <tbody>
                  {programData.map((p, i) => {
                    const per = rows5[i]?.perCost;
                    const sessions = parseInt(p.sessions || '0') || 0;
                    const total = typeof per === 'number' ? (per * sessions).toFixed(2) : '—';
                    const loc = (setup.locations || []).find(l => String(l.id) === p.locId);
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className={`px-2 py-1 px-2 font-medium text-gray-800 whitespace-nowrap`}>{p.nickname}</td>
                        <td className={`px-2 py-1 px-2 text-gray-600`}>{p.day}</td>
                        <td className={`px-2 py-1 px-2 text-gray-600 text-center`}>{p.classLength}</td>
                        <td className={`px-2 py-1 px-2 text-gray-600 text-center`}>{p.sessions}</td>
                        <td className={`px-2 py-1 px-1`}><input type="number" step="1" min={0} value={per === '' ? '' : per ?? ''}
                          onChange={e => setRows5(prev => { const n = [...prev]; n[i] = { perCost: parseFloat(e.target.value) || '' }; return n; })}
                          className={`w-20 ${iis}`} /></td>
                        <td className={`px-2 py-1 px-2 font-mono font-semibold text-gray-800 text-right`}>{total !== '—' ? `$${total}` : '—'}</td>
                        <td className={`px-2 py-1 px-2 text-gray-500`}>{loc?.classPricing || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <NavButtons onBack={() => setStep(4)} onNext={goToStep6} nextLabel="Next → Review" />
          </div>
        )}

        {/* ===== STEP 6: Review & Save ===== */}
        {step === 6 && (() => {
          const seenLocs = new Map();
          programData.forEach(p => {
            if (!seenLocs.has(p.locId)) {
              const loc = (setup.locations || []).find(l => String(l.id) === p.locId);
              if (loc) seenLocs.set(p.locId, loc);
            }
          });
          return (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-1">Review & Save</h2>
              <p className="text-sm text-gray-500 mb-4">{programData.length} programs ready to save</p>

              {saveMutation.isError && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{saveMutation.error?.response?.data?.error || 'Save failed'}</div>}
              {saveMutation.isSuccess && <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
                ✓ {saveMutation.data?.created} programs saved! <button onClick={reset} className="ml-2 underline">Start over</button>
              </div>}

              {/* Compliance */}
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Compliance by Location</h3>
              <div className="overflow-x-auto mb-5">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50">
                    {['Location', 'TB', 'Livescan', 'Virtus', 'Flyer', 'Contract', 'Payment Through Us'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {[...seenLocs.values()].map(loc => (
                      <tr key={loc.id} className="bg-white hover:bg-gray-50">
                        <td className={`px-2 py-1 px-3 py-2 font-medium text-gray-800`}>{loc.nickname}</td>
                        {[loc.tb_required, loc.livescan_required, loc.virtus_required, loc.flyer_required, loc.contract_permit_required, loc.payment_through_us].map((v, j) => (
                          <td key={j} className={`px-2 py-1 px-3 py-2 text-center`}>
                            {v ? <span className="text-amber-600 font-semibold">Yes</span> : <span className="text-gray-400">No</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Programs */}
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Programs to Save</h3>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50">
                    {['Nickname', 'Location', 'Day', 'Time', 'Dates', 'Sessions', 'Total'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-700 text-xs">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {programData.map((p, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className={`px-2 py-1 px-2 py-1.5 font-medium text-gray-800`}>{p.nickname}</td>
                        <td className={`px-2 py-1 px-2 py-1.5 text-gray-600`}>{p.locNickname}</td>
                        <td className={`px-2 py-1 px-2 py-1.5 text-gray-600`}>{p.day}</td>
                        <td className={`px-2 py-1 px-2 py-1.5 text-gray-600 whitespace-nowrap`}>{p.startTime}</td>
                        <td className={`px-2 py-1 px-2 py-1.5 text-gray-500 max-w-[160px] whitespace-normal`}>{p.generatedDates || '—'}</td>
                        <td className={`px-2 py-1 px-2 py-1.5 text-center`}>{p.sessions}</td>
                        <td className={`px-2 py-1 px-2 py-1.5 font-mono text-gray-800 text-right`}>{p.totalPrice ? `$${Number(p.totalPrice).toFixed(2)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <NavButtons onBack={() => setStep(5)} onNext={handleSave} nextLabel={`Save ${programData.length} Programs to Database`} loading={saveMutation.isPending} />
            </div>
          );
        })()}
      </div>
    </AppShell>
  );
}
