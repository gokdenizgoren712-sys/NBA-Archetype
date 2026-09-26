/* ONARIM Aşama 18 — responsive (BUILD §25).
   Tarayıcıda 1081 / 1080 / 1000 / 821 / 820 / 390 ölçülenlerin kaynak
   sözleşmesi: 1080'de ray 64px ikon sütunu, 820'de ray menüde ve Inspector
   tam genişlik alt sayfa, 820 altında web uygulamanın kendisi. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");
const web = (f) => src("rankit", "web", f);
const code = (f) => web(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const css = () => web("rankit-responsive.css");
const block = (c, query) => {
  const at = c.indexOf(`@media (${query}) {`);
  assert.ok(at >= 0, query);
  let depth = 0;
  for (let i = c.indexOf("{", at); i < c.length; i += 1) {
    if (c[i] === "{") depth += 1;
    else if (c[i] === "}" && (depth -= 1) === 0) return c.slice(at, i + 1);
  }
  throw new Error(`unterminated ${query}`);
};

test("§25 kırılma noktaları tam 1080 ve 820; dosya kabukta en son yükleniyor", () => {
  const c = css();
  assert.ok(block(c, "max-width: 1080px"));
  assert.ok(block(c, "max-width: 820px"));
  const shell = web("RankItWeb.jsx");
  assert.ok(shell.indexOf('import "./rankit-responsive.css";') > shell.indexOf('import "./rankit-pages.css";'));
});

test("1080: ray 64px ikon sütunu (çekilmiyor); Inspector 820'ye kadar yerleşik", () => {
  const b = block(css(), "max-width: 1080px");
  assert.match(b, /\.riw \{ grid-template-columns: 64px minmax\(0, 1fr\); \}/);
  assert.match(b, /\.riw\.has-inspector \{ grid-template-columns: minmax\(0, 1fr\) 468px; \}/);
  assert.doesNotMatch(b, /\.riw-rail(:not\(\.is-sheet\))? \{ display: none; \}/, "ray 1080'de gizlenmez");
  // Adlar görünmez ama okunur — display:none değil kırpma.
  assert.match(b, /:is\(\.riw-rail-label, \.riw-rail-name, \.riw-standing-copy, \.riw-home-link span, \.riw-rail-cta span\) \{[^}]*clip: rect\(0, 0, 0, 0\)/);
  assert.match(b, /\.riw-rail:not\(\.is-sheet\) \.riw-hunt-row, \.riw-rail:not\(\.is-sheet\) \.riw-club-row \{[^}]*width: 44px; height: 44px;/);
  assert.match(b, /\.riw-rail:not\(\.is-sheet\) \.riw-home-link \{ flex: none; width: 44px;/);
  assert.match(b, /\.riw-filter-rail \.riw-filter-rail-toggle \{[^}]*width: 44px; height: 44px;/);
  // Aşama 16'nın ara hâli (panel duvarın üstüne biner) gitti.
  assert.doesNotMatch(web("rankit-inspector.css"), /\.riw-insp-dock \{ position: fixed; top: var\(--riw-top\)/);
  assert.doesNotMatch(web("rankit-web.css"), /Aşama 18'e kadar ara hâl/);
});

test("820: ray menüde, Inspector alttan tam genişlik sayfa + perde; başlık telefonunki gibi", () => {
  const b = block(css(), "max-width: 820px");
  assert.match(b, /\.riw-rail:not\(\.is-sheet\) \{ display: none; \}/);
  assert.match(b, /\.riw-insp-dock \{\s*position: fixed; left: 0; right: 0; bottom: 0; top: auto;[^}]*border-radius: 20px 20px 0 0;/);
  assert.match(b, /\.riw-sheet-scrim \{ display: block; position: fixed; inset: 0;/);
  assert.match(b, /\.riw-sheet-wrap \{ place-items: end stretch; padding: 0; \}/);
  assert.match(b, /\.riw-search, \.riw-me, \.riw-signin \{ display: none; \}/);
  assert.match(b, /\.riw-search-btn, \.riw-menu-btn \{ display: grid; \}/);
  assert.match(b, /\.riw-top\.is-searching \.riw-search \{ display: block;/);
  assert.match(b, /\.riw-discover-inline \{ display: none !important; \}/, "süzgeçler menüdeki alt sayfada");
  assert.match(b, /\.riw-chip \{ bottom: 92px;/, "küçültme çipi alt barın üstünde");
  assert.match(css(), /^\.riw-search-btn, \.riw-menu-btn, \.riw-filter-rail-toggle \{ display: none; \}/m, "genişte gizli");
});

test("alt sayfa animasyonu uzun kalıcı değil (oynamazsa sayfa yerinde durur); hareket azaltılınca yok", () => {
  const c = css();
  assert.doesNotMatch(c, /riw-sheet-up[^;]*\bboth\b/);
  assert.match(c, /@media \(prefers-reduced-motion: reduce\) \{\s*\.riw-insp-dock, \.riw-sheet \{ animation: none; \}/);
});

test("perde maçı KÜÇÜLTÜR (taslak kalır), kulübü kapatır; menü adrese bağlı (efekt yok)", () => {
  const shell = code("RankItWeb.jsx");
  assert.match(shell, /\{docked && <div className="riw-sheet-scrim" aria-hidden="true" onClick=\{clubId \? closeClub : minimizeMatch\} \/>\}/);
  assert.match(shell, /const menuOpen = menuAt === location\.pathname;/);
  assert.match(shell, /menuKind=\{section === "discover" \? "filters" : "rail"\}/);
  assert.match(shell, /onOpenEntity=\{\(kind, id\) => \{ setMenuAt\(null\); openEntity\(kind, id\); \}\}/);
  assert.match(shell, /const box = document\.getElementById\("riw-discover-inline"\);/);
  const header = code("WebShell.jsx");
  assert.match(header, /<Link to="\/rankit\/search" className="riw-top-icon riw-search-btn" aria-label="Search">/);
  assert.match(header, /aria-label=\{menuKind === "filters" \? "Filters" : "Your RankIt — standing, the Hunt, clubs"\}/);
  assert.match(header, /<Link to=\{`\/rankit\/hunt\/\$\{c\.id\}`\} className=\{`riw-hunt-row/, "av satırı 12c'yi açar");
});

test("Rank = telefonun 3j'si: bu gece kaydedilmeyenler, 7 günlük yakalama, arama; ortak alt sayfa kabı", () => {
  const rank = code("RankSheet.jsx");
  assert.match(rank, /rankitApi\.quickRate\(/);
  assert.match(rank, /nightStatus\(data\)/);
  assert.match(rank, />FROM TONIGHT · NOT YET LOGGED</);
  assert.match(rank, />OR CATCH UP</);
  assert.match(rank, /\{data\.catchup_total\} unrated/);
  assert.match(code("Sheet.jsx"), /const dialog = useDialog\(\{ onClose, label \}\);/);
  assert.doesNotMatch(code("RankItWeb.jsx"), /function RankSheet\(/, "eski 'bitmiş maç ara' sayfası gitti");
});

test("390'da yatay kaydırma yok: ana sayfanın ızgara sütunu içeriğe göre büyümez", () => {
  assert.match(web("rankit-web.css"), /^\.riw-home \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/m);
});
