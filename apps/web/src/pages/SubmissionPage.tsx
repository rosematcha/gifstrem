import { ChangeEvent, FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { compressGifToLimit } from '../lib/gifCompression';
import { sanitizeDisplayName, sanitizeMessage, validateInput } from '../lib/sanitize';
import type { Streamer } from '../types';
import type { AxiosError } from 'axios';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_COMPRESSIBLE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_FILE_TYPES = new Set(['image/gif', 'image/png', 'image/jpeg', 'image/jpg']);

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

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    setCompressionNotice(null);
    setError(null);
    setStatus('idle');

    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (!SUPPORTED_FILE_TYPES.has(selectedFile.type)) {
      setStatus('error');
      setError('Only GIF, PNG, or JPEG uploads are supported.');
      setFile(null);
      return;
    }

    const isGif = selectedFile.type === 'image/gif';
    if (isGif) {
      if (selectedFile.size > MAX_COMPRESSIBLE_BYTES) {
        setStatus('error');
        setError('GIFs must be 8MB or smaller before upload.');
        setFile(null);
        return;
      }

      if (selectedFile.size > MAX_UPLOAD_BYTES) {
        console.info('[submission] File exceeds 4MB, attempting local compression on selection', {
          originalSize: selectedFile.size,
        });
        setStatus('compressing');
        try {
          const compression = await compressGifToLimit(selectedFile, MAX_UPLOAD_BYTES);
          const compressedFile = compression.file;
          setFile(compressedFile);
          const strategySuffix = compression.lastPresetDescription ? ` using ${compression.lastPresetDescription}` : '';
          setCompressionNotice(
            `Compressed from ${formatBytes(compression.beforeBytes)} to ${formatBytes(compression.afterBytes)}${strategySuffix}`,
          );

          if (compressedFile.size > MAX_UPLOAD_BYTES) {
            const lastStrategy = compression.lastPresetDescription
              ? ` (last attempt: ${compression.lastPresetDescription})`
              : '';
            setStatus('error');
            setError(
              `We tried ${compression.attempts} compression strategies${lastStrategy}, but the GIF is still ${formatBytes(
                compressedFile.size,
              )}. Please trim frames or reduce dimensions.`,
            );
            return;
          }

          setStatus('idle');
        } catch (compressionError) {
          console.error('[submission] Compression failed on selection', compressionError);
          setStatus('error');
          setFile(null);
          setError('We could not compress this GIF locally. Please export a smaller file.');
        }
        return;
      }

      setFile(selectedFile);
      setStatus('idle');
      return;
    }

    if (selectedFile.size > MAX_UPLOAD_BYTES) {
      setStatus('error');
      setError('Images must be 4MB or smaller. Please export a smaller file.');
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setStatus('idle');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !slug) {
      const message = `Missing fields: slug=${slug ?? 'undefined'}, file=${file ? 'present' : 'absent'}`;
      console.warn('[submission] Aborting submission before request', message);
      setError('Please select a GIF or image first.');
      return;
    }

    if (file.type === 'image/gif' && file.size > MAX_COMPRESSIBLE_BYTES) {
      console.warn('[submission] File rejected before compression attempt', {
        size: file.size,
        maxCompressible: MAX_COMPRESSIBLE_BYTES,
      });
      setStatus('error');
      setError('Upload GIFs up to 8MB. Larger exports need trimming before we can compress them.');
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      const message =
        file.type === 'image/gif'
          ? 'GIFs must be 4MB or smaller. Please trim frames or reduce dimensions.'
          : 'Images must be 4MB or smaller. Please export a smaller file.';
      setStatus('error');
      setError(message);
      return;
    }

    const fileToUpload: File = file;

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
      console.info('[submission] Uploading submission', {
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
      setError(messageText ?? 'Unable to submit media right now.');
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
        </div>
        {status === 'success' && <p className="rounded-btn bg-emerald/20 border border-emerald/40 p-2 text-white">Thanks! Your submission is pending approval.</p>}
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
            Upload file
            <input
              type="file"
              accept="image/gif,image/png,image/jpeg,image/jpg"
              className="mt-1 w-full rounded-btn border border-dashed border-slate bg-charcoal p-4 file:mr-4 file:rounded-btn file:border-0 file:bg-violet file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-softViolet"
              onChange={handleFileChange}
              required
            />
            <span className="text-xs text-dimGray">
              Animated GIFs or PNG/JPEG stills up to 4MB. GIFs bigger than 4MB may be compressed locally down to the limit.
            </span>
            {compressionNotice && <span className="mt-1 block text-xs text-emerald/80">{compressionNotice}</span>}
          </label>
          <button
            type="submit"
            disabled={status === 'submitting' || status === 'compressing'}
            className="w-full rounded-btn bg-violet py-[10px] px-5 font-semibold text-white hover:bg-softViolet hover:-translate-y-[1px] active:bg-deepViolet active:translate-y-0 disabled:opacity-50"
          >
            {status === 'compressing' ? 'Compressing GIF...' : status === 'submitting' ? 'Uploading...' : 'Submit media'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SubmissionPage;
