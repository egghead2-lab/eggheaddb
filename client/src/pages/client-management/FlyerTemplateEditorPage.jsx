import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import {
  getFlyerTemplate, replaceFlyerTemplateFields, flyerTemplatePdfUrl,
  getFlyerFieldsCatalog, renderFlyer,
} from '../../api/flyers';
import { canvasToPdf, pdfToCanvas } from '../../lib/pdfCoords';

// Sample data used for live preview while building the template
const SAMPLE_DATA = {
  location_name: 'Sample Elementary School',
  class_name: 'Mad Science',
  class_dates: 'Jan 14, Jan 21, Jan 28, Feb 4, Feb 11, Feb 18, Feb 25, Mar 4, Mar 11, Mar 18',
  class_day: 'Tuesdays',
  class_time: '2:30 - 3:30 PM',
  class_day_and_time: 'Tuesdays, 2:30 - 3:30 PM',
  class_cost: '$275',
  lab_fee: '$25',
  grade_range: 'K - 5th',
  session_count: '10 weeks',
  registration_link: 'profegghead.com/register/sample',
  qr_code: 'https://profegghead.com/register/sample',
  note: 'Enrollment closes Jan 5',
};

// Configure pdf.js worker (file copied to /public during install setup)
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const SCALE = 1.5;
const FONT_FAMILIES = [
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Helvetica-Bold', label: 'Helvetica Bold' },
  { value: 'TimesRoman', label: 'Times Roman' },
  { value: 'TimesRoman-Bold', label: 'Times Bold' },
  { value: 'Courier', label: 'Courier' },
  { value: 'BebasNeue', label: 'Bebas Neue' },
  { value: 'BebasNeue-Bold', label: 'Bebas Neue Bold' },
];

export default function FlyerTemplateEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pageNumber, setPageNumber] = useState(1);
  const [fields, setFields] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [pageDimensions, setPageDimensions] = useState({});
  const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'preview'
  const [previewSrc, setPreviewSrc] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const tempIdRef = useRef(0);

  const { data: tplData, isLoading } = useQuery({
    queryKey: ['flyer-template', id],
    queryFn: () => getFlyerTemplate(id),
    refetchOnWindowFocus: false, // don't clobber unsaved local edits when tabbing away
  });
  const template = tplData?.data;

  const { data: catData } = useQuery({
    queryKey: ['flyer-fields-catalog'],
    queryFn: () => getFlyerFieldsCatalog(),
  });
  const catalog = catData?.data || [];

  // When template loads, hydrate fields with a temp client-id for tracking
  useEffect(() => {
    if (template?.fields) {
      setFields(template.fields.map((f, i) => ({ ...f, _id: `existing-${f.id || i}` })));
    }
  }, [template]);

  const saveMut = useMutation({
    mutationFn: () => {
      const stripped = fields.map(({ _id, id: _origId, ...rest }) => rest);
      return replaceFlyerTemplateFields(id, stripped);
    },
    onSuccess: () => {
      setDirty(false);
      // Invalidate templates list so field counts refresh
      qc.invalidateQueries({ queryKey: ['flyer-templates'] });
    },
    onError: (e) => {
      console.error('Save failed:', e);
      alert(e?.response?.data?.error || 'Save failed — your changes are still in this editor');
    },
  });

  // Auto-save: 1.5s after the last edit
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => { saveMut.mutate(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, dirty]);

  // Beforeunload guard (in-app navigation can't be blocked here, but browser refresh/close is)
  useEffect(() => {
    const handler = (e) => {
      if (dirty || saveMut.isPending) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, saveMut.isPending]);

  // Live preview render — debounced, only when in preview mode
  useEffect(() => {
    if (viewMode !== 'preview') return;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        // Save first if dirty so the renderer reads our latest fields
        if (dirty && !saveMut.isPending) {
          await saveMut.mutateAsync();
        }
        const resp = await renderFlyer({
          template_id: parseInt(id),
          data: SAMPLE_DATA,
          mode: 'preview',
        });
        setPreviewSrc(`data:application/pdf;base64,${resp.pdf_base64}`);
      } catch (e) {
        console.error('Preview render failed:', e);
      } finally {
        setPreviewLoading(false);
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, fields, id]);

  const currentPageHeight = pageDimensions[pageNumber]?.height || template?.pdf_page_height || 792;

  const fieldsOnPage = fields.filter(f => (f.page_number || 1) === pageNumber);
  const usedKeys = new Set(fields.map(f => f.field_key));
  const unusedCatalog = catalog.filter(c => !usedKeys.has(c.key));

  function updateField(uid, patch) {
    setFields(prev => prev.map(f => f._id === uid ? { ...f, ...patch } : f));
    setDirty(true);
  }
  function deleteField(uid) {
    setFields(prev => prev.filter(f => f._id !== uid));
    if (selectedId === uid) setSelectedId(null);
    setDirty(true);
  }
  function addField(catalogItem) {
    const def = catalogItem.default || {};
    // Center the new box on the visible page (in PDF coords)
    const w = catalogItem.type === 'qr_code' ? 100 : 200;
    const h = catalogItem.type === 'qr_code' ? 100 : 40;
    const pageW = pageDimensions[pageNumber]?.width || template.pdf_page_width;
    const pageH = pageDimensions[pageNumber]?.height || template.pdf_page_height;
    tempIdRef.current += 1;
    const newField = {
      _id: `new-${Date.now()}-${tempIdRef.current}`,
      field_key: catalogItem.key,
      field_label: catalogItem.label,
      field_type: catalogItem.type,
      page_number: pageNumber,
      x: (pageW - w) / 2,
      y: (pageH - h) / 2,
      width: w,
      height: h,
      font_size: def.font_size ?? 12,
      font_family: 'Helvetica',
      font_color: '#000000',
      alignment: def.alignment || 'left',
      auto_shrink: def.auto_shrink ?? 1,
      is_optional: def.is_optional ? 1 : 0,
      display_order: fields.length,
    };
    setFields(prev => [...prev, newField]);
    setSelectedId(newField._id);
    setShowAddMenu(false);
    setDirty(true);
  }

  const selectedField = fields.find(f => f._id === selectedId);

  if (isLoading) return <AppShell><div className="p-6"><Spinner /></div></AppShell>;
  if (!template) return <AppShell><div className="p-6 text-sm text-gray-500">Template not found.</div></AppShell>;

  return (
    <AppShell>
      <PageHeader title={template.name} subtitle={`Visual flyer template editor • ${template.page_count} page${template.page_count > 1 ? 's' : ''}`}
        action={
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium ${
              saveMut.isError ? 'text-red-600' :
              saveMut.isPending ? 'text-amber-600' :
              dirty ? 'text-amber-600' :
              'text-green-600'
            }`}>
              {saveMut.isError ? '⚠ Save failed' :
               saveMut.isPending ? 'Saving…' :
               dirty ? 'Unsaved (auto-saving)' :
               '✓ Saved'}
            </span>
            <div className="flex rounded border border-gray-300 overflow-hidden">
              <button onClick={() => setViewMode('edit')}
                className={`px-3 py-1 text-xs font-medium ${viewMode === 'edit' ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                Edit
              </button>
              <button onClick={() => setViewMode('preview')}
                className={`px-3 py-1 text-xs font-medium ${viewMode === 'preview' ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                Preview
              </button>
            </div>
            <button onClick={() => navigate('/client-management/flyers')} className="text-xs text-gray-500 hover:underline">← Back to flyers</button>
          </div>
        }
      />

      <div className="flex" style={{ height: 'calc(100vh - 110px)' }}>
        {/* Left: PDF + overlay (or live preview) */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          {viewMode === 'preview' ? (
            <div className="relative w-full h-full flex items-start justify-center">
              {previewSrc ? (
                <iframe title="Flyer preview" src={previewSrc}
                  className="w-full bg-white shadow border border-gray-200"
                  style={{ minHeight: 800 }} />
              ) : (
                <div className="pt-20"><Spinner /></div>
              )}
              {previewLoading && previewSrc ? (
                <div className="absolute top-2 right-2 bg-white shadow rounded px-2 py-1 text-[10px] text-gray-500">
                  Updating…
                </div>
              ) : null}
              <div className="absolute bottom-2 left-2 text-[10px] text-gray-400 bg-white/80 rounded px-2 py-1">
                Preview uses sample data — actual flyers pull from each program.
              </div>
            </div>
          ) : (
          <>
          {template.page_count > 1 && (
            <div className="mb-2 flex items-center gap-2">
              {Array.from({ length: template.page_count }).map((_, i) => (
                <button key={i} onClick={() => setPageNumber(i + 1)}
                  className={`px-2 py-1 text-xs rounded ${pageNumber === i + 1 ? 'bg-[#1e3a5f] text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>
                  Page {i + 1}
                </button>
              ))}
            </div>
          )}
          <div className="relative inline-block bg-white shadow">
            <Document file={flyerTemplatePdfUrl(id)}
              onLoadError={(e) => console.error('PDF load error', e)}>
              <Page pageNumber={pageNumber} scale={SCALE}
                onLoadSuccess={(p) => {
                  // CRITICAL: use originalWidth/originalHeight (PDF native points),
                  // NOT width/height which are scaled CSS pixels. The renderer is
                  // in native points so coords must be too.
                  setPageDimensions(prev => ({
                    ...prev,
                    [pageNumber]: {
                      width: p.originalWidth || p.width / SCALE,
                      height: p.originalHeight || p.height / SCALE,
                    },
                  }));
                }}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
            {/* Overlay layer */}
            <div className="absolute inset-0">
              {fieldsOnPage.map(f => {
                const canvasBox = pdfToCanvas(
                  { x: parseFloat(f.x), y: parseFloat(f.y), width: parseFloat(f.width), height: parseFloat(f.height) },
                  currentPageHeight, SCALE
                );
                const isSelected = selectedId === f._id;
                return (
                  <Rnd key={f._id}
                    size={{ width: canvasBox.width, height: canvasBox.height }}
                    position={{ x: canvasBox.x, y: canvasBox.y }}
                    bounds="parent"
                    onDragStop={(e, d) => {
                      const pdfBox = canvasToPdf(
                        { x: d.x, y: d.y, width: canvasBox.width, height: canvasBox.height },
                        currentPageHeight, SCALE
                      );
                      updateField(f._id, { x: pdfBox.x, y: pdfBox.y });
                    }}
                    onResizeStop={(e, dir, ref, delta, pos) => {
                      const newW = parseFloat(ref.style.width);
                      const newH = parseFloat(ref.style.height);
                      const pdfBox = canvasToPdf(
                        { x: pos.x, y: pos.y, width: newW, height: newH },
                        currentPageHeight, SCALE
                      );
                      updateField(f._id, { x: pdfBox.x, y: pdfBox.y, width: pdfBox.width, height: pdfBox.height });
                    }}
                    onMouseDown={() => setSelectedId(f._id)}
                  >
                    <div className={`w-full h-full border-2 ${isSelected ? 'border-[#1e3a5f] bg-[#1e3a5f]/10' : 'border-blue-400 border-dashed bg-blue-100/30'} rounded relative`}>
                      <div className={`absolute -top-5 left-0 text-[10px] px-1 rounded ${isSelected ? 'bg-[#1e3a5f] text-white' : 'bg-blue-400 text-white'} whitespace-nowrap pointer-events-none`}>
                        {f.field_label}
                      </div>
                    </div>
                  </Rnd>
                );
              })}
            </div>
          </div>
          </>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-80 bg-white border-l border-gray-200 overflow-auto p-3">
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Fields ({fields.length})</h3>
              <button type="button" onClick={() => setShowAddMenu(v => !v)}
                className="text-xs text-[#1e3a5f] hover:underline">+ Add field</button>
            </div>
            {showAddMenu && (
              <div className="bg-gray-50 border border-gray-200 rounded p-2 mb-2 max-h-64 overflow-auto">
                {unusedCatalog.length === 0 ? (
                  <p className="text-xs text-gray-400 px-1">All available fields are added.</p>
                ) : unusedCatalog.map(c => (
                  <button key={c.key} onClick={() => addField(c)}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-white rounded">
                    <div className="font-medium">{c.label}</div>
                    <div className="text-gray-400">{c.description}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-1">
              {fields.map(f => (
                <div key={f._id}
                  onClick={() => { setSelectedId(f._id); setPageNumber(f.page_number || 1); }}
                  className={`px-2 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between ${
                    selectedId === f._id ? 'bg-[#1e3a5f]/10 border border-[#1e3a5f]/30' : 'hover:bg-gray-50 border border-transparent'
                  }`}>
                  <div>
                    <div className="font-medium">{f.field_label}</div>
                    <div className="text-[10px] text-gray-400">
                      {f.field_type} • p{f.page_number || 1}
                      {(f.page_number || 1) !== pageNumber && <span className="ml-1 text-amber-600">(other page)</span>}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteField(f._id); }}
                    className="text-gray-300 hover:text-red-500">×</button>
                </div>
              ))}
            </div>
          </div>

          {selectedField && (
            <div className="border-t border-gray-200 pt-3 space-y-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Style</h4>
              <Input label="Display Label" value={selectedField.field_label}
                onChange={e => updateField(selectedField._id, { field_label: e.target.value })} />
              {selectedField.field_type === 'text' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Font Size" type="number" value={selectedField.font_size}
                      onChange={e => updateField(selectedField._id, { font_size: parseFloat(e.target.value) || 12 })} />
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">Color</label>
                      <input type="color" value={selectedField.font_color || '#000000'}
                        onChange={e => updateField(selectedField._id, { font_color: e.target.value })}
                        className="w-full h-8 border border-gray-300 rounded" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Font</label>
                    <select value={selectedField.font_family || 'Helvetica'}
                      onChange={e => updateField(selectedField._id, { font_family: e.target.value })}
                      className="block w-full rounded border border-gray-300 text-sm px-2 py-1">
                      {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Alignment</label>
                    <div className="flex gap-1">
                      {['left', 'center', 'right'].map(a => (
                        <button key={a} type="button" onClick={() => updateField(selectedField._id, { alignment: a })}
                          className={`flex-1 px-2 py-1 text-xs rounded border ${
                            selectedField.alignment === a ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white border-gray-300'
                          }`}>{a}</button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input type="checkbox" checked={!!selectedField.auto_shrink}
                      onChange={e => updateField(selectedField._id, { auto_shrink: e.target.checked ? 1 : 0 })} />
                    Auto-shrink to fit
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input type="checkbox" checked={!!selectedField.is_optional}
                      onChange={e => updateField(selectedField._id, { is_optional: e.target.checked ? 1 : 0 })} />
                    Optional (skip if blank)
                  </label>
                </>
              )}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                <Input label="X (pt)" type="number" step="0.1" value={Math.round(selectedField.x * 10) / 10}
                  onChange={e => updateField(selectedField._id, { x: parseFloat(e.target.value) || 0 })} />
                <Input label="Y (pt)" type="number" step="0.1" value={Math.round(selectedField.y * 10) / 10}
                  onChange={e => updateField(selectedField._id, { y: parseFloat(e.target.value) || 0 })} />
                <Input label="Width" type="number" step="0.1" value={Math.round(selectedField.width * 10) / 10}
                  onChange={e => updateField(selectedField._id, { width: parseFloat(e.target.value) || 0 })} />
                <Input label="Height" type="number" step="0.1" value={Math.round(selectedField.height * 10) / 10}
                  onChange={e => updateField(selectedField._id, { height: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
