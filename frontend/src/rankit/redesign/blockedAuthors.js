/* Bu oturumda engellenen hesaplar (docs/RANKIT_STORE_BLOCKERS_PLAN.md B5).
 *
 * Sunucu engelli iliskideki icerigi zaten hic gondermiyor; bu kume yalnizca
 * EKRANDA DURAN icerigin yeniden yukleme beklemeden kalkmasi icin: engelledigin
 * kisinin incelemesi, yaniti ve mesaji aninda gider. Engel kaldirilinca kume
 * de birakir; ekranin bir sonraki yuklemesi sunucudan gelir.
 */
import { useEffect, useState } from "react";

const blocked = new Set();
const listeners = new Set();

function changed(event) {
  const id = event?.detail?.id;
  if (id == null) return;
  if (event.detail.blocked) blocked.add(String(id));
  else blocked.delete(String(id));
  listeners.forEach((fn) => fn());
}

if (typeof window !== "undefined") window.addEventListener("rankit:blocks", changed);

export function isBlockedAuthor(id) {
  return id != null && blocked.has(String(id));
}

/* Kume degisince yeniden cizer; donen fonksiyon satir suzgeci. */
export function useBlockedAuthors() {
  const [, setRevision] = useState(0);
  useEffect(() => {
    const bump = () => setRevision((value) => value + 1);
    listeners.add(bump);
    return () => { listeners.delete(bump); };
  }, []);
  return isBlockedAuthor;
}
