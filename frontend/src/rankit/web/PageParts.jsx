/* Rayı olmayan web sayfalarının ortak parçaları (7f · 7g · 7h · 8b · 8c …).
 *
 *   başlık   göz etiketi 9px .14em #7f868b, altında 31px Rajdhani başlık;
 *            sağda sayfanın kendi denetimleri (22 26 0 dolgu)
 *   sırala   görünür düğmeler, açılır liste değil (§22.1 "Sort options are
 *            visible, not in a dropdown"); seçili nötr (.06 zemin, .14
 *            çizgi) — altın değil. Düğme 38 görünür, 44 dokunma (§6).
 */
export function PageHead({ eyebrow, title, children, titleId }) {
  return (
    <header className="riw-page-head">
      <div>
        {eyebrow && <p className="riw-page-eyebrow">{eyebrow}</p>}
        <h1 id={titleId}>{title}</h1>
      </div>
      {children && <div className="riw-page-actions">{children}</div>}
    </header>
  );
}

/* options: [{ key, label, divider?, disabled? }] */
export function SortBar({ label, value, options, onChange }) {
  return (
    <div className="riw-sortbar" role="group" aria-label={label}>
      {options.map((o) => (
        <span key={o.key} className="riw-sortbar-item">
          {o.divider && <i aria-hidden="true" />}
          <button type="button" aria-pressed={value === o.key} disabled={o.disabled}
            title={o.title} onClick={() => onChange(o.key)}>{o.label}</button>
        </span>
      ))}
    </div>
  );
}
