/* §25 — 820 ve altında telefonun kendi kalıbı: alttan açılan, tam genişlik
 * sayfa (perde + tutamaç + kapat). Ray menüsü, Discover süzgeçleri ve Rank
 * (3j) bu kabı kullanıyor; odak tuzağı ve Escape telefonla aynı `useDialog`.
 * Geniş ekranda aynı kap ortada bir diyalog.
 */
import { X } from "lucide-react";
import { useDialog } from "../redesign/useDialog";

export default function Sheet({ label, title, onClose, className = "", children }) {
  const dialog = useDialog({ onClose, label });
  return (
    <div className="riw-sheet-wrap" onClick={onClose}>
      <section {...dialog} className={`riw-sheet ${className}`.trim()} onClick={(event) => event.stopPropagation()}>
        <div className="riw-sheet-grab" aria-hidden="true" />
        <header className="riw-sheet-head">
          <h2>{title || label}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="riw-sheet-body">{children}</div>
      </section>
    </div>
  );
}
