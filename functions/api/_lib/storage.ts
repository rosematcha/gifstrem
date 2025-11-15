import type { R2HTTPMetadata } from '@cloudflare/workers-types';
import type { GifstremBindings } from './types';

export type StoredFileInfo = {
  key: string;
  url: string;
};

export async function saveGifToR2(env: GifstremBindings, file: File, slug: string): Promise<StoredFileInfo> {
  const key = `gifstrem/${slug}/${crypto.randomUUID()}.gif`;
  const httpMetadata: R2HTTPMetadata = {
    contentType: file.type || 'image/gif',
    contentDisposition: `inline; filename="${encodeURIComponent(file.name)}"`,
  };
  await env.GIF_BUCKET.put(key, file.stream(), { httpMetadata });
  const base = env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '');
  const url = base ? `${base}/${key}` : key;
  return { key, url };
}

export async function deleteGifFromR2(env: GifstremBindings, keys: string | string[]): Promise<void> {
  const toDelete = Array.isArray(keys) ? keys : [keys];
  if (toDelete.length === 0) return;
  await env.GIF_BUCKET.delete(toDelete);
}
