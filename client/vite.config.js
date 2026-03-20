import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    https: fs.existsSync('certs/cert.pem') ? {
      cert: fs.readFileSync('certs/cert.pem'),
      key: fs.readFileSync('certs/key.pem'),
    } : undefined,
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
