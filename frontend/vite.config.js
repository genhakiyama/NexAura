import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// All requests use relative paths and are proxied to the backend on :3000,
// so the browser sees a single origin (no CORS handling needed here).
//
// NOTE: the API lives under /chat/... but so does the SPA route `/chat`.
// Proxying the bare `/chat` prefix swallows the client-side route and the dev
// server answers with the backend's 500 instead of index.html, which renders a
// blank page. Only the concrete API segments are proxied here; everything else
// falls through to Vite. Keep these in sync with the paths in src/api.js.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/chat/conversation': 'http://localhost:3000',
      '/chat/message': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
