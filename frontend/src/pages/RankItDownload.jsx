import { useEffect, useState } from "react";
import { Smartphone, ShieldCheck, Download } from "lucide-react";
import { SEO } from "../hooks/useSEO";

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
    <div className="h-full overflow-y-auto">
      <SEO title="RankIt for Android" description="Install the RankIt alpha." path="/rankit/download" noindex />
      <div className="min-h-full flex items-center justify-center p-6">
        <section className="w-full max-w-md text-center rounded-3xl p-7"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl grid place-items-center"
            style={{ color: "var(--yamabuki)", background: "rgba(255,177,27,.09)",
                     border: "1px solid rgba(255,177,27,.25)" }}>
            <Smartphone size={28} />
          </div>
          <p className="font-logo text-xs tracking-[.18em] mb-2" style={{ color: "var(--yamabuki)" }}>
            RANKIT BY PRIMARY ARCH
          </p>

          {rel === undefined && (
            <p className="text-sm animate-pulse" style={{ color: "var(--text-muted)" }}>Checking for a build…</p>
          )}

          {rel === null && (
            <>
              <h1 className="font-logo text-2xl font-bold mb-3">No build published yet</h1>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                There is nothing to install from here right now.
              </p>
            </>
          )}

          {rel && (
            <>
              <h1 className="font-logo text-3xl font-bold mb-1">{rel.version_name}</h1>
              <p className="text-xs mb-5" style={{ color: "var(--text-faint)" }}>
                {rel.channel} · {(rel.size_bytes / 1048576).toFixed(1)} MB
                {rel.created_at ? ` · ${rel.created_at.slice(0, 10)}` : ""}
              </p>

              {rel.notes && (
                <p className="text-sm leading-6 mb-5" style={{ color: "var(--text-muted)" }}>{rel.notes}</p>
              )}

              <a href={rel.download_url}
                className="w-full py-3 rounded-xl font-logo font-bold uppercase tracking-wide
                           bg-yamabuki text-darkBg flex items-center justify-center gap-2">
                <Download size={17} /> Download APK
              </a>

              <div className="mt-5 pt-4 text-left" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center gap-1.5 mb-1.5"
                  style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  <ShieldCheck size={13} /> SHA-256
                </div>
                <code className="text-[10px] break-all" style={{ color: "var(--text-faint)" }}>
                  {rel.sha256}
                </code>
                <p className="text-[10.5px] mt-3" style={{ color: "var(--text-faint)", lineHeight: 1.7 }}>
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
