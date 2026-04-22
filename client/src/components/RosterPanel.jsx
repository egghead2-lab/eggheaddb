import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { searchStudents, addToRoster, removeFromRoster, updateRosterEntry, updateStudent } from '../api/students';
import api from '../api/client';
import { Input } from './ui/Input';

export function RosterPanel({ programId, roster, maxStudents, numberEnrolled, onEnrolledSync }) {
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editDateDropped, setEditDateDropped] = useState('');
  const [editWeeksAttended, setEditWeeksAttended] = useState('');
  const [addError, setAddError] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickFirst, setQuickFirst] = useState('');
  const [quickLast, setQuickLast] = useState('');
  const searchTimeout = useRef(null);
  const qc = useQueryClient();

  const selected = roster.find(r => r.id === selectedId);
  const activeStudents = roster.filter(r => !r.date_dropped);
  const droppedStudents = roster.filter(r => r.date_dropped);
  const activeCount = activeStudents.length;
  const isFull = maxStudents && activeCount >= maxStudents;

  const invalidate = () => qc.invalidateQueries(['programs', String(programId)]);

  // Enrollment mismatch is shown as an inline badge on the parent page — don't prompt here
  const promptSync = () => {};

  const addMutation = useMutation({
    mutationFn: (data) => addToRoster(programId, data),
    onSuccess: (res) => {
      invalidate(); setSearchQuery(''); setSearchResults([]); setShowDropdown(false); setAddError('');
      promptSync(res?.roster_count);
    },
    onError: (err) => setAddError(err?.response?.data?.error || 'Failed to add student'),
  });

  const quickAddMutation = useMutation({
    mutationFn: async ({ first_name, last_name }) => {
      const studentRes = await api.post('/students', { first_name, last_name }).then(r => r.data);
      const rosterRes = await addToRoster(programId, { student_id: studentRes.id });
      return rosterRes;
    },
    onSuccess: (res) => {
      invalidate(); setQuickFirst(''); setQuickLast(''); setShowQuickAdd(false); setAddError('');
      promptSync(res?.roster_count);
    },
    onError: (err) => setAddError(err?.response?.data?.error || 'Failed to add student'),
  });

  const removeMutation = useMutation({
    mutationFn: (rosterId) => removeFromRoster(programId, rosterId),
    onSuccess: (res) => {
      invalidate(); setSelectedId(null);
      promptSync(res?.roster_count);
    },
  });

  const updateRosterMutation = useMutation({
    mutationFn: ({ rosterId, data }) => updateRosterEntry(programId, rosterId, data),
    onSuccess: (res) => {
      invalidate();
      promptSync(res?.roster_count);
    },
  });

  const updateStudentMutation = useMutation({
    mutationFn: ({ studentId, data }) => updateStudent(studentId, data),
    onSuccess: invalidate,
  });

  const handleSearch = (val) => {
    setSearchQuery(val);
    setAddError('');
    if (val.length < 2) { setSearchResults([]); setShowDropdown(false); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchStudents(val);
        const existingIds = new Set(roster.map(r => r.student_id));
        setSearchResults((res.data || []).filter(s => !existingIds.has(s.id)));
        setShowDropdown(true);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 200);
  };

  const handleAddFromSearch = (student) => {
    addMutation.mutate({ student_id: student.id });
  };

  const handleSelect = (r) => {
    setSelectedId(r.id);
    setEditNotes(r.notes || '');
    setEditAge(r.age ?? '');
    setEditFirst(r.first_name || '');
    setEditLast(r.last_name || '');
    setEditDateDropped(r.date_dropped ? r.date_dropped.split('T')[0] : '');
    setEditWeeksAttended(r.weeks_attended ?? '');
  };

  const handleSaveRoster = () => {
    if (!selected) return;
    updateRosterMutation.mutate({
      rosterId: selected.id,
      data: {
        age: editAge || null,
        notes: editNotes || null,
        date_dropped: editDateDropped || null,
        weeks_attended: editWeeksAttended || null,
      },
    });
  };

  const handleSaveStudent = () => {
    if (!selected) return;
    updateStudentMutation.mutate({ studentId: selected.student_id, data: { first_name: editFirst, last_name: editLast } });
  };

  const isDropped = selected && selected.date_dropped;

  return (
    <div>
      {/* Enrollment status bar */}
      <div className={`flex items-center gap-3 mb-3 px-3 py-2 rounded-lg text-sm font-medium ${
        isFull ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
      }`}>
        <span>Roster: {activeCount}{maxStudents ? ` / ${maxStudents}` : ''}</span>
        {numberEnrolled !== undefined && activeCount !== numberEnrolled && activeCount > 0 && (
          <span className="text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded text-xs">
            Enrolled # is {numberEnrolled}
          </span>
        )}
        {droppedStudents.length > 0 && (
          <span className="text-gray-500 font-normal">({droppedStudents.length} dropped)</span>
        )}
        {isFull && <span className="ml-auto text-xs">Class is full</span>}
        {!isFull && maxStudents && <span className="ml-auto text-xs">{maxStudents - activeCount} spot{maxStudents - activeCount !== 1 ? 's' : ''} remaining</span>}
      </div>

      <div className="flex gap-4">
        {/* Left panel — selected student edit */}
        <div className="w-72 flex-shrink-0">
          {selected ? (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3 sticky top-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">Edit Student</h4>
                <button onClick={() => setSelectedId(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
              </div>
              <div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  isDropped ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }`}>
                  {isDropped ? 'Dropped' : 'Active'}
                </span>
              </div>

              <Input label="First Name" value={editFirst} onChange={e => setEditFirst(e.target.value)} />
              <Input label="Last Name" value={editLast} onChange={e => setEditLast(e.target.value)} />
              <button onClick={handleSaveStudent} disabled={updateStudentMutation.isPending}
                className="text-xs text-[#1e3a5f] hover:underline">
                {updateStudentMutation.isPending ? 'Saving…' : 'Save Name'}
              </button>

              <hr className="border-gray-200" />
              <Input label="Age" type="number" value={editAge} onChange={e => setEditAge(e.target.value)} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Notes</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>

              <hr className="border-gray-200" />
              <Input label="Date Dropped" type="date" value={editDateDropped} onChange={e => setEditDateDropped(e.target.value)} />
              {editDateDropped && (
                <Input label="Weeks Attended" type="number" value={editWeeksAttended} onChange={e => setEditWeeksAttended(e.target.value)} />
              )}

              <button onClick={handleSaveRoster} disabled={updateRosterMutation.isPending}
                className="text-xs font-medium text-white bg-[#1e3a5f] px-3 py-1.5 rounded hover:bg-[#152a47]">
                {updateRosterMutation.isPending ? 'Saving…' : 'Save Roster Info'}
              </button>

              {updateRosterMutation.isSuccess && <p className="text-xs text-green-600">Saved</p>}
              {updateStudentMutation.isSuccess && <p className="text-xs text-green-600">Name saved</p>}

              <hr className="border-gray-200" />
              {selected.parent_first_name && (
                <div className="text-xs text-gray-500">
                  <div className="font-medium text-gray-700">Parent</div>
                  <div>{selected.parent_first_name} {selected.parent_last_name}</div>
                  {selected.parent_email && <div>{selected.parent_email}</div>}
                  {selected.parent_phone && <div>{selected.parent_phone}</div>}
                </div>
              )}
              <div className="pt-1 flex items-center justify-between">
                <Link to={`/students/${selected.student_id}`} className="text-xs text-[#1e3a5f] hover:underline">
                  View Full Profile →
                </Link>
                <button
                  onClick={() => { if (window.confirm('Remove from roster entirely?')) removeMutation.mutate(selected.id); }}
                  disabled={removeMutation.isPending}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-sm text-gray-400">
              Click a student to edit
            </div>
          )}
        </div>

        {/* Right side — roster table + add */}
        <div className="flex-1 min-w-0">
          {/* Add student — search or quick add */}
          <div className="mb-3 flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder={isFull ? `Class is full (${activeCount}/${maxStudents})` : 'Search existing student to add…'}
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                disabled={isFull}
                className={`w-full rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:bg-gray-100 disabled:text-gray-400 ${
                  isFull ? 'border-red-300' : 'border-gray-300 focus:border-[#1e3a5f] focus:ring-[#1e3a5f]'
                }`}
              />
              {showDropdown && searchResults.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map(s => (
                    <li key={s.id}
                      onMouseDown={e => { e.preventDefault(); handleAddFromSearch(s); }}
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-[#1e3a5f]/10 flex justify-between">
                      <span className="font-medium">{s.first_name} {s.last_name}</span>
                      {s.parent_first_name && (
                        <span className="text-gray-400 text-xs">Parent: {s.parent_first_name} {s.parent_last_name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {showDropdown && searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-sm text-gray-400">
                  No existing students found
                </div>
              )}
            </div>
            {!isFull && (
              <button type="button" onClick={() => setShowQuickAdd(v => !v)}
                className="px-3 py-1.5 text-xs font-medium text-[#1e3a5f] border border-[#1e3a5f]/30 rounded hover:bg-[#1e3a5f]/5 whitespace-nowrap">
                + New Student
              </button>
            )}
          </div>

          {/* Quick add form */}
          {showQuickAdd && (
            <div className="mb-3 bg-gray-50 rounded-lg border border-gray-200 p-3 flex items-end gap-2">
              <Input label="First Name" value={quickFirst} onChange={e => setQuickFirst(e.target.value)} className="w-40" />
              <Input label="Last Name" value={quickLast} onChange={e => setQuickLast(e.target.value)} className="w-40" />
              <button type="button" disabled={!quickFirst.trim() || !quickLast.trim() || quickAddMutation.isPending}
                onClick={() => quickAddMutation.mutate({ first_name: quickFirst.trim(), last_name: quickLast.trim() })}
                className="px-3 py-1.5 text-xs font-medium text-white bg-[#1e3a5f] rounded hover:bg-[#152a47] disabled:opacity-50">
                {quickAddMutation.isPending ? 'Adding…' : 'Create & Add'}
              </button>
              <button type="button" onClick={() => { setShowQuickAdd(false); setQuickFirst(''); setQuickLast(''); }}
                className="text-xs text-gray-400 hover:text-gray-600 py-1.5">Cancel</button>
            </div>
          )}

          {addError && (
            <div className="mb-3 px-3 py-1.5 bg-red-50 border border-red-200 rounded text-sm text-red-700 font-medium">
              {addError}
            </div>
          )}

          {/* Roster table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Student Name</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-12">Age</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Parent</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Parent Email</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Notes</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {roster.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No students on roster</td></tr>
                ) : (
                  <>
                    {activeStudents.map((r, i) => (
                      <tr key={r.id} onClick={() => handleSelect(r)}
                        className={`cursor-pointer transition-colors ${
                          selectedId === r.id
                            ? 'bg-[#1e3a5f]/10'
                            : i % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'
                        }`}>
                        <td className="px-3 py-2 font-medium text-gray-900">{r.first_name} {r.last_name}</td>
                        <td className="px-3 py-2 text-gray-600">{r.age || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {r.parent_first_name ? `${r.parent_first_name} ${r.parent_last_name}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{r.parent_email || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[200px]">{r.notes || '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>
                        </td>
                      </tr>
                    ))}
                    {droppedStudents.length > 0 && (
                      <>
                        <tr><td colSpan={6} className="bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dropped ({droppedStudents.length})</td></tr>
                        {droppedStudents.map((r) => (
                          <tr key={r.id} onClick={() => handleSelect(r)}
                            className={`cursor-pointer transition-colors ${
                              selectedId === r.id ? 'bg-[#1e3a5f]/10' : 'bg-red-50/30 hover:bg-red-50'
                            }`}>
                            <td className="px-3 py-2 font-medium text-gray-500">{r.first_name} {r.last_name}</td>
                            <td className="px-3 py-2 text-gray-400">{r.age || '—'}</td>
                            <td className="px-3 py-2 text-gray-400">
                              {r.parent_first_name ? `${r.parent_first_name} ${r.parent_last_name}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-400">{r.parent_email || '—'}</td>
                            <td className="px-3 py-2 text-gray-400 truncate max-w-[200px]">
                              {r.weeks_attended ? `${r.weeks_attended} wks` : ''}{r.weeks_attended && r.notes ? ' · ' : ''}{r.notes || (r.weeks_attended ? '' : '—')}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Dropped</span>
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
