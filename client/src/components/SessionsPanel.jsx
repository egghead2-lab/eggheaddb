import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addSession, updateSession, deleteSession, bulkGenerateSessions } from '../api/programs';
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

function SessionRow({ s, idx, professors, allLessons, filteredLessons, allowedDays, defaultTime, onUpdate, onDelete, onDeleteAndShift, onToggleBilled }) {
  const dateStr = (s.session_date || '').split('T')[0];
  const dow = getDayOfWeek(dateStr);
  const isWrong = isWrongDay(dateStr, allowedDays);
  const [showAllLessons, setShowAllLessons] = useState(false);
  const displayLessons = showAllLessons ? allLessons : (filteredLessons.length > 0 ? filteredLessons : allLessons);

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
        <select defaultValue={s.professor_id || ''} onChange={e => handleChange('professor_id', e.target.value)}
          className="w-full rounded border border-gray-200 px-1 py-1 text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] bg-white pr-5">
          <option value="">—</option>
          {professors.map(p => <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>)}
        </select>
      </td>
      <td className="px-2 py-1">
        <input type="number" step="0.01" defaultValue={s.professor_pay ?? ''}
          onBlur={e => { if (e.target.value !== String(s.professor_pay ?? '')) handleChange('professor_pay', e.target.value); }}
          className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" placeholder="$" />
      </td>
      <td className="px-2 py-1">
        <select defaultValue={s.assistant_id || ''} onChange={e => handleChange('assistant_id', e.target.value)}
          className="w-full rounded border border-gray-200 px-1 py-1 text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] bg-white pr-5">
          <option value="">—</option>
          {professors.map(p => <option key={p.id} value={p.id}>{p.display_name || p.professor_nickname}</option>)}
        </select>
      </td>
      <td className="px-2 py-1">
        <input type="number" step="0.01" defaultValue={s.assistant_pay ?? ''}
          onBlur={e => { if (e.target.value !== String(s.assistant_pay ?? '')) handleChange('assistant_pay', e.target.value); }}
          className="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" placeholder="$" />
      </td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-0.5">
          <select defaultValue={s.lesson_id || ''} onChange={e => handleChange('lesson_id', e.target.value)}
            className="w-full rounded border border-gray-200 px-1 py-1 text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] bg-white pr-5">
            <option value="">—</option>
            {displayLessons.map(l => <option key={l.id} value={l.id}>{l.lesson_name}</option>)}
          </select>
          <button type="button" onClick={() => setShowAllLessons(!showAllLessons)}
            title={showAllLessons ? 'Show module lessons only' : 'Show all lessons'}
            className={`text-[9px] flex-shrink-0 px-1.5 py-0.5 rounded border ${showAllLessons ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'}`}>
            {showAllLessons ? 'All' : 'All'}
          </button>
        </div>
      </td>
      <td className="px-1 py-1.5 text-center">
        <input type="checkbox" checked={!s.not_billed} onChange={() => onToggleBilled(s)}
          className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f] cursor-pointer" title={s.not_billed ? 'Not billed' : 'Billed'} />
      </td>
      <DeleteCell s={s} idx={idx} dateStr={dateStr} onDelete={onDelete} onDeleteAndShift={onDeleteAndShift} />
    </tr>
  );
}

function DeleteCell({ s, idx, dateStr, onDelete, onDeleteAndShift }) {
  const [confirming, setConfirming] = useState(false);
  const hasLesson = !!s.lesson_id;

  if (confirming) {
    return (
      <td className="px-2 py-1 text-center">
        <div className="flex flex-col gap-1 items-center min-w-[100px]">
          <span className="text-[10px] text-red-600 font-medium">Delete #{idx + 1}?</span>
          <button onClick={() => { onDelete(s.id); setConfirming(false); }}
            className="text-[10px] px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600 w-full">
            Delete
          </button>
          {hasLesson && (
            <button onClick={() => { onDeleteAndShift(s.id); setConfirming(false); }}
              className="text-[10px] px-2 py-0.5 bg-amber-500 text-white rounded hover:bg-amber-600 w-full"
              title="Delete this session and shift remaining lessons up to maintain order">
              Delete & Shift Lessons
            </button>
          )}
          <button onClick={() => setConfirming(false)}
            className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      </td>
    );
  }

  return (
    <td className="px-2 py-1.5 text-center">
      <button onClick={() => setConfirming(true)}
        className="w-6 h-6 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 text-sm font-bold transition-colors"
        title="Delete session">×</button>
    </td>
  );
}

export function SessionsPanel({ programId, sessions, professors, lessons, holidays, programClassId, defaultTime, program }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [bulkStart, setBulkStart] = useState('');
  const [bulkEnd, setBulkEnd] = useState('');
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

  const bulkMutation = useMutation({
    mutationFn: (data) => bulkGenerateSessions(programId, data),
    onSuccess: (res) => { invalidate(); setShowBulk(false); setBulkStart(''); setBulkEnd(''); setAddError(''); },
    onError: (err) => setAddError(err?.response?.data?.error || 'Failed to generate'),
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
      if (warnings.length) setAddWarning(warnings.join('. '));
    }
  };

  const handleAdd = () => {
    if (!newDate) return;
    addMutation.mutate({
      session_date: newDate, session_time: defaultTime || null,
      professor_id: program?.lead_professor_id || null, assistant_id: program?.assistant_professor_id || null,
      professor_pay: program?.lead_professor_pay || null, assistant_pay: program?.assistant_professor_pay || null,
    });
  };

  // Future holiday dates for skip
  const futureHolidays = (holidays || [])
    .map(h => (h.holiday_date || '').split('T')[0])
    .filter(d => d >= new Date().toISOString().split('T')[0]);

  const handleBulkGenerate = () => {
    if (!bulkStart || !bulkEnd) return;
    bulkMutation.mutate({ start_date: bulkStart, end_date: bulkEnd, skip_dates: futureHolidays });
  };

  const handleUpdate = useCallback((sessionId, data) => {
    updateMutation.mutate({ sessionId, data });
  }, []);

  const handleToggleBilled = useCallback((s) => {
    updateMutation.mutate({ sessionId: s.id, data: { not_billed: s.not_billed ? 0 : 1 } });
  }, []);

  const handleDelete = useCallback((sessionId) => {
    deleteMutation.mutate(sessionId);
  }, []);

  const handleDeleteAndShift = useCallback((sessionId) => {
    // Find the index of the session being deleted
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx === -1) return;

    // Get lesson IDs for sessions after this one
    const subsequentSessions = sessions.slice(idx + 1);

    // Delete the session first
    deleteMutation.mutate(sessionId, {
      onSuccess: () => {
        // Shift lessons: each subsequent session takes the lesson from the one before it
        // The deleted session's lesson disappears, the last session loses its lesson
        subsequentSessions.forEach((s, i) => {
          const prevLesson = i === 0 ? null : subsequentSessions[i - 1].lesson_id;
          const thisLesson = sessions[idx + i]?.lesson_id || null; // lesson from the slot above
          if (s.lesson_id !== thisLesson) {
            updateMutation.mutate({ sessionId: s.id, data: { lesson_id: thisLesson } });
          }
        });
        // Clear the last session's lesson if it exists
        if (subsequentSessions.length > 0) {
          const lastSession = subsequentSessions[subsequentSessions.length - 1];
          updateMutation.mutate({ sessionId: lastSession.id, data: { lesson_id: null } });
        }
      },
    });
  }, [sessions]);

  const billableSessions = sessions.filter(s => !s.not_billed);
  const wrongDaySessions = new Set(
    sessions.filter(s => isWrongDay((s.session_date || '').split('T')[0], allowedDays)).map(s => s.id)
  );
  const hasWrongDays = wrongDaySessions.size > 0;
  const firstDate = sessions.length > 0 ? sessions[0].session_date : null;
  const lastDate = sessions.length > 0 ? sessions[sessions.length - 1].session_date : null;

  const programDayNames = allowedDays.map(d => DAY_NAMES[d].slice(0, 3)).join(', ');

  return (
    <div>
      {/* Program classification */}
      {program && (
        <div className="flex items-center gap-3 mb-3 text-sm">
          {program.program_type_name && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{program.program_type_name}</span>
          )}
          {program.class_type_name && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{program.class_type_name}</span>
          )}
          {program.class_name && (
            <span className="text-sm font-medium text-gray-700">{program.class_name}</span>
          )}
        </div>
      )}

      <div className="flex gap-4">
      {/* Main sessions area */}
      <div className="flex-1 min-w-0">
        {/* Summary bar */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mb-3 px-3 py-2 rounded-lg text-sm bg-blue-50 text-blue-700 border border-blue-200">
          <span className="font-medium">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
          {billableSessions.length !== sessions.length && (
            <span className="text-blue-500">({billableSessions.length} billable)</span>
          )}
          {firstDate && lastDate && (
            <span className="text-blue-600">{formatDate(firstDate)} — {formatDate(lastDate)}</span>
          )}
          {programDayNames && <span className="text-blue-500 text-xs">({programDayNames})</span>}
          <div className="ml-auto flex gap-2">
            {showBulk ? (
              <div className="flex items-center gap-2">
                <input type="date" value={bulkStart} onChange={e => setBulkStart(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                <span className="text-xs text-blue-500">to</span>
                <input type="date" value={bulkEnd} onChange={e => setBulkEnd(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                <Button size="sm" onClick={handleBulkGenerate} disabled={bulkMutation.isPending || !bulkStart || !bulkEnd}>
                  {bulkMutation.isPending ? '…' : 'Generate'}
                </Button>
                {futureHolidays.length > 0 && <span className="text-[10px] text-blue-500">(skips {futureHolidays.length} holidays)</span>}
                <button onClick={() => setShowBulk(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            ) : showAdd ? (
              <div className="flex items-center gap-2">
                <input type="date" value={newDate} onChange={e => handleDateChange(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
                <Button size="sm" onClick={handleAdd} disabled={addMutation.isPending || !newDate}>
                  {addMutation.isPending ? '…' : 'Add'}
                </Button>
                <button onClick={() => { setShowAdd(false); setAddWarning(''); setAddError(''); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => setShowBulk(true)}>Generate Sessions</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowAdd(true)}>+ Add Date</Button>
              </>
            )}
          </div>
        </div>

        {bulkMutation.isSuccess && (
          <div className="mb-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded text-sm text-green-700">
            Generated {bulkMutation.data?.created} sessions
          </div>
        )}
        {addWarning && <div className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">Warning: {addWarning}</div>}
        {addError && <div className="mb-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded text-sm text-red-700 font-medium">{addError}</div>}
        {hasWrongDays && (
          <div className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
            {wrongDaySessions.size} session{wrongDaySessions.size !== 1 ? 's are' : ' is'} not on the scheduled day ({programDayNames})
          </div>
        )}

        {/* Sessions table */}
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
                <tr><td colSpan={11} className="text-center py-8 text-gray-400">No sessions yet — click "Generate Sessions" or "+ Add Date"</td></tr>
              ) : sessions.map((s, idx) => (
                <SessionRow key={s.id} s={s} idx={idx}
                  professors={professors} allLessons={lessons} filteredLessons={filteredLessons}
                  allowedDays={allowedDays} defaultTime={defaultTime}
                  onUpdate={handleUpdate} onDelete={handleDelete} onDeleteAndShift={handleDeleteAndShift} onToggleBilled={handleToggleBilled} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lesson sidebar — right side */}
      <div className="w-48 flex-shrink-0">
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 sticky top-4">
          <h4 className="text-xs font-semibold text-gray-700 mb-1">Module Lessons</h4>
          {program?.class_name && <p className="text-[10px] text-gray-400 mb-2">{program.class_name}</p>}
          {filteredLessons.length === 0 ? (
            <p className="text-xs text-gray-400">No lessons for this module</p>
          ) : (
            <ul className="space-y-1">
              {filteredLessons.map((l, i) => {
                // Check if this lesson is assigned to any session
                const assigned = sessions.some(s => s.lesson_id === l.id);
                return (
                  <li key={l.id} className={`text-xs flex items-center gap-1 ${assigned ? 'text-green-600' : 'text-gray-600'}`}>
                    <span className="text-gray-300 w-4 text-right flex-shrink-0">{i + 1}.</span>
                    <span className="truncate" title={l.lesson_name}>{l.lesson_name}</span>
                    {assigned && <span className="text-green-400 flex-shrink-0">✓</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-2 pt-2 border-t border-gray-200 text-[10px] text-gray-400">
            {filteredLessons.filter(l => sessions.some(s => s.lesson_id === l.id)).length} / {filteredLessons.length} assigned
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
