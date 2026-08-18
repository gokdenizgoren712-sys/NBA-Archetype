// Kadro analizi — simülasyondan ÖNCE gösterilen karne.
//
// Basketbol tarafındaki DraftAnalysis.jsx'in futbol karşılığı, ama içeriği
// ölçüme göre seçildi. 10 sezon, 3 lig, 17.936 gerçek ilk-11'de, kulüp+sezon
// sabit etkisi altında bileşenlerin sonuçla ilişkisi:
//
//     slots      +0.041  (5.4 standart hata — gerçek)
//     diversity  +0.018  (2.4 SE — gerçek)
//     pairs      +0.004  (0.5 SE — sıfırdan ayırt edilemiyor, skordan çıkarıldı)
//
// Bu yüzden panelin merkezinde ROL KAPSAMASI var: sekiz işin kaçını
// yapabiliyorsun.

const ACC = "#3FB08C";
const WARN = "#E8654C";
const MID = "#F2C14E";
const PHASE_COLOR = { gk: "#F2C14E", def: "#4C9BE8", mid: "#3FB08C", fwd: "#E8654C" };

const hex = (v) => (v >= 0.72 ? ACC : v >= 0.52 ? MID : WARN);
const pct = (v) => Math.round((v || 0) * 100);
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

// Basketboldaki pillar barlarıyla aynı bileşen — çizgili dolgu, accent'ten renk.
function SlotBar({ label, value }) {
  const c = hex(value);
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11.5px] shrink-0 text-right" style={{ width: 112, color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="g-bar-track flex-1" style={{ height: 8 }}>
        <div className="g-bar-fill" style={{ width: `${pct(value)}%`, "--fill": c, "--fill-a": c + "66" }} />
      </div>
      <span className="font-logo text-[12.5px] font-bold w-7 text-right shrink-0 tabular-nums"
        style={{ color: c }}>{pct(value)}</span>
    </div>
  );
}

export default function SquadAnalysis({ fit, starters = [], bench = [],
                                        positionPenalty = 0, slotOf }) {
  if (!fit || fit.error) return null;

  const ref = fit.reference;
  const slots = Object.entries(fit.slot_scores || {})
    .sort((a, b) => b[1] - a[1]);
  const gaps = slots.filter(([, v]) => v < 0.52);
  const counts = fit.archetype_counts || {};
  const dupes = Object.entries(counts).filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1]);

  // Yerinde olmayanlar — slotOf verilirse cezayı oyuncu bazında gösterebiliriz
  const misfits = slotOf
    ? starters.map((p) => ({ p, pen: slotOf(p) })).filter((x) => x.pen > 0.05)
        .sort((a, b) => b.pen - a.pen)
    : [];

  const phases = starters.reduce((a, p) => {
    a[p.PHASE] = (a[p.PHASE] || 0) + 1; return a;
  }, {});

  return (
    <div className="g-panel p-4 space-y-4"
      style={{ "--accent": ACC, "--accent-line": `${ACC}44` }}>
      <span className="aura-blob" style={{ "--slot-color": ACC, left: "30%", top: -50, width: 300, height: 150, opacity: 0.16 }} />

      <div className="flex items-center justify-between gap-2">
        <span className="g-mono" style={{ color: ACC }}>// Squad Analysis</span>
        <span className="g-status"
          style={{ "--accent": "#9ca3af", "--accent-a": "rgba(156,163,175,.12)", "--accent-line": "rgba(156,163,175,.35)" }}>
          what this XI can and cannot do
        </span>
      </div>

      {/* Asıl anlamlı sayı: gerçek ilk-11'lere göre nerede duruyorsun.
          Ham 0-100 skorun kendi başına bir ölçeği yok; persantilin var. */}
      {ref && ref.score != null && (
        <div className="flex items-center gap-4 rounded-2xl relative overflow-hidden"
          style={{ padding: "14px 16px",
                   background: `linear-gradient(100deg, ${hex(ref.score / 100)}14, transparent 72%)`,
                   border: `1px solid ${hex(ref.score / 100)}44` }}>
          <span className="aura-blob" style={{ "--slot-color": hex(ref.score / 100),
            left: "8%", top: -34, width: 190, height: 100, opacity: 0.26 }} />
          <div className="relative shrink-0">
            <div className="font-logo font-black tabular-nums leading-none"
              style={{ fontSize: 38, color: hex(ref.score / 100),
                       textShadow: `0 0 24px ${hex(ref.score / 100)}55` }}>
              {ref.score}<span style={{ fontSize: 16 }}>{ordinal(ref.score)}</span>
            </div>
            <div className="g-mono mt-1" style={{ color: "var(--text-faint)" }}>percentile</div>
          </div>
          <div className="relative flex-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Built better than <b style={{ color: "#fff" }}>{ref.score}%</b> of the{" "}
            {ref.n.toLocaleString("en-US")} real starting elevens actually fielded
            across {ref.seasons} seasons.
            {ref.slots != null && (
              <> Role coverage alone sits at <b style={{ color: "#fff" }}>
                {ref.slots}{ordinal(ref.slots)}</b>.</>
            )}
          </div>
        </div>
      )}

      {/* ── Rol kapsaması: panelin ana içeriği ─────────────────────────── */}
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        {slots.map(([k, v]) => <SlotBar key={k} label={k} value={v} />)}
      </div>

      {/* ── Açıklar ────────────────────────────────────────────────────── */}
      {gaps.length > 0 && (
        <div className="rounded-xl relative overflow-hidden" style={{ padding: "11px 13px",
          background: `${WARN}0f`, border: `1px solid ${WARN}38` }}>
          <div className="g-label" style={{ "--accent": WARN, color: WARN }}>Gaps</div>
          <div style={{ fontSize: 12.5, marginTop: 3, color: "var(--text-muted)" }}>
            Nobody in this XI really covers{" "}
            <b style={{ color: "#fff" }}>
              {gaps.map(([k]) => k.toLowerCase()).join(", ")}
            </b>. In a tight game that is where it shows.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 14,
        gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>

        {/* Şekil */}
        <div className="g-panel subtle" style={{ padding: "11px 13px" }}>
          <div className="g-label">Shape</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", marginTop: 2 }}>
            {fit.formation || "not a standard shape"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
            {["def", "mid", "fwd"].map((ph) => (
              <span key={ph} style={{ marginRight: 8, color: PHASE_COLOR[ph] }}>
                {phases[ph] || 0} {ph}
              </span>
            ))}
          </div>
        </div>

        {/* Rol tekrarı */}
        <div className="g-panel subtle" style={{ padding: "11px 13px" }}>
          <div className="g-label">Role overlap</div>
          {dupes.length ? (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2,
                color: dupes.some(([, n]) => n > 2) ? WARN : MID }}>
                {dupes.map(([a, n]) => `${n}× ${a}`).join(" · ")}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                Same job done twice is a job not done elsewhere.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13.5, fontWeight: 700, color: ACC, marginTop: 2 }}>
              No duplicates
            </div>
          )}
        </div>

        {/* Yerinde olmayanlar */}
        {misfits.length > 0 && (
          <div className="g-panel subtle" style={{ padding: "11px 13px" }}>
            <div className="g-label">Out of position</div>
            <div style={{ fontSize: 12, marginTop: 3 }}>
              {misfits.slice(0, 4).map(({ p, pen }) => (
                <div key={p.PLAYER_ID} style={{ display: "flex", gap: 6 }}>
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden",
                    textOverflow: "ellipsis" }}>{p.PLAYER_NAME}</span>
                  <b style={{ color: pen >= 0.2 ? WARN : MID }}>−{pct(pen)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Ölçüm dürüstlüğü ───────────────────────────────────────────── */}
      <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 14, lineHeight: 1.6 }}>
        The percentile is measured, not modelled: it places your XI in the spread of
        {ref ? ` ${ref.n.toLocaleString("en-US")} ` : " 17,936 "}
        elevens that clubs actually put on the pitch. On those same elevens, holding the
        club and the season fixed, the best-built 30% outscore the worst-built 30% by
        about 0.04 expected goals a match — real, but small, and hard to separate from
        squad quality. Pair affinity was dropped from the score entirely: it showed
        nothing once the club was controlled for, and it barely varied anyway. Note too
        that real managers never field sides as broken as this game lets you build, so
        the bottom of the range is genuinely unmeasured territory.
      </p>
    </div>
  );
}
