import { gameClass } from "./ui/sportTheme";
import "./ui/sport-theme.css";
import "./ui/setup.css";
import "./ui/result.css";

// ── Şampiyon penceresi (mockup 3k / 4k) ──────────────────────────────────────
// Rewrite History bracket'inde şampiyon belli olunca otomatik açılır (PlayoffBracketView).
// Mockup'taki "4–2 · You are the champions" kullanıcının kendi serisi içindi; burada gerçek
// takımın şampiyonluğu gösteriliyor, aynı kart dili: parıltılı çerçeve, büyük değer, iki düğme.
export default function ChampionModal({ champion, season, finalsMVP, onClose, sport = "basketball" }) {
  if (!champion) return null;
  return (
    <div className={gameClass(sport, "sb-champ-back")} onClick={onClose} role="presentation">
      <div className="sb-champ" role="dialog" aria-modal="true" aria-label="Champions" onClick={(e) => e.stopPropagation()}>
        <span className="sb-mono eyebrow">{season} · NBA CHAMPIONS</span>
        <span className="big">{champion.abbr}</span>
        <h2>Champions</h2>
        {finalsMVP && <p>Finals MVP: {finalsMVP.name} ({finalsMVP.abbr})</p>}
        <div className="acts">
          <button type="button" className="sb-btn solid" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
