import { useState } from "react";
import { Star } from "lucide-react";
import { hidesScore } from "../rankitPrefs";
import { communityHeat, communityRatingCount, communityVerdictCovered, MIN_COMMUNITY_RATINGS } from "../redesign/heat";
export { formatWhen } from "../formatWhen";

// ── Web yüzeyinin kart parçaları ─────────────────────────────────────────────
//
// Tarih ve saat mobil kartla aynı ortak formatWhen kaynağından gelir.

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
  // `has-logo` şart: elmas çerçeve rotate(45deg) ve armayı düzelten
  // ters-döndürme + boyutlandırma YALNIZCA bu sınıfın kuralında. Sınıfsız
  // render'da <img> 0×0 kalıyor ve döndürülmüş kalıyordu — telefonda sınıf
  // var, webde yoktu.
  return (
    <div className={`ri-team-mark${crest ? " has-logo" : ""}`}
      style={{ "--team": team?.color || "#2a2c30" }}>
      {crest
        ? <img src={crest} alt="" loading="lazy" />
        : <span>{(team?.short || team?.name || "?").slice(0, 3).toUpperCase()}</span>}
    </div>
  );
}

export function MatchCard({ match, onOpen, hideScores = false }) {
  const [communityRevealed, setCommunityRevealed] = useState(false);
  const finished = match.status === "finished";
  const live = match.status === "live";
  const rating = finished ? communityHeat(match) : null;
  const count = finished ? communityRatingCount(match) : null;
  // Skor gizleme telefonda ürünün imzası: maçı henüz izlememiş biri siteye
  // girip sonucu görmesin diye. Webde hiç yoktu — masaüstünde açan bir üye
  // dün geceyi puanlamaya gelirken sonucu kapıda öğreniyordu.
  const blur = hidesScore(hideScores, match);
  const verdictCovered = communityVerdictCovered(match, { revealed: communityRevealed });

  return (
    <article
      className={`ri-match-card${finished && match.instantClassic && !blur && !verdictCovered ? " instant" : ""}`}
      onClick={() => onOpen(match)}
      onKeyDown={(e) => { if (!e.target.closest("button") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(match); } }}
      tabIndex={0} role="button"
      aria-label={`${match.home.name || match.home.short} versus ${match.away.name || match.away.short}`}
      style={{ "--home": match.home?.color, "--away": match.away?.color }}>
      <div className="ri-card-holo" />

      <div className="ri-match-top">
        <span>{match.competition}</span>
        {live ? <span className="ri-live-tag">LIVE</span>
          : blur ? <span className="ri-live-date">PLAYED</span>
          : verdictCovered ? <span className="ri-live-date">FULL TIME</span>
          : rating !== null ? (
            <span className="ri-community-rating">
              <Star size={11} fill="currentColor" /> {rating.toFixed(1)}
            </span>
          ) : <span className="ri-live-date">{finished && count !== null && count < MIN_COMMUNITY_RATINGS ? "TOO FEW RATINGS" : match.date}</span>}
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
            ? <strong className={blur ? "ri-blur" : undefined} aria-label={blur ? "Score hidden" : undefined}>{blur ? "—" : match.score}</strong>
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
        {/* Eskiden burası, maç bitmemişse tam tarihi ÜÇÜNCÜ kez yazıyordu
            (üst şeritte ve ortadaki VS'nin üstünde zaten var). Telefonun
            kendi kartı bu satırı hiç tarih için kullanmıyor — yayın bilgisi
            için kullanıyor. Aynı desen: gerçekten yeni bir bilgi, tekrar
            değil. */}
        {typeof match.myRating === "number" && match.myRating > 0 ? (
          <Stars value={match.myRating} compact />
        ) : finished ? (
          <span style={{ fontSize: 9, color: "#7f868b" }}>Not logged</span>
        ) : (
          <span style={{ fontSize: 9, color: "#7f868b" }}>
            {match.broadcaster ? `Watch on ${match.broadcaster}` : "Broadcast details pending"}
          </span>
        )}
        <span>
          {finished && match.dominantTag && !blur && !verdictCovered ? match.dominantTag
            : match.stage || (match.reviews ? `${match.reviews} reviews` : "")}
        </span>
      </div>
      {verdictCovered && !blur && <button type="button" className="ri-spoiler-gate" onClick={(event) => { event.stopPropagation(); setCommunityRevealed(true); }}>
        Rate it first — then see whether the room agreed with you. <b>REVEAL ANYWAY</b>
      </button>}
    </article>
  );
}
