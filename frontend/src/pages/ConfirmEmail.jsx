import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SEO } from "../hooks/useSEO";
import { Button } from "../components/ui";
import "./rankit-public.css";

// /confirm-email?token=... (B1): e-posta değişikliğini onaylar, oturum gerekmez, jeton tek kullanımlık (24 saat).
export default function ConfirmEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState(token ? "working" : "bad");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch("/api/account/confirm-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.detail || "This link didn't work."); setState("done"); })
      .catch((e) => { setMsg(e.message); setState("bad"); });
  }, [token]);

  return (
    <div className="rp-page">
      <SEO title="Confirm email" description="Confirm your new email address." path="/confirm-email" noindex />
      <div className="rp-wrap">
        <section className="rp-card">
          <p className="pa-eyebrow">Account · Email</p>
          {state === "working" && <><h1 className="rp-h1">Confirming…</h1><p className="rp-copy" role="status">One moment.</p></>}
          {state === "done" && <><h1 className="rp-h1">Email updated</h1><p className="rp-copy">Your new email is confirmed. Use it the next time you sign in.</p><Button as={Link} to="/settings" variant="primary" size={48}>Back to settings</Button></>}
          {state === "bad" && <><h1 className="rp-h1">Link not valid</h1><p className="rp-copy">{(msg || "This link is missing, used, or older than 24 hours.").replace(/[.]?$/, ".")} Request a new one from Settings.</p><Button as={Link} to="/settings" variant="outline" size={48}>Open settings</Button></>}
        </section>
      </div>
    </div>
  );
}
