import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || '';

let socket = null;

function getSocket() {
  const token = localStorage.getItem('sessionToken');
  
  // Force reconnect if token changed or socket doesn't exist
  if (socket && socket.auth?.token !== token) {
    socket.disconnect();
    socket = null;
  }
  
  if (!socket) {
    socket = io(WS_URL, {
      auth: { token },
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

/**
 * useSocket — manages a Socket.io connection and trip room membership.
 * @param {string|null} tripId  — join this room when set
 * @param {object} handlers     — event name → callback map
 */
export function useSocket(tripId, handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const s = getSocket();
    if (!s.connected) s.connect();

    // Register event listeners
    const entries = Object.entries(handlersRef.current);
    entries.forEach(([event, fn]) => s.on(event, fn));

    if (tripId) {
      s.emit('join-trip', tripId);
    }

    return () => {
      entries.forEach(([event, fn]) => s.off(event, fn));
      if (tripId) s.emit('leave-trip', tripId);
    };
  }, [tripId]);

  return getSocket();
}
