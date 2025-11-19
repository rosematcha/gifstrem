import type { R2HTTPMetadata } from '@cloudflare/workers-types';
import type { GifstremBindings } from './types';
import { sanitizeGif, validateGifStructure } from './gifSanitize';

export type StoredFileInfo = {
  key: string;
  url: string;
  sanitizationWarnings?: string[];
};

export async function saveGifToR2(env: GifstremBindings, file: File, slug: string): Promise<StoredFileInfo> {
  // First, do a quick validation
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  
  const validation = validateGifStructure(data);
  if (!validation.valid) {
    throw new Error(`Invalid GIF file: ${validation.error}`);
  }
  
  // Sanitize the GIF to remove metadata and potential malicious content
  console.info('[storage] Sanitizing GIF', { 
    originalSize: data.length,
    fileName: file.name 
  });
  
  let sanitizedData: Uint8Array;
  let warnings: string[] = [];
  
  try {
    const result = await sanitizeGif(file);
    sanitizedData = result.sanitized;
    warnings = result.warnings;
    
    console.info('[storage] GIF sanitized', {
      originalSize: data.length,
      sanitizedSize: sanitizedData.length,
      removedBytes: result.removedBytes,
      warnings: result.warnings.length
    });
  } catch (error) {
    console.error('[storage] GIF sanitization failed', error);
    throw new Error(`Failed to sanitize GIF: ${(error as Error).message}`);
  }
  
  const key = `gifstrem/${slug}/${crypto.randomUUID()}.gif`;
  const httpMetadata: R2HTTPMetadata = {
    contentType: 'image/gif',
    contentDisposition: `inline; filename="${encodeURIComponent(file.name)}"`,
  };
  
  // Upload the sanitized data directly as a stream
  await env.GIF_BUCKET.put(key, sanitizedData, { httpMetadata });
  
  const base =
    (env.R2_PUBLIC_BASE_URL ?? 'https://r2.gifstrem.com').replace(/\/$/, '');
  const url = `${base}/${key}`;
  
  return { 
    key, 
    url,
    sanitizationWarnings: warnings.length > 0 ? warnings : undefined
  };
}

export async function deleteGifFromR2(env: GifstremBindings, keys: string | string[]): Promise<void> {
  const toDelete = Array.isArray(keys) ? keys : [keys];
  if (toDelete.length === 0) return;
  await env.GIF_BUCKET.delete(toDelete);
}
