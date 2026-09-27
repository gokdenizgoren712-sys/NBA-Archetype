import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

// Hesap düğmesi — masaüstünde sayfa başlığının sağında, mobilde üst barda.
export default function Avatar({ accent = "#FFB11B" }) {
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  if (!isLoggedIn) {
    return (
      <button onClick={() => navigate("/login")} className="pa-signin" style={{ "--acc": accent }}>
        Sign in
      </button>
    );
  }
  return (
    <button onClick={() => navigate("/profile")} className="pa-avatar" style={{ "--acc": accent }}
      title={user.username} aria-label={`Profile — ${user.username}`}>
      {user.username?.[0]?.toUpperCase()}
    </button>
  );
}
