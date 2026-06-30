import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export default function GoogleSignIn() {
  const { login } = useAuth();
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
            const res = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.detail || "Google sign-in failed");
            login(d.token, d.user);
            navigate(d.user.role === "admin" ? "/admin/articles" : "/profile");
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
  }, []);

  if (!CLIENT_ID) return null;

  return (
    <div>
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      </div>
      <div ref={btnRef} className="w-full flex justify-center" />
      {error && <p className="text-sm text-red-400 mt-2 text-center">{error}</p>}
    </div>
  );
}
