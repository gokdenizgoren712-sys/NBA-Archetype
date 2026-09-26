/* Sır bekçisi — hiçbir API anahtarı web paketine (ve APK'ya) girmesin.

   Vite, `import.meta.env.VITE_*` değerlerini derlemede JavaScript'in İÇİNE
   yazar: bu değerler herkese açıktır, APK açılınca da okunur. Buradaki izin
   listesi yalnız tasarım gereği açık olan kimlikleri içerir. Yeni bir VITE_
   değişkeni gerekiyorsa listeye BİLEREK eklenir; sır gerektiren her servis
   backend'den çağrılır (Brevo, Cloudinary imzalı yükleme, ...). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(FRONTEND, "src");

// Açık olması SORUN OLMAYAN değerler — her birinin gerekçesiyle.
const ALLOWED_VITE = new Set([
  "VITE_GOOGLE_CLIENT_ID",         // OAuth istemci kimliği: Google tasarımı gereği açık
  "VITE_CLOUDINARY_CLOUD_NAME",    // hesap adı, görsel URL'lerinde zaten görünür
  "VITE_CLOUDINARY_UPLOAD_PRESET", // imzasız preset adı (sır değil; kötüye kullanım planda O5)
  "VITE_RANKIT_API_URL",           // uygulamanın konuştuğu API adresi
  "VITE_RANKIT_MOBILE",            // build bayrağı
  "VITE_RANKIT_NEW_CARD",          // özellik bayrağı (yeni maç kartı)
]);
const VITE_BUILTINS = new Set(["MODE", "DEV", "PROD", "BASE_URL", "SSR"]);

// Bilinen anahtar biçimleri (değer asla test çıktısına basılmaz).
const SECRET_PATTERNS = [
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["Google OAuth client secret", /GOCSPX-[0-9A-Za-z_-]{20,}/],
  ["GitHub token", /\b(ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{40,}/],
  ["Stripe live key", /\b(sk|rk)_live_[0-9A-Za-z]{16,}/],
  ["Anthropic/OpenAI key", /\bsk-(ant-)?[A-Za-z0-9_-]{32,}/],
  ["Brevo key", /xkeysib-[0-9a-f]{32,}/],
  ["SendGrid key", /SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Cloudinary URL with secret", /cloudinary:\/\/\d+:[^@\s"']+@/],
  ["Server secret name", /\b(JWT_SECRET|BREVO_API_KEY|CLOUDINARY_API_SECRET|ADMIN_INVITE_CODE)\b/],
];

function walk(dir, exts) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p, exts);
    return exts.test(n) ? [p] : [];
  });
}

test("kaynak kod yalnız izin listesindeki VITE_ değişkenlerini okuyor", () => {
  const seen = new Map();
  for (const f of walk(SRC, /\.(jsx?|mjs|tsx?)$/)) {
    // yorumlar atılır: açıklama metni koda sayılmasın
    const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    for (const m of code.matchAll(/import\.meta\.env(\?)?\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (!seen.has(m[2])) seen.set(m[2], relative(FRONTEND, f));
    }
    // env nesnesinin kendisi (import.meta.env[x], const e = import.meta.env) TÜM
    // VITE_ değişkenlerini pakete gömer — yalnız ad ad erişime izin var.
    for (const m of code.matchAll(/import\.meta\.env(?!\??\.[A-Za-z_])/g)) {
      assert.fail(`${relative(FRONTEND, f)}: import.meta.env nesne olarak kullanılmış (konum ${m.index})`);
    }
  }
  for (const [name, where] of seen) {
    if (VITE_BUILTINS.has(name)) continue;
    assert.ok(ALLOWED_VITE.has(name), `${where}: ${name} izin listesinde değil — sırsa backend'e taşı, değilse gerekçesiyle listeye ekle`);
  }
});

test("repodaki env dosyaları ve Dockerfile yalnız izinli VITE_ değerlerini taşıyor", () => {
  let tracked = [];
  try {
    tracked = execFileSync("git", ["ls-files", "-z", "--", ".env*"], { cwd: FRONTEND, encoding: "utf8" })
      .split("\0").filter(Boolean);
  } catch { /* git yoksa atla */ }
  for (const f of tracked) {
    for (const line of readFileSync(join(FRONTEND, f), "utf8").split(/\r?\n/)) {
      const key = line.replace(/#.*/, "").split("=")[0].trim();
      if (!key) continue;
      assert.ok(ALLOWED_VITE.has(key), `${f}: ${key} repoya girmiş bir env anahtarı ama izin listesinde değil`);
    }
  }
  const dockerfile = join(FRONTEND, "..", "Dockerfile");
  if (existsSync(dockerfile)) {
    for (const m of readFileSync(dockerfile, "utf8").matchAll(/\bARG\s+(VITE_[A-Z0-9_]+)/g)) {
      assert.ok(ALLOWED_VITE.has(m[1]), `Dockerfile: ${m[1]} build'e (dolayısıyla pakete) giriyor ama izin listesinde değil`);
    }
  }
});

test("Vite yapılandırması env sınırını genişletmiyor", () => {
  const cfg = readFileSync(join(FRONTEND, "vite.config.js"), "utf8");
  assert.doesNotMatch(cfg, /envPrefix/, "envPrefix değişirse VITE_ dışındaki (sunucu) değişkenleri de pakete girer");
  assert.doesNotMatch(cfg, /define\s*:/, "define ile process.env pakete gömülebilir — eklenecekse bu testi bilerek güncelle");
});

test("derlenmiş paket (varsa) bilinen anahtar biçimlerini içermiyor", (t) => {
  const dist = join(FRONTEND, "dist");
  if (!existsSync(dist)) return t.skip("dist yok — önce `npm run build` ya da `npm run build:rankit-mobile`");
  for (const f of walk(dist, /\.(js|css|html|json|map|txt)$/)) {
    const body = readFileSync(f, "utf8");
    for (const [label, rx] of SECRET_PATTERNS) {
      assert.ok(!rx.test(body), `${relative(FRONTEND, f)}: ${label} biçiminde bir değer pakette`);
    }
  }
});
