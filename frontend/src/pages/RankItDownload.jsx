import { useEffect, useState } from "react";
import { Smartphone, ShieldCheck, Download } from "lucide-react";
import { SEO } from "../hooks/useSEO";
import "./rankit-public.css";

// ── RankIt indirme sayfası ───────────────────────────────────────────────────
// Sideload dağıtımın karşı ucu: derlemeyi alacak kişinin gittiği yer. Arama
// motorlarına kapalı (noindex) ve site içinden hiçbir yere bağlanmıyor —
// bağlantıyı bilen gelir. Play Store'a geçildiğinde bu sayfa oraya yönlenir.
//
// SHA-256'yı GÖSTERİYORUZ: sideload edilen bir APK'nın doğru dosya olduğunu
// kullanıcının doğrulayabileceği tek şey bu.

export default function RankItDownload() {
  const [rel, setRel] = useState(undefined);   // undefined = yükleniyor, null = yok

  useEffect(() => {
    fetch("/api/rankit/releases/latest", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRel(d.release || null))
      .catch(() => setRel(null));
  }, []);

  return (
    <div className="rp-page">
      <SEO title="RankIt for Android" description="Install the RankIt alpha." path="/rankit/download" noindex />
      <div className="rp-wrap">
        <section className="rp-card">
          <div className="rp-icon"><Smartphone size={28} /></div>
          <p className="pa-eyebrow">RankIt by Primary Arch</p>

          {rel === undefined && (
            <p className="rp-copy" role="status">Checking for a build…</p>
          )}

          {rel === null && (
            <>
              <h1 className="rp-h1">No build published yet</h1>
              <p className="rp-copy">
                There is nothing to install from here right now.
              </p>
            </>
          )}

          {rel && (
            <>
              <h1 className="rp-h1">{rel.version_name}</h1>
              <p className="rp-fine">
                {rel.channel} · {(rel.size_bytes / 1048576).toFixed(1)} MB
                {rel.created_at ? ` · ${rel.created_at.slice(0, 10)}` : ""}
              </p>

              {rel.notes && (
                <p className="rp-copy">{rel.notes}</p>
              )}

              <a href={rel.download_url} className="pa-btn primary s48 rp-cta">
                <Download size={17} /> Download APK
              </a>

              <div className="rp-hash">
                <div className="rp-hash-l">
                  <ShieldCheck size={13} /> SHA-256
                </div>
                <code>
                  {rel.sha256}
                </code>
                <p className="rp-fine">
                  Android will warn you before installing a file from outside the Play Store.
                  That warning is correct — check the hash above against the file you
                  downloaded before allowing it. Sign in with your Primary Arch account;
                  the app does not keep its own.
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
