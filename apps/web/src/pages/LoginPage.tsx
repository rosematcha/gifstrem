import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { getToken, setToken } from '../lib/auth';
import type { Streamer } from '../types';

const LoginPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getToken()) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<{ token: string; user: Streamer }>('/auth/login', form);
      setToken(response.data.token);
      navigate('/dashboard');
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-charcoal px-4 text-white">
      <Link to="/" className="font-display text-4xl mb-8 hover:text-softViolet">
        <span className="text-white">GIF</span>
        <span className="text-violet">strem</span>
      </Link>
      <form className="w-full max-w-md space-y-m rounded-modal bg-graphite border border-slate/30 p-l shadow-medium" onSubmit={handleSubmit}>
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        {error && <p className="rounded-btn bg-coral/20 border border-coral/40 p-2 text-sm text-white">{error}</p>}
        <label className="block text-sm font-semibold text-coolGray">
          Username
          <input
            type="text"
            className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none"
            value={form.username}
            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
            required
          />
        </label>
        <label className="block text-sm font-semibold text-coolGray">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-btn bg-violet py-[10px] px-5 font-semibold text-white hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
        <p className="text-center text-sm text-coolGray">
          Need an account?{' '}
          <Link to="/auth/signup" className="text-violet hover:text-softViolet font-semibold">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
};

export default LoginPage;
