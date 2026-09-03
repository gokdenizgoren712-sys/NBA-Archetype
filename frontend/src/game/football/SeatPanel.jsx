import Pitch from "./Pitch";
import { PHASE_COLOR } from "./theme";
export { PHASE_COLOR };

// ── Tek koltuğun draft paneli ────────────────────────────────────────────────
// Basketbolun PlayerSeatPanel'inin karşılığı: aktif koltuk kendi renginde
// parlıyor, bekleyen sönük duruyor. İkisi de HER ZAMAN görünüyor — rakibinin
// sahasının dolduğunu görmek oyunun yarısı.
//
// Same Screen ve oda draftı BUNU PAYLAŞIYOR. İki ekranın kendi kopyası olsaydı,
// biri düzeldiğinde öbürü eski hâlinde kalırdı; basketbolda draft mantığının üç
// kopyası olmasının bedeli tam olarak bu.

export const SEAT_COLOR = { 1: "#3FB08C", 2: "#F2C14E" };

/* ── Tek koltuğun paneli ───────────────────────────────────────────────────
   Basketbolun PlayerSeatPanel'inin karşılığı: aktif koltuk kendi renginde
   parlıyor, bekleyen sönük duruyor. İkisi de HER ZAMAN görünüyor — rakibinin
   sahasının dolduğunu görmek oyunun yarısı. */
export default function SeatPanel({ seat, active, name, shape, squad, slots, pool, spinning,
                     pickingFor, canPick, openIds, onChoose, onPlace, onCancel, msg }) {
  const acc = SEAT_COLOR[seat];
  const done = Object.keys(squad).length;

  return (
    <div className="rounded-2xl border p-3 space-y-2.5 transition-colors"
      style={active
        ? { borderColor: acc + "99", background: acc + "0f",
            boxShadow: `0 0 24px -8px ${acc}b3` }
        : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>

      <div className="flex items-center justify-between gap-2">
        <span className="font-logo text-sm font-bold text-white truncate">{name}</span>
        <div className="flex items-center gap-2 flex-none">
          <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
            {done}/{slots.length}
          </span>
          {active ? (
            <span className="text-[9.5px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
              style={{ color: acc, background: acc + "33", border: `1px solid ${acc}80` }}>
              Your pick
            </span>
          ) : (
            <span className="text-[9.5px] px-2 py-0.5 rounded-full uppercase tracking-wider"
              style={{ color: "var(--text-faint)", border: "1px solid rgba(255,255,255,.12)" }}>
              Waiting
            </span>
          )}
        </div>
      </div>

      <Pitch shape={shape} squad={squad} pickingFor={pickingFor}
        onSlotClick={(s) => {
          if (!pickingFor) return;
          if (openIds && !openIds.has(s.id)) return;
          onPlace(pickingFor, s.id);
        }} />

      {/* Seçim listesi yalnız sıradaki koltukta — iki liste yan yana dursa
          hangisinin canlı olduğu belirsizleşirdi. */}
      {active && pickingFor && (
        <div className="text-[11.5px] flex items-center gap-2 flex-wrap"
          style={{ color: "#F2C14E" }}>
          <span>Tap a slot for <b>{pickingFor.PLAYER_NAME}</b></span>
          <button onClick={onCancel} className="aura-pill-btn"
            style={{ fontSize: 10, padding: "3px 9px" }}>cancel</button>
        </div>
      )}

      {active && !pickingFor && spinning && (
        <p className="text-center text-xs animate-pulse py-4"
          style={{ color: "var(--text-muted)" }}>Spinning for a club…</p>
      )}

      {active && !pickingFor && !spinning && pool && (
        <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 260 }}>
          {pool.players.map((p) => {
            const ok = canPick(p);
            return (
              <button key={p.PLAYER_ID} onClick={() => onChoose(p)} disabled={!ok}
                className="w-full text-left flex items-center gap-2 text-xs rounded-[8px] px-2.5 py-1.5"
                style={{ opacity: ok ? 1 : 0.32, cursor: ok ? "pointer" : "not-allowed",
                  background: "rgba(255,255,255,.022)",
                  border: `1px solid ${ok ? PHASE_COLOR[p.PHASE] + "44" : "var(--border)"}` }}>
                <span className="text-[9px] uppercase flex-none" style={{ minWidth: 22,
                  color: PHASE_COLOR[p.PHASE] }}>{p.POSITION}</span>
                <span className="flex-1 truncate">{p.PLAYER_NAME}</span>
                <span className="text-[10.5px] truncate max-w-[110px] flex-none"
                  style={{ color: "var(--text-faint)" }}>{p.primary_arch}</span>
              </button>
            );
          })}
        </div>
      )}

      {msg && <div className="text-[11.5px]" style={{ color: "#E8654C" }}>{msg}</div>}
    </div>
  );
}
