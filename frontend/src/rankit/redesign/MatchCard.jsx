/* MatchCard — HANDOFF.md §2.
 *
 * Faz 1: bileşen TEK BAŞINA. Hiçbir ekran buna bağlanmadı; Home/Diary/Discover
 * hâlâ eski karta bakıyor (§0 faz 2-3).
 *
 * Kaynak: "Primary Arch UI Redesign/HANDOFF.md" §2 + MatchCard.dc.html.
 * §1 dışında hiçbir renk yok, yeni font yok, yeni stylesheet yok — bileşen
 * kendi stillerini satır içi taşıyor ki beşli cascade'e altıncı dosya eklenmesin
 * (§4.3).
 */

/* §2.8 — Mock katmanında proplar STRING gelir. "false"/"0"/"" hepsi false
   okunmalı, sayılar Number()'dan fallback ile geçmeli. İkisi de bir kez
   ısırmış; helper'lar korunuyor. */
const bool = (v, d) => {
  if (v === undefined || v === null || v === "") return d;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return true;
};
const num = (v, d) => {
  const n = Number(v);
  return Number.isNaN(n) ? d : n;
};

/* §1 — ısı rampası: 5 basamak, kategorik. Sayısal değer HER ZAMAN yanında
   gider; renk tek başına anlam taşıyamaz. */
const RAMP = ["#2f5480", "#5b4fa8", "#9a3f96", "#d43a63", "#f5402e"];
const NAMES = ["COLD", "FLAT", "GOOD", "GREAT", "HOT"];
const REST = "rgba(255,255,255,.12)";

const CARD_BASE = "#151618";
const INK = "#eceded";
const INK_3 = "#9aa0a6";
const INK_2 = "#c9cccd";
const GOLD = "#ffb11b";

/* §2.3 + §2.7 — Kalkan. Döndürülmüş kare, yani sınırlayıcı kutusu side×1.414.
   Sütunu ondan boyutla yoksa rozetler kırpılır (0.5.2'de tam bu oldu).
   Yarıçap crest'ten TÜRETİLİR: sabit 18/21 yazılırsa crestSize 38'e
   inince şekil daireye dönüşüyor. */
export function Shield({ side, color, ink, abbr, crestUrl, badgeScale = 0.23, front = false }) {
  return (
    <div style={{
      width: side * 1.414, height: side * 1.414,
      display: "grid", placeItems: "center", flex: "none",
      ...(front ? { zIndex: 1 } : null),
    }}>
      <div style={{
        width: side, height: side,
        transform: "rotate(45deg)",
        borderRadius: `${side * 0.29}px ${side * 0.29}px ${side * 0.34}px ${side * 0.34}px`,
        background: `linear-gradient(135deg,color-mix(in oklab,${color} 82%,#0b0b0b),color-mix(in oklab,${color} 30%,#0b0b0b))`,
        border: "1px solid rgba(255,255,255,.18)",
        display: "grid", placeItems: "center", overflow: "hidden",
        /* §2.6 — öndeki kalkan kart zeminiyle bir çizgi taşır, yoksa iki
           kalkan tek şekle kaynıyor. */
        ...(front ? { boxShadow: `3px 0 0 ${CARD_BASE}` } : null),
      }}>
        {/* §2.7 — Elmas ÇERÇEVE, logo değil. İçeride karşı-döndürülmüş kare,
            elmasın kenarının %62'si: yarıçap uygulandıktan sonra dönmüş
            köşeleri temizleyen en büyük kare. */}
        <div style={{ transform: "rotate(-45deg)", width: "62%", height: "62%", display: "grid", placeItems: "center" }}>
          {crestUrl
            ? <img src={crestUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <span style={{
                fontSize: side * badgeScale, fontWeight: 700, letterSpacing: ".06em",
                color: ink, whiteSpace: "nowrap",
              }}>{abbr}</span>}
        </div>
      </div>
    </div>
  );
}

function HeatBars({ steps, gap, height }) {
  return (
    <div style={{ display: "flex", gap, minWidth: 0, flex: 1 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{
          flex: 1, height, borderRadius: height / 2 + 1,
          background: i < steps ? RAMP[i] : REST,
        }} />
      ))}
    </div>
  );
}

/* §3 — Classic damgası. Chip DEĞİL: CLASSIC üstte, RANKIT SELECT altta, çift
   altın cetvel, basılı mürekkep gibi döndürülmüş. text-indent letter-spacing'e
   EŞİT olmalı, yoksa tracking kelimeyi cetvellerin içinde sağa kaydırıyor. */
function ClassicStamp({ rotate = -7 }) {
  return (
    <div style={{
      flex: "none", transform: `rotate(${rotate}deg)`,
      border: "1px solid rgba(255,177,27,.85)", borderRadius: 6, padding: 2,
    }}>
      <div style={{
        border: "1px solid rgba(255,177,27,.42)", borderRadius: 4,
        padding: "4px 9px 5px", textAlign: "center", whiteSpace: "nowrap",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1, letterSpacing: ".2em", textIndent: ".2em", color: GOLD }}>CLASSIC</div>
        <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1, letterSpacing: ".2em", textIndent: ".2em", color: "rgba(255,177,27,.75)", marginTop: 3 }}>RANKIT SELECT</div>
      </div>
    </div>
  );
}

/* §2.6'nın kompakt çifti. Aralık sahibin kararı: "ne kadar az örtüşüyorsa o
   kadar iyi" -> 2.414 (MatchCard ile aynı sabit). Tasarımın 52px'lik bloğuna
   sığması için elmas 22'ye iniyor; blok 53px, oran korunuyor. */
export function CrestPair({ home, away, side = 22 }) {
  const box = side * 1.414;
  return (
    <div style={{ width: side * 2.414, height: box, position: "relative", flex: "none" }} aria-hidden="true">
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
  const {
    comp = "", statusLabel, homeAbbr = "", awayAbbr = "",
    homeShort, awayShort, homeScore = "", awayScore = "", kickoff = "",
    heatLabel = "", ratings = "", footNote = "",
    homeCrestInk = "#fff", awayCrestInk = "#fff",
    homeCrestUrl = "", awayCrestUrl = "",
    homeColor = "#3a3f47", awayColor = "#2a2e34",
    shirtNo = "", potmUrl = "",
    style, className, onClick,
  } = props;

  const compact = bool(props.compact, false);
  const finished = bool(props.finished, true);
  const spoiler = bool(props.spoiler, false);
  const classic = bool(props.classic, false) && !spoiler;
  const heat = num(props.heat, 0);
  const heatOn = bool(props.heatOn, heat > 0) && !spoiler;
  const potm = bool(props.potm, false) && !spoiler && !compact;

  const cut = num(props.cut, compact ? 14 : 22);
  const crest = num(props.crestSize, compact ? 40 : 62);
  const artHeight = num(props.artHeight, 96);
  const scoreSize = num(props.scoreSize, compact ? 26 : 46);

  const steps = Math.max(0, Math.min(5, Math.round(heat)));
  const heatText = heat ? heat.toFixed(1) : "";
  const heatName = heatLabel || (steps ? NAMES[steps - 1] : "");
  const heatInk = steps >= 5 ? RAMP[4] : steps === 4 ? RAMP[3] : steps === 3 ? RAMP[2] : INK_3;

  const status = spoiler && finished ? "PLAYED" : (statusLabel ?? (finished ? "FULL TIME" : "UPCOMING"));
  const hShort = homeShort ?? homeAbbr;
  const aShort = awayShort ?? awayAbbr;
  const scoreInArt = finished && !potm;

  /* §2.1 — Çentik ve üzerinden geçen saç çizgisi. Altın olan KART KENARI
     DEĞİL bu çizgi; Instant Classic'te renk değiştiren tek eleman bu.
     Değerler cut'tan türer: 22 → 11 / -4.51 / 31.1 (dokümandaki sayılar). */
  const notchOff = cut / 2;
  const notchNeg = -(cut * 0.205);
  const notchLen = cut * 1.414;
  const notchLine = classic ? GOLD : "rgba(255,255,255,.22)";
  const hair = {
    position: "absolute", width: notchLen, height: 1,
    background: notchLine, transform: "rotate(45deg)", pointerEvents: "none",
  };

  const shell = {
    position: "relative", width: "100%", height: "100%", minWidth: 0,
    borderRadius: cut,
    clipPath: `polygon(0 0,calc(100% - ${cut}px) 0,100% ${cut}px,100% 100%,${cut}px 100%,0 calc(100% - ${cut}px))`,
    /* §2.2 — Zemin. Kulüp renkleri APİ'den prop olarak gelir, asla sabit değil. */
    background: `linear-gradient(155deg,color-mix(in oklab,${homeColor} 44%,${CARD_BASE}) 0%,${CARD_BASE} 54%,color-mix(in oklab,${awayColor} 34%,${CARD_BASE}) 100%)`,
    boxShadow: "0 14px 34px rgba(0,0,0,.28)",
    fontFamily: "Rajdhani,system-ui,sans-serif",
    color: INK,
    display: "flex", flexDirection: "column", overflow: "hidden",
    ...style,
  };

  /* §2.2 — Parıltı 68°, 112° değil. */
  const sheen = {
    position: "absolute", inset: 0, pointerEvents: "none",
    background: "repeating-linear-gradient(68deg,rgba(255,255,255,.055) 0 2px,transparent 2px 11px)",
  };

  const frame = (
    <>
      <div style={sheen} />
      <div style={{ ...hair, top: notchOff, right: notchNeg }} />
      <div style={{ ...hair, bottom: notchOff, left: notchNeg }} />
    </>
  );

  /* ── §2.6 Compact — raf düzeni ──────────────────────────────────────────
     Geniş kart crest·skor·crest'i tek sıraya diziyor; ~170px altında üçü
     ~50px'e sıkışıp çakışıyor. Compact KÜÇÜLTMÜYOR, yeniden diziyor. */
  if (compact) {
    /* Merkezler 1.0×crest arayla, kapsayıcı 2.414×.
       HANDOFF §2.6 metni 0.73/2.144 diyor ama MatchCard.dc.html 1.0/2.414
       uyguluyor: %48'e karşı %29 örtüşme. Kullanıcı kararı — "ne kadar az
       örtüşüyorsa o kadar iyi" — ve çelişkide Claude Design kazanıyor.
       Ölçüm kalkandan kalkana, dönmüş sınırlayıcı kutudan DEĞİL (o 1.414× geniş). */
    const pairW = crest * 2.414;
    const pairH = crest * 1.414;
    return (
      <div style={shell} className={className} onClick={onClick}>
        {frame}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", minWidth: 0, padding: "11px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0, marginBottom: 9 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".13em", textTransform: "uppercase", color: INK_3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{comp}</span>
            {/* Compact'ta Classic tam damga değil, eyebrow'da küçük altın elmas. */}
            {classic && <div style={{ width: 11, height: 11, transform: "rotate(45deg)", borderRadius: "3px 3px 4px 4px", background: GOLD, flex: "none" }} />}
          </div>

          <div style={{ position: "relative", height: pairH, flex: "none", display: "flex", alignItems: "center", minWidth: 0 }}>
            <div style={{ position: "relative", width: pairW, height: "100%", flex: "none" }}>
              <div style={{ position: "absolute", left: crest, top: "50%", transform: "translateY(-50%)" }}>
                <Shield side={crest} color={awayColor} ink={awayCrestInk} abbr={awayAbbr} crestUrl={awayCrestUrl} badgeScale={0.26} />
              </div>
              {/* Ev sahibi ÖNDE — DOM'da sonra + z-index, gölgesiyle ayrışıyor. */}
              <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)" }}>
                <Shield side={crest} color={homeColor} ink={homeCrestInk} abbr={homeAbbr} crestUrl={homeCrestUrl} badgeScale={0.26} front />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 9, minWidth: 0 }}>
            {scoreInArt ? (
              <div style={{ fontSize: scoreSize, fontWeight: 700, lineHeight: 1, letterSpacing: ".01em", color: "#fff", filter: spoiler ? "blur(9px)" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {homeScore}<span style={{ opacity: 0.42, margin: "0 5px" }}>–</span>{awayScore}
              </div>
            ) : (
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1, letterSpacing: ".02em", color: INK, whiteSpace: "nowrap" }}>{kickoff}</div>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.35, letterSpacing: ".02em", color: INK, marginTop: 7, minWidth: 0 }}>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hShort}</div>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: INK_3 }}>{aShort}</div>
            </div>
          </div>

          <div style={{ marginTop: "auto", minWidth: 0 }}>
            {/* Isı tek satır: barlar + sayı, etiket yok. */}
            {heatOn && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <HeatBars steps={steps} gap={3} height={4} />
                <span style={{ fontSize: 10, fontWeight: 700, color: heatInk, flex: "none" }}>{heatText}</span>
              </div>
            )}
            {spoiler && (
              <div style={{ height: 22, borderRadius: 6, background: "rgba(9,10,11,.5)", border: "1px solid rgba(255,255,255,.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".13em", color: INK_2 }}>HIDDEN</span>
              </div>
            )}
            {!!ratings && (
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: INK_3, marginTop: 7, whiteSpace: "nowrap", overflow: "hidden" }}>{ratings}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Geniş düzen (§2.4 sırası) ──────────────────────────────────────── */
  return (
    <div style={shell} className={className} onClick={onClick}>
      {frame}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>

        {/* 1 — Başlık satırı */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "13px 18px 0", minHeight: 37, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", height: 36, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: INK_3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{comp}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", height: 26, padding: "0 10px", borderRadius: 999, background: "rgba(0,0,0,.42)", border: "1px solid rgba(255,255,255,.14)", flex: "none" }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: INK, whiteSpace: "nowrap" }}>{status}</span>
          </div>
        </div>

        {/* 2 — Sanat alanı. SABİT yükseklik; flex:1 YASAK (§2.4): içerik kısaysa
             kart kısalır, kart havayla dolmaz. */}
        <div style={{ height: artHeight, display: "flex", alignItems: "center", justifyContent: "center", gap: 13, padding: "0 18px", flex: "none", minWidth: 0 }}>
          <Shield side={crest} color={homeColor} ink={homeCrestInk} abbr={homeAbbr} crestUrl={homeCrestUrl} />
          <div style={{ position: "relative", flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {potm && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden" }}>
                <span style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)", fontSize: crest * 2.1, fontWeight: 700, lineHeight: 0.78, letterSpacing: "-.04em", color: "rgba(255,255,255,.06)", pointerEvents: "none" }}>{shirtNo}</span>
                {potmUrl && <img src={potmUrl} alt="" style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain" }} />}
              </div>
            )}
            {scoreInArt && (
              <div style={{ position: "relative", fontSize: scoreSize, fontWeight: 700, lineHeight: 1, letterSpacing: ".01em", color: "#fff", filter: spoiler ? "blur(9px)" : "none", whiteSpace: "nowrap" }}>
                {homeScore}<span style={{ opacity: 0.42, margin: "0 8px" }}>–</span>{awayScore}
              </div>
            )}
            {!finished && (
              <div style={{ position: "relative", textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: ".02em", color: INK }}>{kickoff}</div>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: ".06em", color: "rgba(255,255,255,.42)", marginTop: 4 }}>VS</div>
              </div>
            )}
          </div>
          <Shield side={crest} color={awayColor} ink={awayCrestInk} abbr={awayAbbr} crestUrl={awayCrestUrl} />
        </div>

        {/* 3 — Skor bandı. POTM sanat alanını kaplayınca skor buraya düşer. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 13, padding: "0 18px 13px", minWidth: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".02em", color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hShort}</div>
          </div>
          {potm && (
            <div style={{ flex: "none", fontSize: 21, fontWeight: 700, lineHeight: 1, color: "#fff", whiteSpace: "nowrap" }}>
              {homeScore}<span style={{ opacity: 0.42, margin: "0 6px" }}>–</span>{awayScore}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1, textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".02em", color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{aShort}</div>
          </div>
        </div>

        {/* 4 — Isı satırı. Spoiler'da gizli. */}
        {heatOn && (
          <div style={{ padding: "0 18px 13px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 9, marginBottom: 6, minWidth: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: heatInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{heatName}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: INK, flex: "none" }}>{heatText}</span>
            </div>
            <HeatBars steps={steps} gap={4} height={5} />
          </div>
        )}

        {/* 5 — Açığa çıkarma şeridi, yalnızca spoiler'da. */}
        {spoiler && (
          <div style={{ margin: "0 18px 13px", height: 40, borderRadius: 10, background: "rgba(9,10,11,.5)", border: "1px solid rgba(255,255,255,.16)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={INK_2} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
            </svg>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: INK_2 }}>TAP TO REVEAL</span>
          </div>
        )}

        {/* 6 — Ayak. Damga varken 52px, yoksa 44px — damga yükseklik EKLEMEZ,
             etiketin yerini alır. */}
        <div style={{ marginTop: "auto", height: classic ? 52 : 44, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 18px", background: "rgba(9,10,11,.5)", borderTop: "1px solid rgba(255,255,255,.09)", minWidth: 0 }}>
          {classic
            ? <ClassicStamp />
            : <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: INK_3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{footNote}</span>}
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: INK_3, whiteSpace: "nowrap", flex: "none" }}>{ratings}</span>
        </div>
      </div>
    </div>
  );
}
