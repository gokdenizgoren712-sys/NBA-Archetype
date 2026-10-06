/* UI v3 Phase 1: kabuk, 500 sınırı, bakım sayfası. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");

test("route çıktısı hata sınırıyla sarılı, sayfa değişince sıfırlanıyor", () => {
  const app = src("App.jsx");
  assert.match(app, /<ErrorBoundary resetKey=\{pathname\}>/);
  const eb = src("components", "shell", "ErrorBoundary.jsx");
  assert.match(eb, /getDerivedStateFromError/);
  assert.match(eb, /ChunkLoadError/);
  assert.match(eb, /window\.location\.reload/);
  assert.doesNotMatch(eb, /Math\.random|crypto/, "referans kodu uydurulmaz");
});

test("bakım kapısı bayrak arkasında; saatler yalnız yanıt başlıklarından", () => {
  const m = src("components", "shell", "Maintenance.jsx");
  assert.match(m, /VITE_MAINTENANCE_GATE !== "0"/);
  assert.match(m, /Retry-After/);
  assert.match(m, /res\.status === 503/);
  assert.match(src("App.jsx"), /<MaintenanceGate>/);
});

test("PageGlow ve .g-smoke kalktı, ızgara ana alanda", () => {
  assert.doesNotMatch(src("components", "states", "States.jsx"), /PageGlow/);
  assert.doesNotMatch(src("components", "shell", "shell.css"), /\.g-smoke \{/);
  assert.match(src("App.jsx"), /overflow-hidden pa-grid/);
});
