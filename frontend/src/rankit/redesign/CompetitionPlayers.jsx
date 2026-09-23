/* Ekran 3d — turnuvanın oyuncuları.
 *
 * GÜNCEL TAHTA (2026-09-23 denetimi): 3d artık "Player of the Match" ile
 * açılıyor — WON ve SHARE OF VOTES — ve kapanış cümlesi değişti: "Goals and
 * assists come from the feed — every app has them. Player of the Match is
 * ours: it exists only because people who watched voted. Share is how
 * convincingly they won it." Uç bunu zaten dönüyordu (`_potm_leaders`, §10.3);
 * ön yüz hiç istemiyordu. Aşağıdaki eski not sağlayıcı cetvelleri için geçerli.
 *
 * Bu sekme daha önce "popular players" diyordu ve sıralaması bizim POTM /
 * Respect oylarımızdı. 3d başka bir şey istiyor: SEZON CETVELİ — Goals,
 * Assists, Minutes. İkisi karıştırılmamalı, çünkü ekranın kendi kapanış
 * cümlesi tam olarak bunu söylüyor:
 *
 *     "Players are a reference list. RankIt rates matches, not performances."
 *
 * Yani buradaki sıra bizim oylarımızla oynanmaz; sağlayıcının yayımladığı
 * cetveldir (bkz. rankit_live_sync.refresh_player_stats). Oylarımız maçın
 * kendi sayfasında kalıyor.
 *
 * Basketbol turnuvalarında cetvel yayımlayan bir kaynak yok; sunucu
 * `available: []` dönüyor ve sekme bunu AÇIKÇA söylüyor ("This competition
 * does not publish player statistics") — boş bir liste gösterip kullanıcıyı
 * "veri gelmedi mi, hata mı" diye bırakmaktansa.
 */
import { useState } from "react";
import { CircleUserRound } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { SkeletonRows, Loading, ErrorState } from "./States";
import { useResource } from "./useResource";
import { Shield } from "./MatchCard";

const INK = "#eceded";
const INK_3 = "#9aa0a6";
const INK_4 = "#7f868b";
const GOLD = "#ffb11b";

const LABELS = { potm: "Player of the Match", goals: "Goals", assists: "Assists", minutes: "Minutes" };

/* Dakika dört haneye çıkar ("1,240"); gol tek haneli kalır. Ondalık yok:
   cetvelin hiçbiri kesirli değil. */
const fmt = (value) => Math.round(Number(value) || 0).toLocaleString();

export default function CompetitionPlayers({ competitionId, onOpenPlayer }) {
  // null = sunucunun ilk cetveli (POTM varsa o).
  const [stat, setStat] = useState(null);
  // Yüklenen cetveli ANAHTARIYLA tutuyoruz: "hangi cetvel yükleniyor" böyle
  // türetiliyor, efektin başında state sıfırlamak gerekmiyor.
  const { data, error, loading, reload } = useResource(`${competitionId}:${stat}`,
    () => rankitApi.competitionPlayers(competitionId, stat), { enabled: !!competitionId });
  const tabs = data?.available || [];
  const active = stat ?? data?.stat ?? null;
  const potm = data?.stat === "potm";
  const minVotes = data?.min_votes ?? 20;

  if (error && !data) return <ErrorState error={error} onRetry={reload}/>;

  if (data && !tabs.length) {
    return (
      <div className="ri-empty-state">
        <CircleUserRound size={22} />
        <strong>No season leaderboard</strong>
        <span style={{ color: INK_4 }}>Season player statistics are not available in RankIt for this competition yet.</span>
      </div>
    );
  }

  return (
    <div className="ri-leaderboard">
      {error && <ErrorState error={error} onRetry={reload}/>}
      {/* Cetvel seçicileri. Isı DEĞİL — altın, çünkü bu bir seçim, veri değil
          (§1: ısı yalnızca veri görselleştirmesi). */}
      <div className="ri-stat-pills" role="tablist" aria-label="Statistic">
        {(tabs.length ? tabs : ["goals", "assists", "minutes"]).map((key) => (
          <button key={key} type="button" role="tab"
            aria-selected={active === key}
            className={active === key ? "on" : undefined} onClick={() => setStat(key)}>
            {LABELS[key] || key}
          </button>
        ))}
      </div>

      {loading && !data && <Loading label="Loading the leaderboard"><SkeletonRows count={6} height={60} gap={6} radius={10}/></Loading>}

      {!!data?.players?.length && <>
        <div className={`ri-leaderboard-head${potm ? " is-potm" : ""}`} aria-hidden="true">
          <span>#</span><span>PLAYER</span>
          {potm ? <><span>WON</span><span>SHARE OF VOTES</span></> : <span>{(LABELS[data.stat] || data.stat).toUpperCase()}</span>}
        </div>
        {data.players.map((row, index) => (
          <button key={`${row.rank}-${row.name}`} type="button" className={`ri-leaderboard-row${potm ? " is-potm" : ""}`}
            disabled={!row.player_id}
            onClick={() => row.player_id && onOpenPlayer?.(row.player_id)}>
            {/* Sıra numarası PAYLAŞILIR: aynı değerde iki oyuncu aynı sırada.
                Satır indeksini yazmak "2. Haaland"ı 3 gol ile 1. Isak'ın
                altına iterdi ve eşitliği gizlerdi. */}
            <span className="ri-leaderboard-rank">{row.rank ?? index + 1}</span>
            <Shield side={31} color={row.team_color || GOLD} ink={INK}
              abbr={row.team_short || (row.team_name || "").slice(0, 3).toUpperCase()}
              crestUrl={row.crest_url} badgeScale={0.26} />
            <span className="ri-leaderboard-who">
              <strong>{row.name}</strong>
              <small>
                {row.team_short || row.team_name || "—"}
                {row.position ? ` · ${row.position}` : ""}
              </small>
            </span>
            {potm
              ? <>
                <b className="ri-leaderboard-value">{fmt(row.won)}</b>
                {/* §5.5: oy payı 20 oyun altında söylenmez. */}
                {row.votes >= minVotes
                  ? <span className="ri-leaderboard-share" aria-label={`${Math.round(row.share * 100)}% of votes`}>
                      <b>{Math.round(row.share * 100)}%</b><i><i style={{ width: `${Math.round(row.share * 100)}%` }} /></i></span>
                  : <span className="ri-leaderboard-share is-few">TOO FEW VOTES</span>}
              </>
              : <b className="ri-leaderboard-value">{fmt(row.value)}</b>}
          </button>
        ))}
        {potm
          ? <p className="ri-leaderboard-note" style={{ color: INK_4 }}>
              Goals and assists come from the feed — every app has them. <strong>Player of the Match is ours</strong>: it
              exists only because people who watched voted. <strong>Share</strong> is how convincingly they won it.
            </p>
          : <p className="ri-leaderboard-note" style={{ color: INK_4 }}>
              Players are a reference list. RankIt rates matches, not performances.
            </p>}
      </>}

      {data && !data.players?.length && (
        <div className="ri-empty-state">
          <CircleUserRound size={22} />
          <strong>Nothing here yet</strong>
          <span style={{ color: INK_3 }}>The season leaderboard fills in once matches are played.</span>
        </div>
      )}
    </div>
  );
}
