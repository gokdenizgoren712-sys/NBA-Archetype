/* İlk kurulum — ekranlar 4g ve 4h.
 *
 * 4g: Primary Arch hesabını bağla. RankIt'in ayrı bir kullanıcı veritabanı
 * YOK; giriş Primary Arch sitesinde yapılıyor ve tek kullanımlık bir kodla
 * uygulamaya dönülüyor. Parola uygulamaya hiç girmiyor.
 *
 * 4h: ne izliyorsun? Turnuva ve kulüp takipleri. Kulüp listesi SEÇİLEN
 * turnuvalardan geliyor — önce turnuva, sonra onun kulüpleri.
 *
 * Tasarımın metninden iki sapma, ikisi de ekran yalan söylemesin diye:
 *   * 4g "Your diary stays private until you share a card" diyor. Doğru
 *     değil: bir kayıt varsayılan olarak herkese açık, görünürlüğü kayıt
 *     başına sen seçiyorsun. Satır bunu söylüyor. Sahibinin kararı
 *     (2026-09-12): varsayılan herkese açık kalıyor, düzeltilmiş satır doğru.
 *   * 4h "This only decides what appears on your home" diyor. "Only" yanlış:
 *     takipler serinin dinlenme gecelerini (§7.2) ve "Running hot"u da
 *     belirliyor. "Only" düştü.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, Search } from "lucide-react";
import { Logo } from "../../components/BrandIcons";
import { rankitApi } from "../rankitApi";
import { SkeletonChips, Loading } from "./States";
import { Shield } from "./MatchCard";
import { useBackClose } from "./backStack";
import { useDialog } from "./useDialog";

const INK = "#eceded";
const GOLD = "#ffb11b";
const GREEN = "#3fb08c";

/* 4g — bağlan. `mark` kabuktan geliyor: RankIt işareti §8.1'e göre 9.
   prompt'ta yeniden çiziliyor, burada ikinci bir kopyası olmasın. */
export function ConnectScreen({ mark, busy, error, onConnect, onCreate, onBrowse }) {
  return (
    <main className="ri-first ri-first-connect">
      {/* 4g: yatay kilit -- isaret + "RANK" / altin "IT" + "BY PRIMARY ARCH". */}
      <div className="ri-first-brand">
        {mark}
        <span><strong aria-label="RankIt">RANK<span>IT</span></strong><small>BY PRIMARY ARCH</small></span>
      </div>

      <div className="ri-first-arch">
        <span className="ri-first-arch-mark"><Logo size={104} /></span>
        <strong>PRIMARY ARCH</strong>
      </div>

      <div className="ri-first-copy">
        <h1>One account,<br />every Primary Arch app</h1>
        <p>Your ratings, diary and standing travel with your Primary Arch account.
          Connect it once and RankIt picks up where you left off on any device.</p>
      </div>

      <ul className="ri-first-promises">
        <li><Check size={17} color={GREEN} aria-hidden="true" />Nothing is posted anywhere on your behalf</li>
        <li><Check size={17} color={GREEN} aria-hidden="true" />You choose who sees each entry — everyone, followers or only you</li>
      </ul>

      {error && <p className="ri-auth-error" role="alert">{error}</p>}

      <div className="ri-first-actions">
        <button type="button" className="ri-first-primary" disabled={busy} onClick={onConnect}>
          <i aria-hidden="true" />{busy ? "Connecting…" : "Continue with Primary Arch"}
        </button>
        <button type="button" className="ri-first-secondary" disabled={busy} onClick={onCreate}>Create an account</button>
        <button type="button" className="ri-first-ghost" onClick={onBrowse}>Look around first</button>
      </div>
    </main>
  );
}

function abbr(t) {
  const s = String(t.short_name || t.name || "");
  return s.length <= 3 ? s.toUpperCase() : s.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

/* 4h — ne izliyorsun.
 *
 * Iki kip, tek ekran:
 *   * "first" — ilk kurulum. Yalnizca EKLER (baska bir cihazda yarim kalmis
 *     bir kurulum kimsenin takibini dusurmesin), Skip var, ilerleme cubugu var.
 *   * "edit"  — Settings > Competitions & clubs. Gonderilen kume TAM kume:
 *     secimi kaldirilan birakilir. Skip yok, geri var, dugme "Save".
 */
export function FollowPicker({ onDone, mode = "first", onClose }) {
  const editing = mode === "edit";
  const [comps, setComps] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [clubPick, setClubPick] = useState(() => new Set());
  // Kulüp listesini SEÇİMLE birlikte tutuyoruz: "hangi seçim yükleniyor"
  // böyle türetiliyor, efektin başında state sıfırlamak gerekmiyor.
  const [clubs, setClubs] = useState({ key: null, rows: [] });
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState([]);
  const [saving, setSaving] = useState(false);
  // Aranip secilen ya da zaten takip edilen kulup, oneri listesinde yoksa
  // yine gorunur kalmali.
  const [extra, setExtra] = useState([]);
  useBackClose(editing ? onClose : null);
  // Ilk kurulumda bu ekran uygulamanin KENDISI -- kapanacak bir sey yok,
  // arkasinda da bir sey yok. Dialog yalnizca Ayarlar'dan acilan duzenleme
  // kipinde: o zaman ustunde durdugu bir ekran var.
  const dialog = useDialog({ onClose, label: "Competitions and clubs", active: editing });

  useEffect(() => {
    rankitApi.onboarding("").then((d) => {
      setComps(d.competitions || []);
      // Var olan takipler isaretli gelir. Kulupler ONERI listesinden degil,
      // takip edilenlerin tamamindan: onerilmeyen bir takip gorunmezse
      // duzenleyicide birakilamaz.
      setPicked(new Set(d.followed_competition_ids || []));
      const mine = d.followed_clubs || [];
      setClubPick(new Set(mine.map((c) => c.id)));
      setExtra(mine);
    }).catch(() => setComps([]));
  }, []);

  const key = [...picked].sort((a, b) => a - b).join(",");
  useEffect(() => {
    let alive = true;
    rankitApi.onboarding(key)
      .then((d) => alive && setClubs({ key, rows: d.clubs || [] }))
      .catch(() => alive && setClubs({ key, rows: [] }));
    return () => { alive = false; };
  }, [key]);

  useEffect(() => {
    if (query.trim().length < 2) return undefined;
    const t = setTimeout(() => {
      rankitApi.search(query.trim(), "Teams").then((d) => setFound(d.teams || [])).catch(() => setFound([]));
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  const tiles = useMemo(() => {
    const seen = new Set();
    return [...clubs.rows, ...extra].filter((t) => !seen.has(t.id) && seen.add(t.id));
  }, [clubs.rows, extra]);

  // FONKSIYONEL guncelleme SART: kapanistaki kumeyi okumak, iki hizli
  // dokunusta ikisinin de ayni (eski) kumeden baslamasi demek -- ikinci
  // secim birinciyi siliyordu (olculdu: iki karo, "1 PICKED").
  const toggle = (setter, id) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const finish = async (skipped) => {
    setSaving(true);
    try {
      const value = { competitions: [...picked], clubs: [...clubPick], skipped };
      const r = editing ? await rankitApi.setSources(value) : await rankitApi.saveOnboarding(value);
      onDone(r);
    } catch { setSaving(false); }
  };

  const screen = (
    <main {...dialog} className={`ri-first ri-first-follow${editing ? " edit" : ""}`}>
      <div className="ri-first-top">
        {editing ? <>
          <button type="button" className="ri-first-back" onClick={onClose} aria-label="Back"><ChevronLeft size={16} /></button>
          <span className="ri-first-top-title">Competitions &amp; clubs</span>
        </> : <>
          {/* Ilerleme: tasarim UC basamak ciziyor ama ucuncusu hicbir yerde
              tanimli degil. Var olan iki adim: baglan (bitti) ve bu ekran. */}
          <div className="ri-first-steps" aria-label="Step 2 of 2"><i className="on" /><i className="on" /></div>
          <button type="button" className="ri-first-skip" disabled={saving} onClick={() => finish(true)}>Skip</button>
        </>}
      </div>
      <div className="ri-first-scroll">
        {!editing && <div className="ri-first-copy left">
          <h1>What do you<br />actually watch?</h1>
          <p>Pick the competitions and clubs you follow. This decides what your home shows first —
            you can rate any match in the world regardless.</p>
        </div>}

        <div className="ri-chip-title">COMPETITIONS · {picked.size} PICKED</div>
        {comps === null && <Loading label="Loading competitions"><SkeletonChips/></Loading>}
        <div className="ri-first-chips">
          {(comps || []).map((c) => (
            <button key={c.id} type="button" aria-pressed={picked.has(c.id)}
              className={picked.has(c.id) ? "on" : undefined}
              onClick={() => toggle(setPicked, c.id)}>
              {/* Secilince kucuk elmas, tik degil -- 4h boyle ciziyor. */}
              {picked.has(c.id) && <i className="ri-first-chip-mark" aria-hidden="true" />}{c.name}
            </button>
          ))}
        </div>

        <div className="ri-chip-title">CLUBS · {clubPick.size} PICKED</div>
        <div className="ri-first-clubs">
          {tiles.map((t) => (
            <button key={t.id} type="button" aria-pressed={clubPick.has(t.id)}
              className={clubPick.has(t.id) ? "on" : undefined}
              onClick={() => toggle(setClubPick, t.id)}>
              <Shield side={46} color={t.color || GOLD} ink={INK} abbr={abbr(t)} crestUrl={t.crest_url}
                badgeScale={0.26} ring={clubPick.has(t.id) ? `2px solid ${GOLD}` : null} />
              <span>{t.short_name || t.name}</span>
            </button>
          ))}
          {/* Sekizinci karo arama: kesik cizgili elmas, dokununca alan acilir. */}
          <button type="button" className="ri-first-club-search" aria-expanded={searching}
            onClick={() => setSearching((v) => !v)}>
            <i aria-hidden="true"><Search size={16} /></i>
            <span>Search</span>
          </button>
        </div>
        {searching && (
          <label className="ri-find-field ri-first-search-field">
            <Search size={15} aria-hidden="true" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Any club" aria-label="Search clubs" />
          </label>
        )}
        {searching && query.trim().length >= 2 && (
          <div className="ri-first-found">
            {found.slice(0, 6).map((t) => (
              <button key={t.id} type="button" onClick={() => {
                setExtra((v) => [...v, t]);
                setClubPick((s) => new Set(s).add(t.id));
                setQuery(""); setFound([]);
              }}>
                <strong>{t.name}</strong><small>{t.sport}</small>
              </button>
            ))}
            {!found.length && <p className="ri-companion-note">No club by that name.</p>}
          </div>
        )}
      </div>
      <div className="ri-first-cta">
        <button type="button" className="ri-first-primary" disabled={saving} onClick={() => finish(false)}>
          {editing ? (saving ? "Saving…" : "Save") : (saving ? "Building…" : "Build my home")}
        </button>
      </div>
    </main>
  );
  // Duzenleyici uygulamanin ICINDE aciliyor: donusumlu atalardan kacmak icin
  // .rankit-app'e portal (bkz. Settings.jsx). Ilk kurulum zaten kabugun disinda.
  const host = editing ? document.querySelector(".rankit-app") : null;
  return host ? createPortal(screen, host) : screen;
}
