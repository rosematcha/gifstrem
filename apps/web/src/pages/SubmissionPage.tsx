import { FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Streamer } from '../types';
import type { AxiosError } from 'axios';

const SubmissionPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [uploaderName, setUploaderName] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['streamer', slug],
    queryFn: async () => {
      const response = await api.get<{ streamer: Streamer }>(`/public/streamers/${slug}`);
      return response.data.streamer;
    },
    enabled: Boolean(slug),
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !slug) {
      const message = `Missing fields: slug=${slug ?? 'undefined'}, file=${file ? 'present' : 'absent'}`;
      console.warn('[submission] Aborting submission before request', message);
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
      console.info('[submission] FormData preview', {
        slugValue: formData.get('slug'),
        uploaderNameValue: formData.get('uploaderName'),
        messageValue: formData.get('message'),
        fileNameValue: (formData.get('file') as File | null)?.name,
        fileTypeValue: (formData.get('file') as File | null)?.type,
        fileSizeValue: (formData.get('file') as File | null)?.size,
      });
      const response = await api.post('/submissions/public', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      console.info('[submission] Upload success', response.data);
      setStatus('success');
      setUploaderName('');
      setMessage('');
      setFile(null);
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string; details?: unknown }>;
      const messageText = axiosError.response?.data?.error ?? axiosError.message;
      console.error('[submission] Upload failed', {
        status: axiosError.response?.status,
        responseData: axiosError.response?.data,
        requestHeaders: axiosError.config?.headers,
        requestUrl: axiosError.config?.url,
      });
      setStatus('error');
      setError(messageText ?? 'Unable to submit GIF right now.');
    }
  };

  if (isLoading) {
    return <div className="p-l text-center text-white">Loading streamer info...</div>;
  }

  if (!data) {
    return <div className="p-l text-center text-coral">Streamer not found.</div>;
  }

  return (
    <div className="min-h-screen bg-charcoal px-4 py-xl text-white">
      <div className="mx-auto flex max-w-xl flex-col gap-l rounded-card bg-graphite border border-slate/30 p-l shadow-medium">
        <div>
          <p className="text-sm uppercase text-violet font-semibold tracking-wide">Submitting to</p>
          <h1 className="text-3xl font-bold">{data.displayName}</h1>
          <p className="text-sm text-coolGray">Share your best transparent GIFs. Approved stickers stay up for 12h.</p>
        </div>
        {status === 'success' && <p className="rounded-btn bg-emerald/20 border border-emerald/40 p-2 text-white">Thanks! Your GIF is pending approval.</p>}
        {status === 'error' && error && <p className="rounded-btn bg-coral/20 border border-coral/40 p-2 text-white">{error}</p>}
        <form className="space-y-m" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-coolGray">
            Your name
            <input
              type="text"
              value={uploaderName}
              onChange={(event) => setUploaderName(event.target.value)}
              className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-coolGray">
            Message (optional)
            <textarea
              value={message}
              maxLength={240}
              onChange={(event) => setMessage(event.target.value)}
              className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none"
              rows={3}
            />
          </label>
          <label className="block text-sm font-semibold text-coolGray">
            GIF file
            <input
              type="file"
              accept="image/gif"
              className="mt-1 w-full rounded-btn border border-dashed border-slate bg-charcoal p-4 file:mr-4 file:rounded-btn file:border-0 file:bg-violet file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-softViolet"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
            <span className="text-xs text-dimGray">Only animated GIFs for now. Max 15MB.</span>
          </label>
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full rounded-btn bg-violet py-[10px] px-5 font-semibold text-white hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-50"
          >
            {status === 'submitting' ? 'Uploading...' : 'Submit GIF'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SubmissionPage;
