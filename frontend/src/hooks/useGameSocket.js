import { useEffect, useRef, useState, useCallback } from "react";

function wsUrl(path) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

// Oda WS'i (/ws/game/room/{code}) ve matchmaking WS'i (/ws/game/matchmaking)
// için ortak bağlantı kancası — otomatik reconnect (exponential backoff),
// JSON mesaj dispatch. token yoksa bağlanmaz (oda/eşleştirme girişi zaten
// login zorunlu tutuyor, bkz. AuthContext).
// Kalıcı (tekrar denemeye değmez) kapanış kodları — sunucu artık bunları
// asla göndermiyor (bkz. api/game_ws.py _reject: accept()+"fatal" mesajı+
// close(1000) deseni, tarayıcıların pre-accept close code'unu güvenilir
// iletmemesi yüzünden), ama savunma amaçlı burada da bırakılıyor —
// örn. bir proxy/CDN katmanı bağlantıyı kendi close code'uyla keserse.
const FATAL_CLOSE_CODES = new Set([4401, 4403]);

export function useGameSocket(path, token, { onMessage } = {}) {
  const [connected, setConnected] = useState(false);
  const [fatalError, setFatalError] = useState(null);
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const retryRef = useRef(0);
  const closedByUserRef = useRef(false);
  const fatalRef = useRef(false);
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
    ws.onclose = (evt) => {
      setConnected(false);
      if (closedByUserRef.current || fatalRef.current) return;
      if (FATAL_CLOSE_CODES.has(evt.code)) {
        fatalRef.current = true;
        setFatalError({ reason: "connection_rejected", message: "Couldn't connect — your session may have expired." });
        return;
      }
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
        // "fatal" = sunucu bu bağlantıyı kalıcı olarak reddetti (geçersiz
        // token, banlı hesap, oda yok/katılımcı değilsin) — yeniden denemek
        // aynı sonucu sonsuza dek tekrarlar (bkz. api/game_ws.py _reject).
        // Faz3-M6: önceden bu ayrım yoktu, istemci "Connecting…" ekranında
        // sonsuza dek takılı kalıyordu.
        if (data.type === "fatal") {
          fatalRef.current = true;
          setFatalError({ reason: data.reason || "unknown", message: data.message || "This connection was rejected." });
        }
        onMessageRef.current?.(data);
      } catch { /* non-JSON mesajı yoksay */ }
    };
  }, [path, token]);

  useEffect(() => {
    closedByUserRef.current = false;
    fatalRef.current = false;
    setFatalError(null);
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

  return { connected, send, fatalError };
}
