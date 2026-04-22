import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';

const MERGE_FIELDS = [
  { key: 'professor_nickname', label: 'Sub professor nickname', example: 'Ali' },
  { key: 'role', label: 'Role needed', example: 'Lead' },
  { key: 'program_name', label: 'Program nickname', example: 'NORRIS BIMAT (1-3) - AST 26' },
  { key: 'session_date', label: 'Session date', example: 'Monday, May 5' },
  { key: 'session_time', label: 'Session time', example: '3:30 PM' },
  { key: 'class_length', label: 'Class length', example: '60 min' },
  { key: 'location_name', label: 'Location nickname', example: 'Norris Elementary' },
  { key: 'location_address', label: 'Location street address', example: '123 Main St, Bakersfield CA' },
  { key: 'pay', label: 'Calculated pay ($ amount only)', example: '75' },
  { key: 'reason', label: 'Reason the regular prof is out', example: 'Sick' },
];

const SAMPLE_VALUES = {
  professor_nickname: 'Ali', role: 'Lead',
  program_name: 'NORRIS BIMAT (1-3) - AST 26',
  session_date: 'Monday, May 5', session_time: '3:30 PM', class_length: '60 min',
  location_name: 'Norris Elementary',
  location_address: '123 Main St, Bakersfield CA',
  pay: '75', reason: 'Sick',
};
function preview(tpl) {
  return String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => SAMPLE_VALUES[k] !== undefined ? SAMPLE_VALUES[k] : `{{${k}}}`);
}

export default function SubAskTemplatesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['sub-ask-templates'],
    queryFn: () => api.get('/sub-management/templates').then(r => r.data),
  });
  const [sms, setSms] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.data) {
      setSms(data.data.sub_ask_sms_template || '');
      setEmailSubject(data.data.sub_ask_email_subject || '');
      setEmailBody(data.data.sub_ask_email_body || '');
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => api.put('/sub-management/templates', {
      sub_ask_sms_template: sms,
      sub_ask_email_subject: emailSubject,
      sub_ask_email_body: emailBody,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['sub-ask-templates']);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const insertField = (target, setter, currentValue) => (key) => {
    const el = document.getElementById(target);
    const insert = `{{${key}}}`;
    if (el && typeof el.selectionStart === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newVal = currentValue.slice(0, start) + insert + currentValue.slice(end);
      setter(newVal);
      setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = start + insert.length; }, 0);
    } else {
      setter(currentValue + insert);
    }
  };

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;

  return (
    <AppShell>
      <PageHeader title="Sub Ask Templates" action={
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save All Templates'}
        </Button>
      } />

      <div className="p-6 max-w-[1100px] space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          When you hit <strong>Ask</strong> on a professor in Sub Management, these templates get merged with real session/professor data and pre-populated in the message box. You can still edit before sending.
          Values resolve live; if a field is blank in the database, the placeholder stays in the message.
        </div>

        <MergeFieldsTable />

        {/* SMS */}
        <TemplateEditor
          id="sms-tpl"
          title="SMS Template"
          subtitle="Used when the Ask method is SMS. Keep it short — 1-2 sentences fits in a single segment."
          value={sms}
          onChange={setSms}
          onInsert={insertField('sms-tpl', setSms, sms)}
          rows={3}
          preview={preview(sms)}
        />

        {/* Email subject */}
        <TemplateEditor
          id="email-subject-tpl"
          title="Email Subject"
          subtitle="One-line subject line for email outreach."
          value={emailSubject}
          onChange={setEmailSubject}
          onInsert={insertField('email-subject-tpl', setEmailSubject, emailSubject)}
          rows={1}
          preview={preview(emailSubject)}
        />

        {/* Email body */}
        <TemplateEditor
          id="email-body-tpl"
          title="Email Body"
          subtitle="Full email body. Plain text supported; line breaks preserved."
          value={emailBody}
          onChange={setEmailBody}
          onInsert={insertField('email-body-tpl', setEmailBody, emailBody)}
          rows={10}
          preview={preview(emailBody)}
        />
      </div>
    </AppShell>
  );
}

function MergeFieldsTable() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-700">Available Merge Fields</div>
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="text-left px-3 py-1.5">Token</th>
            <th className="text-left px-3 py-1.5">Description</th>
            <th className="text-left px-3 py-1.5">Example</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {MERGE_FIELDS.map(f => (
            <tr key={f.key}>
              <td className="px-3 py-1 font-mono text-[#1e3a5f]">{`{{${f.key}}}`}</td>
              <td className="px-3 py-1 text-gray-600">{f.label}</td>
              <td className="px-3 py-1 text-gray-400">{f.example}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TemplateEditor({ id, title, subtitle, value, onChange, onInsert, rows, preview }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      <p className="text-[11px] text-gray-500 mb-2">{subtitle}</p>

      <div className="mb-2 flex flex-wrap gap-1">
        <span className="text-[10px] text-gray-500 py-1 mr-1">Insert field:</span>
        {MERGE_FIELDS.map(f => (
          <button key={f.key} onClick={() => onInsert(f.key)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 bg-white text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f]">
            {f.key}
          </button>
        ))}
      </div>

      {rows === 1 ? (
        <input id={id} type="text" value={value} onChange={e => onChange(e.target.value)}
          className="block w-full rounded border border-gray-300 text-sm px-3 py-2 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
      ) : (
        <textarea id={id} value={value} onChange={e => onChange(e.target.value)} rows={rows}
          className="block w-full rounded border border-gray-300 text-sm px-3 py-2 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]" />
      )}

      <div className="mt-2 text-[10px] text-gray-500 uppercase tracking-wide">Preview (sample data)</div>
      <div className="mt-1 bg-gray-50 border border-gray-100 rounded px-3 py-2 text-xs text-gray-700 whitespace-pre-wrap">{preview || <span className="text-gray-400 italic">—</span>}</div>
    </div>
  );
}
