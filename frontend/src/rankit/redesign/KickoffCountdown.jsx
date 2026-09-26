/* Maç sayfasında başlama saatine kalan süre (sahibin 2026-09-26 isteği:
 * "karta tıklandığında maça kaç gün kaç saat kaldığı"). Telefonun maç
 * sayfası (2f Match sekmesi) ve web Inspector'ı (16c) aynı bileşeni çiziyor.
 *
 *   KICKS OFF IN            — 5a'nın ifadesi (Companion'daki geri sayım)
 *   2 DAYS  5 HRS           — bir günden fazla: gün + saat
 *   5 HRS  12 MIN           — bir saatten fazla: saat + dakika
 *   12 MIN                  — son saat
 *
 * Dakikada bir yenilenir; altın yok (§1.3: işaret değil, bilgi). */
import { useEffect, useMemo, useState } from "react";
import { countdown } from "../formatWhen.js";

export default function KickoffCountdown({ startsAt, className = "" }) {
  const target = useMemo(() => (startsAt ? new Date(startsAt).getTime() : NaN), [startsAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [target]);

  const left = countdown(startsAt, now);
  if (!left) return null;
  if (left.due) {
    return (
      <div className={`ri-countdown is-due ${className}`.trim()} role="status">
        <small>KICK-OFF</small><strong>Any moment now</strong>
      </div>
    );
  }
  const spoken = left.segments.map((s) => `${s.value} ${s.unit.toLowerCase()}`).join(" ");
  return (
    <div className={`ri-countdown ${className}`.trim()} role="timer" aria-label={`Kicks off in ${spoken}`}>
      <small aria-hidden="true">KICKS OFF IN</small>
      <div aria-hidden="true">
        {left.segments.map((s) => <span key={s.unit}><b>{s.value}</b><i>{s.unit}</i></span>)}
      </div>
    </div>
  );
}
