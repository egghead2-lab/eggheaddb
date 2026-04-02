import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getClass, updateClass } from '../api/classes';
import { useGeneralData } from '../hooks/useReferenceData';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { toFormData } from '../lib/utils';

export default function ModuleDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [copiedField, setCopiedField] = useState(null);

  const { data: classData, isLoading } = useQuery({
    queryKey: ['classes', id],
    queryFn: () => getClass(id),
  });

  const { data: refData } = useGeneralData();
  const programTypes = refData?.data?.programTypes || [];

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isDirty } } = useForm();

  useEffect(() => {
    if (classData?.data) reset(toFormData(classData.data));
  }, [classData]);

  const mutation = useMutation({
    mutationFn: (data) => updateClass(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['classes']);
      qc.invalidateQueries(['lessons-page']);
    },
  });

  const cls = classData?.data || {};
  const lessons = cls.lessons || [];
  const onSubmit = (data) => mutation.mutate(data);

  const copyText = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  if (isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  return (
    <AppShell>
      <UnsavedChangesModal when={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <Link to="/lessons" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Lessons</Link>
          <div className="flex items-center gap-3 mt-0.5">
            <h1 className="text-xl font-bold text-gray-900">{cls.class_name || 'Module'}</h1>
            {cls.program_type_name && <Badge status={cls.program_type_name} />}
          </div>
          <span className="text-sm text-gray-500">{lessons.length} lessons in this module</span>
        </div>

        <div className="p-6 space-y-4 pb-32">
          <Section title="Module Info" defaultOpen={true} overflow="visible">
            <div className="grid grid-cols-4 gap-4">
              <Input label="Module Name" {...register('class_name')} />
              <Input label="Formal Name" {...register('formal_class_name')} />
              <Input
                label="Code (3 letters)"
                {...register('class_code')}
                onChange={e => setValue('class_code', e.target.value.toUpperCase().slice(0, 3), { shouldDirty: true })}
                placeholder="e.g. AST"
              />
              <Select
                label="Type"
                value={watch('program_type_id') || ''}
                onChange={e => setValue('program_type_id', e.target.value, { shouldDirty: true })}
              >
                <option value="">No type</option>
                {programTypes.map(pt => (
                  <option key={pt.id} value={pt.id}>{pt.program_type_name}</option>
                ))}
              </Select>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">Description / Blurb</label>
                {cls.description && (
                  <button type="button" onClick={() => copyText(cls.description, 'description')}
                    className="text-xs text-[#1e3a5f] hover:underline font-medium">
                    {copiedField === 'description' ? 'Copied!' : 'Copy Blurb'}
                  </button>
                )}
              </div>
              <textarea {...register('description')} rows={4}
                className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                placeholder="Enter a description for parents and marketing…" />
            </div>
          </Section>

          <Section title="Links" defaultOpen={true}>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700">Trainual Link</label>
                  {cls.trainual_link && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => copyText(cls.trainual_link, 'trainual')} className="text-xs text-[#1e3a5f] hover:underline">
                        {copiedField === 'trainual' ? 'Copied!' : 'Copy'}
                      </button>
                      <a href={cls.trainual_link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1e3a5f] hover:underline">Open</a>
                    </div>
                  )}
                </div>
                <input {...register('trainual_link')} type="url" placeholder="https://..."
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700">Parent Portal Link</label>
                  {cls.parent_portal_link && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => copyText(cls.parent_portal_link, 'portal')} className="text-xs text-[#1e3a5f] hover:underline">
                        {copiedField === 'portal' ? 'Copied!' : 'Copy'}
                      </button>
                      <a href={cls.parent_portal_link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1e3a5f] hover:underline">Open</a>
                    </div>
                  )}
                </div>
                <input {...register('parent_portal_link')} type="url" placeholder="https://..."
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
            </div>
          </Section>

          <Section title="Keywords & Standards" defaultOpen={false}>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Keywords</label>
                <textarea {...register('keywords')} rows={2}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="Comma-separated keywords…" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Standards</label>
                <textarea {...register('standards')} rows={3}
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="NGSS standards, etc.…" />
              </div>
            </div>
          </Section>

          {/* Lessons in this module */}
          <Section title={`Lessons (${lessons.length})`} defaultOpen={true}>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {lessons.map((l, i) => (
                    <tr key={l.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2">
                        <Link to={`/lessons/${l.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                          {l.lesson_name.toLowerCase().replace(/(?:^|\s|[-'])\S/g, c => c.toUpperCase())}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>}
          {mutation.isSuccess && <p className="text-sm text-green-600">Saved successfully</p>}
          <div className="ml-auto flex gap-3">
            <Link to="/lessons" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
