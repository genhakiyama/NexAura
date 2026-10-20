// Vercel entrypoint.
//
// Vercel owns the HTTP listener, so this file must EXPORT the Express app and
// must NOT call server.listen(). Exporting an app that also listens makes Vercel
// report:
//   No exports found in module "/var/task/backend/index.cjs"
//   Did you forget to export a function or a server?
//
// `require('express')` looks unused, but Vercel's Express builder only treats a
// file as the entrypoint when its own source imports express
// (packages/express/src/build.ts in vercel/vercel). This file builds the app in
// ./Server/app, so the import is what makes the builder pick this file.
//
// Local development uses server.js instead: it adds Socket.IO and listens on
// PORT. Realtime on Vercel falls back to the frontend's polling sync because a
// WebSocket is pinned to one function instance and capped at 300s on Hobby.
const path = require('path');

const express = require('express');
void express;

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./Server/app');

// Database initialization is lazy: the middleware in Server/app.js awaits the
// cached DBInit promise on the first request. Keeping it out of module scope
// avoids opening a connection if Vercel imports this entrypoint at build time.
module.exports = app;
