import { useState } from "react";
import { getPlayerTags } from "./awards";
import { costColor } from "./salary";
import { WarnIcon } from "./GameIcons";
import "./game.css";

export { posGroupOf } from "./positions";

// Arketip → renk (site geneliyle aynı palet). Satır hover'ında oyuncunun
// kendi arketip rengiyle aydınlanır — kutu yerine ışık.
const ARCH_HEX = {
  Engine: "#fb923c", Ecosystem: "#4ade80", Hub: "#2dd4bf", Connector: "#c084fc",
  Creator: "#fb7185", Anchor: "#60a5fa", Spacer: "#22d3ee", Finisher: "#a3e635",
  Force: "#f87171", Initiator: "#FFB11B", Stopper: "#d1d5db", "Rim Runner": "#34d399",
};

function headshotUrl(p) {
  return p.PLAYER_ID ? `https://cdn.nba.com/headshots/nba/latest/260x190/${p.PLAYER_ID}.png` : null;
}

// Kompakt tag rozeti — baş harf + renk (uzun label yerine)
function TagBadge({ t }) {
  return (
    <span title={t.detail}
      className="inline-flex items-center justify-center text-[8.5px] font-bold rounded leading-none shrink-0 px-1 h-[15px] min-w-[15px]"
      style={{ color: t.color, background: t.color + "22", border: `1px solid ${t.color}66` }}>
      {t.abbr}
    </span>
  );
}

// ── Oyuncu satırı (draft listesi) ────────────────────────────────────────────
export default function PlayerRow({ player, discover, onClick, cost, unaffordable, dimmed, highlightStat }) {
  const [imgOk, setImgOk] = useState(true);
  const stat = (k) => {
    const v = player[k];
    if (v == null || isNaN(+v)) return "—";
    if (k === "FG3_PCT") return `${Math.round(+v * 100)}%`;
    return (+v).toFixed(1);
  };
  const overall = player.overall_score != null ? Math.round(player.overall_score * 100) : null;
  // overall_score tam 0 -- motor GP/dakika eşiğini geçemeyen oyuncuları böyle işaretliyor
  // (bkz. src/score_compat.py raw_overall NaN->0.0), gerçek bir "0 puan" değil. Bu oyuncular
  // rosterda hiçbir katkı sağlamadığı halde minimum sözleşme kadar cap yiyordu — seçilemez yap.
  const insufficientData = player.overall_score == null || +player.overall_score <= 0;
  const tags = getPlayerTags(player);
  const url = headshotUrl(player);
  const accent = ARCH_HEX[player.primary_arch] || "#9ca3af";

  const cell = (k) => (
    <span className={`g-row-stat${highlightStat === k ? " hi" : ""}`}>{stat(k)}</span>
  );

  const cls = ["g-row", (unaffordable || insufficientData) ? "unaffordable" : "", dimmed ? "dimmed" : ""].filter(Boolean).join(" ");

  return (
    <button onClick={onClick} disabled={unaffordable || insufficientData} className={cls}
      style={{ "--accent": accent, "--accent-a": accent + "1f", "--accent-line": accent + "4d" }}>
      {/* Sabit sol blok (yatay kaydırmada pinli): avatar + isim + arketip + rozetler */}
      <div className="g-row-pin">
        <div className="g-row-face">
          {url && imgOk ? (
            <img src={url} alt="" loading="lazy" onError={() => setImgOk(false)} />
          ) : (
            <span className="text-[11px] font-bold" style={{ color: "var(--text-faint)" }}>
              {player.PLAYER_NAME?.split(" ").map(w => w[0]).slice(0, 2).join("")}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="g-row-name flex items-center gap-1">
            <span className="truncate">{player.PLAYER_NAME}</span>
            {insufficientData && (
              <span title="Insufficient games played this season — not eligible to draft"
                className="inline-flex items-center justify-center shrink-0"
                style={{ color: "#fb923c" }}>
                <WarnIcon size={11} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] shrink-0" style={{ color: "var(--text-faint)" }}>{player.POSITION || player.POS5 || ""}</span>
            <span className="g-row-arch truncate">{insufficientData ? "Insufficient games played" : (player.primary_arch || "—")}</span>
            {!insufficientData && tags.slice(0, 3).map(t => <TagBadge key={t.key} t={t} />)}
          </div>
        </div>
      </div>

      {/* TAG sayısı sütunu */}
      <span className="g-row-tag"
        title={tags.length ? tags.map(t => t.label).join(" · ") : "No tags"}>
        {tags.length
          ? <span className="font-bold" style={{ color: "var(--text-primary)" }}>{tags.length}</span>
          : <span style={{ color: "rgba(255,255,255,.22)" }}>–</span>}
      </span>

      {/* Sözleşme maliyeti (Salary Cap) — insufficientData'da yanıltıcı olur, gizle */}
      {cost != null && !insufficientData && (
        <span className="g-row-cost">
          <span className="text-[11px] font-black tabular-nums px-1.5 py-0.5 rounded-md leading-none"
            style={{ color: costColor(cost), background: costColor(cost) + "14", border: `1px solid ${costColor(cost)}44` }}
            title={unaffordable ? `Costs ${cost}% — over your spendable cap` : `Contract: ${cost}% of the cap`}>
            {cost}%
          </span>
        </span>
      )}
      {cost != null && insufficientData && <span className="g-row-cost" />}

      {/* Discover: yalnızca overall'ı ifşa eder */}
      {discover && overall != null && !insufficientData && (
        <span className="g-row-cost">
          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold leading-none"
            style={{ color: "#c4b5fd", background: "rgba(167,139,250,.16)", border: "1px solid rgba(167,139,250,.4)" }}>
            {overall}
          </span>
        </span>
      )}
      {discover && overall != null && insufficientData && <span className="g-row-cost" />}

      {/* İstatistikler */}
      {cell("PTS")}{cell("REB")}{cell("AST")}{cell("FG3_PCT")}{cell("STL")}{cell("BLK")}
    </button>
  );
}
