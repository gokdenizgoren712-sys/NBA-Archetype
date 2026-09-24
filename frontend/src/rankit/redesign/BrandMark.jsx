/* RankIt işareti — BUILD §7.2, ekran 4i "Both marks, from scratch".
 *
 * Koleksiyon kartının kendi silüeti (sağ üst ve sol alt pah), içinden
 * uygulamanın kendi puan yıldızı oyulmuş: puanlanmış bir maç, tek şekil.
 *   kare      M0 0H16.5L24 7.5V24H7.5L0 16.5Z   (24 ızgara)
 *   pah       7.5 = kenarın %31.25'i
 *   yıldız    arayüzdeki puan glifi, .6 ölçek; optik merkez 12 / 12.6
 *             (kutusundan ortalanan beş köşeli yıldız aşağıda okunur).
 *             16px'te .62 — tahtadaki 16'lık örnek.
 *   oyma      SVG maskesi: işaret her zeminde oturur. Maske kimliği HER
 *             örnekte ayrı (§7.2: aynı id çakışır, işaret kaybolur).
 * Android launcher aynı geometriyi vektörde evenOdd ile çiziyor
 * (drawable/rankit_icon_foreground.xml).
 */
import { useId } from "react";

const CARD = "M0 0H16.5L24 7.5V24H7.5L0 16.5Z";
const STAR = "M12 2l3 6.9 7.5.7-5.6 5 1.6 7.4L12 18.2 5.5 22l1.6-7.4-5.6-5 7.5-.7z";

/* `label` verilirse işaret kendi başına bir görsel (role=img); verilmezse
   yanındaki wordmark adı taşıyor, işaret dekoratif. */
export function RankItMark({ size = 24, color = "#ffb11b", label }) {
  const id = `rk-star-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const scale = size <= 16 ? 0.62 : 0.6;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flex: "none" }}
    {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
    <mask id={id}>
      <rect width="24" height="24" fill="#fff" />
      <g transform={`translate(12 12.6) scale(${scale}) translate(-12 -12.4)`}><path d={STAR} fill="#000" /></g>
    </mask>
    <path d={CARD} fill={color} mask={`url(#${id})`} />
  </svg>;
}
