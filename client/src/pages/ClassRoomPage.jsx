import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import { formatDate, formatTime } from '../lib/utils';
import api from '../api/client';

const STATUS_ICON = { present: '✓', absent: '✗', late: '⏱', excused: 'E' };
const STATUS_CLASS = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  late: 'bg-amber-100 text-amber-700',
  excused: 'bg-blue-100 text-blue-700',
};
const STATUSES = ['present', 'absent', 'late', 'excused'];

export default function ClassRoomPage() {
  const { id: programId } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('attendance');
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [attendanceEdits, setAttendanceEdits] = useState({});
  const [studentSearch, setStudentSearch] = useState('');
  const [addStudentNote, setAddStudentNote] = useState('');

  const ADMIN_ROLES = ['Admin', 'CEO', 'Scheduling Coordinator', 'Field Manager', 'Client Manager'];
  const isAdmin = ADMIN_ROLES.includes(user?.role);

  // Load classroom data
  const { data: classData, isLoading } = useQuery({
    queryKey: ['classroom', programId],
    queryFn: () => api.get(`/programs/${programId}/classroom`).then(r => r.data),
    enabled: !!programId,
  });

  const program = classData?.data?.program;
  const roster = classData?.data?.roster || [];
  const sessions = classData?.data?.sessions || [];
  const attendanceMap = classData?.data?.attendanceMap || {};

  // Active roster (not dropped)
  const activeRoster = roster.filter(r => !r.date_dropped);

  // Find today's session or nearest upcoming
  const today = new Date().toISOString().split('T')[0];
  const todaySession = useMemo(() => {
    const exact = sessions.find(s => (s.session_date || '').split('T')[0] === today);
    if (exact) return exact;
    // Find nearest upcoming
    return sessions.find(s => (s.session_date || '').split('T')[0] >= today) || sessions[sessions.length - 1];
  }, [sessions, today]);

  // Set initial active session
  if (!activeSessionId && todaySession) {
    setActiveSessionId(todaySession.id);
  }

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const sessionAttendance = activeSessionId ? (attendanceMap[activeSessionId] || {}) : {};

  // Merged attendance state (saved + edits)
  const getStatus = (studentId) => {
    if (attendanceEdits[studentId] !== undefined) return attendanceEdits[studentId];
    return sessionAttendance[studentId]?.status || null;
  };

  // Student search for adding
  const { data: searchResults } = useQuery({
    queryKey: ['student-search', studentSearch],
    queryFn: () => api.get(`/programs/student-search?q=${encodeURIComponent(studentSearch)}`).then(r => r.data),
    enabled: studentSearch.length >= 2,
  });
  const searchStudents = searchResults?.data || [];
  const rosterStudentIds = new Set(roster.map(r => r.student_id));

  // Save attendance
  const saveMutation = useMutation({
    mutationFn: (entries) => api.post(`/programs/${programId}/attendance/${activeSessionId}`, { entries }),
    onSuccess: () => {
      qc.invalidateQueries(['classroom', programId]);
      setAttendanceEdits({});
    },
  });

  const saveAttendance = () => {
    // Build entries for all active roster students
    const entries = activeRoster.map(r => ({
      student_id: r.student_id,
      status: getStatus(r.student_id) || 'present',
      notes: sessionAttendance[r.student_id]?.notes || null,
    }));
    saveMutation.mutate(entries);
  };

  // Mark all present
  const markAllPresent = () => {
    const edits = {};
    activeRoster.forEach(r => { edits[r.student_id] = 'present'; });
    setAttendanceEdits(edits);
  };

  // Add student to roster
  const addStudentMutation = useMutation({
    mutationFn: (student_id) => api.post(`/programs/${programId}/roster/add`, { student_id, notes: addStudentNote || undefined }),
    onSuccess: () => {
      qc.invalidateQueries(['classroom', programId]);
      setStudentSearch('');
      setAddStudentNote('');
    },
  });

  // Remove student from roster
  const removeStudentMutation = useMutation({
    mutationFn: (rosterId) => api.delete(`/programs/${programId}/roster/${rosterId}`),
    onSuccess: () => qc.invalidateQueries(['classroom', programId]),
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  if (!program) return <AppShell><div className="p-6 text-center text-gray-400">Program not found</div></AppShell>;

  // Attendance stats for active session
  const presentCount = activeRoster.filter(r => getStatus(r.student_id) === 'present' || getStatus(r.student_id) === 'late').length;
  const hasUnsaved = Object.keys(attendanceEdits).length > 0;
  const isMarked = activeRoster.every(r => getStatus(r.student_id));

  return (
    <AppShell>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <Link to={isAdmin ? `/classroom-attendance` : '/my-attendance'} className="text-sm text-gray-500 hover:text-[#1e3a5f]">
          ← {isAdmin ? 'Classroom Attendance' : 'My Classes'}
        </Link>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{program.program_nickname}</h1>
            <div className="flex gap-3 text-sm text-gray-500 mt-0.5">
              <span>{program.class_name}</span>
              <span>{program.location_nickname}</span>
              {program.start_time && <span>{formatTime(program.start_time)}</span>}
              <span>{activeRoster.length} student{activeRoster.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          {[['attendance', 'Attendance'], ['roster', 'Roster']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === key ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{label}</button>
          ))}
        </div>

        {/* ========== ATTENDANCE TAB ========== */}
        {tab === 'attendance' && (
          <div className="space-y-4">
            {/* Session picker */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Select Session</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={markAllPresent}>Mark All Present</Button>
                  <Button size="sm" onClick={saveAttendance} disabled={saveMutation.isPending || !hasUnsaved}>
                    {saveMutation.isPending ? 'Saving...' : 'Save Attendance'}
                  </Button>
                </div>
              </div>

              {/* Session date pills */}
              <div className="flex gap-1 flex-wrap">
                {sessions.map(s => {
                  const dateStr = (s.session_date || '').split('T')[0];
                  const isToday = dateStr === today;
                  const isActive = s.id === activeSessionId;
                  const hasData = !!attendanceMap[s.id];
                  const isPast = dateStr < today;
                  return (
                    <button key={s.id}
                      onClick={() => { setActiveSessionId(s.id); setAttendanceEdits({}); }}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        isActive ? 'bg-[#1e3a5f] text-white' :
                        isToday ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' :
                        hasData ? 'bg-green-50 text-green-700' :
                        isPast ? 'bg-gray-100 text-gray-400' :
                        'bg-gray-50 text-gray-500 hover:bg-gray-100'
                      }`}>
                      {formatDate(dateStr)}
                      {isToday && ' (Today)'}
                    </button>
                  );
                })}
              </div>
              {activeSession && (
                <div className="text-xs text-gray-400 mt-2">
                  {activeSession.lesson_name && <span>Lesson: <strong className="text-gray-600">{activeSession.lesson_name}</strong> · </span>}
                  {activeSession.session_time && <span>{formatTime(activeSession.session_time)} · </span>}
                  {isMarked && <span className="text-green-600">{presentCount}/{activeRoster.length} present</span>}
                  {!isMarked && <span className="text-amber-600">Not yet marked</span>}
                </div>
              )}
            </div>

            {/* Attendance grid */}
            {activeSessionId && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600 w-8">#</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Student</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Grade</th>
                      {STATUSES.map(s => (
                        <th key={s} className="text-center px-2 py-2 font-medium text-gray-600 w-20 capitalize">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {activeRoster.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-400">No students on roster</td></tr>
                    ) : activeRoster.map((r, i) => {
                      const current = getStatus(r.student_id);
                      return (
                        <tr key={r.student_id} className={`hover:bg-gray-50 ${current ? '' : 'bg-amber-50/30'}`}>
                          <td className="px-4 py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-900">{r.last_name}, {r.first_name}</td>
                          <td className="px-3 py-2 text-gray-500">{r.grade_name || '—'}</td>
                          {STATUSES.map(s => (
                            <td key={s} className="px-2 py-2 text-center">
                              <button
                                onClick={() => setAttendanceEdits(prev => ({ ...prev, [r.student_id]: s }))}
                                className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                                  current === s ? STATUS_CLASS[s] + ' ring-2 ring-offset-1 ring-current' :
                                  'bg-gray-100 text-gray-300 hover:bg-gray-200 hover:text-gray-500'
                                }`}>
                                {STATUS_ICON[s]}
                              </button>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {hasUnsaved && (
                  <div className="bg-amber-50 border-t border-amber-200 px-4 py-2 flex items-center justify-between">
                    <span className="text-xs text-amber-700">You have unsaved changes</span>
                    <Button size="sm" onClick={saveAttendance} disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )}
                {saveMutation.isSuccess && !hasUnsaved && (
                  <div className="bg-green-50 border-t border-green-200 px-4 py-2 text-xs text-green-700">
                    Attendance saved!
                  </div>
                )}
                {saveMutation.isError && (
                  <div className="bg-red-50 border-t border-red-200 px-4 py-2 text-xs text-red-700">
                    {saveMutation.error?.response?.data?.error || 'Failed to save'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========== ROSTER TAB ========== */}
        {tab === 'roster' && (
          <div className="space-y-4">
            {/* Add student — simple form */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Student</h3>
              <QuickAddStudentForm programId={programId} onSuccess={() => qc.invalidateQueries(['classroom', programId])} />
            </div>

            {/* Roster table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Grade</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Birthday</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Notes</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Attendance</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {roster.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-400">No students on roster</td></tr>
                  ) : roster.map((r, i) => {
                    // Calculate attendance rate
                    let attended = 0, total = 0;
                    Object.entries(attendanceMap).forEach(([sid, stuMap]) => {
                      if (stuMap[r.student_id]) {
                        total++;
                        if (stuMap[r.student_id].status === 'present' || stuMap[r.student_id].status === 'late') attended++;
                      }
                    });
                    const rate = total > 0 ? Math.round((attended / total) * 100) : null;

                    return (
                      <tr key={r.roster_id} className={`hover:bg-gray-50 ${r.date_dropped ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">
                          {r.last_name}, {r.first_name}
                          {r.date_dropped && <span className="text-xs text-red-400 ml-2">Dropped {formatDate(r.date_dropped)}</span>}
                          {r.pending_approval ? <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded ml-2">Pending Approval</span> : null}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{r.grade_name || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{r.birthday ? formatDate(r.birthday) : '—'}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{r.notes || '—'}</td>
                        <td className="px-3 py-2 text-center">
                          {rate !== null ? (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                              rate >= 80 ? 'bg-green-100 text-green-700' :
                              rate >= 60 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>{rate}% ({attended}/{total})</span>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {!r.date_dropped && (
                            <button
                              onClick={() => { if (confirm(`Remove ${r.first_name} ${r.last_name} from roster?`)) removeStudentMutation.mutate(r.roster_id); }}
                              className="text-xs text-gray-300 hover:text-red-500">Remove</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function QuickAddStudentForm({ programId, onSuccess }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [age, setAge] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post(`/programs/${programId}/roster/quick-add`, {
      first_name: first.trim(), last_name: last.trim(), age: age || null, notes: notes || null,
    }),
    onSuccess: () => { setFirst(''); setLast(''); setAge(''); setNotes(''); onSuccess?.(); },
  });

  return (
    <div>
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[120px]">
          <label className="text-xs text-gray-500 block mb-0.5">First Name *</label>
          <input type="text" value={first} onChange={e => setFirst(e.target.value)}
            placeholder="First name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]" />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="text-xs text-gray-500 block mb-0.5">Last Name</label>
          <input type="text" value={last} onChange={e => setLast(e.target.value)}
            placeholder="Last name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]" />
        </div>
        <div className="w-16">
          <label className="text-xs text-gray-500 block mb-0.5">Age</label>
          <input type="number" value={age} onChange={e => setAge(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]" />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="text-xs text-gray-500 block mb-0.5">Notes</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]" />
        </div>
        <button onClick={() => mutation.mutate()} disabled={!first.trim() || mutation.isPending}
          className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a47] disabled:opacity-50 active:scale-95 transition-all">
          {mutation.isPending ? '…' : 'Add'}
        </button>
      </div>
      {mutation.isError && <p className="text-xs text-red-600 mt-1">{mutation.error?.response?.data?.error || 'Failed'}</p>}
      {mutation.isSuccess && <p className="text-xs text-green-600 mt-1">Student added! Pending approval.</p>}
    </div>
  );
}
