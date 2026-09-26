/* ONARIM Aşama 19 — kozmetik normalizasyon (BUILD §1).
   RankIt'in bütün CSS'i jetonlarla konuşur: metin rengi beş mürekkepten
   biri (ya da anlamlı jeton), aralık 7·9·11·13·16·18·22·26·34, yarıçap
   8·10·14·18·22·999, Rajdhani yalnız 700, Outfit 300–500, düz aile yığını
   yok. Altın bir şeyi İŞARETLER: hale, yıldız, kaş, avatar altın değil.
   Bilinçli istisnalar tahtadan: kilit 10'luk aralık (§7.3), 7e'nin 60'ı
   (§19.2), ≤6 mikro aralık, ≤5 mikro / döndürülmüş / kalkan yarıçaplar. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "src", "rankit");
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const sheets = walk(root).filter((f) => f.endsWith(".css")).map((f) => ({ name: relative(root, f), css: stripComments(readFileSync(f, "utf8")) }));
const read = (...p) => readFileSync(join(root, ...p), "utf8");
const rules = function* (css) {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) yield { sel: m[1].trim(), body: m[2] };
};

const INK = ["#eceded", "#c9cccd", "#9aa0a6", "#7f868b", "#4d5256"];
const TEXT_OK = new Set([...INK, "#ffb11b", "#17120a", "#3fb08c", "#2f5480", "#5b4fa8", "#9a3f96", "#d43a63", "#f5402e", "#fff", "#ffffff", "#8a6a12"]);
const GAPS = new Set(["0", "7", "9", "11", "13", "16", "18", "22", "26", "34"]);
const RADII = new Set(["0", "8", "10", "14", "18", "22", "999"]);

test("§1.1 metin rengi yalnız jeton", () => {
  const off = [];
  for (const { name, css } of sheets) {
    for (const m of css.matchAll(/(?<![-\w])color\s*:\s*(#[0-9a-fA-F]{3,8})\b/g)) {
      let c = m[1].toLowerCase();
      if (c.length === 4) c = "#" + [...c.slice(1)].map((x) => x + x).join("");
      if (!TEXT_OK.has(c)) off.push(`${name} ${c}`);
    }
  }
  assert.deepEqual(off, []);
});

test("§1.1 zemin hex'leri yüzey ya da jeton (7e skin örneği hariç)", () => {
  const ok = new Set(["#090a0b", "#121315", "#151618", "#1a1b1e", "#f5402e", "#eceded", "#ffb11b", "#3fb08c", "#17120a", "#d43a63", "#c9cccd", "#5b4fa8"]);
  const off = [];
  for (const { name, css } of sheets) {
    for (const { sel, body } of rules(css)) {
      for (const m of body.matchAll(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})\b/g)) {
        const c = m[1].toLowerCase();
        if (!ok.has(c) && !(c === "#e8e4d9" && /riw-moment-swatches/.test(sel))) off.push(`${name} ${sel.slice(-40)} ${c}`);
      }
    }
  }
  assert.deepEqual(off, []);
});

test("§1.5 Rajdhani yalnız 700, Outfit en çok 500, düz aile yığını yok", () => {
  const off = [];
  for (const { name, css } of sheets) {
    for (const m of css.matchAll(/font\s*:\s*(\d{3})\s+[\d.]+px[^;}]*var\(--font-(logo|sans)\)/g)) {
      if ((m[2] === "logo" && m[1] !== "700") || (m[2] === "sans" && Number(m[1]) > 500)) off.push(`${name} ${m[0].slice(0, 40)}`);
    }
    for (const m of css.matchAll(/\b(Rajdhani|Outfit)\s*,/g)) off.push(`${name} yığın ${m[0]}`);
    for (const m of css.matchAll(/font-weight\s*:\s*(600|800|900)\b/g)) off.push(`${name} ${m[0]}`);
  }
  assert.deepEqual(off, []);
});

test("§1.6 aralık ölçeği: yalnız 7·9·11·13·16·18·22·26·34 (mikro ≤6, kilit 10, 7e 60)", () => {
  const off = [];
  for (const { name, css } of sheets) {
    for (const { sel, body } of rules(css)) {
      for (const m of body.matchAll(/(?<![-\w])(?:row-|column-)?gap\s*:\s*([^;}]+)/g)) {
        for (const v of m[1].matchAll(/(\d+(?:\.\d+)?)px/g)) {
          const n = v[1];
          if (GAPS.has(n) || Number(n) <= 6) continue;
          if (n === "10" && /(^|,|\s)(\.rankit-app \.ri-brand|\.riw-lockup)$/.test(sel)) continue;
          if (n === "60" && /riw-moment/.test(sel)) continue;
          off.push(`${name} ${sel.slice(-40)} gap ${n}`);
        }
      }
    }
  }
  assert.deepEqual(off, []);
});

test("§1.6 yarıçap ölçeği: tek değer 8·10·14·18·22·999 (mikro, döndürülmüş, kalkan hariç)", () => {
  const off = [];
  for (const { name, css } of sheets) {
    for (const { sel, body } of rules(css)) {
      if (/rotate\(/.test(body)) continue;
      for (const m of body.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
        const vals = [...m[1].matchAll(/(\d+(?:\.\d+)?)px/g)].map((x) => x[1]);
        if (vals.length !== 1 || /%/.test(m[1])) continue;
        if (!RADII.has(vals[0]) && Number(vals[0]) > 5) off.push(`${name} ${sel.slice(-40)} ${vals[0]}`);
      }
    }
  }
  assert.deepEqual(off, []);
});

test("§1.3 altın hale yok — yalnız RANK elmasının tahtadaki parıltısı", () => {
  const halos = [];
  for (const { name, css } of sheets) {
    for (const m of css.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) {
      const v = m[1].replace(/\s+/g, "");
      // İç halka (seçili skin) bir işarettir, hale değil.
      if (v.startsWith("inset")) continue;
      if (/rgba\(255,177,27/.test(v) && v !== "0022pxrgba(255,177,27,.35)") halos.push(`${name} ${m[1].trim()}`);
      if (/0\d+pxvar\(--ri-gold\)/.test(v)) halos.push(`${name} ${m[1].trim()}`);
    }
  }
  assert.deepEqual(halos, []);
});

test("gölgeler tahtanın sözlüğü: kart kalkışı, sayfa, diyalog", () => {
  const all = sheets.flatMap(({ css }) => [...css.matchAll(/box-shadow\s*:\s*([^;}]+)/g)].map((m) => m[1].replace(/\s+/g, "")));
  assert.ok(all.includes("0-22px80px#000"), "telefon ve 820 sayfası");
  assert.ok(all.includes("026px70pxrgba(0,0,0,.6)"), "diyalog");
  assert.ok(all.includes("014px34pxrgba(0,0,0,.28)"), "kart kalkışı");
  for (const off of ["018px40pxrgba(0,0,0,.5)", "026px70pxrgba(0,0,0,.62)", "0-18px50pxrgba(0,0,0,.6)"]) {
    assert.ok(!all.includes(off), off);
  }
});

test("yıldızlar mürekkep (tahta #eceded), asla altın", () => {
  assert.match(read("rankit.css"), /\.ri-star-glyph>span\{position:absolute;inset:0 auto 0 0;width:var\(--star-fill\);overflow:hidden;color:#eceded\}/);
  assert.match(read("rankit.css"), /\.ri-stars button\.on\{color:#eceded\}/);
  assert.match(read("web", "rankit-inspector.css"), /\.riw-rate-glyph > span \{[^}]*color: #eceded; \}/);
  for (const { css } of sheets) assert.doesNotMatch(css, /star[^{]*\{[^}]*color:\s*var\(--ri-gold/);
});

test("§3.1 REVEAL ANYWAY nötr (tahta: cümle ink-2, eylem ink-3)", () => {
  assert.match(read("redesign", "CommunityVerdictGate.jsx"), /className="ri-gate-action"[^>]*color: "#9aa0a6"/);
  assert.match(read("redesign", "MatchCard.jsx"), /className="ri-gate-action"[\s\S]{0,200}color: t\.eyebrow/);
});

test("telefon: kaşlar ve avatarlar altın değil; 2a'nın boş eylemi nötr", () => {
  const phone = read("rankit.css");
  assert.match(phone, /\.ri-section-head small,\.ri-page-title small,\.ri-detail-kicker,\.ri-rating-panel>small,\.ri-broadcast>small\{[^}]*letter-spacing:\.14em;color:#7f868b\}/);
  assert.match(phone, /\.ri-avatar\{[^}]*color:#c9cccd\}/);
  assert.match(phone, /\.ri-empty\.is-quiet button\{border:1px solid rgba\(255,255,255,\.14\);background:#1a1b1e;color:#eceded\}/);
  assert.match(read("rankit-v030.css"), /\.rankit-app \.ri-hunt-summary small\{[^}]*color:#7f868b\}/);
  assert.match(read("RankItPrototype.jsx"), /action="Find a match" onAction=\{\(\) => onNavigate\("Discover"\)\} quiet\/>/);
});

test("telefon zili: nokta yalnız okunmamış varken, heat-5 (web zili gibi)", () => {
  const app = read("RankItPrototype.jsx");
  assert.match(app, /\{unreadAlerts > 0 && <i aria-hidden="true"\/>\}/);
  assert.doesNotMatch(app, /<Bell size=\{19\}\/><i\/>/);
  assert.match(read("rankit.css"), /\.ri-header i\{position:absolute;width:6px;height:6px;border-radius:50%;background:#f5402e;right:6px;top:6px\}/);
});
