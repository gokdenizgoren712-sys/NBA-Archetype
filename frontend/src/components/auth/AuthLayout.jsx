// Giriş / kayıt / şifre ekranlarının ortak iskeleti (handoff 10c · 17d · mobil 20g).
// Ortada 400px form: logo işareti, 36px başlık, alt satır; kenarlıksız dolgulu
// alanlar, ipucu ya da hata alanın hemen altında (satır içi). Kenar çubuğu ve
// üst bar yok (App Shell isAuthRoute) — logo sol üstte, ana sayfaya döner.
import { Link } from "react-router-dom";
import "./auth.css";

export function Mark({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className="au-mark">
      <polygon points="24,4 34,6.7 41.3,14 44,24 41.3,34 34,41.3 24,44 14,41.3 6.7,34 4,24 6.7,14 14,6.7"
        stroke="#FFB11B" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

export default function AuthLayout({ title, sub, children, foot }) {
  return (
    <div className="au-page">
      <Link to="/" className="au-logo" aria-label="Primary Arch home">
        <svg width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <polygon points="24,4 34,6.7 41.3,14 44,24 41.3,34 34,41.3 24,44 14,41.3 6.7,34 4,24 6.7,14 14,6.7" stroke="#FFB11B" strokeWidth="4" strokeLinejoin="round" />
          <path d="M 14 6.7 C 22 18 22 30 14 41.3" stroke="#1d428a" strokeWidth="4" strokeLinecap="round" />
          <path d="M 34 6.7 C 26 18 26 30 34 41.3" stroke="#c8102e" strokeWidth="4" strokeLinecap="round" />
          <path d="M 6 24 H 42" stroke="#00A3AF" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <span><b>PRIMARY</b> <em>ARCH</em></span>
      </Link>
      <main className="au-box">
        <header className="au-head">
          <Mark />
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </header>
        {children}
        {foot && <p className="au-foot">{foot}</p>}
      </main>
    </div>
  );
}

/** Etiket + dolgulu alan + satır içi ipucu/hata. `aside` etiketin sağında (ör. "Forgot?"). */
export function AuthField({ label, aside, hint, error, ok = false, id, ...input }) {
  const fid = id || `au-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className={`au-field${error ? " bad" : ""}`}>
      <div className="au-lbl">
        <label htmlFor={fid}>{label}</label>
        {aside}
      </div>
      <input id={fid} aria-invalid={!!error} aria-describedby={hint || error ? `${fid}-msg` : undefined} {...input} />
      {(error || hint) && <span id={`${fid}-msg`} className={`au-msg${error ? " err" : ok ? " ok" : ""}`}>{error || hint}</span>}
    </div>
  );
}
