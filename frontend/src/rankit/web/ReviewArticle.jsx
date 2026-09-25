/* Web inceleme satırı — Inspector'ın MOST RESPECTED listesi (7c) ve Discover
   katalog çekmecesi. Aşama 16'ya kadar RankItWeb.jsx'in içindeydi.

   Respect (§11.3) inceleme başına tek birimdir; kendi incelemene respect
   verilmez. Spoiler işaretli metin okuyucunun kararıyla açılır — sunucu
   metni zaten gönderiyor, başka bir yüzeye yollamıyoruz. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Send } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { reviewerFromStorage, isOwnContent } from "../redesign/reviewIdentity";
import { createReplyAttempts } from "../redesign/replyAttempt";
import { Stars } from "./cards";

export default function ReviewArticle({ row, isLoggedIn }) {
  const ownReview = isOwnContent(row, reviewerFromStorage(localStorage));
  const [replyAttempts] = useState(createReplyAttempts);
  const [liked, setLiked] = useState(!!row.liked);
  const [likes, setLikes] = useState(row.likes || 0);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Spoiler webde "uygulamada aç" diyordu, oysa sunucu metni zaten gönderiyor:
  // okuyucuyu sahip olduğumuz içerik için başka bir yüzeye göndermek yerine
  // kendi kararını vermesine izin veriyoruz.
  const [spoilerShown, setSpoilerShown] = useState(false);

  const toggleLike = async () => {
    if (!isLoggedIn || ownReview) return;
    const before = { liked, likes };
    setLiked(!liked); setLikes(likes + (liked ? -1 : 1));
    try {
      const r = await rankitApi.likeReview(row.id, !liked);
      setLiked(r.liked); setLikes(r.likes);
    } catch { setLiked(before.liked); setLikes(before.likes); }
  };

  const openComments = async () => {
    const next = !open;
    setOpen(next);
    if (next && comments === null) {
      try { setComments((await rankitApi.comments(row.id)).comments || []); }
      catch { setComments([]); }
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const clientId = replyAttempts.forSend(row.id, text);
    setSending(true);
    try {
      await rankitApi.addComment(row.id, text, null, clientId);
      replyAttempts.confirmed(row.id, text);
      setComments((await rankitApi.comments(row.id)).comments || []);
      setDraft("");
    } catch { /* gönderilemedi: taslak duruyor, kullanıcı tekrar deneyebilir */ }
    finally { setSending(false); }
  };

  return (
    <article>
      <div>
        <strong style={{ font: "700 11px var(--font-logo)" }}>@{row.username}</strong>
        <Stars value={row.rating || 0} compact />
      </div>
      {row.review && (
        row.spoiler && !spoilerShown ? (
          <p>
            <button type="button" className="riw-spoiler" onClick={() => setSpoilerShown(true)}>
              Contains spoilers — tap to read
            </button>
          </p>
        ) : <p>{row.review}</p>
      )}
      <div className="riw-review-actions">
        <button type="button" className={liked ? "on" : undefined} onClick={toggleLike}
          disabled={!isLoggedIn || ownReview} aria-pressed={liked}
          aria-label={ownReview ? `Your review · ${likes} respect` : liked ? "Remove your respect" : "Respect this review"}>
          {/* §11.3: respect RankIt elmasi — bosken cerceve, verilince dolu
              murekkep. Asla kalp, asla altin (Asama 16'ya kadar kalpti). */}
          <i className={`riw-respect${liked ? " on" : ""}`} aria-hidden="true" /> {likes || ""}
        </button>
        <button type="button" onClick={openComments} aria-expanded={open} disabled={!!row.spoiler && !spoilerShown}
          aria-label={`Replies · ${row.comments || 0}`}>
          <MessageSquare size={13} /> {row.comments || ""}
        </button>
      </div>
      {open && (
        <div className="riw-comments">
          {comments === null && <span className="riw-quiet">Loading…</span>}
          {comments?.map((c) => (
            <p key={c.id}><strong>@{c.username}</strong><span>{c.content}</span></p>
          ))}
          {comments?.length === 0 && <span className="riw-quiet">No replies yet.</span>}
          {isLoggedIn ? (
            <div className="ri-chat-compose">
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                aria-label="Reply to this review" placeholder="Write a reply" />
              <button onClick={send} disabled={sending || !draft.trim()} aria-label="Send reply">
                <Send size={14} />
              </button>
            </div>
          ) : (
            <span className="riw-quiet">
              <Link to="/login?next=/rankit" style={{ color: "var(--ri-gold, #FFB11B)" }}>Sign in</Link> to reply.
            </span>
          )}
        </div>
      )}
    </article>
  );
}
