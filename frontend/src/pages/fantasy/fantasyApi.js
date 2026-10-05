// Basketbol fantezi API istemcisi — /api/fantasy/* (api/fantasy.py, api/fantasy_draft.py).
// Hazır format anahtarıyla GET, özel lig formatıyla POST: iki yolun alan
// adları aynı, sayfalar farkı görmez.
import { apiUrl } from "../../lib/apiOrigin";

const BASE = apiUrl("/api/fantasy");
const TOKEN_KEY = "nba_arch_token";   // AuthContext ile AYNI anahtar

export class FantasyError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed (${status})`);
    this.status = status;
  }
}

async function req(method, path, { params, body, auth } = {}) {
  const clean = Object.fromEntries(Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const q = new URLSearchParams(clean).toString();
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}${q ? `?${q}` : ""}`, {
    method, headers, cache: "no-store", body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail;
    try { detail = (await res.json()).detail; } catch { /* gövde yok */ }
    throw new FantasyError(res.status, typeof detail === "string" ? detail : undefined);
  }
  return res.json();
}

const isPreset = (fmt) => typeof fmt === "string";

export const fz = {
  meta: () => req("GET", "/meta"),
  formats: () => req("GET", "/formats"),
  schedule: () => req("GET", "/schedule"),
  backtest: () => req("GET", "/backtest"),

  /** fmt: hazır anahtar ya da özel format; teams yalnız hazırda ayrı parametre. */
  rankings: (fmt, teams, o = {}) => isPreset(fmt)
    ? req("GET", "/rankings", { params: { format: fmt, teams, punt: (o.punt || []).join(","), basis: o.basis,
        position: o.position, search: o.search, flag: o.flag, archetype: o.archetype, metric: o.metric,
        limit: o.limit, offset: o.offset, sort: o.sort, dir: o.dir } })
    : req("POST", "/rankings", { body: { format: fmt, punt: o.punt || [], basis: o.basis || "total",
        position: o.position || null, search: o.search || null, flag: o.flag || null,
        archetype: o.archetype || null, metric: o.metric || null, limit: o.limit || 200, offset: o.offset || 0,
        sort: o.sort || null, dir: o.dir || null } }),

  player: (id, fmt, teams, punt = []) => isPreset(fmt)
    ? req("GET", `/players/${id}`, { params: { format: fmt, teams, punt: punt.join(",") } })
    : req("POST", `/players/${id}`, { body: { format: fmt, punt } }),

  plans: (fmt, teams, slot) => isPreset(fmt)
    ? req("GET", "/draft/plans", { params: { format: fmt, teams, slot } })
    : req("POST", "/draft/plans", { body: { format: fmt, slot } }),

  recommend: (body) => req("POST", "/draft/recommend", { body }),
  mock: (body) => req("POST", "/mock/advance", { body }),
  grade: (body) => req("POST", "/draft/grade", { body }),
  simulate: (body) => req("POST", "/season/simulate", { body }),
  leagueRosters: (body) => req("POST", "/league/rosters", { body }),
  trade: (body) => req("POST", "/trade/analyze", { body }),
  week: (body) => req("POST", "/week/analyze", { body }),

  drafts: {
    list: () => req("GET", "/drafts", { auth: true }),
    get: (id) => req("GET", `/drafts/${id}`, { auth: true }),
    create: (body) => req("POST", "/drafts", { body, auth: true }),
    update: (id, body) => req("PUT", `/drafts/${id}`, { body, auth: true }),
    remove: (id) => req("DELETE", `/drafts/${id}`, { auth: true }),
  },
};
