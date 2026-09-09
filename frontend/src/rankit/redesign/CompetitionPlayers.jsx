/* Ekran 3d — turnuvanın oyuncuları.
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
import { useEffect, useState } from "react";
import { CircleUserRound } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { Shield } from "./MatchCard";

const INK = "#eceded";
const INK_3 = "#9aa0a6";
const INK_4 = "#7f868b";
const GOLD = "#ffb11b";

const LABELS = { goals: "Goals", assists: "Assists", minutes: "Minutes" };

/* Dakika dört haneye çıkar ("1,240"); gol tek haneli kalır. Ondalık yok:
   cetvelin hiçbiri kesirli değil. */
const fmt = (value) => Math.round(Number(value) || 0).toLocaleString();

export default function CompetitionPlayers({ competitionId, onOpenPlayer }) {
  const [stat, setStat] = useState("goals");
  // Yüklenen cetveli ANAHTARIYLA tutuyoruz: "hangi cetvel yükleniyor" böyle
  // türetiliyor, efektin başında state sıfırlamak gerekmiyor.
  const [loaded, setLoaded] = useState({ key: null, data: null });

  useEffect(() => {
    if (!competitionId) return undefined;
    let alive = true;
    const key = `${competitionId}:${stat}`;
    rankitApi.competitionPlayers(competitionId, stat)
      .then((d) => alive && setLoaded({ key, data: d }))
      .catch(() => alive && setLoaded({ key, data: { available: [], players: [] } }));
    return () => { alive = false; };
  }, [competitionId, stat]);

  const data = loaded.key === `${competitionId}:${stat}` ? loaded.data : null;
  const tabs = data?.available || [];

  if (data && !tabs.length) {
    return (
      <div className="ri-empty-state">
        <CircleUserRound size={22} />
        <strong>No season leaderboard</strong>
        <span style={{ color: INK_4 }}>This competition does not publish player statistics.</span>
      </div>
    );
  }

  return (
    <div className="ri-leaderboard">
      {/* Cetvel seçicileri. Isı DEĞİL — altın, çünkü bu bir seçim, veri değil
          (§1: ısı yalnızca veri görselleştirmesi). */}
      <div className="ri-stat-pills" role="tablist" aria-label="Statistic">
        {(tabs.length ? tabs : ["goals", "assists", "minutes"]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={stat === key}
            className={stat === key ? "on" : undefined} onClick={() => setStat(key)}>
            {LABELS[key] || key}
          </button>
        ))}
      </div>

      {!data && <div className="ri-entity-loading">Loading…</div>}

      {!!data?.players?.length && <>
        <div className="ri-leaderboard-head" aria-hidden="true">
          <span>#</span><span>PLAYER</span><span>{(LABELS[data.stat] || data.stat).toUpperCase()}</span>
        </div>
        {data.players.map((row, index) => (
          <button key={`${row.rank}-${row.name}`} type="button" className="ri-leaderboard-row"
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
            <b className="ri-leaderboard-value">{fmt(row.value)}</b>
          </button>
        ))}
        <p className="ri-leaderboard-note" style={{ color: INK_4 }}>
          Players are a reference list. RankIt rates matches, not performances.
        </p>
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
