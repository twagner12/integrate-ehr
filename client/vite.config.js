import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy /api requests to the Express server during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 300000,
      },
    },
  },
});
