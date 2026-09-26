/* Primary Arch ↔ RankIt geçişleri (sahibin 2026-09-26 isteği).
   RankIt web başlığının sol üstünde Primary Arch işareti ana sayfaya döner;
   sitenin sol rayında (ve mobil çekmecede) bir RankIt girişi var. Önceden
   RankIt'e tek giriş kök spor-seçim ekranıydı, dönüş yalnız rayın dibindeydi.
   BUILD §7.4: ortak markalamada iki işaret asla ikisi birden altın değil,
   araları 1px line-strong çizgi. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("RankIt başlığı: Primary Arch işareti → /, çizgi, sonra RankIt kilidi", () => {
  const shell = strip(src("rankit", "web", "WebShell.jsx"));
  assert.match(shell, /import \{ LogoMono \} from "\.\.\/\.\.\/components\/BrandIcons";/);
  assert.match(shell,
    /<div className="riw-brandline">\s*<Link to="\/" className="riw-parent" aria-label="Primary Arch home" title="Primary Arch">\s*<LogoMono size=\{28\} \/>\s*<\/Link>\s*<i className="riw-parent-rule" aria-hidden="true" \/>\s*<Link to="\/rankit" className="riw-lockup"/);
});

test("dönüş tek yerde: rayın dibindeki eski Primary Arch bağlantısı yok", () => {
  const shell = strip(src("rankit", "web", "WebShell.jsx"));
  assert.doesNotMatch(shell, /riw-home-link|riw-rail-foot/);
  assert.equal((shell.match(/<Link to="\/"/g) || []).length, 1, "kabukta / bağlantısı yalnız başlıktaki işaret");
  for (const f of ["rankit-web.css", "rankit-responsive.css"]) {
    assert.doesNotMatch(src("rankit", "web", f), /riw-home-link|riw-rail-foot/, f);
  }
});

test("§7.4: ana işaret tek renk (altın değil), 1px line-strong çizgi, 44 dokunma", () => {
  const css = src("rankit", "web", "rankit-web.css");
  assert.match(css, /\.riw-parent \{\s*display: grid; place-items: center; flex: none; width: 44px; height: 44px; margin: 0 -8px;\s*border-radius: 8px; color: #c9cccd;/);
  assert.match(css, /\.riw-parent-rule \{ flex: none; width: 1px; height: 28px; background: rgba\(255, 255, 255, \.22\); \}/);
  assert.match(css, /\.riw-parent:focus-visible \{ outline: 2px solid #eceded; outline-offset: 2px; \}/);
  const icons = src("components", "BrandIcons.jsx");
  assert.match(icons, /export function LogoMono\(\{ size = 32, color = "currentColor", label \}\)/);
  assert.match(icons, /\[SEAM_L, SEAM_R, RULE\]\.map\(\(d\) => <path key=\{d\} d=\{d\} stroke="#000" strokeWidth="5\.2"/);
  assert.match(icons, /<polygon points=\{DODECAGON\} fill=\{color\} mask=\{`url\(#\$\{maskId\}\)`\} \/>/);
});

test("≤820: öbek 390'a sığar, aramada gizlenir", () => {
  const css = src("rankit", "web", "rankit-responsive.css");
  assert.match(css, /\.riw-top\.is-searching :is\(\.riw-brandline, \.riw-top-end\) \{ display: none; \}/);
  assert.match(css, /\.riw-brandline \{ gap: 7px; \}\s*\.riw-parent \{ margin: 0 -10px; \}\s*\.riw-parent svg \{ width: 24px; height: 24px; \}/);
});

test("site rayı ve çekmece: RankIt girişi, rayın dibine sabit", () => {
  const app = src("App.jsx");
  assert.match(app, /const RANKIT_NAV = \{ to: "\/rankit", Icon: RankItNavIcon, label: "RankIt", pin: true \};/);
  const side = app.slice(app.indexOf("function SideNav()"), app.indexOf("function MobileDrawer("));
  assert.match(side, /\.\.\.\(isAdmin \? \[[^\]]*\] : \[\]\),\s*RANKIT_NAV,\s*\];/);
  assert.match(side, /\$\{n\.pin \? " mt-auto" : ""\}/);
  const drawer = app.slice(app.indexOf("function MobileDrawer("), app.indexOf("function PageLoading("));
  assert.match(drawer, /\.\.\.\(isAdmin \? \[[^\]]*\] : \[\]\),\s*RANKIT_NAV,\s*\];/);
  // RankIt'in içinde site rayı yok (RankIt kendi rayını taşır) — değişmedi.
  assert.match(app, /if \(isRankItApp\(pathname\)\) return \[\];/);
});
