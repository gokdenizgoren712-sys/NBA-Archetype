import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

// "Updated terms" bandı (docs/RANKIT_STORE_BLOCKERS_PLAN.md B7): şartların
// güncel sürümünü (api/main.py TERMS_VERSION) kabul etmemiş hesaplara bir kez.
// Engellemez — site kullanılmaya devam eder; "Got it" kabulü hesaba yazar.
export default function TermsBanner() {
  const { termsCurrent, acceptTerms } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (termsCurrent !== false) return null;

  const accept = async () => {
    setBusy(true); setError("");
    try { await acceptTerms(); }
    catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <section aria-label="Updated terms"
      className="shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-2.5 text-[12.5px] leading-snug"
      style={{ background: "rgba(255,177,27,.08)", borderTop: "1px solid rgba(255,177,27,.3)", color: "var(--text-primary)" }}>
      <p className="m-0 text-center">
        We&apos;ve updated our <Link to="/terms-of-service" className="underline">Terms of Service</Link> and
        added <Link to="/community-guidelines" className="underline">Community Guidelines</Link> for reviews,
        replies and chat. Continuing to use Primary Arch means you agree to them.
      </p>
      <button type="button" onClick={accept} disabled={busy}
        className="px-3 py-1.5 rounded-lg font-logo font-bold text-xs uppercase tracking-wide bg-yamabuki text-darkBg disabled:opacity-50">
        {busy ? "Saving…" : "Got it"}
      </button>
      {error && <span role="alert" className="text-red-400">{error}</span>}
    </section>
  );
}
