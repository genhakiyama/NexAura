import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// All requests use relative paths and are proxied to the backend on :3000,
// so the browser sees a single origin (no CORS handling needed here).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/chat': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
