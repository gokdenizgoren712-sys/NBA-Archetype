import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { useAuth } from "../contexts/AuthContext";
import { useGameSocket } from "../hooks/useGameSocket";
import { ERAS } from "../game/eras";
import { OnlineBoard, OnlineLive } from "../game/ui/OnlineUi";
import { RoomGate } from "../game/ui/RoomUi";
import "../game/game.css";

// ── Online Opponent ───────────────────────────────────────────────────────
// İki giriş yolu, ikisi de aynı Salary Cap kuralıyla ve aynı best-of-7 motoruyla bitiyor:
//   1) LIVE   — sıraya gir, başka bir oyuncuyla eşleş, canlı snake draft.
//   2) BOARD  — Salary Cap leaderboard'unun ilk 25'inden bir kadro seç, o DONMUŞ
//               kadroya karşı tek başına draft yap.
// Ekranlar game/ui/OnlineUi.jsx'te; burada yalnız ağ ve durum var.

const SLOTS = ["PG", "SG", "SF", "PF", "C", "B1", "B2", "B3", "B4"];
const parseRoster = (entry) => (Array.isArray(entry?.roster) ? entry.roster : []);
const RULES = "Salary cap · shared era · 9 players each · five jokers plus counters · best of 7";

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

  const eraLabel = (e) => (e?.sim_era ? ERAS.find((x) => x.id === e.sim_era)?.label || "" : "");
  const roster = parseRoster(selected).map((p, i) => ({ slot: SLOTS[i], name: p.PLAYER_NAME }));
  const goLogin = () => navigate("/login");

  // Board seçimi ve skorla arama (api/game/board/at-score): puan başına tek temsilci yerine o puandaki tüm kadrolar
  const [lookup, setLookup] = useState("");
  const [lookupEntries, setLookupEntries] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  useEffect(() => {
    const pct = lookup.trim() === "" ? null : Number(lookup);
    if (pct == null || !Number.isInteger(pct) || pct < 0 || pct > 100) { setLookupEntries(null); return undefined; }
    let alive = true;
    setLookupLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/game/board/at-score?pct=${pct}`)
        .then(r => r.json())
        .then(d => { if (alive) setLookupEntries(d.entries || []); })
        .catch(() => { if (alive) setLookupEntries([]); })
        .finally(() => { if (alive) setLookupLoading(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [lookup]);

  const sharedSeo = (
    <SEO title="Online Opponent — Lineup Builder"
      description="Get matched with another fan, or draft head-to-head against the 25 best Salary Cap rosters ever submitted."
      path="/basketball/game/online" />
  );

  if (tab === "live") {
    if (!isLoggedIn) {
      return (
        <div className="h-full overflow-y-auto">{sharedSeo}
          <RoomGate sport="basketball" title="Online" onSignIn={goLogin} onAlt={() => setTab("board")} altLabel="Browse The Board" />
        </div>
      );
    }
    return (
      <div className="h-full overflow-y-auto">{sharedSeo}
        <OnlineLive sport="basketball" sportLabel="Basketball" tab={tab} onTab={setTab} state={queueState} elapsed={elapsed} queueSize={queueSize}
          opponent={opponent} me={user?.username || "You"} rulesLine={RULES} onFind={startQueue} onCancel={cancelQueue} onAccept={acceptMatch}
          notice={notice} signedIn={isLoggedIn} onSignIn={goLogin} />
      </div>
    );
  }

  const isFiltering = lookupEntries != null;
  return (
    <div className="h-full overflow-y-auto">{sharedSeo}
      <OnlineBoard sport="basketball" sportLabel="Basketball" tab={tab} onTab={(t) => { setTab(t); setSelected(null); }}
        lookup={lookup} onLookup={(v) => { setLookup(v); setSelected(null); }}
        entries={isFiltering ? lookupEntries : (entries || [])} loading={entries === null || lookupLoading} isFiltering={isFiltering}
        selected={selected} onSelect={setSelected} eraLabel={eraLabel} roster={roster}
        onChallenge={isLoggedIn ? challengeBoard : goLogin} challenging={challenging}
        challengeLabel={!selected ? "Pick a roster" : !isLoggedIn ? "Sign in to challenge" : "Challenge this roster"}
        blindNote="Their lineup is frozen and their era is the era you play in. You draft nine under the same 100% cap: beat the number, not the person."
        notice={notice} />
    </div>
  );
}
