/* Shared split-pane layout: sol liste + sağ detay panel */
export default function SplitPane({ children, detail, onClose }) {
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Sol: liste/grid */}
      <div className={`flex flex-col min-h-0 overflow-hidden transition-all duration-200 ${
        detail ? "hidden md:flex md:flex-1" : "flex-1"
      }`}>
        {children}
      </div>

      {/* Sağ: detay paneli */}
      {detail && (
        <div className="detail-panel flex flex-col w-full md:w-96 md:max-w-[38%] shrink-0 border-l overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>

          {/* Kapat butonu (mobil: tam ekran olduğu için önemli) */}
          <button
            onClick={onClose}
            className="md:hidden self-end m-2 w-8 h-8 flex items-center justify-center rounded text-lg transition-colors"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >×</button>

          <div className="flex-1 overflow-y-auto">
            {detail}
          </div>
        </div>
      )}
    </div>
  );
}
