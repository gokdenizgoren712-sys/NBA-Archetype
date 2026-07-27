import { useEffect, useRef, useState, useCallback } from "react";

function wsUrl(path) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

// Oda WS'i (/ws/game/room/{code}) ve matchmaking WS'i (/ws/game/matchmaking)
// için ortak bağlantı kancası — otomatik reconnect (exponential backoff),
// JSON mesaj dispatch. token yoksa bağlanmaz (oda/eşleştirme girişi zaten
// login zorunlu tutuyor, bkz. AuthContext).
export function useGameSocket(path, token, { onMessage } = {}) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const retryRef = useRef(0);
  const closedByUserRef = useRef(false);
  const timerRef = useRef(null);

  const connect = useCallback(() => {
    if (!path || !token) return;
    const sep = path.includes("?") ? "&" : "?";
    const url = wsUrl(path) + `${sep}token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 0;
    };
    ws.onclose = () => {
      setConnected(false);
      if (closedByUserRef.current) return;
      const delay = Math.min(10000, 500 * 2 ** retryRef.current);
      retryRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* no-op */ }
    };
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        onMessageRef.current?.(data);
      } catch { /* non-JSON mesajı yoksay */ }
    };
  }, [path, token]);

  useEffect(() => {
    closedByUserRef.current = false;
    connect();
    return () => {
      closedByUserRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((obj) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }, []);

  return { connected, send };
}
