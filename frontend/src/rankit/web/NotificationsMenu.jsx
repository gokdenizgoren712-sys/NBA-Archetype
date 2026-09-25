/* 14b — bildirimler bir BAŞLIK AÇILIR MENÜSÜ, Inspector değil (BUILD §23:
 * "that panel is for things you study").
 *
 *   zil     40, .06 zemin, okunmamışta kırmızı nokta
 *   menü    420 · NOTIFICATIONS · Mark read (yalnız okunmamış varken) ·
 *           kanal grupları: HEAT ALERTS (anahtarı gerçek ayar:
 *           `alerts_running_hot`) · SOCIAL · COLLECTIONS
 *   satır   tam yüzeyi açar, asla Home'u değil: koleksiyon → 12c, liste →
 *           12b, maç → Inspector, takip → takipçiler
 *   §15     hiçbir bildirim puanlamadığın maçı bozmaz: uç skoru zaten
 *           vermiyor; kalkan açıkken puanlamadığın maçın kulüp adları da
 *           düşer. Tahta sıcak maç için "is running hot" yazıyor; telefonun
 *           13a'sı bunu bilerek "has finished" diye kuruyor (puanlamadığın
 *           maçta ısı bir hüküm) — iki yüzey aynı şeyi söylesin diye 13a.
 *
 * Cümleler telefonun 13a'sıyla aynı kaynaktan (AlertSentence).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { rankitApi } from "../rankitApi";
import { AlertSentence } from "../redesign/Alerts";
import { feedAgo, initials } from "../redesign/feedItems";
import { notificationGroups, shieldNotification } from "./pagesView";

export default function NotificationsMenu({ hideScores, onOpenMatch }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [heatOn, setHeatOn] = useState(null);
  const [busy, setBusy] = useState(false);
  const bell = useRef(null);
  const menu = useRef(null);

  const load = useCallback(() => {
    rankitApi.notifications(-new Date().getTimezoneOffset()).then(setData).catch(() => setData({ items: [], unread: 0 }));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    rankitApi.settings().then((s) => alive && setHeatOn(s?.alerts_running_hot !== false)).catch(() => {});
    return () => { alive = false; };
  }, [open]);

  const close = useCallback((refocus = true) => { setOpen(false); if (refocus) bell.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector("button, a")?.focus();
    const onKey = (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    const onDown = (event) => {
      if (!menu.current?.contains(event.target) && !bell.current?.contains(event.target)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open, close]);

  const markRead = async () => {
    if (busy) return;
    setBusy(true);
    try { await rankitApi.markNotificationsRead(); load(); } catch { /* düğme kalır */ }
    finally { setBusy(false); }
  };
  const toggleHeat = async () => {
    const next = !heatOn;
    setHeatOn(next);
    try { await rankitApi.saveSettings({ alerts_running_hot: next }); load(); } catch { setHeatOn(!next); }
  };
  const openItem = (item) => {
    close(false);
    if (item.collection_id) return navigate(`/rankit/hunt/${item.collection_id}`);
    if (item.list_id) return navigate(`/rankit/lists/${item.list_id}`);
    if (item.match_id) return onOpenMatch(item.match_id);
    if (item.kind === "follow") return navigate("/rankit/people?tab=followers");
    return undefined;
  };

  const unread = Number(data?.unread) || 0;
  const groups = notificationGroups((data?.items || []).map((item) => shieldNotification(item, hideScores)));

  return (
    <div className="riw-bell-wrap">
      <button type="button" ref={bell} className={`riw-bell${open ? " on" : ""}`} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} onClick={() => (open ? close() : setOpen(true))}>
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && <i aria-hidden="true" />}
      </button>
      {open && (
        <div className="riw-notify" ref={menu} role="dialog" aria-modal="false" aria-label="Notifications">
          <header>
            <h2>NOTIFICATIONS</h2>
            {unread > 0 && <button type="button" onClick={markRead} disabled={busy}>Mark read</button>}
          </header>
          <div className="riw-notify-body">
            {!data && <div className="riw-rail-skeleton" aria-hidden="true" />}
            {groups.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <div className={`riw-notify-group is-${g.key}`}>
                  <h3>{g.label}</h3>
                  <span aria-hidden="true" />
                  {g.key === "heat" && heatOn !== null && (
                    <button type="button" role="switch" aria-checked={heatOn} aria-label="Heat alerts" className="riw-switch" onClick={toggleHeat}><i /></button>
                  )}
                </div>
                {g.items.length ? (
                  <ul>
                    {g.items.map((item) => (
                      <li key={item.id}>
                        <button type="button" className={`riw-notify-row${item.unread ? " is-unread" : ""}`} onClick={() => openItem(item)}>
                          {g.key === "heat" ? <i className="riw-notify-dot" aria-hidden="true" />
                            : g.key === "collections" ? <span className="riw-hunt-ringbox is-tiny" aria-hidden="true" style={{ "--fill": "conic-gradient(from -90deg,#d43a63,#f5402e .92turn,rgba(255,255,255,.09) .92turn)" }} />
                            : <span className="riw-review-avatar" aria-hidden="true">{initials(item.actor)}</span>}
                          <span>
                            {/* Telefonun 13a kuralı: puanlanmamış maç için "running hot"
                                bir hüküm (§15) — yalnız bittiği ve neden sende olduğu. */}
                            <p>{item.kind === "hot_match"
                              ? <>{item.shielded ? "A match" : <strong>{item.match}</strong>} has finished. {item.reason === "watchlist" ? "It is in your watchlist" : "It is in a competition you follow"}. Rate it before 11:00 to keep the streak.</>
                              : <AlertSentence item={item} rated={!!item.viewer_rated} />}</p>
                            {item.created_at && <small>{feedAgo(item.created_at)}</small>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="riw-notify-none">{g.key === "heat" && heatOn === false ? "Heat alerts are off." : "Nothing here yet."}</p>}
              </section>
            ))}
          </div>
          <footer>
            <p>Streak alerts arrive with push notifications. Every row opens the exact surface, never Home.</p>
            <button type="button" onClick={() => { close(false); navigate("/rankit/profile?view=settings"); }}>Settings</button>
          </footer>
        </div>
      )}
    </div>
  );
}
