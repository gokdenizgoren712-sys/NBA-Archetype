import { useEffect, useRef, useState } from "react";

// Draft Flow zaman çizelgesi (mockup "Draft Flow.dc.html"): spin → lock → dock.
//   t=0      örtü açılır, iki çark kayar (sezon 1.7 sn, takım/kulüp 2.2 sn)
//   t≥2400   çarklar iner + oyuncular hazır → LOCKED damgası
//   +800     örtü başlık şeridine kapanır (dock), satırlar 55 ms arayla girer
// Motor zamanlaması (web: spinMs ×2 ≈ 2.2 sn) zaten bu çizelgeyle örtüşüyor; arayüz yalnız
// "hazır olana kadar" kilidi tutuyor. prefers-reduced-motion: süreler ~%5.
export const REEL_ITEMS = 38;      // 35 rastgele + hedef + 1 kuyruk, öncesinde eski değer
const LOCK_AT = 2400, DOCK_AFTER = 800, SETTLE = 500;

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const constantStrip = (v) => Array.from({ length: REEL_ITEMS }, () => v);
function buildStrip(prev, pool, target) {
  const src = pool && pool.length ? pool : [prev];
  const s = [prev];
  for (let i = 1; i < 36; i++) s.push(pickOne(src));
  s.push(target);          // 36. öğe: gerçek sonuç
  s.push(src[0]);
  return s;
}
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Girdi: motor durumu. Çıktı: örtünün durumu + şerit dizileri + havuzun görünürlüğü.
export function useDrawFlow({ spinSeq, spinKind, seasons, teamPool, targetSIdx, targetTIdx, chosenSeason, chosenTeam, ready, label = (x) => x }) {
  const [stage, setStageState] = useState("idle");  // idle | spin | lock | dock
  const stageRef = useRef("idle");
  const setStage = (v) => { stageRef.current = v; setStageState(v); };
  const [go, setGo] = useState(false);
  const [stripA, setStripA] = useState(constantStrip("—"));
  const [stripB, setStripB] = useState(constantStrip("—"));
  const timers = useRef([]);
  const prev = useRef({ season: "—", team: "—" });
  const live = useRef({});
  live.current = { seasons, teamPool, targetSIdx, targetTIdx, chosenSeason, chosenTeam, ready, label };
  const minElapsed = useRef(false);
  const kindRef = useRef("");

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms * (reduced() ? 0.05 : 1)));

  // Yeni çark başladı → çizelgeyi baştan kur.
  useEffect(() => {
    if (!spinSeq) return undefined;
    clear();
    minElapsed.current = false;
    kindRef.current = spinKind;
    const L = live.current;
    const pSeason = prev.current.season, pTeam = prev.current.team;
    const seasonTarget = L.seasons[L.targetSIdx] ?? L.chosenSeason ?? "—";
    setStripA(spinKind === "team" ? constantStrip(L.chosenSeason || pSeason) : buildStrip(pSeason, L.seasons, seasonTarget));
    setStripB(spinKind === "season" ? constantStrip(L.label(L.chosenTeam) || pTeam) : buildStrip(pTeam, L.teamPool.map(L.label), "…"));
    setGo(false);
    setStage("spin");
    later(() => setGo(true), 80);
    later(() => { minElapsed.current = true; tryLock(); }, LOCK_AT);
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinSeq]);

  // Takım hedefi çark kaymaya başladıktan sonra netleşir: 36. öğeyi yama.
  useEffect(() => {
    if (stage !== "spin" || kindRef.current === "season") return;
    const t = live.current.label(teamPool[targetTIdx]);
    if (t) setStripB((s) => { if (s[36] === t) return s; const n = s.slice(); n[36] = t; return n; });
  }, [teamPool, targetTIdx, stage]);

  // Futbolda sezon hedefi de çark kaydıktan sonra netleşir (kulüp-sezon çifti sona doğru seçilir).
  useEffect(() => {
    if (stage !== "spin" || kindRef.current === "team" || !chosenSeason) return;
    setStripA((s) => { if (s[36] === chosenSeason) return s; const n = s.slice(); n[36] = chosenSeason; return n; });
  }, [chosenSeason, stage]);

  const tryLock = () => {
    const L = live.current;
    if (stageRef.current !== "spin" || !minElapsed.current || !L.ready) return;
    setStripB((s) => { const n = s.slice(); n[36] = L.label(L.chosenTeam) || n[36]; return n; });
    setStage("lock");
    later(() => {
      prev.current = { season: live.current.chosenSeason || "—", team: live.current.label(live.current.chosenTeam) || "—" };
      setStage("dock");
      later(() => setStage("idle"), SETTLE);
    }, DOCK_AFTER);
  };
  // Oyuncular LOCK_AT'ten sonra gelirse burada kilitlenir.
  useEffect(() => { if (stage === "spin") tryLock(); }, [ready, chosenTeam, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => clear, []);

  const overlayOn = stage === "spin" || stage === "lock";
  return {
    stage, go, stripA, stripB, overlayOn,
    locked: stage === "lock", docked: stage === "dock",
    // Havuz yalnız örtü kalktıktan sonra görünür ve tıklanır.
    poolShown: stage === "idle" || stage === "dock",
    poolIn: stage === "idle" || stage === "dock",
    stagger: stage === "dock",
  };
}
