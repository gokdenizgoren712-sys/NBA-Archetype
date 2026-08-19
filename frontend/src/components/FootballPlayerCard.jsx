import { useState, useRef, useEffect } from "react";
import { api } from "../api";
import { MiniCareerChart } from "./PlayerCard";
import "./PlayerCard.css";

// ── Futbol oyuncu kartı ──────────────────────────────────────────────────────
// Basketbol kartıyla AYNI prensip: tıklayınca pop-up değil, aşağı doğru açılan
// çekmece; içinde sekmeler. Stil PlayerCard.css'ten devralınıyor (pcard-*),
// böylece iki spor görsel olarak tek sistem gibi duruyor. İçerik tamamen
// futbola özgü — ortak olan sadece kabuk.

const PHASE_COLOR = {
  gk:  "#F2C14E",
  def: "#4C9BE8",
  mid: "#3FB08C",
  fwd: "#E8654C",
};
const PHASE_LABEL = { gk: "Goalkeeper", def: "Defence", mid: "Midfield", fwd: "Attack" };

// Sekmelerdeki ham metrikler — arketiplere göre DEĞİL, futbol aksiyon türüne
// göre gruplu. (Etiketleme çalışmasında da bu nötr gruplama kullanıldı.)
const STAT_GROUPS = {
  gk: [
    ["End product", [["CLEAN_SHEETS", "Clean sheets"], ["clean_sheet_pct", "Clean sheet %"], ["goals_conceded_90", "Goals conceded"]]],
    ["Shot stopping", [["saves_90", "Saves"], ["save_pct", "Save %"], ["goals_prevented_90", "Goals prevented"], ["saves_inside_box_90", "Saves in box"]]],
    ["Off his line",  [["keeper_sweeper_90", "Sweeper actions"], ["keeper_high_claim_90", "High claims"], ["punches_90", "Punches"]]],
    ["Distribution",  [["accurate_passes_att_90", "Passes"], ["pass_pct", "Pass %"], ["long_share", "Long ball share"], ["player_throws_90", "Throws"]]],
  ],
  def: [
    ["End product", [["CLEAN_SHEETS", "Clean sheets"], ["clean_sheet_pct", "Clean sheet %"], ["goals_90", "Goals"], ["assists_90", "Assists"]]],
    ["Passing",  [["accurate_passes_att_90", "Passes"], ["pass_pct", "Pass %"], ["passes_into_final_third_90", "Into final third"], ["long_pct", "Long ball %"]]],
    ["Defending", [["tackles_90", "Tackles"], ["interceptions_90", "Interceptions"], ["clearances_90", "Clearances"], ["headed_clearance_90", "Headed clear."], ["blocked_shots_90", "Blocks"], ["dribbled_past_90", "Dribbled past"]]],
    ["Duels",    [["aerials_won_90", "Aerials won"], ["aerial_pct", "Aerial %"], ["ground_duels_won_90", "Ground duels"], ["ground_duel_pct", "Ground duel %"]]],
    ["Attacking", [["accurate_crosses_att_90", "Crosses"], ["cross_pct", "Cross %"], ["touches_opp_box_90", "Opp. box touches"], ["expected_assists_90", "xA"]]],
    ["Physical", [["physical_metrics_distance_covered_90", "Distance"], ["physical_metrics_number_of_sprints_90", "Sprints"], ["physical_metrics_topspeed", "Top speed"]]],
  ],
  mid: [
    ["End product", [["goals_90", "Goals"], ["assists_90", "Assists"], ["CLEAN_SHEETS", "Clean sheets"]]],
    ["Passing",  [["accurate_passes_att_90", "Passes"], ["pass_pct", "Pass %"], ["passes_into_final_third_90", "Into final third"], ["long_balls_accurate_90", "Long balls"], ["long_pct", "Long ball %"]]],
    ["Creating", [["chances_created_90", "Chances created"], ["big_chances_created_90", "Big chances"], ["expected_assists_90", "xA"], ["assists_90", "Assists"]]],
    ["Carrying", [["dribbles_succeeded_90", "Dribbles"], ["dribble_pct", "Dribble %"], ["dispossessed_90", "Dispossessed"], ["touches_90", "Touches"]]],
    ["Defending", [["tackles_90", "Tackles"], ["interceptions_90", "Interceptions"], ["recoveries_90", "Recoveries"], ["ground_duels_won_90", "Ground duels"]]],
    ["Physical", [["physical_metrics_distance_covered_90", "Distance"], ["physical_metrics_number_of_sprints_90", "Sprints"], ["physical_metrics_topspeed", "Top speed"]]],
  ],
  fwd: [
    ["End product", [["goals_90", "Goals"], ["assists_90", "Assists"]]],
    ["Shooting", [["expected_goals_non_penalty_90", "npxG"], ["goals_90", "Goals"], ["total_shots_90", "Shots"], ["npxg_per_shot", "npxG / shot"], ["touches_opp_box_90", "Opp. box touches"]]],
    ["Creating", [["expected_assists_90", "xA"], ["chances_created_90", "Chances created"], ["big_chances_created_90", "Big chances"], ["assists_90", "Assists"]]],
    ["Dribbling", [["dribbles_succeeded_90", "Dribbles"], ["dribble_pct", "Dribble %"], ["was_fouled_90", "Fouls won"], ["dispossessed_90", "Dispossessed"]]],
    ["Crossing", [["accurate_crosses_att_90", "Crosses"], ["cross_pct", "Cross %"], ["corners_90", "Corners"]]],
    ["Duels & press", [["aerials_won_90", "Aerials won"], ["aerial_pct", "Aerial %"], ["recoveries_90", "Recoveries"], ["tackles_90", "Tackles"]]],
    ["Physical", [["physical_metrics_distance_covered_90", "Distance"], ["physical_metrics_number_of_sprints_90", "Sprints"], ["physical_metrics_topspeed", "Top speed"]]],
  ],
};

const PCT_KEYS = new Set(["pass_pct", "save_pct", "aerial_pct", "cross_pct",
  "ground_duel_pct", "dribble_pct", "long_pct", "long_share", "sot_pct",
  "clean_sheet_pct"]);
// Sayim (per-90 degil, sezon toplami)
const COUNT_KEYS = new Set(["CLEAN_SHEETS"]);

const fmt = (k, v) => {
  if (v == null || Number.isNaN(v)) return "—";
  if (COUNT_KEYS.has(k)) return String(Math.round(v));   // sezon toplamı, per-90 değil
  if (PCT_KEYS.has(k)) return `${Math.round(v * 100)}%`;
  if (k === "physical_metrics_topspeed") return `${v.toFixed(1)}`;
  return v >= 10 ? v.toFixed(1) : v.toFixed(2);
};

const initials = name => (name || "")
  .split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

// Faz içi radar — oyuncunun kendi fazındaki arketip skorları
function FitRadar({ scores, accent }) {
  const names = Object.keys(scores);
  const n = names.length;
  if (n < 3) return null;
  const cx = 96, cy = 92, maxR = 66;
  const at = (i, r) => {
    const a = (-90 + i * (360 / n)) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const vals = names.map(k => Math.max(0, Math.min(1, scores[k] ?? 0)));
  const poly = vals.map((v, i) => at(i, maxR * v).join(",")).join(" ");
  return (
    <svg viewBox="0 0 192 184" className="pcard-radar" role="img" aria-label="Archetype fit radar">
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f} points={names.map((_, i) => at(i, maxR * f).join(",")).join(" ")}
          fill="none" stroke="var(--border)" strokeWidth="0.6" />
      ))}
      {names.map((_, i) => {
        const [x, y] = at(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="0.5" />;
      })}
      <polygon points={poly} fill={accent + "38"} stroke={accent} strokeWidth="1.4" />
      {names.map((k, i) => {
        const [x, y] = at(i, maxR + 13);
        return (
          <text key={k} x={x} y={y} fontSize="6.4" textAnchor="middle" dominantBaseline="middle"
            fill="var(--text-faint)">{k.length > 15 ? k.slice(0, 14) + "…" : k}</text>
        );
      })}
    </svg>
  );
}


// ── Fotoğraf atfı ────────────────────────────────────────────────────────────
// Görsellerin büyük çoğunluğu CC BY / CC BY-SA; atıf lisansın koşulu, süs
// değil. Harita tek seferde çekiliyor ve modül düzeyinde paylaşılıyor —
// kart başına istek 1717 küçük çağrı demekti.
let _creditsCache = null;
let _creditsPromise = null;
const _creditSubs = new Set();

let _cdn = null;      // {cloud_name, ids}
let _layouts = {};    // {player_id: {scale,x,y}} — admin düzeltmeleri

function usePhotoCredit(playerId) {
  const [, force] = useState(0);
  useEffect(() => {
    if (_creditsCache) return;
    if (!_creditsPromise) {
      _creditsPromise = fetch("/api/football/photo-credits", { cache: "no-store" })
        .then(r => r.json())
        .then(d => { _creditsCache = d.credits || {}; _cdn = d.cloudinary || null;
                     _layouts = d.layouts || {}; })
        .catch(() => { _creditsCache = {}; })
        .finally(() => { _creditSubs.forEach(f => f(n => n + 1)); _creditSubs.clear(); });
    }
    _creditSubs.add(force);
    return () => _creditSubs.delete(force);
  }, [force]);
  return _creditsCache ? _creditsCache[String(playerId)] : null;
}

// Fotoğrafın adresi. Sıra: Cloudinary (CDN + otomatik format/boyut) → yerel
// cutout → ham fotoğraf. Cloudinary haritası boşken hiçbir şey değişmiyor,
// yani yükleme yapılmadan da site çalışıyor.
// h_472: kart 236px yükseklikte gösteriyor, 2x ekran için iki katı.
function photoSrc(playerId, hasCut) {
  const id = _cdn?.ids?.[String(playerId)];
  if (id && _cdn.cloud_name) {
    return `https://res.cloudinary.com/${_cdn.cloud_name}` +
           `/image/upload/f_auto,q_auto,h_472/${id}`;
  }
  return hasCut
    ? `/football-cutouts/${playerId}.webp`
    : `/football-photos/${playerId}.jpg`;
}

export default function FootballPlayerCard({ player, rank, season }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState(player.qualified === false ? "stats" : "fit");
  const [career, setCareer] = useState(null);
  const [careerLoading, setCareerLoading] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const cardRef = useRef(null);

  const phase = player.PHASE || "mid";
  const accent = PHASE_COLOR[phase] || "#3FB08C";
  const arch = player.primary_arch;
  // Dakika eşiğinin altındaki oyuncu: kartı var ama skoru yok (persantil
  // havuzuna da girmedi). NBA kartındaki "small sample" etiketiyle aynı fikir.
  const qualified = player.qualified !== false;

  // Faz içindeki tüm arketip skorları (API score_* olarak döner)
  const fits = {};
  Object.keys(player).forEach(k => {
    if (k.startsWith("score_") && player[k] != null) fits[k.slice(6)] = player[k];
  });
  const fitList = Object.entries(fits).sort((a, b) => b[1] - a[1]);

  const loadCareer = async () => {
    if (career || careerLoading) return;
    setCareerLoading(true);
    try {
      const r = await api.footballCareer(player.PLAYER_ID);
      setCareer(r.seasons || []);
    } catch { setCareer([]); }
    setCareerLoading(false);
  };

  const selectTab = k => {
    setTab(k);
    if (k === "career") loadCareer();
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) requestAnimationFrame(() =>
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const credit = usePhotoCredit(player.PLAYER_ID);
  // Arka planı kaldırılmış sürüm varsa onu göster, yoksa ham fotoğrafa düş.
  // credit.modified yalnızca cutout üretilmiş oyuncularda dolu — kaynağı
  // bu belirliyor ki kartta "edited" yazarken ham görsel gösterilmesin.
  const hasCut = !!credit?.modified;
  const photo = photoSrc(player.PLAYER_ID, hasCut);
  // Admin bu oyuncu için yerleşim kaydettiyse onu uygula. Cutout'lar farklı
  // oranlarda kesildiği için tek bir kural hepsine oturmuyor.
  const lay = _layouts[String(player.PLAYER_ID)];
  const photoStyle = lay
    ? { objectPosition: `${lay.x}% ${lay.y}%`, transform: `scale(${lay.scale})`,
        transformOrigin: `${lay.x}% ${lay.y}%` }
    : undefined;
  const mins = Math.round(player.MINUTES_TOTAL || 0);

  // Karttaki üç hızlı istatistik — faza göre değişir
  // Karttaki üç hızlı istatistik — SAF ÇIKTI odaklı (kullanıcı kararı).
  // Neden xG/xA değil: xG ailesi FotMob'da yalnızca 2020/21'den itibaren var,
  // daha eski sezonlarda kartın üç kutusu birden boş görünüyordu. Gol, asist,
  // clean sheet ve kurtarış ise 2016/17'den beri dolu — arşivin tamamında
  // çalışan tek set bu. (Detaylı xG kırılımı Stats sekmesinde duruyor.)
  //
  // Defans faza değil POZİSYONA göre ayrılıyor: bir stoperle bir bekin
  // ürettiği çıktı aynı değil.
  const quick = {
    gk:  [["CLEAN_SHEETS", "CS"], ["save_pct", "SAVE%"], ["saves_90", "SAVES"]],
    def: player.POSITION === "CB"
      ? [["tackles_90", "TKL"], ["aerials_won_90", "AER"], ["CLEAN_SHEETS", "CS"]]
      : [["tackles_90", "TKL"], ["interceptions_90", "INT"], ["assists_90", "AST"]],
    mid: [["accurate_passes_att_90", "PASS"], ["chances_created_90", "CHC"], ["assists_90", "AST"]],
    fwd: [["goals_90", "G"], ["assists_90", "AST"], ["total_shots_90", "SH"]],
  }[phase];

  return (
    <div className="pcard-stage fb">
      <div ref={cardRef}
        className={`pcard${expanded ? " pcard-expanded" : ""}`}
        style={{ "--accent": accent, "--accent-a": accent + "48",
                 "--accent-b": accent + "30", "--accent-line": accent + "66" }}>
        <div className="pcard-holo" />
        <div className="pcard-foil" />
        <div className="pcard-grain" />

        <div className="pcard-top">
          <span className={`pcard-rank${rank != null && rank <= 3 ? " top" : ""}`}>
            {rank != null ? `#${rank}` : ""}
          </span>
          {/* Rozet ARKETİP UYUMU değil OYUNCU KALİTESİ gösterir (overall_score):
              0.60·(en iyi K arketip skoru ^1.5) + 0.40·(FotMob reyting persantili).
              Basketbol kartıyla aynı ayrım — orada da rozet BPM harmanlı
              overall_score, arketip skoru değil. */}
          {qualified
            ? <span className="pcard-rating">{Math.round((player.overall_score ?? 0) * 100)}</span>
            : <span className="pcard-gp">{Math.round(player.MINUTES_TOTAL || 0)}′</span>}
        </div>

        <div className="pcard-photo">
          <div className="pcard-photo-glow" />
          <span className="pcard-toppct">{PHASE_LABEL[phase]}</span>
          {imgOk
            ? <img src={photo} alt="" className="pcard-photo-img" loading="lazy"
                style={photoStyle}
                onError={() => setImgOk(false)}
                // Vite dev sunucusu eksik dosyada 404 değil SPA index.html'i
                // 200 ile döndürüyor -> onError HİÇ tetiklenmiyor, kart ne
                // fotoğraf ne avatar gösteriyordu. Yüklendi sayılan yanıtın
                // gerçekten görsel olup olmadığını naturalWidth ile doğruluyoruz.
                onLoad={e => { if (!e.currentTarget.naturalWidth) setImgOk(false); }} />
            : <div className="pcard-photo-fallback"
                style={{ display: "flex", alignItems: "center", justifyContent: "center",
                         fontSize: 30, fontWeight: 800, color: accent + "77", letterSpacing: ".06em" }}>
                {initials(player.PLAYER_NAME)}
              </div>}
          <div className="pcard-photo-fade" />
          {/* Lisans koşulu: eser sahibi + lisans, ve türevse değiştirildiği
              notu. Fotoğrafın üstünde duruyor ki görselden ayrı düşmesin. */}
          {imgOk && credit && (credit.artist || credit.license) && (
            <span className="pcard-photo-credit" title={
              [credit.artist, credit.license, credit.modified].filter(Boolean).join(" · ")}>
              {credit.artist || "Unknown"}
              {credit.license ? ` · ${credit.license}` : ""}
              {hasCut ? " · edited" : ""}
            </span>
          )}
        </div>

        <div className="pcard-nameband">
          <h3 className="pcard-name">{player.PLAYER_NAME}</h3>
          <div className="pcard-meta fb-team">
            <span className="pcard-team">
              {player.TEAM} · {player.POSITION}{season ? ` · ${season}` : ""}
            </span>
          </div>
          <div className="pcard-meta fb-arch">
            {arch
              ? <span className="pcard-arch">{arch}</span>
              : <span className="pcard-arch" style={{ color: "var(--text-faint)" }}>unrated</span>}
          </div>
        </div>

        <div className="pcard-stats">
          <div className="pcard-stat-row">
            {quick.map(([k, l], i) => (
              <div key={k}>
                <div className={`pcard-stat-val${i === 0 ? " hi" : ""}`}>{fmt(k, player[k])}</div>
                <div className="pcard-stat-lbl">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Kapalı kartta YALNIZCA veri geçerliliği uyarısı kalır. "between
            roles" buradan kaldırıldı: bir nüans etiketiydi ama kartların
            yüksekliğini değiştirip ızgarayı bozuyordu. Açık kartta,
            arketip barlarının hemen altında gösteriliyor — asıl anlamını
            orada zaten kazanıyor. */}
        {!qualified && (
          <div className="pcard-tags">
            <span className="pcard-sample-tag">not enough minutes played</span>
          </div>
        )}

        <div className="pcard-peek" onClick={e => { e.stopPropagation(); toggle(); }}>
          <span>Full Profile</span><span className="pcard-chev">▾</span>
        </div>

        <div className="pcard-expand-wrap">
          <div className="pcard-expand-inner">
            <div className="pcard-detail">
              <div className="pcard-tabbar" onClick={e => e.stopPropagation()}>
                {(qualified
                  ? [["fit", "Fit"], ["stats", "Stats"], ["radar", "Radar"], ["career", "Career"]]
                  : [["stats", "Stats"], ["career", "Career"]])
                  .map(([k, l]) => (
                    <button key={k} className={tab === k ? "active" : ""}
                      onClick={() => selectTab(k)}>{l}</button>
                  ))}
              </div>

              <div className="pcard-tabcontent" onClick={e => e.stopPropagation()}>
                {tab === "fit" && (
                  <>
                    <div className="pcard-section-lbl">
                      Archetype fit — this player vs the {player.LEAGUE} {PHASE_LABEL[phase].toLowerCase()} pool
                    </div>
                    <div className="pcard-arch-note" style={{ marginTop: -2 }}>
                      Card badge is overall quality ({Math.round((player.overall_score ?? 0) * 100)});
                      the bars below are how closely he matches each role.
                    </div>
                    {/* NBA kartıyla aynı tipografi: .lbl 9.5px, .val 10px.
                        Tek fark sol sütun genişliği — futbol arketip adları
                        ("Overlapping Fullback") NBA'inkilerden ("Engine") çok
                        daha uzun, 58px'e sığmıyor. */}
                    {fitList.map(([name, v]) => (
                      <div key={name}
                        className={`pcard-arch-item${name === arch ? " primary" : ""}`}
                        style={{ gridTemplateColumns: "104px 1fr 22px" }}>
                        <span className="lbl">{name}</span>
                        <span className="pcard-arch-track">
                          <div style={{ width: `${Math.round(v * 100)}%` }} />
                        </span>
                        <span className="val">{Math.round(v * 100)}</span>
                      </div>
                    ))}
                    {/* Rol netliği — kapalı karttan buraya taşındı, barların
                        hemen altında: "bu bar dağılımı ne anlama geliyor?"
                        sorusunun cevabı tam da burada duruyor. */}
                    <div className="pcard-arch-note" style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                      <span className="pcard-sample-tag" style={{ flexShrink: 0, marginTop: 1 }}>
                        {player.confidence}
                      </span>
                      <span>
                        {player.confidence === "prototype"
                          ? "A clear example of this role."
                          : player.confidence === "clear"
                            ? "Fits this role, with a secondary side."
                            : `Sits between ${arch} and ${player.alt_arch} — the dictionary is still being tested on players like this.`}
                      </span>
                    </div>
                  </>
                )}

                {tab === "stats" && (
                  <>
                    {(STAT_GROUPS[phase] || []).map(([label, rows]) => {
                      const shown = rows.filter(([k]) => player[k] != null);
                      if (!shown.length) return null;
                      return (
                        <div key={label} style={{ marginBottom: 10 }}>
                          <div className="pcard-section-lbl">{label}</div>
                          <div className="pcard-sw-grid">
                            {shown.map(([k, l]) => (
                              <span key={k} className="pcard-sw-chip">
                                {l} <b style={{ color: accent }}>{fmt(k, player[k])}</b>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="pcard-arch-note">
                      Per 90 minutes · {mins} minutes played, {player.APPS || 0} appearances
                      {!qualified && (
                        <> — below the {player.min_minutes}′ cut-off for this league,
                        so no archetype is assigned and this player is left out of the
                        percentile pool.</>
                      )}
                    </div>
                  </>
                )}

                {tab === "radar" && (
                  <>
                    <FitRadar scores={fits} accent={accent} />
                    <div className="pcard-radar-summary">
                      <span style={{ color: accent, fontWeight: 700 }}>{arch}</span>
                      {" · "}
                      <span style={{ color: accent, fontWeight: 700 }}>
                        {Math.round((player.primary_score ?? 0) * 100)}
                      </span>
                      {" fit"}
                      {player.alt_arch && <> · then {player.alt_arch}</>}
                    </div>
                  </>
                )}

                {tab === "career" && (
                  careerLoading ? <div className="pcard-loading">Loading…</div>
                    : !career?.length
                      ? <div className="pcard-empty">
                          Only {season} is loaded so far — earlier seasons are still being collected.
                        </div>
                      : (
                        <>
                          {/* NBA kartıyla AYNI iskelet: önce gidişat grafiği,
                              sonra sezon satırları. Grafik bileşeni de ortak
                              (PlayerCard'tan import) — iki spor tek çizim. */}
                          <div className="pcard-section-lbl">Overall Trajectory</div>
                          <MiniCareerChart seasons={career.slice().reverse()} />

                          <div className="pcard-section-lbl" style={{ marginTop: 10 }}>Season-by-Season</div>
                          {career.map(s => {
                            const score = s.overall_score != null ? Math.round(s.overall_score * 100) : null;
                            const isCur = s.SEASON === (career[0]?.SEASON);
                            // Faz başına anlamlı çizgi: kaleci/defans temiz
                            // çıkışla, orta saha ve hücum gol/asistle okunur.
                            const line = (s.PHASE === "gk" || s.PHASE === "def")
                              ? [s.CLEAN_SHEETS != null ? `${Math.round(s.CLEAN_SHEETS)}cs` : null,
                                 s.assists_90 != null ? `${s.assists_90.toFixed(1)}a` : null]
                              : [s.goals_90 != null ? `${s.goals_90.toFixed(1)}g` : null,
                                 s.assists_90 != null ? `${s.assists_90.toFixed(1)}a` : null];
                            return (
                              <div key={`${s.SEASON}-${s.LEAGUE}`}
                                className={`pcard-season-row${isCur ? " cur" : ""}`}>
                                <span className="yr">
                                  {(() => {
                                    const m = String(s.SEASON || "").match(/(\d{4})\D+(\d{2,4})/);
                                    return m ? `${m[1].slice(2)}-${m[2].slice(-2)}` : s.SEASON;
                                  })()}
                                </span>
                                {/* Futbol kulüp adları uzun ("FC Bayern München"),
                                    NBA'deki 3 harfli kodun yerine taşma kesiliyor. */}
                                <span className="tm fb-tm" title={s.TEAM}>{s.TEAM}</span>
                                <span className="arc">{s.primary_arch || "—"}</span>
                                <span className="stat">{line.filter(Boolean).join(" ")}</span>
                                {score != null && <span className="sc">{score}</span>}
                              </div>
                            );
                          })}
                        </>
                      )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
