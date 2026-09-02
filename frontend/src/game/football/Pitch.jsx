import { FORMATIONS } from "./formations";
import { posPenaltyFor, isPrimarySlot, canPlace } from "./positions";
import { PHASE_COLOR } from "./theme";

// ── Futbol sahası ────────────────────────────────────────────────────────────
// Basketbolda tahta bir liste; futbolda oyuncunun sahadaki YERİ bilginin bir
// parçası (kanat mı, içeride mi, derinde mi). Slot koordinatları formations.js'te
// diziliş tanımının içinde duruyor — saha ile pozisyon cezası aynı kaynaktan
// besleniyor, biri değişince öbürü kaymıyor.

const LINE = "1.5px solid rgba(255,255,255,.16)";

export default function Pitch({ shape, squad, onSlotClick, moveSrc, pickingFor, fill = false }) {
  const f = FORMATIONS[shape];
  if (!f) return null;

  // ── Dikey saha -> YATAY saha ──────────────────────────────────────────
  // formations.js portre koordinat veriyor (x = sol-sağ, y = 100 kendi kalen).
  // Ekranın kullanılabilir alanı yatay olduğu için sahayı 90° çeviriyoruz:
  // kendi kalen SOLDA, rakip kale SAĞDA. Koordinat kaynağına dokunmuyoruz —
  // pozisyon cezası ve saha çizimi aynı tanımdan beslenmeye devam ediyor.
  const L = (slot) => 100 - slot.y;   // derinlik -> yatay eksen
  const T = (slot) => slot.x;         // genişlik -> dikey eksen

  return (
    <div style={{
      position: "relative", borderRadius: 14, overflow: "hidden",
      // fill: saha kalan YÜKSEKLİĞE göre ölçeklenir (genişlik oradan türer).
      // width:100% + aspect-ratio bir flex kolonunda yüksekliği taşırıp
      // flex-shrink tarafından eziliyordu — 92/68 saha 639×146'ya düşüyordu.
      ...(fill
        ? { height: "100%", width: "auto", aspectRatio: "92/68", maxWidth: "100%", margin: "0 auto" }
        : { width: "100%", aspectRatio: "92/68" }),
      background: "linear-gradient(100deg,#12291d 0%,#0e2118 100%)",
      border: "1px solid #2c5a3f",
    }}>
      {/* Çim şeritleri — yatay sahada dikey bantlar */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          position: "absolute", top: 0, bottom: 0, left: `${i * 12.5}%`, width: "12.5%",
          background: i % 2 ? "rgba(255,255,255,.022)" : "transparent",
        }} />
      ))}
      {/* Çizgiler */}
      <div style={{ position: "absolute", inset: "2.5%", border: "1.5px solid rgba(255,255,255,.16)", borderRadius: 4 }} />
      {/* Orta saha çizgisi artık DİKEY */}
      <div style={{ position: "absolute", top: "2.5%", bottom: "2.5%", left: "50%", width: 1.5, background: "rgba(255,255,255,.16)" }} />
      <div style={{ position: "absolute", left: "50%", top: "50%", height: "30%", aspectRatio: "1",
                    transform: "translate(-50%,-50%)", border: "1.5px solid rgba(255,255,255,.16)", borderRadius: "50%" }} />
      {/* Ceza sahaları — solda kendi kalen, sağda rakip */}
      {[0, 1].map(t => (
        <div key={t} style={{
          position: "absolute", top: "22%", bottom: "22%", width: "13%",
          [t ? "right" : "left"]: "2.5%",
          // Kısayol `border` + `borderLeft/Right` aynı anda verilince React
          // rerender'da çakışma uyarısı basıyor — kenarlar tek tek.
          borderTop: LINE, borderBottom: LINE,
          borderLeft: t ? LINE : "none",
          borderRight: t ? "none" : LINE,
        }} />
      ))}

      {/* Slotlar */}
      {f.slots.map(slot => {
        const p = squad[slot.id];
        const c = PHASE_COLOR[slot.phase];
        const pen = p ? posPenaltyFor(p, slot) : 0;
        const natural = p ? isPrimarySlot(p, slot) : false;
        const isMoveSrc = moveSrc === slot.id;
        const canDrop = pickingFor ? canPlace(pickingFor, slot) && !p : true;
        const dim = pickingFor && !canDrop;

        return (
          <button key={slot.id}
            onClick={() => onSlotClick?.(slot)}
            title={p ? `${p.PLAYER_NAME} — ${slot.pos}` : slot.id}
            style={{
              position: "absolute", left: `${L(slot)}%`, top: `${T(slot)}%`,
              transform: "translate(-50%,-50%)", width: 62,
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 2, cursor: "pointer", opacity: dim ? 0.3 : 1,
              transition: "opacity .15s",
            }}>
            <span style={{
              width: 34, height: 34, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800, letterSpacing: ".02em",
              background: p ? `${c}26` : "rgba(0,0,0,.35)",
              border: `2px solid ${isMoveSrc ? "#fff" : p ? c : "rgba(255,255,255,.22)"}`,
              color: p ? c : "rgba(255,255,255,.5)",
              boxShadow: isMoveSrc ? "0 0 0 3px rgba(255,255,255,.25)" : "none",
            }}>
              {p ? Math.round((p.overall_score || 0) * 100) : slot.pos}
            </span>
            {p && (
              <>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, color: "#fff", maxWidth: 62,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  textShadow: "0 1px 3px rgba(0,0,0,.9)",
                }}>
                  {p.PLAYER_NAME.split(" ").slice(-1)[0]}
                </span>
                {!natural && (
                  <span style={{
                    fontSize: 8, color: pen >= 0.2 ? "#E8654C" : "#F2C14E",
                    textShadow: "0 1px 3px rgba(0,0,0,.9)",
                  }}>
                    −{Math.round(pen * 100)}
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
