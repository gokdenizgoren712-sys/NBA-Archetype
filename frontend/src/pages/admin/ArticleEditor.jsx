import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TipTapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useAuth } from "../../contexts/AuthContext";
import { SEO } from "../../hooks/useSEO";

const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

function authFetch(path, token, opts = {}) {
  return fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
  });
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
function Toolbar({ editor, onImageUpload, uploading }) {
  if (!editor) return null;

  const btn = (action, label, active = false) => (
    <button type="button"
      onClick={action}
      title={label}
      className="px-2 py-1 rounded text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--accent)" : "var(--bg-elevated)",
        color: active ? "#000" : "var(--text-primary)",
        border: "1px solid var(--border)",
      }}>
      {label}
    </button>
  );

  const addLink = () => {
    const url = prompt("URL gir:");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
      {btn(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), "H1", editor.isActive("heading", { level: 1 }))}
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), "H2", editor.isActive("heading", { level: 2 }))}
      {btn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), "H3", editor.isActive("heading", { level: 3 }))}
      <div className="w-px mx-1" style={{ background: "var(--border)" }} />
      {btn(() => editor.chain().focus().toggleBold().run(), "B", editor.isActive("bold"))}
      {btn(() => editor.chain().focus().toggleItalic().run(), "I", editor.isActive("italic"))}
      {btn(() => editor.chain().focus().toggleStrike().run(), "S̶", editor.isActive("strike"))}
      {btn(() => editor.chain().focus().toggleCode().run(), "`", editor.isActive("code"))}
      <div className="w-px mx-1" style={{ background: "var(--border)" }} />
      {btn(() => editor.chain().focus().toggleBulletList().run(), "• Liste", editor.isActive("bulletList"))}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), "1. Liste", editor.isActive("orderedList"))}
      {btn(() => editor.chain().focus().toggleBlockquote().run(), "❝", editor.isActive("blockquote"))}
      {btn(() => editor.chain().focus().setHorizontalRule().run(), "──")}
      <div className="w-px mx-1" style={{ background: "var(--border)" }} />
      {btn(addLink, "🔗 Link")}
      <label className="px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors"
        style={{
          background: "var(--bg-elevated)",
          color: uploading ? "var(--text-muted)" : "var(--text-primary)",
          border: "1px solid var(--border)",
        }}>
        {uploading ? "Yükleniyor…" : "📷 Fotoğraf"}
        <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} disabled={uploading} />
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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      TipTapLink.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Makaleyi buraya yaz…" }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "outline-none min-h-[400px] p-4",
        style: "color: var(--text-primary)",
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
    if (!CLOUD || !PRESET) {
      alert("Cloudinary env vars ayarlanmamış.\nVITE_CLOUDINARY_CLOUD_NAME ve VITE_CLOUDINARY_UPLOAD_PRESET gerekli.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", PRESET);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.secure_url) editor?.chain().focus().setImage({ src: data.secure_url }).run();
    } catch { alert("Fotoğraf yüklenemedi"); }
    finally { setUploading(false); e.target.value = ""; }
  }, [editor]);

  const uploadCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !CLOUD || !PRESET) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("upload_preset", PRESET);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.secure_url) setMeta(m => ({ ...m, cover_image_url: data.secure_url }));
    } finally { setUploading(false); e.target.value = ""; }
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
      if (!res.ok) throw new Error(data.detail || "Kaydedilemedi");
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      if (!isEdit) navigate(`/admin/articles/${data.id}/edit`, { replace: true });
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="h-full flex items-center justify-center" style={{ color: "var(--text-muted)" }}>Yükleniyor…</div>;

  return (
    <>
    <SEO title={isEdit ? "Makale Düzenle" : "Yeni Makale"} noindex path="/admin/articles/new" />
    <div className="h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="p-4 max-w-4xl mx-auto">

        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4">
          <Link to="/admin/articles" className="text-sm hover:underline" style={{ color: "var(--accent)" }}>
            ← Makaleler
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {error && <span className="text-xs text-red-400">{error}</span>}
            {saved && <span className="text-xs text-green-400">Kaydedildi ✓</span>}
            <button onClick={() => save("draft")} disabled={saving}
              className="px-3 py-1.5 rounded text-sm"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)", opacity: saving ? 0.6 : 1 }}>
              Taslak Kaydet
            </button>
            <button onClick={() => save("published")} disabled={saving}
              className="px-3 py-1.5 rounded text-sm font-semibold"
              style={{ background: "var(--accent)", color: "#000", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Kaydediliyor…" : "Yayınla"}
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="space-y-3 mb-4">
          <input
            type="text"
            placeholder="Başlık"
            value={meta.title}
            onChange={e => setMeta(m => ({ ...m, title: e.target.value, slug: slugify(e.target.value) }))}
            className="w-full px-3 py-2 rounded text-lg font-bold outline-none"
            style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="slug (otomatik)"
              value={meta.slug}
              onChange={e => setMeta(m => ({ ...m, slug: e.target.value }))}
              className="flex-1 px-3 py-1.5 rounded text-sm font-mono outline-none"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            />
            <select
              value={meta.status}
              onChange={e => setMeta(m => ({ ...m, status: e.target.value }))}
              className="px-3 py-1.5 rounded text-sm outline-none"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
              <option value="draft">Taslak</option>
              <option value="published">Yayında</option>
            </select>
          </div>

          {/* Kapak fotoğrafı */}
          <div className="flex items-center gap-3">
            {meta.cover_image_url ? (
              <img src={meta.cover_image_url} alt="Kapak" className="h-16 w-28 object-cover rounded" />
            ) : (
              <div className="h-16 w-28 rounded flex items-center justify-center text-xs"
                style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px dashed var(--border)" }}>
                Kapak yok
              </div>
            )}
            <label className="px-3 py-1.5 rounded text-sm cursor-pointer"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
              {uploading ? "Yükleniyor…" : "Kapak Fotoğrafı Seç"}
              <input type="file" accept="image/*" className="hidden" onChange={uploadCover} disabled={uploading} />
            </label>
            {meta.cover_image_url && (
              <button type="button" onClick={() => setMeta(m => ({ ...m, cover_image_url: "" }))}
                className="text-xs text-red-400">Kaldır</button>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="rounded overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <Toolbar editor={editor} onImageUpload={uploadImage} uploading={uploading} />
          <div style={{ background: "var(--bg-surface)", minHeight: "500px" }}>
            <EditorContent editor={editor} />
          </div>
        </div>

      </div>
    </div>

    <style>{`
      .tiptap h1 { font-size:1.8em; font-weight:700; margin:1em 0 .5em; }
      .tiptap h2 { font-size:1.4em; font-weight:700; margin:1em 0 .5em; }
      .tiptap h3 { font-size:1.1em; font-weight:600; margin:1em 0 .4em; }
      .tiptap p  { margin:.5em 0; line-height:1.7; }
      .tiptap ul { list-style:disc; padding-left:1.5em; margin:.5em 0; }
      .tiptap ol { list-style:decimal; padding-left:1.5em; margin:.5em 0; }
      .tiptap blockquote { border-left:3px solid var(--accent); padding-left:1em; opacity:.8; margin:.5em 0; }
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
