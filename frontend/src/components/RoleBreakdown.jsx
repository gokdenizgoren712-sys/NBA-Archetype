/**
 * 11 fonksiyonel slot için renkli çubuk göstergesi.
 * Kırmızı = eksik (<0.55), sarı = orta (0.55-0.70), yeşil = güçlü (>0.70)
 */

const SLOTS = [
  { key: "Primary Creation",     short: "PRI", label: "Primary Creation" },
  { key: "Secondary Playmaking", short: "2ND", label: "Sec. Playmaking" },
  { key: "Floor Spacing",        short: "SPC", label: "Floor Spacing" },
  { key: "Interior Defense",     short: "INT", label: "Interior Def." },
  { key: "Perimeter Defense",    short: "PER", label: "Perimeter Def." },
  { key: "Physical Force",       short: "PHY", label: "Physical Force" },
  { key: "Finishing",            short: "FIN", label: "Finishing" },
  { key: "Two-Way Defense",      short: "2WY", label: "Two-Way" },
  { key: "Shot Creation",        short: "SCR", label: "Shot Creation" },
  { key: "Transition",           short: "TRN", label: "Transition" },
];

const slotColor = (v) => {
  if (v >= 0.70) return { bar: "bg-emerald-500", text: "text-emerald-400" };
  if (v >= 0.55) return { bar: "bg-yamabuki",   text: "text-yamabuki" };
  return          { bar: "bg-rose-600",            text: "text-rose-400" };
};

export default function RoleBreakdown({ roleScores = {}, compact = false }) {
  if (!roleScores || Object.keys(roleScores).length === 0) return null;

  if (compact) {
    return (
      <div className="flex gap-0.5 flex-wrap">
        {SLOTS.map(({ key, short }) => {
          const v = roleScores[key] ?? 0;
          const { bar } = slotColor(v);
          return (
            <div key={key} title={`${key}: ${Math.round(v * 100)}`}
              className="flex flex-col items-center gap-0.5">
              <div className="w-5 h-10 bg-surfaceCard rounded-sm overflow-hidden flex flex-col-reverse">
                <div className={`${bar} w-full transition-all`}
                  style={{ height: `${Math.round(v * 100)}%` }} />
              </div>
              <span className="text-[8px] text-gray-600 font-mono">{short}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {SLOTS.map(({ key, label }) => {
        const v = roleScores[key] ?? 0;
        const pct = Math.round(v * 100);
        const { bar, text } = slotColor(v);
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="w-28 text-[10px] text-gray-500 shrink-0 text-right">{label}</span>
            <div className="flex-1 h-2 bg-surfaceCard rounded-full overflow-hidden">
              <div className={`h-full ${bar} rounded-full transition-all`}
                style={{ width: `${pct}%` }} />
            </div>
            <span className={`w-6 text-[10px] font-mono ${text}`}>{pct}</span>
          </div>
        );
      })}
    </div>
  );
}
