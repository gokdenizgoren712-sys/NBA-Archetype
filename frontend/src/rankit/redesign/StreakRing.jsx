/* Başlıktaki seri — ekran 2a'daki "12 NIGHTS".
 *
 * Görsel kaynak `RankIt Redesign.dc.html#2a`: 44px yüksek bir **hap**, içinde
 * 26px bir halka ve YANINDA `NIGHTS` etiketi. Halka ısı renklerinde
 * (`#f5402e → #d43a63`), altın DEĞİL: başlıkta zaten marka var ve §1.2 bölge
 * başına tek altına izin veriyor.
 *
 * Sayı gerçek: `GET /rank` → `streak.current`. (Bu dosyanın eski notu "arka
 * uçta streak yok" diyordu; artık var ve çağıran oradan besliyor.)
 * Halkanın paydası uydurma değil: §4.2'ye göre Floodlight skini **yedi
 * gecelik seri** ile açılıyor, yani 7 gerçek bir kilometre taşı.
 */

const HEAT_HOT = "#f5402e";
const HEAT_NEXT = "#d43a63";
const RING_OFF = "rgba(255,255,255,.1)";
const INK = "#eceded";
const INK_2 = "#c9cccd";
const INK_4 = "#7f868b";

export default function StreakRing({ nights = 0 }) {
  const active = nights > 0;
  const progress = Math.min(1, nights / 7);
  const fill = active
    ? `conic-gradient(from -90deg,${HEAT_HOT} 0turn,${HEAT_NEXT} ${progress}turn,${RING_OFF} ${progress}turn)`
    : RING_OFF;

  return (
    <div
      role="img"
      aria-label={active ? `Streak: ${nights} ${nights === 1 ? "night" : "nights"}` : "No streak yet"}
      style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, height: 44,
               padding: "0 13px 0 9px", borderRadius: 999, background: "#121315",
               border: "1px solid var(--ri-line)" }}
    >
      <div style={{ position: "relative", width: 26, height: 26, display: "grid", placeItems: "center" }} aria-hidden="true">
        <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: fill }} />
        <div style={{ position: "absolute", inset: 3, borderRadius: 999, background: "#121315" }} />
        <span style={{ position: "relative", font: "700 12px/1 Rajdhani,system-ui,sans-serif", color: active ? INK : INK_4 }}>
          {nights}
        </span>
      </div>
      {/* §1.5 tip tabanı 9px — eski sürüm burada 7px kullanıyordu. */}
      <span style={{ font: "700 9px/1 Rajdhani,system-ui,sans-serif", letterSpacing: ".14em", color: INK_2 }} aria-hidden="true">
        {nights === 1 ? "NIGHT" : "NIGHTS"}
      </span>
    </div>
  );
}
