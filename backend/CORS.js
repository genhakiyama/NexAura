const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '');

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

const allowAll = configuredOrigins.includes('*');

const explicitOrigins = new Set(
  configuredOrigins
    .filter((origin) => origin !== '*')
    .concat(['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'])
);

// Vercel gives every production/preview deployment a *.vercel.app origin. If
// CORS_ORIGINS is not set on Render, rejecting those origins makes signup,
// login, REST and the Socket.IO handshake all fail from the deployed frontend.
const autoHosts = ['vercel.app', 'onrender.com'];

const warnedOrigins = new Set();

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl, server-to-server, same-origin requests
  const value = normalizeOrigin(origin);
  if (allowAll || explicitOrigins.has(value)) return true;

  try {
    const { protocol, hostname } = new URL(value);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    return autoHosts.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function corsOrigin(origin, callback) {
  const allowed = isAllowedOrigin(origin);
  if (!allowed && origin && !warnedOrigins.has(origin)) {
    warnedOrigins.add(origin);
    console.warn(`[cors] blocked origin: ${origin}`);
  }
  callback(null, allowed);
}

module.exports = { corsOrigin, isAllowedOrigin };
