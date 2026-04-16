import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getStudent, createStudent, updateStudent } from '../api/students';
import { searchParents, createParent, linkStudent, unlinkStudent } from '../api/parents';
import { useLocationList, useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { SearchSelect } from '../components/ui/SearchSelect';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { formatDate, calcAge, toFormData } from '../lib/utils';

export default function StudentDetailPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: studentData, isLoading } = useQuery({
    queryKey: ['students', id],
    queryFn: () => getStudent(id),
    enabled: !isNew,
  });

  const { data: locationListData } = useLocationList();
  const locations = locationListData?.data || [];
  const { data: refData } = useGeneralData();
  const grades = refData?.data?.grades || [];

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty } } = useForm();

  useEffect(() => {
    if (studentData?.data) reset(toFormData(studentData.data));
  }, [studentData]);

  const mutation = useMutation({
    mutationFn: (data) => isNew ? createStudent(data) : updateStudent(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['students']);
      if (isNew && res?.id) navigate(`/students/${res.id}`);
    },
  });

  const student = studentData?.data || {};
  const onSubmit = (data) => mutation.mutate(data);

  // --- Parent search/add ---
  const [parentSearch, setParentSearch] = useState('');
  const [parentResults, setParentResults] = useState([]);
  const [showCreateParent, setShowCreateParent] = useState(false);
  const [newParentData, setNewParentData] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const [savingParent, setSavingParent] = useState(false);
  const parentSearchRef = useRef(null);

  const handleParentSearch = async (q) => {
    setParentSearch(q);
    if (q.length < 2) { setParentResults([]); return; }
    const res = await searchParents(q);
    setParentResults(res.data || []);
  };

  const handleLinkParent = async (parent) => {
    setSavingParent(true);
    try {
      await linkStudent(parent.id, { student_id: parseInt(id) });
      qc.invalidateQueries(['students', id]);
      setParentSearch(''); setParentResults([]);
    } catch (err) {
      console.error('Link parent error:', err);
      alert('Failed to link parent: ' + (err?.response?.data?.error || err.message));
    } finally { setSavingParent(false); }
  };

  const handleCreateAndLinkParent = async () => {
    if (!newParentData.first_name || !newParentData.last_name) return;
    setSavingParent(true);
    try {
      const res = await createParent(newParentData);
      await linkStudent(res.id, { student_id: parseInt(id) });
      qc.invalidateQueries(['students', id]);
      setShowCreateParent(false);
      setNewParentData({ first_name: '', last_name: '', email: '', phone: '' });
    } catch (err) {
      console.error('Create & link parent error:', err);
      alert('Failed: ' + (err?.response?.data?.error || err.message));
    } finally { setSavingParent(false); }
  };

  const unlinkParentMutation = useMutation({
    mutationFn: (parentId) => unlinkStudent(parentId, id),
    onSuccess: () => qc.invalidateQueries(['students', id]),
  });

  useEffect(() => {
    const handler = (e) => {
      if (parentSearchRef.current && !parentSearchRef.current.contains(e.target)) setParentResults([]);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isNew && isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  return (
    <AppShell>
      <UnsavedChangesModal when={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <Link to="/students" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Students</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-0.5">
            {isNew ? 'New Student' : `${student.first_name || ''} ${student.last_name || ''}`}
          </h1>
        </div>

        <div className="p-6 space-y-4 pb-32">
          <Section title="Student Info" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-4">
              <Input label="First Name" required {...register('first_name', { required: 'Required' })} error={errors.first_name?.message} />
              <Input label="Last Name" required {...register('last_name', { required: 'Required' })} error={errors.last_name?.message} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Age</label>
                <div className="text-sm px-3 py-1.5 border border-gray-200 rounded bg-gray-50 text-gray-600">
                  {calcAge(watch('birthday')) ?? '—'}
                </div>
              </div>
              <Input label="Birthday" type="date" {...register('birthday')} />
              <div>
                <Select label="Current Grade" value={watch('current_grade_id') || ''} onChange={e => setValue('current_grade_id', e.target.value, { shouldDirty: true })}>
                  <option value="">Unknown</option>
                  {grades.map(g => <option key={g.id} value={g.id}>{g.grade_name}</option>)}
                </Select>
              </div>
              <SearchSelect
                label="Location"
                value={watch('location_id')}
                onChange={v => setValue('location_id', v, { shouldDirty: true })}
                options={locations}
                displayKey="nickname"
                valueKey="id"
                placeholder="Search locations…"
              />
              <div className="col-span-3">
                <Input label="Address" {...register('address')} />
              </div>
            </div>
          </Section>

          {/* Parents / Guardians */}
          {!isNew && (
            <Section title={`Parents / Guardians (${(student.parents || []).length})`} defaultOpen={true} overflow="visible">
              <div className="space-y-2 mb-3">
                {(student.parents || []).length === 0 && (
                  <p className="text-sm text-gray-400">No parents linked yet.</p>
                )}
                {(student.parents || []).map(p => (
                  <div key={p.id} className="flex items-center gap-4 text-sm bg-gray-50 rounded px-3 py-2">
                    <Link to={`/parents/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline min-w-[140px]">
                      {p.first_name} {p.last_name}
                    </Link>
                    <span className="text-gray-500">{p.email || '—'}</span>
                    <span className="text-gray-500">{p.phone || '—'}</span>
                    <button
                      type="button"
                      onClick={() => unlinkParentMutation.mutate(p.id)}
                      className="ml-auto text-xs text-gray-300 hover:text-red-500"
                      title="Remove"
                    >✕</button>
                  </div>
                ))}
              </div>

              {/* Add parent */}
              {!showCreateParent ? (
                <div className="flex items-start gap-3">
                  <div className="relative" ref={parentSearchRef}>
                    <input
                      type="text"
                      placeholder="Search parents to add…"
                      value={parentSearch}
                      onChange={e => handleParentSearch(e.target.value)}
                      className="block w-60 rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                    />
                    {parentResults.length > 0 && (
                      <ul className="absolute top-full z-20 mt-1 w-72 bg-white border border-gray-200 rounded shadow max-h-48 overflow-y-auto">
                        {parentResults
                          .filter(p => !(student.parents || []).find(sp => sp.id === p.id))
                          .map(p => (
                            <li key={p.id} onMouseDown={(e) => { e.preventDefault(); handleLinkParent(p); }} className="px-3 py-2 text-sm cursor-pointer hover:bg-[#1e3a5f]/10">
                              <span className="font-medium">{p.first_name} {p.last_name}</span>
                              {p.email && <span className="text-gray-400 ml-2 text-xs">{p.email}</span>}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                  <button type="button" onClick={() => setShowCreateParent(true)} className="text-sm text-[#1e3a5f] hover:underline py-1.5">
                    + New Parent
                  </button>
                </div>
              ) : (
                <div className="flex items-end gap-2 flex-wrap bg-gray-50 border border-gray-200 rounded px-3 py-2">
                  <Input label="First Name" value={newParentData.first_name} onChange={e => setNewParentData(d => ({ ...d, first_name: e.target.value }))} />
                  <Input label="Last Name" value={newParentData.last_name} onChange={e => setNewParentData(d => ({ ...d, last_name: e.target.value }))} />
                  <Input label="Email" type="email" value={newParentData.email} onChange={e => setNewParentData(d => ({ ...d, email: e.target.value }))} />
                  <Input label="Phone" value={newParentData.phone} onChange={e => setNewParentData(d => ({ ...d, phone: e.target.value }))} />
                  <button type="button" onClick={handleCreateAndLinkParent} disabled={savingParent || !newParentData.first_name || !newParentData.last_name} className="text-xs text-white bg-[#1e3a5f] hover:bg-[#162d4a] disabled:opacity-50 px-3 py-1.5 rounded mb-0.5">
                    {savingParent ? 'Saving…' : 'Create & Link'}
                  </button>
                  <button type="button" onClick={() => { setShowCreateParent(false); setNewParentData({ first_name: '', last_name: '', email: '', phone: '' }); }} className="text-xs text-gray-400 hover:text-gray-600 py-1.5 mb-0.5">
                    Cancel
                  </button>
                </div>
              )}
            </Section>
          )}

          {/* Program History */}
          {student.programs && student.programs.length > 0 && (
            <Section title={`Program History (${student.programs.length})`}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Age</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {student.programs.map(p => (
                    <tr key={p.id}>
                      <td className="px-3 py-2">
                        <Link to={`/programs/${p.program_id}`} className="text-[#1e3a5f] hover:underline">
                          {p.program_nickname}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{p.location_nickname || '—'}</td>
                      <td className="px-3 py-2"><Badge status={p.class_status_name} /></td>
                      <td className="px-3 py-2 text-gray-600">{p.age || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{p.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </div>

        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && (
            <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>
          )}
          {mutation.isSuccess && <p className="text-sm text-green-600">Saved successfully</p>}
          <div className="ml-auto flex gap-3">
            <Link to="/students" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
