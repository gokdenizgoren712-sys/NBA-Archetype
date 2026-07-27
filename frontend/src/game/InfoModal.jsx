// ── Info Modal ────────────────────────────────────────────────────────────────
export default function InfoModal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surfaceBg border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl
                      animate-[fadeScaleIn_0.18s_ease-out]"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
