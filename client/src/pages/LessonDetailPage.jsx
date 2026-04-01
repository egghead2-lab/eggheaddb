import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getLesson, createLesson, updateLesson, deleteLesson, addLessonClass, removeLessonClass } from '../api/lessons';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { toFormData } from '../lib/utils';

const REVIEW_COLORS = {
  okay: 'bg-green-100 text-green-800',
  review: 'bg-amber-100 text-amber-800',
  overdue: 'bg-red-100 text-red-800',
};

const TYPE_LABELS = {
  science: 'Science', engineering: 'Engineering',
  robotics: 'Robotics', financial_literacy: 'Financial Literacy',
};

const TYPE_COLORS = {
  science: 'bg-blue-100 text-blue-800', engineering: 'bg-orange-100 text-orange-800',
  robotics: 'bg-purple-100 text-purple-800', financial_literacy: 'bg-emerald-100 text-emerald-800',
};

const CURRICULUM_ITEMS = [
  { key: 'status_one_sheet', label: 'One Sheet' },
  { key: 'status_materials', label: 'Materials' },
  { key: 'status_video', label: 'Video' },
  { key: 'status_trainual', label: 'Trainual' },
  { key: 'status_standards', label: 'Standards' },
  { key: 'status_science_accuracy', label: 'Science Accuracy' },
];

export default function LessonDetailPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassId, setNewClassId] = useState('');
  const [newCampType, setNewCampType] = useState('');
  const [copiedField, setCopiedField] = useState(null);

  const { data: lessonData, isLoading } = useQuery({
    queryKey: ['lessons', id],
    queryFn: () => getLesson(id),
    enabled: !isNew,
  });

  const { data: classListData } = useQuery({
    queryKey: ['classes'],
    queryFn: () => fetch('http://localhost:3002/api/classes', { credentials: 'include' }).then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  });
  const classList = classListData?.data || [];

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm();

  useEffect(() => {
    if (lessonData?.data) reset(toFormData(lessonData.data));
  }, [lessonData]);

  const mutation = useMutation({
    mutationFn: (data) => isNew ? createLesson(data) : updateLesson(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['lessons']);
      qc.invalidateQueries(['lessons-page']);
      if (isNew && res?.id) navigate(`/lessons/${res.id}`);
    },
  });

  const addClassMutation = useMutation({
    mutationFn: (data) => addLessonClass(id, data),
    onSuccess: () => { qc.invalidateQueries(['lessons', id]); setShowAddClass(false); setNewClassId(''); setNewCampType(''); },
  });

  const removeClassMutation = useMutation({
    mutationFn: (classId) => removeLessonClass(id, classId),
    onSuccess: () => qc.invalidateQueries(['lessons', id]),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLesson(id),
    onSuccess: () => { qc.invalidateQueries(['lessons']); qc.invalidateQueries(['lessons-page']); navigate('/lessons'); },
  });

  const lesson = lessonData?.data || {};
  const assignedClasses = lesson.classes || [];
  const assignedIds = new Set(assignedClasses.map(c => c.class_id));
  const onSubmit = (data) => mutation.mutate(data);

  const copyText = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  if (!isNew && isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  const selectedClass = classList.find(c => String(c.id) === String(newClassId));
  const isCamp = selectedClass?.program_type_name === 'Camp';

  return (
    <AppShell>
      <UnsavedChangesModal when={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <Link to="/lessons" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Lessons</Link>
            <div className="flex items-center gap-3 mt-0.5">
              <h1 className="text-xl font-bold text-gray-900">
                {isNew ? 'New Lesson' : (lesson.lesson_name ? lesson.lesson_name.toLowerCase().replace(/(?:^|\s|[-'])\S/g, c => c.toUpperCase()) : 'Lesson')}
              </h1>
              {lesson.review_status && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${REVIEW_COLORS[lesson.review_status] || ''}`}>
                  {lesson.review_status === 'okay' ? 'Up to Date' : lesson.review_status === 'review' ? 'Review' : 'Overdue'}
                </span>
              )}
              {lesson.lesson_type && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[lesson.lesson_type] || 'bg-gray-100 text-gray-600'}`}>
                  {TYPE_LABELS[lesson.lesson_type] || lesson.lesson_type}
                </span>
              )}
            </div>
          </div>
          {!isNew && (
            <button type="button" onClick={() => { if (window.confirm('Delete this lesson from all modules?')) deleteMutation.mutate(); }}
              className="text-sm text-red-500 hover:text-red-700">Delete Lesson</button>
          )}
        </div>

        <div className="p-6 space-y-4 pb-32">
          <Section title="Lesson Info" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Lesson Name" required {...register('lesson_name', { required: 'Required' })} error={errors.lesson_name?.message} />
              <Select label="Type" {...register('lesson_type')}>
                <option value="">Not Set</option>
                <option value="science">Science</option>
                <option value="engineering">Engineering</option>
                <option value="robotics">Robotics</option>
                <option value="financial_literacy">Financial Literacy</option>
              </Select>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">Description / Blurb</label>
                {lesson.description && (
                  <button type="button" onClick={() => copyText(lesson.description, 'desc')}
                    className="text-xs text-[#1e3a5f] hover:underline font-medium">
                    {copiedField === 'desc' ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
              <textarea {...register('description')} rows={3}
                className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                placeholder="Lesson description for parents and marketing…" />
            </div>
            <div className="mt-4">
              <Input label="Keywords" {...register('keywords')} placeholder="Comma-separated keywords…" />
            </div>
          </Section>

          <Section title="Links" defaultOpen={true}>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700">Trainual Link</label>
                  {lesson.trainual_link && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => copyText(lesson.trainual_link, 'trainual')} className="text-xs text-[#1e3a5f] hover:underline">
                        {copiedField === 'trainual' ? 'Copied!' : 'Copy'}
                      </button>
                      <a href={lesson.trainual_link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1e3a5f] hover:underline">Open</a>
                    </div>
                  )}
                </div>
                <input {...register('trainual_link')} type="url" placeholder="https://app.trainual.com/..."
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700">Parent Portal Link</label>
                  {lesson.parent_portal_link && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => copyText(lesson.parent_portal_link, 'portal')} className="text-xs text-[#1e3a5f] hover:underline">
                        {copiedField === 'portal' ? 'Copied!' : 'Copy'}
                      </button>
                      <a href={lesson.parent_portal_link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1e3a5f] hover:underline">Open</a>
                    </div>
                  )}
                </div>
                <input {...register('parent_portal_link')} type="url" placeholder="https://share.trainual.com/..."
                  className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
              </div>
            </div>
          </Section>

          {/* Assigned Modules */}
          {!isNew && (
            <Section title={`Assigned Modules (${assignedClasses.length})`} defaultOpen={true}>
              <div className="space-y-2">
                {assignedClasses.map(c => (
                  <div key={c.junction_id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                    <Link to={`/modules/${c.class_id}`} className="font-medium text-sm text-[#1e3a5f] hover:underline">{c.class_name}</Link>
                    {c.program_type_name && <Badge status={c.program_type_name} />}
                    {c.camp_type && (
                      <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">{c.camp_type === 'full_day' ? 'Full Day' : 'Half Day'}</span>
                    )}
                    <button type="button"
                      onClick={() => { if (window.confirm(`Remove from ${c.class_name}?`)) removeClassMutation.mutate(c.class_id); }}
                      className="ml-auto text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                ))}
                {assignedClasses.length === 0 && <p className="text-sm text-gray-400">Not assigned to any modules</p>}
              </div>
              <div className="mt-3">
                {showAddClass ? (
                  <div className="flex gap-2 items-center">
                    <select value={newClassId} onChange={e => setNewClassId(e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1.5 text-sm flex-1 appearance-none pr-8 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]">
                      <option value="">Select module…</option>
                      {classList.filter(c => !assignedIds.has(c.id)).map(c => (
                        <option key={c.id} value={c.id}>{c.class_name}{c.program_type_name ? ` (${c.program_type_name})` : ''}</option>
                      ))}
                    </select>
                    {isCamp && (
                      <select value={newCampType} onChange={e => setNewCampType(e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1.5 text-sm appearance-none pr-8 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]">
                        <option value="">Camp type…</option>
                        <option value="full_day">Full Day</option>
                        <option value="half_day">Half Day</option>
                      </select>
                    )}
                    <Button size="sm" onClick={() => newClassId && addClassMutation.mutate({ class_id: newClassId, camp_type: newCampType || null })}
                      disabled={addClassMutation.isPending || !newClassId}>
                      {addClassMutation.isPending ? '…' : 'Add'}
                    </Button>
                    <button type="button" onClick={() => setShowAddClass(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowAddClass(true)} className="text-sm text-[#1e3a5f] hover:underline">+ Add to Module</button>
                )}
              </div>
            </Section>
          )}

          <Section title="Review Schedule" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Last Reviewed" type="date" {...register('last_reviewed')} />
              <Input label="Next Update Required" type="date" {...register('next_update_required')} />
              <Select label="Review Status" {...register('review_status')}>
                <option value="">Not Set</option>
                <option value="okay">Up to Date</option>
                <option value="review">Review</option>
                <option value="overdue">Overdue</option>
              </Select>
            </div>
          </Section>

          <Section title="Curriculum Item Status" defaultOpen={false}>
            <div className="grid grid-cols-3 gap-4">
              {CURRICULUM_ITEMS.map(item => (
                <Select key={item.key} label={item.label} {...register(item.key)}>
                  <option value="">Not Set</option>
                  <option value="up_to_date">Current</option>
                  <option value="update_needed">Update Needed</option>
                </Select>
              ))}
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
