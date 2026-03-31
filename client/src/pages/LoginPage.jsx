import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function LoginPage() {
  const { login, loginPending } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(form);
      navigate('/programs');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#1e3a5f]">Professor Egghead</h1>
          <p className="text-gray-500 text-sm mt-1">Science Academy Operations</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Username or Email"
            value={form.username}
            onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
            autoFocus
            autoComplete="username"
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            autoComplete="current-password"
          />
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <Button type="submit" className="w-full" disabled={loginPending}>
            {loginPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
