/* BUILD §13.2 — "No follower counts. Anywhere."
 *
 * ONARIM Aşama 11'in ilk maddesi de bu. Tahtalar (`6b`, `9a`) hâlâ
 * "96 followers" çiziyor; CODE.md §2 kaynak önceliği BUILD'i tahtaların
 * üstünde tuttuğu için sayı kaldırıldı — liste erişimi duruyor.
 * Takip ETTİĞİN sayı popülerlik değil, kendi listenin boyu; yasak değil.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RANKIT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "rankit");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sources() {
  const out = [];
  for (const dir of [RANKIT, join(RANKIT, "redesign"), join(RANKIT, "web")]) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsx"))) {
      out.push({ f, src: strip(readFileSync(join(dir, f), "utf8")) });
    }
  }
  return out;
}

test("§13.2: hicbir ekranda takipci SAYISI yok", () => {
  /* Yasak olan SAYI. Duz metinde gecen "followers" kelimesi ("No followers
     yet", "Search your followers") bir sayac degil — onlar serbest. Aranan
     sey sayiya goturen ERISIM: `stats?.followers`, `counts.followers`, ya da
     bir nesneye `followers:` diye konan deger. */
  const ACCESS = /(?:\?\.|\.)followers\b|\bfollowers\s*:/g;
  const offenders = [];
  for (const { f, src } of sources()) {
    for (const m of src.matchAll(ACCESS)) {
      const start = src.lastIndexOf("\n", m.index) + 1;
      const end = src.indexOf("\n", m.index);
      offenders.push(`${f}: ${src.slice(start, end < 0 ? undefined : end).trim().slice(0, 80)}`);
    }
  }
  assert.deepEqual(offenders, [], `takipci sayisi goruntuleniyor:\n${offenders.join("\n")}`);
});

test("§13.2: takipci listesine erisim KALDIRILMADI", () => {
  const all = sources().map((s) => s.src).join("\n");
  assert.match(all, /setSurface\('followers'\)/, "takipci listesini acan kontrol kayip");
  assert.match(all, />Followers</, "Followers sekmesi kayip");
});

test("takip ETTIGIN sayi duruyor (populerlik degil)", () => {
  const profile = sources().find((s) => s.f === "ProfileRoot.jsx").src;
  assert.match(profile, /number\(stats\?\.following_people\)/);
});
