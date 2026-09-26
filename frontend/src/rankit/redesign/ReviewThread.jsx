/* Ekran 4a — bir incelemenin kendi yüzeyi. §6.1.
 *
 * Twitter değil; Letterboxd ve Ekşi Sözlük'e yakın: nesne İNCELEME, yanıtlar
 * ona asılı ve her biri BİR KİŞİYE yönelik.
 *
 * Üç kural buradan çıkıyor:
 *   * Adres öneki YAZILMAZ — yanıt eylemi üretir. Kullanıcı "@mara" yazmaz.
 *   * Yuvalama TEK SEVİYE. Bir yanıta yanıt da bir handle adresler ama daha
 *     içeri girmez; o yüzden veri bir ağaç değil, "kime" sütunlu düz liste.
 *   * Sıra EN ÇOK RESPECT, en yeni değil.
 */
import { useState } from "react";
import { X, CornerUpLeft } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { SkeletonRows, Loading, ErrorState } from "./States";
import { useResource } from "./useResource";
import { useDialog } from "./useDialog";
import { reviewerFromStorage, isOwnContent } from "./reviewIdentity";
import { createReplyAttempts } from "./replyAttempt";
import ContentActions from "./ContentActions";
import { useBlockedAuthors } from "./blockedAuthors";

const INK = "#eceded";
const INK_3 = "#9aa0a6";

function ago(iso) {
  if (!iso) return "";
  const then = new Date(String(iso).replace(" ", "T"));
  if (Number.isNaN(then.getTime())) return "";
  const mins = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

/* RankIt elması. §2.3'ün türetilmiş yarıçapı — sabit yazılmıyor. */
function RespectMark({ on, size = 12 }) {
  const r = `${(size * 0.29).toFixed(1)}px ${(size * 0.29).toFixed(1)}px ${(size * 0.34).toFixed(1)}px ${(size * 0.34).toFixed(1)}px`;
  return <span aria-hidden="true" style={{
    width: size, height: size, display: "inline-block", transform: "rotate(45deg)",
    borderRadius: r, border: `1.5px solid ${on ? INK : INK_3}`,
    background: on ? INK : "transparent",
  }} />;
}

function Reply({ row, onRespect, onReply, reviewer }) {
  return (
    <article className="ri-reply">
      <div className="ri-reply-who">
        <strong>@{row.username}</strong>
        {row.is_author && <b className="ri-author-mark">AUTHOR</b>}
        <small>{ago(row.created_at)}</small>
        <ContentActions type="comment" id={row.id} author={{ id: row.user_id, username: row.username }} />
      </div>
      <p>
        {/* Önek metnin parçası DEĞİL, ayrı bir işaret — kullanıcı silemez,
            yanlış yazamaz, ve kime yanıt verildiği her zaman doğru. */}
        {row.reply_to && <span className="ri-address">@{row.reply_to}</span>}
        {row.content}
      </p>
      <div className="ri-reply-acts">
        <button type="button" onClick={() => onRespect(row)} aria-pressed={!!row.respected}
          disabled={isOwnContent(row, reviewer)}
          aria-label={isOwnContent(row, reviewer) ? "Your reply · respect count" : row.respected ? "Take back your respect" : "Respect this reply"}>
          <RespectMark on={row.respected} /> {row.respect || ""}
        </button>
        <button type="button" onClick={() => onReply(row.username)}>
          <CornerUpLeft size={13} /> Reply
        </button>
      </div>
    </article>
  );
}

export default function ReviewThread({ entryId, onClose }) {
  const reviewer = reviewerFromStorage(localStorage);
  const isBlocked = useBlockedAuthors();
  const [replyAttempts] = useState(createReplyAttempts);
  const { data, error, loading, reload: load } = useResource(entryId,
    () => rankitApi.reviewThread(entryId, -new Date().getTimezoneOffset()));
  const [revealedId, setRevealedId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);

  const dialog = useDialog({ onClose, label: "Review thread" });

  const respectReply = async (row) => {
    if (isOwnContent(row, reviewer)) return;
    try { await rankitApi.respectComment(row.id, !row.respected); load(); } catch { /* yok say */ }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const target = replyTo?.id ?? null;
    const clientId = replyAttempts.forSend(entryId, text, target);
    setSending(true);
    try {
      // Adres burada geciyor — kullanicinin yazdigi metinde degil.
      await rankitApi.addComment(entryId, text, target, clientId);
      replyAttempts.confirmed(entryId, text, target);
      setDraft(""); setReplyTo(null); load();
    } catch { setActionError("Could not send. Your reply is still here."); }
    finally { setSending(false); }
  };

  const review = data?.review;
  const hidden = !!review?.spoiler && revealedId !== entryId;
  // Yazari bu oturumda engellendiyse inceleme yeniden yukleme beklemeden kalkar.
  const authorBlocked = !!review && isBlocked(review.user_id);
  const replies = (data?.replies || []).filter((row) => !isBlocked(row.user_id));

  return (
    <div className="ri-sheet-wrap" onClick={onClose}>
      <section {...dialog} className="ri-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ri-sheet-grab" aria-hidden="true" />
        <button className="ri-sheet-close" onClick={onClose} aria-label="Close"><X size={19} /></button>

        {error && <ErrorState error={error} onRetry={load}/>}
        {loading && !data && <Loading label="Loading the thread"><SkeletonRows count={3} height={84}/></Loading>}
        {actionError && <p role="alert">{actionError}</p>}

        {authorBlocked && (
          <div className="ri-blocked-note" role="status">
            <p>You blocked @{review.username}. Their review and replies are hidden.</p>
          </div>
        )}

        {review && !authorBlocked && <>
          <div className="ri-rank-head">
            <div><small>REVIEW</small><h2>{data.match.title}</h2></div>
          </div>

          <article className="ri-thread-review">
            <div className="ri-reply-who">
              <strong>@{review.username}</strong>
              {/* §7.3: incelemenin yaninda yalnizca KADEME, ilerleme yok. */}
              <span className="ri-rank-chip">Rank {review.rank}</span>
              {review.on_the_night && <em>rated on the night</em>}
              <ContentActions type="review" id={review.id} author={{ id: review.user_id, username: review.username }} />
            </div>
            {/* Yalniz yazar gizlenmis incelemesine ulasir (sunucu digerlerine 404). */}
            {review.hidden && (
              <p className="ri-mod-copy" role="status">Hidden after reports. Only you can see it while we review it.</p>
            )}
            {hidden ? <button className="ri-spoiler-gate" onClick={() => setRevealedId(entryId)}>Contains spoilers — reveal this discussion</button> : <p>{review.review}</p>}
            {!hidden && !!review.tags?.length && (
              <div className="ri-thread-tags">
                {review.tags.map((t) => <span key={t}>{t}</span>)}
              </div>
            )}
            <div className="ri-reply-acts">
              <button type="button" aria-pressed={review.respected} disabled={isOwnContent(review, reviewer)}
                onClick={async () => { if (isOwnContent(review, reviewer)) return; try { await rankitApi.likeReview(review.id, !review.respected); load(); } catch { /* yok say */ } }}
                aria-label={isOwnContent(review, reviewer) ? "Your review · respect count" : review.respected ? "Take back your respect" : "Respect this review"}>
                <RespectMark on={review.respected} size={13} /> {review.respect || ""} RESPECT
              </button>
            </div>
          </article>

          {!hidden && <><div className="ri-chip-title" style={{ marginTop: 18 }}>
            {replies.length} {replies.length === 1 ? "REPLY" : "REPLIES"}
            <span>Most respected</span>
          </div>

          {replies.map((r) => (
            <Reply key={r.id} row={r} reviewer={reviewer} onRespect={respectReply}
              onReply={(handle) => setReplyTo({ handle, id: r.user_id })} />
          ))}
          {!replies.length && (
            <p className="ri-companion-note">Nobody has replied yet.</p>
          )}

          <div className="ri-reply-compose">
            {replyTo && (
              <div className="ri-replying-to">
                Replying to <b>@{replyTo.handle}</b>
                <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={12} /></button>
              </div>
            )}
            <div className="ri-chat-compose">
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                aria-label="Write a reply"
                placeholder={replyTo ? `Reply to @${replyTo.handle}` : `Reply to @${review.username}`} />
              <button onClick={send} disabled={sending || !draft.trim()} aria-label="Send reply">
                <CornerUpLeft size={15} />
              </button>
            </div>
          </div></>}
        </>}
      </section>
    </div>
  );
}
