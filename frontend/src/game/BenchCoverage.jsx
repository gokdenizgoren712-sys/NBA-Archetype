import { benchCoverage } from "./seasonSim";

// ── Bench pozisyon dengesi rozeti — G/F/C hepsi bench'te varsa küçük bir
// takım reytingi buff'ı (+0.8) tetikleniyor (bkz. seasonSim.computeTeamRating).
// Bu bileşen o mantığı görünür kılar; kendi state'i yok, sadece bench dizisini okur.
export default function BenchCoverage({ bench }) {
  const filled = (bench || []).filter(Boolean);
  if (!filled.length) return null;
  const cover = benchCoverage(filled);
  const pills = [["G", cover.G], ["F", cover.F], ["C", cover.C]];

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[8.5px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Bench</span>
      <div className="flex gap-1">
        {pills.map(([label, has]) => (
          <span key={label}
            className="w-[17px] h-[17px] rounded-md text-[8.5px] font-bold flex items-center justify-center"
            style={has
              ? { color: "#4ade80", background: "rgba(74,222,128,.14)", border: "1px solid rgba(74,222,128,.45)" }
              : { color: "rgba(255,255,255,.22)", border: "1px dashed rgba(255,255,255,.14)" }}
            title={has ? `${label} covered on the bench` : `No ${label} on the bench`}>
            {label}
          </span>
        ))}
      </div>
      {cover.balanced && (
        <span className="text-[8.5px] font-bold" style={{ color: "#4ade80" }} title="G+F+C all covered on the bench">+0.8 balanced</span>
      )}
    </div>
  );
}
