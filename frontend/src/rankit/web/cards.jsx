import { Star } from "lucide-react";

// ── Web yüzeyinin kart parçaları ─────────────────────────────────────────────
//
// Tarih biçimi telefonla AYNI olmalı (RankItPrototype.fromApiMatch): iki yüzey
// aynı maçı farklı yazarsa kullanıcı iki ayrı ürün görür. Sunucu yalnızca ISO
// `starts_at` gönderiyor — `date_label` diye bir alan HİÇ yoktu, web onu okuyup
// boşa düşüyordu ve kartlarda saat hiç görünmüyordu.
export function formatWhen(startsAt) {
  const when = new Date(startsAt);
  if (!startsAt || Number.isNaN(when.getTime())) return { date: startsAt || "", time: "", full: startsAt || "" };
  const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(when);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(when);
  return { date, time, full: `${date} · ${time}` };
}

// Telefonun kartıyla AYNI CSS'i (ri-match-card ve ailesi) kullanıyor, ama aynı
// bileşen değil: telefonda kart sayfa açıyor, duvarda denetçiye yazıyor, ve
// masaüstünde yer olduğu için skor ile topluluk puanı aynı anda görünüyor.
// Ortak olan dil, davranış değil.

export function RankItMark({ size = 26 }) {
  // Primary Arch'ın 12-geni, içinde R. Marka işareti telefonda da bu.
  const r = size / 2;
  const points = Array.from({ length: 12 }, (_, i) => {
    const a = (Math.PI / 6) * i - Math.PI / 2;
    return `${(r + r * 0.97 * Math.cos(a)).toFixed(2)},${(r + r * 0.97 * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <polygon points={points} fill="none" stroke="var(--ri-gold, #FFB11B)" strokeWidth="1.4" />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill="var(--ri-gold, #FFB11B)"
        style={{ font: `800 ${size * 0.46}px var(--font-logo)` }}>R</text>
    </svg>
  );
}

/** Yarım yıldız. Salt okunur (onChange yoksa) ya da seçilebilir. */
export function Stars({ value = 0, onChange, compact = false }) {
  const stars = [1, 2, 3, 4, 5];
  const size = compact ? 12 : 21;
  if (!onChange) {
    return (
      <div className="ri-stars" aria-label={`${value} out of 5`}>
        {stars.map((s) => {
          const fill = Math.max(0, Math.min(1, value - (s - 1)));
          return (
            <span key={s} className="ri-star-glyph" style={{ "--star-fill": `${fill * 100}%` }}>
              <Star size={size} />
              <span><Star size={size} fill="currentColor" /></span>
            </span>
          );
        })}
      </div>
    );
  }
  return (
    <div className="ri-stars" role="group" aria-label="Your rating">
      {stars.map((s) => {
        const fill = Math.max(0, Math.min(1, value - (s - 1)));
        return (
          <span key={s} className="ri-star-glyph" style={{ "--star-fill": `${fill * 100}%` }}>
            <Star size={size} />
            <span><Star size={size} fill="currentColor" /></span>
            {/* Yarım yıldız: yıldızın sol yarısı .5, sağ yarısı tam puan. */}
            <button type="button" aria-label={`${s - 0.5} stars`}
              onClick={() => onChange(s - 0.5)}
              style={{ position: "absolute", inset: "0 50% 0 0", background: "none", border: 0, cursor: "pointer" }} />
            <button type="button" aria-label={`${s} stars`}
              onClick={() => onChange(s)}
              style={{ position: "absolute", inset: "0 0 0 50%", background: "none", border: 0, cursor: "pointer" }} />
          </span>
        );
      })}
    </div>
  );
}

export function TeamMark({ team }) {
  // Sunucu bu alanı `crest_url` diye gönderiyor (api/rankit.py _team). Burası
  // `crest` okuyordu, o yüzden web'de HİÇBİR kulüp arması render olmuyordu —
  // telefonun en tanınır görseli masaüstünde tamamen kayıptı.
  const crest = team?.crest_url || team?.crest;
  return (
    <div className="ri-team-mark" style={{ "--team": team?.color || "#2a2c30" }}>
      {crest
        ? <img src={crest} alt="" loading="lazy" />
        : <span>{(team?.short || team?.name || "?").slice(0, 3).toUpperCase()}</span>}
    </div>
  );
}

export function MatchCard({ match, onOpen, hideScores = false }) {
  const finished = match.status === "finished";
  const live = match.status === "live";
  const rated = typeof match.communityRating === "number" && match.communityRating > 0;
  // Skor gizleme telefonda ürünün imzası: maçı henüz izlememiş biri siteye
  // girip sonucu görmesin diye. Webde hiç yoktu — masaüstünde açan bir üye
  // dün geceyi puanlamaya gelirken sonucu kapıda öğreniyordu.
  const blur = hideScores && finished;

  return (
    <article
      className={`ri-match-card${match.instantClassic ? " instant" : ""}`}
      onClick={() => onOpen(match)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(match); } }}
      tabIndex={0} role="button"
      aria-label={`${match.home.name || match.home.short} versus ${match.away.name || match.away.short}`}
      style={{ "--home": match.home?.color, "--away": match.away?.color }}>
      <div className="ri-card-holo" />

      <div className="ri-match-top">
        <span>{match.competition}</span>
        {live ? <span className="ri-live-tag">LIVE</span>
          : rated ? (
            <span className="ri-community-rating">
              <Star size={11} fill="currentColor" /> {Number(match.communityRating).toFixed(1)}
            </span>
          ) : <span className="ri-live-date">{match.date}</span>}
      </div>

      <div className="ri-match-art">
        <div className="ri-team-side home"><TeamMark team={match.home} /></div>
        <div className="ri-versus">
          {/* Skoru olan maçta skor, olmayanda VS — puanlanmamış bir maça
              sıfır yazmak, oynanmamışı oynanmış gibi göstermek olurdu.
              VS'nin üstündeki satır eskiden "VERSUS" yazıyordu: altındaki
              "VS"i kelimesi kelimesine tekrar eden, hiçbir şey söylemeyen bir
              etiket. Yerini maçın saati aldı — okuyucunun gerçekten ihtiyacı
              olan tek bilgi. */}
          {finished && match.score
            ? <strong className={blur ? "ri-blur" : undefined}>{match.score}</strong>
            : <>{match.time && <small>{match.time}</small>}<strong>VS</strong></>}
        </div>
        <div className="ri-team-side away"><TeamMark team={match.away} /></div>
      </div>

      <div className="ri-score-band">
        <span>{match.home?.short || match.home?.name}</span>
        <span />
        <span>{match.away?.short || match.away?.name}</span>
      </div>

      <div className="ri-match-foot">
        {typeof match.myRating === "number" && match.myRating > 0 ? (
          <Stars value={match.myRating} compact />
        ) : (
          <span style={{ fontSize: 9, color: "#5f6265" }}>
            {finished ? "Not logged" : match.date}
          </span>
        )}
        <span>{match.reviews ? `${match.reviews} reviews` : ""}</span>
      </div>
    </article>
  );
}
