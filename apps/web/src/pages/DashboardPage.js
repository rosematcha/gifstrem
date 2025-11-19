import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { clearToken } from '../lib/auth';
import { Link, useNavigate } from 'react-router-dom';
import { SafeZoneEditor } from '../components/SafeZoneEditor';
const RESOLUTION_SPECS = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '2160p': { width: 3840, height: 2160 },
};
const DEFAULT_RESOLUTION = '1080p';
const RESOLUTION_OPTIONS = ['720p', '1080p', '2160p', 'custom'];
const MAX_SAFE_ZONES = 6;
const createDefaultZone = (spec) => ({
    x: Math.round(spec.width * 0.05),
    y: Math.round(spec.height * 0.05),
    width: Math.round(spec.width * 0.6),
    height: Math.round(spec.height * 0.6),
});
const DashboardPage = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [activeResolution, setActiveResolution] = useState(DEFAULT_RESOLUTION);
    const [customResolution, setCustomResolution] = useState({
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
            const response = await api.get('/settings');
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
        if (!pref)
            return;
        if (pref === 'custom') {
            if (userData?.settings?.customResolution) {
                setCustomResolution(userData.settings.customResolution);
            }
            setActiveResolution('custom');
            return;
        }
        if (pref in RESOLUTION_SPECS) {
            setActiveResolution(pref);
        }
        else {
            setActiveResolution(DEFAULT_RESOLUTION);
        }
    }, [userData?.settings?.preferredResolution, userData?.settings?.customResolution]);
    const pendingQuery = useQuery({
        queryKey: ['pending'],
        queryFn: async () => {
            const response = await api.get('/submissions/pending');
            return response.data.submissions;
        },
        enabled: Boolean(userData),
    });
    const approvedQuery = useQuery({
        queryKey: ['approved'],
        queryFn: async () => {
            const response = await api.get('/submissions/approved');
            return response.data.submissions;
        },
        enabled: Boolean(userData),
    });
    const [zones, setZones] = useState(() => [createDefaultZone(RESOLUTION_SPECS['1080p'])]);
    const [activeZoneIndex, setActiveZoneIndex] = useState(0);
    const currentResolutionSpec = useMemo(() => (activeResolution === 'custom' ? customResolution : RESOLUTION_SPECS[activeResolution]), [activeResolution, customResolution]);
    useEffect(() => {
        if (!userData)
            return;
        const settings = userData.settings;
        const key = settings?.safeZones?.[activeResolution];
        const legacyZone = key ? key.zone : undefined;
        const keyZones = key && Array.isArray(key.zones) && key.zones.length > 0
            ? key.zones
            : legacyZone
                ? [legacyZone]
                : null;
        if (key && keyZones) {
            setZones(keyZones.map((zone) => ({ ...zone })));
            setActiveZoneIndex((prev) => Math.min(prev, keyZones.length - 1));
            setSafeZoneEnabled(key.enabled ?? true);
            return;
        }
        const spec = currentResolutionSpec;
        setZones([createDefaultZone(spec)]);
        setActiveZoneIndex(0);
        setSafeZoneEnabled(true);
    }, [activeResolution, currentResolutionSpec, userData]);
    const reviewMutation = useMutation({
        mutationFn: async ({ id, action }) => {
            const response = await api.post(`/submissions/${id}/review`, { action });
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
                zones,
                enabled: safeZoneEnabled,
            };
            const response = await api.put('/settings/safe-zone', payload);
            return response.data.user;
        },
        onSuccess: (user) => {
            queryClient.setQueryData(['me'], user);
        },
    });
    const toggleSafeZoneMutation = useMutation({
        mutationFn: async (show) => {
            const response = await api.put('/settings/show-safe-zone', { show });
            return response.data.user;
        },
        onSuccess: (user) => {
            queryClient.setQueryData(['me'], user);
        },
    });
    const resolutionMutation = useMutation({
        mutationFn: async (input) => {
            const response = await api.put('/settings/resolution', input);
            return response.data.user;
        },
        onSuccess: (user) => {
            queryClient.setQueryData(['me'], user);
        },
    });
    const handleZoneChange = (index, zone) => {
        setZones((prev) => prev.map((entry, idx) => (idx === index ? zone : entry)));
    };
    const handleAddZone = () => {
        setZones((prev) => {
            if (prev.length >= MAX_SAFE_ZONES)
                return prev;
            const next = [...prev, createDefaultZone(currentResolutionSpec)];
            setActiveZoneIndex(next.length - 1);
            return next;
        });
    };
    const handleRemoveZone = (index) => {
        setZones((prev) => {
            if (prev.length <= 1)
                return prev;
            const next = prev.filter((_, idx) => idx !== index);
            setActiveZoneIndex((current) => {
                if (current === index) {
                    return Math.max(0, Math.min(index - 1, next.length - 1));
                }
                if (current > index) {
                    return Math.max(0, current - 1);
                }
                return Math.min(current, next.length - 1);
            });
            return next;
        });
    };
    const overlayUrl = useMemo(() => {
        if (!userData)
            return '';
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
        return _jsx("div", { className: "p-l text-center text-white", children: "Loading dashboard..." });
    }
    return (_jsxs("div", { className: "min-h-screen bg-charcoal text-white", children: [_jsx("header", { className: "border-b border-slate/30 px-4 py-4 md:px-6", children: _jsxs("div", { className: "mx-auto flex max-w-7xl items-center justify-between gap-4", children: [_jsxs(Link, { to: "/", className: "font-display text-xl md:text-2xl hover:text-softViolet shrink-0", children: [_jsx("span", { className: "text-white", children: "GIF" }), _jsx("span", { className: "text-violet", children: "strem" })] }), _jsxs("div", { className: "flex-1 text-center min-w-0", children: [_jsx("p", { className: "text-xs md:text-sm text-dimGray", children: "Logged in as" }), _jsx("h2", { className: "text-base md:text-2xl font-semibold truncate", children: userData.displayName })] }), _jsx("div", { className: "flex gap-2 md:gap-4 text-xs md:text-sm shrink-0", children: _jsx("button", { className: "text-violet hover:text-softViolet font-semibold", onClick: () => {
                                    clearToken();
                                    navigate('/auth/login');
                                }, children: "Log out" }) })] }) }), _jsx("div", { className: "md:hidden mx-4 mt-4 rounded-btn bg-violet/10 border border-violet/30 p-3 text-sm", children: _jsxs("p", { className: "text-coolGray", children: ["\uD83D\uDCA1 ", _jsx("span", { className: "font-semibold text-white", children: "Mobile Mode:" }), " Approve or deny submissions on the go. For safe zone settings and more options, visit the desktop dashboard."] }) }), _jsx("section", { className: "mx-auto px-4 py-6 md:px-6 md:py-10 max-w-7xl", children: _jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_420px]", children: [_jsxs("div", { className: "space-y-6 min-w-0", children: [_jsxs("div", { className: "rounded-card border border-slate/30 bg-graphite p-4 md:p-l shadow-low", children: [_jsx("h2", { className: "text-lg font-semibold", children: "Pending submissions" }), pendingQuery.isLoading && _jsx("p", { className: "mt-4 text-sm text-coolGray", children: "Loading queue..." }), _jsxs("div", { className: "mt-4 space-y-4", children: [(pendingQuery.data ?? []).map((submission) => (_jsx("div", { className: "rounded-card border border-slate/30 bg-charcoal p-3 md:p-m", children: _jsxs("div", { className: "flex flex-col gap-3", children: [_jsx("img", { src: submission.fileUrl, alt: submission.fileName, loading: "lazy", className: "aspect-video w-full rounded-btn object-cover object-center" }), _jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "font-semibold truncate", children: submission.uploaderName }), _jsxs("p", { className: "text-xs text-dimGray", children: [new Date(submission.createdAt).toLocaleString(), " \u00B7 ", (submission.fileSize / (1024 * 1024)).toFixed(2), " MB"] })] }), _jsxs("div", { className: "flex gap-2 shrink-0", children: [_jsx("button", { className: "flex-1 sm:flex-initial rounded-btn border border-coral/40 px-4 py-2 text-sm font-semibold text-white hover:bg-coral/20 active:bg-coral/30", onClick: () => reviewMutation.mutate({ id: submission.id, action: 'deny' }), children: "Deny" }), _jsx("button", { className: "flex-1 sm:flex-initial rounded-btn border border-emerald/40 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald/20 active:bg-emerald/30", onClick: () => reviewMutation.mutate({ id: submission.id, action: 'approve' }), children: "Approve" })] })] }), submission.message && _jsxs("p", { className: "text-sm text-coolGray", children: ["\"", submission.message, "\""] })] }) }, submission.id))), (pendingQuery.data ?? []).length === 0 && (_jsx("p", { className: "text-sm text-dimGray", children: "Queue is clear. Share your link to collect more GIFs." }))] })] }), _jsxs("div", { className: "rounded-card border border-slate/30 bg-graphite p-4 md:p-l shadow-low", children: [_jsx("h2", { className: "text-lg font-semibold", children: "Approved & live" }), _jsxs("div", { className: "mt-4 grid gap-3 sm:grid-cols-2", children: [(approvedQuery.data ?? []).map((submission) => (_jsx("div", { className: "rounded-card border border-slate/30 bg-charcoal p-3 text-sm", children: _jsxs("div", { className: "flex flex-col gap-3", children: [_jsx("img", { src: submission.fileUrl, alt: submission.fileName, loading: "lazy", className: "aspect-video w-full rounded-btn object-cover object-center" }), _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "font-semibold truncate", children: submission.uploaderName }), _jsxs("p", { className: "text-xs text-dimGray", children: ["Expires ", new Date(submission.expiresAt).toLocaleTimeString()] })] }), _jsx("button", { className: "rounded-btn border border-cyan/40 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan/20 active:bg-cyan/30 shrink-0", onClick: () => reviewMutation.mutate({ id: submission.id, action: 'deny' }), children: "Remove" })] })] }) }, submission.id))), (approvedQuery.data ?? []).length === 0 && (_jsx("p", { className: "text-sm text-dimGray", children: "No active GIFs yet." }))] })] })] }), _jsxs("div", { className: "hidden lg:block space-y-6 w-full", children: [_jsxs("div", { className: "rounded-card border border-slate/30 bg-graphite p-l shadow-low", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("h3", { className: "text-lg font-semibold", children: "Safe zone" }), _jsxs("label", { className: "flex items-center gap-2 text-xs text-coolGray cursor-pointer", title: "Enforce safe zone boundaries", children: [_jsx("input", { type: "checkbox", checked: safeZoneEnabled, onChange: (event) => setSafeZoneEnabled(event.target.checked), className: "h-4 w-4 rounded border border-slate bg-charcoal accent-violet cursor-pointer" }), "Enforce"] })] }), _jsx("button", { onClick: () => {
                                                        const newValue = !showSafeZoneOverlay;
                                                        setShowSafeZoneOverlay(newValue);
                                                        toggleSafeZoneMutation.mutate(newValue);
                                                    }, className: "rounded-btn border border-slate p-2 hover:border-violet hover:bg-slate/30", title: showSafeZoneOverlay ? "Hide safe zone overlay on stream" : "Show safe zone overlay on stream", children: showSafeZoneOverlay ? (_jsxs("svg", { className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: [_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" }), _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" })] })) : (_jsx("svg", { className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" }) })) })] }), _jsx("div", { className: "mt-3 flex flex-wrap gap-2 text-xs", children: RESOLUTION_OPTIONS.map((resolution) => (_jsx("button", { onClick: () => {
                                                    setActiveResolution(resolution);
                                                    resolutionMutation.mutate({
                                                        resolution,
                                                        customSize: resolution === 'custom' ? customResolution : undefined,
                                                    });
                                                }, className: `rounded-btn px-3 py-1 font-semibold ${activeResolution === resolution
                                                    ? 'bg-violet text-white'
                                                    : 'bg-charcoal border border-slate text-coolGray hover:border-violet'}`, children: resolution === 'custom' ? 'Custom' : resolution }, resolution))) }), activeResolution === 'custom' && (_jsxs("div", { className: "mt-3 space-y-3 rounded-card border border-slate bg-charcoal p-3 text-xs", children: [_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs("label", { className: "flex flex-col gap-1", children: ["Width (px)", _jsx("input", { type: "number", min: 640, className: "rounded-btn border border-slate bg-graphite px-2 py-1 text-white focus:border-violet focus:outline-none", value: customResolution.width, onChange: (event) => setCustomResolution((prev) => ({
                                                                        ...prev,
                                                                        width: Number(event.target.value) || prev.width,
                                                                    })) })] }), _jsxs("label", { className: "flex flex-col gap-1", children: ["Height (px)", _jsx("input", { type: "number", min: 360, className: "rounded-btn border border-slate bg-graphite px-2 py-1 text-white focus:border-violet focus:outline-none", value: customResolution.height, onChange: (event) => setCustomResolution((prev) => ({
                                                                        ...prev,
                                                                        height: Number(event.target.value) || prev.height,
                                                                    })) })] })] }), _jsx("button", { className: "w-full rounded-btn border border-slate py-1 font-semibold hover:border-violet hover:bg-slate/30", onClick: () => resolutionMutation.mutate({
                                                        resolution: 'custom',
                                                        customSize: customResolution,
                                                    }), disabled: resolutionMutation.isPending, children: resolutionMutation.isPending ? 'Saving…' : 'Save custom resolution' })] })), _jsxs("div", { className: "mt-4 space-y-3", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 text-xs", children: [_jsx("div", { className: "flex flex-wrap gap-2", children: zones.map((_, index) => {
                                                                const isActive = index === activeZoneIndex;
                                                                return (_jsxs("div", { className: `flex items-center gap-1 rounded-btn border px-2 py-1 ${isActive ? 'border-violet bg-violet/10 text-white' : 'border-slate text-coolGray'}`, children: [_jsxs("button", { type: "button", onClick: () => setActiveZoneIndex(index), className: "font-semibold", children: ["Zone ", index + 1] }), zones.length > 1 && (_jsx("button", { type: "button", className: "ml-1 text-xs text-dimGray hover:text-coral", "aria-label": `Remove zone ${index + 1}`, onClick: () => handleRemoveZone(index), children: "\u00D7" }))] }, `zone-chip-${index}`));
                                                            }) }), zones.length < MAX_SAFE_ZONES && (_jsx("button", { type: "button", onClick: handleAddZone, disabled: !safeZoneEnabled, className: "rounded-btn border border-dashed border-slate px-3 py-1 font-semibold text-coolGray hover:border-violet hover:text-white disabled:opacity-50", children: "+ Add zone" }))] }), safeZoneEnabled ? (_jsx(SafeZoneEditor, { resolution: currentResolutionSpec, zones: zones, activeIndex: activeZoneIndex, onZoneChange: handleZoneChange, onSelectZone: setActiveZoneIndex })) : (_jsx("p", { className: "rounded-btn border border-cyan/40 bg-cyan/10 p-4 text-sm text-coolGray", children: "Safe zone is disabled for this resolution. Enable it above if you want to edit the protected area." }))] }), _jsx("p", { className: "mt-2 text-xs text-dimGray", children: "Drag the highlighted boxes to keep your drawing area clear. Corner handles resize each safe zone, and you can add multiple boxes to protect different parts of your overlay." }), _jsx("button", { className: "mt-4 w-full rounded-btn bg-violet py-[10px] text-sm font-semibold hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-60", onClick: () => safeZoneMutation.mutate(), disabled: safeZoneMutation.isPending, children: safeZoneMutation.isPending ? 'Saving…' : 'Save safe zones' })] }), _jsxs("div", { className: "rounded-card border border-slate/30 bg-graphite p-l shadow-low text-sm", children: [_jsx("h3", { className: "text-lg font-semibold", children: "Links" }), _jsxs("div", { className: "mt-2", children: [_jsx("p", { className: "text-coolGray", children: "Submission URL" }), _jsxs("div", { className: "mt-1 flex gap-2", children: [_jsx("code", { className: "flex-1 truncate rounded-btn bg-charcoal border border-slate p-2 text-xs", children: submissionUrl }), _jsx("button", { className: "rounded-btn border border-slate px-2 py-2 hover:border-violet hover:bg-slate/30", title: "Copy submission URL", onClick: async () => {
                                                                try {
                                                                    await navigator.clipboard.writeText(submissionUrl);
                                                                    setCopiedSubmission(true);
                                                                    setTimeout(() => setCopiedSubmission(false), 2000);
                                                                }
                                                                catch (error) {
                                                                    console.error('Clipboard error', error);
                                                                }
                                                            }, children: copiedSubmission ? (_jsx("svg", { className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 13l4 4L19 7" }) })) : (_jsx("svg", { className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" }) })) })] })] }), _jsxs("div", { className: "mt-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsx("p", { className: "text-coolGray", children: "Overlay URL" }), _jsx("button", { className: "text-xs text-violet hover:text-softViolet font-semibold", onClick: () => setShowOverlayUrl(!showOverlayUrl), children: showOverlayUrl ? 'Hide' : 'Show' })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("code", { className: "flex-1 rounded-btn bg-charcoal border border-slate p-2 text-xs select-none overflow-hidden", children: _jsx("span", { className: `block truncate transition-all duration-200 ${showOverlayUrl ? '' : 'blur-sm'}`, children: overlayUrl }) }), _jsx("button", { className: "rounded-btn border border-slate px-2 py-2 hover:border-violet hover:bg-slate/30", title: "Copy overlay URL", onClick: async () => {
                                                                try {
                                                                    await navigator.clipboard.writeText(overlayUrl);
                                                                    setCopiedOverlay(true);
                                                                    setTimeout(() => setCopiedOverlay(false), 2000);
                                                                }
                                                                catch (error) {
                                                                    console.error('Clipboard error', error);
                                                                }
                                                            }, children: copiedOverlay ? (_jsx("svg", { className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 13l4 4L19 7" }) })) : (_jsx("svg", { className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" }) })) })] })] })] })] })] }) })] }));
};
export default DashboardPage;
