import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import "./ui.css";

// Primary Arch v3 primitive'leri (handoff 00-README Phase 0). Saf sunum: davranış sayfada kalır.
// Dondurulmuş kartlar (PlayerCard, FootballPlayerCard, MatchCard) bunları kullanmaz.

const cx = (...a) => a.filter(Boolean).join(" ");

export function Panel({ as: Tag = "section", pad, className, children, ...rest }) {
  return <Tag className={cx("pa-panel", pad && "pad", className)} {...rest}>{children}</Tag>;
}

export function PanelHead({ title, count, level = 2, children }) {
  const H = `h${level}`;
  return (
    <div className="pa-panel-head">
      <H>{title}</H>
      {count != null && <span className="count">{count}</span>}
      {children}
    </div>
  );
}

/** variant: primary | outline | quiet — size: 34 | 44 | 48 | 54. `as`/`href` ile bağlantı olarak da çizilir. */
export function Button({ variant = "outline", size = 44, block, as: Tag, className, type, children, ...rest }) {
  const T = Tag || (rest.href ? "a" : "button");
  const props = T === "button" ? { type: type || "button" } : {};
  return <T className={cx("pa-btn", variant, `s${size}`, block && "block", className)} {...props} {...rest}>{children}</T>;
}

/** Mono etiket + dolu girdi. `control` verilmezse <input>; hata metni `error`. */
export function Field({ label, hint, error, control, className, ...inputProps }) {
  const id = useId();
  const msg = error || hint;
  const props = { id, "aria-invalid": error ? true : undefined, "aria-describedby": msg ? `${id}-m` : undefined };
  return (
    <div className={cx("pa-field", error && "err", className)}>
      {label && <label htmlFor={id}>{label}</label>}
      {control ? control(props) : <input {...props} {...inputProps} />}
      {msg && <span id={`${id}-m`} className="hint" role={error ? "alert" : undefined}>{error || hint}</span>}
    </div>
  );
}

/** Sekmeler. items: [{ key, label }]. `segmented` segment görünümü. Sol/sağ ok ile gezilir. */
export function Tabs({ items, value, onChange, segmented, label, className }) {
  const onKey = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = items.findIndex((x) => x.key === value);
    const n = items[(i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
    onChange(n.key);
  };
  return (
    <div className={cx("pa-tabs", segmented && "seg", className)} role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map((t) => (
        <button key={t.key} type="button" role="tab" className="pa-tab" aria-selected={value === t.key}
          tabIndex={value === t.key ? 0 : -1} onClick={() => onChange(t.key)}>{t.label}</button>
      ))}
    </div>
  );
}

/** Arketip (nokta + etiket), bayrak ya da filtre çipi. `onClick` verilirse düğme olur ve `pressed` taşır. */
export function Chip({ dot, pressed, onClick, children, className, ...rest }) {
  const style = dot ? { "--dot": dot } : undefined;
  if (onClick) {
    return <button type="button" className={cx("pa-chip", className)} style={style} aria-pressed={!!pressed} onClick={onClick} {...rest}>{dot && <i className="dot" />}{children}</button>;
  }
  return <span className={cx("pa-chip", className)} style={style} {...rest}>{dot && <i className="dot" />}{children}</span>;
}

/** Durum etiketi: published | draft | running | failed | good. */
export function StatusTag({ status = "draft", children }) {
  return <span className={cx("pa-status", status)}>{children ?? status}</span>;
}

/** columns: [{ key, label, num?, render? }]; rows: nesne ya da { tier: "TIER 1" } ayırıcı. */
export function Table({ columns, rows, rowKey = (r, i) => r.id ?? i, caption }) {
  return (
    <div className="pa-table-wrap">
      <table className="pa-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.num ? "num" : undefined} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => r.tier != null
            ? <tr key={`t${i}`} className="tier"><td colSpan={columns.length}>{r.tier}</td></tr>
            : <tr key={rowKey(r, i)}>{columns.map((c) => <td key={c.key} className={c.num ? "num" : undefined}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

// Modal ve Sheet ortak gövdesi: portal, odak tuzağı, Esc, kapanınca odak iadesi.
function Dialog({ sheet, title, onClose, footer, children, label }) {
  const box = useRef(null);
  const heading = useId();
  useEffect(() => {
    const prev = document.activeElement;
    const el = box.current;
    el?.querySelector("[data-first]")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key !== "Tab" || !el) return;
      const f = [...el.querySelectorAll("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return createPortal(
    <div className={cx("pa-overlay", sheet && "sheet")} onClick={onClose}>
      <div ref={box} className="pa-dialog" role="dialog" aria-modal="true" aria-labelledby={title ? heading : undefined} aria-label={title ? undefined : label} onClick={(e) => e.stopPropagation()}>
        {title && <div className="pa-dialog-head"><h2 id={heading}>{title}</h2><button type="button" className="pa-dialog-x" data-first onClick={onClose} aria-label="Close">×</button></div>}
        <div className="pa-dialog-body">{children}</div>
        {footer && <div className="pa-dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** Ortada modal (yalnız bu öğe gölge taşır). */
export const Modal = (props) => <Dialog {...props} />;
/** Mobilde alt sayfa, masaüstünde modal. */
export const Sheet = (props) => <Dialog sheet {...props} />;
