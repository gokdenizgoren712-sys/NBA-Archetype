/* Durumlar — HANDOFF §5, ekranlar 3k ve 3l.
 *
 * Üçünün ortak kuralı board'un kendi cümlesi: "say what happened, name the
 * one action, never fake data."
 *
 *   * YÜKLENİYOR — iskelet, asla dönen çark. İskelet kartın KENDİ geometrisini
 *     taşır: çentikler ve saç çizgileri, iki arma sütunu, skor bloğu, beş ısı
 *     çubuğu, ayak şeridi. Veri gelince hiçbir şey kaymaz, çünkü aynı yuvada
 *     aynı iskelet duruyor.
 *   * BOŞ — neyin eksik olduğunu söyle, TEK eylemi göster, dur. Örnek veri
 *     yok, "önerilen arkadaşlar" yok.
 *   * LİSTENİN SONU — sonlu bir koleksiyon bittiğini söyler: THAT'S ALL 142.
 *     Yalnızca GERÇEKTEN hepsi gösterildiyse; kesilmiş bir "ilk 40" listesi
 *     bunu diyemez.
 *
 * Renk tek: iskelet dolgusu #1c1d21 (§5), zemin #121315 (3k).
 */
const FILL = "#1c1d21";
const GROUND = "#121315";
const HAIR = "rgba(255,255,255,.09)";

/* §2.3 yarıçapı, türetilmiş. */
const radius = (side) => `${side * 0.29}px ${side * 0.29}px ${side * 0.34}px ${side * 0.34}px`;

function Diamond({ side }) {
  return (
    <div style={{ width: side * 1.414, height: side * 1.414, display: "grid", placeItems: "center", flex: "none" }}>
      <div style={{ width: side, height: side, transform: "rotate(45deg)", borderRadius: radius(side), background: FILL }} />
    </div>
  );
}

/* Metin yer tutucusu: SEFFAF metin + dolgu. Yuksekligi yazi tipinin kendi
   satir kutusundan gelir, sabit piksel degil -- boylece iskeletin satirlari
   gercek kartinkilerle AYNI boyda olur ve veri gelince hicbir sey kaymaz.
   (Sabit cubuklarla isi satiri 20px yukarida kaliyordu; olculdu.) */
const ph = (text, size, extra) => (
  <span style={{ fontSize: size, fontWeight: 700, color: "transparent", background: FILL, borderRadius: 4, ...extra }}>{text}</span>
);

const bar = (width, height, extra) => (
  <div style={{ width, height, borderRadius: height / 2, background: FILL, flex: "none", ...extra }} />
);

function HeatRow({ gap, height }) {
  return (
    <div style={{ display: "flex", gap, minWidth: 0, flex: 1 }}>
      {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ flex: 1, height, borderRadius: height / 2 + 1, background: FILL }} />)}
    </div>
  );
}

/* MatchCard'ın iskeleti. MatchCard gibi yuvasını doldurur (height:100%),
   yani yuva sabit oldukça veri geldiğinde sayfa kaymaz. */
export function SkeletonCard({ compact = false, crestSize, cut, artHeight = 150, scoreSize = 26 }) {
  const c = cut ?? (compact ? 14 : 22);
  const crest = crestSize ?? (compact ? 40 : 62);
  const notch = { position: "absolute", width: c * 1.414, height: 1, background: HAIR, transform: "rotate(45deg)" };
  const shell = {
    position: "relative", width: "100%", height: "100%", minWidth: 0, overflow: "hidden",
    borderRadius: c, background: GROUND, display: "flex", flexDirection: "column",
    fontFamily: "var(--font-logo)",
    clipPath: `polygon(0 0,calc(100% - ${c}px) 0,100% ${c}px,100% 100%,${c}px 100%,0 calc(100% - ${c}px))`,
  };
  const frame = (<>
    <div style={{ ...notch, top: c / 2, right: -(c * 0.205) }} />
    <div style={{ ...notch, bottom: c / 2, left: -(c * 0.205) }} />
  </>);

  if (compact) {
    return (
      <div style={shell} aria-hidden="true" className="ri-skeleton">
        {frame}
        <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "11px 12px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0, marginBottom: 9 }}>
            {ph("PREMIER LEAGUE", 9, { letterSpacing: ".13em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 })}
          </div>
          <div style={{ position: "relative", height: crest * 1.414, flex: "none", display: "flex", alignItems: "center" }}>
            <div style={{ position: "relative", width: crest * 2.414, height: "100%", flex: "none" }}>
              <div style={{ position: "absolute", left: crest, top: 0 }}><Diamond side={crest} /></div>
              <div style={{ position: "absolute", left: 0, top: 0 }}><Diamond side={crest} /></div>
            </div>
          </div>
          <div style={{ marginTop: 9, minWidth: 0 }}>
            {/* Skor punto'su cagri yerindeki kartla AYNI (Discover 30, raf 28). */}
            <div style={{ fontSize: scoreSize, lineHeight: 1, whiteSpace: "nowrap" }}>{ph("3 – 1", scoreSize, { borderRadius: 6 })}</div>
            <div style={{ fontSize: 11, lineHeight: 1.35, marginTop: 7 }}>
              <div style={{ whiteSpace: "nowrap" }}>{ph("Arsenal", 11)}</div>
              <div style={{ whiteSpace: "nowrap" }}>{ph("Spurs", 11)}</div>
            </div>
          </div>
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 7 }}>
            <HeatRow gap={3} height={4} />
            {ph("4.6", 10)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shell} aria-hidden="true" className="ri-skeleton">
      {frame}
      {/* Baslik satiri MatchCard'daki gibi 13px ust bosluk + 36px'lik ic kutu.
          Ic kutu olmadan satir 12px kisaydi ve veri gelince kart asagi
          kayiyordu (olculdu: armalar 68 -> 80). */}
      <div style={{ padding: "13px 18px 0", minHeight: 37, display: "flex", alignItems: "center" }}>
        <div style={{ height: 36, display: "flex", alignItems: "center" }}>{bar(132, 9)}</div>
      </div>
      <div style={{ height: artHeight, display: "flex", alignItems: "center", justifyContent: "center", gap: 13, padding: "0 18px", flex: "none" }}>
        <Diamond side={crest} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>{bar(104, 38, { borderRadius: 8 })}</div>
        <Diamond side={crest} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 13, padding: "0 18px 13px" }}>
        <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 13, whiteSpace: "nowrap" }}>{ph("Arsenal", 13)}</div></div>
        <div style={{ minWidth: 0, flex: 1, textAlign: "right" }}><div style={{ fontSize: 13, whiteSpace: "nowrap" }}>{ph("Arsenal", 13)}</div></div>
      </div>
      <div style={{ padding: "0 18px 13px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 9, marginBottom: 6 }}>
          {ph("GREAT", 9, { letterSpacing: ".14em" })}
          {ph("4.6", 13)}
        </div>
        <HeatRow gap={4} height={5} />
      </div>
      <div style={{ marginTop: "auto", height: 44, background: "rgba(9,10,11,.5)", borderTop: `1px solid ${HAIR}` }} />
    </div>
  );
}

/* Satır iskeleti: 3k'nin 64px'lik satırları. Liste ekranlarında (arama,
   bildirim, raf, cetvel) içeriğin kendi yüksekliğiyle çağrılır. */
export function SkeletonRows({ count = 3, height = 64, gap = 10, radius: r = 14 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }} aria-hidden="true" className="ri-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ height, borderRadius: r, background: GROUND, border: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 13, padding: "0 14px" }}>
          <div style={{ width: 22, height: 22, transform: "rotate(45deg)", borderRadius: radius(22), background: FILL, flex: "none", margin: "0 4px" }} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
            {bar("58%", 10)}
            {bar("34%", 8)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* Sheet iskeleti: maç / turnuva / profil sayfası açılırken. Başlık, iki
   arma + skor bloğu (maç sayfasının kahramanı), sekme şeridi, satırlar. */
export function SheetSkeleton({ rows = 3 }) {
  return (
    <div aria-hidden="true" className="ri-skeleton" style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>{bar(160, 9)}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
        <Diamond side={48} />
        {bar(96, 34, { borderRadius: 8 })}
        <Diamond side={48} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} style={{ flex: 1 }}>{bar("100%", 30, { borderRadius: 10 })}</div>)}</div>
      <SkeletonRows count={rows} />
    </div>
  );
}

/* Seçici çipleri (4h): turnuva adları gelene kadar aynı yükseklikte haplar. */
export function SkeletonChips({ count = 7 }) {
  const widths = [118, 150, 64, 88, 84, 98, 104, 76];
  return (
    <div aria-hidden="true" className="ri-skeleton" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ width: widths[i % widths.length], height: 44, borderRadius: 999, background: GROUND, border: `1px solid ${HAIR}`, flex: "none" }} />
      ))}
    </div>
  );
}

/* Ekran okuyuculara da bir şey söylemeli: iskelet aria-hidden, bu değil. */
export function Loading({ label = "Loading", children }) {
  return (
    <div role="status" aria-live="polite" className="ri-loading">
      <span className="ri-sr-only">{label}…</span>
      {children}
    </div>
  );
}

/* 3l — boş durum. Kesikli elmas, başlık, bir cümle, TEK eylem. */
export function EmptyState({ title, body, action, onAction, quiet = false }) {
  return (
    <div className={`ri-empty${quiet ? " is-quiet" : ""}`}>
      <div className="ri-empty-mark" aria-hidden="true"><i /></div>
      <strong>{title}</strong>
      {body && <p>{body}</p>}
      {/* 3l'deki eylem yalnızca metin: "RATE YOUR FIRST MATCH". */}
      {action && onAction && <button type="button" onClick={onAction}>{action}</button>}
    </div>
  );
}

/* Hata bos sonuc degildir. Son basarili icerik bunun yaninda kalabilir. */
export function ErrorState({ error, onRetry, title, body }) {
  /* §5.4 uc ayri hata: cevrimdisi (tekrar dene), 401 (yeniden giris), diger
     (tekrar dene). 401'de "Retry" sunmak bos bir soz — ayni istek ayni sonucu
     verir; kullaniciya yapmasi gereken sey soylenmeli. Bu yuzden o dalda
     eylem YOK, yerine nereye gidecegi yaziyor. */
  const needsSignIn = error?.status === 401;
  return <div role="alert">
    <EmptyState
      title={title || (needsSignIn ? "Sign in to see this"
        : error?.offline ? "Connection unavailable" : "Could not load this view")}
      body={body ?? (needsSignIn ? "This view belongs to your account. Open Profile to sign in — nothing you saved is lost."
        : error?.offline ? "Previously loaded content stays available. Reconnect and try again."
        : "Your data has not been removed. Please try again.")}
      action={needsSignIn ? undefined : "Retry"} onAction={needsSignIn ? undefined : onRetry}/>
  </div>;
}

/* 3l — listenin sonu. */
export function EndOfList({ count }) {
  return (
    <div className="ri-end" role="note">
      <i aria-hidden="true" />
      <span>THAT&apos;S ALL {Number(count || 0).toLocaleString()}</span>
      <i aria-hidden="true" />
    </div>
  );
}
