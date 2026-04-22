import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import api from '../api/client';

export default function CommissionCleanupPage() {
  const qc = useQueryClient();

  const { data: healthData, isLoading } = useQuery({
    queryKey: ['commission-data-health'],
    queryFn: () => api.get('/commission/data-health').then(r => r.data),
    staleTime: 30 * 1000,
  });
  const h = healthData?.data || {};
  const missingContractorRetained = h.missingContractorRetained || [];
  const missingLocationRetained = h.missingLocationRetained || [];
  const contractorsNoRep = h.contractorsNoRep || [];
  const splitMismatch = h.splitMismatch || [];
  const locationsNoRep = h.locationsNoRep || [];

  const { data: salesData } = useQuery({
    queryKey: ['commission-salespeople'],
    queryFn: () => api.get('/commission/salespeople').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const salespeople = salesData?.data || [];

  const invalidate = () => qc.invalidateQueries(['commission-data-health']);

  const contractorRetained = useMutation({
    mutationFn: ({ id, retained }) => api.patch(`/commission/contractors/${id}`, { retained }),
    onSuccess: invalidate,
  });
  const locationRetained = useMutation({
    mutationFn: ({ id, retained_commission }) => api.patch(`/commission/locations/${id}`, { retained_commission }),
    onSuccess: invalidate,
  });
  const saveContractorRep = useMutation({
    mutationFn: ({ id, user_id }) => api.post(`/commission/contractors/${id}/salespeople`, { salespeople: [{ user_id, split_pct: 1.0000 }] }),
    onSuccess: invalidate,
  });
  const saveLocationRep = useMutation({
    mutationFn: ({ id, user_id }) => api.post(`/commission/locations/${id}/salespeople`, { salespeople: [{ user_id, split_pct: 1.0000 }] }),
    onSuccess: invalidate,
  });

  const totalIssues = missingContractorRetained.length + missingLocationRetained.length + contractorsNoRep.length + splitMismatch.length + locationsNoRep.length;

  return (
    <AppShell>
      <PageHeader title="Commission — Data Cleanup" />
      <div className="p-6 space-y-4 max-w-[1100px]">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-700">
            Commission runs can't be created until every contractor / standalone location has a retained flag and a salesperson assigned.
            Clear each tab below.
          </div>
          {totalIssues === 0 && (
            <div className="mt-3 text-sm text-green-700 font-semibold">All clear — commission runs are ready.</div>
          )}
        </div>

        {isLoading ? <Spinner className="w-6 h-6" /> : (
          <>
            {missingContractorRetained.length > 0 && (
              <Section title="Contractors — Retained Status Missing" count={missingContractorRetained.length} color="red">
                <div className="text-[10px] text-gray-500 mb-2 px-4 pt-3">Retained = recurring client that counts toward quota commission. Non-retained = one-off, flat fee per program.</div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Contractor</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Programs (12mo)</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-64">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {missingContractorRetained.map(c => {
                      const busy = contractorRetained.isPending && contractorRetained.variables?.id === c.id;
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">
                            <Link to={`/contractors/${c.id}`} className="text-[#1e3a5f] hover:underline">{c.contractor_name}</Link>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">{c.recent_programs}</td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => contractorRetained.mutate({ id: c.id, retained: 1 })}
                              disabled={busy}
                              className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 font-medium disabled:opacity-50 mr-2">
                              Retained
                            </button>
                            <button onClick={() => contractorRetained.mutate({ id: c.id, retained: 0 })}
                              disabled={busy}
                              className="text-xs px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500 font-medium disabled:opacity-50">
                              Not Retained
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Section>
            )}

            {missingLocationRetained.length > 0 && (
              <Section title="Standalone Locations — Retained Status Missing" count={missingLocationRetained.length} color="red">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Location</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Programs (12mo)</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-64">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {missingLocationRetained.map(l => {
                      const busy = locationRetained.isPending && locationRetained.variables?.id === l.id;
                      return (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">
                            <Link to={`/locations/${l.id}`} className="text-[#1e3a5f] hover:underline">{l.nickname || l.school_name}</Link>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">{l.recent_programs}</td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => locationRetained.mutate({ id: l.id, retained_commission: 1 })}
                              disabled={busy}
                              className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 font-medium disabled:opacity-50 mr-2">
                              Retained
                            </button>
                            <button onClick={() => locationRetained.mutate({ id: l.id, retained_commission: 0 })}
                              disabled={busy}
                              className="text-xs px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500 font-medium disabled:opacity-50">
                              Not Retained
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Section>
            )}

            {contractorsNoRep.length > 0 && (
              <Section title="Contractors — No Salesperson Assigned" count={contractorsNoRep.length} color="amber">
                <RepAssignList items={contractorsNoRep} salespeople={salespeople} onSave={(id, user_id) => saveContractorRep.mutate({ id, user_id })} nameKey="contractor_name" />
              </Section>
            )}

            {locationsNoRep.length > 0 && (
              <Section title="Standalone Locations — No Salesperson Assigned" count={locationsNoRep.length} color="amber">
                <RepAssignList items={locationsNoRep} salespeople={salespeople} onSave={(id, user_id) => saveLocationRep.mutate({ id, user_id })} nameKey="nickname" />
              </Section>
            )}

            {splitMismatch.length > 0 && (
              <Section title="Contractors — Salesperson Splits Don't Sum to 100%" count={splitMismatch.length} color="red">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Contractor</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-32">Total Split</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Fix</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {splitMismatch.map(c => (
                      <tr key={c.id}>
                        <td className="px-3 py-2 font-medium">{c.contractor_name}</td>
                        <td className="px-3 py-2 text-right text-red-600 font-bold">{(parseFloat(c.total_split) * 100).toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right">
                          <Link to={`/contractors/${c.id}`} className="text-xs text-[#1e3a5f] hover:underline">Edit ↗</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Section({ title, count, color, children }) {
  const borderCls = color === 'red' ? 'border-red-200' : color === 'amber' ? 'border-amber-200' : 'border-gray-200';
  const bgCls = color === 'red' ? 'bg-red-50' : color === 'amber' ? 'bg-amber-50' : 'bg-gray-50';
  const titleCls = color === 'red' ? 'text-red-700' : color === 'amber' ? 'text-amber-700' : 'text-gray-700';
  return (
    <div className={`bg-white rounded-lg border ${borderCls} overflow-hidden`}>
      <div className={`${bgCls} px-4 py-2 border-b ${borderCls} flex items-center gap-2`}>
        <span className={`text-sm font-semibold ${titleCls}`}>{title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${color === 'red' ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function RepAssignList({ items, salespeople, onSave, nameKey }) {
  const [picks, setPicks] = useState({});
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="text-left px-3 py-2 font-medium text-gray-600">{nameKey === 'contractor_name' ? 'Contractor' : 'Location'}</th>
          <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Programs (12mo)</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600 w-80">Assign Salesperson</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {items.map(item => {
          const pick = picks[item.id] || '';
          const link = nameKey === 'contractor_name' ? `/contractors/${item.id}` : `/locations/${item.id}`;
          return (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-medium">
                <Link to={link} className="text-[#1e3a5f] hover:underline">{item[nameKey] || item.school_name || `#${item.id}`}</Link>
              </td>
              <td className="px-3 py-2 text-center text-gray-600">{item.recent_programs}</td>
              <td className="px-3 py-2 text-right">
                <select value={pick} onChange={e => setPicks(p => ({ ...p, [item.id]: e.target.value }))}
                  className="text-xs rounded border border-gray-300 px-2 py-1 mr-2">
                  <option value="">Pick rep...</option>
                  {salespeople.map(sp => (
                    <option key={sp.id} value={sp.id}>{sp.first_name} {sp.last_name}</option>
                  ))}
                </select>
                <button onClick={() => pick && onSave(item.id, Number(pick))}
                  disabled={!pick}
                  className="text-xs px-3 py-1 bg-[#1e3a5f] text-white rounded font-medium disabled:opacity-50">
                  Assign
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
