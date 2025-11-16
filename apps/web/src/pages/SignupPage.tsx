import { FormEvent, MouseEvent, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { getToken, setToken } from '../lib/auth';
import { sanitizeDisplayName, sanitizeSlug, sanitizeText, validateInput } from '../lib/sanitize';
import type { Streamer } from '../types';

const SignupPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    displayName: '',
    slug: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoginLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (getToken()) {
      event.preventDefault();
      navigate('/dashboard');
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<{ token: string; user: Streamer }>('/auth/signup', form);
      setToken(response.data.token);
      navigate('/dashboard');
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Signup failed';
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
        <h1 className="text-2xl font-semibold">Create streamer account</h1>
        {error && <p className="rounded-btn bg-coral/20 border border-coral/40 p-2 text-sm text-white">{error}</p>}
        <label className="block text-sm font-semibold text-coolGray">
          Your name
          <input
            type="text"
            className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none"
            placeholder=""
            value={form.displayName}
            onChange={(event) => {
              const sanitized = sanitizeDisplayName(event.target.value);
              if (validateInput(sanitized)) {
                setForm((prev) => ({ ...prev, displayName: sanitized }));
              }
            }}
            onBlur={() => {
              const sanitized = sanitizeDisplayName(form.displayName);
              if (sanitized !== form.displayName) {
                setForm((prev) => ({ ...prev, displayName: sanitized }));
              }
            }}
            required
          />
        </label>
        <label className="block text-sm font-semibold text-coolGray">
          URL slug (used in your submission link)
          <input
            type="text"
            className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray lowercase focus:border-violet focus:outline-none"
            placeholder=""
            value={form.slug}
            onChange={(event) => {
              const sanitized = sanitizeSlug(event.target.value.toLowerCase());
              if (validateInput(sanitized)) {
                setForm((prev) => ({ ...prev, slug: sanitized }));
              }
            }}
            onBlur={() => {
              const sanitized = sanitizeSlug(form.slug);
              if (sanitized !== form.slug) {
                setForm((prev) => ({ ...prev, slug: sanitized }));
              }
            }}
            required
          />
          <div className="mt-2 rounded-btn bg-charcoal border border-slate/30 p-2">
            <p className="text-xs text-dimGray mb-1">Your submission link will be:</p>
            <p className="text-sm font-mono text-violet">
              gifstrem.com/{form.slug || 'your-slug'}
            </p>
          </div>
          <span className="text-xs text-dimGray mt-1 block">
            You'll use this slug to login and share with viewers
          </span>
        </label>
        <label className="block text-sm font-semibold text-coolGray">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none"
            value={form.password}
            onChange={(event) => {
              const sanitized = sanitizeText(event.target.value);
              if (validateInput(sanitized)) {
                setForm((prev) => ({ ...prev, password: sanitized }));
              }
            }}
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-btn bg-violet py-[10px] px-5 font-semibold text-white hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
        <p className="text-center text-sm text-coolGray">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-violet hover:text-softViolet font-semibold" onClick={handleLoginLinkClick}>
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
};

export default SignupPage;
