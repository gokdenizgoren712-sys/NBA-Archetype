import { useEffect, useRef, useState } from "react";

/* Bir anahtarin basarili verisi Retry'da kalir; eski sorgunun cevabi yeni
   sorguyu ezemez. Hata, bos veri ve ilk yukleme ayri durumlardir. */
export function useResource(key, loader, { enabled = true } = {}) {
  const latest = useRef(loader);
  useEffect(() => { latest.current = loader; });
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, attempt: -1, data: null, error: null });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    Promise.resolve().then(() => latest.current())
      .then(data => { if (alive) setResult({ key, attempt, data, error: null }); })
      .catch(error => { if (alive) setResult(previous => ({ key, attempt,
        data: previous.key === key ? previous.data : null, error })); });
    return () => { alive = false; };
  }, [key, attempt, enabled]);
  const same = result.key === key;
  return { data: enabled && same ? result.data : null,
    error: enabled && same && result.attempt === attempt ? result.error : null,
    loading: enabled && (!same || result.attempt !== attempt),
    reload: () => setAttempt(value => value + 1) };
}
