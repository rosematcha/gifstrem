import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Streamer, Submission } from '../types';
import { clearToken } from '../lib/auth';
import { Link, useNavigate } from 'react-router-dom';
import { SafeZoneEditor } from '../components/SafeZoneEditor';

const RESOLUTION_SPECS = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2160p': { width: 3840, height: 2160 },
} as const;

type ResolutionOption = keyof typeof RESOLUTION_SPECS | 'custom';
const DEFAULT_RESOLUTION: ResolutionOption = '1080p';
const RESOLUTION_OPTIONS: ResolutionOption[] = ['720p', '1080p', '2160p', 'custom'];

const DashboardPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeResolution, setActiveResolution] = useState<ResolutionOption>(DEFAULT_RESOLUTION);
  const [customResolution, setCustomResolution] = useState<{ width: number; height: number }>({
    width: RESOLUTION_SPECS['1080p'].width,
    height: RESOLUTION_SPECS['1080p'].height,
  });
  const [showSafeZoneOverlay, setShowSafeZoneOverlay] = useState(false);
  const [safeZoneEnabled, setSafeZoneEnabled] = useState(true);
  const [showOverlayUrl, setShowOverlayUrl] = useState(false);
  const [copiedSubmission, setCopiedSubmission] = useState(false);
  const [copiedOverlay, setCopiedOverlay] = useState(false);

  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await api.get<{ user: Streamer }>('/settings');
      return response.data.user;
    },
  });

  useEffect(() => {
    if (userData?.settings?.showSafeZoneOverlay !== undefined) {
      setShowSafeZoneOverlay(userData.settings.showSafeZoneOverlay);
    }
  }, [userData?.settings?.showSafeZoneOverlay]);

  useEffect(() => {
    const pref = userData?.settings?.preferredResolution;
    if (!pref) return;
    if (pref === 'custom') {
      if (userData?.settings?.customResolution) {
        setCustomResolution(userData.settings.customResolution);
      }
      setActiveResolution('custom');
      return;
    }
    if (pref in RESOLUTION_SPECS) {
      setActiveResolution(pref as ResolutionOption);
    } else {
      setActiveResolution(DEFAULT_RESOLUTION);
    }
  }, [userData?.settings?.preferredResolution, userData?.settings?.customResolution]);

  const pendingQuery = useQuery({
    queryKey: ['pending'],
    queryFn: async () => {
      const response = await api.get<{ submissions: Submission[] }>('/submissions/pending');
      return response.data.submissions;
    },
    enabled: Boolean(userData),
  });

  const approvedQuery = useQuery({
    queryKey: ['approved'],
    queryFn: async () => {
      const response = await api.get<{ submissions: Submission[] }>('/submissions/approved');
      return response.data.submissions;
    },
    enabled: Boolean(userData),
  });

  const [zoneForm, setZoneForm] = useState<{ x: number; y: number; width: number; height: number }>(() => ({
    x: 80,
    y: 80,
    width: 960,
    height: 540,
  }));

  const currentResolutionSpec = useMemo(
    () => (activeResolution === 'custom' ? customResolution : RESOLUTION_SPECS[activeResolution]),
    [activeResolution, customResolution],
  );

  useEffect(() => {
    if (!userData) return;
    const settings = userData.settings;
    const key = settings?.safeZones?.[activeResolution];
    if (key) {
      setZoneForm(key.zone);
      setSafeZoneEnabled(key.enabled ?? true);
    } else {
      const spec = currentResolutionSpec;
      setZoneForm({
        x: Math.round(spec.width * 0.05),
        y: Math.round(spec.height * 0.05),
        width: Math.round(spec.width * 0.6),
        height: Math.round(spec.height * 0.6),
      });
      setSafeZoneEnabled(true);
    }
  }, [activeResolution, currentResolutionSpec, userData]);

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'deny' }) => {
      const response = await api.post<{ submission: Submission }>(`/submissions/${id}/review`, { action });
      return response.data.submission;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending'] });
      void queryClient.invalidateQueries({ queryKey: ['approved'] });
    },
  });

  const safeZoneMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        resolution: activeResolution,
        size: currentResolutionSpec,
        zone: zoneForm,
        enabled: safeZoneEnabled,
      };
      const response = await api.put<{ user: Streamer }>('/settings/safe-zone', payload);
      return response.data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
    },
  });

  const toggleSafeZoneMutation = useMutation({
    mutationFn: async (show: boolean) => {
      const response = await api.put<{ user: Streamer }>('/settings/show-safe-zone', { show });
      return response.data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
    },
  });

  const resolutionMutation = useMutation({
    mutationFn: async (input: { resolution: ResolutionOption; customSize?: { width: number; height: number } }) => {
      const response = await api.put<{ user: Streamer }>('/settings/resolution', input);
      return response.data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
    },
  });

  const overlayUrl = useMemo(() => {
    if (!userData) return '';
    const base = window.location.origin;
    const params = new URLSearchParams({
      token: userData.overlayToken,
    });
    return `${base}/overlay?${params.toString()}`;
  }, [userData]);

  const submissionUrl = useMemo(() => {
    const base = window.location.origin;
    return `${base}/${userData?.slug ?? ''}`;
  }, [userData]);

  if (!userData) {
    return <div className="p-l text-center text-white">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-charcoal text-white">
      {/* Mobile-first header */}
      <header className="border-b border-slate/30 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link to="/" className="font-display text-xl md:text-2xl hover:text-softViolet shrink-0">
            <span className="text-white">GIF</span>
            <span className="text-violet">strem</span>
          </Link>
          <div className="flex-1 text-center min-w-0">
            <p className="text-xs md:text-sm text-dimGray">Logged in as</p>
            <h2 className="text-base md:text-2xl font-semibold truncate">{userData.displayName}</h2>
          </div>
          <div className="flex gap-2 md:gap-4 text-xs md:text-sm shrink-0">
            {/* <Link className="hidden md:inline text-violet hover:text-softViolet font-semibold" to="/settings">
              Settings
            </Link> */}
            <button
              className="text-violet hover:text-softViolet font-semibold"
              onClick={() => {
                clearToken();
                navigate('/auth/login');
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile note */}
      <div className="md:hidden mx-4 mt-4 rounded-btn bg-violet/10 border border-violet/30 p-3 text-sm">
        <p className="text-coolGray">
          💡 <span className="font-semibold text-white">Mobile Mode:</span> Approve or deny submissions on the go. 
          For safe zone settings and more options, visit the desktop dashboard.
        </p>
      </div>

      <section className="mx-auto px-4 py-6 md:px-6 md:py-10 max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          {/* Main content - visible on all devices */}
          <div className="space-y-6 min-w-0">{/* Pending submissions */}
            <div className="rounded-card border border-slate/30 bg-graphite p-4 md:p-l shadow-low">
              <h2 className="text-lg font-semibold">Pending submissions</h2>
              {pendingQuery.isLoading && <p className="mt-4 text-sm text-coolGray">Loading queue...</p>}
              <div className="mt-4 space-y-4">
                {(pendingQuery.data ?? []).map((submission) => (
                  <div key={submission.id} className="rounded-card border border-slate/30 bg-charcoal p-3 md:p-m">
                    <div className="flex flex-col gap-3">
                      <img
                        src={submission.fileUrl}
                        alt={submission.fileName}
                        loading="lazy"
                        className="aspect-video w-full rounded-btn object-cover object-center"
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{submission.uploaderName}</p>
                          <p className="text-xs text-dimGray">
                            {new Date(submission.createdAt).toLocaleString()} · {(submission.fileSize / (1024 * 1024)).toFixed(2)} MB
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            className="flex-1 sm:flex-initial rounded-btn border border-coral/40 px-4 py-2 text-sm font-semibold text-white hover:bg-coral/20 active:bg-coral/30"
                            onClick={() => reviewMutation.mutate({ id: submission.id, action: 'deny' })}
                          >
                            Deny
                          </button>
                          <button
                            className="flex-1 sm:flex-initial rounded-btn border border-emerald/40 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald/20 active:bg-emerald/30"
                            onClick={() => reviewMutation.mutate({ id: submission.id, action: 'approve' })}
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                      {submission.message && <p className="text-sm text-coolGray">"{submission.message}"</p>}
                    </div>
                  </div>
                ))}
                {(pendingQuery.data ?? []).length === 0 && (
                  <p className="text-sm text-dimGray">Queue is clear. Share your link to collect more GIFs.</p>
                )}
              </div>
            </div>

            {/* Approved submissions */}
            <div className="rounded-card border border-slate/30 bg-graphite p-4 md:p-l shadow-low">
              <h2 className="text-lg font-semibold">Approved & live</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(approvedQuery.data ?? []).map((submission) => (
                  <div key={submission.id} className="rounded-card border border-slate/30 bg-charcoal p-3 text-sm">
                    <div className="flex flex-col gap-3">
                      <img
                        src={submission.fileUrl}
                        alt={submission.fileName}
                        loading="lazy"
                        className="aspect-video w-full rounded-btn object-cover object-center"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{submission.uploaderName}</p>
                          <p className="text-xs text-dimGray">
                            Expires {new Date(submission.expiresAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <button
                          className="rounded-btn border border-cyan/40 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan/20 active:bg-cyan/30 shrink-0"
                          onClick={() => reviewMutation.mutate({ id: submission.id, action: 'deny' })}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {(approvedQuery.data ?? []).length === 0 && (
                  <p className="text-sm text-dimGray">No active GIFs yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar - hidden on mobile, visible on desktop */}
          <div className="hidden lg:block space-y-6 w-full">{/* Safe zone settings */}
            <div className="rounded-card border border-slate/30 bg-graphite p-l shadow-low">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">Safe zone</h3>
                  <label className="flex items-center gap-2 text-xs text-coolGray cursor-pointer" title="Enforce safe zone boundaries">
                    <input
                      type="checkbox"
                      checked={safeZoneEnabled}
                      onChange={(event) => setSafeZoneEnabled(event.target.checked)}
                      className="h-4 w-4 rounded border border-slate bg-charcoal accent-violet cursor-pointer"
                    />
                    Enforce
                  </label>
                </div>
                <button
                  onClick={() => {
                    const newValue = !showSafeZoneOverlay;
                    setShowSafeZoneOverlay(newValue);
                    toggleSafeZoneMutation.mutate(newValue);
                  }}
                  className="rounded-btn border border-slate p-2 hover:border-violet hover:bg-slate/30"
                  title={showSafeZoneOverlay ? "Hide safe zone overlay on stream" : "Show safe zone overlay on stream"}
                >
                  {showSafeZoneOverlay ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {RESOLUTION_OPTIONS.map((resolution) => (
                  <button
                    key={resolution}
                    onClick={() => {
                      setActiveResolution(resolution);
                      resolutionMutation.mutate({
                        resolution,
                        customSize: resolution === 'custom' ? customResolution : undefined,
                      });
                    }}
                    className={`rounded-btn px-3 py-1 font-semibold ${
                      activeResolution === resolution
                        ? 'bg-violet text-white'
                        : 'bg-charcoal border border-slate text-coolGray hover:border-violet'
                    }`}
                  >
                    {resolution === 'custom' ? 'Custom' : resolution}
                  </button>
                ))}
              </div>
              {activeResolution === 'custom' && (
                <div className="mt-3 space-y-3 rounded-card border border-slate bg-charcoal p-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      Width (px)
                      <input
                        type="number"
                        min={640}
                        className="rounded-btn border border-slate bg-graphite px-2 py-1 text-white focus:border-violet focus:outline-none"
                        value={customResolution.width}
                        onChange={(event) =>
                          setCustomResolution((prev) => ({
                            ...prev,
                            width: Number(event.target.value) || prev.width,
                          }))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Height (px)
                      <input
                        type="number"
                        min={360}
                        className="rounded-btn border border-slate bg-graphite px-2 py-1 text-white focus:border-violet focus:outline-none"
                        value={customResolution.height}
                        onChange={(event) =>
                          setCustomResolution((prev) => ({
                            ...prev,
                            height: Number(event.target.value) || prev.height,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <button
                    className="w-full rounded-btn border border-slate py-1 font-semibold hover:border-violet hover:bg-slate/30"
                    onClick={() =>
                      resolutionMutation.mutate({
                        resolution: 'custom',
                        customSize: customResolution,
                      })
                    }
                    disabled={resolutionMutation.isPending}
                  >
                    {resolutionMutation.isPending ? 'Saving…' : 'Save custom resolution'}
                  </button>
                </div>
              )}
              <div className="mt-4">
                {safeZoneEnabled ? (
                  <SafeZoneEditor resolution={currentResolutionSpec} zone={zoneForm} onChange={setZoneForm} />
                ) : (
                  <p className="rounded-btn border border-cyan/40 bg-cyan/10 p-4 text-sm text-coolGray">
                    Safe zone is disabled for this resolution. Enable it above if you want to edit the protected area.
                  </p>
                )}
              </div>
              <p className="mt-2 text-xs text-dimGray">
                Drag the green box to keep your drawing area clear. Corner handles resize it.
              </p>
              <button
                className="mt-4 w-full rounded-btn bg-violet py-[10px] text-sm font-semibold hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-60"
                onClick={() => safeZoneMutation.mutate()}
                disabled={safeZoneMutation.isPending}
              >
                {safeZoneMutation.isPending ? 'Saving…' : 'Save safe zone'}
              </button>
            </div>

            {/* Links section */}
            <div className="rounded-card border border-slate/30 bg-graphite p-l shadow-low text-sm">
              <h3 className="text-lg font-semibold">Links</h3>
              <div className="mt-2">
                <p className="text-coolGray">Submission URL</p>
                <div className="mt-1 flex gap-2">
                  <code className="flex-1 truncate rounded-btn bg-charcoal border border-slate p-2 text-xs">{submissionUrl}</code>
                  <button
                    className="rounded-btn border border-slate px-2 py-2 hover:border-violet hover:bg-slate/30"
                    title="Copy submission URL"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(submissionUrl);
                        setCopiedSubmission(true);
                        setTimeout(() => setCopiedSubmission(false), 2000);
                      } catch (error) {
                        console.error('Clipboard error', error);
                      }
                    }}
                  >
                    {copiedSubmission ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-coolGray">Overlay URL</p>
                  <button
                    className="text-xs text-violet hover:text-softViolet font-semibold"
                    onClick={() => setShowOverlayUrl(!showOverlayUrl)}
                  >
                    {showOverlayUrl ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <code className="flex-1 rounded-btn bg-charcoal border border-slate p-2 text-xs select-none overflow-hidden">
                    <span className={`block truncate transition-all duration-200 ${showOverlayUrl ? '' : 'blur-sm'}`}>
                      {overlayUrl}
                    </span>
                  </code>
                  <button
                    className="rounded-btn border border-slate px-2 py-2 hover:border-violet hover:bg-slate/30"
                    title="Copy overlay URL"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(overlayUrl);
                        setCopiedOverlay(true);
                        setTimeout(() => setCopiedOverlay(false), 2000);
                      } catch (error) {
                        console.error('Clipboard error', error);
                      }
                    }}
                  >
                    {copiedOverlay ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;
