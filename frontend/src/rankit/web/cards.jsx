import { Star } from "lucide-react";
import SharedMatchCard from "../redesign/MatchCard";
import { diaryToMatchCardProps, toMatchCardProps } from "../redesign/toMatchCardProps";
import { fromApiMatch } from "../matchModel";
export { formatWhen } from "../formatWhen";

// ── Web yüzeyinin kart parçaları ─────────────────────────────────────────────
//
// Tarih ve saat mobil kartla aynı ortak formatWhen kaynağından gelir.

// RankIt isareti: telefonla TEK bilesen (BUILD §7.2, 4i). Eski 12-gen + R
// madalyonu 4i ile emekli oldu.
export { RankItMark } from "../redesign/BrandMark";

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

/* Duvar kartı — telefonla AYNI MatchCard (redesign/MatchCard.jsx), BUILD
   §18'in 320 ön ayarıyla: crest 56, sanat 132, skor 46. Aşama 15'e kadar
   webin kendi kartı vardı (aynı CSS, farklı bileşen); skinler, ısı eşiği,
   kalkan ve hüküm kapısı iki yüzeyde ayrı ayrı yazılıyordu ve ayrışıyordu.
   Kartı çizen tek bileşen artık ikisinde de aynı; web yalnız yuvayı veriyor
   (tıklayınca sayfa değil denetçi).

   `card` web satırı (toCard / diaryToCard): `raw` API satırıdır. Günlük
   satırı ayrı şekilde geliyor, kendi çeviricisinden geçer (kişisel puan). */
const WALL = { scoreSize: 46, cardWidth: 320, crestSize: 56 };

export function WallCard({ card, onOpen, hideScores = false }) {
  const opts = { ...WALL, hideScores };
  const props = card.diary ? diaryToMatchCardProps(card.raw, opts) : toMatchCardProps(fromApiMatch(card.raw || card), opts);
  const open = () => onOpen(card);
  return (
    <div className="riw-card-slot" role="button" tabIndex={0}
      aria-label={`${card.home?.name || card.home?.short} versus ${card.away?.name || card.away?.short}`}
      onClick={(event) => { if (!event.target.closest("button")) open(); }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(); }
      }}>
      <SharedMatchCard {...props} artHeight={132} crestSize={56} cut={22} />
    </div>
  );
}
