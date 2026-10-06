import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

// Hesap düğmesi — masaüstünde sayfa başlığının sağında, mobilde üst barda.
// Tıklayınca küçük menü: Profile · Settings · Leaderboard · Sign out (Esc/dışarı tıklama kapatır).
export default function Avatar({ accent = "#FFB11B" }) {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!isLoggedIn) {
    return (
      <button onClick={() => navigate("/login")} className="pa-signin" style={{ "--acc": accent }}>
        Sign in
      </button>
    );
  }
  return (
    <div className="pa-avatar-wrap" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="pa-avatar" style={{ "--acc": accent }}
        title={user.username} aria-label={`Account menu — ${user.username}`} aria-haspopup="menu" aria-expanded={open}>
        {user.username?.[0]?.toUpperCase()}
      </button>
      {open && (
        <div className="pa-avatar-menu" role="menu">
          <span className="who">{user.username}</span>
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)}>Profile</Link>
          <Link role="menuitem" to="/settings" onClick={() => setOpen(false)}>Settings</Link>
          <Link role="menuitem" to="/leaderboard" onClick={() => setOpen(false)}>Leaderboard</Link>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); logout(); navigate("/"); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}
