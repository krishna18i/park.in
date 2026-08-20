import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { WS_URL } from "../lib/api";

const LiveContext = createContext(null);

const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 10_000;

/**
 * One WebSocket for the whole app, shared through context.
 *
 * A native WebSocket -- the server speaks plain WS, not Socket.IO, so no client
 * library is involved. Screens call `subscribe(handler)` and get every
 * `{ event, payload }` the server pushes; the handler set lives in a ref so
 * subscribing never re-opens the socket.
 */
export function LiveProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set());

  useEffect(() => {
    let socket;
    let retryTimer;
    let attempt = 0;
    let disposed = false;

    const open = () => {
      if (disposed) return;
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
      };

      socket.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return; // ignore anything that isn't our JSON envelope
        }
        listeners.current.forEach((handler) => handler(message));
      };

      socket.onclose = () => {
        setConnected(false);
        if (disposed) return;
        // Exponential backoff, capped -- a backend restart mid-demo reconnects
        // on its own without hammering the server.
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt++, RECONNECT_MAX_MS);
        retryTimer = setTimeout(open, delay);
      };

      socket.onerror = () => socket.close();
    };

    open();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  const value = useMemo(
    () => ({
      connected,
      subscribe: (handler) => {
        listeners.current.add(handler);
        return () => listeners.current.delete(handler);
      },
    }),
    [connected],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside <LiveProvider>");
  return ctx;
}

/** Subscribe to a single event name for the lifetime of a component. */
export function useLiveEvent(eventName, handler) {
  const { subscribe } = useLive();
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(
    () =>
      subscribe((message) => {
        if (message.event === eventName) saved.current(message.payload);
      }),
    [eventName, subscribe],
  );
}
