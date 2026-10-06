import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// mode="link": girişli kullanıcı Google'ı hesabına yeniden bağlar (POST /api/account/google/link), oturum/yönlendirme değişmez.
export const GOOGLE_CONFIGURED = !!CLIENT_ID;
export default function GoogleSignIn({ successPath = null, mode = "signin", onLinked }) {
  const { login, token } = useAuth();
  const navigate  = useNavigate();
  const btnRef    = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!CLIENT_ID) return;

    const initButton = () => {
      if (!window.google || !btnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async ({ credential }) => {
          setError("");
          try {
            if (mode === "link") {
              const lr = await fetch("/api/account/google/link", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ credential }),
              });
              const ld = await lr.json().catch(() => ({}));
              if (!lr.ok) throw new Error(ld.detail || "Could not turn Google sign-in back on");
              onLinked?.();
              return;
            }
            const res = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.detail || "Google sign-in failed");
            login(d.token, d.user);
            navigate(successPath || (d.user.role === "admin" ? "/admin/articles" : "/profile"));
          } catch (e) {
            setError(e.message);
          }
        },
      });
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "outline",
        size: "large",
        width: btnRef.current.offsetWidth || 368,
        text: "continue_with",
        shape: "rectangular",
      });
    };

    if (window.google) {
      initButton();
    } else {
      const script = document.querySelector('script[src*="gsi/client"]');
      if (script) script.addEventListener("load", initButton, { once: true });
    }
  }, [login, navigate, successPath, mode, token, onLinked]);

  if (!CLIENT_ID) return null;

  if (mode === "link") {
    return (
      <div className="au-google">
        <div ref={btnRef} className="btn" />
        {error && <p className="au-error" role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <div className="au-google">
      <div className="au-or">or</div>
      <div ref={btnRef} className="btn" />
      {/* Google ile ilk giriş hesabı açar: kabul bu satırla (api/main.py TERMS_VERSION). */}
      <p>
        By continuing with Google you agree to the{" "}
        <a href="/terms-of-service">Terms of Service</a> and{" "}
        <a href="/community-guidelines">Community Guidelines</a>.
      </p>
      {error && <p className="au-error">{error}</p>}
    </div>
  );
}
