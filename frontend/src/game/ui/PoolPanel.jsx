// Oyuncu havuzu (mockup 3c): başlık, sıralama chip'leri, satırlar.
//   rows: [{ id, pos, name, arch, archColor, stats, right, sub, disabled }]
//   Sıralama chip'leri GERÇEKTEN sıralar: seçili chip tekrar basılınca Default'a döner.
export default function PoolPanel({
  title = "Pick one player", count, sortChips, sortKey, onSort, rows, selectedId, onPick,
  reveal, rowsIn = true, stagger = false, blocked = false, empty, note,
}) {
  return (
    <section className="sb-panel sb-pool">
      <div className="sb-pool-head">
        <span className="sb-card-title" style={{ fontSize: 18 }}>{title}</span>
        <span className="count">{count} IN SQUAD</span>
      </div>
      <div className="sb-sort" role="group" aria-label="Sort players">
        <span className="lbl">SORT</span>
        {sortChips.map((c) => (
          <button key={c.key} type="button" aria-pressed={sortKey === c.key}
            onClick={() => onSort(sortKey === c.key ? "default" : c.key)}>
            {c.key === "default" || sortKey === c.key ? c.label : `${c.label} ↕`}
          </button>
        ))}
      </div>
      {note && <div className="sb-pool-note">{note}</div>}
      <div className="sb-rows" aria-live="polite">
        {rows.length === 0 && <div className="sb-pool-empty">{empty}</div>}
        {rows.map((r, i) => {
          const on = selectedId === r.id;
          return (
            <button key={r.id} type="button" data-row={r.id}
              className={`sb-row${on ? " on" : ""}${!rowsIn ? " hide" : ""}${selectedId && !on ? " picked" : ""}`}
              style={{ transitionDelay: stagger || !rowsIn ? `${i * 55}ms` : "0ms" }}
              disabled={blocked || r.disabled} onClick={(e) => onPick(r, e.currentTarget)}>
              <span className="pos">{r.pos}</span>
              <span style={{ minWidth: 0 }}>
                <span className="nm" style={{ display: "block" }}>{r.name}</span>
                <span className="sub">
                  <span className="arch" style={{ background: `${r.archColor}29`, color: r.archColor }}>{r.arch}</span>
                  <span className="st">{r.stats}</span>
                </span>
              </span>
              <span className="rt">
                <b className={reveal ? "shown" : ""} style={{ transitionDelay: reveal ? `${i * 90}ms` : "0ms" }}>{reveal ? r.right : "??"}</b>
                <i>{r.sub}</i>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
