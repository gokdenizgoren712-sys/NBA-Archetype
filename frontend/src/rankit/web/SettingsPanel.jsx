/* Ayarlar — 8b'nin dişli düğmesi (Aşama 17). Aşama 15'ten beri profilin
   "Settings" sekmesiydi; içerik aynen taşındı: yayın ülkesi, skor gizleme,
   hareket azaltma, Android sürümü, yasal bağlantılar. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, EyeOff, FileText, Radio, SlidersHorizontal, Smartphone } from "lucide-react";
import { BROADCAST_COUNTRIES, readPrefs, writePrefs, localeCountry } from "../rankitPrefs";

export default function SettingsPanel({ hideScores, onToggleScores }) {
  const [prefs, setPrefs] = useState(readPrefs);
  const setPref = (patch) => setPrefs(writePrefs(patch));
  const [build, setBuild] = useState(undefined);   // undefined = yükleniyor

  // Yayın bilgisi girişten bağımsız: sürümü görmek için hesap gerekmiyor.
  useEffect(() => {
    fetch("/api/rankit/releases/latest", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setBuild(d.release || null))
      .catch(() => setBuild(null));
  }, []);

  return (
    <section className="riw-settings">
      <div className="riw-set-group">
        <span>PERSONALISATION</span>

        <label className="riw-set-row" htmlFor="riw-country">
          <Radio size={16} />
          <div>
            <strong>Broadcast country</strong>
            <small>
              {prefs.broadcastCountry === "auto"
                ? (localeCountry()
                    ? `Following your browser — ${localeCountry()}`
                    : "Your browser's region has no coverage data yet")
                : "Which country's listings to show on a match"}
            </small>
          </div>
          <select id="riw-country" value={prefs.broadcastCountry}
            onChange={(e) => setPref({ broadcastCountry: e.target.value })}>
            <option value="auto">Auto</option>
            {BROADCAST_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </label>

        <label className="riw-set-row" htmlFor="riw-hide">
          <EyeOff size={16} />
          <div>
            <strong>Hide scores by default</strong>
            <small>Cards and drawers open blurred until you choose to look.</small>
          </div>
          <input id="riw-hide" type="checkbox" checked={hideScores}
            onChange={onToggleScores} />
        </label>

        <label className="riw-set-row" htmlFor="riw-motion">
          <SlidersHorizontal size={16} />
          <div>
            <strong>Reduce motion</strong>
            <small>Turns off card entrance animations without changing your OS setting.</small>
          </div>
          <input id="riw-motion" type="checkbox" checked={prefs.reduceMotion}
            onChange={(e) => setPref({ reduceMotion: e.target.checked })} />
        </label>
      </div>

      <div className="riw-set-group">
        <span>ANDROID APP</span>
        <Link to="/rankit/download" className="riw-set-row">
          <Smartphone size={16} />
          <div>
            <strong>Update RankIt</strong>
            <small>
              {build === undefined ? "Checking for a build…"
                : build ? `${build.version_name} · ${(build.size_bytes / 1048576).toFixed(1)} MB`
                : "No build published yet"}
            </small>
          </div>
          <ChevronRight size={15} />
        </Link>
      </div>

      <div className="riw-set-group">
        <span>LEGAL</span>
        {[["/privacy-policy", "Privacy policy"],
          ["/terms-of-service", "Terms of service"],
          ["/contact", "Contact"],
          ["/affiliate-disclosure", "Affiliate disclosure"]].map(([to, label]) => (
          <Link key={to} to={to} className="riw-set-row">
            <FileText size={16} />
            <div><strong>{label}</strong></div>
            <ChevronRight size={15} />
          </Link>
        ))}
      </div>
    </section>
  );
}
