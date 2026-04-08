import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';

export default function BinManagerPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('assign'); // assign, lookup
  const [searchProfId, setSearchProfId] = useState('');
  const [lookupType, setLookupType] = useState('');
  const [lookupNumber, setLookupNumber] = useState('');
  const [assignForm, setAssignForm] = useState({ professor_id: '', bin_id: '', bin_number: '', comment: '' });

  const { data: binTypes } = useQuery({
    queryKey: ['bin-types'],
    queryFn: () => api.get('/materials/bin-types').then(r => r.data),
  });
  const bins = binTypes?.data || [];

  const { data: profListData } = useQuery({
    queryKey: ['professors-list'],
    queryFn: () => api.get('/professors?limit=500&sort=nickname&dir=asc').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const professors = profListData?.data || [];

  // Professor bin lookup
  const { data: profBinsData } = useQuery({
    queryKey: ['prof-bins', searchProfId],
    queryFn: () => api.get(`/materials/bins/professor/${searchProfId}`).then(r => r.data),
    enabled: !!searchProfId,
  });

  // Type+number lookup
  const { data: lookupData, refetch: lookupRefetch } = useQuery({
    queryKey: ['bin-lookup', lookupType, lookupNumber],
    queryFn: () => api.get(`/materials/bins/lookup?type=${lookupType}&number=${lookupNumber}`).then(r => r.data),
    enabled: false,
  });

  const assignMutation = useMutation({
    mutationFn: (data) => api.post('/materials/bins', data),
    onSuccess: () => {
      qc.invalidateQueries(['prof-bins']);
      setAssignForm({ professor_id: '', bin_id: '', bin_number: '', comment: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/materials/bins/${id}`, data),
    onSuccess: () => qc.invalidateQueries(['prof-bins']),
  });

  return (
    <AppShell>
      <PageHeader title="Bin Manager" />

      <div className="p-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          {[['assign', 'Assign / View'], ['lookup', 'Lookup']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === key ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{label}</button>
          ))}
        </div>

        {tab === 'assign' && (
          <div className="grid grid-cols-2 gap-6">
            {/* Assign form */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Assign Bin</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Professor</label>
                  <select value={assignForm.professor_id}
                    onChange={e => { setAssignForm({ ...assignForm, professor_id: e.target.value }); setSearchProfId(e.target.value); }}
                    className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm">
                    <option value="">Select professor...</option>
                    {professors.map(p => <option key={p.id} value={p.id}>{p.professor_nickname} {p.last_name}</option>)}
                  </select>
                </div>
                <Select label="Bin Type" value={assignForm.bin_id} onChange={e => setAssignForm({ ...assignForm, bin_id: e.target.value })}>
                  <option value="">Select bin type...</option>
                  {bins.map(b => <option key={b.id} value={b.id}>{b.bin_name}</option>)}
                </Select>
                <Input label="Bin Number" type="number" value={assignForm.bin_number}
                  onChange={e => setAssignForm({ ...assignForm, bin_number: e.target.value })} />
                <Input label="Comment" value={assignForm.comment}
                  onChange={e => setAssignForm({ ...assignForm, comment: e.target.value })} />
                <Button onClick={() => assignMutation.mutate(assignForm)}
                  disabled={!assignForm.professor_id || !assignForm.bin_id || !assignForm.bin_number || assignMutation.isPending}>
                  {assignMutation.isPending ? 'Assigning...' : 'Assign Bin'}
                </Button>
                {assignMutation.isError && <p className="text-sm text-red-600">{assignMutation.error?.response?.data?.error || 'Failed'}</p>}
                {assignMutation.isSuccess && <p className="text-sm text-green-600">Bin assigned!</p>}
              </div>
            </div>

            {/* Current bins for selected professor */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">
                {searchProfId ? 'Current Bins' : 'Select a professor to view bins'}
              </h3>
              {searchProfId && profBinsData?.data ? (
                profBinsData.data.length === 0 ? (
                  <p className="text-sm text-gray-400">No bins assigned</p>
                ) : (
                  <div className="space-y-2">
                    {profBinsData.data.map(b => (
                      <div key={b.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded">
                        <div>
                          <div className="text-sm font-medium text-gray-800">{b.bin_name}</div>
                          <div className="text-xs text-gray-500">#{b.bin_number}</div>
                        </div>
                        {b.comment && <div className="text-xs text-gray-400 max-w-[200px] truncate">{b.comment}</div>}
                        <button onClick={() => { if (confirm('Remove this bin assignment?')) updateMutation.mutate({ id: b.id, data: { active: 0 } }); }}
                          className="text-xs text-gray-400 hover:text-red-500">Remove</button>
                      </div>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          </div>
        )}

        {tab === 'lookup' && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 max-w-lg">
            <h3 className="font-semibold text-gray-900 mb-4">Bin Lookup</h3>
            <div className="flex gap-3 mb-4">
              <Select value={lookupType} onChange={e => setLookupType(e.target.value)} className="flex-1">
                <option value="">Bin type...</option>
                {bins.map(b => <option key={b.id} value={b.bin_name}>{b.bin_name}</option>)}
              </Select>
              <Input value={lookupNumber} onChange={e => setLookupNumber(e.target.value)}
                placeholder="Bin #" type="number" className="w-24" />
              <Button onClick={() => lookupRefetch()} disabled={!lookupType || !lookupNumber}>Search</Button>
            </div>
            {lookupData?.data && (
              lookupData.data.length === 0 ? (
                <p className="text-sm text-gray-400">No professor found with that bin</p>
              ) : (
                <div className="space-y-2">
                  {lookupData.data.map(r => (
                    <div key={r.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded">
                      <div className="text-sm font-medium text-gray-800">{r.professor_name}</div>
                      <div className="text-xs text-gray-500">{r.bin_name} #{r.bin_number}</div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
