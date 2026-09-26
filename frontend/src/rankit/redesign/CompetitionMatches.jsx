/* Ekran 3c — turnuvanın maçları.
 *
 * Eski hâli tek satırlık bir fikstür listesiydi: "ARS vs TOT · 3 – 1 ›".
 * 3c bunu bilinçli olarak KART yapıyor ve nedeni tek: RankIt'te bir maçın
 * skoru tek başına bilgi değil, topluluk puanı da bilgi. Kartın solundaki
 * şerit ve altındaki beş çubuk o puandır — listeyi tararken "hangi maç
 * izlenmeye değerdi" sorusu skordan önce cevaplanır.
 *
 * İki kart tipi var, üç değil:
 *   * Oynanmış — iki satır (arma + kulüp + skor), kaybeden sönük, altta ısı.
 *   * Oynanmamış — kesik çizgili, saat ve "Not played yet". Isı YOK; henüz
 *     puanlanacak bir şey olmadığı için boş bir ısı satırı yalan söylerdi.
 *
 * Bileşen kendi verisini çekiyor ve API'nin HAM şeklini tüketiyor: web ile
 * telefon kabuklarının kendi adaptörleri var (fromApiMatch / toCard) ve
 * birine bağlanmak bu ekranı tek yüzeye hapsederdi.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { SkeletonRows, Loading, ErrorState } from "./States";
import { hidesScore, readPrefs } from "../rankitPrefs";
import { Shield } from "./MatchCard";
import { communityHeat, communityRatingCount, communityVerdictCovered, heatSteps, inkFor, MIN_COMMUNITY_RATINGS } from "./heat";

const INK = "#eceded";
const INK_3 = "#9aa0a6";
const INK_4 = "#7f868b";
const LINE = "rgba(255,255,255,.09)";
const GOLD = "#ffb11b";

/* "SATURDAY 14 SEPTEMBER" — 3c gün başlıklarını böyle yazıyor. Yıl yok:
   bir turnuva sayfasında sezon zaten başlıkta. */
const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long", day: "numeric", month: "long",
});

function dayKey(iso) {
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? "" : DAY_FMT.format(when).toUpperCase();
}

function clock(iso) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/* Bir kulüp satırı. Kaybeden taraf sönük — 3c hem adı hem skoru soluk
   yazıyor, yalnızca skoru değil. */
function Side({ team, score, dim }) {
  return (
    <div className="ri-fixture-side">
      <Shield side={22} color={team.color || GOLD} ink={INK}
        abbr={team.short} crestUrl={team.crest_url} badgeScale={0.32} />
      <span style={{ color: dim ? INK_3 : INK }}>{team.name || team.short}</span>
      <b style={{ color: dim ? INK_3 : INK }}>{score ?? "–"}</b>
    </div>
  );
}

function Fixture({ match, onOpen, hideScores }) {
  const [communityRevealed, setCommunityRevealed] = useState(false);
  const hidden = hidesScore(hideScores, match);
  const finished = match.status === "finished";
  const played = finished || match.status === "live";
  const verdictCovered = finished && communityVerdictCovered(match, { revealed: communityRevealed });
  const rating = !finished || hidden || verdictCovered ? null : communityHeat(match);
  const count = finished ? communityRatingCount(match) : null;
  const tooFew = finished && !hidden && count !== null && count < MIN_COMMUNITY_RATINGS;
  const heat = inkFor(rating);

  if (!played) {
    return (
      <button type="button" className="ri-fixture ri-fixture-upcoming" onClick={() => onOpen(match)}>
        <div className="ri-fixture-line">
          <span>{match.home.short} vs {match.away.short}</span>
          <time>{clock(match.starts_at)}</time>
        </div>
        <small>Not played yet</small>
      </button>
    );
  }

  const home = hidden ? null : match.home_score, away = hidden ? null : match.away_score;
  return (
    <div role="button" tabIndex={0} className="ri-fixture" onClick={event => { if (!event.target.closest("button")) onOpen(match); }}
      onKeyDown={event => { if (!event.target.closest("button") && ["Enter", " "].includes(event.key)) { event.preventDefault(); onOpen(match); } }}>
      {/* Sol şerit = topluluk puanı. Puan yoksa çizgi rengi: "henüz kimse
          puanlamadı" ile "soğuk maç" aynı şey değil. */}
      <i aria-hidden="true" style={{ background: rating ? heat : LINE }} />
      <Side team={match.home} score={home} dim={home != null && away != null && home < away} />
      <Side team={match.away} score={away} dim={home != null && away != null && away < home} />
      <div className="ri-fixture-heat">
        <div>
          {heatSteps(rating).map((color, index) => (
            <span key={index} style={{ background: color, filter: verdictCovered ? "blur(3px)" : "none" }} />
          ))}
        </div>
        {/* §1 — sayı her zaman rengin yanında. */}
        {!verdictCovered && <b style={{ color: rating ? heat : INK_4 }}>{rating ? rating.toFixed(1) : tooFew ? "TOO FEW RATINGS" : "—"}</b>}
      </div>
      {verdictCovered && !hidden && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 9, marginTop: 8, color: INK_3, fontSize: 10 }}>
        <span>Rate it first — then see whether the room agreed with you.</span>
        <button type="button" onClick={event => { event.stopPropagation(); setCommunityRevealed(true); }}
          style={{ flex: "none", border: 0, padding: 0, background: "none", color: GOLD, font: "700 10px var(--font-logo)", cursor: "pointer" }}>REVEAL ANYWAY</button>
      </div>}
    </div>
  );
}

export default function CompetitionMatches({ competitionId, matchweeks = [], fixtures = [], onOpenMatch, hideScores = readPrefs().hideScores }) {
  // Açılışta oynanmakta olan hafta: tamamlanmamış ilk hafta, yoksa sonuncu.
  const current = useMemo(() => {
    const live = matchweeks.find((w) => w.finished < w.matches);
    return (live || matchweeks[matchweeks.length - 1] || null)?.stage || null;
  }, [matchweeks]);
  const [week, setWeek] = useState(null);
  const active = week || current;
  // Yüklenen haftayı VERİYLE BİRLİKTE tutuyoruz; "hangi hafta yükleniyor"
  // böyle türetiliyor ve efektin başında state sıfırlamak gerekmiyor.
  const [loaded, setLoaded] = useState({ stage: null, matches: [] });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!active || !competitionId) return undefined;
    let alive = true;
    rankitApi.competitionMatches(competitionId, active)
      .then((d) => alive && setLoaded({ stage: active, matches: d.matches || [] }))
      .catch(error => alive && setLoaded({ stage: active, matches: null, error }));
    return () => { alive = false; };
  }, [competitionId, active, retry]);

  const rows = active ? (loaded.stage === active ? loaded.matches : null) : fixtures;
  const error = active && loaded.stage === active ? loaded.error : null;

  // Gün gün grupla; 3c başlıkları maçların kendi tarihinden geliyor.
  const days = useMemo(() => {
    const out = [];
    for (const match of rows || []) {
      const key = dayKey(match.starts_at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.matches.push(match);
      else out.push({ key, matches: [match] });
    }
    return out;
  }, [rows]);

  return (
    <div className="ri-fixtures">
      {matchweeks.length > 0 && <>
        <div className="ri-chip-title">MATCHWEEK</div>
        <div className="ri-week-strip" role="tablist" aria-label="Matchweek">
          {matchweeks.map((w) => {
            // Geçmiş hafta sönük, oynanan hafta altın, gelecek hafta normal —
            // şerit boyunca sezonun nerede olduğu tek bakışta okunur.
            const done = w.finished >= w.matches;
            const on = active === w.stage;
            return (
              <button key={w.stage} role="tab" aria-selected={on}
                className={on ? "on" : done ? "done" : undefined}
                onClick={() => setWeek(w.stage)}
                title={`${w.stage} — ${w.matches} matches, ${w.finished} played`}>
                {/* Dar şeritte "Matchday 12" okunmaz; sayı taşınır. */}
                {(String(w.stage).match(/\d+/) || [w.stage])[0]}
              </button>
            );
          })}
        </div>
      </>}

      {error && <ErrorState error={error} onRetry={()=>{setLoaded({stage:null,matches:[]});setRetry(v=>v+1);}}/>}
      {rows === null && !error && <Loading label="Loading matches"><SkeletonRows count={3} height={128}/></Loading>}

      {days.map((day) => (
        <section key={day.key}>
          <div className="ri-chip-title">{day.key}</div>
          <div className="ri-fixture-stack">
            {day.matches.map((m) => <Fixture key={m.id} match={m} onOpen={onOpenMatch} hideScores={hideScores} />)}
          </div>
        </section>
      ))}

      {rows?.length === 0 && (
        <div className="ri-empty-state">
          <CalendarDays size={22} />
          <strong>{matchweeks.length ? "No matches in this round" : "No fixtures"}</strong>
          <span style={{ color: INK_4 }}>
            {matchweeks.length ? "Pick another matchweek above." : "The next scheduled matches will appear here."}
          </span>
        </div>
      )}
    </div>
  );
}
