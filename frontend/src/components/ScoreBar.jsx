// Tek bir bileşen için 0-1 çubuk göstergesi
export default function ScoreBar({ label, value, highlight = false }) {
  const pct = Math.round((value || 0) * 100);
  const color = value >= 0.85 ? "bg-violet-500"
              : value >= 0.70 ? "bg-blue-500"
              : value >= 0.55 ? "bg-emerald-500"
              : "bg-slate-600";

  return (
    <div className={`flex items-center gap-2 py-0.5 rounded px-1 ${highlight ? "bg-white/5" : ""}`}>
      <span className="w-28 text-xs text-slate-400 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-xs text-slate-300 text-right">{pct}</span>
    </div>
  );
}
