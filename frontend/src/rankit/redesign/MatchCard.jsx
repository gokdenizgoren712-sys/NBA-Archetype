/* MatchCard — BUILD.md Part I §2.
 *
 * Home, Diary ve Discover ortak bileşeni; eski kart yolu özellik bayrağıyla korunur.
 *
 * Kaynak: "Primary Arch UI Redesign/repair-kit/BUILD.md" §2 +
 * "RankIt Redesign.dc.html". Çelişkide BUILD.md kazanır.
 * §1 dışında hiçbir renk yok, yeni font yok, yeni stylesheet yok — bileşen
 * kendi stillerini satır içi taşıyor ki beşli cascade'e altıncı dosya eklenmesin
 * (§4.3).
 */

import { useState } from "react";
import { communityRatingCount, communityVerdictCovered, MIN_COMMUNITY_RATINGS } from "./heat";
import { skinTokens, normalizeSkin } from "./skins";

/* §2.8 — Mock katmanında proplar STRING gelir. "false"/"0"/"" hepsi false
   okunmalı, sayılar Number()'dan fallback ile geçmeli. İkisi de bir kez
   ısırmış; helper'lar korunuyor. */
const bool = (v, d) => {
  if (v === undefined || v === null) return d;
  if (v === "" || v === false || v === "false" || v === 0 || v === "0") return false;
  return true;
};
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/* §1 — ısı rampası: 5 basamak, kategorik. Sayısal değer HER ZAMAN yanında
   gider; renk tek başına anlam taşıyamaz. */
const RAMP = ["#2f5480", "#5b4fa8", "#9a3f96", "#d43a63", "#f5402e"];
const NAMES = ["COLD", "FLAT", "GOOD", "GREAT", "HOT"];
const REST = "rgba(255,255,255,.12)";

const CARD_BASE = "#151618";
const INK = "#eceded";
const GOLD = "#ffb11b";

const DIAMOND_SCALE = Math.SQRT2;
const PAIR_SCALE = 1 + DIAMOND_SCALE;

/* §2.3 + §2.7 — Kalkan. Döndürülmüş kare, yani sınırlayıcı kutusu side×1.414.
   Sütunu ondan boyutla yoksa rozetler kırpılır (0.5.2'de tam bu oldu).
   Yarıçap crest'ten TÜRETİLİR: sabit 18/21 yazılırsa crestSize 38'e
   inince şekil daireye dönüşüyor. */
export function Shield({ side, color, ink, abbr, crestUrl, badgeScale = 0.23, front = false, ring = null, gap = CARD_BASE }) {
  const [failedUrl, setFailedUrl] = useState(null);
  return (
    <div data-shield-footprint="" data-side={side} style={{
      width: side * DIAMOND_SCALE, height: side * DIAMOND_SCALE,
      display: "grid", placeItems: "center", flex: "none",
      ...(front ? { zIndex: 1 } : null),
    }}>
      <div data-shield-diamond="" style={{
        width: side, height: side,
        boxSizing: "border-box",
        transform: "rotate(45deg)",
        borderRadius: `${side * 0.29}px ${side * 0.29}px ${side * 0.34}px ${side * 0.34}px`,
        background: `linear-gradient(135deg,color-mix(in oklab,${color} 82%,#0b0b0b),color-mix(in oklab,${color} 30%,#0b0b0b))`,
        // `ring`: secim halkasi (4h'de secilen kulup 2px altin). Verilmezse
        // kalkanin kendi ince kenari.
        border: ring || "1px solid rgba(255,255,255,.18)",
        display: "grid", placeItems: "center", overflow: "hidden",
        /* §2.6 — öndeki kalkan kart zeminiyle bir çizgi taşır, yoksa iki
           kalkan tek şekle kaynıyor. */
        ...(front ? { boxShadow: `3px 0 0 ${gap}` } : null),
      }}>
        {/* §2.7 — Elmas ÇERÇEVE, logo değil. İçeride karşı-döndürülmüş kare,
            elmasın kenarının %62'si: yarıçap uygulandıktan sonra dönmüş
            köşeleri temizleyen en büyük kare. */}
        <div style={{ transform: "rotate(-45deg)", width: "62%", height: "62%", display: "grid", placeItems: "center" }}>
          {crestUrl && failedUrl !== crestUrl
            ? <img src={crestUrl} alt="" onError={() => setFailedUrl(crestUrl)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <span style={{
                fontSize: side * badgeScale, fontWeight: 700, letterSpacing: ".06em",
                color: ink, whiteSpace: "nowrap",
              }}>{abbr}</span>}
        </div>
      </div>
    </div>
  );
}

function HeatBars({ steps, gap, height, rest = REST }) {
  return (
    <div style={{ display: "flex", gap, minWidth: 0, flex: 1 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{
          flex: 1, height, borderRadius: height / 2 + 1,
          background: i < steps ? RAMP[i] : rest,
        }} />
      ))}
    </div>
  );
}

/* §3 — Classic damgası. Chip DEĞİL: CLASSIC üstte, RANKIT SELECT altta, çift
   altın cetvel, basılı mürekkep gibi döndürülmüş. text-indent letter-spacing'e
   EŞİT olmalı, yoksa tracking kelimeyi cetvellerin içinde sağa kaydırıyor. */
function ClassicStamp({ rotate = -7, color = GOLD }) {
  // Broadsheet'te altin #8a6a12'ye koyulasir (§4.2); cetveller ayni rengin tonlari.
  const rule = (a) => color === GOLD ? `rgba(255,177,27,${a})` : `color-mix(in oklab,${color} ${Math.round(a * 100)}%,transparent)`;
  return (
    <div style={{
      flex: "none", transform: `rotate(${rotate}deg)`,
      border: `1px solid ${rule(.85)}`, borderRadius: 6, padding: 2,
    }}>
      <div style={{
        border: `1px solid ${rule(.42)}`, borderRadius: 4,
        padding: "4px 9px 5px", textAlign: "center", whiteSpace: "nowrap",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1, letterSpacing: ".2em", textIndent: ".2em", color }}>CLASSIC</div>
        <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1, letterSpacing: ".2em", textIndent: ".2em", color: rule(.75), marginTop: 3 }}>RANKIT SELECT</div>
      </div>
    </div>
  );
}

/* §2.6'nın kompakt çifti. Aralık sahibin kararı: "ne kadar az örtüşüyorsa o
   kadar iyi" -> 2.414 (MatchCard ile aynı sabit). Tasarımın 52px'lik bloğuna
   sığması için elmas 22'ye iniyor; blok 53px, oran korunuyor. */
export function CrestPair({ home, away, side = 22 }) {
  const box = side * DIAMOND_SCALE;
  return (
    <div style={{ width: side * PAIR_SCALE, height: box, position: "relative", flex: "none" }} aria-hidden="true">
      <div style={{ position: "absolute", left: 0, top: 0 }}>
        <Shield side={side} color={home.color || GOLD} ink={INK} abbr={home.short} crestUrl={home.crest_url} badgeScale={0.3} />
      </div>
      <div style={{ position: "absolute", right: 0, top: 0 }}>
        <Shield side={side} color={away.color || GOLD} ink={INK} abbr={away.short} crestUrl={away.crest_url} badgeScale={0.3} front />
      </div>
    </div>
  );
}

export default function MatchCard(props) {
  const [revealed, setRevealed] = useState(false);
  const [ownReveal, setOwnReveal] = useState(false);
  /* 7h: kartın durduğu sayfanın da bir kapısı var — ikisi tek karar. Sayfa
     açtıysa kart açık (`communityRevealed`), kart açtıysa sayfaya haber
     verir (`onCommunityReveal`). Verilmezse kart kendi başına, eskisi gibi. */
  const communityRevealed = ownReveal || props.communityRevealed === true;
  const setCommunityRevealed = (value) => { setOwnReveal(value); if (value) props.onCommunityReveal?.(); };
  const {
    comp = "", statusLabel, homeAbbr = "", awayAbbr = "",
    homeShort, awayShort, homeScore = "", awayScore = "", kickoff = "",
    heatLabel = "", ratings = "", footNote = "",
    homeCrestInk = "#fff", awayCrestInk = "#fff",
    homeCrestUrl = "", awayCrestUrl = "",
    homeColor = "#3a3f47", awayColor = "#2a2e34",
    shirtNo = "", potmUrl = "",
    style, className, onClick, onOpenCompetition,
  } = props;

  const compact = bool(props.compact, false);
  const profileShelf = compact && bool(props.profileShelf, false);
  /* §4.2 — skin kartin DEGISKENLERINI degistirir, duzenini degil (4d).
     Verilmezse ya da bilinmiyorsa `default`: bugunku kartin ta kendisi. */
  const skinId = normalizeSkin(props.skin);
  const t = skinTokens(skinId, { homeColor, awayColor });
  const homeShield = t.shieldHome || homeColor;
  const awayShield = t.shieldAway || awayColor;
  const homeInk = t.crestInk || homeCrestInk;
  const awayInk = t.crestInk || awayCrestInk;
  const finished = bool(props.finished, true);
  const spoiler = bool(props.spoiler, false) && !revealed;
  const live = props.status === "live";
  // Sicak renk yalniz TAZE canli yayinda; bayat kaynak notr durur (B7).
  const liveFresh = live && !props.liveStale;
  const heat = num(props.heat, 0);
  const plannedHeat = num(props.expectedHeat, 0);
  const plannedCount = props.expectedRatingCount === null || props.expectedRatingCount === undefined || props.expectedRatingCount === ""
    ? null : Number(props.expectedRatingCount);
  const expectedKnown = !finished && !live && Number.isFinite(plannedCount) && plannedCount >= 0;
  const expected = expectedKnown && plannedCount >= MIN_COMMUNITY_RATINGS && plannedHeat > 0 && plannedHeat <= 5;
  const personalHeat = props.ratingKind === "personal";
  const verdictCovered = communityVerdictCovered({ ...props, finished }, { revealed: communityRevealed, personal: personalHeat });
  const classic = finished && bool(props.classic, false) && !spoiler && !verdictCovered;
  const ratingCount = communityRatingCount(props);
  const enoughRatings = ratingCount !== null && ratingCount >= MIN_COMMUNITY_RATINGS;
  const tooFewRatings = finished && !personalHeat && ratingCount !== null && !enoughRatings;
  const tooFewExpected = expectedKnown && plannedCount < MIN_COMMUNITY_RATINGS;
  const heatOn = expected
    ? !spoiler
    : finished && bool(props.heatOn, heat > 0) && (personalHeat || enoughRatings) && !spoiler && !verdictCovered;
  const potm = finished && bool(props.potm, false) && !spoiler && !verdictCovered && !compact;

  const cut = num(props.cut, compact ? 14 : 22);
  const crest = num(props.crestSize, compact ? 40 : 62);
  const artHeight = num(props.artHeight, 96);
  const scoreSize = num(props.scoreSize, compact ? 26 : 46);

  const displayHeat = expected ? plannedHeat : heat;
  const steps = Math.max(0, Math.min(5, Math.round(displayHeat)));
  const heatText = displayHeat ? displayHeat.toFixed(1) : "";
  const visibleRatings = expectedKnown
    ? `${plannedCount.toLocaleString()} ${expected ? "want it" : "readings"}`
    : verdictCovered && props.ratingKind === "member" ? "" : ratings;
  const heatName = expected ? "EXPECTED" : heatLabel || (steps ? NAMES[steps - 1] : "");
  const heatInk = steps >= 5 ? RAMP[4] : steps === 4 ? RAMP[3] : steps === 3 ? RAMP[2] : t.eyebrow;

  const status = spoiler && finished ? "PLAYED" : (statusLabel ?? (finished ? "FULL TIME" : "UPCOMING"));
  const hShort = homeShort ?? homeAbbr;
  const aShort = awayShort ?? awayAbbr;
  const scoreInArt = (finished || live) && !potm;
  const score = spoiler ? <span aria-label="Score hidden">—</span>
    : props.sport === "Basketball" ? <span style={{display:"flex",flexDirection:"column",gap:4}}><span>{homeScore || "—"}</span><span>{awayScore || "—"}</span></span>
    : <>{homeScore || "—"}<span style={{ opacity: .42, margin: "0 5px" }}>–</span>{awayScore || "—"}</>;
  const reveal = <button type="button" className="ri-card-reveal" onClick={event => {
    event.stopPropagation(); setRevealed(true); setCommunityRevealed(true);
  }}>Reveal this match</button>;
  const verdictGate = !spoiler && verdictCovered && (
    <div data-community-gate="" style={{ minWidth: 0, display: "grid", gap: compact ? 4 : 7, padding: compact ? "4px 0" : "0 18px 13px" }}>
      <div aria-hidden="true" style={{ filter: "blur(3px)", opacity: .6 }}><HeatBars steps={3} gap={compact ? 3 : 4} height={compact ? 4 : 5} rest={t.rest} /></div>
      <span style={{ color: t.eyebrow, fontSize: compact ? 9 : 11, lineHeight: 1.25, fontFamily: "var(--font-sans)" }}>
        Rate it first — then see whether the room agreed with you.
      </span>
      <button type="button" className="ri-gate-action" onClick={event => { event.stopPropagation(); setCommunityRevealed(true); }}
        style={{ justifySelf: "start", padding: 0, border: 0, background: "none", color: t.eyebrow, font: "700 10px var(--font-logo)", letterSpacing: ".12em", cursor: "pointer" }}>
        REVEAL ANYWAY
      </button>
    </div>
  );
  const competition = onOpenCompetition ? <button type="button" className="ri-card-competition"
    onClick={event => { event.stopPropagation(); onOpenCompetition(); }}>{comp}</button> : comp;

  /* §2.1 — Çentik ve üzerinden geçen saç çizgisi. Altın olan KART KENARI
     DEĞİL bu çizgi; Instant Classic'te renk değiştiren tek eleman bu.
     Değerler cut'tan türer: 22 → 11 / -4.51 / 31.1 (dokümandaki sayılar). */
  const tearY = compact ? (profileShelf ? 22 : 27) : 50;
  const stubMask = `radial-gradient(circle 7px at 0 ${tearY}px,#0000 98%,#000) left/51% 100% no-repeat,radial-gradient(circle 7px at 100% ${tearY}px,#0000 98%,#000) right/51% 100% no-repeat`;
  const notchOff = cut / 2;
  const notchNeg = -(cut * 0.205);
  const notchLen = cut * 1.414;
  const notchLine = classic ? t.classicNotch : t.notch;
  const hair = {
    position: "absolute", width: notchLen, height: 1,
    background: notchLine, transform: "rotate(45deg)", pointerEvents: "none",
  };

  const shell = {
    position: "relative", width: "100%", height: "100%", minWidth: 0,
    borderRadius: t.stub ? 14 : cut,
    clipPath: t.stub ? "none" : `polygon(0 0,calc(100% - ${cut}px) 0,100% ${cut}px,100% 100%,${cut}px 100%,0 calc(100% - ${cut}px))`,
    /* Stub (4d): cekme yerine bilet koçanı — iki yandan zımba deligi. Delik
       maskeyle ACILIR, arka plan rengiyle boyanmaz: kart her yuzeyde durur. */
    ...(t.stub ? { WebkitMask: stubMask, mask: stubMask } : null),
    /* §2.2 — Zemin. Kulüp renkleri APİ'den prop olarak gelir, asla sabit değil. */
    background: t.base,
    boxShadow: "0 14px 34px rgba(0,0,0,.28)",
    fontFamily: "var(--font-logo)",
    color: t.ink,
    display: "flex", flexDirection: "column", overflow: "hidden",
    ...style,
  };

  /* §2.2 — Parıltı 68°, 112° değil. */
  const sheen = {
    position: "absolute", inset: 0, pointerEvents: "none",
    background: t.sheen,
  };

  const frame = (
    <>
      {t.sheen !== "none" && <div style={sheen} />}
      {t.wash && <div data-skin-wash="" style={{ ...sheen, background: t.wash }} />}
      {t.stub
        ? <div data-stub-tear="" style={{ position: "absolute", left: 0, right: 0, top: tearY, borderTop: `1px dashed ${t.notch}`, pointerEvents: "none" }} />
        : <>
          <div data-notch-hairline="" data-corner="top-right" style={{ ...hair, top: notchOff, right: notchNeg }} />
          <div data-notch-hairline="" data-corner="bottom-left" style={{ ...hair, bottom: notchOff, left: notchNeg }} />
        </>}
    </>
  );
  const skinAttr = skinId === "default" ? null : { "data-skin": skinId };

  /* ── §2.6 Compact — raf düzeni ──────────────────────────────────────────
     Geniş kart crest·skor·crest'i tek sıraya diziyor; ~170px altında üçü
     ~50px'e sıkışıp çakışıyor. Compact KÜÇÜLTMÜYOR, yeniden diziyor. */
  if (compact) {
    /* BUILD §2.6: merkezler 1.0×crest arayla, kapsayıcı 2.414×.
       Ölçüm kalkandan kalkana, dönmüş border-box'tan DEĞİL. */
    const pairW = crest * PAIR_SCALE;
    const pairH = crest * DIAMOND_SCALE;
    return (
      <div data-match-card="" data-layout="compact" {...skinAttr} style={shell} className={className} onClick={onClick}>
        {frame}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", minWidth: 0, padding: profileShelf ? "8px 12px" : "11px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0, marginBottom: profileShelf ? 6 : 9 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".13em", textTransform: "uppercase", color: t.eyebrow, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{competition}</span>
            {/* Compact'ta Classic tam damga değil, eyebrow'da küçük altın elmas. */}
            {classic && <div style={{ width: 11, height: 11, transform: "rotate(45deg)", borderRadius: "3px 3px 4px 4px", background: t.gold, flex: "none" }} />}
          </div>

          <div style={{ position: "relative", height: pairH, flex: "none", display: "flex", alignItems: "center", minWidth: 0 }}>
            <div style={{ position: "relative", width: pairW, height: "100%", flex: "none" }}>
              <div style={{ position: "absolute", left: crest, top: "50%", transform: "translateY(-50%)" }}>
                <Shield side={crest} color={awayShield} ink={awayInk} abbr={awayAbbr} crestUrl={awayCrestUrl} badgeScale={0.26} />
              </div>
              {/* Ev sahibi ÖNDE — DOM'da sonra + z-index, gölgesiyle ayrışıyor. */}
              <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)" }}>
                <Shield side={crest} color={homeShield} ink={homeInk} abbr={homeAbbr} crestUrl={homeCrestUrl} badgeScale={0.26} front gap={t.gap} />
              </div>
            </div>
          </div>

          <div style={{ marginTop: profileShelf ? 6 : 9, minWidth: 0 }}>
            {!profileShelf && <small style={{color:liveFresh ? RAMP[4] : t.eyebrow}}>{status}</small>}
            {scoreInArt ? (
              <div style={{ fontSize: scoreSize, fontWeight: 700, lineHeight: 1, letterSpacing: ".01em", color: t.score, filter: spoiler ? "blur(9px)" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {score}
              </div>
            ) : (
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1, letterSpacing: ".02em", color: t.ink, whiteSpace: "nowrap" }}>{kickoff}</div>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.35, letterSpacing: ".02em", color: t.ink, marginTop: profileShelf ? 4 : 7, minWidth: 0 }}>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hShort}</div>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.eyebrow }}>{aShort}</div>
            </div>
          </div>

          <div style={{ marginTop: "auto", minWidth: 0 }}>
            {/* Isı tek satır: barlar + sayı, etiket yok. */}
            {heatOn && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <HeatBars steps={steps} gap={3} height={4} rest={t.rest} />
                {/* 7f başkasının rafı: kişisel puan ONUN — "YOU" değil (ratingOwner="member"). */}
                <span title={personalHeat ? (props.ratingOwner === "member" ? "Their rating" : "Your rating") : "Community rating"} style={{ fontSize: 10, fontWeight: 700, color: heatInk, flex: "none" }}>{personalHeat ? (props.ratingOwner === "member" ? "RATED " : "YOU ") : ""}{heatText}</span>
              </div>
            )}
            {(tooFewRatings && !spoiler && !verdictCovered || tooFewExpected) && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                <HeatBars steps={0} gap={3} height={4} rest={t.rest} />
                <span style={{ fontSize: 9, fontWeight: 700, color: t.eyebrow, whiteSpace: "nowrap" }}>TOO FEW RATINGS</span>
              </div>
            )}
            {verdictGate}
            {spoiler && (
              <div style={{ minHeight: 44, borderRadius: 6, background: "rgba(9,10,11,.5)", border: "1px solid rgba(255,255,255,.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {reveal}
              </div>
            )}
            {!!visibleRatings && (
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: t.eyebrow, marginTop: 7, whiteSpace: "nowrap", overflow: "hidden" }}>{visibleRatings}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Geniş düzen (§2.4 sırası) ──────────────────────────────────────── */
  return (
    <div data-match-card="" data-layout="wide" {...skinAttr} style={shell} className={className} onClick={onClick}>
      {frame}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>

        {/* 1 — Başlık satırı */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "13px 18px 0", minHeight: 37, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", height: 36, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: t.eyebrow, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{competition}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", height: 26, padding: "0 10px", borderRadius: 999, background: t.pill, border: `1px solid ${t.pillLine}`, flex: "none" }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: liveFresh ? RAMP[4] : t.ink, whiteSpace: "nowrap" }}>{status}</span>
          </div>
        </div>

        {/* 2 — Sanat alanı. SABİT yükseklik; flex:1 YASAK (§2.4): içerik kısaysa
             kart kısalır, kart havayla dolmaz. */}
        <div style={{ height: artHeight, display: "flex", alignItems: "center", justifyContent: "center", gap: 13, padding: "0 18px", flex: "none", minWidth: 0 }}>
          <Shield side={crest} color={homeShield} ink={homeInk} abbr={homeAbbr} crestUrl={homeCrestUrl} />
          <div style={{ position: "relative", flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {potm && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden" }}>
                <span style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)", fontSize: crest * 2.1, fontWeight: 700, lineHeight: 0.78, letterSpacing: "-.04em", color: "rgba(255,255,255,.06)", pointerEvents: "none" }}>{shirtNo}</span>
                {potmUrl && <img src={potmUrl} alt="" style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain" }} />}
              </div>
            )}
            {scoreInArt && (
              <div style={{ position: "relative", fontSize: scoreSize, fontWeight: 700, lineHeight: 1, letterSpacing: ".01em", color: t.score, filter: spoiler ? "blur(9px)" : "none", whiteSpace: "nowrap" }}>
                {score}
              </div>
            )}
            {!finished && !live && (
              <div style={{ position: "relative", textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: ".02em", color: t.ink }}>{kickoff}</div>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: ".06em", color: t.faint, marginTop: 4 }}>VS</div>
              </div>
            )}
          </div>
          <Shield side={crest} color={awayShield} ink={awayInk} abbr={awayAbbr} crestUrl={awayCrestUrl} />
        </div>

        {/* 3 — Skor bandı. POTM sanat alanını kaplayınca skor buraya düşer. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 13, padding: "0 18px 13px", minWidth: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".02em", color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hShort}</div>
          </div>
          {potm && (
            <div style={{ flex: "none", fontSize: 21, fontWeight: 700, lineHeight: 1, color: t.score, whiteSpace: "nowrap" }}>
              {homeScore}<span style={{ opacity: 0.42, margin: "0 6px" }}>–</span>{awayScore}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1, textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".02em", color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{aShort}</div>
          </div>
        </div>

        {/* 4 — Isı satırı. Spoiler'da gizli. */}
        {heatOn && (
          <div style={{ padding: "0 18px 13px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 9, marginBottom: 6, minWidth: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: heatInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{heatName}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.ink, flex: "none" }}>{heatText}</span>
            </div>
            <HeatBars steps={steps} gap={4} height={5} rest={t.rest} />
          </div>
        )}
        {(tooFewRatings && !spoiler && !verdictCovered || tooFewExpected) && (
          <div style={{ padding: "0 18px 13px", minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: t.eyebrow, marginBottom: 6 }}>TOO FEW RATINGS</div>
            <HeatBars steps={0} gap={4} height={5} rest={t.rest} />
          </div>
        )}
        {verdictGate}

        {/* 5 — Açığa çıkarma şeridi, yalnızca spoiler'da. */}
        {spoiler && (
          <div style={{ margin: "0 18px 13px", minHeight: 44, borderRadius: 10, background: "rgba(9,10,11,.5)", border: "1px solid rgba(255,255,255,.16)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.soft} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
            </svg>
            {reveal}
          </div>
        )}

        {/* 6 — Ayak. Damga varken 52px, yoksa 44px — damga yükseklik EKLEMEZ,
             etiketin yerini alır. */}
        <div style={{ marginTop: "auto", height: classic ? 52 : 44, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 18px", background: t.footer, borderTop: `1px solid ${t.rule}`, minWidth: 0 }}>
          {classic
            ? <ClassicStamp color={t.gold} />
            : <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: t.eyebrow, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{spoiler && finished ? "Result hidden" : verdictCovered && finished ? "Community verdict hidden" : footNote}</span>}
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: t.eyebrow, whiteSpace: "nowrap", flex: "none" }}>{visibleRatings}</span>
        </div>
      </div>
    </div>
  );
}
