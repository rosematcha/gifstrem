import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { getToken, setToken } from '../lib/auth';
const LoginPage = () => {
    const navigate = useNavigate();
    const [form, setForm] = useState({ username: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (getToken()) {
            navigate('/dashboard', { replace: true });
        }
    }, [navigate]);
    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const response = await api.post('/auth/login', form);
            setToken(response.data.token);
            navigate('/dashboard');
        }
        catch (err) {
            const message = err.response?.data?.error ?? 'Login failed';
            setError(message);
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "flex min-h-screen flex-col items-center justify-center bg-charcoal px-4 text-white", children: [_jsx(Link, { to: "/", className: "font-display text-4xl text-violet mb-8 hover:text-softViolet", children: "GIFstrem" }), _jsxs("form", { className: "w-full max-w-md space-y-m rounded-modal bg-graphite border border-slate/30 p-l shadow-medium", onSubmit: handleSubmit, children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Welcome back" }), error && _jsx("p", { className: "rounded-btn bg-coral/20 border border-coral/40 p-2 text-sm text-white", children: error }), _jsxs("label", { className: "block text-sm font-semibold text-coolGray", children: ["Username", _jsx("input", { type: "text", className: "mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none", value: form.username, onChange: (event) => setForm((prev) => ({ ...prev, username: event.target.value })), required: true })] }), _jsxs("label", { className: "block text-sm font-semibold text-coolGray", children: ["Password", _jsx("input", { type: "password", className: "mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none", value: form.password, onChange: (event) => setForm((prev) => ({ ...prev, password: event.target.value })), required: true })] }), _jsx("button", { type: "submit", disabled: loading, className: "w-full rounded-btn bg-violet py-[10px] px-5 font-semibold text-white hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-50", children: loading ? 'Signing in...' : 'Sign in' }), _jsxs("p", { className: "text-center text-sm text-coolGray", children: ["Need an account?", ' ', _jsx(Link, { to: "/auth/signup", className: "text-violet hover:text-softViolet font-semibold", children: "Sign up" })] })] })] }));
};
export default LoginPage;
