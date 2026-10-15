import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { apiUrl } from "../lib/apiOrigin";
import { Button, Tabs } from "../components/ui";
import "./guess.css";

// /basketball/guess[/:roomId] — sezon öncesi tahmin oyunları: galibiyet çizgisine over/under,
// konferans bitiş sırası, şampiyon. İki mod: yerel (localStorage, aynı cihazdaki kişiler) ve
// oda (link ile paylaşılan; api/guess.py). Odada herkes yalnız kendi sütununu düzenler: sunucu,
// katılırken verilen anahtarı (bu tarayıcıda saklı) ister.
// Çizgiler paylaşılan prototipten (piyasa çizgisi) alındı; Primary Arch modelinin çıktısı DEĞİL.
const STORE_KEY = "pa-guess-2026-27-v2";
const OLD_KEY = "pa-guess-2026-27-v1";
const KEYS_KEY = "pa-guess-keys-v1";
const MAX_PEOPLE = 12;
const NAME_MAX = 16;
const POLL_MS = 10000;
const SAVE_DELAY = 500;

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
const BY_ABBR = Object.fromEntries(TEAMS.map((t) => [t.abbr, t]));
const SEED_ORDER = {
  east: TEAMS.filter((t) => t.conf === "east").sort((a, b) => b.line - a.line).map((t) => t.abbr),
  west: TEAMS.filter((t) => t.conf === "west").sort((a, b) => b.line - a.line).map((t) => t.abbr),
};

const GAME_TABS = [{ key: "ou", label: "Over / Under" }, { key: "order", label: "Conference order" }, { key: "champ", label: "Champion" }];
const CONF_TABS = [{ key: "all", label: "All" }, { key: "east", label: "East" }, { key: "west", label: "West" }];
const SORT_TABS = [{ key: "division", label: "Division" }, { key: "line", label: "Line" }, { key: "split", label: "Most split" }];

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const emptyPicks = () => ({ ou: {}, order: {}, champ: null });
const norm = (p) => ({ ou: p?.ou || {}, order: p?.order || {}, champ: p?.champ || null });
const countOU = (picks) => {
  const v = Object.values(picks.ou);
  return { o: v.filter((x) => x === "O").length, u: v.filter((x) => x === "U").length };
};

/* ── yerel depo ─────────────────────────────────────────────────── */
function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (raw && Array.isArray(raw.people)) {
      return { people: raw.people.filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
        .slice(0, MAX_PEOPLE).map((p) => ({ ...p, picks: norm(p.picks) })) };
    }
    // v1: { people:[{id,name}], picks:{ [id]: {ABBR:"O"|"U"} } }
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
    if (old && Array.isArray(old.people) && old.picks) {
      return { people: old.people.filter((p) => p && p.id && p.name).slice(0, MAX_PEOPLE)
        .map((p) => ({ id: p.id, name: p.name, picks: { ...emptyPicks(), ou: old.picks[p.id] || {} } })) };
    }
  } catch { /* özel pencere / bozuk veri: boş başla */ }
  return { people: [] };
}
function loadKeys() {
  try { return JSON.parse(localStorage.getItem(KEYS_KEY) || "{}") || {}; } catch { return {}; }
}

async function api(path, opts = {}) {
  const res = await fetch(apiUrl(`/api/guess${path}`), {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { /* gövde yok */ }
  if (!res.ok) {
    const err = new Error(typeof body?.detail === "string" ? body.detail : "Something went wrong. Try again.");
    err.status = res.status;
    throw err;
  }
  return body;
}

/* ── tahta durumu: yerel ya da oda ─────────────────────────────── */
function useBoard(roomId) {
  const [local, setLocal] = useState(loadLocal);
  const [roomRaw, setRoom] = useState(null);
  const [errRaw, setErrRaw] = useState(null);
  // başka odaya geçilince eski oda/hata görünmesin: sunucu yanıtındaki room_id ile eşle
  const room = roomRaw && roomRaw.room_id === roomId ? roomRaw : null;
  const roomErr = errRaw && errRaw.id === roomId ? errRaw.kind : null;
  const [keys, setKeys] = useState(loadKeys);
  const [saveState, setSaveState] = useState("idle");
  const dirty = useRef(new Set());
  const ver = useRef({});
  const timers = useRef({});
  const roomRef = useRef(null);
  const keysRef = useRef(keys);

  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { keysRef.current = keys; }, [keys]);
  useEffect(() => {
    if (roomId) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(local)); } catch { /* yoksay */ }
  }, [local, roomId]);

  const storeKeys = useCallback((next) => {
    keysRef.current = next;
    setKeys(next);
    try { localStorage.setItem(KEYS_KEY, JSON.stringify(next)); } catch { /* yoksay */ }
  }, []);

  // oda: ilk yükleme + aralıklı yenileme (kendi bekleyen düzenlemelerimiz sunucuyla ezilmez)
  useEffect(() => {
    if (!roomId) return undefined;
    let alive = true;
    const pull = async (first) => {
      try {
        const d = await api(`/rooms/${encodeURIComponent(roomId)}`);
        if (!alive) return;
        setErrRaw(null);
        setRoom((prev) => {
          const mine = new Map((prev?.members || []).map((m) => [m.id, m]));
          return {
            ...d,
            members: d.members.map((m) => (dirty.current.has(m.id) && mine.has(m.id) ? mine.get(m.id) : m)),
          };
        });
      } catch (e) {
        if (alive && (first || e.status === 404)) setErrRaw({ id: roomId, kind: e.status === 404 ? "notfound" : "offline" });
      }
    };
    pull(true);
    const t = setInterval(() => { if (!document.hidden) pull(false); }, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [roomId]);

  const locked = !!room?.locked;
  const people = useMemo(
    () => (roomId ? (room?.members || []).map((m) => ({ ...m, picks: norm(m.picks) })) : local.people),
    [roomId, room, local],
  );
  const canEdit = useCallback(
    (id) => !locked && (roomId ? !!keys[roomId]?.[id] : true),
    [locked, roomId, keys],
  );

  const flush = useCallback(async (id) => {
    const m = roomRef.current?.members.find((x) => x.id === id);
    const key = keysRef.current[roomId]?.[id];
    if (!m || !key) return;
    const v = ver.current[id];
    setSaveState("saving");
    try {
      await api(`/rooms/${encodeURIComponent(roomId)}/members/${id}`, {
        method: "PUT", headers: { "X-Guess-Key": key }, body: JSON.stringify({ picks: norm(m.picks) }),
      });
      if (ver.current[id] === v) dirty.current.delete(id);
      setSaveState(dirty.current.size ? "saving" : "saved");
    } catch (e) {
      setSaveState(e.status === 423 ? "locked" : "error");
    }
  }, [roomId]);

  const commit = useCallback((id, fn) => {
    if (!roomId) {
      setLocal((s) => ({ people: s.people.map((p) => (p.id === id ? { ...p, picks: fn(norm(p.picks)) } : p)) }));
      return;
    }
    setRoom((r) => r && ({ ...r, members: r.members.map((m) => (m.id === id ? { ...m, picks: fn(norm(m.picks)) } : m)) }));
    dirty.current.add(id);
    ver.current[id] = (ver.current[id] || 0) + 1;
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => flush(id), SAVE_DELAY);
  }, [roomId, flush]);

  const addPerson = useCallback(async (name) => {
    if (!roomId) {
      setLocal((s) => ({ people: [...s.people, { id: newId(), name, picks: emptyPicks() }] }));
      return null;
    }
    try {
      const m = await api(`/rooms/${encodeURIComponent(roomId)}/members`, { method: "POST", body: JSON.stringify({ name }) });
      storeKeys({ ...keysRef.current, [roomId]: { ...(keysRef.current[roomId] || {}), [m.id]: m.key } });
      setRoom((r) => r && ({ ...r, members: [...r.members, { id: m.id, name: m.name, picks: emptyPicks() }] }));
      return null;
    } catch (e) { return e.message; }
  }, [roomId, storeKeys]);

  const removePerson = useCallback(async (id) => {
    if (!roomId) { setLocal((s) => ({ people: s.people.filter((p) => p.id !== id) })); return; }
    try {
      await api(`/rooms/${encodeURIComponent(roomId)}/members/${id}`, {
        method: "DELETE", headers: { "X-Guess-Key": keysRef.current[roomId]?.[id] || "" },
      });
      setRoom((r) => r && ({ ...r, members: r.members.filter((m) => m.id !== id) }));
    } catch { /* anahtar yok/kilitli: kart yerinde kalır */ }
  }, [roomId]);

  /** Yerel tahtayı odaya taşır; her kişinin anahtarı bu tarayıcıda kalır. */
  const share = useCallback(async () => {
    const out = await api("/rooms", {
      method: "POST",
      body: JSON.stringify({ title: "", members: local.people.map((p) => ({ name: p.name, picks: norm(p.picks) })) }),
    });
    const mine = {};
    out.members.forEach((m) => { mine[m.id] = m.key; });
    storeKeys({ ...keysRef.current, [out.room_id]: mine });
    return out.room_id;
  }, [local, storeKeys]);

  const clearLocal = useCallback(() => setLocal({ people: [] }), []);

  return { people, canEdit, commit, addPerson, removePerson, share, clearLocal, room, roomErr, locked, saveState, keys };
}

/* ── yardımcılar ───────────────────────────────────────────────── */
function consensusOU(people, abbr) {
  let o = 0; let u = 0;
  for (const p of people) {
    const v = p.picks.ou[abbr];
    if (v === "O") o += 1; else if (v === "U") u += 1;
  }
  const tag = o + u === 0 ? null : o > u ? "over" : u > o ? "under" : "even";
  return { o, u, tag, total: o + u, splitness: o + u === 0 ? 0 : Math.min(o, u) / (o + u) };
}

/* ── oyun: Over / Under ────────────────────────────────────────── */
function OverUnder({ people, canEdit, commit }) {
  const [conf, setConf] = useState("all");
  const [sort, setSort] = useState("division");
  const rows = useMemo(() => {
    const list = TEAMS.filter((t) => conf === "all" || t.conf === conf)
      .map((t) => ({ ...t, cons: consensusOU(people, t.abbr) }));
    if (sort === "line") return list.sort((a, b) => b.line - a.line);
    if (sort === "split") return list.sort((a, b) => b.cons.splitness - a.cons.splitness || b.cons.total - a.cons.total || b.line - a.line);
    return list;
  }, [people, conf, sort]);
  const grouped = sort === "division";

  const toggle = (id, abbr, v) => commit(id, (p) => {
    const ou = { ...p.ou };
    if (ou[abbr] === v) delete ou[abbr]; else ou[abbr] = v;
    return { ...p, ou };
  });

  return (
    <>
      <div className="gs-controls">
        <Tabs segmented label="Conference" items={CONF_TABS} value={conf} onChange={setConf} />
        <Tabs segmented label="Sort" items={SORT_TABS} value={sort} onChange={setSort} />
      </div>
      <div className="pa-panel gs-scroll">
        <div className="gs-table" style={{ "--n": Math.max(people.length, 1) }} role="table" aria-label="Team win totals">
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
                  <div className="gs-team" role="rowheader"><b>{t.abbr}</b><span>{t.name}</span></div>
                  <div className="gs-line" role="cell">{t.line.toFixed(1)}</div>
                  {people.map((p) => {
                    const v = p.picks.ou[t.abbr];
                    if (!canEdit(p.id)) {
                      return (
                        <div key={p.id} className="gs-pick" role="cell">
                          <span className={`gs-ro ${v === "O" ? "o" : v === "U" ? "u" : ""}`}>{v || "·"}</span>
                        </div>
                      );
                    }
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
    </>
  );
}

/* ── oyun: konferans bitiş sırası ──────────────────────────────── */
function OrderEditor({ conf, person, commit }) {
  const seq = person.picks.order[conf];
  const started = Array.isArray(seq) && seq.length === 15;
  const set = (next) => commit(person.id, (p) => ({ ...p, order: { ...p.order, [conf]: next } }));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= seq.length) return;
    const next = [...seq];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  const reset = () => commit(person.id, (p) => {
    const order = { ...p.order }; delete order[conf];
    return { ...p, order };
  });
  return (
    <section className="pa-panel gs-order" aria-label={`${conf === "east" ? "East" : "West"} order`}>
      <div className="gs-order-head">
        <span className={`gs-conf ${conf}`}>{conf === "east" ? "East" : "West"}</span>
        {started && <button type="button" className="gs-link" onClick={reset}>Clear</button>}
      </div>
      {!started ? (
        <div className="gs-order-start">
          <p>Rank all 15 teams from first seed to last. Start from the win-total lines and move teams up or down.</p>
          <Button onClick={() => set([...SEED_ORDER[conf]])}>Start from the lines</Button>
        </div>
      ) : (
        <ol className="gs-rank">
          {seq.map((abbr, i) => (
            <li key={abbr}>
              <span className="gs-rk">{i + 1}</span>
              <b>{abbr}</b>
              <span className="gs-rk-name">{BY_ABBR[abbr].name}</span>
              <span className="gs-mv">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${BY_ABBR[abbr].name} up`}>↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === seq.length - 1} aria-label={`Move ${BY_ABBR[abbr].name} down`}>↓</button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function OrderBoard({ people, canEdit, commit }) {
  const editors = people.filter((p) => canEdit(p.id));
  const [who, setWho] = useState(null);
  const person = editors.find((p) => p.id === who) || editors[0] || null;

  const table = (conf) => {
    const teams = TEAMS.filter((t) => t.conf === conf).map((t) => {
      const ranks = people.map((p) => {
        const s = p.picks.order[conf];
        const i = Array.isArray(s) && s.length === 15 ? s.indexOf(t.abbr) : -1;
        return i < 0 ? null : i + 1;
      });
      const got = ranks.filter((r) => r != null);
      const avg = got.length ? got.reduce((a, b) => a + b, 0) / got.length : null;
      return { ...t, ranks, avg };
    });
    return teams.sort((a, b) => (a.avg ?? 99 + (60 - a.line) / 100) - (b.avg ?? 99 + (60 - b.line) / 100));
  };

  return (
    <>
      {person ? (
        <>
          {editors.length > 1 && (
            <Tabs segmented label="Whose order" value={person.id} onChange={setWho}
              items={editors.map((p) => ({ key: p.id, label: p.name }))} />
          )}
          <div className="gs-orders">
            <OrderEditor conf="east" person={person} commit={commit} />
            <OrderEditor conf="west" person={person} commit={commit} />
          </div>
        </>
      ) : (
        <p className="gs-empty">Add your name above to rank the conferences.</p>
      )}

      {["east", "west"].map((conf) => (
        <div key={conf} className="pa-panel gs-scroll">
          <div className="gs-table" style={{ "--n": Math.max(people.length, 1) }} role="table" aria-label={`${conf} average order`}>
            <div className="gs-row gs-th gs-ord" role="row">
              <div className="gs-team" role="columnheader">{conf === "east" ? "East" : "West"} · group order</div>
              <div className="gs-line" role="columnheader">Avg</div>
              {people.map((p) => <div key={p.id} className="gs-pick" role="columnheader" title={p.name}><span>{p.name}</span></div>)}
              <div className="gs-cons" role="columnheader" />
            </div>
            {table(conf).map((t) => (
              <div key={t.abbr} className="gs-row gs-ord" role="row">
                <div className="gs-team" role="rowheader"><b>{t.abbr}</b><span>{t.name}</span></div>
                <div className="gs-line" role="cell">{t.avg == null ? "—" : t.avg.toFixed(1)}</div>
                {t.ranks.map((r, i) => (
                  <div key={people[i].id} className="gs-pick" role="cell">
                    <span className="gs-ro">{r ?? "·"}</span>
                  </div>
                ))}
                <div className="gs-cons" role="cell" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* ── oyun: şampiyon ────────────────────────────────────────────── */
function Champion({ people, canEdit, commit }) {
  const tally = useMemo(() => {
    const m = new Map();
    people.forEach((p) => { if (p.picks.champ) m.set(p.picks.champ, [...(m.get(p.picks.champ) || []), p.name]); });
    return [...m.entries()].map(([abbr, names]) => ({ abbr, names })).sort((a, b) => b.names.length - a.names.length || BY_ABBR[b.abbr].line - BY_ABBR[a.abbr].line);
  }, [people]);
  const top = tally[0]?.names.length || 1;
  const byLine = [...TEAMS].sort((a, b) => b.line - a.line);

  return (
    <div className="gs-champ">
      <section className="pa-panel gs-champ-pick" aria-label="Champion picks">
        <h2 className="gs-h2">Who wins the title?</h2>
        {people.length === 0 && <p className="gs-empty">Add your name above to pick a champion.</p>}
        <ul className="gs-champ-list">
          {people.map((p) => (
            <li key={p.id}>
              <span className="gs-champ-name">{p.name}</span>
              {canEdit(p.id) ? (
                <select value={p.picks.champ || ""} aria-label={`${p.name}: champion`}
                  onChange={(e) => commit(p.id, (x) => ({ ...x, champ: e.target.value || null }))}>
                  <option value="">No pick</option>
                  {byLine.map((t) => <option key={t.abbr} value={t.abbr}>{t.name} ({t.line.toFixed(1)} wins)</option>)}
                </select>
              ) : (
                <span className="gs-ro-text">{p.picks.champ ? BY_ABBR[p.picks.champ].name : "No pick"}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="pa-panel gs-champ-tally" aria-label="Champion tally">
        <h2 className="gs-h2">Group board</h2>
        {tally.length === 0 ? <p className="gs-empty">No picks yet.</p> : (
          <ul className="gs-tally">
            {tally.map((t) => (
              <li key={t.abbr}>
                <div className="gs-tally-top"><b>{BY_ABBR[t.abbr].name}</b><span>{t.names.length}</span></div>
                <div className="gs-tally-bar"><i style={{ width: `${(t.names.length / top) * 100}%` }} /></div>
                <small>{t.names.join(", ")}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ── sayfa ─────────────────────────────────────────────────────── */
export default function Guess() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const board = useBoard(roomId);
  const { people, canEdit, commit, addPerson, removePerson, share, clearLocal, room, roomErr, locked, saveState } = board;
  const [game, setGame] = useState("ou");
  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [shareErr, setShareErr] = useState("");

  const trimmed = name.trim();
  const dupe = people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const cap = roomId ? (room?.max_members ?? 20) : MAX_PEOPLE;
  const full = people.length >= cap;
  const mine = people.filter((p) => canEdit(p.id));
  const joining = !!roomId && mine.length === 0 && !locked;

  const onAdd = async (e) => {
    e.preventDefault();
    if (!trimmed || dupe || full || busy || locked) return;
    setBusy(true); setNameErr("");
    const err = await addPerson(trimmed.slice(0, NAME_MAX));
    setBusy(false);
    if (err) setNameErr(err); else setName("");
  };

  const onShare = async () => {
    setBusy(true); setShareErr("");
    try {
      const id = await share();
      clearLocal();
      navigate(`/basketball/guess/${id}`);
    } catch (e) { setShareErr(e.message); }
    setBusy(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/basketball/guess/${roomId}`);
      setCopied("link"); setTimeout(() => setCopied(""), 1800);
    } catch { /* pano yok */ }
  };

  const copySummary = async () => {
    const lines = ["Primary Arch · Guess · 2026-27", ""];
    for (const p of people) {
      const c = countOU(p.picks);
      lines.push(`${p.name}: ${c.o} over / ${c.u} under${p.picks.champ ? ` · champion ${BY_ABBR[p.picks.champ].name}` : ""}`);
    }
    lines.push("");
    for (const t of [...TEAMS].sort((a, b) => b.line - a.line)) {
      const c = consensusOU(people, t.abbr);
      if (c.total) lines.push(`${t.abbr} ${t.line}: ${c.o} over / ${c.u} under`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied("summary"); setTimeout(() => setCopied(""), 1800);
    } catch { /* pano yok */ }
  };

  if (roomId && roomErr === "notfound") {
    return (
      <div className="gs-page">
        <SEO title="Guess" description="Pre-season predictions with friends." path="/basketball/guess" />
        <header className="gs-head"><div><p className="pa-eyebrow">Play · Guess</p><h1 className="pa-h1">Guess</h1></div></header>
        <section className="pa-panel gs-people">
          <p className="gs-empty">This board doesn&apos;t exist. Check the link, or start a new one.</p>
          <div><Button onClick={() => navigate("/basketball/guess")}>Start a board</Button></div>
        </section>
      </div>
    );
  }

  const savedLabel = { saving: "Saving…", saved: "Saved", error: "Couldn't save — check your connection", locked: "Picks are locked" }[saveState];
  const hasPicks = people.some((p) => countOU(p.picks).o + countOU(p.picks).u + (p.picks.champ ? 1 : 0) > 0);

  return (
    <div className="gs-page">
      <SEO title="Guess" description="Predict every NBA team's 2026-27 win total, conference order and champion, and compare with friends." path="/basketball/guess" />
      <header className="gs-head">
        <div>
          <p className="pa-eyebrow">Play · Guess</p>
          <h1 className="pa-h1">Guess</h1>
          <p className="gs-sub">Call the 2026-27 season before it starts: win totals, conference order and the champion. Add your name, make your picks, see where the group splits.</p>
        </div>
        <div className="gs-head-actions">
          {roomId ? (
            <Button onClick={copyLink}>{copied === "link" ? "Link copied" : "Copy invite link"}</Button>
          ) : (
            <Button onClick={onShare} disabled={busy}>{busy ? "Creating…" : "Share this board"}</Button>
          )}
          <Button variant="secondary" onClick={copySummary} disabled={!hasPicks}>{copied === "summary" ? "Copied" : "Copy summary"}</Button>
        </div>
      </header>
      {shareErr && <p className="gs-hint err" role="alert">{shareErr}</p>}
      {roomId && roomErr === "offline" && !room && <p className="gs-hint err" role="alert">Couldn&apos;t load this board. Check your connection and reload.</p>}
      {locked && <p className="gs-lock" role="status">Picks are locked — the season has started. You can still look.</p>}

      <section className="pa-panel gs-people" aria-label="People">
        <div className="gs-people-top">
          {!locked && (
            <form className="gs-add" onSubmit={onAdd}>
              <label htmlFor="gs-name" className="gs-lab">{joining ? "Join with your name" : roomId ? "Add another person on this device" : "Add a person"}</label>
              <div className="gs-add-row">
                <input id="gs-name" value={name} maxLength={NAME_MAX} autoComplete="off" placeholder="Type a name"
                  onChange={(e) => { setName(e.target.value); setNameErr(""); }} disabled={full} />
                <Button type="submit" disabled={!trimmed || dupe || full || busy}>{joining ? "Join" : "Add"}</Button>
              </div>
              <span className={`gs-hint${dupe || nameErr ? " err" : ""}`} role={dupe || nameErr ? "alert" : undefined}>
                {dupe ? "That name is already on the board."
                  : nameErr || (full ? `This board is full (${cap} people).`
                    : roomId ? `${people.length}/${cap} on this board · everyone edits their own picks.`
                      : `${people.length}/${cap} · picks stay in this browser until you share the board.`)}
              </span>
            </form>
          )}
          {roomId && savedLabel && <span className={`gs-save ${saveState}`} role="status">{savedLabel}</span>}
        </div>

        {people.length > 0 && (
          <ul className="gs-cards">
            {people.map((p) => {
              const c = countOU(p.picks);
              const done = c.o + c.u;
              const editable = canEdit(p.id);
              return (
                <li key={p.id} className={`gs-card${editable && roomId ? " me" : ""}`}>
                  <div className="gs-card-top">
                    <strong title={p.name}>{p.name}</strong>
                    <span className="gs-count">{done}/{TEAMS.length}</span>
                  </div>
                  <div className="gs-bar" role="img" aria-label={`${c.o} over, ${c.u} under`}>
                    <i className="o" style={{ flexGrow: c.o }} />
                    <i className="u" style={{ flexGrow: c.u }} />
                    {done === 0 && <i className="none" />}
                  </div>
                  <div className="gs-card-meta"><span className="o">{c.o} over</span><span className="u">{c.u} under</span></div>
                  <div className="gs-card-champ">{p.picks.champ ? `Champion: ${BY_ABBR[p.picks.champ].name}` : "No champion yet"}</div>
                  {editable && (
                    <div className="gs-card-actions">
                      <button type="button" onClick={() => commit(p.id, () => emptyPicks())} disabled={!hasPicks}>Clear picks</button>
                      <button type="button" onClick={() => removePerson(p.id)}>Remove</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Tabs segmented label="Game" items={GAME_TABS} value={game} onChange={setGame} />

      {people.length === 0 && game === "ou" && (
        <p className="gs-empty">Add a name above to start picking. The lines are listed below.</p>
      )}

      {game === "ou" && <OverUnder people={people} canEdit={canEdit} commit={commit} />}
      {game === "order" && <OrderBoard people={people} canEdit={canEdit} commit={commit} />}
      {game === "champ" && <Champion people={people} canEdit={canEdit} commit={commit} />}

      <p className="gs-foot">Lines are market win totals carried over from the shared prototype, not Primary Arch model output. Tap the same button again to clear a pick.{roomId ? " Anyone with the link can read this board and add themselves; only you can change your own picks from this browser." : ""}</p>
    </div>
  );
}
