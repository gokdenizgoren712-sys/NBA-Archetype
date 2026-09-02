import { Star } from "lucide-react";

// ── Web yüzeyinin kart parçaları ─────────────────────────────────────────────
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
  return (
    <div className="ri-team-mark" style={{ "--team": team?.color || "#2a2c30" }}>
      {team?.crest
        ? <img src={team.crest} alt="" loading="lazy" />
        : <span>{(team?.short || team?.name || "?").slice(0, 3).toUpperCase()}</span>}
    </div>
  );
}

export function MatchCard({ match, onOpen }) {
  const finished = match.status === "finished";
  const live = match.status === "live";
  const rated = typeof match.communityRating === "number" && match.communityRating > 0;

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
              sıfır yazmak, oynanmamışı oynanmış gibi göstermek olurdu. */}
          {finished && match.score
            ? <strong>{match.score}</strong>
            : <><small>VERSUS</small><strong>VS</strong></>}
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
