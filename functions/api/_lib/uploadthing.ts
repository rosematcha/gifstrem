import { UTApi } from 'uploadthing/server';
import { GifstremBindings } from './types';

export function createUploadClient(env: GifstremBindings) {
  return new UTApi({
    apiKey: env.UPLOADTHING_TOKEN,
  });
}
