import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMe, login as loginApi, logout as logoutApi } from '../api/auth';

export function useAuth() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: loginApi,
    onSuccess: () => qc.invalidateQueries(['auth']),
  });

  const logoutMutation = useMutation({
    mutationFn: logoutApi,
    onSuccess: () => {
      qc.clear();
      window.location.href = '/login';
    },
  });

  return {
    user: data?.data,
    isLoading,
    isAuthenticated: !!data?.data,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutate,
    loginError: loginMutation.error,
    loginPending: loginMutation.isPending,
  };
}
