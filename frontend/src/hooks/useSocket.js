import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getToken, clearToken, UNAUTHORIZED_EVENT } from '../api';

// Empty in local dev (Vite proxies /socket.io); on Vercel it points at Render.
const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  ''
).replace(/\/+$/, '');

// Opens one Socket.IO connection authenticated with the same JWT the HTTP
// layer uses (backend reads it from handshake.auth.token).
//
// The token is passed in as a dependency instead of being read once, because
// on a hard reload the provider may still be resolving the session when this
// hook first mounts. Reading getToken() inside a `[]` effect meant the socket
// was never opened again after that first miss — the "socket token is lost on
// reload" bug.
export function useSocket(token) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  // Listeners registered before the socket exists (or re-exists) are replayed
  // onto every new instance, so a reconnect never leaves handlers behind.
  const listenersRef = useRef([]);

  const authToken = token ?? getToken();

  useEffect(() => {
    if (!authToken) return undefined;

    let cancelled = false;
    setAuthFailed(false);

    // Let Socket.IO fall back to polling: forcing websocket-only turns a
    // blocked/upgraded websocket into a hard "never connects" failure.
    const socket = io(SOCKET_URL || undefined, {
      auth: { token: authToken },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (cancelled) return;
      setConnected(true);
      setAuthFailed(false);
    });
    socket.on('disconnect', () => {
      if (!cancelled) setConnected(false);
    });
    socket.on('connect_error', (err) => {
      if (cancelled) return;
      setConnected(false);
      // The server rejects a dead/expired JWT during the handshake with
      // "Invalid token" / "Authentication error". Retrying forever can never
      // succeed, so drop the session the same way a 401 does over HTTP.
      const message = String(err?.message || '');
      if (/invalid token|authentication error/i.test(message)) {
        setAuthFailed(true);
        socket.close();
        clearToken();
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      }
    });

    // Replay anything registered before this (re)connect.
    listenersRef.current.forEach(([event, handler]) => socket.on(event, handler));

    // Browsers throttle and drop timers/sockets on background tabs. When the
    // tab comes back, make sure we are actually connected instead of showing a
    // dead "connecting..." state until the next page load.
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (socketRef.current && !socketRef.current.connected) socketRef.current.connect();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [authToken]);

  const on = useCallback((event, handler) => {
    listenersRef.current = [
      ...listenersRef.current.filter((l) => l[0] !== event || l[1] !== handler),
      [event, handler],
    ];
    socketRef.current?.on(event, handler);
  }, []);

  const off = useCallback((event, handler) => {
    listenersRef.current = listenersRef.current.filter(
      (l) => l[0] !== event || l[1] !== handler
    );
    socketRef.current?.off(event, handler);
  }, []);

  const emit = useCallback((event, data) => {
    const socket = socketRef.current;
    if (!socket) return;
    if (socket.connected) {
      socket.emit(event, data);
    } else {
      // Queue the very next action instead of dropping it: a socket that is
      // mid-reconnect should not swallow "join_room".
      socket.once('connect', () => socket.emit(event, data));
    }
  }, []);

  return useMemo(
    () => ({ socket: socketRef, connected, authFailed, on, off, emit }),
    [connected, authFailed, on, off, emit]
  );
}
