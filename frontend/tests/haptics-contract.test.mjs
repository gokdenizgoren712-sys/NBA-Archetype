/* Titresim cagrilari modulun GERCEK fonksiyonlarina gidiyor mu?
   `rankitHaptics.selection()` (var olmayan bir ad) try'dan once TypeError
   atip incelemeye respect vermeyi 0.3.0'dan beri sessizce bozuyordu. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "rankit");
const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.(jsx?|mjs)$/.test(name) ? [path] : [];
});

test("her rankitHaptics cagrisi modulde tanimli bir fonksiyon", () => {
  const module = readFileSync(join(root, "rankitHaptics.js"), "utf8");
  const defined = new Set([...module.matchAll(/^\s+(\w+):\s*\(\)\s*=>/gm)].map(m => m[1]));
  assert.ok(defined.size >= 3, "modul okunamadi");
  const unknown = [];
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/rankitHaptics\.(\w+)\(/g)) {
      if (!defined.has(m[1])) unknown.push(`${file.slice(root.length + 1)}: ${m[1]}`);
    }
  }
  assert.deepEqual(unknown, [], `tanimsiz titresim cagrisi:\n${unknown.join("\n")}`);
});
