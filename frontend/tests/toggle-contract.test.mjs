/* §5.4 tekrar guvenli toggle'lar (B4).
   `rankitApi.js` tarayici modulu (localStorage + import.meta.env), Node'da
   import edilemiyor — bu yuzden sozlesme KAYNAK uzerinden denetleniyor:
   (a) her toggle istemci metodu govdeye `want(on)` koyuyor mu,
   (b) her cagri yeri ISTENEN durumu ikinci argumanla geciyor mu.
   Amac tek: "tersine cevir" cagrisinin geri sizmasini yakalamak. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RANKIT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "rankit");
const api = readFileSync(join(RANKIT, "rankitApi.js"), "utf8");
const callers = ["RankItPrototype.jsx", "web/RankItWeb.jsx", "redesign/AllReviews.jsx",
                 "redesign/ReviewThread.jsx", "redesign/ListShelf.jsx"]
  .map(f => ({ f, src: readFileSync(join(RANKIT, ...f.split("/")), "utf8") }));

test("istemci: bes toggle da `on` gonderiyor", () => {
  for (const name of ["respectList", "saveList", "follow", "favorite", "toggleWatchlist"]) {
    const line = api.split("\n").find(l => l.trim().startsWith(`${name}:`));
    assert.ok(line, `${name} bulunamadi`);
    assert.match(line, /want\(on\)/, `${name} govdeye want(on) koymuyor: ${line.trim()}`);
  }
  for (const name of ["likeReview", "respectComment"]) {
    const line = api.split("\n").find(l => l.trim().startsWith(`${name}:`));
    assert.match(line, /\{ on \}/, `${name} govdeye { on } koymuyor`);
  }
});

test("istemci: `on` boolean degilse govdeye yazilmiyor", () => {
  // Eski istemciler ve `on` bilinmeyen cagrilar ucun tersine-cevir yoluna
  // dusmeli; `undefined` ya da `null` yazilirsa uc onu "kapat" sanmaz ama
  // govde kirli olur.
  assert.match(api, /const want = on => \(typeof on === "boolean" \? \{ on \} : \{\}\)/);
});

test("cagri yerleri: istenen durum geciliyor, tersine-cevir kalmadi", () => {
  const single = /rankitApi\.(favorite|follow|toggleWatchlist|respectList|saveList)\(([^;]*?)\);/g;
  const offenders = [];
  for (const { f, src } of callers) {
    for (const m of src.matchAll(single)) {
      // Argumanlari kaba say: en ust duzey virgul sayisi. Nesne literali
      // icindeki virguller sayilmasin diye suslu parantez derinligi izleniyor.
      let depth = 0, top = 0;
      for (const ch of m[2]) {
        if ("{[(".includes(ch)) depth++;
        else if ("}])".includes(ch)) depth--;
        else if (ch === "," && depth === 0) top++;
      }
      if (top < 1) offenders.push(`${f}: rankitApi.${m[1]}(${m[2].slice(0, 50)})`);
    }
  }
  assert.deepEqual(offenders, [],
    `istenen durumu gecmeyen toggle cagrisi:\n${offenders.join("\n")}`);
});

test("dolayli toggle cagrisi da istenen durumu geciyor", () => {
  // ListShelf toggle'lari fonksiyon REFERANSI olarak geciriyor
  // (`toggle(rankitApi.saveList, ...)`), yani yukaridaki `rankitApi.X(` taramasi
  // onlari GORMUYOR — bir kez bu yuzden gozden kacti. Sarmalayicinin cagriyi
  // iki argumanla yaptigi ayrica cakiliyor.
  const shelf = callers.find(c => c.f === "redesign/ListShelf.jsx").src;
  assert.match(shelf, /await call\(listId,\s*!before\[key\]\)/,
    "ListShelf toggle sarmalayicisi istenen durumu gecmiyor");
});
