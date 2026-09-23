/* Ekranlar 2m (The Hunt dizini) ve 2n (tek koleksiyon) — saf yardımcılar.
   Görsel kaynak `RankIt Redesign.dc.html#2m` / `#2n`. Sayıların hepsi uçtan
   (`GET /collections`, `GET /collections/{id}`); burada yalnız cümleye
   çevriliyor, hiçbir şey türetilmiyor. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  numberWord, collectionPercent, collectionExtra, collectionSentence, unscheduledNote,
} from "../src/rankit/redesign/huntSummary.js";

// Öğle UTC: yaygın saat dilimlerinde hafta günü değişmesin diye.
const NOW = Date.parse("2026-09-23T12:00:00Z");          // Çarşamba
const SUNDAY = "2026-09-27 15:30:00";                     // aynı hafta
const FAR = "2026-10-05 12:00:00";                        // bir haftadan uzak

test("sayilar tahtadaki gibi kelimeyle, yirmiden sonra rakamla", () => {
  assert.equal(numberWord(12), "twelve");
  assert.equal(numberWord(5, { capital: true }), "Five");
  assert.equal(numberWord(38), "38");
  assert.equal(numberWord(0), "0");
});

test("2m: yuzde uctaki sayidan, toplam yoksa YOK", () => {
  assert.equal(collectionPercent({ collected: 7, total: 12 }), 58);
  assert.equal(collectionPercent({ collected: 0, total: 0 }), null, "acilmamis koleksiyonda 0% uydurulmaz");
});

test("2m: satir sonu — acilmamis, bitmis, odul, siradaki mac", () => {
  assert.equal(collectionExtra({ status: "not_open", opens_note: "Opens in May." }).text, "Opens in May.");
  assert.equal(collectionExtra({ status: "complete" }).kind, "done");
  assert.equal(collectionExtra({ status: "active", reward: "Turf" }).text, "FINISHING THIS UNLOCKS TURF");
  const next = collectionExtra({ status: "active", next: { home_name: "Bayern Munich", home_short: "Bayern",
    away_name: "Borussia Dortmund", away_short: "Dortmund", starts_at: SUNDAY } }, NOW);
  assert.equal(next.kind, "next");
  assert.match(next.text, /^Next: Bayern vs Dortmund · Sunday$/);
  assert.equal(collectionExtra({ status: "active" }), null, "veri yoksa satir sessiz");
});

test("2n: tepe cumlesi tahtadaki kaliba oturuyor", () => {
  const s = collectionSentence({ total: 12, remaining: 5, season: "2026-27", kind: "club_season",
    next: { starts_at: SUNDAY } }, NOW);
  assert.equal(s, "Rate all twelve this season. Five left, and one of them is Sunday.");
});

test("2n: siradaki mac uzaksa 'one of them is ...' EKLENMIYOR", () => {
  const s = collectionSentence({ total: 12, remaining: 5, season: "2026-27", kind: "club_season",
    next: { starts_at: FAR } }, NOW);
  assert.equal(s, "Rate all twelve this season. Five left.");
});

test("2n: bitmis ve acilmamis koleksiyon durust konusuyor", () => {
  assert.equal(collectionSentence({ total: 12, remaining: 0 }), "All twelve rated. This one is complete.");
  assert.match(collectionSentence({ total: 0, opens_note: "Opens when the schedule is published." }), /Opens when/);
  assert.equal(collectionSentence({ total: 25, remaining: 22, kind: "classics_year", year: 2026 }),
    "Rate every Classic of 2026. Twenty-two left.".replace("Twenty-two", "22"));
});

test("2n: planlanmamis fikstur sayisi yalniz soyleniyor, uydurulmuyor", () => {
  assert.equal(unscheduledNote(0), null);
  assert.equal(unscheduledNote(1), "One fixture is unscheduled. It appears here when the league confirms the date.");
  assert.equal(unscheduledNote(3), "Three fixtures are unscheduled. They appear here when the league confirms dates.");
});

test("2n: hic toplanmamisken sayi tekrar edilmiyor", () => {
  assert.equal(collectionSentence({ total: 34, remaining: 34, season: "2026-27", kind: "club_season",
    next: { starts_at: FAR } }, NOW), "Rate all 34 this season. Nothing collected yet.");
});

// --- Giriş noktaları: üç yüzey de The Hunt'a gidiyor (B1 dahil) ---
test("giris noktalari: Discover, Profile ve alerts 2m/2n'ye bagli", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { join, dirname } = await import("node:path");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "rankit");
  const read = (...p) => readFileSync(join(root, ...p), "utf8");
  const app = read("RankItPrototype.jsx");
  // Alerts: koleksiyon satiri artik maca degil koleksiyona gidiyor (B1).
  const alerts = read("redesign", "Alerts.jsx");
  assert.match(alerts, /item\.collection_id && onOpenCollection\) return onOpenCollection\(item\.collection_id\)/);
  assert.match(alerts, /!\(item\.collection_id && onOpenCollection\)/, "koleksiyon satiri pasif kaliyor");
  assert.match(app, /onOpenCollection=\{id=>\{setNotificationOpen\(false\);openHunt\(id\)\}\}/);
  // Discover blogu artik bir dugme ve 2m'yi aciyor.
  assert.match(app, /className="ri-hunt-summary" onClick=\{onOpenHunt\}/);
  // Profile satiri "Coming soon" degil.
  const profile = read("redesign", "ProfileRoot.jsx");
  assert.doesNotMatch(profile, /Coming soon/);
  assert.match(profile, /onClick=\{onOpenHunt\}><strong>The Hunt<\/strong>/);
  // Acik koleksiyon uygulama duzeyinde: 6a'dan donunce koleksiyonda kalinir.
  assert.match(app, /onCollection=\{id=>setHunt\(\{collectionId:id\}\)\}/);
});
