import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  getParent, createParent, updateParent, deleteParent,
  linkStudent, unlinkStudent, updateStudentLocation, linkCoParent, searchParents,
} from '../api/parents';
import { searchStudents, createStudent } from '../api/students';
import { useLocationList } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { formatDate, calcAge, toFormData } from '../lib/utils';

export default function ParentDetailPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: parentData, isLoading } = useQuery({
    queryKey: ['parents', id],
    queryFn: () => getParent(id),
    enabled: !isNew,
  });

  const { data: locationListData } = useLocationList();
  const locations = locationListData?.data || [];

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm();

  useEffect(() => {
    if (parentData?.data) reset(toFormData(parentData.data));
  }, [parentData]);

  const mutation = useMutation({
    mutationFn: (data) => isNew ? createParent(data) : updateParent(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['parents']);
      if (isNew && res?.id) navigate(`/parents/${res.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteParent(id),
    onSuccess: () => { qc.invalidateQueries(['parents']); navigate('/parents'); },
  });

  const parent = parentData?.data || {};
  const students = parent.students || [];
  const parties = parent.parties || [];

  const onSubmit = (data) => mutation.mutate(data);

  // --- Student location editing ---
  const [locationEdits, setLocationEdits] = useState({});
  const [savingLocation, setSavingLocation] = useState({});

  const handleLocationSave = async (studentId) => {
    const newLocId = locationEdits[studentId];
    setSavingLocation(s => ({ ...s, [studentId]: true }));
    try {
      await updateStudentLocation(id, studentId, newLocId || null);
      qc.invalidateQueries(['parents', id]);
      setLocationEdits(e => { const n = { ...e }; delete n[studentId]; return n; });
    } finally {
      setSavingLocation(s => ({ ...s, [studentId]: false }));
    }
  };

  // --- Add existing student ---
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const searchRef = useRef(null);

  const handleStudentSearch = async (q) => {
    setStudentSearch(q);
    if (q.length < 2) { setStudentResults([]); return; }
    setSearchingStudents(true);
    try {
      const res = await searchStudents(q);
      setStudentResults(res.data || []);
    } finally {
      setSearchingStudents(false);
    }
  };

  const handleAddStudent = async (student) => {
    await linkStudent(id, { student_id: student.id });
    qc.invalidateQueries(['parents', id]);
    setStudentSearch('');
    setStudentResults([]);
  };

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setStudentResults([]);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // --- Create new student ---
  const [showNewStudent, setShowNewStudent] = useState(false);
  const [newStudentData, setNewStudentData] = useState({ first_name: '', last_name: '', birthday: '' });
  const [creatingStudent, setCreatingStudent] = useState(false);

  const handleCreateStudent = async () => {
    if (!newStudentData.first_name || !newStudentData.last_name) return;
    setCreatingStudent(true);
    try {
      const res = await createStudent({ ...newStudentData, birthday: newStudentData.birthday || null });
      await linkStudent(id, { student_id: res.id });
      qc.invalidateQueries(['parents', id]);
      setShowNewStudent(false);
      setNewStudentData({ first_name: '', last_name: '', birthday: '' });
    } finally {
      setCreatingStudent(false);
    }
  };

  const unlinkMutation = useMutation({
    mutationFn: (studentId) => unlinkStudent(id, studentId),
    onSuccess: () => qc.invalidateQueries(['parents', id]),
  });

  // --- Co-parent per student ---
  // coParentSearch: { [studentId]: { query, results, show, showCreate, newData, saving } }
  const [coParentState, setCoParentState] = useState({});

  const getCPS = (studentId) => coParentState[studentId] || { query: '', results: [], show: false, showCreate: false, newData: { first_name: '', last_name: '', email: '', phone: '' }, saving: false };
  const setCPS = (studentId, patch) => setCoParentState(prev => ({ ...prev, [studentId]: { ...getCPS(studentId), ...patch } }));

  const handleCoParentSearch = async (studentId, q) => {
    setCPS(studentId, { query: q, show: true });
    if (q.length < 2) { setCPS(studentId, { results: [] }); return; }
    const res = await searchParents(q);
    setCPS(studentId, { results: res.data || [] });
  };

  const handleLinkCoParent = async (studentId, coParent) => {
    setCPS(studentId, { saving: true });
    try {
      await linkCoParent(coParent.id, studentId);
      qc.invalidateQueries(['parents', id]);
      setCPS(studentId, { query: '', results: [], show: false });
    } finally {
      setCPS(studentId, { saving: false });
    }
  };

  const handleCreateCoParent = async (studentId) => {
    const cps = getCPS(studentId);
    if (!cps.newData.first_name || !cps.newData.last_name) return;
    setCPS(studentId, { saving: true });
    try {
      const res = await createParent(cps.newData);
      await linkCoParent(res.id, studentId);
      qc.invalidateQueries(['parents', id]);
      setCPS(studentId, { showCreate: false, show: false, query: '', results: '', newData: { first_name: '', last_name: '', email: '', phone: '' } });
    } finally {
      setCPS(studentId, { saving: false });
    }
  };

  if (!isNew && isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  const linkedStudentIds = new Set(students.map(s => s.id));

  return (
    <AppShell>
      <UnsavedChangesModal when={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div>
            <Link to="/parents" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Parents</Link>
            <h1 className="text-lg font-bold text-gray-900 mt-0.5">
              {isNew ? 'New Parent' : `${parent.first_name || ''} ${parent.last_name || ''}`}
            </h1>
          </div>
          {!isNew && (
            <button
              type="button"
              onClick={() => { if (window.confirm('Deactivate this parent?')) deleteMutation.mutate(); }}
              className="text-xs text-red-400 hover:text-red-600"
            >
              Deactivate
            </button>
          )}
        </div>

        <div className="p-4 space-y-3 pb-24">
          {/* Contact Info */}
          <Section title="Contact Info" defaultOpen={true}>
            <div className="grid grid-cols-4 gap-3">
              <Input
                label="First Name"
                required
                {...register('first_name', { required: 'Required' })}
                error={errors.first_name?.message}
              />
              <Input
                label="Last Name"
                required
                {...register('last_name', { required: 'Required' })}
                error={errors.last_name?.message}
              />
              <Input label="Email" type="email" {...register('email')} />
              <Input label="Phone" type="tel" {...register('phone')} />
            </div>
          </Section>

          {/* Students */}
          {!isNew && (
            <Section title={`Students (${students.length})`} defaultOpen={true} overflow="visible">
              {students.length > 0 && (
                <table className="w-full text-sm mb-4">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Age</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Grade</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Primary Location</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Other Parents</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.map(s => {
                      const editVal = locationEdits[s.id];
                      const isEditing = editVal !== undefined;
                      const currentLocId = isEditing ? editVal : (s.location_id ?? '');
                      const cps = getCPS(s.id);
                      const coParents = s.co_parents || [];
                      return (
                        <tr key={s.id} className="align-top">
                          <td className="px-3 py-2">
                            <Link to={`/students/${s.id}`} className="text-[#1e3a5f] hover:underline font-medium">
                              {s.first_name} {s.last_name}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-gray-500">{calcAge(s.birthday) ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{s.current_grade_name || '—'}</td>
                          <td className="px-3 py-2">
                            <Select
                              value={currentLocId}
                              onChange={e => setLocationEdits(prev => ({ ...prev, [s.id]: e.target.value }))}
                            >
                              <option value="">No location</option>
                              {locations.map(l => (
                                <option key={l.id} value={l.id}>{l.nickname}</option>
                              ))}
                            </Select>
                            {isEditing && (
                              <button
                                type="button"
                                onClick={() => handleLocationSave(s.id)}
                                disabled={savingLocation[s.id]}
                                className="mt-1 text-xs text-white bg-[#1e3a5f] hover:bg-[#162d4a] px-2 py-0.5 rounded"
                              >
                                {savingLocation[s.id] ? '…' : 'Save'}
                              </button>
                            )}
                          </td>
                          {/* Co-parents column */}
                          <td className="px-3 py-2">
                            <div className="space-y-0.5">
                              {coParents.map(cp => (
                                <div key={cp.id} className="flex items-center gap-1.5">
                                  <Link to={`/parents/${cp.id}`} className="text-[#1e3a5f] hover:underline text-xs">
                                    {cp.first_name} {cp.last_name}
                                  </Link>
                                  {cp.email && <span className="text-gray-400 text-xs">· {cp.email}</span>}
                                </div>
                              ))}
                              {/* Add co-parent UI */}
                              {!cps.show ? (
                                <button type="button" onClick={() => setCPS(s.id, { show: true })} className="text-xs text-[#1e3a5f] hover:underline">
                                  + Add parent
                                </button>
                              ) : cps.showCreate ? (
                                <div className="bg-gray-50 border border-gray-200 rounded p-2 space-y-1.5 min-w-[260px]">
                                  <div className="flex gap-1.5">
                                    <input placeholder="First" value={cps.newData.first_name} onChange={e => setCPS(s.id, { newData: { ...cps.newData, first_name: e.target.value } })} className="w-20 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#1e3a5f]" />
                                    <input placeholder="Last" value={cps.newData.last_name} onChange={e => setCPS(s.id, { newData: { ...cps.newData, last_name: e.target.value } })} className="w-24 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#1e3a5f]" />
                                  </div>
                                  <input placeholder="Email" type="email" value={cps.newData.email} onChange={e => setCPS(s.id, { newData: { ...cps.newData, email: e.target.value } })} className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#1e3a5f]" />
                                  <input placeholder="Phone" value={cps.newData.phone} onChange={e => setCPS(s.id, { newData: { ...cps.newData, phone: e.target.value } })} className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#1e3a5f]" />
                                  <div className="flex gap-2 pt-0.5">
                                    <button type="button" onClick={() => handleCreateCoParent(s.id)} disabled={cps.saving || !cps.newData.first_name || !cps.newData.last_name} className="text-xs text-white bg-[#1e3a5f] hover:bg-[#162d4a] disabled:opacity-50 px-2 py-1 rounded">
                                      {cps.saving ? '…' : 'Create & Link'}
                                    </button>
                                    <button type="button" onClick={() => setCPS(s.id, { showCreate: false })} className="text-xs text-gray-400 hover:text-gray-600">Back</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="relative min-w-[200px]">
                                  <input
                                    type="text"
                                    placeholder="Search parents…"
                                    value={cps.query}
                                    onChange={e => handleCoParentSearch(s.id, e.target.value)}
                                    autoFocus
                                    className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#1e3a5f]"
                                  />
                                  {cps.results.length > 0 && (
                                    <ul className="absolute top-full z-30 mt-0.5 w-56 bg-white border border-gray-200 rounded shadow max-h-40 overflow-y-auto">
                                      {cps.results.filter(p => p.id !== parseInt(id) && !coParents.find(cp => cp.id === p.id)).map(p => (
                                        <li key={p.id} onMouseDown={(e) => { e.preventDefault(); handleLinkCoParent(s.id, p); }} className="px-2 py-1.5 text-xs cursor-pointer hover:bg-[#1e3a5f]/10">
                                          <span className="font-medium">{p.first_name} {p.last_name}</span>
                                          {p.email && <span className="text-gray-400 ml-1">{p.email}</span>}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  <div className="flex gap-2 mt-1">
                                    <button type="button" onClick={() => setCPS(s.id, { showCreate: true, query: '' })} className="text-xs text-[#1e3a5f] hover:underline">+ New parent</button>
                                    <button type="button" onClick={() => setCPS(s.id, { show: false, query: '', results: [] })} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => unlinkMutation.mutate(s.id)}
                              className="text-xs text-gray-400 hover:text-red-500"
                              title="Remove from this parent"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* Add / create student */}
              <div className="flex items-start gap-3 flex-wrap">
                {/* Search existing */}
                <div className="relative" ref={searchRef}>
                  <input
                    type="text"
                    placeholder="Search existing students…"
                    value={studentSearch}
                    onChange={e => handleStudentSearch(e.target.value)}
                    className="block w-64 rounded border border-gray-300 text-sm shadow-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  />
                  {searchingStudents && (
                    <div className="absolute top-full mt-1 z-30 bg-white border border-gray-200 rounded shadow px-3 py-2 text-sm text-gray-400 w-64">
                      Searching…
                    </div>
                  )}
                  {studentResults.length > 0 && (
                    <ul className="absolute top-full z-30 mt-1 bg-white border border-gray-200 rounded shadow max-h-52 overflow-y-auto w-72">
                      {studentResults.filter(s => !linkedStudentIds.has(s.id)).map(s => (
                        <li
                          key={s.id}
                          onMouseDown={(e) => { e.preventDefault(); handleAddStudent(s); }}
                          className="px-3 py-2 text-sm cursor-pointer hover:bg-[#1e3a5f]/10"
                        >
                          <span className="font-medium">{s.first_name} {s.last_name}</span>
                          {s.parent_first_name && (
                            <span className="text-gray-400 ml-2 text-xs">({s.parent_first_name} {s.parent_last_name})</span>
                          )}
                        </li>
                      ))}
                      {studentResults.filter(s => !linkedStudentIds.has(s.id)).length === 0 && (
                        <li className="px-3 py-2 text-sm text-gray-400">All matches already linked</li>
                      )}
                    </ul>
                  )}
                </div>

                {/* Create new */}
                {!showNewStudent ? (
                  <button
                    type="button"
                    onClick={() => setShowNewStudent(true)}
                    className="text-sm text-[#1e3a5f] hover:underline py-1.5"
                  >
                    + New Student
                  </button>
                ) : (
                  <div className="flex items-end gap-2 flex-wrap bg-gray-50 border border-gray-200 rounded px-3 py-2">
                    <Input
                      label="First Name"
                      value={newStudentData.first_name}
                      onChange={e => setNewStudentData(d => ({ ...d, first_name: e.target.value }))}
                      className="w-32"
                    />
                    <Input
                      label="Last Name"
                      value={newStudentData.last_name}
                      onChange={e => setNewStudentData(d => ({ ...d, last_name: e.target.value }))}
                      className="w-32"
                    />
                    <Input
                      label="Birthday"
                      type="date"
                      value={newStudentData.birthday}
                      onChange={e => setNewStudentData(d => ({ ...d, birthday: e.target.value }))}
                      className="w-36"
                    />
                    <button
                      type="button"
                      onClick={handleCreateStudent}
                      disabled={creatingStudent || !newStudentData.first_name || !newStudentData.last_name}
                      className="text-xs text-white bg-[#1e3a5f] hover:bg-[#162d4a] disabled:opacity-50 px-3 py-1.5 rounded mb-0.5"
                    >
                      {creatingStudent ? 'Adding…' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNewStudent(false); setNewStudentData({ first_name: '', last_name: '', birthday: '' }); }}
                      className="text-xs text-gray-400 hover:text-gray-600 py-1.5 mb-0.5"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Party History */}
          {!isNew && parties.length > 0 && (
            <Section title={`Party History (${parties.length})`}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Format</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Theme</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parties.map(p => (
                    <tr key={p.id}>
                      <td className="px-3 py-2">
                        <Link to={`/parties/${p.id}`} className="text-[#1e3a5f] hover:underline">
                          {p.first_session_date ? formatDate(p.first_session_date) : '—'}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{p.party_format_name || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{p.party_theme || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{p.party_location_text || '—'}</td>
                      <td className="px-3 py-2"><Badge status={p.class_status_name} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>}
          {mutation.isSuccess && <p className="text-sm text-green-600">Saved</p>}
          <div className="ml-auto flex gap-3">
            <Link to="/parents" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
