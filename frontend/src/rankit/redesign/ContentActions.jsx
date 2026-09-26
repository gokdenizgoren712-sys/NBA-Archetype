/* Report / Block — kullanici iceriginin "⋯" menusu (docs/RANKIT_STORE_BLOCKERS_PLAN.md B5).
 *
 * Magaza sarti (Apple 1.2, Play UGC): her kullanici iceriginin yaninda sikayet
 * ve kotuye kullanani engelleme yolu. Tek bilesen, her yuzeyde ayni akis:
 *   ⋯  ->  Report  ->  sebep (+ istege bagli not)  ->  "we'll review this within 24 hours"
 *      ->  Block @x ->  onay  ->  "You blocked @x"
 *
 * Sheet useDialog'la: odak tuzagi, Escape, odagin acan dugmeye donmesi.
 * Portal'la uygulama kokune cizilir, ama React olaylari portal uzerinden de
 * kabarcıklanir: tiklanabilir bir kartin (FriendsFeed) icindeyken kartin
 * kendi tiklamasini tetiklemesin diye kabin olaylari durdurur.
 *
 * Engel olayi (announceBlock) sheet KAPANIRKEN duyurulur: icerik, kullanici
 * onay satirini okurken altindan kaybolmaz.
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Flag, MoreHorizontal, X } from "lucide-react";
import { rankitApi, announceBlock } from "../rankitApi";
import { useDialog } from "./useDialog";
import { reviewerFromStorage } from "./reviewIdentity";
import { REPORT_REASONS, NOUNS, canActOn } from "./contentActionsModel";

function Sheet({ type, targetId, author, onClose }) {
  const noun = NOUNS[type] || "post";
  const [step, setStep] = useState("menu");
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blockedNow = useRef(false);

  const close = () => {
    if (blockedNow.current) announceBlock(author.id, true);
    onClose();
  };
  const dialog = useDialog({ onClose: close, label: `Options for @${author.username}` });

  const send = async () => {
    if (!reason || busy) return;
    setBusy(true); setError("");
    try {
      await rankitApi.report(type, targetId, reason, note.trim());
      setStep("reported");
    } catch (failure) {
      setError(failure.status === 429 ? failure.message
        : failure.offline ? "You're offline. Try again when you're back."
          : "Could not send the report. Try again.");
    } finally { setBusy(false); }
  };

  const block = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await rankitApi.block(author.id);
      blockedNow.current = true;
      setStep("blocked");
    } catch (failure) {
      setError(failure.offline ? "You're offline. Try again when you're back." : "Could not block. Try again.");
    } finally { setBusy(false); }
  };

  const stop = (event) => event.stopPropagation();
  const host = typeof document !== "undefined" && (document.querySelector(".rankit-app") || document.body);
  const sheet = (
    <div className="ri-sheet-wrap ri-mod-wrap" onClick={(event) => { stop(event); close(); }} onKeyDown={stop}>
      <section {...dialog} className="ri-detail-sheet ri-mod" onClick={stop}>
        <div className="ri-sheet-grab" aria-hidden="true" />
        <button type="button" className="ri-sheet-close" onClick={close} aria-label="Close"><X size={19} /></button>

        {step === "menu" && <>
          <h2 className="ri-mod-title">@{author.username}</h2>
          <div className="ri-mod-menu">
            <button type="button" onClick={() => setStep("report")}>
              <Flag size={17} aria-hidden="true" />
              {type === "user" ? `Report @${author.username}` : `Report this ${noun}`}
            </button>
            <button type="button" className="is-danger" onClick={() => setStep("block")}>
              <Ban size={17} aria-hidden="true" />Block @{author.username}
            </button>
            <button type="button" className="is-quiet" onClick={close}>Cancel</button>
          </div>
        </>}

        {step === "report" && <>
          <h2 className="ri-mod-title">Report this {noun}</h2>
          <fieldset className="ri-mod-reasons">
            <legend>Why are you reporting it?</legend>
            {REPORT_REASONS.map(([key, label]) => (
              <label key={key} className={reason === key ? "is-on" : undefined}>
                <input type="radio" name="ri-report-reason" value={key}
                  checked={reason === key} onChange={() => setReason(key)} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <label className="ri-mod-note">
            <span>Anything else we should know? <small>Optional</small></span>
            <textarea value={note} maxLength={300} rows={3} onChange={(event) => setNote(event.target.value)} />
          </label>
          {error && <p className="ri-mod-error" role="alert">{error}</p>}
          <button type="button" className="ri-mod-primary" disabled={!reason || busy} aria-busy={busy} onClick={send}>
            {busy ? "Sending…" : "Send report"}
          </button>
        </>}

        {step === "reported" && <>
          <h2 className="ri-mod-title">Thanks for telling us</h2>
          <p className="ri-mod-copy" role="status">We&apos;ll review this within 24 hours. If it breaks the
            Community Guidelines it comes down, and repeat offenders lose their account.</p>
          <div className="ri-mod-menu">
            <button type="button" className="is-danger" onClick={() => setStep("block")}>
              <Ban size={17} aria-hidden="true" />Also block @{author.username}
            </button>
            <button type="button" className="is-quiet" onClick={close}>Done</button>
          </div>
        </>}

        {step === "block" && <>
          <h2 className="ri-mod-title">Block @{author.username}?</h2>
          <p className="ri-mod-copy">You won&apos;t see each other&apos;s reviews, replies, lists or chat
            messages, and you&apos;ll both stop following each other. They won&apos;t be told.</p>
          {error && <p className="ri-mod-error" role="alert">{error}</p>}
          <button type="button" className="ri-mod-primary is-danger" disabled={busy} aria-busy={busy} onClick={block}>
            {busy ? "Blocking…" : `Block @${author.username}`}
          </button>
          <button type="button" className="ri-mod-secondary" onClick={() => setStep("menu")}>Cancel</button>
        </>}

        {step === "blocked" && <>
          <h2 className="ri-mod-title">You blocked @{author.username}</h2>
          <p className="ri-mod-copy" role="status">You can unblock them any time in Settings → Blocked accounts.</p>
          <button type="button" className="ri-mod-primary" onClick={close}>Done</button>
        </>}
      </section>
    </div>
  );
  return host ? createPortal(sheet, host) : sheet;
}

/* type: review | comment | list | message | user; author: { id, username }. */
export default function ContentActions({ type, id, author, className = "" }) {
  const [open, setOpen] = useState(false);
  if (!canActOn(author, reviewerFromStorage(localStorage))) return null;
  const noun = NOUNS[type] || "post";
  return <>
    <button type="button" className={`ri-more ${className}`.trim()} aria-haspopup="dialog"
      aria-label={type === "user" ? `More options for @${author.username}` : `More options for @${author.username}'s ${noun}`}
      onClick={(event) => { event.stopPropagation(); setOpen(true); }}
      onKeyDown={(event) => event.stopPropagation()}>
      <MoreHorizontal size={17} aria-hidden="true" />
    </button>
    {open && <Sheet type={type} targetId={id} author={author} onClose={() => setOpen(false)} />}
  </>;
}
