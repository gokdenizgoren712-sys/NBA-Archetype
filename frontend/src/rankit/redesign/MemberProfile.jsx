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
 *   * Konuşma balonu düğmesi yok. RankIt'te mesajlaşma yok; ne yapacağı bir
 *     mekanik kararı ve sahibine soruldu.
 *
 * Özel kayıtlar hiçbir sayıya girmiyor — ortalama, "Logged", ortaklık, raf:
 * hepsi izleyenin GÖREBİLDİĞİ kayıtlardan (bkz. api/rankit.py
 * _visible_entries_sql). Aksi hâlde "57'de 41 uyum" gizli puanları ele verir.
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { rankitApi } from "../rankitApi";
import RedesignMatchCard from "./MatchCard";
import { toMatchCardProps } from "./toMatchCardProps";
import { RAMP, heatSteps } from "./heat";
import { useBackClose } from "./backStack";

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
function shelfCard(m) {
  const props = toMatchCardProps({
    ...m,
    communityRating: m.community_rating,
    instantClassic: m.instant_classic,
    dominantTag: m.dominant_tag,
  }, { compact: true, scoreSize: 24, cardWidth: 155, crestSize: 32 });
  // Rafta damga ve yildizlar ONUN; isi toplulugun (tasarim: ARS 4.6 isi,
  // bes yildiz).
  return { ...props, classic: !!m.their_classic, ratings: stars(m.their_rating) };
}

export default function MemberProfile({ memberId, onClose, onOpenMatch }) {
  const [loaded, setLoaded] = useState({ id: null, data: null });
  const [busy, setBusy] = useState(false);
  useBackClose(onClose);

  const load = useCallback(() => {
    rankitApi.member(memberId)
      .then((d) => setLoaded({ id: memberId, data: d }))
      .catch(() => setLoaded({ id: memberId, data: { missing: true } }));
  }, [memberId]);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const data = loaded.id === memberId ? loaded.data : null;
  const member = data?.member;

  const follow = async () => {
    if (busy) return;
    setBusy(true);
    const was = data.following;
    setLoaded((v) => ({ ...v, data: { ...v.data, following: !was } }));
    try {
      const r = await rankitApi.follow({ target_type: "user", target_id: memberId, notify: false });
      setLoaded((v) => ({ ...v, data: { ...v.data, following: r.following } }));
    } catch {
      setLoaded((v) => ({ ...v, data: { ...v.data, following: was } }));
    } finally { setBusy(false); }
  };

  const ov = data?.overlap;
  const host = document.querySelector(".rankit-app");
  const screen = (
    <div className="ri-member" role="dialog" aria-modal="true" aria-label={member ? `@${member.username}` : "Profile"}>
      <div className="ri-member-head">
        <button type="button" onClick={onClose} aria-label="Back"><ChevronLeft size={16} /></button>
        {member && <strong>@{member.username}</strong>}
      </div>
      <div className="ri-member-body">
        {!data && <div className="ri-entity-loading">Loading…</div>}
        {data?.missing && <div className="ri-empty-state"><strong>This profile is not available</strong></div>}
        {member && <>
          <div className="ri-member-id">
            <span className="ri-member-avatar" aria-hidden="true">{member.username.slice(0, 2).toUpperCase()}</span>
            <div>
              <h2>{member.username}</h2>
              {/* §7.1 — kademe, ilerleme DEGIL: ilerleme kisinin kendi profilinde. */}
              <small>Rank {data.rank?.tier} · {data.rank?.name}</small>
            </div>
          </div>

          {!data.is_self && (
            <button type="button" className={`ri-member-follow${data.following ? " on" : ""}`}
              aria-pressed={!!data.following} disabled={busy} onClick={follow}>
              {data.following ? "Following" : "Follow"}
            </button>
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
                {ov.pct != null && (
                  <b style={{ color: RAMP[overlapStep(ov.pct) - 1] }}>{Math.round(ov.pct * 100)}%</b>
                )}
              </div>
              <div className="ri-member-overlap-card">
                {ov.pct != null ? <>
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
                    the comparison opens at {ov.min_shared}.
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
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenMatch(m); } }}>
                    <RedesignMatchCard {...shelfCard(m)} crestSize={32} cut={14} />
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
  return host ? createPortal(screen, host) : screen;
}
