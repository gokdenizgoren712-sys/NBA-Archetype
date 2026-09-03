import { useRef } from "react";

// ── Giriş kartı sahnesi ──────────────────────────────────────────────────
// SportSelect / GameModeSelect / FootballModeSelect'in üçü de birebir aynı
// "N seçenekten birini seç" pcard düzenini kullanıyordu ama hiçbiri
// aura.css'in zaten tanımlayıp hiç bağlamadığı .aura-tilt'i kullanmıyordu
// (kendi yorumu "mousemove handler'ı GameModeSelect.jsx'te" diyordu — hiç
// yazılmamıştı). Bu wrapper onu tamamlıyor: fare pozisyonunu --tx/--ty'ye
// yazan TEK yer burası, üç sayfa de aynı hissi paylaşıyor.
//
// .aura-deal (stagger'lı giriş) STAGE'e, tilt PCARD'a (children'ın kendi
// .pcard-tilt class'ı) uygulanıyor — aynı elemanda olsalardı transform
// ikisi arasında çakışırdı (bkz. aura.css'teki not).
export default function ModeCardStage({ index = 0, className = "", children }) {
  const ref = useRef(null);

  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const tx = (0.5 - py) * 12;
    const ty = (px - 0.5) * 12;
    el.style.setProperty("--tx", `${tx.toFixed(2)}deg`);
    el.style.setProperty("--ty", `${ty.toFixed(2)}deg`);
    el.style.setProperty("--tz", "14px");
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tx", "0deg");
    el.style.setProperty("--ty", "0deg");
    el.style.setProperty("--tz", "0px");
  };

  return (
    <div ref={ref} className={`pcard-stage mode aura-deal ${className}`}
      style={{ "--stagger": index }}
      onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </div>
  );
}
