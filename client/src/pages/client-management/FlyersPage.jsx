import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { formatDate } from '../../lib/utils';
import {
  listFlyerTemplates, createFlyerTemplate, archiveFlyerTemplate, updateFlyerTemplate,
  listProgramsNeedingFlyers,
} from '../../api/flyers';

const TABS = [
  { key: 'templates', label: 'Templates' },
  { key: 'programs', label: 'Programs Needing Flyers' },
];

export default function FlyersPage() {
  const [activeTab, setActiveTab] = useState('templates');

  return (
    <AppShell>
      <PageHeader title="Flyer Builder" />
      <div className="px-6 pt-3 flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
              activeTab === t.key ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'programs' && <ProgramsTab />}
      </div>
    </AppShell>
  );
}

// ── Templates Tab ─────────────────────────────────────────────────────
function TemplatesTab() {
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadSeason, setUploadSeason] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const fileRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['flyer-templates', includeArchived],
    queryFn: () => listFlyerTemplates(includeArchived ? { include_archived: 1 } : {}),
  });
  const templates = data?.data || [];

  const createMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('pdf', uploadFile);
      fd.append('name', uploadName);
      if (uploadSeason) fd.append('season', uploadSeason);
      if (uploadDescription) fd.append('description', uploadDescription);
      return createFlyerTemplate(fd);
    },
    onSuccess: () => {
      setShowUpload(false); setUploadName(''); setUploadSeason(''); setUploadDescription(''); setUploadFile(null);
      qc.invalidateQueries(['flyer-templates']);
    },
    onError: (e) => alert(e?.response?.data?.error || 'Upload failed'),
  });

  const archiveMut = useMutation({
    mutationFn: archiveFlyerTemplate,
    onSuccess: () => qc.invalidateQueries(['flyer-templates']),
  });

  const renameMut = useMutation({
    mutationFn: ({ id, body }) => updateFlyerTemplate(id, body),
    onSuccess: () => qc.invalidateQueries(['flyer-templates']),
  });
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  function startRename(t) { setRenamingId(t.id); setRenameValue(t.name); }
  function commitRename() {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    renameMut.mutate({ id: renamingId, body: { name: renameValue.trim() } });
    setRenamingId(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Templates ({templates.length})</h2>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} />
            Show archived
          </label>
        </div>
        <Button size="sm" type="button" onClick={() => setShowUpload(true)}>+ Upload PDF Template</Button>
      </div>

      {showUpload && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">New Flyer Template</span>
            <button onClick={() => setShowUpload(false)} className="text-xs text-gray-400">Cancel</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Name *" value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="e.g. Spring 2026 Standard" />
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Season</label>
              <select value={uploadSeason} onChange={e => setUploadSeason(e.target.value)}
                className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5">
                <option value="">—</option>
                <option value="Fall">Fall</option>
                <option value="Winter">Winter</option>
                <option value="Spring">Spring</option>
                <option value="Summer">Summer</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">PDF File *</label>
              <input ref={fileRef} type="file" accept="application/pdf"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="block w-full text-xs" />
            </div>
            <div className="col-span-3">
              <label className="text-xs font-medium text-gray-700 block mb-1">Description (optional)</label>
              <textarea value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} rows={2}
                className="block w-full rounded border border-gray-300 text-sm px-3 py-1.5" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" type="button"
              disabled={!uploadName || !uploadFile || createMut.isPending}
              onClick={() => createMut.mutate()}>
              {createMut.isPending ? 'Uploading…' : 'Upload Template'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Season</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Pages</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Fields</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Created By</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Updated</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">No templates yet — upload your first PDF.</td></tr>
              )}
              {templates.map(t => (
                <tr key={t.id} className={t.is_archived ? 'bg-gray-50/50 text-gray-400' : ''}>
                  <td className="px-3 py-2 font-medium">
                    {renamingId === t.id ? (
                      <input autoFocus type="text" value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="rounded border border-[#1e3a5f] px-2 py-0.5 text-sm w-full" />
                    ) : (
                      <span onClick={() => startRename(t)} className="cursor-text hover:underline" title="Click to rename">
                        {t.name}
                      </span>
                    )}
                    {t.is_archived ? <span className="ml-2 text-[10px] text-gray-400 uppercase">archived</span> : null}
                    {t.description ? <div className="text-xs text-gray-500">{t.description}</div> : null}
                  </td>
                  <td className="px-3 py-2">{t.season || '—'}</td>
                  <td className="px-3 py-2 text-center">{t.page_count}</td>
                  <td className="px-3 py-2 text-center">{t.field_count}</td>
                  <td className="px-3 py-2 text-gray-500">{t.created_by_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{formatDate(t.ts_updated)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link to={`/client-management/flyers/templates/${t.id}/edit`}
                      className="text-xs text-[#1e3a5f] hover:underline mr-3">Edit fields</Link>
                    {!t.is_archived ? (
                      <button type="button"
                        onClick={() => { if (confirm(`Archive "${t.name}"?`)) archiveMut.mutate(t.id); }}
                        className="text-xs text-gray-400 hover:text-red-500">Archive</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Programs Tab ──────────────────────────────────────────────────────
function ProgramsTab() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('needed');

  const { data, isLoading } = useQuery({
    queryKey: ['flyer-programs', status, search],
    queryFn: () => listProgramsNeedingFlyers({ status, search: search || undefined }),
  });
  const programs = data?.data || [];

  const { data: tplData } = useQuery({
    queryKey: ['flyer-templates'],
    queryFn: () => listFlyerTemplates(),
  });
  const templates = tplData?.data || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Input placeholder="Search programs…" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="rounded border border-gray-300 text-sm px-2 py-1.5">
          <option value="">All flyer-required</option>
          <option value="needed">Needed (no flyer made)</option>
          <option value="made">Made, not yet sent</option>
          <option value="sent">Sent electronically</option>
        </select>
        <span className="text-xs text-gray-500 ml-auto">{programs.length} program{programs.length === 1 ? '' : 's'}</span>
      </div>

      {templates.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700 mb-3">
          No flyer templates yet. <span className="font-medium">Upload one</span> on the Templates tab before generating flyers.
        </div>
      )}

      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Start</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Cost</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Made</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">Sent</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {programs.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">No programs match.</td></tr>
              )}
              {programs.map(p => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <Link to={`/programs/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
                    {p.flyer_instructions ? (
                      <div className="text-[10px] text-amber-700 bg-amber-50 inline-block px-1.5 py-0.5 rounded mt-0.5 font-medium">
                        ⚠ Flyer instructions
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    <Link to={`/locations/${p.location_id}`} className="text-[#1e3a5f] hover:underline">{p.location_nickname || p.school_name || '—'}</Link>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{p.first_session_date ? formatDate(p.first_session_date) : '—'}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{p.parent_cost ? `$${parseFloat(p.parent_cost).toFixed(0)}` : '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {p.flyer_made
                      ? <span className="text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded">{formatDate(p.flyer_made)}</span>
                      : <span className="text-[10px] text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {p.flyer_sent_electronic
                      ? <span className="text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded">{formatDate(p.flyer_sent_electronic)}</span>
                      : <span className="text-[10px] text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link to={`/client-management/flyers/generate?program_id=${p.id}`}
                      className="text-xs text-[#1e3a5f] hover:underline font-medium">Generate →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
