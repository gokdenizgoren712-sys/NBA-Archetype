/* Ekran 3i — başkasının profili.
 *
 * Bir profilde asıl soru "bu kişi kim" değil, "bu kişinin zevki BENİMKİNE
 * ne kadar yakın" — takip etmeye değer mi, onu o cevaplıyor. O yüzden
 * ekranın merkezinde TASTE OVERLAP var ve sayılar sunucudan geliyor,
 * cümleyi arayüz kuruyor ("You agree on 41 of the 57 matches you've both
 * rated. Deniz runs about half a star colder than you.").
 *
 * Tasarımdan sapmalar:
 *   * Avatar gradyanı yok — nötr disk, baş harfler. Kimlik için bir palet §1'de
 *     yok ve ısı rampasıyla boyamak "@deniz sıcak" demek olurdu (6e'de aynı
 *     karar).
 *   * Büyük isim satırı kullanıcı adı. Tasarım "Deniz Yalçın" yazıyor ama
 *     hesaplarda görünen ad alanı YOK; uydurmak yerine adı yazıyoruz.
 *   * Konuşma balonu düğmesi yok. RankIt'te mesajlaşma yok; sahibinin kararı
 *     (2026-09-12): düğme dışarıda kalıyor.
 *
 * Özel kayıtlar hiçbir sayıya girmiyor — ortalama, "Logged", ortaklık, raf:
 * hepsi izleyenin GÖREBİLDİĞİ kayıtlardan (bkz. api/rankit.py
 * _visible_entries_sql). Aksi hâlde "57'de 41 uyum" gizli puanları ele verir.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { rankitApi, announceBlock } from "../rankitApi";
import { hidesScore } from "../rankitPrefs";
import { SkeletonRows, Loading, ErrorState } from "./States";
import RedesignMatchCard from "./MatchCard";
import { toMatchCardProps } from "./toMatchCardProps";
import { RAMP, heatSteps } from "./heat";
import { useBackClose } from "./backStack";
import { useDialog } from "./useDialog";
import { useResource } from "./useResource";
import { ratingAccount } from "../rankitOutbox";
import RelationshipButton from "./RelationshipButton";
import { useRelationshipRevision } from "./useRelationshipRevision";
import { overlapPercent } from "./relationshipState";
import ContentActions from "./ContentActions";

/* Engelledigin kisinin profili yalniz bu kadar (sunucu icerik gondermez). */
function BlockedNote({ memberId, username }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unblock = async () => {
    setBusy(true); setError("");
    try { await rankitApi.unblock(memberId); announceBlock(memberId, false); }
    catch { setError("Could not unblock. Try again."); setBusy(false); }
  };
  return <div className="ri-blocked-note" role="status">
    <p>You blocked @{username}. You won&apos;t see each other&apos;s reviews, replies, lists or chat messages.</p>
    <button type="button" onClick={unblock} disabled={busy} aria-busy={busy}>{busy ? "Unblocking…" : `Unblock @${username}`}</button>
    {error && <p className="ri-mod-error" role="alert">{error}</p>}
  </div>;
}

const INK_3 = "#9aa0a6";

/* Isı rampasında basamak. %72 -> 3 (GOOD): tasarım 72%'yi üç çubuk ve
   #9a3f96 ile çiziyor, yani yuvarlama değil TABAN. */
function overlapStep(pct) {
  return Math.max(1, Math.min(5, Math.floor(pct * 5)));
}

/* "about half a star colder" — eğilimi yarım yıldıza yuvarla ve söyle. */
function leaning(bias, name) {
  const halves = Math.round(Math.abs(bias) * 2);
  if (!halves) return `${name} rates about the same as you.`;
  const size = halves === 1 ? "half a star" : halves === 2 ? "a star" : `${halves / 2} stars`;
  return `${name} runs about ${size} ${bias < 0 ? "colder" : "warmer"} than you.`;
}

function stars(r) {
  if (r == null) return "";
  const n = Number(r);
  return "★".repeat(Math.floor(n)) + (n % 1 ? "½" : "");
}

/* Ham _match_dict -> kart. Kabuklarin kendi adaptorleri var (fromApiMatch /
   toCard); bu ekran ikisine de baglanmasin diye burada. */
function shelfCard(m, hideScores) {
  const props = toMatchCardProps({
    ...m,
    communityRating: m.community_rating,
    instantClassic: m.instant_classic,
    dominantTag: m.dominant_tag,
  }, { compact: true, scoreSize: 24, cardWidth: 155, crestSize: 32, hideScores });
  // Rafta damga ve yildizlar ONUN; isi toplulugun (tasarim: ARS 4.6 isi,
  // bes yildiz).
  return { ...props, hasVerdict: props.hasVerdict || Number(m.their_rating) > 0 || !!m.their_classic,
    ratingKind: "member", classic: !!m.their_classic, ratings: stars(m.their_rating) };
}

export default function MemberProfile({ memberId, onClose, onOpenMatch, embedded = false, hideScores: hideScoresPref = false }) {
  const revision = useRelationshipRevision();
  const resource = useResource(`member:${ratingAccount()}:${memberId}:${revision}`, async () => {
    try { return await rankitApi.member(memberId); }
    catch (error) { if ([403,404].includes(error.status)) return { missing: true }; throw error; }
  });
  useBackClose(onClose);
  const data = resource.data;
  const member = data?.member;
  const dialog = useDialog({ onClose, label: member ? `@${member.username}` : "Profile" });

  const ov = data?.overlap;
  const pct = overlapPercent(ov);
  const host = document.querySelector(".rankit-app");
  const screen = (
    <div {...dialog} className="ri-member">
      <div className="ri-member-head">
        <button type="button" onClick={onClose} aria-label="Back"><ChevronLeft size={16} /></button>
        {member && <strong>@{member.username}</strong>}
        {member && !data.is_self && !data.blocked && (
          <ContentActions type="user" id={member.id} author={{ id: member.id, username: member.username }}
            className="ri-member-more" />
        )}
      </div>
      <div className="ri-member-body">
        {resource.error && <ErrorState error={resource.error} onRetry={resource.reload}
          body={resource.error.offline && !data ? 'Reconnect to load this profile. Private visibility must be checked online.' : undefined}/>}
        {!data && !resource.error && <Loading label="Loading the profile"><SkeletonRows count={3} height={72}/></Loading>}
        {data?.missing && <div className="ri-empty-state"><strong>This profile is not available</strong></div>}
        {member && data.blocked && <BlockedNote memberId={memberId} username={member.username} />}
        {member && !data.blocked && <>
          <div className="ri-member-id">
            <span className="ri-member-avatar" aria-hidden="true">{member.username.slice(0, 2).toUpperCase()}</span>
            <div>
              <h2>{member.username}</h2>
              {/* §7.1 — kademe, ilerleme DEGIL: ilerleme kisinin kendi profilinde. */}
              <small>Rank {data.rank?.tier} · {data.rank?.name}</small>
            </div>
          </div>

          {!data.is_self && (
            <RelationshipButton memberId={memberId} username={member.username} following={data.following} followsYou={data.follows_you}/>
          )}

          <div className="ri-member-stats">
            <div><strong>{data.stats.matches || 0}</strong><span>Logged</span></div>
            <div><strong>{data.stats.avg_rating != null ? Number(data.stats.avg_rating).toFixed(1) : "—"}</strong><span>Avg stars</span></div>
            <div><strong>{data.stats.classics || 0}</strong><span>Classics</span></div>
          </div>

          {ov && (
            <section className="ri-member-overlap">
              <div className="ri-chip-title">
                TASTE OVERLAP
                {/* §1 — sayi rengin yaninda. Taban altinda yuzde yok. */}
                {pct != null && (
                  <b style={{ color: RAMP[overlapStep(ov.pct) - 1] }}>{Math.round(ov.pct * 100)}%</b>
                )}
              </div>
              <div className="ri-member-overlap-card">
                {pct != null ? <>
                  <div className="ri-member-bars" aria-hidden="true">
                    {heatSteps(overlapStep(ov.pct)).map((c, i) => <span key={i} style={{ background: c }} />)}
                  </div>
                  <p>
                    You agree on {ov.agree} of the {ov.shared} matches you&apos;ve both rated.{" "}
                    {leaning(ov.bias, member.username)}
                  </p>
                </> : (
                  <p>
                    {ov.shared
                      ? `${ov.shared} match${ov.shared === 1 ? "" : "es"} rated by both of you so far — `
                      : "No matches rated by both of you yet — "}
                    the comparison opens at {Math.max(10, ov.min_shared || 10)}.
                  </p>
                )}
              </div>
            </section>
          )}

          {!!data.shelf?.length && (
            <section>
              <div className="ri-chip-title">RECENT SHELF</div>
              <div className="ri-member-shelf">
                {data.shelf.map((m) => (
                  <div key={m.entry_id} className="ri-card-slot" role="button" tabIndex={0}
                    aria-label={`${m.home.short} vs ${m.away.short}`}
                    onClick={() => onOpenMatch(m)}
                    onKeyDown={(e) => { if (!e.target.closest("button") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpenMatch(m); } }}>
                    <RedesignMatchCard {...shelfCard(m, hidesScore(hideScoresPref, m))} crestSize={32} cut={14} />
                  </div>
                ))}
              </div>
            </section>
          )}
          {!data.shelf?.length && (
            <p className="ri-companion-note" style={{ color: INK_3 }}>Nothing public on the shelf yet.</p>
          )}
        </>}
      </div>
    </div>
  );
  return host && !embedded ? createPortal(screen, host) : screen;
}
