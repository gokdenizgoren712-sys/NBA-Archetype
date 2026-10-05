// Tasarım 3 — Sıralamalar: formata göre değer, kademeler, punt, G/Z.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PaIcon from "../../components/shell/PaIcon";
import { ARCHETYPE_COLOR } from "../../constants/archetypeColors";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import {
  BAD, ErrorNote, FLAGS, GOOD, InfoTip, MiniCat, PlayerMeta, RangeBar, SkeletonList, TierHeader, fmt1, sgn,
} from "./ui";
import { FORMATS, useAsync, useFantasy, useIsPhone } from "./useFantasy";

const PAGE = 40;
const POS = ["All", "PG", "SG", "SF", "PF", "C"];

function diffCell(d) {
  if (d == null) return { t: "–", c: "#8a8a8a" };
  const r = Math.round(d);
  return { t: `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r)}`, c: r >= 3 ? GOOD : r <= -3 ? BAD : "#8a8a8a" };
}

// Tavan endeksi = 4 maçın en iyisi / ortalama. Eşikler draftlanabilir ilk 156
// oyuncunun üçte birlik dilimleri (2026-09-29: 1.30 ve 1.385).
function volatility(ci) {
  if (ci == null) return { t: "–", c: "#e5e5e5" };
  const l = ci < 1.3 ? "Low" : ci < 1.385 ? "Mid" : "High";
  return { t: `${l} ${ci.toFixed(2)}×`, c: l === "High" ? GOOD : "#e5e5e5" };
}

// Sıralama durumu: null = varsayılan (değere göre, en iyi önce). Sütun tıklaması: varsayılan yön → ters yön → sıfırla.
const DEFAULT_DIR = (key) => (key === "adp" ? "asc" : "desc");
function nextSort(cur, key) {
  if (key === "value") return cur ? (cur.key === "value" && cur.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "asc" };
  const def = DEFAULT_DIR(key);
  if (!cur || cur.key !== key) return { key, dir: def };
  return cur.dir === def ? { key, dir: def === "asc" ? "desc" : "asc" } : null;
}

function Dropdown({ label, value, options, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const cur = options.find((o) => o.k === value);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className={`fz-chipbtn${value ? " on" : ""}`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {cur ? cur.l : label}<PaIcon name="chevron" size={13} color="#8a8a8a" />
      </button>
      {open && (
        <div className="fz-pop" style={{ left: 0, right: "auto", minWidth: 220 }}>
          <button className={`fz-pop-item${!value ? " on" : ""}`} style={{ minHeight: 40 }} onClick={() => { onPick(null); setOpen(false); }}>
            <span style={{ fontSize: 14 }}>Any {label.toLowerCase()}</span>
          </button>
          {options.map((o) => (
            <button key={o.k} className={`fz-pop-item${value === o.k ? " on" : ""}`} style={{ minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 8 }}
              onClick={() => { onPick(o.k); setOpen(false); }}>
              {o.dot && <i style={{ width: 6, height: 6, borderRadius: 3, background: o.dot }} />}
              <span style={{ fontSize: 14 }}>{o.l}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FantasyRankings() {
  const f = useFantasy();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const [punt, setPunt] = useState([]);
  const [metric, setMetric] = useState("g");
  const [pos, setPos] = useState("All");
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [arch, setArch] = useState(null);
  const [flag, setFlag] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState(null);

  useEffect(() => { const t = setTimeout(() => setQDeb(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  // Format değişince kategori bağımlı seçimler sıfırlanır
  useEffect(() => { setPunt([]); setMetric(f.isH2H ? "g" : "z"); setLimit(PAGE); setSort(null); }, [f.f, f.custom, f.isH2H]);
  const pickSort = (next) => { setSort(next); setLimit(PAGE); };

  const isCats = f.kind === "categories";
  const m = isCats ? metric : undefined;
  // Yalnız bu formatta geçerli punt'lar gider: format değişince sıfırlama efekti
  // bir çizim geç kalıyor ve ilk istek eski punt'la (ör. Points'e FT%) 422 alıyordu.
  const effPunt = isCats ? punt.filter((c) => f.cats.includes(c)) : [];
  const key = JSON.stringify([f.apiFormat, f.apiTeams, effPunt, m, pos, qDeb, arch, flag, limit, sort]);
  const { data, error, loading, reload } = useAsync(() => fz.rankings(f.apiFormat, f.apiTeams, {
    punt: effPunt, metric: m, position: pos === "All" ? null : pos, search: qDeb || null, archetype: arch, flag, limit,
    sort: sort?.key, dir: sort?.dir,
  }), key);

  // Format değişirken eski formatın satırları yeni başlıklarla çizilmesin.
  const fresh = data && data.format?.key === (f.isCustom ? "custom" : f.fmtInfo.key);
  const players = fresh ? data.players : [];
  const valKey = isCats ? (metric === "z" ? "value_z" : "value_g") : null;
  const valOf = (p) => (isCats ? p[valKey] : f.kind === "points" ? p.fp_game : p.hs_week_avg);
  const rangeOf = (p) => (isCats ? p[`${valKey}_range`] : f.kind === "points" ? p.fp_total_range : null);
  const rangeVal = (p) => (isCats ? p[valKey] : p.fp_total);
  const ranges = players.map(rangeOf).filter(Boolean);
  const rMin = ranges.length ? Math.min(...ranges.map((r) => r[0])) : 0;
  const rMax = ranges.length ? Math.max(...ranges.map((r) => r[1])) : 1;

  // Kademelere böl; "drop-off" = önceki kademenin son değeri − bu kademenin ilk değeri
  const tiers = [];
  players.forEach((p, i) => {
    const last = tiers[tiers.length - 1];
    if (!last || last.n !== p.tier) {
      const prev = players[i - 1];
      tiers.push({ n: p.tier, drop: prev ? `drop-off −${fmt1(Math.abs(valOf(prev) - valOf(p)), 1)}` : "", rows: [] });
    }
    tiers[tiers.length - 1].rows.push(p);
  });

  const np = punt.length;
  const togglePunt = (c) => setPunt((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : cur.length >= 3 ? cur : [...cur, c]));
  const clear = () => { setPos("All"); setQ(""); setArch(null); setFlag(null); };

  const sub = isCats
    ? `${f.t} teams · ${f.fmtInfo.label} · ${metric === "g" ? "value = sum of G-scores (weekly swings priced in)" : f.isH2H ? "value = sum of z-scores" : "z-score (G-score is for weekly formats)"}`
    : f.kind === "points" ? `${f.t} teams · ${f.fmtInfo.label} · value = season points over replacement`
      : `${f.t} teams · High Score · value = expected best game of the week`;

  const cats = f.cats;
  const cols = isCats
    ? `36px minmax(0,1fr) 78px repeat(${cats.length},46px) 52px 88px 58px 74px`
    : "36px minmax(0,1fr) 90px 70px 80px 90px 140px 58px 74px";
  // [etiket, hizalama, soluk mu, sıralama anahtarı]. Oyuncu ve değer aralığı sıralanmaz.
  const valueHead = metric === "g" ? "G-score" : "Z-score";
  const heads = isCats
    ? [["#", "center", false, "value"], ["Player", "left"], [valueHead, "right", false, "value"],
       ...cats.map((c) => [c, "center", punt.includes(c), `cat:${c}`]), ["Games", "center", false, "games"], ["Value range", "left"],
       ["ADP", "right", false, "adp"], ["vs ADP", "right", false, "adp_diff"]]
    : f.kind === "points"
      ? [["#", "center", false, "value"], ["Player", "left"], ["FP / game", "right", false, "fp_game"], ["Games", "right", false, "games"],
         ["Season", "right", false, "fp_total"], ["Over repl.", "right", false, "over_repl"],
         ["Season range", "left"], ["ADP", "right", false, "adp"], ["vs ADP", "right", false, "adp_diff"]]
      : [["#", "center", false, "value"], ["Player", "left"], ["Weekly best", "right", false, "value"], ["Per game", "right", false, "fp_game"],
         ["Volatility", "right", false, "ceiling"], ["4-game wks", "right", false, "four"], ["Games", "right", false, "games"],
         ["ADP", "right", false, "adp"], ["vs ADP", "right", false, "adp_diff"]];
  const sortLabel = (k) => (heads.find((h) => h[3] === k && h[0] !== "#") || heads.find((h) => h[3] === k) || [k])[0];
  const flat = !!sort;                                   // sıralı görünümde kademeler anlamsız
  const HEAD_TIPS = {
    "vs ADP": "Where we rank the player minus where Yahoo drafters actually take them. Green: we like him more than the market does.",
    ADP: "Average draft position: the pick number drafters take this player at, from Yahoo preseason drafts when we have them.",
    Games: "Games we expect the player to play this season, after injuries and rest.",
  };

  const archOpts = Object.keys(ARCHETYPE_COLOR).map((k) => ({ k, l: k, dot: ARCHETYPE_COLOR[k] }));
  const flagOpts = Object.entries(FLAGS).map(([k, v]) => ({ k, l: v.l }));
  const openPlayer = (p) => navigate(`/basketball/fantasy/player/${p.player_id}`);

  // Satırlar bileşen değil düz render fonksiyonu: sayfa içinde tanımlı bileşen
  // her çizimde yeni tip olur ve 300 satırın hepsi yeniden bağlanırdı.
  const deskRow = (p) => {
    const d = diffCell(p.adp_diff);
    return (
      <div key={p.player_id} className="fz-tr" style={{ gridTemplateColumns: cols }} onClick={() => openPlayer(p)} role="link" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && openPlayer(p)}>
        <span className="fz-num fz-muted" style={{ fontSize: 16, textAlign: "center" }}>{p.rank}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span className="fz-pname">{p.name}</span><PlayerMeta p={p} />
        </div>
        {isCats ? (
          <>
            <span className="fz-num" style={{ fontSize: 19, textAlign: "right" }}>{fmt1(valOf(p))}</span>
            {cats.map((c) => <MiniCat key={c} z={p.categories?.[c]?.[metric]} dim={punt.includes(c)} />)}
            <span className="fz-num" style={{ fontSize: 15, fontWeight: 600, textAlign: "center" }}>{Math.round(p.proj_gp)}</span>
            <RangeBar lo={rangeOf(p)?.[0]} hi={rangeOf(p)?.[1]} v={rangeVal(p)} min={rMin} max={rMax}
              title={rangeOf(p) ? `${fmt1(rangeOf(p)[0])} to ${fmt1(rangeOf(p)[1])}` : undefined} />
          </>
        ) : f.kind === "points" ? (
          <>
            <span className="fz-num" style={{ fontSize: 19, textAlign: "right" }}>{fmt1(p.fp_game)}</span>
            <span className="fz-num" style={{ fontSize: 15, fontWeight: 600, textAlign: "right" }}>{Math.round(p.proj_gp)}</span>
            <span className="fz-num" style={{ fontSize: 15, fontWeight: 600, textAlign: "right" }}>{Math.round(p.fp_total).toLocaleString("en-US")}</span>
            <span className="fz-num" style={{ fontSize: 15, textAlign: "right", color: p.value_over_replacement >= 0 ? GOOD : BAD }}>
              {sgn(p.value_over_replacement, 0)}</span>
            <RangeBar lo={p.fp_total_range?.[0]} hi={p.fp_total_range?.[1]} v={p.fp_total} min={rMin} max={rMax}
              title={p.fp_total_range ? `${p.fp_total_range[0]}–${p.fp_total_range[1]}` : undefined} />
          </>
        ) : (
          <>
            <span className="fz-num" style={{ fontSize: 19, textAlign: "right" }}>{fmt1(p.hs_week_avg)}</span>
            <span className="fz-num" style={{ fontSize: 15, fontWeight: 600, textAlign: "right" }}>{fmt1(p.fp_game)}</span>
            <span style={{ fontSize: 13, textAlign: "right", color: volatility(p.ceiling_index).c }}>{volatility(p.ceiling_index).t}</span>
            <span className="fz-num" style={{ fontSize: 15, fontWeight: 600, textAlign: "right" }}>{p.four_game_weeks}</span>
            <span className="fz-num" style={{ fontSize: 15, fontWeight: 600, textAlign: "right" }}>{Math.round(p.proj_gp)}</span>
          </>
        )}
        <span className="fz-num fz-muted" style={{ fontSize: 15, fontWeight: 600, textAlign: "right" }}>{Math.round(p.adp)}</span>
        <span className="fz-num" style={{ fontSize: 15, textAlign: "right", color: d.c }}>{d.t}</span>
      </div>
    );
  };

  const phoneRow = (p) => {
    const d = diffCell(p.adp_diff);
    return (
      <div key={p.player_id} className="fz-row" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 0", cursor: "pointer" }} onClick={() => openPlayer(p)}>
        <div style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 10, alignItems: "center" }}>
          <span className="fz-num fz-muted" style={{ fontSize: 16 }}>{p.rank}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span className="fz-pname" style={{ fontSize: 15 }}>{p.name}</span><PlayerMeta p={p} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <span className="fz-num" style={{ fontSize: 20, lineHeight: 1 }}>{fmt1(valOf(p))}</span>
            <span style={{ fontSize: 12, color: d.c }}>ADP {Math.round(p.adp)} · {d.t}</span>
          </div>
        </div>
        {isCats && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cats.length},1fr)`, gap: 2, paddingLeft: 38 }}>
            {cats.map((c) => {
              const z = p.categories?.[c]?.[metric];
              const w = Math.min(Math.abs(z || 0) / 3, 1) * 50;
              return (
                <div key={c} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: punt.includes(c) ? 0.35 : 1 }}>
                  <span className="fz-meta">{c}</span>
                  <div style={{ position: "relative", width: 24, height: 4, borderRadius: 2, background: "#1f1f1f" }}>
                    <span style={{ position: "absolute", top: 0, height: 4, borderRadius: 2, left: `${z >= 0 ? 50 : 50 - w}%`, width: `${w}%`, background: z >= 0 ? GOOD : BAD }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {f.kind === "points" && (
          <div style={{ display: "flex", gap: 18, paddingLeft: 38, fontSize: 12, color: "#8a8a8a" }}>
            <span>Games <span style={{ color: "#e5e5e5" }}>{Math.round(p.proj_gp)}</span></span>
            <span>Season <span style={{ color: "#e5e5e5" }}>{Math.round(p.fp_total).toLocaleString("en-US")}</span></span>
            <span>Over repl. <span style={{ color: p.value_over_replacement >= 0 ? GOOD : BAD }}>{sgn(p.value_over_replacement, 0)}</span></span>
          </div>
        )}
        {f.kind === "high_score" && (
          <div style={{ display: "flex", gap: 18, paddingLeft: 38, fontSize: 12, color: "#8a8a8a" }}>
            <span>Per game <span style={{ color: "#e5e5e5" }}>{fmt1(p.fp_game)}</span></span>
            <span>Vol. <span style={{ color: volatility(p.ceiling_index).c }}>{volatility(p.ceiling_index).t}</span></span>
            <span>4-game wks <span style={{ color: "#e5e5e5" }}>{p.four_game_weeks}</span></span>
          </div>
        )}
      </div>
    );
  };

  const valueTip = (
    <>
      <p><b>Z-score</b>: how far above or below the average player each stat is, in standard deviations, added up across the categories. It fits season-long and roto leagues.</p>
      <p><b>G-score</b>: the same idea tuned for weekly head-to-head. It discounts stats that swing a lot from week to week, so steady categories count a bit more. This is our default for H2H.</p>
    </>
  );
  const sortable = heads.filter((h) => h[3] && h[3] !== "value" || h[0] === valueHead || h[0] === "Weekly best" || h[0] === "Over repl.");
  const filterRow = (
    <>
      <span className="fz-desk-only" style={{ width: 1, height: 22, background: "#262626" }} />
      <Dropdown label="Archetype" value={arch} options={archOpts} onPick={setArch} />
      <button className={`fz-chipbtn${flag === "rookie" ? " on" : ""}`} onClick={() => setFlag(flag === "rookie" ? null : "rookie")}>Rookies</button>
      <Dropdown label="Flags" value={flag === "rookie" ? null : flag} options={flagOpts.filter((o) => o.k !== "rookie")} onPick={setFlag} />
      <div style={{ flex: 1 }} />
      {sort && (
        <button className="fz-chipbtn on" onClick={() => pickSort(null)} title="Back to our default order">
          Sorted by {sortLabel(sort.key)} {sort.dir === "asc" ? "▲" : "▼"} · Reset
        </button>
      )}
      {phone && (
        <label className="fz-meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Sort
          <select className="fz-btn sm" value={sort?.key || ""} aria-label="Sort players by"
            onChange={(e) => pickSort(e.target.value ? { key: e.target.value, dir: DEFAULT_DIR(e.target.value) } : null)}>
            <option value="">Default</option>
            {[...new Map(sortable.filter((h) => h[3] !== "value").map((h) => [h[3], h])).values()].map((h) => <option key={h[3]} value={h[3]}>{h[0]}</option>)}
          </select>
          {sort && <button className="fz-chipbtn" onClick={() => pickSort({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" })} aria-label="Reverse the sort order">{sort.dir === "asc" ? "▲" : "▼"}</button>}
        </label>
      )}
      {isCats && f.isH2H && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="fz-meta">Value</span>
          <div className="fz-seg sm">
            {[["g", "G-score"], ["z", "Z-score"]].map(([k, l]) => (
              <button key={k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)}>{l}</button>
            ))}
          </div>
          <InfoTip label="G-score vs Z-score" title="G-score or Z-score?">{valueTip}</InfoTip>
        </div>
      )}
    </>
  );
  const puntRow = isCats && (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span className="fz-sub" style={{ fontSize: 13, width: 40 }}>Punt</span>
      {cats.map((c) => {
        const off = punt.includes(c);
        return (
          <button key={c} className={`fz-punt${off ? " off" : ""}`} aria-pressed={off}
            disabled={!off && np >= 3} onClick={() => togglePunt(c)}>{c}</button>
        );
      })}
      <span className="fz-meta" style={{ marginLeft: 8 }}>
        {np >= 3 ? "Punting more than 3 rarely wins a week." : np ? `${np} punted · ranks recomputed` : "Tap a category to punt it"}
      </span>
    </div>
  );

  return (
    <>
      <SEO title="Fantasy rankings" description="Format-correct basketball fantasy rankings with tiers, punt builds and ADP value." path="/basketball/fantasy/rankings" />
      <div className="fz-page" style={{ gap: 18 }}>
        <div className="fz-head">
          <div className="fz-head-l"><h1 className="fz-h1">Rankings</h1><span className="fz-sub">{sub}</span></div>
          <div className={`fz-seg${phone ? " scroll" : ""}`}>
            {FORMATS.map((o) => (
              <button key={o.k} className={!f.isCustom && f.f === o.k ? "on" : ""} onClick={() => f.set({ f: o.k })}>{o.short}</button>
            ))}
            {f.isCustom && <button className="on">{f.fmtInfo.label}</button>}
          </div>
        </div>

        <div className="fz-sticky">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: phone ? "nowrap" : "wrap", overflowX: phone ? "auto" : "visible" }}>
            <label className={`fz-search${q ? " filled" : ""}`} style={phone ? { minWidth: 150 } : undefined}>
              <PaIcon name="search" size={16} color="#8a8a8a" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players" aria-label="Search players" />
            </label>
            <div style={{ display: "flex", gap: 2, flexWrap: phone ? "nowrap" : "wrap" }}>
              {POS.map((k) => <button key={k} className={`fz-chipbtn${pos === k ? " on" : ""}`} onClick={() => setPos(k)}>{k}</button>)}
            </div>
            {!phone && filterRow}
          </div>
          {!phone && puntRow}
          {!phone && (
            <div className="fz-thead" style={{ gridTemplateColumns: cols }}>
              {heads.map(([l, a, dim, k]) => {
                const active = k && (k === "value" ? !sort || sort.key === "value" : sort?.key === k);
                const dir = k === "value" ? (sort?.key === "value" ? sort.dir : "desc") : sort?.dir;
                const tip = HEAD_TIPS[l];
                return (
                  <span key={l} style={{ textAlign: a, opacity: dim ? 0.35 : 1, display: "flex", alignItems: "center", gap: 4,
                    justifyContent: a === "right" ? "flex-end" : a === "center" ? "center" : "flex-start" }}>
                    {k ? (
                      <button className={`fz-sort ${a[0]}${active && (sort || k !== "value" || l !== "#") ? " on" : ""}`} onClick={() => pickSort(nextSort(sort, k))}
                        aria-label={`Sort by ${l}`} style={{ width: "auto" }}
                        title={l === valueHead || l === "Weekly best" || l === "Over repl." ? "Sort by value" : `Sort by ${l}`}>
                        {l}<span className="ar" aria-hidden="true">{active ? (dir === "asc" ? "▲" : "▼") : "▼"}</span>
                      </button>
                    ) : l}
                    {tip && <InfoTip label={`What is ${l}?`} align={a === "right" ? "right" : "left"}><p>{tip}</p></InfoTip>}
                    {isCats && f.isH2H && l === valueHead && (
                      <InfoTip label="G-score vs Z-score" title={`${valueHead} explained`}>{valueTip}</InfoTip>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        {phone && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{filterRow}</div>
            {puntRow}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column" }}>
          {error && !data && <ErrorNote error={error} onRetry={reload} />}
          {loading && !fresh && <SkeletonList rows={10} />}
          <div style={{ opacity: loading && data ? 0.55 : 1, transition: "opacity .15s" }}>
            {flat
              ? players.map((p) => (phone ? phoneRow(p) : deskRow(p)))
              : tiers.map((t) => (
                <div key={`${t.n}-${t.rows[0].player_id}`}>
                  <TierHeader label={`Tier ${t.n}`} drop={phone ? "" : t.drop} />
                  {t.rows.map((p) => (phone ? phoneRow(p) : deskRow(p)))}
                </div>
              ))}
          </div>
          {fresh && !loading && players.length === 0 && (
            <div className="fz-state">
              <span className="t">No players match</span>
              <span className="b">{[pos !== "All" && pos, flag && FLAGS[flag]?.l, arch, qDeb && `“${qDeb}”`].filter(Boolean).join(" · ")}</span>
              <button className="fz-btn sm" style={{ marginTop: 6 }} onClick={clear}>Clear filters</button>
            </div>
          )}
          {fresh && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 18, gap: 12, flexWrap: "wrap" }}>
              <span className="fz-meta">
                Showing {players.length} of {data.matched} · ADP from Yahoo preseason drafts where we have them, modelled for the rest
                {isCats || f.kind === "points" ? " · value range = 10th–90th pct" : ""}
              </span>
              {players.length < data.matched && (
                <button className="fz-btn" onClick={() => setLimit((l) => Math.min(l + PAGE, 300))} disabled={limit >= 300}>
                  {limit >= 300 ? "Top 300 shown" : `Load ${PAGE} more`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
