import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      stream: 'stream-browserify',
      events: 'events',
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['gif-encoder-2', 'stream-browserify', 'events', 'buffer'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  define: {
    global: 'globalThis',
  },
  server: {
    port: 4173,
  },
});
