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
import { SkeletonRows, Loading } from "./States";
import { Shield } from "./MatchCard";
import { heatSteps, inkFor } from "./heat";

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

function Fixture({ match, onOpen }) {
  const played = match.status === "finished" || match.status === "live";
  const rating = match.community_rating;
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

  const home = match.home_score, away = match.away_score;
  return (
    <button type="button" className="ri-fixture" onClick={() => onOpen(match)}>
      {/* Sol şerit = topluluk puanı. Puan yoksa çizgi rengi: "henüz kimse
          puanlamadı" ile "soğuk maç" aynı şey değil. */}
      <i aria-hidden="true" style={{ background: rating ? heat : LINE }} />
      <Side team={match.home} score={home} dim={home != null && away != null && home < away} />
      <Side team={match.away} score={away} dim={home != null && away != null && away < home} />
      <div className="ri-fixture-heat">
        <div>
          {heatSteps(rating).map((color, index) => (
            <span key={index} style={{ background: color }} />
          ))}
        </div>
        {/* §1 — sayı her zaman rengin yanında. */}
        <b style={{ color: rating ? heat : INK_4 }}>{rating ? rating.toFixed(1) : "—"}</b>
      </div>
    </button>
  );
}

export default function CompetitionMatches({ competitionId, matchweeks = [], fixtures = [], onOpenMatch }) {
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

  useEffect(() => {
    if (!active || !competitionId) return undefined;
    let alive = true;
    rankitApi.competitionMatches(competitionId, active)
      .then((d) => alive && setLoaded({ stage: active, matches: d.matches || [] }))
      .catch(() => alive && setLoaded({ stage: active, matches: [] }));
    return () => { alive = false; };
  }, [competitionId, active]);

  const rows = active ? (loaded.stage === active ? loaded.matches : null) : fixtures;

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

      {rows === null && <Loading label="Loading matches"><SkeletonRows count={3} height={128}/></Loading>}

      {days.map((day) => (
        <section key={day.key}>
          <div className="ri-chip-title">{day.key}</div>
          <div className="ri-fixture-stack">
            {day.matches.map((m) => <Fixture key={m.id} match={m} onOpen={onOpenMatch} />)}
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
