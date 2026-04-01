import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addSession, updateSession, deleteSession } from '../api/programs';
import { Button } from './ui/Button';
import { formatDate, formatTime, formatCurrency } from '../lib/utils';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getProgramDays(program) {
  return DAY_KEYS.map((key, idx) => program[key] ? idx : null).filter(d => d !== null);
}
function getDayOfWeek(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr + 'T12:00:00').getDay();
}
function isWrongDay(dateStr, allowedDays) {
  if (!dateStr || allowedDays.length === 0) return false;
  const dow = getDayOfWeek(dateStr);
  return dow !== null && !allowedDays.includes(dow);
}
function isOutOfRange(dateStr, sessions) {
  if (!dateStr || sessions.length < 2) return false;
  const dates = sessions.map(s => s.session_date).filter(Boolean).map(d => new Date(d.split('T')[0] + 'T12:00:00').getTime()).sort((a, b) => a - b);
  if (dates.length < 2) return false;
  const target = new Date(dateStr + 'T12:00:00').getTime();
  const range = dates[dates.length - 1] - dates[0];
  const buffer = Math.max(range * 0.5, 30 * 86400000);
  return target < dates[0] - buffer || target > dates[dates.length - 1] + buffer;
}

function SessionRow({ s, idx, professors, filteredLessons, allowedDays, defaultTime, program, onUpdate, onDelete, onToggleBilled }) {
  const dateStr = (s.session_date || '').split('T')[0];
  const dow = getDayOfWeek(dateStr);
  const isWrong = isWrongDay(dateStr, allowedDays);

  const handleChange = (field, value) => {
    onUpdate(s.id, { [field]: value || null });
  };

  return (
    <tr className={`${s.not_billed ? 'bg-gray-50 text-gray-400' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
      <td className="px-2 py-1.5 text-gray-400 text-center">{idx + 1}</td>
      <td className="px-2 py-1">
        <input type="date" defaultValue={dateStr}
          onBlur={e => { if (e.target.value !== dateStr) handleChange('session_date', e.target.value); }}
          className="rounded border border-gray-200 px-1.5 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]" />
      </td>
      <td className={`px-2 py-1.5 text-xs ${isWrong ? 'text-amber-600 font-semibold' : 'text-gray-500'}`}>
        {dow !== null ? DAY_NAMES[dow].slice(0, 3) : '—'}{isWrong && <span title="Not on scheduled day"> !</span>}
      </td>
      <td className="px-2 py-1">
        <input type="time" defaultValue={s.session_time || defaultTime || ''}
          onBlur={e => { if (e.target.value !== (s.session_time || '')) handleChange('session_time', e.target.value); }}
          className="rounded border border-gray-200 px-1.5 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]" />
      </td>
      <td className="px-2 py-1">
        <select defaultValue={s.professor_id || ''}
          onChange={e => handleChange('professor_id', e.target.value)}
          className="w-full rounded border border-gray-200 px-1 py-1 text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] bg-white pr-6 bg-[length:12px_12px] bg-[position:right_0.25rem_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]">
          <option value="">—</option>
          {professors.map(p => <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>)}
        </select>
      </td>
      <td className="px-2 py-1">
        <input type="number" step="0.01" defaultValue={s.professor_pay ?? ''}
          onBlur={e => { if (e.target.value !== String(s.professor_pay ?? '')) handleChange('professor_pay', e.target.value); }}
          className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]" placeholder="$" />
      </td>
      <td className="px-2 py-1">
        <select defaultValue={s.assistant_id || ''}
          onChange={e => handleChange('assistant_id', e.target.value)}
          className="w-full rounded border border-gray-200 px-1 py-1 text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] bg-white pr-6 bg-[length:12px_12px] bg-[position:right_0.25rem_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]">
          <option value="">—</option>
          {professors.map(p => <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>)}
        </select>
      </td>
      <td className="px-2 py-1">
        <input type="number" step="0.01" defaultValue={s.assistant_pay ?? ''}
          onBlur={e => { if (e.target.value !== String(s.assistant_pay ?? '')) handleChange('assistant_pay', e.target.value); }}
          className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]" placeholder="$" />
      </td>
      <td className="px-2 py-1">
        <select defaultValue={s.lesson_id || ''}
          onChange={e => handleChange('lesson_id', e.target.value)}
          className="w-full rounded border border-gray-200 px-1 py-1 text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] bg-white pr-6 bg-[length:12px_12px] bg-[position:right_0.25rem_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]">
          <option value="">—</option>
          {filteredLessons.map(l => <option key={l.id} value={l.id}>{l.lesson_name}</option>)}
        </select>
      </td>
      <td className="px-1 py-1.5 text-center">
        <input type="checkbox" checked={!s.not_billed} onChange={() => onToggleBilled(s)}
          className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" title={s.not_billed ? 'Not billed' : 'Billed'} />
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          onClick={() => { if (window.confirm(`Delete session ${idx + 1} (${formatDate(dateStr)})? This affects payroll and invoicing.`)) onDelete(s.id); }}
          className="text-xs text-red-400 hover:text-red-600"
        >×</button>
      </td>
    </tr>
  );
}

export function SessionsPanel({ programId, sessions, professors, lessons, programClassId, defaultTime, program }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [addError, setAddError] = useState('');
  const [addWarning, setAddWarning] = useState('');
  const qc = useQueryClient();

  const allowedDays = program ? getProgramDays(program) : [];
  const invalidate = () => qc.invalidateQueries(['programs', String(programId)]);

  const filteredLessons = programClassId
    ? lessons.filter(l => l.class_id === parseInt(programClassId))
    : lessons;

  const addMutation = useMutation({
    mutationFn: (data) => addSession(programId, data),
    onSuccess: () => { invalidate(); setNewDate(''); setShowAdd(false); setAddError(''); setAddWarning(''); },
    onError: (err) => setAddError(err?.response?.data?.error || 'Failed to add'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ sessionId, data }) => updateSession(programId, sessionId, data),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId) => deleteSession(programId, sessionId),
    onSuccess: invalidate,
  });

  const handleDateChange = (val) => {
    setNewDate(val);
    setAddError('');
    setAddWarning('');
    if (val) {
      const warnings = [];
      if (isWrongDay(val, allowedDays)) warnings.push(`${DAY_NAMES[getDayOfWeek(val)]} is not a scheduled day`);
      if (isOutOfRange(val, sessions)) warnings.push('Date is unusually far from other sessions');
      if (warnings.length) setAddWarning(warnings.join('. '));
    }
  };

  const handleAdd = () => {
    if (!newDate) return;
    addMutation.mutate({
      session_date: newDate,
      session_time: defaultTime || null,
      professor_id: program?.lead_professor_id || null,
      assistant_id: program?.assistant_professor_id || null,
      professor_pay: program?.lead_professor_pay || null,
      assistant_pay: program?.assistant_professor_pay || null,
    });
  };

  const handleUpdate = useCallback((sessionId, data) => {
    updateMutation.mutate({ sessionId, data });
  }, [updateMutation]);

  const handleToggleBilled = useCallback((s) => {
    updateMutation.mutate({ sessionId: s.id, data: { not_billed: s.not_billed ? 0 : 1 } });
  }, [updateMutation]);

  const handleDelete = useCallback((sessionId) => {
    deleteMutation.mutate(sessionId);
  }, [deleteMutation]);

  const billableSessions = sessions.filter(s => !s.not_billed);
  const wrongDaySessions = new Set(
    sessions.filter(s => isWrongDay((s.session_date || '').split('T')[0], allowedDays)).map(s => s.id)
  );
  const hasWrongDays = wrongDaySessions.size > 0;
  const firstDate = sessions.length > 0 ? sessions[0].session_date : null;
  const lastDate = sessions.length > 0 ? sessions[sessions.length - 1].session_date : null;

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mb-3 px-3 py-2 rounded-lg text-sm bg-blue-50 text-blue-700 border border-blue-200">
        <span className="font-medium">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
        {billableSessions.length !== sessions.length && (
          <span className="text-blue-500">({billableSessions.length} billable)</span>
        )}
        {firstDate && lastDate && (
          <span className="text-blue-600">{formatDate(firstDate)} — {formatDate(lastDate)}</span>
        )}
        <div className="ml-auto">
          {showAdd ? (
            <div className="flex items-center gap-2">
              <input type="date" value={newDate} onChange={e => handleDateChange(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]" />
              <Button size="sm" onClick={handleAdd} disabled={addMutation.isPending || !newDate}>
                {addMutation.isPending ? '…' : 'Add'}
              </Button>
              <button onClick={() => { setShowAdd(false); setAddWarning(''); setAddError(''); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setShowAdd(true)}>+ Add Date</Button>
          )}
        </div>
      </div>

      {addWarning && <div className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">Warning: {addWarning}</div>}
      {addError && <div className="mb-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded text-sm text-red-700 font-medium">{addError}</div>}
      {hasWrongDays && (
        <div className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
          {wrongDaySessions.size} session{wrongDaySessions.size !== 1 ? 's are' : ' is'} not on the scheduled day of the week
        </div>
      )}

      {/* Sessions table — always editable inline */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-center px-2 py-2 font-medium text-gray-600 w-8">#</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Date</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600 w-10">Day</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Time</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Lead Professor</th>
              <th className="text-right px-2 py-2 font-medium text-gray-600 w-16">Pay</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Assistant</th>
              <th className="text-right px-2 py-2 font-medium text-gray-600 w-16">Pay</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Lesson</th>
              <th className="text-center px-1 py-2 font-medium text-gray-600 w-8" title="Billed">$</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sessions.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-8 text-gray-400">No sessions yet — click "+ Add Date" to create one</td></tr>
            ) : sessions.map((s, idx) => (
              <SessionRow
                key={s.id}
                s={s}
                idx={idx}
                professors={professors}
                filteredLessons={filteredLessons}
                allowedDays={allowedDays}
                defaultTime={defaultTime}
                program={program}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onToggleBilled={handleToggleBilled}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
