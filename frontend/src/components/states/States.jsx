// Handoff v2 sistem durumları (18d) — tüm sayfaların
// paylaştığı parçalar. Önceden yükleniyor/boş/hata çoğu yerde tek satır soluk
// metindi; burada her biri ne olduğunu ve ne yapılacağını söylüyor.
import { Button } from "../ui";

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

/** Boş sonuç (v3 L7): mono etiket, büyük başlık, işe yarar açıklama. Eski `tint` artık yok sayılır. */
export function EmptyState({ title = "Nothing here", body, eyebrow = "Empty · No results", actions = [] }) {
  return (
    <div className="pa-sys">
      <p className="pa-eyebrow">{eyebrow}</p>
      <h2 className="pa-sys-title">{title}</h2>
      {body && <p className="pa-sys-body">{body}</p>}
      {actions.length > 0 && (
        <div className="pa-sys-actions">
          {actions.map(a => (
            <Button key={a.label} variant={a.primary ? "primary" : "outline"} onClick={a.onClick}>{a.label}</Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Hata + yeniden dene (v3 L7): kırmızı değil, düz panel dili; kod ve saat mono satırda. */
export function ErrorState({ title = "Couldn't load this page", body = "The server didn't answer. Your filters are kept.", onRetry, code }) {
  const at = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="pa-sys" role="alert">
      <p className="pa-eyebrow">Error · Something broke</p>
      <h2 className="pa-sys-title">{title}</h2>
      <p className="pa-sys-body">{body}</p>
      {onRetry && <div className="pa-sys-actions"><Button variant="outline" onClick={onRetry}>Try again</Button></div>}
      <p className="pa-eyebrow">{code ? `Error ${code} · ` : ""}{at}</p>
    </div>
  );
}

/** Mobil: birincil aksiyon alta sabit, 54px, zemine doğru solan şerit. */
export function PinnedAction({ children }) {
  return <div className="pa-pinned">{children}</div>;
}
