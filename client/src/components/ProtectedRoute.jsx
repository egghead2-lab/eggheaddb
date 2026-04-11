import { useLocation, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';

const ADMIN_ROLES = ['Admin', 'CEO'];

export function ProtectedRoute({ children }) {
  const { user, isLoading: authLoading } = useAuth();
  const location = useLocation();

  // Always call hooks unconditionally
  const { data: permData, isLoading: permLoading } = useQuery({
    queryKey: ['my-permissions'],
    queryFn: () => api.get('/tools/my-permissions').then(r => r.data),
    staleTime: 2 * 60 * 1000,
    enabled: !!user,
  });

  // While auth is resolving, show nothing
  if (authLoading) return null;

  // Not logged in — redirect to login
  if (!user) return <Navigate to="/login" replace />;

  const role = user.role;

  // Candidates can only access the candidate portal
  if (role === 'Candidate') {
    if (location.pathname === '/candidate-portal') return children;
    return <Navigate to="/candidate-portal" replace />;
  }

  // Professors can access their tools only
  if (role === 'Professor') {
    const profAllowed = ['/schedule', '/my-today', '/my-attendance', '/my-pay', '/incident-report', '/bug-bounty'];
    if (profAllowed.some(p => location.pathname.startsWith(p)) || location.pathname.match(/^\/programs\/\d+\/classroom/) || location.pathname.match(/^\/locations\/\d+\/info-sheet/)) return children;
    return <Navigate to="/my-today" replace />;
  }

  // Admin/CEO always pass
  if (ADMIN_ROLES.includes(role)) return children;

  // While loading permissions, allow
  if (permLoading) return children;

  const allowedPaths = (permData?.data || []).map(t => t.path);

  // Check if current path matches any allowed tool path
  const path = location.pathname;
  const hasAccess = allowedPaths.some(p =>
    p === path || (p !== '/' && path.startsWith(p + '/')) || (p !== '/' && path.startsWith(p))
  ) || path === '/'; // Dashboard always accessible

  // Also check base path for detail pages (e.g. /programs/123 -> /programs)
  if (!hasAccess) {
    const base = '/' + path.split('/').filter(Boolean)[0];
    const baseAllowed = allowedPaths.includes(base);
    if (baseAllowed) return children;
  }

  if (!hasAccess) return <Navigate to="/" replace />;
  return children;
}
