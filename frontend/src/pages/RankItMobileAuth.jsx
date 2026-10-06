import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Smartphone } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";
import "./rankit-public.css";

export default function RankItMobileAuth() {
  const { token, user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  // Uygulamanın PKCE özeti (rankit/pkce.js). Biçimi tutmazsa yok sayılır:
  // kod o zaman eski akışla, özetsiz üretilir.
  const [params] = useSearchParams();
  const raw = params.get("challenge") || "";
  const challenge = /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;

  useEffect(() => {
    const back = `/rankit/mobile-auth${challenge ? `?challenge=${challenge}` : ""}`;
    if (!isLoggedIn) navigate(`/login?next=${encodeURIComponent(back)}`, { replace: true });
  }, [isLoggedIn, navigate, challenge]);

  const continueToApp = async () => {
    setState("loading"); setError("");
    try {
      const response = await fetch("/api/auth/mobile-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(challenge ? { challenge } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not authorize RankIt");
      setState("ready");
      window.location.assign(data.deep_link);
    } catch (err) {
      setState("idle"); setError(err.message);
    }
  };

  if (!isLoggedIn) return null;
  return <>
    <SEO title="Continue to RankIt" description="Use your Primary Arch account in RankIt." path="/rankit/mobile-auth" noindex />
    <div className="rp-page">
      <div className="rp-wrap">
        <section className="rp-card">
          <div className="rp-icon"><Smartphone size={28}/></div>
          <p className="pa-eyebrow">RankIt by Primary Arch</p>
          <h1 className="rp-h1">Continue as @{user?.username}</h1>
          <p className="rp-copy">Your Primary Arch account, profile and security settings will also be used in the RankIt app. No separate account will be created.</p>
          {error && <p className="rp-err" role="alert">{error}</p>}
          <button onClick={continueToApp} disabled={state === "loading"} className="pa-btn primary s48 rp-cta">
            {state === "loading" ? "Authorizing…" : state === "ready" ? "Open RankIt Again" : "Open RankIt App"}
          </button>
          <p className="rp-fine">The authorization code expires in five minutes and can only be used once.</p>
        </section>
      </div>
    </div>
  </>;
}
