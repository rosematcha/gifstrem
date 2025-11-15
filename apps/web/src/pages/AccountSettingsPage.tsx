import { FormEvent, useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { clearToken } from '../lib/auth';
import { sanitizeDisplayName, sanitizeSlug, sanitizeText, validateInput } from '../lib/sanitize';
import type { Streamer } from '../types';

const AccountSettingsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [profileForm, setProfileForm] = useState({
    displayName: '',
    slug: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const { data: userData, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await api.get<{ user: Streamer }>('/settings');
      return response.data.user;
    },
  });

  // Initialize form when user data loads
  useEffect(() => {
    if (userData) {
      setProfileForm({
        displayName: userData.displayName,
        slug: userData.slug,
      });
    }
  }, [userData]);

  const profileMutation = useMutation({
    mutationFn: async (data: { displayName: string; slug: string }) => {
      const response = await api.put<{ user: Streamer }>('/settings/profile', data);
      return response.data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      setProfileSuccess(true);
      setProfileError(null);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? 'Failed to update profile';
      setProfileError(message);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      await api.put('/settings/password', data);
    },
    onSuccess: () => {
      setPasswordSuccess(true);
      setPasswordError(null);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPasswordSuccess(false), 3000);
    },
    onError: (error: any) => {
      const message = error.response?.data?.error ?? 'Failed to update password';
      setPasswordError(message);
    },
  });

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setProfileError(null);
    profileMutation.mutate(profileForm);
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    passwordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  const handleLogout = () => {
    clearToken();
    navigate('/auth/login');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-charcoal text-white">
        <p className="text-coolGray">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal text-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/dashboard" className="font-display text-4xl hover:text-softViolet">
            <span className="text-white">GIF</span>
            <span className="text-violet">strem</span>
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-btn bg-slate px-4 py-2 text-sm font-semibold hover:bg-coolGray"
          >
            Logout
          </button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Account Settings</h1>
          <p className="text-coolGray">Manage your profile and security settings</p>
        </div>

        <div className="space-y-6">
          {/* Profile Settings */}
          <div className="rounded-modal bg-graphite border border-slate/30 p-l shadow-medium">
            <h2 className="text-xl font-semibold mb-4">Profile Information</h2>
            <form onSubmit={handleProfileSubmit} className="space-y-m">
              {profileError && (
                <p className="rounded-btn bg-coral/20 border border-coral/40 p-2 text-sm text-white">
                  {profileError}
                </p>
              )}
              {profileSuccess && (
                <p className="rounded-btn bg-green-500/20 border border-green-500/40 p-2 text-sm text-white">
                  Profile updated successfully!
                </p>
              )}
              <label className="block text-sm font-semibold text-coolGray">
                Your name
                <input
                  type="text"
                  className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none"
                  value={profileForm.displayName}
                  onChange={(event) => {
                    const sanitized = sanitizeDisplayName(event.target.value);
                    if (validateInput(sanitized)) {
                      setProfileForm((prev) => ({ ...prev, displayName: sanitized }));
                    }
                  }}
                  onBlur={() => {
                    const sanitized = sanitizeDisplayName(profileForm.displayName);
                    if (sanitized !== profileForm.displayName) {
                      setProfileForm((prev) => ({ ...prev, displayName: sanitized }));
                    }
                  }}
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-coolGray">
                URL slug
                <input
                  type="text"
                  className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray lowercase focus:border-violet focus:outline-none"
                  value={profileForm.slug}
                  onChange={(event) => {
                    const sanitized = sanitizeSlug(event.target.value.toLowerCase());
                    if (validateInput(sanitized)) {
                      setProfileForm((prev) => ({ ...prev, slug: sanitized }));
                    }
                  }}
                  onBlur={() => {
                    const sanitized = sanitizeSlug(profileForm.slug);
                    if (sanitized !== profileForm.slug) {
                      setProfileForm((prev) => ({ ...prev, slug: sanitized }));
                    }
                  }}
                  required
                />
                <div className="mt-2 rounded-btn bg-charcoal border border-slate/30 p-2">
                  <p className="text-xs text-dimGray mb-1">Your submission link will be:</p>
                  <p className="text-sm font-mono text-violet">
                    gifstrem.com/{profileForm.slug || 'your-slug'}
                  </p>
                </div>
                <span className="text-xs text-dimGray mt-1 block">
                  This is used for login and your submission link
                </span>
              </label>
              <button
                type="submit"
                disabled={profileMutation.isPending}
                className="rounded-btn bg-violet py-2 px-5 font-semibold text-white hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-50"
              >
                {profileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* Password Settings */}
          <div className="rounded-modal bg-graphite border border-slate/30 p-l shadow-medium">
            <h2 className="text-xl font-semibold mb-4">Change Password</h2>
            <form onSubmit={handlePasswordSubmit} className="space-y-m">
              {passwordError && (
                <p className="rounded-btn bg-coral/20 border border-coral/40 p-2 text-sm text-white">
                  {passwordError}
                </p>
              )}
              {passwordSuccess && (
                <p className="rounded-btn bg-green-500/20 border border-green-500/40 p-2 text-sm text-white">
                  Password updated successfully!
                </p>
              )}
              <label className="block text-sm font-semibold text-coolGray">
                Current password
                <input
                  type="password"
                  className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none"
                  value={passwordForm.currentPassword}
                  onChange={(event) => {
                    const sanitized = sanitizeText(event.target.value);
                    if (validateInput(sanitized)) {
                      setPasswordForm((prev) => ({ ...prev, currentPassword: sanitized }));
                    }
                  }}
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-coolGray">
                New password
                <input
                  type="password"
                  className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none"
                  value={passwordForm.newPassword}
                  onChange={(event) => {
                    const sanitized = sanitizeText(event.target.value);
                    if (validateInput(sanitized)) {
                      setPasswordForm((prev) => ({ ...prev, newPassword: sanitized }));
                    }
                  }}
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-coolGray">
                Confirm new password
                <input
                  type="password"
                  className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => {
                    const sanitized = sanitizeText(event.target.value);
                    if (validateInput(sanitized)) {
                      setPasswordForm((prev) => ({ ...prev, confirmPassword: sanitized }));
                    }
                  }}
                  required
                />
              </label>
              <button
                type="submit"
                disabled={passwordMutation.isPending}
                className="rounded-btn bg-violet py-2 px-5 font-semibold text-white hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-50"
              >
                {passwordMutation.isPending ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>

          {/* Navigation */}
          <div className="pt-4">
            <Link
              to="/dashboard"
              className="inline-flex items-center text-violet hover:text-softViolet font-semibold"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSettingsPage;
