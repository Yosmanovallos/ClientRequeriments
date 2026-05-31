import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@api':       path.resolve(__dirname, 'src/api'),
      '@auth':      path.resolve(__dirname, 'src/auth'),
      '@components':path.resolve(__dirname, 'src/components'),
      '@context':   path.resolve(__dirname, 'src/context'),
      '@lib':       path.resolve(__dirname, 'src/lib'),
      '@views':     path.resolve(__dirname, 'src/views'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the backend during development
      '/api': {
        target: 'http://localhost:4000',
        rewrite: (p) => p.replace(/^\/api/, ''),
        changeOrigin: true,
      },
    },
  },
});
