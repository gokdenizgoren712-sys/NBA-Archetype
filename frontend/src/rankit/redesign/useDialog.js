/* Sheet'ler dialog'dur (HANDOFF §4.2).
 *
 * Tasarimin sheet'leri ekranin geri kalanini kapatiyor ama kod tarafinda
 * duz <div>'lerdi: Escape kapatmiyordu, Tab arkadaki ekrana kaciyordu ve
 * sheet kapaninca odak <body>'ye dusuyordu -- klavye ya da ekran okuyucuyla
 * gelen biri, siradaki Tab'da uygulamanin en basina donuyordu.
 *
 * Tek yerden cozuluyor, cunku on iki sheet'te on iki kez dogru yapmak
 * mumkun degil. Kanca:
 *   - dialog rolunu ve aria-modal'i verir (prop torbasi olarak),
 *   - acilista odagi iceri alir (once [data-autofocus], yoksa ilk odaklanabilir
 *     oge, o da yoksa kabin kendisi),
 *   - Tab/Shift+Tab'i kabin icinde dondurur,
 *   - Escape'te kapatir,
 *   - kapanista odagi ACAN ogeye geri verir.
 *
 * Ic ice acilan sheet'ler (mac sheet -> tum incelemeler -> konu; ayarlar ->
 * takip duzenleyici) icin modul duzeyinde bir yigin var: klavyeyi yalnizca
 * EN USTTEKI dialog dinler. Boylece Escape once ustteki sheet'i kapatir,
 * altindakini degil -- daha once her bilesen bunu kendi bayragiyla
 * ("!picking", "!editingFollows") elle idare ediyordu.
 *
 * Arka plan tek dugum degil: syncIsolation ust dialoga giden DOM yolunun
 * kardes dallarina inert koyar; portal ve ic ice sheet ayni kurala uyar.
 */
import { useEffect, useRef } from "react";

const stack = [];

/* Android Back ve Escape AYNI dialogu kapatir. Eski tam ekran geri
   kayitlari ancak burada dialog kalmadiginda devreye girer. */
export function closeTopDialog() {
  const entry = topDialog();
  if (!entry) return false;
  entry.close();
  return true;
}

function topDialog() {
  // React cocuk efektlerini ebeveynden once calistirabilir. Kayit sirasina
  // ek olarak DOM kapsamasini kullan: icteki dialog her zaman usttedir.
  return stack.filter(entry => entry.node?.isConnected)
    .filter(entry => !stack.some(other => other !== entry && other.node && entry.node?.contains(other.node)))
    .at(-1);
}

const isolated = new Map();
function syncIsolation() {
  for (const [node, wasInert] of isolated) {
    if (!wasInert) node.removeAttribute("inert");
  }
  isolated.clear();
  // Portal ve ic ice sheet icin ayni kural: ust dialogun kokune giden
  // yol acik kalir; yolun her seviyesindeki kardes dallar etkileşime kapanir.
  let node = topDialog()?.node;
  while (node && node !== document.body) {
    for (const sibling of node.parentElement?.children || []) {
      if (sibling === node || !(sibling instanceof HTMLElement) || ["SCRIPT","STYLE","LINK"].includes(sibling.tagName)) continue;
      isolated.set(sibling, sibling.hasAttribute("inert"));
      sibling.setAttribute("inert", "");
    }
    node = node.parentElement;
  }
}

const FOCUSABLE = [
  "a[href]", "area[href]", "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])', "select:not([disabled])",
  "textarea:not([disabled])", '[tabindex]:not([tabindex="-1"])',
  "audio[controls]", "video[controls]", "summary", "[contenteditable]",
].join(",");

/** Kabin icindeki, gercekten odaklanabilir (gorunur) ogeler, DOM sirasinda. */
function focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.closest('[inert], [aria-hidden="true"]') && el.getClientRects().length > 0,
  );
}

/* Odagi geri verirken DUGUM YETMIYOR. Bazi yuzeyler acan ekrani tamamen
 * sokuyor (ornek: Profil'de tab === "Settings" iken ProfileView yalnizca
 * Ayarlar'i donduruyor, "Settings" dugmesi DOM'dan cikiyor) -- kapanista o
 * dugme YENI bir dugum olarak geri geliyor ve elimizdeki referans olu.
 * Olculdu: ikinci Escape'te odak <body>'ye dusuyordu, yani §4.2'nin
 * onlemek istedigi seyin ta kendisi. Bu yuzden dugumun yaninda bir de
 * kimligi tutuluyor ve geri donusta TEK bir eslesme varsa o kullaniliyor;
 * belirsizse yanlis ogeye odaklanmaktansa dokunulmuyor. */
function fingerprint(el) {
  if (!(el instanceof Element) || el === document.body) return null;
  return {
    tag: el.tagName,
    id: el.id || null,
    label: el.getAttribute("aria-label"),
    text: (el.textContent || "").trim().slice(0, 64),
  };
}

/* Acan ogeyi kancanin efektinde okumak GEC KALIYOR. Bazi yuzeyler, kendilerini
 * acan ekrani ayni state degisiminde sokuyor (Profil -> Ayarlar): dugme DOM'dan
 * cikinca odak <body>'ye duser ve efekt calistiginda document.activeElement
 * artik <body>'dir -- geri verilecek bir sey kalmaz. O yuzden odagi surekli
 * izliyoruz: her focusin'de oge ve HENUZ BAGLIYKEN alinan kimligi saklaniyor.
 * (Olculdu: bu olmadan Ayarlar'dan Escape ile cikista odak <body>'de kaliyordu.) */
let lastFocused = null;

if (typeof document !== "undefined") {
  document.addEventListener("focusin", (event) => {
    const el = event.target;
    if (el instanceof Element && el !== document.body) {
      lastFocused = { el, print: fingerprint(el) };
    }
  }, true);
}

function findAgain(print) {
  if (!print) return null;
  if (print.id) {
    const byId = document.getElementById(print.id);
    if (byId) return byId;
  }
  const found = Array.from(document.querySelectorAll(print.tag)).filter((el) => {
    if (!el.getClientRects().length) return false;
    if (print.label != null) return el.getAttribute("aria-label") === print.label;
    if (!print.text) return false;
    return (el.textContent || "").trim().slice(0, 64) === print.text;
  });
  return found.length === 1 ? found[0] : null;
}

/**
 * @param {object}   options
 * @param {Function} options.onClose  Escape'in cagiracagi kapatma.
 * @param {string}   options.label    aria-label (sheet'in adi).
 * @param {boolean}  [options.active] false ise kanca hicbir sey yapmaz --
 *   ayni bilesen bazen dialog bazen tam ekran olabiliyor (bkz. FirstRun).
 * @returns {object} dialog kabina yayilacak prop'lar.
 */
export function useDialog({ onClose, label, active = true } = {}) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);

  // Render sirasinda ref'e yazmak saf degil (react-hooks/refs); efektte.
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!active || !ref.current) return undefined;

    const focused = document.activeElement;
    const live = focused instanceof Element && focused !== document.body
      && focused.isConnected && !ref.current.contains(focused);
    const opener = live ? focused : lastFocused?.el || null;
    const openerPrint = live ? fingerprint(focused) : lastFocused?.print || null;
    // Kabin DUGUMU her seferinde ref'ten okunuyor, bir kez yakalanmiyor:
    // bazi sheet'ler yuklenirken baska bir govde donduruyor (once iskelet,
    // sonra icerik) ve o degisimde dugum yenilenebiliyor.
    const entry = { get node() { return ref.current; }, close: () => closeRef.current?.() };
    stack.push(entry);
    syncIsolation();

    const first0 = ref.current.querySelector("[data-autofocus]") || focusables(ref.current)[0];
    if (topDialog() === entry) (first0 || ref.current).focus({ preventScroll: true });

    const onKey = (event) => {
      const node = ref.current;
      if (!node || topDialog() !== entry) return;
      if (event.key === "Escape") {
        // Durdurulmazsa alttaki sheet'ler de kendi Escape'lerini gorur.
        event.stopPropagation();
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables(node);
      if (!items.length) { event.preventDefault(); node.focus({ preventScroll: true }); return; }
      const index = items.indexOf(document.activeElement);
      const first = items[0];
      const last = items[items.length - 1];
      // Odak kabin kendisindeyse (index -1) Shift+Tab dialogu terk ederdi.
      if (index === -1) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && index === 0) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    const keepFocus = (event) => {
      const node = ref.current;
      if (node && topDialog() === entry && !node.contains(event.target)) {
        (focusables(node)[0] || node).focus({ preventScroll: true });
      }
    };
    document.addEventListener("focusin", keepFocus);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", keepFocus);
      const at = stack.indexOf(entry);
      if (at >= 0) stack.splice(at, 1);
      syncIsolation();
      // Once dugumun kendisi, sonra kimligiyle yeniden bulunani, o da
      // yoksa bir altimizdaki dialog.
      const back = topDialog();
      const target = (opener instanceof Element && opener.isConnected)
        ? opener
        : findAgain(openerPrint);
      if (target && (!back || back.node?.contains(target))) target.focus({ preventScroll: true });
      else if (back?.node?.isConnected) back.node.focus({ preventScroll: true });
    };
  }, [active]);

  if (!active) return { ref };
  return { ref, role: "dialog", "aria-modal": "true", "aria-label": label, tabIndex: -1 };
}

export default useDialog;
