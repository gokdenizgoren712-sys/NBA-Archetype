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
      <span className="text-[8.5px] text-gray-600 uppercase tracking-wider">Bench</span>
      <div className="flex gap-0.5">
        {pills.map(([label, has]) => (
          <span key={label}
            className={`w-4 h-4 rounded text-[8.5px] font-bold flex items-center justify-center border
              ${has ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" : "bg-surfaceCard border-gray-800 text-gray-600"}`}
            title={has ? `${label} covered on the bench` : `No ${label} on the bench`}>
            {label}
          </span>
        ))}
      </div>
      {cover.balanced && (
        <span className="text-[8.5px] font-bold text-emerald-300" title="G+F+C all covered on the bench">+0.8 balanced</span>
      )}
    </div>
  );
}
