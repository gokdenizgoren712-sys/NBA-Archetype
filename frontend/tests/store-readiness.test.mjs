/* Mağaza hazırlığı — Paket A (docs/RANKIT_STORE_BLOCKERS_PLAN.md).
   A1: sitedeki sayfalar uygulamada tam adresle, uygulama içi tarayıcıda açılır.
   A2: mağaza derlemesinde "Update RankIt" yok (kanal: src/rankit/channel.js).
   A3: viewport-fit yalnız mobil paketlerde (scripts/check-build.mjs derlemeyi denetler). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { externalHref, externalLinkProps, LEGAL_PAGES } from "../src/rankit/openExternal.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(here, "..", "src", ...p), "utf8");

test("uygulamada tam adres + uygulama içi tarayıcı, web'de düz bağlantı", () => {
  assert.equal(externalHref("/privacy-policy", { app: true, root: "https://primaryarch.net" }), "https://primaryarch.net/privacy-policy");
  assert.equal(externalHref("/privacy-policy", { app: false, root: "" }), "/privacy-policy");

  const opened = [];
  const browser = { open: async (o) => { opened.push(o.url); } };
  let prevented = false;
  const props = externalLinkProps("/terms-of-service", { app: true, root: "https://primaryarch.net", browser });
  assert.equal(props.href, "https://primaryarch.net/terms-of-service");
  props.onClick({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  assert.deepEqual(opened, ["https://primaryarch.net/terms-of-service"]);

  assert.deepEqual(externalLinkProps("/contact", { app: false, root: "" }), { href: "/contact" });
});

test("yasal ve destek sayfaları tek listede: gizlilik, şartlar, iletişim", () => {
  const paths = LEGAL_PAGES.map(([p]) => p);
  for (const p of ["/privacy-policy", "/terms-of-service", "/contact"]) assert.ok(paths.includes(p), p);
});

test("Ayarlar göreli bağlantı kullanmıyor; Update yalnız mağaza dışı kanalda", () => {
  const settings = src("rankit", "redesign", "Settings.jsx");
  assert.doesNotMatch(settings, /href=(["'`])\/|href=\{\s*["'`]\//, "göreli href paketlenmiş uygulamayı yeniden yükler");
  assert.match(settings, /\{\.\.\.externalLinkProps\(path\)\}/);
  assert.match(settings, /IS_STORE_BUILD \? \[\] : \[\["\/rankit\/download", "Update RankIt"\]\]/);
});

test("giriş ekranı gizlilik ve şartlara girişten önce ulaştırıyor", () => {
  const first = src("rankit", "redesign", "FirstRun.jsx");
  assert.match(first, /externalLinkProps\("\/privacy-policy"\)/);
  assert.match(first, /externalLinkProps\("\/terms-of-service"\)/);
});

test("kanal: varsayılan sideload, yalnız store değeri mağaza derlemesi", () => {
  const channel = src("rankit", "channel.js");
  assert.match(channel, /VITE_RANKIT_CHANNEL === "store" \? "store" : "sideload"/);
  const env = readFileSync(join(here, "..", ".env.rankit-store"), "utf8");
  assert.match(env, /^VITE_RANKIT_CHANNEL=store$/m);
  assert.match(env, /^VITE_RANKIT_MOBILE=true$/m);
});
