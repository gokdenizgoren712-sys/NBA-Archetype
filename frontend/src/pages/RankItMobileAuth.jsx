import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Smartphone } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { SEO } from "../hooks/useSEO";

export default function RankItMobileAuth() {
  const { token, user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn) navigate("/login?next=/rankit/mobile-auth", { replace: true });
  }, [isLoggedIn, navigate]);

  const continueToApp = async () => {
    setState("loading"); setError("");
    try {
      const response = await fetch("/api/auth/mobile-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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
    <div className="h-full flex items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
      <section className="w-full max-w-md text-center rounded-3xl p-7" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <div className="mx-auto mb-5 w-16 h-16 rounded-2xl grid place-items-center" style={{ color: "var(--yamabuki)", background: "rgba(255,177,27,.09)", border: "1px solid rgba(255,177,27,.25)" }}><Smartphone size={28}/></div>
        <p className="font-logo text-xs tracking-[.18em] mb-2" style={{ color: "var(--yamabuki)" }}>RANKIT BY PRIMARY ARCH</p>
        <h1 className="font-logo text-3xl font-bold mb-3">Continue as @{user?.username}</h1>
        <p className="text-sm leading-6 mb-6" style={{ color: "var(--text-muted)" }}>Your Primary Arch account, profile and security settings will also be used in the RankIt app. No separate account will be created.</p>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        <button onClick={continueToApp} disabled={state === "loading"} className="w-full py-3 rounded-xl font-logo font-bold uppercase tracking-wide bg-yamabuki text-darkBg disabled:opacity-50">
          {state === "loading" ? "Authorizing…" : state === "ready" ? "Open RankIt Again" : "Open RankIt App"}
        </button>
        <p className="text-[10px] mt-4" style={{ color: "var(--text-faint)" }}>The authorization code expires in five minutes and can only be used once.</p>
      </section>
    </div>
  </>;
}
