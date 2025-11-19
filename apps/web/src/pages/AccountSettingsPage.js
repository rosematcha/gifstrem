import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { clearToken } from '../lib/auth';
import { sanitizeDisplayName, sanitizeSlug, sanitizeText, validateInput } from '../lib/sanitize';
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
    const [profileError, setProfileError] = useState(null);
    const [passwordError, setPasswordError] = useState(null);
    const [profileSuccess, setProfileSuccess] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const { data: userData, isLoading } = useQuery({
        queryKey: ['me'],
        queryFn: async () => {
            const response = await api.get('/settings');
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
        mutationFn: async (data) => {
            const response = await api.put('/settings/profile', data);
            return response.data.user;
        },
        onSuccess: (user) => {
            queryClient.setQueryData(['me'], user);
            setProfileSuccess(true);
            setProfileError(null);
            setTimeout(() => setProfileSuccess(false), 3000);
        },
        onError: (error) => {
            const message = error.response?.data?.error ?? 'Failed to update profile';
            setProfileError(message);
        },
    });
    const passwordMutation = useMutation({
        mutationFn: async (data) => {
            await api.put('/settings/password', data);
        },
        onSuccess: () => {
            setPasswordSuccess(true);
            setPasswordError(null);
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => setPasswordSuccess(false), 3000);
        },
        onError: (error) => {
            const message = error.response?.data?.error ?? 'Failed to update password';
            setPasswordError(message);
        },
    });
    const handleProfileSubmit = async (event) => {
        event.preventDefault();
        setProfileError(null);
        profileMutation.mutate(profileForm);
    };
    const handlePasswordSubmit = async (event) => {
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
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-charcoal text-white", children: _jsx("p", { className: "text-coolGray", children: "Loading..." }) }));
    }
    return (_jsx("div", { className: "min-h-screen bg-charcoal text-white", children: _jsxs("div", { className: "mx-auto max-w-4xl px-4 py-8", children: [_jsxs("div", { className: "mb-8 flex items-center justify-between", children: [_jsxs(Link, { to: "/dashboard", className: "font-display text-4xl hover:text-softViolet", children: [_jsx("span", { className: "text-white", children: "GIF" }), _jsx("span", { className: "text-violet", children: "strem" })] }), _jsx("button", { onClick: handleLogout, className: "rounded-btn bg-slate px-4 py-2 text-sm font-semibold hover:bg-coolGray", children: "Logout" })] }), _jsxs("div", { className: "mb-8", children: [_jsx("h1", { className: "text-3xl font-bold mb-2", children: "Account Settings" }), _jsx("p", { className: "text-coolGray", children: "Manage your profile and security settings" })] }), _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "rounded-modal bg-graphite border border-slate/30 p-l shadow-medium", children: [_jsx("h2", { className: "text-xl font-semibold mb-4", children: "Profile Information" }), _jsxs("form", { onSubmit: handleProfileSubmit, className: "space-y-m", children: [profileError && (_jsx("p", { className: "rounded-btn bg-coral/20 border border-coral/40 p-2 text-sm text-white", children: profileError })), profileSuccess && (_jsx("p", { className: "rounded-btn bg-green-500/20 border border-green-500/40 p-2 text-sm text-white", children: "Profile updated successfully!" })), _jsxs("label", { className: "block text-sm font-semibold text-coolGray", children: ["Your name", _jsx("input", { type: "text", className: "mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none", value: profileForm.displayName, onChange: (event) => {
                                                        const sanitized = sanitizeDisplayName(event.target.value);
                                                        if (validateInput(sanitized)) {
                                                            setProfileForm((prev) => ({ ...prev, displayName: sanitized }));
                                                        }
                                                    }, onBlur: () => {
                                                        const sanitized = sanitizeDisplayName(profileForm.displayName);
                                                        if (sanitized !== profileForm.displayName) {
                                                            setProfileForm((prev) => ({ ...prev, displayName: sanitized }));
                                                        }
                                                    }, required: true })] }), _jsxs("label", { className: "block text-sm font-semibold text-coolGray", children: ["URL slug", _jsx("input", { type: "text", className: "mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray lowercase focus:border-violet focus:outline-none", value: profileForm.slug, onChange: (event) => {
                                                        const sanitized = sanitizeSlug(event.target.value.toLowerCase());
                                                        if (validateInput(sanitized)) {
                                                            setProfileForm((prev) => ({ ...prev, slug: sanitized }));
                                                        }
                                                    }, onBlur: () => {
                                                        const sanitized = sanitizeSlug(profileForm.slug);
                                                        if (sanitized !== profileForm.slug) {
                                                            setProfileForm((prev) => ({ ...prev, slug: sanitized }));
                                                        }
                                                    }, required: true }), _jsxs("div", { className: "mt-2 rounded-btn bg-charcoal border border-slate/30 p-2", children: [_jsx("p", { className: "text-xs text-dimGray mb-1", children: "Your submission link will be:" }), _jsxs("p", { className: "text-sm font-mono text-violet", children: ["gifstrem.com/", profileForm.slug || 'your-slug'] })] }), _jsx("span", { className: "text-xs text-dimGray mt-1 block", children: "This is used for login and your submission link" })] }), _jsx("button", { type: "submit", disabled: profileMutation.isPending, className: "rounded-btn bg-violet py-2 px-5 font-semibold text-white hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-50", children: profileMutation.isPending ? 'Saving...' : 'Save Changes' })] })] }), _jsxs("div", { className: "rounded-modal bg-graphite border border-slate/30 p-l shadow-medium", children: [_jsx("h2", { className: "text-xl font-semibold mb-4", children: "Change Password" }), _jsxs("form", { onSubmit: handlePasswordSubmit, className: "space-y-m", children: [passwordError && (_jsx("p", { className: "rounded-btn bg-coral/20 border border-coral/40 p-2 text-sm text-white", children: passwordError })), passwordSuccess && (_jsx("p", { className: "rounded-btn bg-green-500/20 border border-green-500/40 p-2 text-sm text-white", children: "Password updated successfully!" })), _jsxs("label", { className: "block text-sm font-semibold text-coolGray", children: ["Current password", _jsx("input", { type: "password", className: "mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none", value: passwordForm.currentPassword, onChange: (event) => {
                                                        const sanitized = sanitizeText(event.target.value);
                                                        if (validateInput(sanitized)) {
                                                            setPasswordForm((prev) => ({ ...prev, currentPassword: sanitized }));
                                                        }
                                                    }, required: true })] }), _jsxs("label", { className: "block text-sm font-semibold text-coolGray", children: ["New password", _jsx("input", { type: "password", className: "mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none", value: passwordForm.newPassword, onChange: (event) => {
                                                        const sanitized = sanitizeText(event.target.value);
                                                        if (validateInput(sanitized)) {
                                                            setPasswordForm((prev) => ({ ...prev, newPassword: sanitized }));
                                                        }
                                                    }, required: true })] }), _jsxs("label", { className: "block text-sm font-semibold text-coolGray", children: ["Confirm new password", _jsx("input", { type: "password", className: "mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none", value: passwordForm.confirmPassword, onChange: (event) => {
                                                        const sanitized = sanitizeText(event.target.value);
                                                        if (validateInput(sanitized)) {
                                                            setPasswordForm((prev) => ({ ...prev, confirmPassword: sanitized }));
                                                        }
                                                    }, required: true })] }), _jsx("button", { type: "submit", disabled: passwordMutation.isPending, className: "rounded-btn bg-violet py-2 px-5 font-semibold text-white hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-50", children: passwordMutation.isPending ? 'Updating...' : 'Update Password' })] })] }), _jsx("div", { className: "pt-4", children: _jsx(Link, { to: "/dashboard", className: "inline-flex items-center text-violet hover:text-softViolet font-semibold", children: "\u2190 Back to Dashboard" }) })] })] }) }));
};
export default AccountSettingsPage;
