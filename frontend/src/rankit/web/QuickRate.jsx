/* 11a — hızlı puanlama: duvarın üstünde, duvardan hiç ayrılmadan (BUILD §20).
 *
 * "Web has no nav diamond. On web the trigger is the wall itself: hover a
 * card, press R, a 560px dialog opens over it." Diyalog kendi kısayollarını
 * altında gösterir — keşfedilmeyen kısayol yoktur.
 *
 *   1–5  puan      .  yarım      C  Classic      ⏎  kaydet      Esc  kapat
 *
 * Tahtadan tek bilinçli sapma: 11a kalabalığın puanını ("4.6 CROWD")
 * puanlamadan ÖNCE gösteriyor. §3.1 "Rate it first — then see whether the
 * room agreed" — hüküm puanlamadan önce açılmaz; o sütun burada yok.
 *
 * Kayıt Inspector'la AYNI yoldan: saveRating → createCollectible → 7e.
 */
import { useRef, useState } from "react";
import { X } from "lucide-react";
import { hidesScore } from "../rankitPrefs";
import { saveRating } from "../rankitOutbox";
import { createCollectible } from "../collectibleState";
import { fromApiMatch } from "../matchModel";
import { CrestPair } from "../redesign/MatchCard";
import { ratingField } from "../redesign/ratingField";
import { useDialog } from "../redesign/useDialog";
import { formatWhen } from "../formatWhen";
import RatingStars from "./RatingStars";
import { toggleHalf } from "./inspectorView";

const NOTE_MAX = 4000;

export default function QuickRate({ match, hideScores, onClose, onLogged, onCollectible }) {
  const app = fromApiMatch(match);
  const [rating, setRating] = useState(Number(match.my_rating) || 0);
  const [classic, setClassic] = useState(!!match.my_classic);
  const [note, setNote] = useState(match.my_review || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const noteRef = useRef(null);
  const dialog = useDialog({ onClose, label: "Quick rate" });

  const entryId = match.my_entry_id || null;
  const scoreShown = !hidesScore(hideScores, { ...match, my_rating: rating || match.my_rating });
  const score = String(match.score || "").replace(/\s+/g, "");
  const title = scoreShown && score ? `${app.home?.name} ${score} ${app.away?.name}` : `${app.home?.name} v ${app.away?.name}`;
  const when = formatWhen(match.starts_at);

  const log = async () => {
    if (saving || !(rating > 0)) return;
    setSaving(true); setError("");
    const entry = { rating, classic, review: note, tags: [...(match.my_tags || [])], respect: [], potmId: null,
      watchedDate: match.my_watched_date || new Date().toISOString().slice(0, 10) };
    try {
      const result = await saveRating({
        diary: {
          match_id: match.id, entry_id: entryId || undefined, watched_date: entry.watchedDate,
          ...ratingField({ touched: true, hasEntry: !!entryId, rating }),
          review: note, classic, tz_offset: -new Date().getTimezoneOffset(),
        },
        // Hızlı puanlamada oyuncu oyu yok; mevcut oylara dokunulmaz.
        matchId: match.id, potmId: match.my_potm_id ?? null, respectIds: match.my_respect_ids || [],
      });
      onLogged?.();
      onCollectible?.(createCollectible(app, { ...entry, entryId: result?.receipt?.entry_id || entryId }, result));
    } catch (e) {
      setError(e.message || "Could not save. Your rating is still here.");
      setSaving(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const inNote = event.target === noteRef.current;
    if (event.key === "Enter" && !inNote) { event.preventDefault(); log(); return; }
    if (inNote) return;
    if (/^[1-5]$/.test(event.key)) { event.preventDefault(); setRating(Number(event.key)); }
    else if (event.key === ".") { event.preventDefault(); setRating((r) => toggleHalf(r)); }
    else if ((event.key === "c" || event.key === "C") && rating > 0) { event.preventDefault(); setClassic((v) => !v); }
  };

  return (
    <div className="riw-scrim-dialog" onClick={onClose}>
      <section {...dialog} className="riw-quick" onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
        <header className="riw-dialog-head">
          <h2>QUICK RATE</h2>
          <span>Esc to close</span>
          <button type="button" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </header>

        <div className="riw-quick-match">
          <CrestPair side={32}
            home={{ short: app.home?.short, color: app.home?.color, crest_url: app.home?.crest_url }}
            away={{ short: app.away?.short, color: app.away?.color, crest_url: app.away?.crest_url }} />
          <div>
            <strong>{title}</strong>
            <small>{[match.competition, match.stage, when.date].filter(Boolean).join(" · ")}</small>
          </div>
        </div>

        <div className="riw-quick-stars">
          <RatingStars value={rating} onChange={setRating} size={46} />
          <p aria-live="polite">{rating > 0 ? rating.toFixed(1) : <>Tap a star — or press <kbd className="riw-key">1</kbd>–<kbd className="riw-key">5</kbd></>}</p>
        </div>

        <div className="riw-quick-pad">
          <button type="button" className={`riw-insp-classic is-tall${classic ? " on" : ""}`} aria-pressed={classic}
            disabled={!(rating > 0)} onClick={() => setClassic((v) => !v)}>
            <i aria-hidden="true" />{classic ? "INSTANT CLASSIC" : "STAMP A CLASSIC"}
          </button>
          <label className="riw-quick-note">
            <span className="riw-visually-hidden">A note on the night (optional)</span>
            <textarea ref={noteRef} rows={2} maxLength={NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)}
              placeholder="Add a note — or skip it and just log the night." />
          </label>
          {error && <p className="riw-insp-foot-error" role="alert">{error}</p>}
        </div>

        <footer className="riw-quick-foot">
          <div className="riw-quick-keys" aria-label="Shortcuts">
            <span><kbd className="riw-key">1–5</kbd>rate</span>
            <span><kbd className="riw-key">.</kbd>half</span>
            <span><kbd className="riw-key">C</kbd>classic</span>
          </div>
          <button type="button" className="riw-quick-log" disabled={!(rating > 0) || saving} aria-busy={saving} onClick={log}>
            {saving ? "Saving…" : entryId ? "Update this entry" : "Log this match"}<kbd aria-hidden="true">⏎</kbd>
          </button>
        </footer>
      </section>
    </div>
  );
}
