/* Ekran 3e — "Search: one field, three kinds of result".
 *
 * Eski arama altı kutulu bir filtre satırı taşıyordu (All / Matches / Players /
 * Teams / Members / Lists) ve altında tek tip, ayrımsız bir liste vardı. 3e
 * bunun ikisini de bırakıyor: TEK alan, sonuçlar KENDİ türüne göre gruplu.
 * Filtre satırı, kullanıcıya aramadan önce ne aradığını sordurur; gruplama
 * aynı bilgiyi sonuç geldikten sonra, bedava verir.
 *
 * Her satırın altında KULLANICIYA ÖZEL bir cümle var ve hepsi gerçek veriden:
 *   * maç      — "14 Sep · in your diary"     (my_watched_date)
 *   * kulüp    — "Premier League · 12 rated"  (o kulüpten kaç maç puanladın)
 *   * koleksiyon — "7 of 12 · includes Arsenal"
 *
 * Halkadaki sayı YÜZDE. Tahmin değil: tasarımın konik gradyanı `.58turn`da
 * kesiliyor ve altyazısı "7 of 12" diyor — 7/12 = 0.583. Ortadaki "58" o.
 *
 * Tasarım üç grup çiziyor, burada beş var. PEOPLE ve PLAYERS altta duruyor
 * çünkü kaldırılırsa yerine geçecek bir yüzey yok: birini takip etmenin tek
 * yolu onu aramak. Üçlü vurgu korunuyor — sıra ve ağırlık tasarımın.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronRight } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { SkeletonRows, Loading, EmptyState } from "./States";
import { Shield, CrestPair } from "./MatchCard";
import { inkFor, RAMP, RAMP_OFF } from "./heat";

const INK = "#eceded";
const INK_4 = "#7f868b";
const GOLD = "#ffb11b";

const EMPTY = { matches: [], players: [], teams: [], members: [], lists: [] };

/* "14 Sep" — 3e maç altyazısında yıl yazmıyor. */
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function when(match) {
  const at = new Date(match.starts_at);
  if (Number.isNaN(at.getTime())) return "";
  if (match.status === "upcoming") {
    return at.toLocaleDateString([], { weekday: "long" }) + " " +
      at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return DAY.format(at);
}

/* Koleksiyon halkası. Yay ilerlemeyi çiziyor, ortadaki sayı yüzdesi —
   §1'in "renk tek başına anlam taşımaz" kuralı: yüzde halkada, "7 of 12"
   altyazıda. */
function ProgressRing({ done, total, size = 44 }) {
  const share = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className="ri-ring" style={{ width: size, height: size }} aria-hidden="true">
      {/* Yanmamis yay ısı çubuklarının sönük basamağıyla AYNI ton
          (RAMP_OFF). Tasarım burada .08 çiziyor ama palette .12 var ve
          ikisi aynı şeyi söylüyor — yeni bir gri açmanın gerekçesi yok. */}
      <i style={{ background: `conic-gradient(from -90deg,${RAMP[3]} 0turn,${RAMP[4]} ${share}turn,${RAMP_OFF} ${share}turn)` }} />
      <b>{Math.round(share * 100)}</b>
    </div>
  );
}

function Group({ title, children }) {
  return <section className="ri-find-group"><div className="ri-chip-title">{title}</div>{children}</section>;
}

export default function SearchSheet({ initialQuery = "", onClose, onOpenMatch, onOpenEntity }) {
  const [query, setQuery] = useState(initialQuery);
  // Sonucu SORGUSUYLA birlikte tutuyoruz: "hangi sorgu yükleniyor" böyle
  // türetiliyor ve efektin başında state sıfırlamak gerekmiyor.
  const [loaded, setLoaded] = useState({ q: "", data: EMPTY });
  const field = useRef(null);

  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      rankitApi.search(term, "All")
        .then((d) => alive && setLoaded({ q: term, data: { ...EMPTY, ...d } }))
        .catch(() => alive && setLoaded({ q: term, data: EMPTY }));
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [term]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const data = term.length < 2 ? EMPTY : (loaded.q === term ? loaded.data : null);
  const count = useMemo(() => (data
    ? data.matches.length + data.teams.length + data.lists.length + data.members.length + data.players.length
    : 0), [data]);

  return (
    <div className="ri-find">
      <div className="ri-find-bar">
        <label className="ri-find-field">
          <Search size={16} aria-hidden="true" />
          <input ref={field} autoFocus value={query} aria-label="Search RankIt"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Matches, clubs, collections" />
          {/* Temizle alanı KORUR, kapatmaz — 3e'de bunlar iki ayrı denetim. */}
          {!!query && (
            <button type="button" aria-label="Clear search"
              onClick={() => { setQuery(""); field.current?.focus(); }}>
              <X size={10} />
            </button>
          )}
        </label>
        <button type="button" className="ri-find-cancel" onClick={onClose}>Cancel</button>
      </div>

      <div className="ri-find-body">
        {term.length < 2 && (
          <p className="ri-find-hint">Type a club, a competition, or a collection.</p>
        )}
        {data === null && <Loading label="Searching"><SkeletonRows count={4}/></Loading>}

        {!!data?.matches?.length && (
          <Group title="MATCHES">
            <div className="ri-find-cards">
              {data.matches.map((m) => (
                <button key={m.id} type="button" className="ri-find-match" onClick={() => onOpenMatch(m)}>
                  <CrestPair home={m.home} away={m.away} />
                  <span>
                    {/* Baslikta skor yalnizca OYNANMISSA. Skorun VARLIGINA
                        bakmak yetmiyor: katalogda oynanmamis maclarin bir
                        kismi 0-0 tasiyor ve "Celtics 0 - 0 Bucks / Monday
                        01:00" diye bir satir cikiyordu. 3e oynanmamisi
                        "vs" ile yaziyor. */}
                    <strong>
                      {m.home.name || m.home.short}
                      {m.status === "upcoming" || !m.score ? " vs " : ` ${m.score} `}
                      {m.away.name || m.away.short}
                    </strong>
                    <small>
                      {when(m)}
                      {/* Kişisel satır yalnızca DOĞRUYSA yazılıyor. */}
                      {m.my_watched_date ? " · in your diary" : ""}
                    </small>
                  </span>
                  {/* Isı çubuğu yalnızca puan varken; yoksa hiç çizilmiyor —
                      boş bir çubuk "soğuk" der, oysa doğrusu "puan yok". */}
                  {m.community_rating != null && (
                    <i style={{ background: inkFor(m.community_rating) }}
                      title={`Community ${m.community_rating}`} />
                  )}
                </button>
              ))}
            </div>
          </Group>
        )}

        {!!data?.teams?.length && (
          <Group title="CLUBS">
            {data.teams.map((t) => (
              <button key={t.id} type="button" className="ri-find-row"
                onClick={() => onOpenEntity("team", t.id)}>
                <Shield side={31} color={t.color || GOLD} ink={INK} abbr={t.short_name} crestUrl={t.crest_url} badgeScale={0.26} />
                <span>
                  <strong>{t.name}</strong>
                  <small>{[t.competition, t.rated ? `${t.rated} rated` : null].filter(Boolean).join(" · ") || t.sport}</small>
                </span>
              </button>
            ))}
          </Group>
        )}

        {!!data?.lists?.length && (
          <Group title="COLLECTIONS">
            <div className="ri-find-cards">
              {data.lists.map((l) => (
                <button key={l.id} type="button" className="ri-find-collection"
                  onClick={() => onOpenEntity("list", l.id)}>
                  <ProgressRing done={l.rated || 0} total={l.total || 0} />
                  <span>
                    <strong>{l.title}</strong>
                    <small>
                      {`${l.rated || 0} of ${l.total || 0}`}
                      {/* Eşleşme sebebi yalnızca başlık DIŞINDA eşleştiyse. */}
                      {l.matched_team ? ` · includes ${l.matched_team}` : ""}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </Group>
        )}

        {!!data?.members?.length && (
          <Group title="PEOPLE">
            {data.members.map((u) => (
              <button key={u.id} type="button" className="ri-find-row"
                onClick={() => onOpenEntity("member", u.id)}>
                <span className="ri-find-avatar" aria-hidden="true">{u.username.slice(0, 2).toUpperCase()}</span>
                <span><strong>@{u.username}</strong><small>RankIt member</small></span>
                <ChevronRight size={15} color={INK_4} />
              </button>
            ))}
          </Group>
        )}

        {!!data?.players?.length && (
          <Group title="PLAYERS">
            {data.players.map((p) => (
              <button key={p.id} type="button" className="ri-find-row"
                onClick={() => onOpenEntity("player", p.id)}>
                <span className="ri-find-avatar" aria-hidden="true">{p.name.slice(0, 2).toUpperCase()}</span>
                <span><strong>{p.name}</strong><small>{p.sport}</small></span>
                <ChevronRight size={15} color={INK_4} />
              </button>
            ))}
          </Group>
        )}

        {data && term.length >= 2 && !count && (
          <EmptyState title={`Nothing matches “${term}”`}
            body="Try a club’s short name, or a competition."
            action="Clear search" onAction={() => { setQuery(""); field.current?.focus(); }} />
        )}
      </div>
    </div>
  );
}
