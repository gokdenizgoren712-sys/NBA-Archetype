// ── Joker butonu ──────────────────────────────────────────────────────────────
export default function JokerBtn({ Icon, label, available, onClick }) {
  return (
    <button onClick={onClick} disabled={!available}
      className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg border text-center transition-all
        ${available ? "border-yamabuki/60 bg-yamabuki/20 hover:bg-yamabuki/40 cursor-pointer text-yamabuki"
                    : "border-gray-800 bg-surfaceBg/40 cursor-not-allowed text-gray-600"}`}>
      <Icon size={16} />
      <span className="text-[9.5px] leading-tight whitespace-nowrap">{label}</span>
    </button>
  );
}
