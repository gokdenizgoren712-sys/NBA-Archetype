// Giriş / kayıt / şifre ekranlarının ortak iskeleti (v3 Pages U1–U4).
// Üst bar: logo + Help. Altında iki bölmeli tek panel: solda yarı saha çizgi sanatı ve slogan, sağda form
// (mono ön etiket, büyük başlık, dolu alanlar). Kenar çubuğu ve sayfa başlığı yok (App Shell isAuthRoute).
import { Link } from "react-router-dom";
import { Logo } from "../BrandIcons";
import "./auth.css";

export function Mark({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className="au-mark">
      <polygon points="24,4 34,6.7 41.3,14 44,24 41.3,34 34,41.3 24,44 14,41.3 6.7,34 4,24 6.7,14 14,6.7"
        stroke="#FFB11B" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

// Yalnız çizgiler ve top: v3 "taktik tahta" dili.
function Court() {
  return (
    <svg viewBox="0 0 420 400" className="au-court" aria-hidden="true">
      <rect x="2" y="2" width="416" height="396" />
      <rect x="142" y="2" width="136" height="158" className="paint" />
      <path d="M160 160a50 50 0 0 0 100 0" />
      <path d="M26 2v128a184 184 0 0 0 368 0V2" />
      <path d="M186 28h48M210 28v4M192 44a18 18 0 0 0 36 0" />
      <path d="M160 398a50 50 0 0 1 100 0" />
      <circle cx="210" cy="260" r="26" className="ball" />
      <path d="M184 260h52M210 234v52M192 242c10 10 10 26 0 36M228 242c-10 10-10 26 0 36" className="ball" />
    </svg>
  );
}

export default function AuthLayout({ eyebrow, title, sub, children, foot }) {
  return (
    <div className="au-page pa-grid">
      <header className="au-top">
        <Link to="/" className="au-logo" aria-label="Primary Arch home">
          <Logo size={26} />
          <span><b>PRIMARY</b> <em>ARCH</em></span>
        </Link>
        <Link to="/contact" className="au-help">Help</Link>
      </header>
      <main className="au-card">
        <aside className="au-art" aria-hidden="true">
          <div className="au-art-top"><span className="pa-eyebrow">Archetype scouting</span><span className="pa-eyebrow">Basketball · Football</span></div>
          <Court />
          <p className="au-slogan">Read the game <i>/</i> <b>by archetype</b></p>
        </aside>
        <section className="au-box">
          <header className="au-head">
            {eyebrow && <p className="pa-eyebrow">{eyebrow}</p>}
            <h1>{title}</h1>
            {sub && <p className="au-sub">{sub}</p>}
          </header>
          {children}
          {foot && <p className="au-foot">{foot}</p>}
        </section>
      </main>
    </div>
  );
}

/** Etiket + dolu alan + satır içi ipucu/hata. `aside` etiketin sağında (ör. "Forgot?"). */
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
