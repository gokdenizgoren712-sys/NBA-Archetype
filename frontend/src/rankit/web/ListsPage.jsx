/* 12b — listeler (BUILD §24: "A list is yours; a collection is the
 * product's"). Liste: yazar, paylaş, keyfî üyelik. Koleksiyon (12c): halka
 * ve ödül. Benzer görünürler, farklı davranırlar — bileşenler birleşmez.
 *
 *   sol    340: YOUR LISTS · N + New · her liste "12 matches · 8 rated" /
 *          "private" / "34 respects" · SAVED FROM OTHERS "by @deniz"
 *   sağ    LIST BY @SELIN · PUBLIC · başlık · açıklama · Share / Edit
 *          (başkasının listesinde Share / Respect / Save) · 8/12 rated
 *          çubuğu · beş sütun kart; oynanmamış maç karo ("Next in the list")
 *
 * Seçili liste adreste (`/rankit/lists/:listId`); başka birinin herkese
 * açık listesi de burada açılır (arama, üye profili). Veri `/lists/mine`,
 * `/lists/{id}`.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Share2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { rankitApi } from "../rankitApi";
import SharedMatchCard from "../redesign/MatchCard";
import MatchTile from "./MatchTile";
import { compactCardProps, dateEyebrow, listProgress, ownedListLine, savedListLine } from "./pagesView";

// Görünürlük etiketi (§13.2 taraması bir `followers:` anahtarını sayaç sanmasın diye çift dizisi).
const VISIBILITY = new Map([["public", "PUBLIC"], ["followers", "FOLLOWERS ONLY"], ["private", "PRIVATE"]]);

function ListButton({ list, line, active, onPick }) {
  return (
    <button type="button" className={`riw-lists-item${active ? " is-on" : ""}`} aria-current={active ? "true" : undefined} onClick={() => onPick(list.id)}>
      <strong>{list.title}</strong>
      <small>{line}</small>
    </button>
  );
}

function CreateForm({ onCreated, onCancel }) {
  const [title, setTitle] = useState("");
  const [ranked, setRanked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true); setError("");
    try {
      const r = await rankitApi.createList({ title: t, ranked, match_ids: [] });
      onCreated(r.list_id);
    } catch (e) { setError(String(e.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <form className="riw-lists-form" onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} aria-label="New list title" placeholder="Name a new list" autoFocus />
      <label><input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} /> Ranked</label>
      <div>
        <button type="submit" disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create"}</button>
        <button type="button" className="is-quiet" onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="riw-note" role="alert">{error}</p>}
      <p className="riw-lists-hint">Add matches from any match's Inspector — "Add to list".</p>
    </form>
  );
}

function EditForm({ list, onSaved, onCancel }) {
  const [title, setTitle] = useState(list.title || "");
  const [description, setDescription] = useState(list.description || "");
  const [visibility, setVisibility] = useState(list.visibility || "public");
  const [ranked, setRanked] = useState(!!list.ranked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true); setError("");
    try { await rankitApi.updateList(list.id, { title: title.trim(), description, visibility, ranked }); onSaved(); }
    catch (e) { setError(String(e.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <form className="riw-lists-edit" onSubmit={submit} aria-label="Edit the list">
      <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required /></label>
      <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} /></label>
      <div className="riw-lists-edit-row">
        <label>Who can see it
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="public">Everyone</option>
            <option value="followers">Followers</option>
            <option value="private">Only you</option>
          </select>
        </label>
        <label className="is-check"><input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} /> Ranked</label>
      </div>
      <div className="riw-lists-edit-actions">
        <button type="submit" disabled={busy || !title.trim()}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="is-quiet" onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="riw-note" role="alert">{error}</p>}
    </form>
  );
}

function Detail({ listId, isLoggedIn, hideScores, onOpenMatch, onChanged }) {
  const [state, setState] = useState({ id: null, data: null, error: "" });
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [social, setSocial] = useState(null);

  useEffect(() => {
    let alive = true;
    rankitApi.list(listId)
      .then((data) => alive && setState({ id: listId, data, error: "" }))
      .catch((e) => alive && setState({ id: listId, data: null, error: e.status === 404 ? "This list is private or no longer exists." : String(e.message || e) }));
    return () => { alive = false; };
  }, [listId, version]);

  const data = state.id === listId ? state.data : null;
  if (state.error && state.id === listId) return <div className="riw-page-empty riw-profile-empty"><strong>List unavailable</strong><p>{state.error}</p></div>;
  if (!data) return <div className="riw-read-skeleton" aria-busy="true" />;

  const list = data.list;
  const matches = data.matches || [];
  const played = matches.filter((m) => m.status !== "upcoming");
  const upcoming = matches.filter((m) => m.status === "upcoming").sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  const progress = listProgress(matches);
  const s = social || { respect: data.respect, respected: data.respected, saves: data.saves, saved: data.saved };

  const share = async () => {
    const url = `${window.location.origin}/rankit/lists/${list.id}`;
    try { await navigator.clipboard.writeText(url); setNote("Link copied"); }
    catch { setNote(url); }
  };
  const toggle = async (kind) => {
    const on = kind === "respect" ? !s.respected : !s.saved;
    try {
      const r = kind === "respect" ? await rankitApi.respectList(list.id, on) : await rankitApi.saveList(list.id, on);
      setSocial({ ...s, ...(kind === "respect"
        ? { respected: r.respected ?? on, respect: r.respect ?? s.respect + (on ? 1 : -1) }
        : { saved: r.saved ?? on, saves: r.saves ?? s.saves + (on ? 1 : -1) }) });
      if (kind === "save") onChanged();
    } catch { setNote("That didn't go through — try again."); }
  };

  return (
    <section className="riw-lists-detail" aria-labelledby="riw-list-title">
      <div className="riw-lists-head">
        <div>
          <p className="riw-page-eyebrow">LIST BY @{String(list.username || "").toUpperCase()} · {VISIBILITY.get(list.visibility) || "PUBLIC"}{list.ranked ? " · RANKED" : ""}</p>
          <h1 id="riw-list-title">{list.title}</h1>
          {list.description && <p className="riw-lists-desc">{list.description}</p>}
        </div>
        <div className="riw-sortbar" role="group" aria-label="List actions">
          {list.visibility !== "private" && <button type="button" onClick={share}><Share2 size={14} aria-hidden="true" /> Share</button>}
          {data.is_owner && <button type="button" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>Edit</button>}
          {!data.is_owner && isLoggedIn && <>
            <button type="button" aria-pressed={!!s.respected} onClick={() => toggle("respect")}>{s.respected ? "Respected" : "Respect"}</button>
            <button type="button" aria-pressed={!!s.saved} onClick={() => toggle("save")}>{s.saved ? "Saved" : "Save"}</button>
          </>}
        </div>
      </div>
      {note && <p className="riw-lists-note" role="status">{note}</p>}
      {editing && <EditForm list={list} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setVersion((v) => v + 1); onChanged(); }} />}

      <div className="riw-lists-progress">
        <span><b>{progress.rated}<small>/{progress.total}</small></b> rated</span>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct} aria-label="Matches in this list you have rated"><i style={{ width: `${progress.pct}%` }} /></div>
        <small>{(s.respect || 0).toLocaleString()} {s.respect === 1 ? "respect" : "respects"} · {(s.saves || 0).toLocaleString()} {s.saves === 1 ? "save" : "saves"}</small>
      </div>

      {matches.length ? (
        <div className="riw-lists-grid">
          {played.map((m) => (
            <div key={m.id} className="riw-card-slot riw-shelf-slot is-community" role="button" tabIndex={0}
              aria-label={`${m.home?.name} versus ${m.away?.name}`}
              onClick={(event) => { if (!event.target.closest("button")) onOpenMatch(m.id); }}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenMatch(m.id); }
              }}>
              <SharedMatchCard {...compactCardProps(m, { hideScores, eyebrow: `${list.ranked ? `#${matches.indexOf(m) + 1} · ` : ""}${dateEyebrow(m.starts_at)}` })} crestSize={34} artHeight={56} cut={14} />
            </div>
          ))}
          {upcoming.map((m, i) => <MatchTile key={m.id} kind={i === 0 ? "next" : "missing"} match={m} nextLabel="Next in the list" onOpen={onOpenMatch} />)}
        </div>
      ) : (
        <div className="riw-page-empty riw-profile-empty">
          <strong>No matches in this list yet</strong>
          <p>{data.is_owner ? "Open any match and use \"Add to list\" in its Inspector." : "Its author hasn't added any matches yet."}</p>
        </div>
      )}
    </section>
  );
}

export default function ListsPage({ listId, hideScores, onOpenMatch }) {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [mine, setMine] = useState(null);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let alive = true;
    rankitApi.listsMine().then((d) => alive && setMine(d)).catch(() => alive && setMine({ owned: [], saved: [] }));
    return () => { alive = false; };
  }, [isLoggedIn, version]);

  const owned = mine?.owned || [];
  const saved = mine?.saved || [];
  const selected = listId || owned[0]?.id || saved[0]?.id || null;
  const pick = (id) => navigate(`/rankit/lists/${id}`);

  return (
    <div className="riw-page riw-lists">
      <aside className="riw-lists-side" aria-label="Your lists">
        {isLoggedIn ? (
          <>
            <div className="riw-lists-sidehead">
              <h2 className="riw-page-eyebrow">YOUR LISTS{mine ? ` · ${owned.length}` : ""}</h2>
              <button type="button" className="riw-lists-new" aria-expanded={creating} onClick={() => setCreating((v) => !v)}><Plus size={13} aria-hidden="true" /> New</button>
            </div>
            {creating && <CreateForm onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); setVersion((v) => v + 1); if (id) pick(id); }} />}
            {!mine && <div className="riw-read-skeleton" aria-busy="true" />}
            {mine && (owned.length
              ? <div className="riw-lists-stack">{owned.map((l) => <ListButton key={l.id} list={l} line={ownedListLine(l)} active={l.id === selected} onPick={pick} />)}</div>
              : <p className="riw-page-fine riw-lists-fine">No lists yet — a season, a rivalry, a run of finals.</p>)}
            {!!saved.length && (
              <>
                <h2 className="riw-page-eyebrow riw-lists-saved">SAVED FROM OTHERS</h2>
                <div className="riw-lists-stack">{saved.map((l) => <ListButton key={l.id} list={l} line={savedListLine(l)} active={l.id === selected} onPick={pick} />)}</div>
              </>
            )}
            <p className="riw-lists-about">A list is yours to define. A <Link to="/rankit/hunt">collection</Link> is the product's, and you complete it.</p>
          </>
        ) : (
          <div className="riw-page-empty riw-profile-empty">
            <strong>Sign in to build lists</strong>
            <p>A list is any set of matches worth keeping together. <Link to="/login?next=/rankit/lists">Sign in</Link></p>
          </div>
        )}
      </aside>

      <div className="riw-lists-main">
        {selected
          ? <Detail key={selected} listId={selected} isLoggedIn={isLoggedIn} hideScores={hideScores} onOpenMatch={onOpenMatch} onChanged={() => setVersion((v) => v + 1)} />
          : mine && (
            <div className="riw-page-empty riw-profile-empty">
              <strong>Make your first list</strong>
              <p>Name it on the left, then add matches from any match's Inspector.</p>
            </div>
          )}
      </div>
    </div>
  );
}
