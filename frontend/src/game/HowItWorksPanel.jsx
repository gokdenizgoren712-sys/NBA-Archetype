// ── Idle ekranın sol paneli: "How it works" adım kartları + alt not ─────────
// Same Screen ve With a Friend arasında paylaşılır — steps/note prop'larla
// her sayfa kendi akışına göre metni özelleştirir, kart düzeni/stili sabit.
export default function HowItWorksPanel({ steps, note }) {
  return (
    <div className="bg-surfaceBg border border-gray-800 rounded-2xl p-4 space-y-3">
      <div className="font-logo text-[11px] uppercase tracking-widest text-gray-500">How it works</div>
      <div className="grid grid-cols-2 gap-2">
        {steps.map(([n, Icon, color, title, sub]) => (
          <div key={n} className="relative rounded-xl border border-gray-800 bg-surfaceCard p-3 text-center">
            <div className="absolute top-1.5 left-2 font-logo text-[10px] font-bold text-gray-600">{n}</div>
            <div className={`flex justify-center mb-1.5 ${color}`}><Icon size={26} /></div>
            <div className="font-logo text-xs font-bold text-white leading-tight">{title}</div>
            <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{sub}</div>
          </div>
        ))}
      </div>
      {note && (
        <p className="text-[11px] text-gray-500 leading-relaxed border-t border-gray-800 pt-2">{note}</p>
      )}
    </div>
  );
}
