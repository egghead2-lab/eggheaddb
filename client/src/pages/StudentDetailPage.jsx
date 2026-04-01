import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getStudent, createStudent, updateStudent } from '../api/students';
import { useLocationList } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { SearchSelect } from '../components/ui/SearchSelect';
import { formatDate, toFormData } from '../lib/utils';

export default function StudentDetailPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: studentData, isLoading } = useQuery({
    queryKey: ['students', id],
    queryFn: () => getStudent(id),
    enabled: !isNew,
  });

  const { data: locationListData } = useLocationList();
  const locations = locationListData?.data || [];

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm();

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

  if (!isNew && isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  return (
    <AppShell>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <Link to="/students" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Students</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-0.5">
            {isNew ? 'New Student' : `${student.first_name || ''} ${student.last_name || ''}`}
          </h1>
        </div>

        <div className="p-6 space-y-4 pb-32">
          <Section title="Student Info" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" required {...register('first_name', { required: 'Required' })} error={errors.first_name?.message} />
              <Input label="Last Name" required {...register('last_name', { required: 'Required' })} error={errors.last_name?.message} />
              <Input label="Birthday" type="date" {...register('birthday')} />
              <SearchSelect
                label="Location"
                value={watch('location_id')}
                onChange={v => setValue('location_id', v, { shouldDirty: true })}
                options={locations}
                displayKey="nickname"
                valueKey="id"
                placeholder="Search locations…"
              />
              <Input label="Address" {...register('address')} />
            </div>
          </Section>

          {/* Parents */}
          {student.parents && student.parents.length > 0 && (
            <Section title="Parents / Guardians" defaultOpen={true}>
              <div className="space-y-3">
                {student.parents.map(p => (
                  <div key={p.id} className="flex items-center gap-4 text-sm bg-gray-50 rounded-lg px-4 py-3">
                    <div>
                      <span className="font-medium text-gray-900">{p.first_name} {p.last_name}</span>
                    </div>
                    <div className="text-gray-600">{p.email || '—'}</div>
                    <div className="text-gray-600">{p.phone || '—'}</div>
                  </div>
                ))}
              </div>
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
