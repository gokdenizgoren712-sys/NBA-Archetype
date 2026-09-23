/* ONARIM Aşama 6 — rating/entry durum modeli (BUILD §5.4 + §9). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { saveCta, RATE_CTA } from "../src/rankit/redesign/saveCta.js";

test("§9: puanlanmis mac degismeden acilinca birincil eylem ATIL", () => {
  // Asil kusur buydu: bu oturumda kayit yapilmadigi icin saveState "idle",
  // dirty de false — dugme "Update Diary Entry" yazip ETKIN duruyordu.
  // §9 tablosu "Full time, rated" satirinda birincil eylem yok.
  const fresh = saveCta({ saveState: "idle", dirty: false, watchedDate: "2026-09-01", loadedRating: 4 });
  assert.equal(fresh.disabled, true);
  assert.equal(fresh.label, "Update Diary Entry");
  // Kimlik ya da puan tek basina da yeter.
  assert.equal(saveCta({ saveState: "idle", dirty: false, entryId: 7 }).disabled, true);
  assert.equal(saveCta({ saveState: "idle", dirty: false, loadedRating: 3.5 }).disabled, true);
});

test("§9: ayni macta degisiklik yapilinca eylem geri aciliyor", () => {
  const edited = saveCta({ saveState: "idle", dirty: true, watchedDate: "2026-09-01", loadedRating: 4 });
  assert.equal(edited.disabled, false);
  assert.equal(edited.label, "Update Diary Entry");
});

test("ilk kayit: ortada kayit yokken yildiz verildiginde acik", () => {
  const first = saveCta({ saveState: "idle", dirty: true });
  assert.equal(first.disabled, false);
  assert.equal(first.label, "Save to Diary");
  // Hic dokunulmamis puansiz kayit: kaydedilecek bir sey yok ama kayit da yok;
  // dugme acik kalir (kullanici yildiz vermeden zaten kaydetmiyor, alt kat
  // ayri bir atil "Rate this match" dugmesi gosteriyor).
  assert.equal(saveCta({ saveState: "idle", dirty: false }).disabled, false);
});

test("§5.4: bes durumun her biri kendi cumlesini ve etkinligini tasiyor", () => {
  assert.deepEqual(saveCta({ saveState: "saving", dirty: true }),
    { state: "saving", label: "Saving…", disabled: true, busy: true });
  assert.equal(saveCta({ saveState: "saved", dirty: false }).label, "Saved to Diary");
  assert.equal(saveCta({ saveState: "saved", dirty: false }).disabled, true);
  assert.equal(saveCta({ saveState: "queued", dirty: false }).label,
    "Saved on this phone · waiting to upload");
  // Hata: tekrar denemek HER ZAMAN acik (is kaybolmaz).
  const failed = saveCta({ saveState: "error", dirty: false, entryId: 9 });
  assert.equal(failed.disabled, false);
  assert.match(failed.label, /Try again/);
});

test("kaydedilmis durumda yeniden degisiklik 'dirty' olarak okunuyor", () => {
  const again = saveCta({ saveState: "saved", dirty: true, entryId: 9 });
  assert.equal(again.state, "dirty");
  assert.equal(again.disabled, false);
  assert.equal(again.label, "Update Diary Entry");
});

test("rewatch: onaylanmamis tekrar izleme 'Update' demiyor", () => {
  // Yeni bir rewatch kaydi mevcut girdiyi guncellemez; ikinci bir kart olur.
  const rw = saveCta({ saveState: "idle", dirty: true, watchedDate: "2026-09-01", rewatch: true });
  assert.equal(rw.label, "Save to Diary");
});

test("§9: puansiz evrenin atil etiketi BUILD'in verdigi etiket", () => {
  assert.equal(RATE_CTA, "Rate this match");
});
