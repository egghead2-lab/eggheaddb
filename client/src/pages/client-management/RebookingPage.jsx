import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { useLocationList } from '../../hooks/useReferenceData';
import { formatDate, formatTime, formatCurrency } from '../../lib/utils';

const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
const DAYS = ['monday','tuesday','wednesday','thursday','friday'];
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri'];

const CLOSING_VARIANTS = {
  'yes_yes': "If this works, we'll set some dates using your school calendar and send them over for confirmation, then get a flyer as we approach.",
  'yes_no': "If this works, we'll set some dates using your school calendar and send them over for confirmation.",
  'no_yes': "If this works, we'll pencil it in and await dates from you. Once we receive the dates we'll send over a flyer.",
  'no_no': "If this works, we'll confirm it and await anything else needed from you.",
};

export default function RebookingPage() {
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState('');
  const [mode, setMode] = useState('set_dates'); // 'set_dates' | 'rebook'
  const [season, setSeason] = useState('Fall');
  const [intro, setIntro] = useState('');
  const [closing, setClosing] = useState('');
  const [included, setIncluded] = useState(new Set());
  const [subject, setSubject] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [locSearch, setLocSearch] = useState('');

  const { data: locList } = useLocationList();
  const locations = locList?.data || [];

  // Locations needing rebooking
  const { data: rebookLocData } = useQuery({
    queryKey: ['rebooking-locations', areaFilter],
    queryFn: () => api.get('/client-management/rebooking/locations', { params: areaFilter ? { area: areaFilter } : {} }).then(r => r.data),
  });
  const rebookLocations = (rebookLocData?.data || []).filter(l =>
    !locSearch || (l.school_name || l.nickname || '').toLowerCase().includes(locSearch.toLowerCase())
  );

  // Areas for filter
  const { data: refData } = useQuery({ queryKey: ['general-data'], queryFn: () => api.get('/general-data').then(r => r.data), staleTime: 5 * 60000 });
  const areas = refData?.data?.areas || [];

  const { data, isLoading } = useQuery({
    queryKey: ['rebooking-location', locationId],
    queryFn: () => api.get(`/client-management/rebooking/location/${locationId}`).then(r => r.data),
    enabled: !!locationId,
  });
  const programs = data?.data?.programs || [];
  const loc = data?.data?.location || {};

  // Templates
  const category = mode === 'set_dates' ? 'set_dates_email' : 'rebook_receive_email';
  const { data: tplData } = useQuery({
    queryKey: ['cm-templates', category],
    queryFn: () => api.get('/client-management/templates', { params: { category } }).then(r => r.data),
  });
  const templates = tplData?.data || [];

  // Auto-set closing based on location flags
  const setDatesOurselves = loc.set_dates_ourselves ? 'yes' : 'no';
  const flyerRequired = loc.flyer_required_for_location ? 'yes' : 'no';
  const closingKey = `${setDatesOurselves}_${flyerRequired}`;

  const contactFirst = (loc.point_of_contact || '').split(' ')[0] || '';
  const recipient = loc.site_coordinator_email || loc.poc_email || '';

  const toggleInclude = (id) => {
    setIncluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Build email body
  const buildBody = () => {
    const introText = intro || `Hi ${contactFirst},\n\nHope all is well! I wanted to reach out about ${season} programming.`;
    const includedProgs = programs.filter(p => included.has(p.id));
    const blocks = includedProgs.map(p => {
      const days = DAYS.map((d, i) => p[d] ? DAY_SHORT[i] : null).filter(Boolean).join(', ');
      const lines = [
        `${p.formal_class_name || p.program_nickname}`,
        `  Day: ${days || 'TBD'} | Time: ${p.start_time ? formatTime(p.start_time) : 'TBD'}`,
        `  Students: ${p.minimum_students || '?'}-${p.maximum_students || '?'} | Price: ${p.parent_cost ? formatCurrency(p.parent_cost) : 'TBD'}`,
      ];
      if (p.class_description) lines.push(`  ${p.class_description}`);
      if (mode === 'set_dates' && p.first_session_date) lines.push(`  Dates: ${formatDate(p.first_session_date)} - ${formatDate(p.last_session_date)}`);
      return lines.join('\n');
    }).join('\n\n');
    const closingText = closing || CLOSING_VARIANTS[closingKey] || CLOSING_VARIANTS['no_no'];
    return `${introText}\n\n${blocks}\n\n${closingText}\n\nBest regards`;
  };

  const sendMutation = useMutation({
    mutationFn: () => api.post('/client-management/send', {
      category,
      location_id: locationId,
      recipient_email: recipient,
      subject: subject || `${season} Programming - ${loc.school_name || loc.nickname}`,
      body: buildBody(),
      test_mode: testMode,
      test_email: testEmail,
    }),
    onSuccess: () => qc.invalidateQueries(['rebooking-location']),
  });

  return (
    <AppShell>
      <PageHeader title="Rebooking Emails" action={
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setMode('set_dates')} className={`px-3 py-1 rounded text-xs font-medium ${mode === 'set_dates' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>Set Dates</button>
            <button onClick={() => setMode('rebook')} className={`px-3 py-1 rounded text-xs font-medium ${mode === 'rebook' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>Rebook Outreach</button>
          </div>
          <select value={season} onChange={e => setSeason(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
            {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      } />

      <div className="p-6">
        <div className="flex gap-6">
          {/* Left — Location selector + programs */}
          <div className="w-[50%] space-y-4">
            <div className="flex gap-2">
              <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-xs">
                <option value="">All Areas</option>
                {areas.map(a => <option key={a.id} value={a.geographic_area_name}>{a.geographic_area_name}</option>)}
              </select>
              <input type="text" value={locSearch} onChange={e => setLocSearch(e.target.value)}
                placeholder="Search locations..."
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs" />
            </div>

            {/* Locations needing rebooking */}
            {!locationId && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-h-[400px] overflow-y-auto">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700 sticky top-0">
                  Locations Needing Rebooking ({rebookLocations.length})
                </div>
                {rebookLocations.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">No locations without future classes</div>
                ) : rebookLocations.map(l => (
                  <div key={l.id} onClick={() => { setLocationId(String(l.id)); setIncluded(new Set()); }}
                    className="px-3 py-2 border-b border-gray-50 cursor-pointer hover:bg-blue-50/30 text-xs">
                    <div className="font-medium text-gray-900">{l.school_name || l.nickname}</div>
                    <div className="text-gray-500">{l.geographic_area_name || '—'} {l.last_program_end ? `· Last class ended ${formatDate(l.last_program_end)}` : ''}</div>
                  </div>
                ))}
              </div>
            )}

            {isLoading && locationId && <div className="flex justify-center py-12"><Spinner className="w-6 h-6" /></div>}

            {locationId && !isLoading && (
              <>
                <button onClick={() => setLocationId('')} className="text-xs text-gray-500 hover:text-[#1e3a5f]">← Back to location list</button>
                {/* Location info */}
                <div className="bg-white rounded-lg border border-gray-200 p-3 text-xs space-y-1">
                  <div className="font-medium text-gray-900">{loc.school_name || loc.nickname}</div>
                  <div className="text-gray-500">Contact: {loc.point_of_contact || '—'} | Email: {recipient || '—'}</div>
                  <div className="text-gray-500">
                    Set Dates Ourselves: <strong>{loc.set_dates_ourselves ? 'Yes' : 'No'}</strong> |
                    Flyer Required: <strong>{loc.flyer_required_for_location ? 'Yes' : 'No'}</strong>
                  </div>
                </div>

                {/* Programs at location */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">
                    Programs ({programs.length}) — check to include in email
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="w-8 px-2 py-1.5"></th>
                        <th className="text-left px-2 py-1.5 font-medium text-gray-600">Program</th>
                        <th className="text-left px-2 py-1.5 font-medium text-gray-600">Type</th>
                        <th className="text-left px-2 py-1.5 font-medium text-gray-600">Status</th>
                        <th className="text-left px-2 py-1.5 font-medium text-gray-600">Dates</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {programs.map(p => {
                        const cancelled = (p.class_status_name || '').toLowerCase().includes('cancel');
                        return (
                          <tr key={p.id} className={cancelled ? 'opacity-40' : ''}>
                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" checked={included.has(p.id)} onChange={() => toggleInclude(p.id)}
                                className="w-3.5 h-3.5 rounded border-gray-300" />
                            </td>
                            <td className="px-2 py-1.5 font-medium text-gray-900">{p.program_nickname}</td>
                            <td className="px-2 py-1.5 text-gray-600">{p.program_type_name || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-500">{p.class_status_name || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-500">
                              {p.first_session_date ? `${formatDate(p.first_session_date)} - ${formatDate(p.last_session_date)}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Right — Email composer */}
          {locationId && (
            <div className="w-[50%] space-y-3 sticky top-4 self-start">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                  <div className="text-sm font-semibold text-gray-900">{mode === 'set_dates' ? 'Set Dates Email' : 'Rebook Outreach Email'}</div>
                  <div className="text-[10px] text-gray-500">To: {recipient}</div>
                </div>
                <div className="p-4 space-y-3">
                  {templates.length > 0 && (
                    <select className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      onChange={e => {
                        const tpl = templates.find(t => String(t.id) === e.target.value);
                        if (tpl) {
                          setSubject(tpl.subject.replace('{{location_name}}', loc.school_name || '').replace('{{season}}', season));
                          setIntro(tpl.body_html.replace('{{contact_first_name}}', contactFirst).replace('{{season}}', season));
                        }
                      }}>
                      <option value="">Load template...</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">Subject</label>
                    <input type="text" value={subject || `${season} Programming - ${loc.school_name || ''}`}
                      onChange={e => setSubject(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">Intro Paragraph</label>
                    <textarea value={intro || `Hi ${contactFirst},\n\nHope all is well! I wanted to reach out about ${season} programming.`}
                      onChange={e => setIntro(e.target.value)} rows={3}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs" />
                  </div>
                  {included.size > 0 && (
                    <div className="bg-blue-50 rounded-lg p-3 text-xs">
                      <div className="font-medium text-blue-800 mb-1">{included.size} class{included.size !== 1 ? 'es' : ''} included</div>
                      {programs.filter(p => included.has(p.id)).map(p => (
                        <div key={p.id} className="text-blue-700 ml-2">- {p.formal_class_name || p.program_nickname}</div>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">
                      Closing ({loc.set_dates_ourselves ? 'Set Dates' : 'Await Dates'} + {loc.flyer_required_for_location ? 'Flyer' : 'No Flyer'})
                    </label>
                    <textarea value={closing || CLOSING_VARIANTS[closingKey] || ''} onChange={e => setClosing(e.target.value)} rows={3}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs" />
                  </div>

                  <div className="border-t border-gray-100 pt-2 flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300" />
                      Test mode
                    </label>
                    {testMode && <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="Test email" className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />}
                  </div>
                  <Button onClick={() => { if (confirm(`Send to ${testMode ? testEmail : recipient}?`)) sendMutation.mutate(); }}
                    disabled={sendMutation.isPending || included.size === 0}>
                    {sendMutation.isPending ? 'Sending...' : testMode ? 'Send Test' : 'Send Rebooking Email'}
                  </Button>
                  {sendMutation.isSuccess && <p className="text-xs text-green-600">Sent!</p>}
                  {sendMutation.isError && <p className="text-xs text-red-600">{sendMutation.error?.response?.data?.error || 'Failed'}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
