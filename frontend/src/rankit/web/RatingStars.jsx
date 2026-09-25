/* Web yıldız girişi — 15x (42px), 7c (34px), 11a (46px).
 *
 * Telefonla aynı kalıp: her yıldız TEK düğme, tıklanan yarı .5 mi tam mı
 * olduğunu seçer. Yıldızı iki yarım düğmeye bölmek (eski web `Stars`)
 * 42px'lik yıldızda 21px genişliğinde hedefler demekti (§6: 44). Klavye ile
 * etkinleştirilen tıklama (`detail === 0`) tam puan verir; yarım için `.`
 * kısayolu var (§21).
 */
import { Star } from "lucide-react";

export default function RatingStars({ value = 0, onChange, size = 42, label = "Your rating" }) {
  const current = Number(value) || 0;
  return (
    <div className="riw-rate" role="group" aria-label={current ? `${label}: ${current} out of 5` : `${label}: not rated`}
      style={{ "--star": `${size}px` }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = current >= n ? 100 : current >= n - 0.5 ? 50 : 0;
        return (
          <button type="button" key={n} aria-label={`${n - 0.5} or ${n} stars`}
            onClick={(event) => {
              if (event.detail === 0) { onChange(n); return; }
              const box = event.currentTarget.getBoundingClientRect();
              onChange(event.clientX - box.left < box.width / 2 ? n - 0.5 : n);
            }}>
            <span className="riw-rate-glyph" style={{ "--fill": `${fill}%` }} aria-hidden="true">
              <Star size={size} strokeWidth={1.4} />
              <span><Star size={size} strokeWidth={1.4} fill="currentColor" /></span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
