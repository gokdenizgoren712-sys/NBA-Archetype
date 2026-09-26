/* Games by Primary Arch — uygulama içi modülün sözleşmeleri (docs/GAMES_IN_APP_PLAN.md).
   arcade/ RankIt'in parçası değil, misafir bir modül: yalnız mobil build'de,
   yalnız lazy yüklenir; router/site oturumu olmadan çalışır; her isteği
   apiUrl() ile tam adrese gönderir (WebView kökeni https://localhost). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "..", "src");
const read = (p) => readFileSync(p, "utf8");
// yorumları at: sözleşme koda bakar, açıklamalara değil
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const ARCADE = walk(join(SRC, "arcade")).filter((p) => /\.(jsx?|mjs)$/.test(p));

function resolveImport(from, spec) {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.js`, `${base}.jsx`, join(base, "index.js"), join(base, "index.jsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

// GamesSurface'ten başlayıp göreli import ağacının tamamı
function importGraph(entry) {
  const seen = new Set();
  const external = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    if (!/\.(jsx?|mjs)$/.test(f)) continue;
    for (const m of code(f).matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g)) {
      const spec = m[1] || m[2] || m[3];
      if (spec.startsWith(".")) {
        const r = resolveImport(f, spec);
        assert.ok(r, `${relative(SRC, f)}: çözülemeyen import ${spec}`);
        stack.push(r);
      } else external.add(spec);
    }
  }
  return { files: [...seen], external: [...external] };
}

test("arcade yalnız mobil bayrağıyla ve yalnız lazy yükleniyor", () => {
  const proto = code(join(SRC, "rankit", "RankItPrototype.jsx"));
  assert.match(proto, /const GAMES_IN_APP = import\.meta\.env\.VITE_RANKIT_MOBILE === "true";/);
  assert.match(proto, /GAMES_IN_APP \? lazy\(\(\) => import\("\.\.\/arcade\/GamesSurface"\)\) : null/);
  // src/ içinde arcade'i statik import eden kimse yok (bekleyen skor yardımcısı hariç)
  for (const f of walk(SRC).filter((p) => /\.(jsx?|mjs)$/.test(p) && !p.includes(`${SRC}/arcade/`))) {
    for (const m of code(f).matchAll(/from\s*["']([^"']*arcade\/[^"']*)["']/g)) {
      assert.match(m[1], /arcade\/pendingScore(\.js)?$/, `${relative(SRC, f)} arcade'i statik import ediyor: ${m[1]}`);
    }
  }
});

test("Discover tuşu ve yüzey bayrak kapalıyken hiç görünmüyor", () => {
  const proto = code(join(SRC, "rankit", "RankItPrototype.jsx"));
  assert.match(proto, /onOpenGames=\{GamesSurface \? \(\)=>setGamesOpen\(true\) : undefined\}/);
  assert.match(proto, /\{gamesOpen && GamesSurface && <Suspense/);
  assert.match(proto, /\{onOpenGames && \(huntLine\(hunt\)/, "tuş yalnız onOpenGames varken çiziliyor");
});

test("arcade her isteği apiUrl() ile yapıyor — göreli /api yok, çıplak WebSocket yok", () => {
  for (const f of ARCADE) {
    const src = code(f);
    for (const m of src.matchAll(/["'`]\/api\//g)) {
      const before = src.slice(Math.max(0, m.index - 7), m.index);
      assert.equal(before, "apiUrl(", `${relative(SRC, f)}: apiUrl() dışında göreli /api`);
    }
    assert.doesNotMatch(src, /new WebSocket\(/, `${relative(SRC, f)}: WebSocket socketUrl() üzerinden kurulmalı`);
  }
});

test("arcade'in bağımlılık ağacında router, site oturumu ve RankIt API'si yok", () => {
  const { files, external } = importGraph(join(SRC, "arcade", "GamesSurface.jsx"));
  assert.ok(files.length > 10, "import ağacı gezildi");
  assert.ok(!external.some((s) => s.startsWith("react-router")), `router bağımlılığı: ${external.join(", ")}`);
  for (const f of files) {
    const rel = relative(SRC, f);
    assert.ok(!/^(context|contexts)\//.test(rel) && !/AuthContext|useAuth/.test(rel), `site oturumuna bağlı: ${rel}`);
    assert.ok(!rel.startsWith("rankit/") || rel === "rankit/redesign/backStack.js",
      `arcade RankIt'e yalnız geri-tuşu yığınıyla bağlanır, ${rel} değil`);
  }
});

test("Same Screen modu uygulamada yok (ekran küçük — plan kararı)", () => {
  for (const f of ARCADE) assert.doesNotMatch(read(f), /same[\s_-]?screen|sameScreen/i, relative(SRC, f));
});
