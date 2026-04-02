import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getBulkSetup, saveBulkPrograms } from '../api/bulk-input';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';

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
  const valid = [], skipped = [];
  const cap = Math.min(sessions, 40);

  if (freqMode === 'weekly') {
    let count = 0, i = 0;
    while (count < cap && i < 200) {
      const dt = new Date(y, m - 1, d + i * 7);
      if (skipSet.has(toKey(dt))) skipped.push(toKey(dt));
      else { valid.push(toKey(dt)); count++; }
      i++;
    }
  } else {
    let count = 0;
    const dt = new Date(y, m - 1, d);
    let iter = 0;
    while (count < cap && iter < 300) {
      const dow = dt.getDay();
      if (dow !== 0 && dow !== 6) {
        if (skipSet.has(toKey(dt))) skipped.push(toKey(new Date(dt)));
        else { valid.push(toKey(new Date(dt))); count++; }
      }
      dt.setDate(dt.getDate() + 1);
      iter++;
    }
  }
  return { valid, skipped };
}

function makeNickname(locNick, grades, classCode, existingSet, idx) {
  const base = `${locNick}${grades ? ` (${grades})` : ''} - ${classCode || 'TBD'}`;
  let name = base;
  let letter = 0;
  while (existingSet.has(name.toLowerCase())) {
    name = `${base} (${String.fromCharCode(65 + letter)})`;
    letter++;
  }
  return name;
}

function formatDateShort(d) {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return `${dt.getMonth()+1}/${dt.getDate()}`;
}

// --- Step Header ---
function StepHeader({ current, labels }) {
  return (
    <div className="flex gap-1 mb-6">
      {labels.map((label, i) => (
        <div key={i} className={`flex-1 text-center py-2 text-xs font-medium rounded ${
          i === current ? 'bg-[#1e3a5f] text-white' : i < current ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-400'
        }`}>{i+1}. {label}</div>
      ))}
    </div>
  );
}

export default function BulkInputPage() {
  const [step, setStep] = useState(0);
  const { data: setupData, isLoading } = useQuery({ queryKey: ['bulk-setup'], queryFn: getBulkSetup });
  const setup = setupData?.data || {};

  // Step 0: Setup
  const [mode, setMode] = useState('contractor');
  const [selectedContractor, setSelectedContractor] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [numPrograms, setNumPrograms] = useState(1);

  // Step 1: Program details
  const [classStatusId, setClassStatusId] = useState('');
  const [salesRep, setSalesRep] = useState('');
  const [rows, setRows] = useState([]);

  // Step 2: Enrollment
  const [enrollRows, setEnrollRows] = useState([]);

  // Step 3: Dates
  const [freqMode, setFreqMode] = useState('weekly');
  const [skipDates, setSkipDates] = useState([]);
  const [dateRows, setDateRows] = useState([]);
  const [bulkStartDate, setBulkStartDate] = useState('');

  // Step 4: Costs
  const [costRows, setCostRows] = useState([]);
  const [bulkCost, setBulkCost] = useState('');

  // Derived
  const filteredLocations = useMemo(() => {
    if (!setup.locations) return [];
    if (mode === 'contractor' && selectedContractor) {
      return setup.locations.filter(l => String(l.contractor_id) === selectedContractor);
    }
    if (mode === 'location' && selectedLocation) {
      return setup.locations.filter(l => String(l.id) === selectedLocation);
    }
    return setup.locations;
  }, [setup.locations, mode, selectedContractor, selectedLocation]);

  const existingNickSet = useMemo(() => new Set((setup.existingNicknames || []).map(n => n.toLowerCase())), [setup.existingNicknames]);
  const skipSet = useMemo(() => new Set(skipDates), [skipDates]);

  const classMap = useMemo(() => {
    const m = {};
    (setup.classes || []).forEach(c => { m[c.id] = c; });
    return m;
  }, [setup.classes]);

  // --- Step transitions ---
  const initStep1 = () => {
    const locs = filteredLocations;
    const r = Array.from({ length: numPrograms }, () => ({
      location_id: locs.length === 1 ? String(locs[0].id) : '',
      class_id: '', grades: '', start_time: '', class_length: '60', day: '', notes: '',
    }));
    setRows(r);
    setStep(1);
  };

  const initStep2 = () => {
    setEnrollRows(rows.map(() => ({ min: '', max: '' })));
    setStep(2);
  };

  const initStep3 = () => {
    setDateRows(rows.map(() => ({ startDate: '', sessions: '' })));
    setStep(3);
  };

  const initStep4 = () => {
    setCostRows(rows.map(() => ({ perCost: '' })));
    setStep(4);
  };

  // --- Build final programs ---
  const buildPrograms = () => {
    const usedNicks = new Set(existingNickSet);
    return rows.map((row, i) => {
      const loc = (setup.locations || []).find(l => String(l.id) === row.location_id);
      const cls = classMap[row.class_id];
      const nickname = makeNickname(loc?.nickname || '', row.grades, cls?.class_code || '', usedNicks, i);
      usedNicks.add(nickname.toLowerCase());

      const dr = dateRows[i] || {};
      const { valid } = generateDates(dr.startDate, parseInt(dr.sessions) || 0, row.day, freqMode, skipSet);

      return {
        program_nickname: nickname,
        class_status_id: classStatusId || 1,
        location_id: row.location_id || null,
        class_id: row.class_id || null,
        start_time: row.start_time || null,
        class_length_minutes: parseInt(row.class_length) || null,
        day: row.day,
        general_notes: row.notes || null,
        minimum_students: enrollRows[i]?.min || null,
        maximum_students: enrollRows[i]?.max || null,
        parent_cost: costRows[i]?.perCost ? (parseFloat(costRows[i].perCost) * valid.length) : null,
        our_cut: costRows[i]?.perCost ? (parseFloat(costRows[i].perCost) * valid.length) : null,
        first_session_date: valid[0] || null,
        last_session_date: valid[valid.length - 1] || null,
        session_dates: valid,
        tb_required: loc?.tb_required || 0,
        livescan_required: loc?.livescan_required || 0,
        virtus_required: loc?.virtus_required || 0,
        payment_through_us: loc?.payment_through_us || 0,
      };
    });
  };

  const saveMutation = useMutation({
    mutationFn: (progs) => saveBulkPrograms(progs),
  });

  const handleSave = () => {
    const progs = buildPrograms();
    saveMutation.mutate(progs);
  };

  // --- Row update helpers ---
  const updateRow = (i, field, value) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };
  const addRow = () => {
    const last = rows[rows.length - 1] || {};
    setRows(prev => [...prev, { ...last }]);
  };
  const removeRow = (i) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, idx) => idx !== i));
  };
  const applyAllRows = (field, value) => {
    setRows(prev => prev.map(r => ({ ...r, [field]: value })));
  };

  if (isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  const stepLabels = ['Setup', 'Program Details', 'Enrollment', 'Dates', 'Costs', 'Review & Save'];

  return (
    <AppShell>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Bulk Program Input</h1>
      </div>
      <div className="p-6 max-w-[1400px]">
        <StepHeader current={step} labels={stepLabels} />

        {/* ===== STEP 0: Setup ===== */}
        {step === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Mode</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMode('contractor')}
                    className={`px-3 py-1.5 text-sm rounded ${mode === 'contractor' ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600'}`}>By Contractor</button>
                  <button type="button" onClick={() => setMode('location')}
                    className={`px-3 py-1.5 text-sm rounded ${mode === 'location' ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600'}`}>By Location</button>
                </div>
              </div>
              {mode === 'contractor' && (
                <Select label="Contractor" value={selectedContractor} onChange={e => setSelectedContractor(e.target.value)}>
                  <option value="">Select contractor…</option>
                  {(setup.contractors || []).map(c => <option key={c.id} value={c.id}>{c.contractor_name}</option>)}
                </Select>
              )}
              {mode === 'location' && (
                <Select label="Location" value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
                  <option value="">Select location…</option>
                  {(setup.locations || []).map(l => <option key={l.id} value={l.id}>{l.nickname}</option>)}
                </Select>
              )}
              <Input label="Number of Programs" type="number" min="1" max="100" value={numPrograms}
                onChange={e => setNumPrograms(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
            <div className="text-sm text-gray-500">{filteredLocations.length} location{filteredLocations.length !== 1 ? 's' : ''} available</div>
            <Button onClick={initStep1} disabled={mode === 'contractor' && !selectedContractor}>Next: Program Details →</Button>
          </div>
        )}

        {/* ===== STEP 1: Program Details ===== */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="grid grid-cols-4 gap-3 mb-3">
                <Select label="Class Status" value={classStatusId} onChange={e => setClassStatusId(e.target.value)}>
                  <option value="">Select…</option>
                  {(setup.classStatuses || []).map(s => <option key={s.id} value={s.id}>{s.class_status_name}</option>)}
                </Select>
                <Select label="Sales Rep" value={salesRep} onChange={e => setSalesRep(e.target.value)}>
                  <option value="">None</option>
                  {(setup.salesUsers || []).map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                </Select>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 w-8">#</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600">Location</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600">Class</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 w-20">Grades</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 w-24">Time</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 w-16">Mins</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600 w-28">Day</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-600">Notes</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 text-gray-400">{i+1}</td>
                      <td className="px-2 py-1">
                        <select value={row.location_id} onChange={e => updateRow(i, 'location_id', e.target.value)}
                          className="w-full rounded border border-gray-200 px-1 py-1 text-xs">
                          <option value="">Select…</option>
                          {filteredLocations.map(l => <option key={l.id} value={l.id}>{l.nickname}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select value={row.class_id} onChange={e => updateRow(i, 'class_id', e.target.value)}
                          className="w-full rounded border border-gray-200 px-1 py-1 text-xs">
                          <option value="">Select…</option>
                          {(setup.classes || []).map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input value={row.grades} onChange={e => updateRow(i, 'grades', e.target.value)}
                          className="w-full rounded border border-gray-200 px-1 py-1 text-xs" placeholder="K-5" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="time" value={row.start_time} onChange={e => updateRow(i, 'start_time', e.target.value)}
                          className="w-full rounded border border-gray-200 px-1 py-1 text-xs" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" value={row.class_length} onChange={e => updateRow(i, 'class_length', e.target.value)}
                          className="w-full rounded border border-gray-200 px-1 py-1 text-xs" />
                      </td>
                      <td className="px-2 py-1">
                        <select value={row.day} onChange={e => updateRow(i, 'day', e.target.value)}
                          className="w-full rounded border border-gray-200 px-1 py-1 text-xs">
                          <option value="">Day…</option>
                          {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input value={row.notes} onChange={e => updateRow(i, 'notes', e.target.value)}
                          className="w-full rounded border border-gray-200 px-1 py-1 text-xs" placeholder="Notes" />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <button type="button" onClick={() => removeRow(i)} className="text-xs text-red-400 hover:text-red-600"
                          disabled={rows.length <= 1}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 border-t border-gray-100">
                <button type="button" onClick={addRow} className="text-xs text-[#1e3a5f] hover:underline">+ Add row</button>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(0)}>← Back</Button>
              <Button onClick={initStep2}>Next: Enrollment →</Button>
            </div>
          </div>
        )}

        {/* ===== STEP 2: Enrollment ===== */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Location</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Day</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-24">Min Students</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-24">Max Students</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => {
                    const loc = (setup.locations || []).find(l => String(l.id) === row.location_id);
                    return (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-400">{i+1}</td>
                        <td className="px-3 py-2">{loc?.nickname || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.day}</td>
                        <td className="px-3 py-1">
                          <input type="number" value={enrollRows[i]?.min || ''} onChange={e => {
                            const v = [...enrollRows]; v[i] = { ...v[i], min: e.target.value }; setEnrollRows(v);
                          }} className="w-full rounded border border-gray-200 px-2 py-1 text-xs" />
                        </td>
                        <td className="px-3 py-1">
                          <input type="number" value={enrollRows[i]?.max || ''} onChange={e => {
                            const v = [...enrollRows]; v[i] = { ...v[i], max: e.target.value }; setEnrollRows(v);
                          }} className="w-full rounded border border-gray-200 px-2 py-1 text-xs" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>← Back</Button>
              <Button onClick={initStep3}>Next: Dates →</Button>
            </div>
          </div>
        )}

        {/* ===== STEP 3: Dates ===== */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex gap-4 items-end mb-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Frequency</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setFreqMode('weekly')}
                      className={`px-3 py-1.5 text-xs rounded ${freqMode === 'weekly' ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600'}`}>Weekly</button>
                    <button type="button" onClick={() => setFreqMode('daily')}
                      className={`px-3 py-1.5 text-xs rounded ${freqMode === 'daily' ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600'}`}>Daily (skip weekends)</button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Bulk Start Date</label>
                  <div className="flex gap-2">
                    <input type="date" value={bulkStartDate} onChange={e => setBulkStartDate(e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-sm" />
                    <button type="button" onClick={() => {
                      if (bulkStartDate) setDateRows(prev => prev.map(r => ({ ...r, startDate: bulkStartDate })));
                    }} className="text-xs text-[#1e3a5f] hover:underline">Apply to all</button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Skip Dates (holidays)</label>
                  <div className="flex gap-2 items-center">
                    <input type="date" id="skipDateInput" className="rounded border border-gray-300 px-2 py-1 text-sm" />
                    <button type="button" onClick={() => {
                      const el = document.getElementById('skipDateInput');
                      if (el.value && !skipDates.includes(el.value)) {
                        setSkipDates(prev => [...prev, el.value]); el.value = '';
                      }
                    }} className="text-xs text-[#1e3a5f] hover:underline">Add</button>
                  </div>
                  {skipDates.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {skipDates.map(d => (
                        <span key={d} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-red-50 text-red-700 rounded">
                          {formatDateShort(d)}
                          <button type="button" onClick={() => setSkipDates(prev => prev.filter(x => x !== d))} className="text-red-400 hover:text-red-600">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Location</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Day</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-32">Start Date</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-20">Sessions</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Generated Dates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => {
                    const loc = (setup.locations || []).find(l => String(l.id) === row.location_id);
                    const dr = dateRows[i] || {};
                    const { valid, skipped } = generateDates(dr.startDate, parseInt(dr.sessions) || 0, row.day, freqMode, skipSet);
                    const dayInvalid = dr.startDate && row.day && isInvalidDay(dr.startDate, row.day, freqMode);
                    return (
                      <tr key={i} className={dayInvalid ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 text-gray-400">{i+1}</td>
                        <td className="px-3 py-2">{loc?.nickname || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.day}</td>
                        <td className="px-3 py-1">
                          <input type="date" value={dr.startDate || ''} onChange={e => {
                            const v = [...dateRows]; v[i] = { ...v[i], startDate: e.target.value }; setDateRows(v);
                          }} className={`w-full rounded border px-2 py-1 text-xs ${dayInvalid ? 'border-red-400' : 'border-gray-200'}`} />
                          {dayInvalid && <div className="text-[10px] text-red-600 mt-0.5">Wrong day of week</div>}
                        </td>
                        <td className="px-3 py-1">
                          <input type="number" value={dr.sessions || ''} onChange={e => {
                            const v = [...dateRows]; v[i] = { ...v[i], sessions: e.target.value }; setDateRows(v);
                          }} className="w-full rounded border border-gray-200 px-2 py-1 text-xs" min="1" max="40" />
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {valid.length > 0 ? (
                            <span>{valid.map(formatDateShort).join(', ')}</span>
                          ) : '—'}
                          {skipped.length > 0 && (
                            <span className="text-red-500 ml-1">(skipped: {skipped.map(formatDateShort).join(', ')})</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(2)}>← Back</Button>
              <Button onClick={initStep4}>Next: Costs →</Button>
            </div>
          </div>
        )}

        {/* ===== STEP 4: Costs ===== */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex gap-3 items-end">
                <Input label="Bulk Per-Session Cost" type="number" step="0.01" prefix="$" value={bulkCost}
                  onChange={e => setBulkCost(e.target.value)} className="w-40" />
                <button type="button" onClick={() => {
                  if (bulkCost) setCostRows(prev => prev.map(() => ({ perCost: bulkCost })));
                }} className="text-xs text-[#1e3a5f] hover:underline mb-1">Apply to all</button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Location</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Day</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">Sessions</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-28">Per-Session Cost</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600 w-24">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => {
                    const loc = (setup.locations || []).find(l => String(l.id) === row.location_id);
                    const dr = dateRows[i] || {};
                    const { valid } = generateDates(dr.startDate, parseInt(dr.sessions) || 0, row.day, freqMode, skipSet);
                    const cr = costRows[i] || {};
                    const total = cr.perCost && valid.length ? (parseFloat(cr.perCost) * valid.length) : 0;
                    return (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-400">{i+1}</td>
                        <td className="px-3 py-2">{loc?.nickname || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.day}</td>
                        <td className="px-3 py-2 text-gray-600">{valid.length}</td>
                        <td className="px-3 py-1">
                          <input type="number" step="0.01" value={cr.perCost || ''} onChange={e => {
                            const v = [...costRows]; v[i] = { perCost: e.target.value }; setCostRows(v);
                          }} className="w-full rounded border border-gray-200 px-2 py-1 text-xs" placeholder="$" />
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-700">
                          {total > 0 ? `$${total.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(3)}>← Back</Button>
              <Button onClick={() => setStep(5)}>Next: Review →</Button>
            </div>
          </div>
        )}

        {/* ===== STEP 5: Review & Save ===== */}
        {step === 5 && (() => {
          const progs = buildPrograms();
          return (
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Program Nickname</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Day</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Time</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600 w-16">Sessions</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Dates</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 w-20">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {progs.map((p, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-400">{i+1}</td>
                        <td className="px-3 py-2 font-medium">{p.program_nickname}</td>
                        <td className="px-3 py-2 text-gray-600">{p.day}</td>
                        <td className="px-3 py-2 text-gray-600">{p.start_time || '—'}</td>
                        <td className="px-3 py-2 text-center">{p.session_dates.length}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{p.session_dates.map(formatDateShort).join(', ')}</td>
                        <td className="px-3 py-2 text-right font-medium">{p.parent_cost ? `$${Number(p.parent_cost).toFixed(2)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Compliance summary */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Compliance</h3>
                <div className="flex gap-4 text-xs">
                  {['tb_required','livescan_required','virtus_required'].map(field => {
                    const count = progs.filter(p => p[field]).length;
                    const label = field.replace('_required','').replace('_',' ').toUpperCase();
                    return (
                      <span key={field} className={count > 0 ? 'text-amber-600 font-medium' : 'text-gray-300'}>
                        {label}: {count}/{progs.length}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 items-center">
                <Button variant="secondary" onClick={() => setStep(4)}>← Back</Button>
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : `Save ${progs.length} Program${progs.length !== 1 ? 's' : ''} to Database`}
                </Button>
                {saveMutation.isSuccess && (
                  <span className="text-sm text-green-600 font-medium">
                    Created {saveMutation.data?.created} programs!
                  </span>
                )}
                {saveMutation.isError && (
                  <span className="text-sm text-red-600">{saveMutation.error?.response?.data?.error || 'Save failed'}</span>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </AppShell>
  );
}
