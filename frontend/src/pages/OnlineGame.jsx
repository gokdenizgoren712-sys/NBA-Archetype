import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { useAuth } from "../contexts/AuthContext";
import { useGameSocket } from "../hooks/useGameSocket";
import { ERAS, ERA_HEX } from "../game/eras";
import FullCourtBoard from "../game/FullCourtBoard";
import {
  WheelIcon, UsersIcon, TrophyIcon, CrownIcon, CapIcon, GlobeIcon,
  LoopIcon, TargetIcon, SearchIcon, WarnIcon, PlayIcon, StarIcon,
} from "../game/GameIcons";
import "../game/game.css";

// ── Online Opponent ───────────────────────────────────────────────────────
// İki giriş yolu var, ikisi de aynı Salary Cap kuralıyla ve aynı best-of-7
// motoruyla bitiyor:
//   1) LIVE   — sıraya gir, başka bir oyuncuyla eşleş, canlı snake draft.
//   2) BOARD  — Salary Cap leaderboard'unun ilk 25'inden bir kadro seç, o
//               DONMUŞ kadroya karşı tek başına draft yap. Rakip beklemek
//               yok; karşındaki skor zaten tabloda duruyor.
//
// BU DOSYA ŞU AN UI KATMANI. Sunucuya bağlanacak yerler `INTEGRATION:`
// yorumlarıyla işaretli — hepsi tek bir yerde toplandı ki backend prompt'u
// birebir bu noktalara otursun.

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const BENCH_SLOTS = ["B1", "B2", "B3", "B4"];
const SLOT_ORDER = [...POSITIONS, ...BENCH_SLOTS];

const GRADE_HEX = { S: "#c4b5fd", A: "#4ade80", B: "#60a5fa", C: "#FFB11B", D: "#f87171" };
const gradeFor = (pct) => pct >= 85 ? "S" : pct >= 78 ? "A" : pct >= 70 ? "B" : pct >= 62 ? "C" : "D";
const PODIUM = ["#FFB11B", "#cbd5e1", "#d08b52"];

// /api/game/board'un roster'ı (tam oyuncu satırları, arketip skorları dahil)
// → FullCourtBoard'un beklediği slot haritası.
function rosterToLineup(roster) {
  const list = Array.isArray(roster) ? roster : [];
  const out = {};
  SLOT_ORDER.forEach((slot, i) => { out[slot] = list[i] || null; });
  return out;
}

function parseRoster(entry) {
  return Array.isArray(entry?.roster) ? entry.roster : [];
}

// ── Sıra durumu: arama animasyonu ────────────────────────────────────────
function QueuePanel({ state, elapsed, queueSize, opponent, onFind, onCancel, onAccept, disabled }) {
  const searching = state === "searching";
  const found = state === "found";
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="g-panel p-5">
      <span className="aura-blob" style={{
        "--slot-color": found ? "#4ade80" : "#60a5fa",
        left: "20%", top: -50, width: 260, height: 140,
        opacity: searching ? 0.3 : 0.18,
      }} />

      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="g-label">
          <span className={`inline-block w-1.5 h-1.5 rounded-full${searching ? " animate-pulse" : ""}`}
            style={{ background: found ? "#4ade80" : "#60a5fa" }} />
          Live Opponent
        </div>
        <span className="g-status" style={{
          "--accent": found ? "#4ade80" : "#60a5fa",
          "--accent-a": (found ? "#4ade80" : "#60a5fa") + "1f",
          "--accent-line": (found ? "#4ade80" : "#60a5fa") + "55",
        }}>
          {found ? "Match Found" : searching ? "Searching" : "Idle"}
        </span>
      </div>

      <p className="text-[11.5px] leading-relaxed mb-4" style={{ color: "var(--text-muted)" }}>
        Get paired with another fan at random. Same rules as With a Friend — one shared era,
        snake draft, 100% salary cap each, five jokers plus counter-jokers, best-of-7 series.
      </p>

      {!searching && !found && (
        <button onClick={onFind} disabled={disabled} className="aura-rating-btn w-full"
          style={{ padding: "14px", fontSize: 14, letterSpacing: ".12em", opacity: disabled ? 0.5 : 1 }}>
          <SearchIcon size={15} /> <span className="ml-2">Find Opponent</span>
        </button>
      )}

      {searching && (
        <div className="text-center py-2">
          {/* Arama nabzı — üç halka, dışa doğru açılıyor */}
          <div className="relative mx-auto mb-4" style={{ width: 96, height: 96 }}>
            {[0, 1, 2].map(i => (
              <span key={i} className="g-ping" style={{ animationDelay: `${i * 0.6}s` }} />
            ))}
            <div className="absolute inset-0 flex items-center justify-center" style={{ color: "#60a5fa" }}>
              <GlobeIcon size={30} />
            </div>
          </div>
          <div className="font-logo text-2xl font-black tabular-nums" style={{ color: "var(--text-primary)" }}>{mm}:{ss}</div>
          <div className="g-mono mt-1" style={{ color: "var(--text-faint)" }}>
            {queueSize != null ? `${queueSize} in queue` : "searching for an opponent"}
          </div>
          <button onClick={onCancel} className="mt-4 text-[11.5px] underline underline-offset-2"
            style={{ color: "var(--text-muted)" }}>Cancel</button>
        </div>
      )}

      {found && opponent && (
        <div className="text-center py-1">
          <div className="relative w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
            style={{ color: "#4ade80", border: "1px solid #4ade8055", background: "#4ade8014" }}>
            <span className="aura-blob" style={{ "--slot-color": "#4ade80", left: "50%", top: -12, width: 110, height: 70, transform: "translateX(-50%)", opacity: 0.35 }} />
            <span className="relative"><UsersIcon size={26} /></span>
          </div>
          <div className="font-logo text-base font-bold mt-3" style={{ color: "var(--text-primary)" }}>{opponent.username}</div>
          <div className="g-mono mt-1" style={{ color: "var(--text-faint)" }}>
            {opponent.games != null ? `${opponent.games} games` : "new challenger"}
            {opponent.best != null ? ` · best ${opponent.best}` : ""}
          </div>
          <button onClick={onAccept} className="aura-rating-btn w-full mt-4"
            style={{ padding: "13px", fontSize: 14, letterSpacing: ".12em" }}>
            <PlayIcon size={15} /> <span className="ml-2">Enter Draft</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Leaderboard'dan rakip seçimi ─────────────────────────────────────────
// Board, puan (pct) başına TEK temsilci kadro gösterir (bkz. api/game_ws.py
// get_board). Aynı puana ulaşmış BAŞKA kadrolarla oynamak isteyenler için
// bir puan filtresi var: /api/game/board/at-score o puandaki tüm kadroları
// döndürür (bkz. 2026-08 kullanıcı kararı — "iki ayrı bağımsız leaderboard
// istemiyorum", Board zaten Single Player'ın aynı verisinin bir görünümü).
function BoardPanel({ entries, selected, onSelect, onChallenge, loading, challenging }) {
  const [scoreFilter, setScoreFilter] = useState("");
  const [filteredEntries, setFilteredEntries] = useState(null);
  const [filterLoading, setFilterLoading] = useState(false);

  useEffect(() => {
    const pct = scoreFilter.trim() === "" ? null : Number(scoreFilter);
    if (pct == null || !Number.isInteger(pct) || pct < 0 || pct > 100) {
      setFilteredEntries(null);
      return;
    }
    let alive = true;
    setFilterLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/game/board/at-score?pct=${pct}`)
        .then(r => r.json())
        .then(d => { if (alive) setFilteredEntries(d.entries || []); })
        .catch(() => { if (alive) setFilteredEntries([]); })
        .finally(() => { if (alive) setFilterLoading(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [scoreFilter]);

  const shownEntries = filteredEntries ?? entries;
  const isFiltering = filteredEntries != null;

  return (
    <div className="g-panel p-4 g-hud-fill">
      <span className="aura-blob" style={{ "--slot-color": "#FFB11B", right: "12%", top: -44, width: 220, height: 120, opacity: 0.16 }} />

      <div className="g-label shrink-0 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--yamabuki)" }} />
          Challenge the Board
        </span>
        <span className="g-status inline-flex items-center gap-1"
          style={{ "--accent": "#FFB11B", "--accent-a": "rgba(255,177,27,.12)", "--accent-line": "rgba(255,177,27,.4)" }}>
          <CapIcon size={11} /> {isFiltering ? `${shownEntries.length} at ${scoreFilter}` : "Top 25"}
        </span>
      </div>

      <p className="text-[11.5px] leading-relaxed mt-2 shrink-0" style={{ color: "var(--text-muted)" }}>
        No waiting. Pick any of the 25 best Salary Cap rosters ever submitted and draft against it —
        their lineup is frozen, their era is the era you play in.
      </p>

      <div className="flex items-center gap-2 mt-2.5 shrink-0">
        <input type="number" min={0} max={100} placeholder="Look up an exact score…"
          value={scoreFilter} onChange={e => { setScoreFilter(e.target.value); onSelect(null); }}
          className="flex-1 px-2.5 py-1.5 rounded-lg text-xs outline-none"
          style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
        {isFiltering && (
          <button onClick={() => { setScoreFilter(""); onSelect(null); }}
            className="text-[10.5px] px-2 py-1.5 rounded-lg shrink-0"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            Clear
          </button>
        )}
      </div>
      {isFiltering && (
        <p className="text-[10.5px] mt-1 shrink-0" style={{ color: "var(--text-faint)" }}>
          Every Single Player roster that scored exactly {scoreFilter} — not just the one shown by default.
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 mt-3 space-y-0.5">
        {(loading || filterLoading) && [...Array(8)].map((_, i) => <div key={i} className="g-lb-skel" />)}

        {!loading && !filterLoading && shownEntries.length === 0 && !isFiltering && (
          <p className="text-[11.5px] leading-relaxed py-3" style={{ color: "var(--text-muted)" }}>
            No Salary Cap runs on the board yet. Play a Salary Cap game in Single Player and yours
            becomes the first roster anyone can challenge.
          </p>
        )}

        {!loading && !filterLoading && shownEntries.length === 0 && isFiltering && (
          <p className="text-[11.5px] leading-relaxed py-3" style={{ color: "var(--text-muted)" }}>
            No Salary Cap roster has scored exactly {scoreFilter} yet.
          </p>
        )}

        {!filterLoading && shownEntries.map((e, i) => {
          const hex = !isFiltering && PODIUM[i] || "#9ca3af";
          const on = selected?.i === i;
          const g = e.grade || gradeFor(e.pct);
          return (
            <button key={`${e.id}-${i}`} onClick={() => onSelect({ ...e, i })}
              className={`g-lb-row w-full text-left${!isFiltering && i < 3 ? " podium" : ""}${on ? " me" : ""}`}
              style={{ "--accent": on ? "#FFB11B" : hex, "--accent-a": (on ? "#FFB11B" : hex) + "1f", "--accent-line": (on ? "#FFB11B" : hex) + "66" }}>
              {!isFiltering && <span className="g-lb-rank">{i + 1}</span>}
              <span className="g-lb-name">{e.username}</span>
              {e.season_result === "THREEPEAT" && <span className="shrink-0" style={{ color: "var(--yamabuki)" }}><CrownIcon size={12} /></span>}
              {e.season_result === "CHAMPION" && <span className="shrink-0" style={{ color: "var(--yamabuki)" }}><TrophyIcon size={11} /></span>}
              {e.wins != null && <span className="g-lb-wins">{e.wins}W</span>}
              <span className="g-lb-pct" style={{ color: GRADE_HEX[g] || "#9ca3af" }}>{e.pct}</span>
              <span className="g-lb-grade">{g}</span>
            </button>
          );
        })}
      </div>

      <button onClick={onChallenge} disabled={!selected || challenging} className="aura-rating-btn w-full mt-3 shrink-0"
        style={{ padding: "13px", fontSize: 13.5, letterSpacing: ".12em", opacity: selected && !challenging ? 1 : 0.45 }}>
        <TargetIcon size={15} />
        <span className="ml-2">{challenging ? "Starting…" : selected ? `Challenge ${selected.username}` : "Pick a roster"}</span>
      </button>
    </div>
  );
}

export default function OnlineGame() {
  const { user, isLoggedIn, token } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState("board");        // "live" | "board"
  const [queueState, setQueueState] = useState("idle"); // idle | searching | found
  const [elapsed, setElapsed] = useState(0);
  const [queueSize, setQueueSize] = useState(null);
  const [opponent, setOpponent] = useState(null);
  const [matchedRoomCode, setMatchedRoomCode] = useState(null);
  const [challenging, setChallenging] = useState(false);
  const tickRef = useRef(null);

  const [entries, setEntries] = useState(null);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState("");

  // /api/game/board: leaderboard'un tam-oyuncu-satırlı hâli (roster_json'ı
  // olan salarycap kayıtları) — computeLineupFit/buildMatchup için gereken
  // arketip skorları, sezon, maliyet burada geliyor (bkz. INTEGRATION: resolve-roster).
  useEffect(() => {
    let alive = true;
    fetch("/api/game/board?limit=25")
      .then(r => r.json())
      .then(d => { if (alive) setEntries(d.entries || []); })
      .catch(() => { if (alive) setEntries([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => () => clearInterval(tickRef.current), []);

  // INTEGRATION: matchmaking-join / matchmaking-leave — kuyruk WS'i sadece
  // arama sürerken açık (queueState !== "idle"), useGameSocket kendi
  // reconnect'ini kendi hallediyor (With a Friend'deki aynı kanca).
  const onMmMessage = useCallback((data) => {
    if (data.type === "queue") {
      setQueueSize(data.size);
    } else if (data.type === "matched") {
      clearInterval(tickRef.current);
      setMatchedRoomCode(data.room_code);
      setOpponent(data.opponent || null);
      setQueueState("found");
    } else if (data.type === "error" || data.type === "fatal") {
      setNotice(data.message || "Matchmaking error");
      setQueueState("idle");
      clearInterval(tickRef.current);
    }
  }, []);

  const { fatalError: mmFatalError } = useGameSocket(
    queueState !== "idle" ? "/ws/game/matchmaking" : null,
    token,
    { onMessage: onMmMessage },
  );

  // Faz3-M6 savunma katmanı: "fatal" mesajı bir sebeple hiç gelmezse (ör.
  // sunucu accept() sonrası send_json'dan önce çökerse) useGameSocket'in
  // kendi kapanış-kodu tespiti yine de burayı tetikler — arama sonsuza
  // dek "Searching…" göstermesin diye.
  useEffect(() => {
    if (!mmFatalError) return;
    setNotice(mmFatalError.message);
    setQueueState("idle");
    clearInterval(tickRef.current);
  }, [mmFatalError]);

  const startQueue = useCallback(() => {
    if (!isLoggedIn) { setNotice("Log in to play against other people."); return; }
    setNotice("");
    setQueueState("searching");
    setElapsed(0);
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    fetch("/api/game/matchmaking/join", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wheel_mode: "round" }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.detail || "Could not join queue");
        setQueueSize(d.queue_size ?? null);
      })
      .catch(e => {
        clearInterval(tickRef.current);
        setQueueState("idle");
        setNotice(e.message);
      });
  }, [isLoggedIn, token]);

  const cancelQueue = useCallback(() => {
    clearInterval(tickRef.current);
    setQueueState("idle");
    setElapsed(0);
    setOpponent(null);
    setMatchedRoomCode(null);
    fetch("/api/game/matchmaking", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }, [token]);

  const acceptMatch = useCallback(() => {
    if (!matchedRoomCode) return;
    navigate(`/basketball/game/friend?room=${matchedRoomCode}`);
  }, [matchedRoomCode, navigate]);

  const challengeBoard = useCallback(() => {
    if (!selected) return;
    if (!isLoggedIn) { setNotice("Log in to record the result of your challenge."); return; }
    setNotice("");
    setChallenging(true);
    fetch("/api/game/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entry_id: selected.id }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.detail || "Could not start challenge");
        navigate(`/basketball/game/friend?room=${d.room_code}`);
      })
      .catch(e => setNotice(e.message))
      .finally(() => setChallenging(false));
  }, [selected, isLoggedIn, token, navigate]);

  // Seçili rakibin kadrosu → kort önizlemesi. Live sekmesinde board seçimi
  // görünmemeli: rakip henüz belli değil, kortta eski seçim asılı kalmasın.
  const boardActive = tab === "board" && !!selected;
  const oppRoster = boardActive ? parseRoster(selected) : [];
  const oppLineup = rosterToLineup(oppRoster);
  const myLineup = rosterToLineup([]);
  const simEra = boardActive && selected?.sim_era ? ERAS.find(e => e.id === selected.sim_era) : null;

  return (
    <div className="h-full overflow-y-auto">
      <SEO title="Online Opponent — Lineup Builder"
        description="Get matched with another fan, or draft head-to-head against the 25 best Salary Cap rosters ever submitted."
        path="/basketball/game/online" />

      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-3 pb-6">
        {/* ── HEADER DOCK: başlık | giriş | yol seçimi ── */}
        <div className="g-dock">
          <span className="aura-blob" style={{ "--slot-color": "#FFB11B", left: -30, top: -70, width: 240, height: 150, opacity: 0.16 }} />

          <div className="g-dock-left">
            <h1 className="g-dock-title">Online Opponent</h1>
            <p className="g-dock-sub">Salary Cap · snake draft · best-of-7</p>
          </div>

          <div className="g-dock-center">
            {isLoggedIn ? (
              <div className="text-center">
                <div className="g-mono" style={{ color: "var(--text-faint)" }}>signed in as</div>
                <div className="font-logo text-lg font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{user?.username}</div>
              </div>
            ) : (
              <button onClick={() => navigate("/login")} className="aura-rating-btn"
                style={{ padding: "17px 42px", fontSize: 14, letterSpacing: ".14em" }}>
                Log In to Play
              </button>
            )}
          </div>

          <div className="g-dock-right">
            <div className="g-seg stacked">
              {[
                { key: "board", Icon: CapIcon, hex: "#FFB11B", label: "The Board", hint: "top 25 rosters" },
                { key: "live", Icon: GlobeIcon, hex: "#60a5fa", label: "Live", hint: "random opponent" },
              ].map(({ key, Icon, hex, label, hint }) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`g-seg-btn${tab === key ? " on" : ""}`}
                  style={{ "--accent": hex, "--accent-a": hex + "22", "--accent-line": hex + "66" }}>
                  <Icon size={14} /> {label}
                  <span className="opacity-55 font-normal tracking-normal normal-case">({hint})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {notice && (
          <div className="flex items-center justify-center gap-2 text-[12px] py-1" style={{ color: "var(--yamabuki)" }}>
            <WarnIcon size={13} /> {notice}
          </div>
        )}

        {/* ── 3-sütun HUD: yol paneli | kort | sıralama ── */}
        <div className="g-hud">
          <div className="col-side min-w-0">
            {tab === "live" ? (
              <div className="g-hud-fill">
                {/* Butonu kilitlemiyoruz: kilitli gri buton "neden?" sorusunu
                    cevapsız bırakıyor — tıklayınca sebebi yazıyor. */}
                <QueuePanel
                  state={queueState} elapsed={elapsed} queueSize={queueSize} opponent={opponent}
                  onFind={startQueue} onCancel={cancelQueue} onAccept={acceptMatch}
                />
              </div>
            ) : (
              <BoardPanel
                entries={entries || []} loading={entries === null}
                selected={selected} onSelect={setSelected} onChallenge={challengeBoard}
                challenging={challenging}
              />
            )}
          </div>

          {/* ── ORTA: tam saha — seçilen rakip burada beliriyor ── */}
          <div className="col-court min-w-0">
            <FullCourtBoard
              lineups={{ 1: myLineup, 2: oppLineup }}
              names={{ 1: user?.username || "You", 2: boardActive ? selected.username : (tab === "live" ? (opponent?.username || "Random opponent") : "Pick a roster") }}
              label={tab === "live" ? "// Matchmaking" : "// Challenge"}
              status={tab === "live" ? (queueState === "found" ? "Match Found" : queueState === "searching" ? "Searching" : "Lobby") : boardActive ? "Roster Loaded" : "Lobby"}
              maxWidth={860}
            />
          </div>

          {/* ── SAĞ: seçili rakibin künyesi / mod kuralları ── */}
          <div className="col-side min-w-0">
            <div className="g-panel p-4 g-hud-fill">
              <span className="aura-blob" style={{ "--slot-color": selected ? "#f87171" : "#60a5fa", right: "10%", top: -40, width: 200, height: 110, opacity: 0.16 }} />

              <div className="g-label shrink-0">{boardActive ? "Opponent" : "How It Works"}</div>

              {boardActive ? (
                <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 mt-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{
                        color: GRADE_HEX[selected.grade] || "#9ca3af",
                        border: `1px solid ${(GRADE_HEX[selected.grade] || "#9ca3af")}55`,
                        background: (GRADE_HEX[selected.grade] || "#9ca3af") + "14",
                      }}>
                      <span className="relative font-logo font-black" style={{ fontSize: 26 }}>{selected.grade || gradeFor(selected.pct)}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-logo text-[14px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{selected.username}</div>
                      <div className="font-logo font-black tabular-nums leading-none mt-0.5"
                        style={{ fontSize: 24, color: GRADE_HEX[selected.grade] || "#9ca3af" }}>
                        {selected.pct}<span style={{ fontSize: 11, color: "var(--text-faint)" }}> / 100</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {simEra && (
                      <span className="g-status" style={{
                        "--accent": ERA_HEX[simEra.id] || "#9ca3af",
                        "--accent-a": (ERA_HEX[simEra.id] || "#9ca3af") + "1f",
                        "--accent-line": (ERA_HEX[simEra.id] || "#9ca3af") + "55",
                      }}>{simEra.label}</span>
                    )}
                    {selected.wins != null && (
                      <span className="g-status" style={{ "--accent": "#9ca3af", "--accent-a": "rgba(156,163,175,.12)", "--accent-line": "rgba(156,163,175,.35)" }}>
                        {selected.wins}W season
                      </span>
                    )}
                    {selected.season_result && (
                      <span className="g-status" style={{ "--accent": "#FFB11B", "--accent-a": "rgba(255,177,27,.14)", "--accent-line": "rgba(255,177,27,.45)" }}>
                        {selected.season_result}
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="g-label mb-1.5">Their nine</div>
                    <div className="space-y-0.5">
                      {oppRoster.map((p, i) => (
                        <div key={`${p.PLAYER_NAME}-${i}`} className="flex items-center gap-2 text-[12px]">
                          <span className="g-roster-pos" style={{ width: 26, fontSize: 9, "--accent": i < 5 ? "#f87171" : "#6b7280", "--accent-a": (i < 5 ? "#f87171" : "#6b7280") + "1f", "--accent-line": (i < 5 ? "#f87171" : "#6b7280") + "4d" }}>
                            {SLOT_ORDER[i]}
                          </span>
                          <span className="truncate" style={{ color: i < 5 ? "var(--text-primary)" : "var(--text-muted)" }}>{p.PLAYER_NAME}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-[11px] leading-relaxed pt-2" style={{ color: "var(--text-faint)", borderTop: "1px solid rgba(255,255,255,.07)" }}>
                    You draft nine under the same 100% cap, in their era. Their roster never changes —
                    beat the number, not the person.
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 mt-3 space-y-2.5">
                  {[
                    [TargetIcon, "#FFB11B", "Their era, their rules", "A board roster was built for one era. Challenge it and you draft in that same era — no home-field advantage."],
                    [CapIcon, "#4ade80", "Same 100% cap", "Both sides are capped identically, so a win is a drafting win, not a spending one."],
                    [WheelIcon, "#60a5fa", "You still spin", "Nine rounds of season + team wheels, five jokers. The opponent is fixed; your path to them is not."],
                    [TrophyIcon, "#c084fc", "Best-of-7", "Your lineup and theirs play a full series with 2-2-1-1-1 home court."],
                  ].map(([Icon, hex, title, desc]) => (
                    <div key={title} className="flex gap-2.5 items-start">
                      <span className="shrink-0 mt-0.5" style={{ color: hex }}><Icon size={15} /></span>
                      <div className="min-w-0">
                        <div className="font-medium text-[12.5px]" style={{ color: "var(--text-primary)" }}>{title}</div>
                        <div className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2.5 items-start pt-2" style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}>
                    <span className="shrink-0 mt-0.5" style={{ color: "#60a5fa" }}><LoopIcon size={15} /></span>
                    <div className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      Prefer a real person? Switch to <b style={{ color: "var(--text-primary)" }}>Live</b> in the top-right
                      and you'll be queued against another fan instead.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
