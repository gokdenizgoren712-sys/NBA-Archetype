/* 7e — koleksiyon anı, tam ekran katman (BUILD §19.2, §4.1).
 *
 * "A rating resolved inside a 468px panel would make the payoff physically
 * smaller than the act that earned it." Inspector'ın İÇİNDE değil, duvarın
 * üstünde:
 *   perde  rgba(9,10,11,.88), ısı-5 %15 ışıma 50% 44%
 *   kart   452 geniş, crest 76, sanat 196, skor 66
 *   metin  400 geniş, kartın sağında, 60 aralık
 *   kapat  sağ üst 44×44 ve Escape
 *
 * Veri telefonla AYNI nesneden (collectibleState.createCollectible) ve aynı
 * kural: kart numarası, deltalar ve ilerleyen koleksiyon UÇTAN gelir;
 * kuyrukta (çevrimdışı) hiçbiri uydurulmaz. Toplamlar (seri, puan) kabuğun
 * /rank verisinden — kayıttan sonra tazelenir.
 */
import { useEffect, useRef, useState } from "react";
import { Edit3, Share2, X } from "lucide-react";
import SharedMatchCard from "../redesign/MatchCard";
import { toMatchCardProps } from "../redesign/toMatchCardProps";
import { collectibleSentence, collectibleShareText } from "../collectibleState";
import { useDialog } from "../redesign/useDialog";

function Delta({ value, label, delta, tone }) {
  return (
    <div className={`riw-moment-delta${tone ? ` is-${tone}` : ""}`}>
      <strong>{value}</strong>
      <span>{label}<br /><small>{delta === null || delta === undefined ? "—" : `${delta > 0 ? "+" : ""}${delta}`}</small></span>
    </div>
  );
}

export default function CollectibleOverlay({ result, rank, hideScores, onDone, onEdit }) {
  const { match, entry, queued, cardNumber, collection, deltas } = result;
  const heading = useRef(null);
  const [notice, setNotice] = useState("");
  const [sharing, setSharing] = useState(false);
  const dialog = useDialog({ onClose: onDone, label: "Saved to your diary" });
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  const points = deltas.find((d) => d.label === "Rank points")?.value ?? null;
  const streak = deltas.find((d) => d.label === "Streak nights")?.value ?? null;
  const props = toMatchCardProps({ ...match, my_rating: queued ? match.my_rating : entry.rating },
    { hideScores, scoreSize: 66, cardWidth: 452, crestSize: 76 });

  const share = async () => {
    if (sharing) return;
    setSharing(true); setNotice("");
    try {
      const text = collectibleShareText(result);
      if (navigator.share) await navigator.share({ title: "RankIt by Primary Arch", text });
      else { await navigator.clipboard.writeText(text); setNotice("Your rating text was copied."); }
    } catch (error) {
      if (error?.name !== "AbortError") setNotice("Could not share. Your diary entry is safe.");
    } finally { setSharing(false); }
  };

  const state = queued ? "SAVED ON THIS DEVICE" : result.receipt?.updated ? "ENTRY UPDATED" : "SAVED TO YOUR DIARY";
  const title = queued ? "Kept here. Ready to sync."
    : cardNumber !== null ? `That's card ${cardNumber}.`
    : result.receipt?.updated ? "Your take, refined." : "A match worth keeping.";

  return (
    <div className="riw-moment" {...dialog}>
      <div className="riw-moment-glow" aria-hidden="true" />
      <button type="button" className="riw-moment-close" onClick={onDone} aria-label="Close"><X size={16} /></button>
      <div className="riw-moment-stage">
        <div className="riw-moment-card">
          <SharedMatchCard {...props} ratingKind="personal" heatLabel="YOUR RATING" heat={entry.rating || 0}
            classic={entry.classic} ratings={entry.classic ? "YOUR CLASSIC" : "YOUR ENTRY"} footNote={entry.tags?.[0] || ""}
            artHeight={196} crestSize={76} cut={26} />
        </div>
        <div className="riw-moment-copy">
          <p className={`riw-moment-state${queued ? "" : " is-saved"}`}>{state}</p>
          <h2 ref={heading} tabIndex={-1}>{title}</h2>
          <p className="riw-moment-text">{queued
            ? "Upload confirmation and earned progress appear in your diary once it syncs."
            : collectibleSentence(entry, streak)}</p>
          {!queued && (
            <div className="riw-moment-deltas">
              <Delta tone="heat" value={rank?.streak?.current ?? "—"} label="night streak" delta={streak} />
              <Delta value={rank?.rank?.points != null ? rank.rank.points.toLocaleString() : "—"} label="points" delta={points} />
              {/* Üçüncü karo yalnız bir koleksiyon ilerlediyse (§4.1 "any
                  collection advanced") — boş bir 0/0 uydurulmaz. */}
              {collection && (
                <Delta value={<>{collection.collected}<small>/{collection.total}</small></>} label={collection.title}
                  delta={collection.delta > 0 ? collection.delta : null} />
              )}
            </div>
          )}
          <div className="riw-moment-actions">
            {/* §4.1: altın bir kez — Classic damgalıysa kartın hairline'ında,
                değilse birincil eylemde. Web'de birincil eylem yok; altın kartta. */}
            <button type="button" onClick={share} disabled={sharing || queued} aria-busy={sharing}><Share2 size={17} aria-hidden="true" />SHARE</button>
            <button type="button" disabled aria-describedby="riw-moment-skin-note">
              <span className="riw-moment-swatches" aria-hidden="true"><i /><i /><i /></span>SKIN
            </button>
            <button type="button" onClick={onEdit} disabled={!result.canEdit}><Edit3 size={17} aria-hidden="true" />EDIT</button>
          </div>
          <p id="riw-moment-skin-note" className="riw-moment-fine">Skins are chosen in the RankIt app for now; your card keeps the skin you pick there.</p>
          <button type="button" className="riw-moment-back" onClick={onDone}>Back to tonight <kbd>Esc</kbd></button>
          <p className="riw-moment-fine" role="status">{notice}</p>
        </div>
      </div>
    </div>
  );
}
