// Games modülünün ortak parçaları: başlık, alt panel, onay, oyuncu avatarı.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { Logo } from "../components/BrandIcons";
import { initials } from "./format";


/** Başlık: sol geri (ya da marka), orta göz + başlık, sağ ek. */
export function Head({ eyebrow, eyebrowColor, title, onBack, backLabel = "Back", right, brand = false }) {
  return (
    <header className="arc-head">
      {brand ? <Logo size={30} /> : onBack && (
        <button type="button" className="arc-icon-btn" onClick={onBack} aria-label={backLabel}><ChevronLeft size={18} /></button>
      )}
      <div className="arc-head-text" style={onBack || brand ? undefined : { paddingLeft: 4 }}>
        {brand
          ? <><strong className="arc-brand-title">GAMES</strong><small className="arc-eyebrow" style={{ color: "var(--arc-faint)" }}>BY PRIMARY ARCH</small></>
          : <><small className="arc-eyebrow" style={eyebrowColor ? { color: eyebrowColor } : undefined}>{eyebrow}</small><strong className="arc-head-title">{title}</strong></>}
      </div>
      {right}
    </header>
  );
}

export function CloseButton({ onClose, label = "Close games" }) {
  return <button type="button" className="arc-icon-btn" onClick={onClose} aria-label={label}><X size={18} /></button>;
}

/** Alttan açılan panel. Dış alana dokununca kapanır; geri tuşu yüzeyden gelir. */
export function Sheet({ label, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="arc-sheet-wrap" onClick={onClose}>
      <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="arc-sheet" onClick={(e) => e.stopPropagation()}>
        <span className="arc-handle" aria-hidden="true" />
        {children}
      </section>
    </div>
  );
}

export function Confirm({ title, body, confirmLabel, cancelLabel = "Keep playing", onConfirm, onCancel }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="arc-dialog-wrap" onClick={onCancel}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="arc-confirm-title" className="arc-dialog" onClick={(e) => e.stopPropagation()}>
        <h2 id="arc-confirm-title" className="arc-h2" style={{ fontSize: 22 }}>{title}</h2>
        {body && <p className="arc-body">{body}</p>}
        <button ref={ref} type="button" className="arc-ghost is-fill" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className="arc-cta" style={{ background: "#f5402e", color: "#fff" }} onClick={onConfirm}>{confirmLabel}</button>
      </section>
    </div>
  );
}

/** Oyuncu fotoğrafı (NBA CDN); yüklenemezse baş harfler. */
export function Avatar({ player, size = 44 }) {
  const [ok, setOk] = useState(true);
  const id = player?.PLAYER_ID;
  return (
    <span className="arc-avatar" style={{ width: size, height: size }}>
      {id && ok
        ? <img src={`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`} alt="" loading="lazy" onError={() => setOk(false)} />
        : initials(player?.PLAYER_NAME)}
    </span>
  );
}
