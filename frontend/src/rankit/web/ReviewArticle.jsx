/* Web inceleme satırı — Inspector'ın MOST RESPECTED listesi (7c, kısa) ve
   7h iki sütunlu okuma (`variant="long"`: avatar, FOLLOWING, yıldız, Classic,
   zaman; metin kesilmez, paragraflar korunur). Aşama 16'ya kadar
   RankItWeb.jsx'in içindeydi.

   İki uç aynı satırı iki adla veriyor: maç detayı `likes / liked / comments`,
   7h ucu `respect / respected / replies / is_mine / followed`. Burada tek
   şekle iniyor.

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
import { feedAgo, initials } from "../redesign/feedItems";
import ContentActions from "../redesign/ContentActions";
import { useBlockedAuthors } from "../redesign/blockedAuthors";

export default function ReviewArticle({ row, isLoggedIn, variant = "short" }) {
  const ownReview = row.is_mine ?? isOwnContent(row, reviewerFromStorage(localStorage));
  // Report / Block (B6): uygulamadaki ayni ⋯ menusu. Engellenen yazarin
  // incelemesi ve yanitlari yeniden yukleme beklemeden kalkar.
  const isBlocked = useBlockedAuthors();
  const author = { id: row.user_id ?? row.user?.id, username: row.username };
  const actions = isLoggedIn && <ContentActions type="review" id={row.id} author={author} />;
  const [replyAttempts] = useState(createReplyAttempts);
  const [liked, setLiked] = useState(!!(row.liked ?? row.respected));
  const [likes, setLikes] = useState(row.likes ?? row.respect ?? 0);
  const replyCount = row.comments ?? row.replies ?? 0;
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

  const shownComments = comments?.filter((c) => !isBlocked(c.user_id));
  const commentRow = (c) => (
    <p key={c.id}>
      {isLoggedIn && <ContentActions type="comment" id={c.id} author={{ id: c.user_id, username: c.username }} />}
      <strong>@{c.username}</strong><span>{c.content}</span>
    </p>
  );
  if (isBlocked(author.id)) return null;

  const text = row.review && (row.spoiler && !spoilerShown
    ? <p><button type="button" className="riw-spoiler" onClick={() => setSpoilerShown(true)}>Contains spoilers — tap to read</button></p>
    : String(row.review).split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>));
  const thread = open && (
    <div className="riw-comments">
      {comments === null && <span className="riw-quiet">Loading…</span>}
      {shownComments?.map(commentRow)}
      {shownComments?.length === 0 && <span className="riw-quiet">No replies yet.</span>}
      {isLoggedIn ? (
        <div className="ri-chat-compose">
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            aria-label={`Reply to @${row.username}`} placeholder={`Reply to @${row.username}`} />
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
  );

  if (variant === "long") {
    return (
      <article className="riw-review-long">
        <header>
          <span className="riw-review-avatar" aria-hidden="true">{initials(row.username)}</span>
          <div>
            <p className="riw-review-who"><strong>@{row.username}</strong>{!!row.followed && !ownReview && <b>FOLLOWING</b>}{actions}</p>
            <p className="riw-review-meta">
              {row.rating > 0 && <Stars value={row.rating} compact />}
              {!!row.classic && <i className="riw-review-classic" role="img" aria-label={ownReview ? "Your Classic" : "Their Classic"} />}
              <small>{[row.on_the_night ? "on the night" : "", feedAgo(row.created_at)].filter(Boolean).join(" · ")}</small>
            </p>
          </div>
        </header>
        <div className="riw-review-text">{text}</div>
        <footer>
          <button type="button" className={liked ? "on" : undefined} onClick={toggleLike}
            disabled={!isLoggedIn || ownReview} aria-pressed={liked}
            aria-label={ownReview ? `Your review · ${likes} respect` : liked ? "Remove your respect" : "Respect this review"}>
            <i className={`riw-respect${liked ? " on" : ""}`} aria-hidden="true" /> {likes}
          </button>
          {replyCount > 0 && (
            <button type="button" onClick={openComments} aria-expanded={open} disabled={!!row.spoiler && !spoilerShown}>
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </button>
          )}
          <button type="button" className="is-end" onClick={() => { if (!open) openComments(); }} aria-expanded={open}
            disabled={!!row.spoiler && !spoilerShown}>Reply</button>
        </footer>
        {thread}
      </article>
    );
  }

  return (
    <article>
      <div>
        <strong style={{ font: "700 11px var(--font-logo)" }}>@{row.username}</strong>
        <Stars value={row.rating || 0} compact />
        {actions}
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
          aria-label={`Replies · ${replyCount}`}>
          <MessageSquare size={13} /> {replyCount || ""}
        </button>
      </div>
      {open && (
        <div className="riw-comments">
          {comments === null && <span className="riw-quiet">Loading…</span>}
          {shownComments?.map(commentRow)}
          {shownComments?.length === 0 && <span className="riw-quiet">No replies yet.</span>}
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
