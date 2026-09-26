// Derleme çıktısı kanalına uygun mu? (docs/RANKIT_STORE_BLOCKERS_PLAN.md A2, A3)
// Kullanım: node scripts/check-build.mjs site|sideload|store   (dist/ üzerinde)
//   site     → viewport-fit YOK (site mobil Safari'de çentiğe taşmasın)
//   sideload → viewport-fit VAR, "Update RankIt" VAR (APK kendi güncellemesini sitede bulur)
//   store    → viewport-fit VAR, "Update RankIt" ve APK indirme bağlantısı YOK (mağaza politikası)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const kind = process.argv[2];
if (!["site", "sideload", "store"].includes(kind)) {
  console.error("usage: node scripts/check-build.mjs site|sideload|store");
  process.exit(2);
}
const dist = join(process.cwd(), "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error("dist/index.html yok — önce derle");
  process.exit(2);
}
const html = readFileSync(join(dist, "index.html"), "utf8");
const assets = readdirSync(join(dist, "assets")).filter((f) => f.endsWith(".js"))
  .map((f) => readFileSync(join(dist, "assets", f), "utf8")).join("\n");

const problems = [];
const fit = /name="viewport"[^>]*viewport-fit=cover/.test(html);
if (kind === "site" && fit) problems.push("site index.html viewport-fit=cover içeriyor");
if (kind !== "site" && !fit) problems.push("mobil index.html viewport-fit=cover içermiyor (iOS güvenli alan 0 döner)");
const hasUpdate = assets.includes("Update RankIt");
if (kind === "sideload" && !hasUpdate) problems.push("sideload paketinde 'Update RankIt' yok");
if (kind === "store") {
  if (hasUpdate) problems.push("store paketinde 'Update RankIt' var (Play/App Store politikası)");
  if (assets.includes("/rankit/download")) problems.push("store paketinde APK indirme bağlantısı (/rankit/download) var");
}
if (problems.length) {
  for (const p of problems) console.error(`✖ ${p}`);
  process.exit(1);
}
console.log(`✓ ${kind} derlemesi kanalına uygun`);
