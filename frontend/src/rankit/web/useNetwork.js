/* 8d çevrimdışı: kartlar %62'ye söner, kaybolmaz; puan bu cihazda saklanır
   ve bağlantı dönünce YÜKLENİR — o söz burada tutuluyor (web'de kuyruk
   yalnız bir sonraki kayıtta boşalıyordu). Telefonun ağ durumu mantığı:
   `online` / `offline` olayları + rankitApi'nin `rankit:network` olayı. */
import { useEffect, useRef, useState } from "react";
import { flushOutbox, onOutboxChange, outbox } from "../rankitOutbox";

export function useNetwork(onUploaded) {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [queued, setQueued] = useState(() => outbox().length);
  const uploaded = useRef(onUploaded);
  useEffect(() => { uploaded.current = onUploaded; }, [onUploaded]);

  useEffect(() => {
    const flush = (retryFailed = false) => flushOutbox({ retryFailed })
      .then((out) => { if (out?.sent) uploaded.current?.(); })
      .catch(() => {});
    const off = () => setOnline(false);
    const on = () => { setOnline(true); flush(); };
    const network = (event) => {
      if (event.detail === "offline") setOnline(false);
      else if (event.detail === "online") on();
    };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    window.addEventListener("rankit:network", network);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
      window.removeEventListener("rankit:network", network);
    };
  }, []);
  useEffect(() => onOutboxChange(setQueued), []);

  const retry = () => flushOutbox({ retryFailed: true }).then((out) => { if (out?.sent) uploaded.current?.(); }).catch(() => {});
  return { online, queued, retry };
}
