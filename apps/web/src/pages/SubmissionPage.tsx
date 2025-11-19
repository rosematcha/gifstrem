import { ChangeEvent, FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { compressGifToLimit } from '../lib/gifCompression';
import { sanitizeDisplayName, sanitizeMessage, validateInput } from '../lib/sanitize';
import type { Streamer } from '../types';
import type { AxiosError } from 'axios';

const MAX_GIF_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_COMPRESSIBLE_BYTES = 8 * 1024 * 1024;

const formatBytes = (bytes: number) => {
  const units = ['bytes', 'KB', 'MB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
};

const SubmissionPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [uploaderName, setUploaderName] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'compressing' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [compressionNotice, setCompressionNotice] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['streamer', slug],
    queryFn: async () => {
      const response = await api.get<{ streamer: Streamer }>(`/public/streamers/${slug}`);
      return response.data.streamer;
    },
    enabled: Boolean(slug),
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    setFile(selectedFile);
    setCompressionNotice(null);
    if (!selectedFile) {
      return;
    }

    if (selectedFile.size > MAX_COMPRESSIBLE_BYTES) {
      setStatus('error');
      setError('GIFs must be 8MB or smaller before upload.');
      return;
    }

    setError(null);
    setStatus('idle');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !slug) {
      const message = `Missing fields: slug=${slug ?? 'undefined'}, file=${file ? 'present' : 'absent'}`;
      console.warn('[submission] Aborting submission before request', message);
      setError('Please select a GIF first');
      return;
    }

    if (file.size > MAX_COMPRESSIBLE_BYTES) {
      console.warn('[submission] File rejected before compression attempt', {
        size: file.size,
        maxCompressible: MAX_COMPRESSIBLE_BYTES,
      });
      setStatus('error');
      setError('Upload GIFs up to 8MB. Larger exports need trimming before we can compress them.');
      return;
    }

    setError(null);
    let fileToUpload: File = file;
    if (file.size > MAX_GIF_SIZE_BYTES) {
      console.info('[submission] File exceeds 2MB, attempting local compression', {
        originalSize: file.size,
      });
      setStatus('compressing');
      try {
        const compression = await compressGifToLimit(file, MAX_GIF_SIZE_BYTES);
        fileToUpload = compression.file;
        setFile(fileToUpload);
        const strategySuffix = compression.lastPresetDescription
          ? ` using ${compression.lastPresetDescription}`
          : '';
        setCompressionNotice(
          `Compressed from ${formatBytes(compression.beforeBytes)} to ${formatBytes(compression.afterBytes)}${strategySuffix}`,
        );
        if (fileToUpload.size > MAX_GIF_SIZE_BYTES) {
          setStatus('error');
          const lastStrategy = compression.lastPresetDescription
            ? ` (last attempt: ${compression.lastPresetDescription})`
            : '';
          setError(
            `We tried ${compression.attempts} compression strategies${lastStrategy}, but the GIF is still ${formatBytes(
              fileToUpload.size,
            )}. Please trim frames or reduce dimensions.`,
          );
          return;
        }
      } catch (compressionError) {
        console.error('[submission] Compression failed', compressionError);
        setStatus('error');
        setError('We could not compress this GIF locally. Please export a smaller file.');
        return;
      }
    } else {
      setCompressionNotice(null);
    }

    setStatus('submitting');
    const formData = new FormData();
    console.debug('[submission] creating form data container');
    formData.append('slug', slug);
    console.debug('[submission] appended slug', slug);
    formData.append('uploaderName', uploaderName);
    console.debug('[submission] appended uploaderName', uploaderName);
    formData.append('message', message);
    console.debug('[submission] appended message', message);
    formData.append('file', fileToUpload);
    console.debug('[submission] appended file blob', {
      name: fileToUpload.name,
      type: fileToUpload.type,
      size: fileToUpload.size,
    });
    try {
      console.info('[submission] Uploading GIF', {
        slug,
        uploaderName,
        messageLength: message.length,
        fileName: fileToUpload.name,
        fileSize: fileToUpload.size,
        wasCompressed: fileToUpload !== file,
      });
      console.info('[submission] FormData preview', {
        slugValue: formData.get('slug'),
        uploaderNameValue: formData.get('uploaderName'),
        messageValue: formData.get('message'),
        fileNameValue: (formData.get('file') as File | null)?.name,
        fileTypeValue: (formData.get('file') as File | null)?.type,
        fileSizeValue: (formData.get('file') as File | null)?.size,
      });
      console.info('[submission] sending POST', {
        url: `${api.defaults.baseURL ?? ''}/submissions/public`,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const response = await api.post('/submissions/public', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      console.info('[submission] Upload success', response.data);
      setStatus('success');
      setUploaderName('');
      setMessage('');
      setFile(null);
      setCompressionNotice(null);
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
              onChange={(event) => {
                const sanitized = sanitizeDisplayName(event.target.value);
                if (validateInput(sanitized)) {
                  setUploaderName(sanitized);
                }
              }}
              onBlur={() => {
                const sanitized = sanitizeDisplayName(uploaderName);
                if (sanitized !== uploaderName) {
                  setUploaderName(sanitized);
                }
              }}
              className="mt-1 w-full rounded-btn border border-slate bg-graphite p-2 text-white placeholder-dimGray focus:border-violet focus:outline-none"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-coolGray">
            Message (optional)
            <textarea
              value={message}
              maxLength={240}
              onChange={(event) => {
                const sanitized = sanitizeMessage(event.target.value);
                if (validateInput(sanitized)) {
                  setMessage(sanitized);
                }
              }}
              onBlur={() => {
                const sanitized = sanitizeMessage(message);
                if (sanitized !== message) {
                  setMessage(sanitized);
                }
              }}
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
              onChange={handleFileChange}
              required
            />
            <span className="text-xs text-dimGray">
              Animated GIFs up to 2MB. We will try to compress files up to 8MB before upload.
            </span>
            {compressionNotice && <span className="mt-1 block text-xs text-emerald/80">{compressionNotice}</span>}
          </label>
          <button
            type="submit"
            disabled={status === 'submitting' || status === 'compressing'}
            className="w-full rounded-btn bg-violet py-[10px] px-5 font-semibold text-white hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-50"
          >
            {status === 'compressing' ? 'Compressing GIF...' : status === 'submitting' ? 'Uploading...' : 'Submit GIF'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SubmissionPage;
