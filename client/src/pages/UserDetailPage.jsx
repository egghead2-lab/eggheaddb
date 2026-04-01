import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { getUser, createUser, updateUser } from '../api/users';
import { getRoles, createRole } from '../api/reference';
import { AppShell } from '../components/layout/AppShell';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { UnsavedChangesModal } from '../components/ui/UnsavedChangesModal';
import { toFormData } from '../lib/utils';

export default function UserDetailPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showNewRole, setShowNewRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');

  const { data: userData, isLoading } = useQuery({
    queryKey: ['users', id],
    queryFn: () => getUser(id),
    enabled: !isNew,
  });

  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  });
  const roles = rolesData?.data || [];

  const { register, handleSubmit, reset, setValue, formState: { errors, isDirty } } = useForm();

  useEffect(() => {
    if (userData?.data) reset(toFormData(userData.data));
  }, [userData]);

  const mutation = useMutation({
    mutationFn: (data) => isNew ? createUser(data) : updateUser(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries(['users']);
      if (isNew && res?.id) navigate(`/users/${res.id}`);
    },
  });

  const roleMutation = useMutation({
    mutationFn: (data) => createRole(data),
    onSuccess: (res) => {
      qc.invalidateQueries(['roles']);
      setValue('role_id', res.id);
      setNewRoleName('');
      setShowNewRole(false);
    },
  });

  const user = userData?.data || {};

  const onSubmit = (data) => {
    if (!isNew && !data.password) {
      delete data.password;
    }
    mutation.mutate(data);
  };

  const handleCreateRole = () => {
    if (!newRoleName.trim()) return;
    roleMutation.mutate({ role_name: newRoleName.trim() });
  };

  if (!isNew && isLoading) {
    return <AppShell><div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div></AppShell>;
  }

  return (
    <AppShell>
      <UnsavedChangesModal when={isDirty} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <Link to="/users" className="text-sm text-gray-500 hover:text-[#1e3a5f]">← Users</Link>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">
              {isNew ? 'New User' : `${user.first_name || ''} ${user.last_name || ''}`}
            </h1>
          </div>
        </div>

        <div className="p-6 space-y-4 pb-32">
          <Section title="Account Info" defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" required {...register('first_name', { required: 'Required' })} error={errors.first_name?.message} />
              <Input label="Last Name" required {...register('last_name', { required: 'Required' })} error={errors.last_name?.message} />
              <Input label="Email" type="email" required {...register('email', { required: 'Required' })} error={errors.email?.message} />
              <Input label="Username" required {...register('user_name', { required: 'Required' })} error={errors.user_name?.message} />
              <Input
                label={isNew ? 'Password' : 'New Password (leave blank to keep current)'}
                type="password"
                {...register('password', isNew ? { required: 'Required' } : {})}
                error={errors.password?.message}
              />
              <div>
                <Select label="Role" required {...register('role_id', { required: 'Required' })} error={errors.role_id?.message}>
                  <option value="">Select role…</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.role_name}</option>
                  ))}
                </Select>
                {!showNewRole ? (
                  <button type="button" onClick={() => setShowNewRole(true)} className="text-xs text-[#1e3a5f] hover:underline mt-1">
                    + Create new role
                  </button>
                ) : (
                  <div className="flex gap-2 mt-2 items-center">
                    <input
                      type="text"
                      placeholder="New role name"
                      value={newRoleName}
                      onChange={e => setNewRoleName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCreateRole())}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
                    />
                    <button type="button" onClick={handleCreateRole} disabled={roleMutation.isPending}
                      className="text-xs font-medium text-white bg-[#1e3a5f] px-2.5 py-1 rounded hover:bg-[#152a47]">
                      {roleMutation.isPending ? '…' : 'Add'}
                    </button>
                    <button type="button" onClick={() => { setShowNewRole(false); setNewRoleName(''); }}
                      className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                )}
                {roleMutation.isError && (
                  <p className="text-xs text-red-600 mt-1">{roleMutation.error?.response?.data?.error || 'Failed to create role'}</p>
                )}
              </div>
            </div>
          </Section>
        </div>

        <div className="fixed bottom-0 left-[220px] right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4">
          {mutation.isError && (
            <p className="text-sm text-red-600">{mutation.error?.response?.data?.error || 'Save failed'}</p>
          )}
          {mutation.isSuccess && <p className="text-sm text-green-600">Saved successfully</p>}
          <div className="ml-auto flex gap-3">
            <Link to="/users" className="text-sm text-gray-500 hover:text-gray-700 py-2">Discard</Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
