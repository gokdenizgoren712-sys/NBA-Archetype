/* Girdinin kayit durumu tek yerde (ONARIM Aşama 6, BUILD §5.4 + §9).
 *
 * Bes durum: idle / dirty / saving / saved / queued / error. Ekranda bunlarin
 * her biri BASKA bir cumle ve baska bir etkinlik demek; mantik JSX icinde tek
 * satira sikismisti ve iki hata oradan cikti:
 *
 *   1. Puanlanmis bir mac yeniden acildiginda `saveState` "idle" oluyordu
 *      (kayit bu oturumda yapilmadi) ve `dirty` de false'tu — yani dugme
 *      "Update Diary Entry" yaziyor ve ETKIN duruyordu. Degistirilecek hicbir
 *      sey yokken tiklanabilir bir birincil eylem, §9 tablosunun "Full time,
 *      rated -> —" satirina aykiri: o evrede birincil eylem yok.
 *   2. Puansiz evrenin atil dugmesi "Log this match" diyordu; BUILD'in bu
 *      evre icin verdigi tek etiket "Rate this match" (§9 tablosu).
 */

export const RATE_CTA = "Rate this match";

export function saveCta({ saveState = "idle", dirty = false, entryId = null,
                          watchedDate = null, loadedRating = 0, rewatch = false } = {}) {
  // Sunucuda karsiligi olan bir kayit var mi? Uc ayri isaretten herhangi biri
  // yeter: kimlik, izlenme tarihi ya da yuklenmis bir puan.
  const hasEntry = !!entryId || !!watchedDate || Number(loadedRating) > 0;
  const state = dirty && ["saved", "queued"].includes(saveState) ? "dirty" : saveState;

  if (state === "saving") return { state, label: "Saving…", disabled: true, busy: true };
  if (state === "saved") return { state, label: "Saved to Diary", disabled: !dirty, busy: false };
  if (state === "queued") {
    return { state, label: "Saved on this phone · waiting to upload", disabled: !dirty, busy: false };
  }
  // §5.4: hata dugmenin KENDISINDE duruyor, sayfa banneri degil; tekrar
  // denemek her zaman acik.
  if (state === "error") return { state, label: "Could not save · Try again", disabled: false, busy: false };

  const label = (entryId || ((watchedDate || state === "dirty") && !rewatch))
    ? "Update Diary Entry" : "Save to Diary";
  // Kaydedilecek bir sey yoksa atil.
  return { state, label, disabled: !dirty && hasEntry, busy: false };
}
