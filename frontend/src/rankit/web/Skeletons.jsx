/* 8d — yükleme: YALNIZ iskelet, döner simge değil. İskelet kartın gerçek
 * geometrisini tutar (çentikler, iki arma sütunu, skor bloğu, beş ısı
 * çubuğu) — veri gelince sayfa zıplamaz. Telefonun SkeletonCard'ı, web'in
 * duvar (315) ve raf (174) boyutlarında.
 */
import { SkeletonCard } from "../redesign/States";

export function WallSkeleton({ count = 8, className = "riw-wall" }) {
  return (
    <div className={className} aria-busy="true" aria-label="Loading matches">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="riw-skeleton-slot"><SkeletonCard crestSize={56} cut={22} artHeight={132} scoreSize={46} /></div>
      ))}
    </div>
  );
}

export function ShelfSkeleton({ count = 5 }) {
  return Array.from({ length: count }).map((_, i) => (
    <div key={i} className="riw-shelf-skeleton" aria-hidden="true"><SkeletonCard compact crestSize={34} cut={14} artHeight={56} scoreSize={21} /></div>
  ));
}
