import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { formatDate } from '../../lib/utils';
import api from '../../api/client';
import {
  listFlyerTemplates, createFlyerTemplate, archiveFlyerTemplate, updateFlyerTemplate,
  listProgramsNeedingFlyers, unmakeFlyerProgram, unsendFlyerProgram, markFlyerSent,
  sendFlyerEmail, renderFlyer,
} from '../../api/flyers';

const TABS = [
  { key: 'templates', label: 'Templates' },
  { key: 'programs', label: 'Programs Needing Flyers' },
  { key: 'send', label: 'Send Flyers' },
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
        {activeTab === 'send' && <SendFlyersTab />}
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
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('needed');

  const { data, isLoading } = useQuery({
    queryKey: ['flyer-programs', status, search],
    queryFn: () => listProgramsNeedingFlyers({ status, search: search || undefined }),
  });
  const programs = data?.data || [];

  const unmakeMut = useMutation({
    mutationFn: unmakeFlyerProgram,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flyer-programs'] }),
    onError: (e) => alert(e?.response?.data?.error || 'Unmake failed'),
  });

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
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {p.flyer_made ? (
                      <button type="button"
                        onClick={() => { if (confirm('Unmake this flyer? It will return to the "Needed" list.')) unmakeMut.mutate(p.id); }}
                        className="text-xs text-amber-600 hover:underline mr-2">Unmake</button>
                    ) : null}
                    <Link to={`/client-management/flyers/generate?program_id=${p.id}`}
                      className="text-xs text-[#1e3a5f] hover:underline font-medium">
                      {p.flyer_made ? 'Re-generate' : 'Generate'} →
                    </Link>
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

// ── Send Flyers Tab ───────────────────────────────────────────────────
function SendFlyersTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(null);
  const [showSent, setShowSent] = useState(false);

  const { data: needsSendData, isLoading } = useQuery({
    queryKey: ['flyer-programs', 'made', search],
    queryFn: () => listProgramsNeedingFlyers({ status: 'made', search: search || undefined }),
  });
  const needsSend = needsSendData?.data || [];

  const { data: sentData } = useQuery({
    queryKey: ['flyer-programs', 'sent', search],
    queryFn: () => listProgramsNeedingFlyers({ status: 'sent', search: search || undefined }),
    enabled: showSent,
  });
  const sent = sentData?.data || [];

  const unmakeMut = useMutation({
    mutationFn: unmakeFlyerProgram,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flyer-programs'] }),
    onError: (e) => alert(e?.response?.data?.error || 'Unmake failed'),
  });
  const unsendMut = useMutation({
    mutationFn: unsendFlyerProgram,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flyer-programs'] }),
    onError: (e) => alert(e?.response?.data?.error || 'Unsend failed'),
  });
  const markSentMut = useMutation({
    mutationFn: markFlyerSent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flyer-programs'] }),
    onError: (e) => alert(e?.response?.data?.error || 'Mark Sent failed'),
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Input placeholder="Search programs…" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
        <span className="text-xs text-gray-500 ml-auto">{needsSend.length} ready to send</span>
      </div>

      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Location / Contact</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Made</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Template</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {needsSend.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">Nothing ready to send. Mark a flyer as Created first.</td></tr>
              )}
              {needsSend.map(p => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <Link to={`/programs/${p.id}`} className="font-medium text-[#1e3a5f] hover:underline">{p.program_nickname}</Link>
                    {p.flyer_instructions ? (
                      <div className="text-[10px] text-amber-700 bg-amber-50 inline-block px-1.5 py-0.5 rounded mt-0.5 font-medium">⚠ Has flyer instructions</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    <Link to={`/locations/${p.location_id}`} className="text-[#1e3a5f] hover:underline">{p.location_nickname || p.school_name || '—'}</Link>
                    <div className="text-[11px] text-gray-500">{p.point_of_contact || '—'} · {p.poc_email || <span className="text-red-500">no email</span>}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-[11px]">{formatDate(p.flyer_made)}</td>
                  <td className="px-3 py-2 text-gray-500 text-[11px]">{p.flyer_template_name || <span className="text-amber-600">none</span>}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button type="button"
                      onClick={() => setComposing(p)}
                      disabled={!p.poc_email || !p.flyer_template_id}
                      className="text-xs text-[#1e3a5f] hover:underline font-medium disabled:text-gray-300 disabled:no-underline mr-3">
                      Send Email
                    </button>
                    <button type="button"
                      onClick={() => { if (confirm('Mark this flyer as sent (manual — no email will be sent)?')) markSentMut.mutate(p.id); }}
                      className="text-xs text-gray-500 hover:underline mr-3">Mark Sent</button>
                    <button type="button"
                      onClick={() => { if (confirm('Unmake this flyer? It returns to the Needed list.')) unmakeMut.mutate(p.id); }}
                      className="text-xs text-amber-600 hover:underline">Unmake</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg bg-white">
        <button type="button" onClick={() => setShowSent(v => !v)}
          className="w-full px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hover:bg-gray-50 flex items-center justify-between">
          <span>Sent ({sent.length || 0})</span>
          <span>{showSent ? '▾' : '▸'}</span>
        </button>
        {showSent ? (
          <table className="w-full text-sm border-t border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Program</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Sent</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sent.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-400">No sent flyers yet.</td></tr>
              )}
              {sent.map(p => (
                <tr key={p.id}>
                  <td className="px-3 py-2"><Link to={`/programs/${p.id}`} className="text-[#1e3a5f] hover:underline">{p.program_nickname}</Link></td>
                  <td className="px-3 py-2 text-gray-600">{p.location_nickname || p.school_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-[11px]">{formatDate(p.flyer_sent_electronic)}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button"
                      onClick={() => { if (confirm('Unsend this flyer? It returns to ready-to-send.')) unsendMut.mutate(p.id); }}
                      className="text-xs text-amber-600 hover:underline">Unsend</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {composing ? <SendFlyerComposer program={composing} onClose={() => setComposing(null)} /> : null}
    </div>
  );
}

function SendFlyerComposer({ program, onClose }) {
  const qc = useQueryClient();

  const { data: tplData } = useQuery({
    queryKey: ['client-templates', 'send_flyer'],
    queryFn: () => api.get('/client-management/templates', { params: { category: 'send_flyer' } }).then(r => r.data),
  });
  const templates = tplData?.data || [];

  const [to, setTo] = useState(program.poc_email || '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedTpl, setSelectedTpl] = useState('');
  const [bodyMode, setBodyMode] = useState('edit'); // 'edit' | 'preview'
  const [pdfPreview, setPdfPreview] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Render the attached flyer once when modal opens (for preview)
  useEffect(() => {
    let revoked = false;
    setPdfLoading(true);
    renderFlyer({ template_id: program.flyer_template_id, program_id: program.id, mode: 'preview' })
      .then(resp => {
        if (revoked) return;
        const bytes = Uint8Array.from(atob(resp.pdf_base64), c => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        setPdfPreview(url);
      })
      .catch(e => console.error('Flyer preview failed:', e?.response?.data || e))
      .finally(() => setPdfLoading(false));
    return () => { revoked = true; if (pdfPreview?.startsWith('blob:')) URL.revokeObjectURL(pdfPreview); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.id]);

  const fillVars = (text) => {
    if (!text) return '';
    const vars = {
      '{{contact_name}}': program.point_of_contact || 'there',
      '{{school_name}}': program.school_name || program.location_nickname || '',
      '{{class_name}}': program.class_name || program.program_nickname || '',
      '{{program_nickname}}': program.program_nickname || '',
      '{{start_date}}': program.first_session_date ? formatDate(program.first_session_date) : '',
      '{{registration_link}}': program.registration_link_for_flyer || '',
      '{{class_cost}}': program.parent_cost ? `$${parseFloat(program.parent_cost).toFixed(0)}` : '',
    };
    let out = text;
    for (const [k, v] of Object.entries(vars)) out = out.split(k).join(v);
    return out;
  };

  function applyTemplate(id) {
    setSelectedTpl(id);
    const t = templates.find(x => String(x.id) === String(id));
    if (t) {
      setSubject(fillVars(t.subject || ''));
      setBody(fillVars(t.body_html || ''));
    }
  }

  const sendMut = useMutation({
    mutationFn: () => sendFlyerEmail(program.id, {
      to, cc: cc || undefined, bcc: bcc || undefined,
      subject, body_html: body, template_id: selectedTpl || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flyer-programs'] });
      onClose();
    },
    onError: (e) => alert(e?.response?.data?.error || 'Send failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Send Flyer Email</h3>
            <p className="text-xs text-gray-500">{program.program_nickname} · {program.location_nickname || program.school_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider block mb-1">Template</label>
            <select value={selectedTpl} onChange={e => applyTemplate(e.target.value)}
              className="block w-full rounded border border-gray-300 text-sm px-2 py-1.5">
              <option value="">— Pick a Send Flyer template —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {templates.length === 0 ? (
              <p className="text-[11px] text-amber-600 mt-1">
                No "Send Flyer" templates yet. <Link to="/client-management/templates" className="underline">Create one →</Link>
              </p>
            ) : null}
          </div>
          <Input label="To *" value={to} onChange={e => setTo(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="CC" value={cc} onChange={e => setCc(e.target.value)} />
            <Input label="BCC" value={bcc} onChange={e => setBcc(e.target.value)} />
          </div>
          <Input label="Subject *" value={subject} onChange={e => setSubject(e.target.value)} />
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Body</label>
              <div className="flex rounded border border-gray-300 overflow-hidden text-[10px]">
                <button type="button" onClick={() => setBodyMode('edit')}
                  className={`px-2 py-0.5 ${bodyMode === 'edit' ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Edit</button>
                <button type="button" onClick={() => setBodyMode('preview')}
                  className={`px-2 py-0.5 ${bodyMode === 'preview' ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Preview</button>
              </div>
            </div>
            {bodyMode === 'edit' ? (
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
                className="block w-full rounded border border-gray-300 text-sm px-2 py-1.5 font-mono" />
            ) : (
              <div className="rounded border border-gray-300 bg-white px-3 py-2 min-h-[240px] text-sm prose prose-sm max-w-none"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: body || '<p class="text-gray-400">— empty —</p>' }} />
            )}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[11px] text-blue-800 flex items-center justify-between">
            <span>📎 Flyer PDF auto-attached on send (fresh render).</span>
            {pdfPreview ? (
              <a href={pdfPreview} target="_blank" rel="noreferrer" className="font-medium underline">Preview attachment ↗</a>
            ) : pdfLoading ? (
              <span className="text-gray-500">Building preview…</span>
            ) : null}
          </div>
        </div>
        <div className="p-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-xs text-gray-500 hover:underline">Cancel</button>
          <Button size="sm" type="button"
            disabled={!to || !subject || !body || sendMut.isPending}
            onClick={() => sendMut.mutate()}>
            {sendMut.isPending ? 'Sending…' : 'Send Email'}
          </Button>
        </div>
      </div>
    </div>
  );
}
