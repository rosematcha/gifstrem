import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      stream: 'stream-browserify',
      events: 'events',
      buffer: 'buffer',
      process: 'process/browser',
    },
  },
  optimizeDeps: {
    include: ['gif-encoder-2', 'stream-browserify', 'events', 'buffer', 'process/browser'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
        'process.env.NODE_DEBUG': 'false',
      },
    },
  },
  define: {
    global: 'globalThis',
    'process.env.NODE_DEBUG': 'false',
  },
  server: {
    port: 4173,
  },
});
