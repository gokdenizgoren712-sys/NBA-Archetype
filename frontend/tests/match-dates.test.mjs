/* Maç tarihleri (sahibin 2026-09-26 isteği): kart yalnız saati yazınca her
   maç "bugün" gibi okunuyordu. Üç parça:
     1. kartta saatin üstünde gün — TODAY / TOMORROW / SUN 28 SEP (yerel gün)
     2. Discover'da tarih süzgeci — telefon çekmecesi ve web rayı, uçla aynı pencereler
     3. maç sayfasında başlama saatine geri sayım — telefon 2f ve web Inspector 16c
   Tarihler YEREL kurucuyla kuruluyor: test her saat diliminde aynı sonucu verir. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { kickoffDay, countdown } from "../src/rankit/formatWhen.js";
import { toMatchCardProps } from "../src/rankit/redesign/toMatchCardProps.js";
import { discoverFilters, discoverParams, activeFilterCount, discoverEmpty } from "../src/rankit/web/pagesView.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", "rankit", ...p), "utf8");
const at = (...parts) => new Date(...parts);
const NOW = at(2026, 8, 26, 12, 0).getTime();          // Cumartesi 26 Eylül 2026, 12:00 yerel

test("1: gün etiketi yerel takvim gününe göre", () => {
  assert.equal(kickoffDay(at(2026, 8, 26, 21, 45).toISOString(), NOW), "TODAY");
  assert.equal(kickoffDay(at(2026, 8, 26, 0, 30).toISOString(), NOW), "TODAY");
  assert.equal(kickoffDay(at(2026, 8, 27, 1, 0).toISOString(), NOW), "TOMORROW");
  assert.equal(kickoffDay(at(2026, 8, 28, 19, 30).toISOString(), NOW), "MON 28 SEP");
  assert.equal(kickoffDay(at(2027, 0, 3, 16, 0).toISOString(), NOW), "SUN 3 JAN 2027");
  assert.equal(kickoffDay("", NOW), "");
  assert.equal(kickoffDay("not a date", NOW), "");
});

test("1: gün yalnız yaklaşan maçın kartında", () => {
  const base = { home: { short: "MIL" }, away: { short: "UDI" }, starts_at: at(2026, 8, 27, 19, 30).toISOString(), time: "19:30" };
  assert.equal(toMatchCardProps({ ...base, status: "upcoming" }, { nowMs: NOW }).kickoffDay, "TOMORROW");
  // Web duvarı `startsAt` taşıyor (toCard) — o da okunur.
  assert.equal(toMatchCardProps({ ...base, starts_at: undefined, startsAt: base.starts_at, status: "upcoming" }, { nowMs: NOW }).kickoffDay, "TOMORROW");
  for (const status of ["finished", "live", "postponed", "cancelled"]) {
    assert.equal(toMatchCardProps({ ...base, status }, { nowMs: NOW }).kickoffDay, "", status);
  }
  const card = src("redesign", "MatchCard.jsx");
  // Geniş kart: gün saatin ÜSTÜNDE; kompakt: "UPCOMING" satırının yerinde (yükseklik aynı).
  assert.match(card, /\{kickoffDay && <div style=\{\{ fontSize: 10, fontWeight: 700, letterSpacing: "\.14em", color: t\.eyebrow, marginBottom: 7, whiteSpace: "nowrap" \}\}>\{kickoffDay\}<\/div>\}\s*<div style=\{\{ fontSize: 15, fontWeight: 700, letterSpacing: "\.02em", color: t\.ink \}\}>\{kickoff\}<\/div>/);
  assert.match(card, /\{!profileShelf && <small style=\{\{color:liveFresh \? RAMP\[4\] : t\.eyebrow\}\}>\{kickoffDay \|\| status\}<\/small>\}/);
});

test("3: geri sayım — gün+saat, saat+dakika, dakika; yukarı yuvarlanır", () => {
  const seg = (ms) => countdown(new Date(NOW + ms).toISOString(), NOW).segments.map((s) => `${s.value} ${s.unit}`).join(" ");
  const M = 60000, H = 60 * M, D = 24 * H;
  assert.equal(seg(2 * D + 5 * H + 12 * M), "2 DAYS 5 HRS");
  assert.equal(seg(1 * D + 1 * H), "1 DAY 1 HR");
  assert.equal(seg(5 * H + 12 * M), "5 HRS 12 MIN");
  assert.equal(seg(12 * M), "12 MIN");
  assert.equal(seg(30 * 1000), "1 MIN");
  assert.deepEqual(countdown(new Date(NOW - M).toISOString(), NOW), { due: true, segments: [] });
  assert.equal(countdown("", NOW), null);
});

test("3: geri sayım telefonun maç sayfasında ve web Inspector'ında, altın yok", () => {
  const phone = src("RankItPrototype.jsx");
  assert.match(phone, /import KickoffCountdown from "\.\/redesign\/KickoffCountdown";/);
  assert.match(phone, /\{match\.status === "upcoming" && <KickoffCountdown startsAt=\{match\.starts_at\}\/>\}/);
  const insp = src("web", "Inspector.jsx");
  assert.match(insp, /\{\(phase === "scheduled" \|\| phase === "lineup"\) && <KickoffCountdown startsAt=\{detail\.starts_at\} \/>\}/);
  const comp = src("redesign", "KickoffCountdown.jsx");
  assert.match(comp, /role="timer" aria-label=\{`Kicks off in \$\{spoken\}`\}/);
  assert.match(comp, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 30000\)/);
  const css = src("rankit.css");
  const rules = css.match(/\.ri-countdown[^{]*\{[^}]*\}/g) || [];
  assert.ok(rules.length >= 5);
  for (const r of rules) assert.doesNotMatch(r, /ffb11b|--ri-gold/, r);
});

test("2: tarih süzgeci — istemci uca yerel saat farkıyla gönderir", () => {
  const api = src("rankitApi.js");
  assert.match(api, /\$\{when && when !== "All" \? `&when=\$\{encodeURIComponent\(when\)\}` : ""\}&tz_offset=\$\{-new Date\(\)\.getTimezoneOffset\(\)\}/);
  // Web: adres durumu, varsayılan yazılmaz, bilinmeyen değer düşer.
  assert.equal(discoverFilters(new URLSearchParams("when=weekend")).when, "weekend");
  assert.equal(discoverFilters(new URLSearchParams("when=yesterday")).when, "All");
  assert.deepEqual(discoverParams({ ...discoverFilters(new URLSearchParams("")), when: "next7" }), { when: "next7" });
  assert.equal(activeFilterCount({ when: "today" }), 1);
  assert.deepEqual(discoverEmpty({ sport: "All", status: "All", competition: "All", season: "All", minHeat: null, when: "today" }).action.patch.when, "All");
});

test("2: DATE grubu çekmecede ve rayda, raydakiler sayılı", () => {
  const drawer = src("redesign", "FilterDrawer.jsx");
  assert.match(drawer, /<p className="ri-drawer-eyebrow">DATE<\/p>\s*<div className="ri-drawer-pills">\{DATES\.map\(\(\[v, label\]\) =>/);
  assert.match(drawer, /onClick=\{\(\) => set\(\{ when: toggle\(draft\.when \|\| "All", v\) \}\)\}/);
  const rail = src("web", "DiscoverFilters.jsx");
  assert.match(rail, /<h3 id=\{`\$\{idPrefix\}-f-date`\} className="riw-rail-label">DATE<\/h3>/);
  assert.match(rail, /count=\{facets \? facetCount\(facets, "when", v\) : null\}/);
  assert.match(rail, /minHeat: null, when: "All" \}\)\}>Clear \{active\}/);
  const phone = src("RankItPrototype.jsx");
  assert.match(phone, /status: status === "All" \? "All" : status\.toLowerCase\(\), minHeat, when, limit: 60, offset \}\);/);
  assert.match(phone, /setWhen\(f\.when \|\| "All"\); \};/);
});
