import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers } from '../api/users';
import { getRoles, createRole, updateRole } from '../api/reference';
import { AppShell } from '../components/layout/AppShell';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { SortTh } from '../components/ui/SortTh';

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('role');
  const [dir, setDir] = useState('asc');
  const [showNewRole, setShowNewRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [showRoles, setShowRoles] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editingRoleName, setEditingRoleName] = useState('');
  const qc = useQueryClient();

  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  });
  const roles = rolesData?.data || [];

  const roleMutation = useMutation({
    mutationFn: (data) => createRole(data),
    onSuccess: () => {
      qc.invalidateQueries(['roles']);
      qc.invalidateQueries(['users']);
      setNewRoleName('');
      setShowNewRole(false);
    },
  });

  const roleUpdateMutation = useMutation({
    mutationFn: ({ id, role_name }) => updateRole(id, { role_name }),
    onSuccess: () => {
      qc.invalidateQueries(['roles']);
      qc.invalidateQueries(['users']);
      setEditingRoleId(null);
      setEditingRoleName('');
    },
  });

  const handleSort = (col) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('asc'); }
    setPage(1);
  };

  const filters = {
    search: search || undefined,
    role: role || undefined,
    sort: sort || undefined,
    dir: sort ? dir : undefined,
    page,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['users', filters],
    queryFn: () => getUsers(filters),
  });

  const users = data?.data || [];
  const total = data?.total || 0;
  const limit = data?.limit || 50;

  const reset = () => { setSearch(''); setRole(''); setPage(1); };
  const hasFilters = search || role;

  const startEditRole = (r) => {
    setEditingRoleId(r.id);
    setEditingRoleName(r.role_name);
  };

  const saveEditRole = () => {
    if (!editingRoleName.trim() || !editingRoleId) return;
    roleUpdateMutation.mutate({ id: editingRoleId, role_name: editingRoleName.trim() });
  };

  return (
    <AppShell>
      <PageHeader title="Users" action={
        <div className="flex gap-2 items-center">
          {showNewRole ? (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="New role name"
                value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newRoleName.trim() && roleMutation.mutate({ role_name: newRoleName.trim() })}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
                autoFocus
              />
              <Button onClick={() => newRoleName.trim() && roleMutation.mutate({ role_name: newRoleName.trim() })} disabled={roleMutation.isPending}>
                {roleMutation.isPending ? '…' : 'Add'}
              </Button>
              <button onClick={() => { setShowNewRole(false); setNewRoleName(''); }} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
              {roleMutation.isError && <span className="text-xs text-red-600">{roleMutation.error?.response?.data?.error || 'Failed'}</span>}
            </div>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setShowRoles(!showRoles)}>
                {showRoles ? 'Hide Roles' : 'Manage Roles'}
              </Button>
              <Button variant="secondary" onClick={() => setShowNewRole(true)}>+ New Role</Button>
            </>
          )}
          <Link to="/users/new"><Button>+ New User</Button></Link>
        </div>
      }>
        <Input
          placeholder="Search by name, email, or username…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-60"
        />
        <Select value={role} onChange={e => { setRole(e.target.value); setPage(1); }} className="w-52">
          <option value="">All Roles</option>
          {roles.map(r => (
            <option key={r.id} value={r.role_name}>{r.role_name}</option>
          ))}
        </Select>
        {hasFilters && (
          <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700 underline">Clear</button>
        )}
      </PageHeader>

      <div className="p-6">
        {/* Roles management panel */}
        {showRoles && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Roles</h3>
            <div className="flex flex-wrap gap-2">
              {roles.map(r => (
                <div key={r.id}>
                  {editingRoleId === r.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editingRoleName}
                        onChange={e => setEditingRoleName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEditRole();
                          if (e.key === 'Escape') { setEditingRoleId(null); setEditingRoleName(''); }
                        }}
                        className="rounded border border-gray-300 px-2 py-1 text-sm w-44 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
                        autoFocus
                      />
                      <button onClick={saveEditRole} disabled={roleUpdateMutation.isPending}
                        className="text-xs font-medium text-white bg-[#1e3a5f] px-2 py-1 rounded hover:bg-[#152a47]">
                        {roleUpdateMutation.isPending ? '…' : 'Save'}
                      </button>
                      <button onClick={() => { setEditingRoleId(null); setEditingRoleName(''); }}
                        className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditRole(r)}
                      className="group flex items-center gap-1"
                      title="Click to rename"
                    >
                      <Badge status={r.role_name} />
                      <span className="text-xs text-gray-300 group-hover:text-gray-500 transition-colors">edit</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {roleUpdateMutation.isError && (
              <p className="text-xs text-red-600 mt-2">{roleUpdateMutation.error?.response?.data?.error || 'Failed to rename role'}</p>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <SortTh col="name" sort={sort} dir={dir} onSort={handleSort}>Name</SortTh>
                    <SortTh col="username" sort={sort} dir={dir} onSort={handleSort}>Username</SortTh>
                    <SortTh col="email" sort={sort} dir={dir} onSort={handleSort}>Email</SortTh>
                    <SortTh col="role" sort={sort} dir={dir} onSort={handleSort}>Role</SortTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-12 text-gray-400">No users found</td></tr>
                  ) : users.map((u, i) => (
                    <tr key={u.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5">
                        <Link to={`/users/${u.id}`} className="font-medium text-[#1e3a5f] hover:underline">
                          {u.first_name} {u.last_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{u.user_name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{u.email}</td>
                      <td className="px-4 py-2.5"><Badge status={u.role_name} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>{total} user{total !== 1 ? 's' : ''}</span>
              {total > limit && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <span className="py-1.5 px-2">Page {page}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={users.length < limit}>Next</Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
