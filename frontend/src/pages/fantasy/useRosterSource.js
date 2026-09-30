// Kadro kaynağı: simülatör ve takas analizi "hangi kadroyla?" sorusunu aynı yerden cevaplar.
//   mock      — son bitirilen solo mock draftın tam pickleri (12 takımın kadrosu bilinir)
//   assistant — asistanda "Mine" işaretlediğin oyuncular (yalnız senin kadron; rakipler simüle edilir)
//   saved     — hesabındaki kayıtlı mock / asistan draftı
// `body`: /season/simulate ve /trade/analyze isteklerinin ortak temeli (format, teams, slot + picks | roster).
// Sezon içindeyken (meta.rest_of_season_from_week) `scope` (kalan sezon | tam sezon) ve isteğe bağlı `records`
// (takım → şimdiye kadarki H2H galibiyeti) da body'ye girer; değişince ctxKey değişir, eski sonuç boşa düşer.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fz } from "./fantasyApi";

const lastMockKey = (f) => `fz_lastmock_${JSON.stringify([f.apiFormat, f.t, f.s])}`;
const assistKey = (f) => `fz_assist_${JSON.stringify([f.apiFormat, f.t, f.s])}`;

function readJson(store, key) {
  try { return JSON.parse(store.getItem(key) || "null"); } catch { return null; }
}

export function useRosterSource(f, isLoggedIn) {
  const [srcPick, setSrcPick] = useState(null);
  const [saved, setSaved] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [savedBody, setSavedBody] = useState(null);
  const [error, setError] = useState(null);
  const [scopePick, setScopePick] = useState("rest");
  const [records, setRecords] = useState({});
  const restFrom = f.meta?.rest_of_season_from_week ?? null;
  const inSeason = restFrom != null;
  const scope = inSeason ? scopePick : "full";
  const recordsBody = useMemo(() => {
    const e = Object.entries(records).filter(([, v]) => v !== "" && Number.isFinite(Number(v)));
    return scope === "rest" && e.length ? Object.fromEntries(e.map(([k, v]) => [k, Number(v)])) : null;
  }, [records, scope]);

  const mock = useMemo(() => readJson(sessionStorage, lastMockKey(f)), [f.apiFormat, f.t, f.s]);   // eslint-disable-line react-hooks/exhaustive-deps
  const assist = useMemo(() => {
    const order = readJson(localStorage, assistKey(f)) || [];
    return order.filter((o) => o.mine).map((o) => o.id);
  }, [f.apiFormat, f.t, f.s]);   // eslint-disable-line react-hooks/exhaustive-deps
  const mockOk = !!mock && mock.picks?.length === f.t * f.rosterSize;
  const assistOk = assist.length === f.rosterSize;

  const sources = [
    { k: "mock", l: "Latest mock", ok: mockOk, hint: "Finish a mock draft first" },
    { k: "assistant", l: "Assistant", ok: assistOk, hint: "Fill your roster in the assistant first" },
    { k: "saved", l: "Saved draft", ok: true },
  ];

  // Varsayılan kaynak: kullanılabilir ilki
  const src = srcPick ?? (mockOk ? "mock" : assistOk ? "assistant" : isLoggedIn ? "saved" : "mock");

  useEffect(() => {
    if (src !== "saved" || !isLoggedIn || saved) return;
    fz.drafts.list().then((d) => setSaved((d.drafts || []).filter((x) => x.kind === "mock" || x.kind === "assistant"))).catch(() => setSaved([]));
  }, [src, isLoggedIn, saved]);

  const loadSaved = useCallback(async (id) => {
    setSavedId(id); setSavedBody(null);
    try {
      const d = await fz.drafts.get(id);
      const format = d.format.key === "custom" ? { ...d.format, teams: d.teams } : d.format.key;
      const teams = d.format.key === "custom" ? undefined : d.teams;
      if (d.kind === "mock") setSavedBody({ format, teams, slot: d.slot, picks: d.state?.picks || [] });
      else setSavedBody({ format, teams, slot: d.slot, roster: (d.state?.order || []).filter((o) => o.mine).map((o) => o.id) });
    } catch (e) { setError(e); }
  }, []);

  const setSrc = useCallback((k) => { setSrcPick(k); if (k !== "saved") setSavedBody(null); }, []);

  const body = useMemo(() => {
    let b = null;
    if (src === "mock" && mockOk) b = { format: f.apiFormat, teams: f.apiTeams, slot: f.s, picks: mock.picks };
    else if (src === "assistant" && assistOk) b = { format: f.apiFormat, teams: f.apiTeams, slot: f.s, roster: assist };
    else if (src === "saved" && savedBody) b = savedBody;
    if (!b || !inSeason) return b;
    return { ...b, scope, ...(recordsBody ? { records: recordsBody } : {}) };
  }, [src, mock, assist, mockOk, assistOk, savedBody, f.apiFormat, f.apiTeams, f.s, inSeason, scope, recordsBody]);

  // Sonuç yalnız üretildiği bağlamda geçerli: kaynak/format/slot değişince kendiliğinden boşa düşer.
  const ctxKey = JSON.stringify([src, savedId, f.apiFormat, f.t, f.s, scope, recordsBody]);
  return {
    sources, src, setSrc, body, saved, savedId, loadSaved, ctxKey, error, isLoggedIn,
    inSeason, restFrom, scope, setScope: setScopePick, records, setRecords, teams: f.t, slot: f.s,
  };
}
