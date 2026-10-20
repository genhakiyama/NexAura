// Vercel entrypoint.
//
// Vercel detects Express by this file and runs it as a single Function.
// Export the app (not an http.Server with .listen) because Vercel owns the
// listener and reuses one instance across concurrent requests.
//
// Local development still uses server.js, which adds Socket.IO and listens on
// PORT. Realtime on Vercel is handled by the frontend's polling sync because a
// WebSocket is pinned to one function instance and is capped at 300s on Hobby.
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./Server/app');

// Database initialization is lazy: the middleware in Server/app.js awaits the
// cached DBInit promise on the first request. Keeping it out of module scope
// avoids opening a connection if Vercel imports this entrypoint at build time.
module.exports = app;
