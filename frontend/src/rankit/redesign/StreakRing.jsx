/* Streak halkası — HANDOFF §7.2, ekran 2a'daki "12 NIGHTS".
 *
 * DİKKAT — bu mekanik arka uçta YOK. `streak` diye bir alan hiçbir uçta
 * geçmiyor. Burada günlükten hesaplanabilen kısmı hesaplıyoruz:
 *
 *   §7.2 çekirdek kuralı: bir gece, OYNANDIĞI GÜN en az bir maç puanlarsan
 *   sayılır (kullanıcının kendi saat diliminde). Günlükte `watched_date` ve
 *   maçta `starts_at` var, yani bu kısım gerçekten türetilebilir.
 *
 * Türetilemeyen kısım: "dinlenme gecesi" — izleyebileceğin maç olmayan gece
 * seriyi ne uzatır ne kırar. Bunun için kullanıcının NEYİ takip ettiğini
 * bilmek gerekiyor ve o veri istemcide yok. Yani bu sayı milli aralarda
 * §7.2'nin yasakladığı şekilde kırılır. Gerçek mekanik arka uç işi ve
 * gönderilen faz listesinde bir karşılığı yok.
 */

const GOLD = "#ffb11b";
const INK_4 = "#7f868b";

export default function StreakRing({ nights = 0, size = 44 }) {
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  // Halka yedi gecede dolar: §7.2'ye göre 7 gece ilk skini açıyor.
  const progress = Math.min(1, nights / 7);
  const active = nights > 0;

  return (
    <div
      style={{ position: "relative", width: size, height: size, flex: "none", display: "grid", placeItems: "center" }}
      role="img"
      aria-label={active ? `Streak: ${nights} ${nights === 1 ? "night" : "nights"}` : "No streak yet"}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2" />
        {active && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={GOLD} strokeWidth="2" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        )}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
        <strong style={{ font: "700 15px Rajdhani,system-ui,sans-serif", color: active ? "#eceded" : INK_4 }}>
          {nights}
        </strong>
        <span style={{ font: "700 7px Rajdhani,system-ui,sans-serif", letterSpacing: ".14em", color: INK_4, marginTop: 1 }}>
          {nights === 1 ? "NIGHT" : "NIGHTS"}
        </span>
      </div>
    </div>
  );
}
