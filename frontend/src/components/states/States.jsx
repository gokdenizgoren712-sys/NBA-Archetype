// Handoff v2 sistem durumları (18d) ve sayfa ortam ışığı — tüm sayfaların
// paylaştığı parçalar. Önceden yükleniyor/boş/hata çoğu yerde tek satır soluk
// metindi; burada her biri ne olduğunu ve ne yapılacağını söylüyor.
import PaIcon from "../shell/PaIcon";

/** Sayfa başına ortam ışığı (1–2 organik blob). `tint` değişince .5s'de geçer. */
export function PageGlow({ tint }) {
  return <div className="g-smoke" aria-hidden="true" style={tint ? { "--page-tint": tint } : undefined} />;
}

/** Kart ızgarası için yükleniyor iskeleti — kademeli gecikmeli shimmer. */
export function SkeletonGrid({ count = 6, height = 250, min = 280, label }) {
  return (
    <div className="pa-skel-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}
      aria-busy="true" aria-label={label || "Loading"}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="pa-skel-item">
          <div className="pa-skel" style={{ height, animationDelay: `${i * 0.12}s` }} />
          <div className="pa-skel line" style={{ width: "70%", animationDelay: `${i * 0.12}s` }} />
          <div className="pa-skel line sm" style={{ width: "45%", animationDelay: `${i * 0.12}s` }} />
        </div>
      ))}
      {label && <span className="pa-skel-label">{label}</span>}
    </div>
  );
}

/** Satır listesi iskeleti. */
export function SkeletonRows({ count = 6, height = 44 }) {
  return (
    <div className="pa-skel-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="pa-skel" style={{ height, animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}

/** Boş sonuç. `body` işe yarar olmalı: neden boş, en yakın ne var. */
export function EmptyState({ title = "Nothing here", body, tint = "#22d3ee", actions = [] }) {
  return (
    <div className="pa-empty" style={{ "--tint": tint }}>
      <span className="pa-empty-ic"><PaIcon name="search" size={40} color={tint} /></span>
      <span className="pa-state-title">{title}</span>
      {body && <span className="pa-state-body">{body}</span>}
      {actions.length > 0 && (
        <div className="pa-state-actions">
          {actions.map(a => (
            <button key={a.label} className={a.primary ? "pa-btn-primary" : "pa-btn-secondary"} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Hata + yeniden dene (18d): kırmızı "!" rozeti, açık düğme, isteğe bağlı kod ve saat. */
export function ErrorState({ title = "That didn't load", body = "The server didn't answer. Your filters are kept.", onRetry, code }) {
  const at = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="pa-empty pa-error" style={{ "--tint": "#f87171" }} role="alert">
      <span className="pa-error-ic" aria-hidden="true">!</span>
      <span className="pa-state-title">{title}</span>
      <span className="pa-state-body">{body}</span>
      {onRetry && (
        <div className="pa-state-actions">
          <button className="pa-btn-light" onClick={onRetry}>Try again</button>
        </div>
      )}
      <span className="pa-error-meta">{code ? `Error ${code} · ` : ""}{at}</span>
    </div>
  );
}

/** Mobil: birincil aksiyon alta sabit, 54px, zemine doğru solan şerit. */
export function PinnedAction({ children }) {
  return <div className="pa-pinned">{children}</div>;
}
