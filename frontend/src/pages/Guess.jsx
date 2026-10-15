import { useEffect, useMemo, useState } from "react";
import { SEO } from "../hooks/useSEO";
import { Button, Tabs } from "../components/ui";
import "./guess.css";

// /basketball/guess — 2026-27 takım galibiyet çizgisi için Over/Under tahmin ızgarası.
// Yerel-öncelikli: kişiler ve seçimler localStorage'da tutulur, çevrimiçi paylaşım sonra eklenecek.
// Çizgiler paylaşılan prototipten (piyasa çizgisi) alındı; Primary Arch modelinin çıktısı DEĞİL.
const STORE_KEY = "pa-guess-2026-27-v1";
const MAX_PEOPLE = 12;
const NAME_MAX = 16;

const DIVISIONS = [
  { conf: "east", name: "Atlantic", teams: [
    ["NYK", "Knicks", 52.5], ["BOS", "Celtics", 51.5], ["PHI", "76ers", 50.5], ["TOR", "Raptors", 42.5], ["BKN", "Nets", 24.5]] },
  { conf: "east", name: "Central", teams: [
    ["CLE", "Cavaliers", 49.5], ["DET", "Pistons", 49.5], ["IND", "Pacers", 44.5], ["CHI", "Bulls", 29.5], ["MIL", "Bucks", 26.5]] },
  { conf: "east", name: "Southeast", teams: [
    ["ORL", "Magic", 43.5], ["ATL", "Hawks", 43.5], ["MIA", "Heat", 41.5], ["CHA", "Hornets", 39.5], ["WAS", "Wizards", 28.5]] },
  { conf: "west", name: "Northwest", teams: [
    ["OKC", "Thunder", 61.5], ["DEN", "Nuggets", 49.5], ["MIN", "Timberwolves", 48.5], ["POR", "Trail Blazers", 43.5], ["UTA", "Jazz", 35.5]] },
  { conf: "west", name: "Pacific", teams: [
    ["LAL", "Lakers", 45.5], ["GSW", "Warriors", 40.5], ["PHX", "Suns", 38.5], ["SAC", "Kings", 27.5], ["LAC", "Clippers", 26.5]] },
  { conf: "west", name: "Southwest", teams: [
    ["SAS", "Spurs", 60.5], ["HOU", "Rockets", 47.5], ["DAL", "Mavericks", 34.5], ["NOP", "Pelicans", 31.5], ["MEM", "Grizzlies", 28.5]] },
];
const TEAMS = DIVISIONS.flatMap((d) =>
  d.teams.map(([abbr, name, line]) => ({ abbr, name, line, conf: d.conf, division: d.name })));

const CONF_TABS = [{ key: "all", label: "All" }, { key: "east", label: "East" }, { key: "west", label: "West" }];
const SORT_TABS = [{ key: "division", label: "Division" }, { key: "line", label: "Line" }, { key: "split", label: "Most split" }];

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (raw && Array.isArray(raw.people) && raw.picks && typeof raw.picks === "object") {
      const people = raw.people
        .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
        .slice(0, MAX_PEOPLE);
      return { people, picks: raw.picks };
    }
  } catch { /* özel pencere / bozuk veri: boş başla */ }
  return { people: [], picks: {} };
}

function consensusOf(people, picks, abbr) {
  let o = 0; let u = 0;
  for (const p of people) {
    const v = picks[p.id]?.[abbr];
    if (v === "O") o += 1; else if (v === "U") u += 1;
  }
  const tag = o + u === 0 ? null : o > u ? "over" : u > o ? "under" : "even";
  return { o, u, tag, total: o + u, splitness: o + u === 0 ? 0 : Math.min(o, u) / (o + u) };
}

export default function Guess() {
  const [{ people, picks }, setState] = useState(load);
  const [name, setName] = useState("");
  const [conf, setConf] = useState("all");
  const [sort, setSort] = useState("division");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ people, picks })); } catch { /* yoksay */ }
  }, [people, picks]);

  const trimmed = name.trim();
  const dupe = people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const full = people.length >= MAX_PEOPLE;

  const addPerson = (e) => {
    e.preventDefault();
    if (!trimmed || dupe || full) return;
    setState((s) => ({ ...s, people: [...s.people, { id: newId(), name: trimmed.slice(0, NAME_MAX) }] }));
    setName("");
  };
  const removePerson = (id) => setState((s) => {
    const next = { ...s.picks }; delete next[id];
    return { people: s.people.filter((p) => p.id !== id), picks: next };
  });
  const clearPerson = (id) => setState((s) => ({ ...s, picks: { ...s.picks, [id]: {} } }));
  const toggle = (id, abbr, v) => setState((s) => {
    const mine = { ...(s.picks[id] || {}) };
    if (mine[abbr] === v) delete mine[abbr]; else mine[abbr] = v;
    return { ...s, picks: { ...s.picks, [id]: mine } };
  });

  const stats = useMemo(() => people.map((p) => {
    const mine = picks[p.id] || {};
    const vals = Object.values(mine);
    const o = vals.filter((v) => v === "O").length;
    const u = vals.filter((v) => v === "U").length;
    return { ...p, o, u, done: o + u };
  }), [people, picks]);

  const rows = useMemo(() => {
    const list = TEAMS.filter((t) => conf === "all" || t.conf === conf)
      .map((t) => ({ ...t, cons: consensusOf(people, picks, t.abbr) }));
    if (sort === "line") return list.sort((a, b) => b.line - a.line);
    if (sort === "split") return list.sort((a, b) => b.cons.splitness - a.cons.splitness || b.cons.total - a.cons.total || b.line - a.line);
    return list;
  }, [people, picks, conf, sort]);

  const grouped = sort === "division";
  const totalPicks = stats.reduce((n, s) => n + s.done, 0);

  const copySummary = async () => {
    const lines = ["Primary Arch · Guess · 2026-27 team win totals", ""];
    for (const s of stats) lines.push(`${s.name}: ${s.o} over / ${s.u} under (${s.done}/${TEAMS.length})`);
    lines.push("");
    for (const t of [...TEAMS].sort((a, b) => b.line - a.line)) {
      const c = consensusOf(people, picks, t.abbr);
      if (!c.total) continue;
      lines.push(`${t.abbr} ${t.line}: ${c.o} over / ${c.u} under`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* pano yok */ }
  };

  const gridStyle = { "--n": Math.max(people.length, 1) };

  return (
    <div className="gs-page">
      <SEO title="Guess" description="Pick Over or Under on every NBA team's 2026-27 win total and compare with friends." path="/basketball/guess" />
      <header className="gs-head">
        <div>
          <p className="pa-eyebrow">Play · Guess</p>
          <h1 className="pa-h1">Guess</h1>
          <p className="gs-sub">Over or under on every team&apos;s 2026-27 win total. Add the people in your group, make the picks, see where you split.</p>
        </div>
        <div className="gs-head-actions">
          <Button variant="secondary" onClick={copySummary} disabled={!totalPicks}>{copied ? "Copied" : "Copy summary"}</Button>
        </div>
      </header>

      <section className="pa-panel gs-people" aria-label="People">
        <form className="gs-add" onSubmit={addPerson}>
          <label htmlFor="gs-name" className="gs-lab">Add a person</label>
          <div className="gs-add-row">
            <input id="gs-name" value={name} maxLength={NAME_MAX} autoComplete="off" placeholder="Type a name"
              onChange={(e) => setName(e.target.value)} disabled={full} />
            <Button type="submit" disabled={!trimmed || dupe || full}>Add</Button>
          </div>
          <span className="gs-hint" role={dupe ? "alert" : undefined}>
            {dupe ? "That name is already on the board." : full ? `Up to ${MAX_PEOPLE} people.` : `${people.length}/${MAX_PEOPLE} · picks stay in this browser.`}
          </span>
        </form>

        {stats.length > 0 && (
          <ul className="gs-cards">
            {stats.map((s) => (
              <li key={s.id} className="gs-card">
                <div className="gs-card-top">
                  <strong title={s.name}>{s.name}</strong>
                  <span className="gs-count">{s.done}/{TEAMS.length}</span>
                </div>
                <div className="gs-bar" role="img" aria-label={`${s.o} over, ${s.u} under`}>
                  <i className="o" style={{ flexGrow: s.o }} />
                  <i className="u" style={{ flexGrow: s.u }} />
                  {s.done === 0 && <i className="none" />}
                </div>
                <div className="gs-card-meta">
                  <span className="o">{s.o} over</span>
                  <span className="u">{s.u} under</span>
                </div>
                <div className="gs-card-actions">
                  <button type="button" onClick={() => clearPerson(s.id)} disabled={!s.done}>Clear picks</button>
                  <button type="button" onClick={() => removePerson(s.id)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="gs-controls">
        <Tabs segmented label="Conference" items={CONF_TABS} value={conf} onChange={setConf} />
        <Tabs segmented label="Sort" items={SORT_TABS} value={sort} onChange={setSort} />
      </div>

      {people.length === 0 && (
        <p className="gs-empty">Add at least one name above to start picking. The lines are listed below.</p>
      )}

      <div className="pa-panel gs-scroll">
        <div className="gs-table" style={gridStyle} role="table" aria-label="Team win totals">
          <div className="gs-row gs-th" role="row">
            <div className="gs-team" role="columnheader">Team</div>
            <div className="gs-line" role="columnheader">Line</div>
            {people.map((p) => (
              <div key={p.id} className="gs-pick" role="columnheader" title={p.name}><span>{p.name}</span></div>
            ))}
            <div className="gs-cons" role="columnheader">Group</div>
          </div>

          {rows.map((t, i) => {
            const showDiv = grouped && (i === 0 || rows[i - 1].division !== t.division);
            return (
              <div key={t.abbr} role="presentation" className="gs-fragment">
                {showDiv && (
                  <div className="gs-div" role="presentation">
                    <span className="gs-div-in">
                      <span className={`gs-conf ${t.conf}`}>{t.conf === "east" ? "East" : "West"}</span>
                      {t.division}
                    </span>
                  </div>
                )}
                <div className="gs-row" role="row">
                  <div className="gs-team" role="rowheader">
                    <b>{t.abbr}</b><span>{t.name}</span>
                  </div>
                  <div className="gs-line" role="cell">{t.line.toFixed(1)}</div>
                  {people.map((p) => {
                    const v = picks[p.id]?.[t.abbr];
                    return (
                      <div key={p.id} className="gs-pick" role="cell">
                        <button type="button" className={`o${v === "O" ? " on" : ""}`} aria-pressed={v === "O"}
                          aria-label={`${p.name}: ${t.name} over ${t.line}`} onClick={() => toggle(p.id, t.abbr, "O")}>O</button>
                        <button type="button" className={`u${v === "U" ? " on" : ""}`} aria-pressed={v === "U"}
                          aria-label={`${p.name}: ${t.name} under ${t.line}`} onClick={() => toggle(p.id, t.abbr, "U")}>U</button>
                      </div>
                    );
                  })}
                  <div className="gs-cons" role="cell">
                    {t.cons.tag ? (
                      <span className={`gs-tag ${t.cons.tag}`}>
                        {t.cons.tag === "even" ? "Split" : t.cons.tag === "over" ? "Over" : "Under"}
                        <em>{t.cons.o}–{t.cons.u}</em>
                      </span>
                    ) : <span className="gs-none">—</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="gs-foot">Lines are market win totals carried over from the shared prototype, not Primary Arch model output. Tap the same button again to clear a pick.</p>
    </div>
  );
}
