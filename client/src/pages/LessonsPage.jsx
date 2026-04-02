import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLessonsPage, createLesson, deleteLesson } from '../api/lessons';
import { createClass, reorderLessons } from '../api/classes';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { SortTh } from '../components/ui/SortTh';

function toProperCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|[-'])\S/g, c => c.toUpperCase());
}

const TYPE_COLORS = {
  science: 'bg-blue-100 text-blue-800', engineering: 'bg-orange-100 text-orange-800',
  robotics: 'bg-purple-100 text-purple-800', financial_literacy: 'bg-emerald-100 text-emerald-800',
};
const TYPE_LABELS = {
  science: 'Sci', engineering: 'Eng', robotics: 'Robo', financial_literacy: 'Fin',
};

const REVIEW_COLORS = {
  okay: 'bg-green-100 text-green-800',
  review: 'bg-amber-100 text-amber-800',
  overdue: 'bg-red-100 text-red-800',
};

export default function LessonsPage() {
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [reviewFilter, setReviewFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('class');
  const [dir, setDir] = useState('asc');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClassId, setNewClassId] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [showNewModule, setShowNewModule] = useState(false);
  const [newModuleName, setNewModuleName] = useState('');
  const [newModuleType, setNewModuleType] = useState('');
  const qc = useQueryClient();

  const toggleModule = (key) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const expandAll = () => setExpandedModules(new Set(Object.keys(grouped)));
  const collapseAll = () => setExpandedModules(new Set());

  const { data: classListData } = useQuery({
    queryKey: ['classes'],
    queryFn: () => fetch('http://localhost:3002/api/classes', { credentials: 'include' }).then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  });
  const classList = classListData?.data || [];

  const handleSort = (col) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('asc'); }
    setPage(1);
  };

  const filters = {
    search: search || undefined,
    class_id: classId || undefined,
    sort: sort || undefined,
    dir: sort ? dir : undefined,
    page,
    limit: 200,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['lessons-page', filters],
    queryFn: () => getLessonsPage(filters),
  });

  let lessons = data?.data || [];
  if (reviewFilter) {
    lessons = lessons.filter(l => l.review_status === reviewFilter);
  }
  const total = reviewFilter ? lessons.length : (data?.total || 0);

  const addMutation = useMutation({
    mutationFn: (d) => createLesson(d),
    onSuccess: () => {
      qc.invalidateQueries(['lessons-page']);
      qc.invalidateQueries(['lessons']);
      setNewName(''); setNewClassId(''); setShowAdd(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteLesson(id),
    onSuccess: () => { qc.invalidateQueries(['lessons-page']); qc.invalidateQueries(['lessons']); },
  });

  const createModuleMutation = useMutation({
    mutationFn: (data) => createClass(data),
    onSuccess: () => {
      qc.invalidateQueries(['classes']);
      qc.invalidateQueries(['lessons-page']);
      setNewModuleName(''); setNewModuleType(''); setShowNewModule(false);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: ({ classId, lessonIds }) => reorderLessons(classId, lessonIds),
    onSuccess: () => { qc.invalidateQueries(['lessons-page']); qc.invalidateQueries(['classes']); },
  });

  const moveLessonInModule = (group, lessonId, direction) => {
    const lessonIds = group.lessons.map(l => l.id);
    const idx = lessonIds.indexOf(lessonId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= lessonIds.length) return;
    [lessonIds[idx], lessonIds[newIdx]] = [lessonIds[newIdx], lessonIds[idx]];
    reorderMutation.mutate({ classId: group.class_id, lessonIds });
  };

  const copyBlurb = (l) => {
    if (l.class_description) {
      navigator.clipboard.writeText(l.class_description);
      setCopiedId(l.id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  const reset = () => { setSearch(''); setClassId(''); setReviewFilter(''); setPage(1); };
  const hasFilters = search || classId || reviewFilter;

  // Build per-lesson module list (a lesson can appear in multiple classes)
  const lessonModules = {};
  (data?.data || []).forEach(l => {
    if (!lessonModules[l.id]) lessonModules[l.id] = [];
    if (l.class_name && !lessonModules[l.id].find(m => m.class_name === l.class_name)) {
      lessonModules[l.id].push({ class_name: l.class_name, program_type_name: l.program_type_name });
    }
  });

  // Group by class
  const grouped = {};
  lessons.forEach(l => {
    const key = l.class_name || 'No Class';
    if (!grouped[key]) grouped[key] = { class_id: l.class_id, class_name: l.class_name, program_type_name: l.program_type_name, trainual_link: l.trainual_link, parent_portal_link: l.parent_portal_link, class_description: l.class_description, lessons: [] };
    // Avoid duplicate lesson in same group (can happen with multi-class)
    if (!grouped[key].lessons.find(x => x.id === l.id)) {
      grouped[key].lessons.push(l);
    }
  });

  return (
    <AppShell>
      <PageHeader title="Lessons" action={
        <div className="flex gap-2 items-center">
          {showAdd ? (
            <div className="flex gap-2 items-center">
              <input type="text" placeholder="Lesson name" value={newName} onChange={e => setNewName(e.target.value)}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]" autoFocus />
              <select value={newClassId} onChange={e => setNewClassId(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm appearance-none pr-8 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]">
                <option value="">Select class…</option>
                {classList.map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
              <Button onClick={() => newName && newClassId && addMutation.mutate({ lesson_name: newName, class_id: newClassId })} disabled={addMutation.isPending || !newName || !newClassId}>
                {addMutation.isPending ? '…' : 'Add'}
              </Button>
              <button onClick={() => setShowAdd(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : showNewModule ? (
            <div className="flex gap-2 items-center">
              <input type="text" placeholder="Module name" value={newModuleName} onChange={e => setNewModuleName(e.target.value)}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]" autoFocus />
              <select value={newModuleType} onChange={e => setNewModuleType(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm appearance-none pr-8 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]">
                <option value="">Type…</option>
                <option value="1">Class</option>
                <option value="2">Camp</option>
                <option value="5">Robotics</option>
                <option value="6">Financial Literacy</option>
              </select>
              <Button onClick={() => newModuleName && createModuleMutation.mutate({ class_name: newModuleName, program_type_id: newModuleType || 1 })}
                disabled={createModuleMutation.isPending || !newModuleName}>
                {createModuleMutation.isPending ? '…' : 'Create'}
              </Button>
              <button onClick={() => setShowNewModule(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowNewModule(true)}>+ New Module</Button>
              <Button onClick={() => setShowAdd(true)}>+ New Lesson</Button>
            </div>
          )}
        </div>
      }>
        <Input placeholder="Search lessons or modules…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-56" />
        <Select value={classId} onChange={e => { setClassId(e.target.value); setPage(1); }} className="w-52">
          <option value="">All Modules</option>
          {classList.map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
        </Select>
        <Select value={reviewFilter} onChange={e => { setReviewFilter(e.target.value); setPage(1); }} className="w-36">
          <option value="">All Statuses</option>
          <option value="okay">Up to Date</option>
          <option value="review">Review</option>
          <option value="overdue">Overdue</option>
        </Select>
        {hasFilters && <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700 underline">Clear</button>}
      </PageHeader>

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-12 text-gray-400">No lessons found</div>
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <button type="button" onClick={expandAll} className="text-xs text-gray-400 hover:text-[#1e3a5f]">Expand all</button>
              <button type="button" onClick={collapseAll} className="text-xs text-gray-400 hover:text-[#1e3a5f]">Collapse all</button>
            </div>
            {Object.entries(grouped).map(([className, group]) => {
              const isExpanded = expandedModules.has(className);
              return (
              <div key={className} className="mb-3">
                <div className={`border border-gray-200 ${isExpanded ? 'rounded-t-lg' : 'rounded-lg'} bg-gray-50 px-4 py-3 cursor-pointer`} onClick={() => toggleModule(className)}>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-4">{isExpanded ? '▾' : '▸'}</span>
                    <Link to={`/modules/${group.class_id}`} onClick={e => e.stopPropagation()} className="text-sm font-semibold text-gray-800 hover:text-[#1e3a5f] hover:underline">{className}</Link>
                    {group.program_type_name && <Badge status={group.program_type_name} />}
                    <span className="text-xs text-gray-400">{group.lessons.length} lesson{group.lessons.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1" onClick={e => e.stopPropagation()}>
                    {group.trainual_link && (
                      <span className="flex items-center gap-1">
                        <a href={group.trainual_link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1e3a5f] hover:underline">Trainual</a>
                        <button type="button" onClick={() => { navigator.clipboard.writeText(group.trainual_link); setCopiedId('t-' + group.class_id); setTimeout(() => setCopiedId(null), 1500); }}
                          className="text-xs text-gray-400 hover:text-[#1e3a5f]">{copiedId === 't-' + group.class_id ? '(copied)' : '(copy)'}</button>
                      </span>
                    )}
                    {group.parent_portal_link && (
                      <span className="flex items-center gap-1">
                        <a href={group.parent_portal_link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1e3a5f] hover:underline">Parent Portal</a>
                        <button type="button" onClick={() => { navigator.clipboard.writeText(group.parent_portal_link); setCopiedId('p-' + group.class_id); setTimeout(() => setCopiedId(null), 1500); }}
                          className="text-xs text-gray-400 hover:text-[#1e3a5f]">{copiedId === 'p-' + group.class_id ? '(copied)' : '(copy)'}</button>
                      </span>
                    )}
                    <Link to={`/modules/${group.class_id}`} className="text-xs text-gray-400 hover:text-[#1e3a5f]">Edit Module</Link>
                  </div>
                  {isExpanded && group.class_description && (
                    <div className="flex items-start gap-2 mt-2 px-3 py-2 bg-white rounded text-xs text-gray-600 border border-gray-100" onClick={e => e.stopPropagation()}>
                      <p className="flex-1 leading-relaxed">{group.class_description}</p>
                      <button type="button" onClick={() => copyBlurb(group.lessons[0])} className="text-[#1e3a5f] hover:underline flex-shrink-0 text-xs font-medium">
                        {copiedId === group.lessons[0]?.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
                {isExpanded && <div className="bg-white border border-t-0 border-gray-200 rounded-b-lg overflow-hidden">
                  <table className="w-full text-sm" style={{tableLayout: 'fixed'}}>
                    <colgroup>
                      <col className="w-12" />
                      <col />
                      <col className="w-16" />
                      <col className="w-20" />
                      <col className="w-28" />
                      <col className="w-20" />
                      <col className="w-16" />
                      <col className="w-14" />
                    </colgroup>
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="w-12"></th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Lesson</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">Type</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Status</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600 w-28">Next Review</th>
                        <th className="text-center px-2 py-2 font-medium text-gray-600 w-20" title="Trainual Link">Trainual</th>
                        <th className="text-center px-2 py-2 font-medium text-gray-600 w-16" title="Parent Portal Link">Portal</th>
                        <th className="w-14"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {group.lessons.map((l, i) => {
                        const tLink = l.lesson_trainual_link || group.trainual_link;
                        const pLink = l.parent_portal_link || group.parent_portal_link;
                        return (
                          <tr key={l.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-1 py-1 text-center">
                              <div className="flex flex-col items-center">
                                <button type="button" onClick={() => moveLessonInModule(group, l.id, -1)}
                                  disabled={i === 0} title="Move up"
                                  className={`text-lg leading-none ${i === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-[#1e3a5f]'}`}>▲</button>
                                <button type="button" onClick={() => moveLessonInModule(group, l.id, 1)}
                                  disabled={i === group.lessons.length - 1} title="Move down"
                                  className={`text-lg leading-none ${i === group.lessons.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-[#1e3a5f]'}`}>▼</button>
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <Link to={`/lessons/${l.id}`} className="font-medium text-[#1e3a5f] hover:underline">{toProperCase(l.lesson_name)}</Link>
                              {l.lesson_description && (
                                <div className="flex items-center gap-1 mt-0.5 max-w-full overflow-hidden">
                                  <p className="text-xs text-gray-400 truncate min-w-0">{l.lesson_description}</p>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(l.lesson_description); setCopiedId('d-'+l.id); setTimeout(() => setCopiedId(null), 1200); }}
                                    className={`text-xs flex-shrink-0 ${copiedId === 'd-'+l.id ? 'text-green-600' : 'text-gray-300 hover:text-[#1e3a5f]'}`}>
                                    {copiedId === 'd-'+l.id ? 'copied' : 'copy'}
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {l.lesson_type && (
                                <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded ${TYPE_COLORS[l.lesson_type] || 'bg-gray-100 text-gray-600'}`} title={l.lesson_type}>
                                  {TYPE_LABELS[l.lesson_type] || l.lesson_type}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {l.review_status && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${REVIEW_COLORS[l.review_status] || 'bg-gray-100 text-gray-600'}`}>
                                  {l.review_status === 'okay' ? 'OK' : l.review_status === 'review' ? 'Review' : 'Overdue'}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {l.next_update_required ? new Date(l.next_update_required).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {tLink ? (
                                <button type="button" onClick={() => { navigator.clipboard.writeText(tLink); setCopiedId('tl-'+l.id); setTimeout(() => setCopiedId(null), 1200); }}
                                  className={`text-xs ${copiedId === 'tl-'+l.id ? 'text-green-600 font-medium' : 'text-gray-400 hover:text-[#1e3a5f]'}`} title="Copy Trainual link">
                                  {copiedId === 'tl-'+l.id ? 'copied' : 'copy'}
                                </button>
                              ) : <span className="text-xs text-gray-200">—</span>}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {pLink ? (
                                <button type="button" onClick={() => { navigator.clipboard.writeText(pLink); setCopiedId('pl-'+l.id); setTimeout(() => setCopiedId(null), 1200); }}
                                  className={`text-xs ${copiedId === 'pl-'+l.id ? 'text-green-600 font-medium' : 'text-gray-400 hover:text-[#1e3a5f]'}`} title="Copy Parent Portal link">
                                  {copiedId === 'pl-'+l.id ? 'copied' : 'copy'}
                                </button>
                              ) : <span className="text-xs text-gray-200">—</span>}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <button onClick={() => { if (window.confirm(`Delete "${toProperCase(l.lesson_name)}"?`)) deleteMutation.mutate(l.id); }}
                                className="text-xs text-red-400 hover:text-red-600">Delete</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>}
              </div>
            );})}
            <div className="mt-3 text-sm text-gray-500">
              {total} lesson{total !== 1 ? 's' : ''} across {Object.keys(grouped).length} modules
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
