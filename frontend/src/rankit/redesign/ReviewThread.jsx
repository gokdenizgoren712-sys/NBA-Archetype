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
import { useEffect, useState } from "react";
import { X, CornerUpLeft } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { SkeletonRows, Loading } from "./States";

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

function Reply({ row, onRespect, onReply }) {
  return (
    <article className="ri-reply">
      <div className="ri-reply-who">
        <strong>@{row.username}</strong>
        {row.is_author && <b className="ri-author-mark">AUTHOR</b>}
        <small>{ago(row.created_at)}</small>
      </div>
      <p>
        {/* Önek metnin parçası DEĞİL, ayrı bir işaret — kullanıcı silemez,
            yanlış yazamaz, ve kime yanıt verildiği her zaman doğru. */}
        {row.reply_to && <span className="ri-address">@{row.reply_to}</span>}
        {row.content}
      </p>
      <div className="ri-reply-acts">
        <button type="button" onClick={() => onRespect(row)} aria-pressed={!!row.respected}
          aria-label={row.respected ? "Take back your respect" : "Respect this reply"}>
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
  const [loaded, setLoaded] = useState({ id: null, data: null });
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);

  const load = () => {
    const tz = -new Date().getTimezoneOffset();
    rankitApi.reviewThread(entryId, tz)
      .then((d) => setLoaded({ id: entryId, data: d }))
      .catch(() => setLoaded({ id: entryId, data: null }));
  };
  useEffect(load, [entryId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const data = loaded.id === entryId ? loaded.data : null;

  const respectReply = async (row) => {
    try { await rankitApi.respectComment(row.id); load(); } catch { /* yok say */ }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      // Adres burada geciyor — kullanicinin yazdigi metinde degil.
      await rankitApi.addComment(entryId, text, replyTo?.id);
      setDraft(""); setReplyTo(null); load();
    } catch { /* gonderilemedi, taslak duruyor */ }
    finally { setSending(false); }
  };

  const review = data?.review;

  return (
    <div className="ri-sheet-wrap" onClick={onClose}>
      <section className="ri-detail-sheet" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Review thread">
        <div className="ri-sheet-grab" aria-hidden="true" />
        <button className="ri-sheet-close" onClick={onClose} aria-label="Close"><X size={19} /></button>

        {!data && <Loading label="Loading the thread"><SkeletonRows count={3} height={84}/></Loading>}

        {review && <>
          <div className="ri-rank-head">
            <div><small>REVIEW</small><h2>{data.match.title}</h2></div>
          </div>

          <article className="ri-thread-review">
            <div className="ri-reply-who">
              <strong>@{review.username}</strong>
              {/* §7.3: incelemenin yaninda yalnizca KADEME, ilerleme yok. */}
              <span className="ri-rank-chip">Rank {review.rank}</span>
              {review.on_the_night && <em>rated on the night</em>}
            </div>
            <p>{review.review}</p>
            {!!review.tags?.length && (
              <div className="ri-thread-tags">
                {review.tags.map((t) => <span key={t}>{t}</span>)}
              </div>
            )}
            <div className="ri-reply-acts">
              <button type="button" aria-pressed={review.respected}
                onClick={async () => { try { await rankitApi.likeReview(review.id); load(); } catch { /* yok say */ } }}
                aria-label={review.respected ? "Take back your respect" : "Respect this review"}>
                <RespectMark on={review.respected} size={13} /> {review.respect || ""} RESPECT
              </button>
            </div>
          </article>

          <div className="ri-chip-title" style={{ marginTop: 18 }}>
            {data.replies.length} {data.replies.length === 1 ? "REPLY" : "REPLIES"}
            <span>Most respected</span>
          </div>

          {data.replies.map((r) => (
            <Reply key={r.id} row={r} onRespect={respectReply}
              onReply={(handle) => setReplyTo({ handle, id: r.user_id })} />
          ))}
          {!data.replies.length && (
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
          </div>
        </>}
      </section>
    </div>
  );
}
