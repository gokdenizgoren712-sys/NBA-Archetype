import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TipTapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useAuth } from "../../contexts/AuthContext";
import AdminLayout from "./AdminLayout";

const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

function authFetch(path, token, opts = {}) {
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
// Görsel yükleme: önce İMZALI yol — gizli anahtar sunucuda, tarayıcı yalnız
// bu yüklemenin imzasını görür. Sunucuda imza yapılandırılmamışsa (503) geçiş
// dönemi için eski imzasız preset'e düşer.
async function cloudinaryUpload(file, token) {
  const fd = new FormData();
  fd.append("file", file);
  let cloud = CLOUD;
  const sig = await authFetch("/admin/cloudinary/sign", token, { method: "POST" });
  if (sig.ok) {
    const s = await sig.json();
    cloud = s.cloud_name;
    for (const k of ["api_key", "timestamp", "signature", "folder"]) fd.append(k, s[k]);
  } else if (CLOUD && PRESET) {
    fd.append("upload_preset", PRESET);
  } else {
    throw new Error("Image uploads are not configured on the server.");
  }
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: fd });
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || "Upload failed");
  return data.secure_url;
}

function Toolbar({ editor, onImageUpload, uploading }) {
  if (!editor) return null;
  const btn = (action, label, active = false, title = label) => (
    <button type="button" onClick={action} title={title} aria-pressed={active} className={active ? "on" : ""}>{label}</button>
  );
  const addLink = () => {
    const url = prompt("Link URL");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };
  return (
    <div className="ae-tools" role="toolbar" aria-label="Formatting">
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), "H2", editor.isActive("heading", { level: 2 }), "Heading")}
      {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), "H3", editor.isActive("heading", { level: 3 }), "Subheading")}
      <i />
      {btn(() => editor.chain().focus().toggleBold().run(), "B", editor.isActive("bold"), "Bold")}
      {btn(() => editor.chain().focus().toggleItalic().run(), "I", editor.isActive("italic"), "Italic")}
      {btn(() => editor.chain().focus().toggleStrike().run(), "S", editor.isActive("strike"), "Strikethrough")}
      <i />
      {btn(() => editor.chain().focus().toggleBulletList().run(), "List", editor.isActive("bulletList"), "Bulleted list")}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), "1.", editor.isActive("orderedList"), "Numbered list")}
      {btn(() => editor.chain().focus().toggleBlockquote().run(), "Quote", editor.isActive("blockquote"), "Pull quote")}
      {btn(() => editor.chain().focus().setHorizontalRule().run(), "Rule", false, "Divider")}
      <i />
      {btn(addLink, "Link", editor.isActive("link"))}
      <label className="ae-upload">
        {uploading ? "Uploading…" : "Image"}
        <input type="file" accept="image/*" hidden onChange={onImageUpload} disabled={uploading} />
      </label>
    </div>
  );
}

/* ── Ana bileşen ─────────────────────────────────────────────────────────── */
export default function ArticleEditor() {
  const { token, isAdmin, isLoggedIn } = useAuth();
  const navigate  = useNavigate();
  const { id }    = useParams(); // mevcut makale id'si (edit modunda)
  const isEdit    = !!id;

  const [meta, setMeta] = useState({ title: "", slug: "", cover_image_url: "", status: "draft" });
  const [loading, setLoading]   = useState(isEdit);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState("");
  const [saved, setSaved]       = useState(false);
  const [savedAt, setSavedAt]   = useState(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      TipTapLink.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "outline-none ae-body",
      },
    },
  });

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) { navigate("/login"); return; }
    if (!isEdit) return;
    authFetch(`/admin/articles`, token).then(r => r.json()).then(d => {
      const art = (d.articles || []).find(a => a.id === parseInt(id));
      if (!art) { navigate("/admin/articles"); return; }
      setMeta({ title: art.title, slug: art.slug, cover_image_url: art.cover_image_url || "", status: art.status });
      // Load full content separately
      fetch(`/api/articles/${art.slug}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(full => { if (editor) editor.commands.setContent(full.content || ""); });
    }).finally(() => setLoading(false));
  }, [editor, isEdit]);

  const slugify = (str) => str.toLowerCase().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").slice(0, 80);

  const uploadImage = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await cloudinaryUpload(file, token);
      editor?.chain().focus().setImage({ src: url }).run();
    } catch (err) { setError(`Image upload failed: ${err.message}`); }
    finally { setUploading(false); e.target.value = ""; }
  }, [editor, token]);

  const uploadCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await cloudinaryUpload(file, token);
      setMeta(m => ({ ...m, cover_image_url: url }));
    } catch (err) { setError(`Image upload failed: ${err.message}`); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const save = async (status = meta.status) => {
    setError(""); setSaving(true);
    try {
      const body = { ...meta, status, content: editor?.getHTML() || "" };
      if (!body.slug) body.slug = slugify(body.title);
      const path  = isEdit ? `/admin/articles/${id}` : "/admin/articles";
      const method = isEdit ? "PUT" : "POST";
      const res = await authFetch(path, token, { method, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "It wasn't saved. Try again.");
      setSaved(true); setSavedAt(Date.now());
      if (!isEdit) navigate(`/admin/articles/${data.id}/edit`, { replace: true });
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <AdminLayout title="Content"><div className="pa-skel" style={{ height: 420, borderRadius: 16 }} /></AdminLayout>;

  const live = meta.status === "published" && meta.slug;
  return (
    <>
    <AdminLayout title={isEdit ? "Edit article" : "New article"} wide aside={
      <span className="ad-note" role="status">
        {error ? <span style={{ color: "#f87171" }}>{error}</span> : saving ? "Saving…" : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : isEdit ? "No unsaved changes" : "Not saved yet"}
      </span>
    }>
      <div className="ae-grid">
        <div className="ae-main">
          <Link to="/admin/articles" className="ae-back">← All articles</Link>
          <Toolbar editor={editor} onImageUpload={uploadImage} uploading={uploading} />
          <textarea className="ae-title" rows={1} placeholder="Title" aria-label="Title"
            value={meta.title}
            onChange={e => setMeta(m => ({ ...m, title: e.target.value, slug: isEdit ? m.slug : slugify(e.target.value) }))} />
          <div className="ae-content"><EditorContent editor={editor} /></div>
        </div>

        <aside className="ae-side">
          <div className="ae-btns">
            {live
              ? <a className="ad-btn ghost" href={`/blog/${meta.slug}`} target="_blank" rel="noopener noreferrer">View live</a>
              : <button className="ad-btn ghost" onClick={() => save("draft")} disabled={saving}>Save draft</button>}
            <button className="ad-btn" onClick={() => save("published")} disabled={saving || !meta.title.trim()}>
              {meta.status === "published" ? "Update" : "Publish"}
            </button>
          </div>
          {meta.status === "published" && (
            <button className="ad-link" style={{ alignSelf: "flex-start" }} onClick={() => save("draft")} disabled={saving}>Unpublish (back to draft)</button>
          )}
          <label className="ae-field">
            <span>Slug</span>
            <input value={meta.slug} onChange={e => setMeta(m => ({ ...m, slug: e.target.value }))} placeholder="made from the title" />
            <em>/blog/{meta.slug || "…"}</em>
          </label>
          <div className="ae-field">
            <span>Status</span>
            <b className="ad-status" style={{ "--c": meta.status === "published" ? "#4ade80" : "#b4afa8" }}><i />{meta.status === "published" ? "Published" : "Draft"}</b>
          </div>
          <div className="ae-field">
            <span>Cover image</span>
            {meta.cover_image_url
              ? <img src={meta.cover_image_url} alt="" className="ae-cover" />
              : <div className="ae-cover empty">No cover — the blog uses archetype art if the title names one</div>}
            <div className="ad-actions" style={{ justifyContent: "flex-start" }}>
              <label className="ad-sm" style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                {uploading ? "Uploading…" : meta.cover_image_url ? "Replace" : "Upload"}
                <input type="file" accept="image/*" hidden onChange={uploadCover} disabled={uploading} />
              </label>
              {meta.cover_image_url && <button className="ad-sm" onClick={() => setMeta(m => ({ ...m, cover_image_url: "" }))}>Remove</button>}
            </div>
          </div>
        </aside>
      </div>
    </AdminLayout>

    <style>{`
      .tiptap h1 { font-size:1.8em; font-weight:700; margin:1em 0 .5em; }
      .tiptap h2 { font-size:1.4em; font-weight:700; margin:1em 0 .5em; }
      .tiptap h3 { font-size:1.1em; font-weight:600; margin:1em 0 .4em; }
      .tiptap p  { margin:.5em 0; line-height:1.7; }
      .tiptap ul { list-style:disc; padding-left:1.5em; margin:.5em 0; }
      .tiptap ol { list-style:decimal; padding-left:1.5em; margin:.5em 0; }
      .tiptap blockquote { margin:1em 0; font-family:var(--font-logo); font-size:1.6em; font-weight:700; line-height:1.2; color:#FFB11B; }
      .tiptap code { font-family:monospace; background:var(--bg-elevated); padding:.1em .3em; border-radius:3px; font-size:.9em; }
      .tiptap img { max-width:100%; border-radius:6px; margin:1em 0; }
      .tiptap hr { border:none; border-top:1px solid var(--border); margin:1.5em 0; }
      .tiptap a { color:var(--accent); text-decoration:underline; }
      .tiptap p.is-editor-empty:first-child::before {
        content: attr(data-placeholder); color:var(--text-muted); pointer-events:none; float:left; height:0;
      }
    `}</style>
    </>
  );
}
