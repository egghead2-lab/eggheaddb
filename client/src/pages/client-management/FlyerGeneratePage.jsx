import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import {
  listFlyerTemplates, getFlyerTemplate, getProgramFlyerData, renderFlyer, downloadBlob,
  markFlyerMade,
} from '../../api/flyers';

export default function FlyerGeneratePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const programIdParam = searchParams.get('program_id');
  const templateIdParam = searchParams.get('template_id');

  const [programId, setProgramId] = useState(programIdParam || '');
  const [templateId, setTemplateId] = useState(templateIdParam || '');
  const qc = useQueryClient();
  const [data, setData] = useState({});
  const [previewSrc, setPreviewSrc] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const debounceRef = useRef(null);

  const markMadeMut = useMutation({
    mutationFn: () => markFlyerMade(programId, templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flyer-programs'] });
      qc.invalidateQueries({ queryKey: ['flyer-program-data', programId] });
    },
    onError: (e) => alert(e?.response?.data?.error || 'Mark as Created failed'),
  });

  // Templates dropdown
  const { data: tplsData } = useQuery({
    queryKey: ['flyer-templates'],
    queryFn: () => listFlyerTemplates(),
  });
  const templates = tplsData?.data || [];

  // Selected template's fields (so we know what inputs to render)
  const { data: tplDetailData } = useQuery({
    queryKey: ['flyer-template', templateId],
    queryFn: () => getFlyerTemplate(templateId),
    enabled: !!templateId,
  });
  const template = tplDetailData?.data;
  const fields = template?.fields || [];

  // Program search (lightweight — programs flagged as needing flyers)
  const [programSearch, setProgramSearch] = useState('');
  const { data: progSearchData } = useQuery({
    queryKey: ['flyer-prog-search', programSearch],
    queryFn: () => api.get('/programs', { params: { search: programSearch || undefined, limit: 25 } }).then(r => r.data),
    enabled: programSearch.length >= 2,
  });
  const programOptions = progSearchData?.data || [];

  // Auto-populate from program
  const { data: progDataResp } = useQuery({
    queryKey: ['flyer-program-data', programId],
    queryFn: () => getProgramFlyerData(programId),
    enabled: !!programId,
  });
  const programData = progDataResp?.data;
  const flyerInstructions = programData?.flyer_instructions;

  useEffect(() => {
    if (programData?.data) setData(programData.data);
  }, [programData]);

  // Debounced preview render. Convert base64 → Blob URL (more reliable in
  // iframes than data: URLs on Chrome/Firefox).
  useEffect(() => {
    if (!templateId) { setPreviewSrc(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    let revoke = null;
    debounceRef.current = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const resp = await renderFlyer({
          template_id: parseInt(templateId),
          program_id: programId ? parseInt(programId) : undefined,
          data,
          mode: 'preview',
        });
        const bytes = Uint8Array.from(atob(resp.pdf_base64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPreviewSrc(prev => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return url; });
        revoke = url;
      } catch (e) {
        console.error('Preview render failed:', e?.response?.data || e);
        alert(e?.response?.data?.error || e?.message || 'Preview failed');
      } finally {
        setLoadingPreview(false);
      }
    }, 500);
    return () => { clearTimeout(debounceRef.current); };
  }, [templateId, programId, data]);

  // Cleanup blob URL on unmount
  useEffect(() => () => { if (previewSrc?.startsWith('blob:')) URL.revokeObjectURL(previewSrc); }, []);

  async function handleDownload() {
    if (!templateId) return;
    setDownloading(true);
    try {
      const blob = await renderFlyer({
        template_id: parseInt(templateId),
        program_id: programId ? parseInt(programId) : undefined,
        data,
        mode: 'download',
      });
      const safeName = (data.location_name || 'flyer').replace(/[^\w\-]+/g, '_');
      downloadBlob(blob, `${safeName}.pdf`);
      setHasDownloaded(true);
    } catch (e) {
      alert(e?.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  const isAlreadyMade = !!programData?.program?.flyer_made;

  return (
    <AppShell>
      <PageHeader title="Generate Flyer"
        action={<Link to="/client-management/flyers" className="text-xs text-gray-500 hover:underline">← Back to flyers</Link>}
      />
      <div className="flex" style={{ height: 'calc(100vh - 110px)' }}>
        {/* Left form */}
        <div className="w-96 bg-white border-r border-gray-200 overflow-auto p-4 space-y-3">
          {/* Template + Program pickers */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Template *</label>
            <select value={templateId} onChange={e => { setTemplateId(e.target.value); setSearchParams(prev => { const p = new URLSearchParams(prev); if (e.target.value) p.set('template_id', e.target.value); else p.delete('template_id'); return p; }); }}
              className="block w-full rounded border border-gray-300 text-sm px-2 py-1.5">
              <option value="">Select a template…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.season ? ` (${t.season})` : ''}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Program</label>
            {programData?.program ? (
              <div className="bg-blue-50 rounded px-2 py-1.5 text-xs flex items-center justify-between">
                <span className="font-medium">{programData.program.program_nickname}</span>
                <button onClick={() => { setProgramId(''); setProgramSearch(''); setData({}); }}
                  className="text-gray-400 hover:text-red-500">×</button>
              </div>
            ) : (
              <>
                <Input placeholder="Search programs (2+ chars)…" value={programSearch}
                  onChange={e => setProgramSearch(e.target.value)} />
                {programOptions.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded mt-1 max-h-40 overflow-auto">
                    {programOptions.map(p => (
                      <button key={p.id} onClick={() => { setProgramId(String(p.id)); setProgramSearch(''); }}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50">
                        <div className="font-medium">{p.program_nickname}</div>
                        <div className="text-gray-400">{p.location_nickname || '—'}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {flyerInstructions && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2">
              <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-0.5">Flyer Instructions</div>
              <div className="text-xs text-amber-900 whitespace-pre-wrap">{flyerInstructions}</div>
            </div>
          )}

          {!template ? (
            <p className="text-xs text-gray-400 italic">Pick a template to see merge fields…</p>
          ) : fields.length === 0 ? (
            <p className="text-xs text-amber-600">This template has no fields. <Link to={`/client-management/flyers/templates/${templateId}/edit`} className="underline">Edit fields →</Link></p>
          ) : (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Merge data</div>
              {fields.map(f => (
                <div key={f.id || f.field_key}>
                  <label className="text-[10px] font-medium text-gray-500 block mb-0.5">
                    {f.field_label}
                    {f.is_optional ? <span className="ml-1 text-gray-300">(optional)</span> : null}
                  </label>
                  {f.field_type === 'qr_code' ? (
                    <Input value={data[f.field_key] || ''} placeholder="URL the QR code links to"
                      onChange={e => setData(d => ({ ...d, [f.field_key]: e.target.value }))} />
                  ) : (
                    <Input value={data[f.field_key] || ''}
                      onChange={e => setData(d => ({ ...d, [f.field_key]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-gray-200 space-y-2">
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" type="button" disabled={!templateId || downloading} onClick={handleDownload}>
                {downloading ? 'Building…' : 'Download PDF'}
              </Button>
            </div>
            {programId ? (
              <div className="bg-gray-50 rounded p-2 space-y-1.5">
                <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Status</div>
                {isAlreadyMade ? (
                  <div className="text-xs text-green-700 flex items-center gap-1">
                    ✓ Marked as Created on {new Date(programData.program.flyer_made).toLocaleDateString()}
                  </div>
                ) : hasDownloaded ? (
                  <Button size="sm" type="button"
                    disabled={!templateId || markMadeMut.isPending}
                    onClick={() => markMadeMut.mutate()}>
                    {markMadeMut.isPending ? 'Marking…' : 'Mark as Created →'}
                  </Button>
                ) : (
                  <div className="text-[11px] text-gray-500 italic">Download first, then mark as Created.</div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right preview */}
        <div className="flex-1 bg-gray-100 flex items-center justify-center overflow-auto p-4">
          {!templateId ? (
            <p className="text-sm text-gray-400">Select a template to preview.</p>
          ) : loadingPreview && !previewSrc ? (
            <Spinner />
          ) : previewSrc ? (
            <div className="relative w-full h-full">
              <iframe title="Flyer preview" src={previewSrc}
                className="bg-white shadow border border-gray-200"
                style={{ width: '100%', height: '100%', minHeight: 800 }} />
              {loadingPreview && (
                <div className="absolute top-2 right-2 bg-white shadow rounded px-2 py-1 text-[10px] text-gray-500">
                  Updating preview…
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No preview yet.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
