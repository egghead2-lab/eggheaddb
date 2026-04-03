import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getBulkSetup, saveBulkPrograms } from '../api/bulk-input';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatCurrency } from '../lib/utils';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','M-F'];

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
    <div className="flex items-center gap-2 mb-6">
      {labels.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={step} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 ${active ? 'text-blue-600' : done ? 'text-gray-400' : 'text-gray-300'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                active ? 'border-blue-600 bg-blue-600 text-white' : done ? 'border-gray-300 bg-gray-100 text-gray-400' : 'border-gray-200 text-gray-300'
              }`}>{done ? '✓' : step}</div>
              <span className={`text-xs font-medium hidden sm:block ${active ? 'text-blue-700' : 'text-gray-400'}`}>{label}</span>
            </div>
            {i < 5 && <div className="w-4 h-px bg-gray-200" />}
          </div>
        );
      })}
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel, nextDisabled, loading }) {
  return (
    <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
      {onBack ? <button onClick={onBack} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100">← Back</button> : <div />}
      <Button onClick={onNext} disabled={nextDisabled || loading}>
        {loading ? 'Loading…' : (nextLabel ?? 'Next →')}
      </Button>
    </div>
  );
}

function BulkBtn({ onClick, label }) {
  return <button onClick={onClick} className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded font-medium whitespace-nowrap">
    {label ?? '↓'}
  </button>;
}

const sel = "text-xs px-2 py-1 border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400";
const inp = "text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400";
const th = "border border-gray-200 px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap";
const td = "border border-gray-100 px-1 py-1";

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
  const [bulk, setBulk] = useState({ locNickname: '', classType: '', className: '', grades: '', startTime: '', classLength: '60', day: 'Monday', notes: '' });

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

  // Build class type -> class name mapping
  const classTypes = useMemo(() => {
    const types = new Set();
    (setup.classes || []).forEach(c => { if (c.class_type_name) types.add(c.class_type_name); });
    return [...types].sort();
  }, [setup.classes]);

  const typeToClasses = useMemo(() => {
    const m = {};
    (setup.classes || []).forEach(c => {
      const t = c.class_type_name || 'Other';
      if (!m[t]) m[t] = [];
      m[t].push(c);
    });
    return m;
  }, [setup.classes]);

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
    const ct = classTypes[0] || '';
    const cn = typeToClasses[ct]?.[0]?.id || '';
    const loc = locations[0] || '';
    return { locNickname: loc, locId: nickToId[loc] || '', classType: ct, classId: cn, grades: '', startTime: '', classLength: '60', day: 'Monday', notes: '' };
  }

  function updateRow(i, field, value) {
    setRows(prev => {
      const next = [...prev];
      const row = { ...next[i], [field]: value };
      if (field === 'classType') {
        row.classId = typeToClasses[value]?.[0]?.id || '';
      }
      if (field === 'locNickname') {
        row.locId = nickToId[value] || '';
      }
      next[i] = row;
      return next;
    });
  }

  function bulkFill(field, value) {
    setBulk(prev => ({ ...prev, [field]: value }));
    setRows(prev => prev.map(r => {
      const updated = { ...r, [field]: value };
      if (field === 'classType') updated.classId = typeToClasses[value]?.[0]?.id || '';
      if (field === 'locNickname') updated.locId = nickToId[value] || '';
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
    const initRows = Array.from({ length: rowCount }, () => {
      const ct = classTypes[0] || '';
      const cn = typeToClasses[ct]?.[0]?.id || '';
      return { locNickname: locs[0] || '', locId: nti[locs[0]] || '', classType: ct, classId: cn, grades: '', startTime: '', classLength: '60', day: 'Monday', notes: '' };
    });
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
      <div className="px-6 py-5 max-w-[1600px]">
        <StepHeader current={step} />

        {/* ===== STEP 1: Setup ===== */}
        {step === 1 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Setup</h2>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Number of Programs</label>
                <input type="number" min={1} max={100} value={rowCount} onChange={e => setRowCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`${inp} w-28`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Mode</label>
                <select value={mode} onChange={e => setMode(e.target.value)} className={sel}>
                  <option value="">Select…</option>
                  <option value="contractor">By Contractor</option>
                  <option value="location">By Location</option>
                </select>
              </div>
              {mode === 'contractor' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Contractor</label>
                  <select value={contractor} onChange={e => setContractor(e.target.value)} className={`${sel} min-w-[200px]`}>
                    <option value="">Select…</option>
                    {(setup.contractors || []).map(c => <option key={c.id} value={c.id}>{c.contractor_name}</option>)}
                  </select>
                </div>
              )}
              {mode === 'location' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Location</label>
                  <select value={locationId} onChange={e => setLocationId(e.target.value)} className={`${sel} min-w-[240px]`}>
                    <option value="">Select…</option>
                    {(setup.locations || []).map(l => <option key={l.id} value={l.id}>{l.nickname}</option>)}
                  </select>
                </div>
              )}
            </div>
            <NavButtons onNext={goToStep2} nextLabel="Next → Program Details"
              nextDisabled={!mode || (mode === 'contractor' && !contractor) || (mode === 'location' && !locationId)} />
          </div>
        )}

        {/* ===== STEP 2: Program Details ===== */}
        {step === 2 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Program Details</h2>
            {/* Globals */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Class Status</label>
                <select value={globalStatus} onChange={e => setGlobalStatus(e.target.value)} className={sel}>
                  {(setup.classStatuses || []).map(s => <option key={s.id} value={s.id}>{s.class_status_name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Program Type</label>
                <select value={globalProgramType} onChange={e => setGlobalProgramType(e.target.value)} className={sel}>
                  {(setup.programTypes || []).map(t => <option key={t.id} value={t.program_type_name}>{t.program_type_name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Sales Rep</label>
                <select value={salesRep} onChange={e => setSalesRep(e.target.value)} className={sel}>
                  <option value="">None</option>
                  {(setup.salesUsers || []).map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                </select>
              </div>
            </div>

            {/* Bulk Fill Panel */}
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide mb-2">Bulk Fill — set a value then click ↓ to apply to all rows</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 items-end">
                {mode === 'contractor' && (
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] font-medium text-gray-500 uppercase">Location</label>
                    <div className="flex items-center gap-1">
                      <select value={bulk.locNickname} onChange={e => setBulk(p => ({ ...p, locNickname: e.target.value }))} className={`${sel} min-w-[130px]`}>
                        {locations.map(l => <option key={l}>{l}</option>)}
                      </select>
                      <BulkBtn onClick={() => bulkFill('locNickname', bulk.locNickname)} />
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-medium text-gray-500 uppercase">Class Type</label>
                  <div className="flex items-center gap-1">
                    <select value={bulk.classType} onChange={e => setBulk(p => ({ ...p, classType: e.target.value, classId: typeToClasses[e.target.value]?.[0]?.id || '' }))} className={`${sel} min-w-[110px]`}>
                      {classTypes.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <BulkBtn onClick={() => bulkFill('classType', bulk.classType)} />
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-medium text-gray-500 uppercase">Class Name</label>
                  <div className="flex items-center gap-1">
                    <select value={bulk.classId} onChange={e => setBulk(p => ({ ...p, classId: e.target.value }))} className={`${sel} min-w-[130px]`}>
                      {(typeToClasses[bulk.classType] || []).map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
                    </select>
                    <BulkBtn onClick={() => setRows(prev => prev.map(r => ({ ...r, classId: bulk.classId })))} />
                  </div>
                </div>
                {[['Grades', 'grades', 'K-5', 'w-16'], ['Start Time', 'startTime', '', 'w-24'], ['Length (min)', 'classLength', '60', 'w-16']].map(([label, field, ph, w]) => (
                  <div key={field} className="flex flex-col gap-0.5">
                    <label className="text-[10px] font-medium text-gray-500 uppercase">{label}</label>
                    <div className="flex items-center gap-1">
                      <input type={field === 'startTime' ? 'time' : field === 'classLength' ? 'number' : 'text'}
                        value={bulk[field]} onChange={e => setBulk(p => ({ ...p, [field]: e.target.value }))}
                        placeholder={ph} className={`${inp} ${w}`} />
                      <BulkBtn onClick={() => bulkFill(field, bulk[field])} />
                    </div>
                  </div>
                ))}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-medium text-gray-500 uppercase">Day</label>
                  <div className="flex items-center gap-1">
                    <select value={bulk.day} onChange={e => setBulk(p => ({ ...p, day: e.target.value }))} className={sel}>
                      {DAYS.map(d => <option key={d}>{d}</option>)}
                    </select>
                    <BulkBtn onClick={() => bulkFill('day', bulk.day)} />
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-medium text-gray-500 uppercase">Notes</label>
                  <div className="flex items-center gap-1">
                    <input value={bulk.notes} onChange={e => setBulk(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" className={`${inp} w-28`} />
                    <BulkBtn onClick={() => bulkFill('notes', bulk.notes)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className={th}>Loc ID</th>
                    {mode === 'contractor' && <th className={th}>Location</th>}
                    <th className={th}>Class Type</th>
                    <th className={th}>Class Name</th>
                    <th className={th}>Grades</th>
                    <th className={th}>Start Time</th>
                    <th className={th}>Length</th>
                    <th className={th}>Day</th>
                    <th className={th}>Notes</th>
                    <th className={th}></th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className={`${td} font-mono text-gray-400 whitespace-nowrap px-2`}>{r.locId || '—'}</td>
                      {mode === 'contractor' && (
                        <td className={td}><select value={r.locNickname} onChange={e => updateRow(i, 'locNickname', e.target.value)} className={`w-full ${sel}`}>
                          {locations.map(l => <option key={l}>{l}</option>)}
                        </select></td>
                      )}
                      <td className={td}><select value={r.classType} onChange={e => updateRow(i, 'classType', e.target.value)} className={`w-full ${sel}`}>
                        {classTypes.map(t => <option key={t}>{t}</option>)}
                      </select></td>
                      <td className={td}><select value={r.classId} onChange={e => updateRow(i, 'classId', e.target.value)} className={`w-full ${sel}`}>
                        {(typeToClasses[r.classType] || []).map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
                      </select></td>
                      <td className={td}><input value={r.grades} onChange={e => updateRow(i, 'grades', e.target.value)} placeholder="K-5" className={`w-full ${inp}`} /></td>
                      <td className={td}><input type="time" step="60" value={r.startTime} onChange={e => updateRow(i, 'startTime', e.target.value)} className={`w-full ${inp}`} /></td>
                      <td className={td}><input type="number" value={r.classLength} onChange={e => updateRow(i, 'classLength', e.target.value)} placeholder="60" className={`w-20 ${inp}`} /></td>
                      <td className={td}><select value={r.day} onChange={e => updateRow(i, 'day', e.target.value)} className={`w-full ${sel}`}>
                        {DAYS.map(d => <option key={d}>{d}</option>)}
                      </select></td>
                      <td className={td}><input value={r.notes} onChange={e => updateRow(i, 'notes', e.target.value)} placeholder="Notes" className={`w-full ${inp}`} /></td>
                      <td className={`${td} text-center px-2`}><button onClick={() => setRows(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">✕</button></td>
                      <td className={`${td} px-2`}><button onClick={() => copyFromPrevious(i)}
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Enrollment</h2>
            <div className="overflow-x-auto">
              <table className="text-sm w-full border-collapse">
                <thead><tr className="bg-gray-50">
                  {['Program Nickname','Day','Min','Max'].map(h => <th key={h} className={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {programData.map((p, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className={`${td} px-3 py-2 font-medium text-gray-800`}>{p.nickname}</td>
                      <td className={`${td} px-3 py-2 text-gray-600`}>{p.day}</td>
                      <td className={`${td} w-20 px-2`}><input type="number" min={0} value={enrollRows[i]?.min ?? '0'}
                        onChange={e => setEnrollRows(prev => { const n = [...prev]; n[i] = { ...n[i], min: e.target.value }; return n; })} className={`w-full ${inp}`} /></td>
                      <td className={`${td} w-20 px-2`}><input type="number" min={0} value={enrollRows[i]?.max ?? '20'}
                        onChange={e => setEnrollRows(prev => { const n = [...prev]; n[i] = { ...n[i], max: e.target.value }; return n; })} className={`w-full ${inp}`} /></td>
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Dates</h2>
            <div className="flex items-center gap-4 mb-4">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Frequency</span>
              {['weekly', 'daily'].map(f => (
                <label key={f} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" checked={freqMode === f} onChange={() => setFreqMode(f)} className="text-blue-500" />
                  {f === 'weekly' ? 'Once per week' : 'Every day (skip weekends)'}
                </label>
              ))}
            </div>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Skip Dates (apply to all)</p>
              <div className="flex flex-wrap gap-2 items-center">
                {skipDates.map((d, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input type="date" value={d} onChange={e => setSkipDates(prev => { const n = [...prev]; n[i] = e.target.value; return n; })} className={inp} />
                    <button onClick={() => setSkipDates(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                ))}
                <button onClick={() => setSkipDates(prev => [...prev, ''])} className="text-xs px-2 py-1 border border-blue-200 text-blue-600 rounded hover:bg-blue-50">+ Add</button>
              </div>
            </div>
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap gap-3 items-end">
              <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide self-center">Bulk Start Date</span>
              <div className="flex items-center gap-1">
                <input type="date" value={bulkStartDate} onChange={e => setBulkStartDate(e.target.value)} className={`${inp} bg-white`} />
                <BulkBtn onClick={() => { if (bulkStartDate) setRows4(prev => prev.map(r => ({ ...r, startDate: bulkStartDate }))); }} label="Apply to all ↓" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead><tr className="bg-gray-50">
                  {['Program Nickname', 'Day', 'Start Date', freqMode === 'weekly' ? 'Weeks' : 'Sessions', 'Generated Dates', 'Skipped Dates'].map(h => <th key={h} className={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {programData.map((p, i) => {
                    const c = computed4[i];
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className={`${td} px-2 py-1 font-medium text-gray-800 whitespace-nowrap`}>{p.nickname}</td>
                        <td className={`${td} px-2 py-1 text-gray-600`}>{p.day}</td>
                        <td className={`${td} px-1`}>
                          <input type="date" value={rows4[i]?.startDate ?? ''} onChange={e => setRows4(prev => { const n = [...prev]; n[i] = { ...n[i], startDate: e.target.value }; return n; })}
                            className={`${inp} ${c?.invalid ? 'border-red-400 bg-red-50 text-red-700' : ''}`} />
                          {c?.invalid && <p className="text-red-500 text-[10px] mt-0.5">Wrong day</p>}
                        </td>
                        <td className={`${td} px-1`}><input type="number" min={1} max={20} value={rows4[i]?.sessions ?? ''}
                          onChange={e => setRows4(prev => { const n = [...prev]; n[i] = { ...n[i], sessions: parseInt(e.target.value) || '' }; return n; })}
                          className={`w-16 ${inp}`} /></td>
                        <td className={`${td} px-2 text-gray-600 max-w-[200px] whitespace-normal leading-relaxed`}>
                          {c?.valid?.length ? c.valid.map(v => v.display).join(', ') : <span className="text-gray-300">—</span>}
                        </td>
                        <td className={`${td} px-2 text-amber-600 max-w-[160px] whitespace-normal`}>
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Costs</h2>
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap gap-3 items-end">
              <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide self-center">Bulk Fill</span>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-medium text-gray-500 uppercase">Per-Session Cost ($)</label>
                <div className="flex items-center gap-1">
                  <input type="number" step="1" min={0} value={bulkPerCost} onChange={e => setBulkPerCost(e.target.value)} placeholder="0" className={`${inp} w-20 bg-white`} />
                  <BulkBtn onClick={() => { const n = parseFloat(bulkPerCost); setRows5(prev => prev.map(() => ({ perCost: isNaN(n) ? '' : n }))); }} label="Apply to all ↓" />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead><tr className="bg-gray-50">
                  {['Program Nickname', 'Day', 'Length (min)', 'Sessions', 'Per-Session Cost ($)', 'Total Price ($)', 'Class Pricing (DB)'].map(h => <th key={h} className={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {programData.map((p, i) => {
                    const per = rows5[i]?.perCost;
                    const sessions = parseInt(p.sessions || '0') || 0;
                    const total = typeof per === 'number' ? (per * sessions).toFixed(2) : '—';
                    const loc = (setup.locations || []).find(l => String(l.id) === p.locId);
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className={`${td} px-2 font-medium text-gray-800 whitespace-nowrap`}>{p.nickname}</td>
                        <td className={`${td} px-2 text-gray-600`}>{p.day}</td>
                        <td className={`${td} px-2 text-gray-600 text-center`}>{p.classLength}</td>
                        <td className={`${td} px-2 text-gray-600 text-center`}>{p.sessions}</td>
                        <td className={`${td} px-1`}><input type="number" step="1" min={0} value={per === '' ? '' : per ?? ''}
                          onChange={e => setRows5(prev => { const n = [...prev]; n[i] = { perCost: parseFloat(e.target.value) || '' }; return n; })}
                          className={`w-20 ${inp}`} /></td>
                        <td className={`${td} px-2 font-mono font-semibold text-gray-800 text-right`}>{total !== '—' ? `$${total}` : '—'}</td>
                        <td className={`${td} px-2 text-gray-500`}>{loc?.classPricing || '—'}</td>
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
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-base font-semibold text-gray-800 mb-1">Review & Save</h2>
              <p className="text-sm text-gray-500 mb-4">{programData.length} programs ready to save</p>

              {saveMutation.isError && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{saveMutation.error?.response?.data?.error || 'Save failed'}</div>}
              {saveMutation.isSuccess && <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
                ✓ {saveMutation.data?.created} programs saved! <button onClick={reset} className="ml-2 underline">Start over</button>
              </div>}

              {/* Compliance */}
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Compliance by Location</h3>
              <div className="overflow-x-auto mb-5">
                <table className="text-xs w-full border-collapse">
                  <thead><tr className="bg-gray-50">
                    {['Location', 'TB', 'Livescan', 'Virtus', 'Flyer', 'Contract', 'Payment Through Us'].map(h => <th key={h} className={th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {[...seenLocs.values()].map(loc => (
                      <tr key={loc.id} className="bg-white hover:bg-gray-50">
                        <td className={`${td} px-3 py-2 font-medium text-gray-800`}>{loc.nickname}</td>
                        {[loc.tb_required, loc.livescan_required, loc.virtus_required, loc.flyer_required, loc.contract_permit_required, loc.payment_through_us].map((v, j) => (
                          <td key={j} className={`${td} px-3 py-2 text-center`}>
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
                <table className="text-xs w-full border-collapse">
                  <thead><tr className="bg-gray-50">
                    {['Nickname', 'Location', 'Day', 'Time', 'Dates', 'Sessions', 'Total'].map(h => <th key={h} className={th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {programData.map((p, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className={`${td} px-2 py-1.5 font-medium text-gray-800`}>{p.nickname}</td>
                        <td className={`${td} px-2 py-1.5 text-gray-600`}>{p.locNickname}</td>
                        <td className={`${td} px-2 py-1.5 text-gray-600`}>{p.day}</td>
                        <td className={`${td} px-2 py-1.5 text-gray-600 whitespace-nowrap`}>{p.startTime}</td>
                        <td className={`${td} px-2 py-1.5 text-gray-500 max-w-[160px] whitespace-normal`}>{p.generatedDates || '—'}</td>
                        <td className={`${td} px-2 py-1.5 text-center`}>{p.sessions}</td>
                        <td className={`${td} px-2 py-1.5 font-mono text-gray-800 text-right`}>{p.totalPrice ? `$${Number(p.totalPrice).toFixed(2)}` : '—'}</td>
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
