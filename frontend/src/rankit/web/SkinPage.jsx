/* 11b — skin ve paylaşım: seç ve ÖNİZLE, taahhüt etmeden önce (BUILD §4.3:
 * "On web both render live beside the skin picker, so the consequence of a
 * skin is visible before committing").
 *
 *   sol    452: YOUR CARD · maç · SKIN · N EARNED, M LOCKED — üç sütun karo
 *          (telefonun 2j karosu: kilitli karo KOŞULU gösterir, önizleme değil
 *          — "You cannot share a card you haven't earned") · not kutusu ·
 *          Apply / Share
 *   sağ    PREVIEW · CARD AND SHELF, LIVE — seçili skinle kartın kendisi ve
 *          raftaki kompakt hâli; skin yalnız bu ikisini boyar, uygulamayı değil
 *
 * Paylaşım görseli (2k/2l dışa aktarımı) henüz yok: Share bağlantı paylaşır,
 * görsel indiriyormuş gibi yapmaz. Veri `/skins?entry_id=`, `/diary`.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Link2, Share2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import { hidesScore } from "../rankitPrefs";
import SharedMatchCard from "../redesign/MatchCard";
import { diaryToMatchCardProps } from "../redesign/toMatchCardProps";
import { SkinThumb, LockedTile } from "../redesign/SkinPicker";
import { SKIN_NAMES, SKIN_NOTES, applyLabel, normalizeSkin, tileCondition } from "../redesign/skins";
import { skinCounts, skinThumbCard } from "./pagesView";

const INTRO = "A skin paints this card and its share image. It never touches app chrome.";

export default function SkinPage({ entryId, hideScores }) {
  const { isLoggedIn } = useAuth();
  const [entry, setEntry] = useState(undefined);
  const [skins, setSkins] = useState(null);
  const [picked, setPicked] = useState(null);
  const [focus, setFocus] = useState(null);
  const [saved, setSaved] = useState(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let alive = true;
    rankitApi.diary().then((d) => alive && setEntry((d.entries || []).find((e) => Number(e.id) === Number(entryId)) || null)).catch(() => alive && setEntry(null));
    rankitApi.skins(entryId).then((d) => alive && setSkins(d)).catch(() => alive && setSkins({ skins: [], selected: "default" }));
    return () => { alive = false; };
  }, [isLoggedIn, entryId]);

  if (!isLoggedIn) {
    return <div className="riw-page"><div className="riw-page-empty"><strong>Sign in to skin your cards</strong><p><Link to={`/login?next=/rankit/card/${entryId}`}>Sign in</Link></p></div></div>;
  }
  if (entry === null) {
    return <div className="riw-page"><div className="riw-page-empty"><strong>Card not found</strong><p>This entry isn't in your diary. <Link to="/rankit/shelf">Back to your shelf</Link></p></div></div>;
  }

  const list = skins?.skins || [];
  const current = normalizeSkin(saved || skins?.selected || entry?.skin);
  const chosen = picked || current;
  const counts = skinCounts(list);
  const hidden = !!entry && hidesScore(hideScores, { status: entry.status, my_rating: entry.rating });
  const wide = entry ? diaryToMatchCardProps(entry, { hideScores: hidden }) : null;
  const compact = entry ? diaryToMatchCardProps(entry, { compact: true, hideScores: hidden }) : null;
  const card = wide ? skinThumbCard(wide, entry.competition) : null;
  const title = entry ? `${entry.home_short || entry.home_name} ${hidden || entry.home_score == null ? "v" : `${entry.home_score}–${entry.away_score}`} ${entry.away_short || entry.away_name}` : "";
  const focused = list.find((s) => s.id === focus);
  const note = focused && tileCondition(focused) ? `${SKIN_NAMES[focused.id]} — ${SKIN_NOTES[focused.id]}` : picked ? SKIN_NOTES[picked] : INTRO;
  const url = entry ? `${window.location.origin}/rankit/match/${entry.match_id}/reviews` : "";

  const apply = async () => {
    if (saving || chosen === current) return;
    setSaving(true); setStatus("");
    try {
      await rankitApi.setSkin(entryId, entry.match_id, chosen);
      setSaved(chosen); setPicked(null); setStatus(`${SKIN_NAMES[chosen]} applied.`);
    } catch (err) {
      setStatus(err?.status === 403 ? `${SKIN_NAMES[chosen]} is still locked. Your card is unchanged.` : `Could not apply ${SKIN_NAMES[chosen]}. Your card is unchanged.`);
    } finally { setSaving(false); }
  };
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: `${title} on RankIt`, url }); return; }
      await navigator.clipboard.writeText(url); setStatus("Link copied.");
    } catch { /* paylaşım iptal edildi */ }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setStatus("Link copied."); } catch { setStatus(url); }
  };

  return (
    <div className="riw-page riw-skin">
      <section className="riw-skin-side" aria-labelledby="riw-skin-title">
        <p className="riw-page-eyebrow">YOUR CARD</p>
        <h1 id="riw-skin-title">{title || "Your card"}</h1>
        <h2 className="riw-page-eyebrow riw-skin-count">SKIN{skins ? ` · ${counts.earned} EARNED, ${counts.locked} LOCKED` : ""}</h2>
        {!skins || !card ? <div className="riw-read-skeleton" aria-busy="true" /> : (
          <div className="riw-skin-grid" role="radiogroup" aria-label="Skins">
            {list.map((s) => {
              const lines = tileCondition(s);
              const selected = !lines && s.id === chosen;
              return (
                <button type="button" key={s.id} role="radio" aria-checked={selected} aria-disabled={lines ? "true" : undefined}
                  aria-label={lines ? `${SKIN_NAMES[s.id]}, locked. ${lines.join(" ").toLowerCase()}` : SKIN_NAMES[s.id]}
                  className={`ri-skin-tile${selected ? " is-selected" : ""}${lines ? " is-locked" : ""}`}
                  onClick={() => { if (lines) { setFocus(s.id); return; } setFocus(null); setPicked(s.id); setStatus(""); }}>
                  {lines ? <LockedTile id={s.id} lines={lines} /> : <SkinThumb id={s.id} card={card} />}
                  <span className="ri-skin-name">{SKIN_NAMES[s.id] || s.name}</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="riw-skin-note" aria-live="polite">{note}</p>
        {status && <p className="riw-skin-status" role="status">{status}</p>}
        <div className="riw-skin-actions">
          {chosen !== current
            ? <button type="button" className="riw-skin-apply" onClick={apply} disabled={saving} aria-busy={saving}>{saving ? "Applying…" : applyLabel(chosen)}</button>
            : <button type="button" className="riw-skin-apply" onClick={share} disabled={!entry}><Share2 size={16} aria-hidden="true" /> Share</button>}
          <button type="button" className="riw-skin-icon" onClick={copy} aria-label="Copy link" disabled={!entry}><Link2 size={17} /></button>
        </div>
      </section>

      <section className="riw-skin-preview" aria-label={`Preview in ${SKIN_NAMES[chosen]}`}>
        <p className="riw-page-eyebrow">PREVIEW · CARD AND SHELF, LIVE</p>
        {wide && compact ? (
          <div className="riw-skin-stage">
            <div className="riw-skin-wide"><SharedMatchCard {...wide} skin={chosen} scoreSize={46} crestSize={62} /></div>
            <div className="riw-skin-compact"><SharedMatchCard {...compact} skin={chosen} profileShelf ratings="" crestSize={34} artHeight={56} cut={14} /></div>
          </div>
        ) : <div className="riw-read-skeleton" aria-busy="true" />}
        <p className="riw-page-fine">A shareable image in both ratios is coming. For now, Share sends a link to the match and its reviews.</p>
      </section>
    </div>
  );
}
