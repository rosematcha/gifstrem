import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
const SubmissionPage = () => {
    const { slug } = useParams();
    const [uploaderName, setUploaderName] = useState('');
    const [message, setMessage] = useState('');
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const { data, isLoading } = useQuery({
        queryKey: ['streamer', slug],
        queryFn: async () => {
            const response = await api.get(`/public/streamers/${slug}`);
            return response.data.streamer;
        },
        enabled: Boolean(slug),
    });
    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!file || !slug) {
            setError('Please select a GIF first');
            return;
        }
        setStatus('submitting');
        setError(null);
        const formData = new FormData();
        formData.append('slug', slug);
        formData.append('uploaderName', uploaderName);
        formData.append('message', message);
        formData.append('file', file);
        try {
            console.info('[submission] Uploading GIF', {
                slug,
                uploaderName,
                messageLength: message.length,
                fileName: file.name,
                fileSize: file.size,
            });
            const response = await api.post('/submissions/public', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            console.info('[submission] Upload success', response.data);
            setStatus('success');
            setUploaderName('');
            setMessage('');
            setFile(null);
        }
        catch (err) {
            const axiosError = err;
            const messageText = axiosError.response?.data?.error ?? axiosError.message;
            console.error('[submission] Upload failed', {
                status: axiosError.response?.status,
                responseData: axiosError.response?.data,
            });
            setStatus('error');
            setError(messageText ?? 'Unable to submit GIF right now.');
        }
    };
    if (isLoading) {
        return _jsx("div", { className: "p-l text-center text-white", children: "Loading streamer info..." });
    }
    if (!data) {
        return _jsx("div", { className: "p-l text-center text-coral", children: "Streamer not found." });
    }
    return (_jsx("div", { className: "min-h-screen bg-charcoal px-4 py-xl text-white", children: _jsxs("div", { className: "mx-auto flex max-w-xl flex-col gap-l rounded-card bg-graphite border border-slate/30 p-l shadow-medium", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm uppercase text-violet font-semibold tracking-wide", children: "Submitting to" }), _jsx("h1", { className: "text-3xl font-bold", children: data.displayName }), _jsx("p", { className: "text-sm text-coolGray", children: "Share your best transparent GIFs. Approved stickers stay up for 12h." })] }), status === 'success' && _jsx("p", { className: "rounded-btn bg-emerald/20 border border-emerald/40 p-2 text-white", children: "Thanks! Your GIF is pending approval." }), status === 'error' && error && _jsx("p", { className: "rounded-btn bg-coral/20 border border-coral/40 p-2 text-white", children: error }), _jsxs("form", { className: "space-y-m", onSubmit: handleSubmit, children: [_jsxs("label", { className: "block text-sm font-semibold text-coolGray", children: ["Your name", _jsx("input", { type: "text", value: uploaderName, onChange: (event) => setUploaderName(event.target.value), className: "mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none", required: true })] }), _jsxs("label", { className: "block text-sm font-semibold text-coolGray", children: ["Message (optional)", _jsx("textarea", { value: message, maxLength: 240, onChange: (event) => setMessage(event.target.value), className: "mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none", rows: 3 })] }), _jsxs("label", { className: "block text-sm font-semibold text-coolGray", children: ["GIF file", _jsx("input", { type: "file", accept: "image/gif", className: "mt-1 w-full rounded-btn border border-dashed border-slate bg-charcoal p-4 file:mr-4 file:rounded-btn file:border-0 file:bg-violet file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-softViolet", onChange: (event) => setFile(event.target.files?.[0] ?? null), required: true }), _jsx("span", { className: "text-xs text-dimGray", children: "Only animated GIFs for now. Max 15MB." })] }), _jsx("button", { type: "submit", disabled: status === 'submitting', className: "w-full rounded-btn bg-violet py-[10px] px-5 font-semibold text-white hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-50", children: status === 'submitting' ? 'Uploading...' : 'Submit GIF' })] })] }) }));
};
export default SubmissionPage;
