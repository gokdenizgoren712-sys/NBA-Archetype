/* Games by Primary Arch — Faz 1 altyapısı (docs/GAMES_IN_APP_PLAN.md).
   API kökeni: site "/api"'de kalır, paketlenmiş uygulama tam adrese gider.
   Bekleyen skor: misafir sonucu girişe kadar cihazda bekler. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { apiUrl, socketUrl, API_ORIGIN } from "../src/lib/apiOrigin.js";
import {
  PENDING_KEY, PENDING_MAX_AGE_MS, savePendingScore, savePendingSeason,
  readPendingScore, clearPendingScore, flushPendingScore,
} from "../src/arcade/pendingScore.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    raw: m,
  };
}

const SCORE = { pct: 81, grade: "A", lineup: ["Stephen Curry", "Tim Duncan"], mode: "classic", roster: [] };

test("köken: testte (ve site build'inde) boş — istekler göreli kalır", () => {
  assert.equal(API_ORIGIN, "");
  assert.equal(apiUrl("/api/game/seasons"), "/api/game/seasons");
});

test("köken: uygulamada tam adres, WebSocket ws(s) karşılığı", () => {
  assert.equal(apiUrl("/api/x", "https://primaryarch.net"), "https://primaryarch.net/api/x");
  assert.equal(socketUrl("/ws/game/room/AB", "https://primaryarch.net"), "wss://primaryarch.net/ws/game/room/AB");
  assert.equal(socketUrl("/ws/a", "", { protocol: "https:", host: "primaryarch.net" }), "wss://primaryarch.net/ws/a");
  assert.equal(socketUrl("/ws/a", "", { protocol: "http:", host: "localhost:5173" }), "ws://localhost:5173/ws/a");
});

test("uygulamanın kullanacağı oyun dosyalarında göreli /api çağrısı kalmadı", () => {
  const files = [
    ["pages", "LineupGame.jsx"], ["game", "SeasonSimPanel.jsx"], ["game", "LeaderboardPanel.jsx"],
    ["game", "leagueSim.js"], ["arcade", "pendingScore.js"],
  ];
  for (const f of files) {
    assert.doesNotMatch(src(...f), /\b(fetch|fetchJson)\((["`])\/api/, f.join("/"));
  }
  assert.match(src("api.js"), /const BASE = apiUrl\("\/api"\);/);
  assert.match(src("hooks", "useGameSocket.js"), /socketUrl\(path\)/);
});

test("bekleyen skor: yaz, oku, sezonu ekle, sil", () => {
  const storage = memoryStorage();
  assert.equal(savePendingScore(SCORE, { now: 1000, storage }), true);
  assert.deepEqual(readPendingScore({ now: 2000, storage }).score, SCORE);
  assert.equal(savePendingSeason({ wins: 61, season_result: "CHAMPION", sim_era: "small_ball" }, { now: 3000, storage }), true);
  assert.equal(readPendingScore({ now: 4000, storage }).season.season_result, "CHAMPION");
  clearPendingScore({ storage });
  assert.equal(readPendingScore({ now: 5000, storage }), null);
});

test("bekleyen skor: sunucunun reddedeceği kayıt hiç saklanmaz", () => {
  const storage = memoryStorage();
  assert.equal(savePendingScore({ ...SCORE, grade: "Z" }, { storage }), false);
  assert.equal(savePendingScore({ ...SCORE, pct: 140 }, { storage }), false);
  assert.equal(savePendingScore({ ...SCORE, mode: "same" }, { storage }), false);
  assert.equal(storage.raw.size, 0);
  savePendingScore(SCORE, { now: 0, storage });
  assert.equal(savePendingSeason({ wins: 90, season_result: "CHAMPION" }, { now: 1, storage }), false);
  assert.equal(savePendingSeason({ wins: 40, season_result: "WON" }, { now: 1, storage }), false);
});

test("bekleyen skor: 24 saatten eskisi atılır", () => {
  const storage = memoryStorage();
  savePendingScore(SCORE, { now: 0, storage });
  assert.ok(readPendingScore({ now: PENDING_MAX_AGE_MS, storage }));
  assert.equal(readPendingScore({ now: PENDING_MAX_AGE_MS + 1, storage }), null);
  assert.equal(storage.raw.has(PENDING_KEY), false);
});

test("bekleyen skor: depolama kapalıysa sessizce hiçbir şey yapmaz", () => {
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
  assert.equal(savePendingScore(SCORE, { storage: broken }), false);
  assert.equal(readPendingScore({ storage: broken }), null);
  assert.doesNotThrow(() => clearPendingScore({ storage: broken }));
});

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  return { impl, calls };
}

test("gönderim: skor, sonra aynı satıra sezon; kayıt silinir", async () => {
  const storage = memoryStorage();
  savePendingScore(SCORE, { now: 0, storage });
  savePendingSeason({ wins: 58, season_result: "FINALS", sim_era: "small_ball", real_season: "2015-16", real_team: "GSW" }, { now: 1, storage });
  const { impl, calls } = fakeFetch([{ status: 200, body: { ok: true, id: 42 } }, { status: 200, body: { ok: true } }]);
  const out = await flushPendingScore({ token: "t", fetchImpl: impl, now: 2, storage });
  assert.deepEqual(out, { posted: true, id: 42 });
  assert.equal(calls[0].url, "/api/game/score");
  assert.deepEqual(calls[0].body, SCORE);
  assert.equal(calls[0].auth, "Bearer t");
  assert.equal(calls[1].url, "/api/game/season-result");
  assert.equal(calls[1].body.game_id, 42);
  assert.equal(calls[1].body.real_team, "GSW");
  assert.equal(readPendingScore({ now: 3, storage }), null);
});

test("gönderim: eşzamanlı çağrılar skoru bir kez yazar (tek uçuş)", async () => {
  const storage = memoryStorage();
  savePendingScore(SCORE, { now: 0, storage });
  savePendingSeason({ wins: 49, season_result: "R1", sim_era: "small_ball" }, { now: 1, storage });
  const { impl, calls } = fakeFetch([{ status: 200, body: { ok: true, id: 7 } }, { status: 200, body: { ok: true } }]);
  const outs = await Promise.all([1, 2, 3].map(() => flushPendingScore({ token: "t", fetchImpl: impl, now: 2, storage })));
  assert.deepEqual(outs, [{ posted: true, id: 7 }, { posted: true, id: 7 }, { posted: true, id: 7 }]);
  assert.deepEqual(calls.map((c) => c.url), ["/api/game/score", "/api/game/season-result"]);
  // uçuş bitti: sonraki çağrı yeniden bakar, kayıt yok → istek yok
  assert.deepEqual(await flushPendingScore({ token: "t", fetchImpl: impl, now: 3, storage }), { posted: false, reason: "none" });
  assert.equal(calls.length, 2);
});

test("gönderim: token yok / 401 / ağ hatası → kayıt kalır", async () => {
  const storage = memoryStorage();
  savePendingScore(SCORE, { now: 0, storage });
  assert.deepEqual(await flushPendingScore({ token: null, now: 1, storage }), { posted: false, reason: "auth" });
  let f = fakeFetch([{ status: 401, body: {} }]);
  assert.equal((await flushPendingScore({ token: "t", fetchImpl: f.impl, now: 1, storage })).reason, "auth");
  f = fakeFetch([new Error("offline")]);
  assert.equal((await flushPendingScore({ token: "t", fetchImpl: f.impl, now: 1, storage })).reason, "network");
  f = fakeFetch([{ status: 503, body: {} }]);
  assert.equal((await flushPendingScore({ token: "t", fetchImpl: f.impl, now: 1, storage })).reason, "network");
  assert.ok(readPendingScore({ now: 2, storage }));
});

test("gönderim: 400 → kayıt silinir; kayıt yoksa hiç istek atılmaz", async () => {
  const storage = memoryStorage();
  savePendingScore(SCORE, { now: 0, storage });
  let f = fakeFetch([{ status: 400, body: { detail: "Invalid score" } }]);
  assert.equal((await flushPendingScore({ token: "t", fetchImpl: f.impl, now: 1, storage })).reason, "rejected");
  assert.equal(readPendingScore({ now: 2, storage }), null);
  f = fakeFetch([]);
  assert.deepEqual(await flushPendingScore({ token: "t", fetchImpl: f.impl, now: 3, storage }), { posted: false, reason: "none" });
  assert.equal(f.calls.length, 0);
});
