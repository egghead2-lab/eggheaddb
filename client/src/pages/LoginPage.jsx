import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export default function LoginPage() {
  const { user, isAuthenticated, login, loginPending } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const error = params.get('error');
  const [form, setForm] = useState({ username: '', password: '' });
  const [formError, setFormError] = useState('');

  // Pick up token from Google OAuth redirect (?token=...)
  useEffect(() => {
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('token', urlToken);
      window.location.replace('/');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) navigate(user?.role === 'Candidate' ? '/candidate-portal' : '/');
  }, [isAuthenticated, user]);

  const handleGoogleLogin = () => {
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3002';
    window.location.href = `${base}/api/auth/google`;
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      const res = await login(form);
      navigate(res?.data?.role === 'Candidate' ? '/candidate-portal' : '/');
    } catch (err) {
      setFormError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#1e3a5f]">Professor Egghead</h1>
          <p className="text-gray-500 text-sm mt-1">Science Academy Operations</p>
        </div>

        {error === 'unauthorized' && (
          <div className="mb-4 px-3 py-2 bg-red-50 text-red-600 text-sm rounded">
            Your Google account isn't linked to a user in the system. Contact an admin.
          </div>
        )}
        {error && error !== 'unauthorized' && (
          <div className="mb-4 px-3 py-2 bg-red-50 text-red-600 text-sm rounded">
            Sign-in failed. Please try again.
          </div>
        )}

        {/* Staff Login */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Staff Login</p>
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Sign in with Google
          </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-xs text-gray-400">or</span>
          </div>
        </div>

        {/* Professor Login */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Professor / Candidate Login</p>
          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <Input
              label="Username or Email"
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              autoComplete="username"
            />
            <Input
              label="Password"
              type="password"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              autoComplete="current-password"
            />
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{formError}</p>
            )}
            <Button type="submit" className="w-full" disabled={loginPending}>
              {loginPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
