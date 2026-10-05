import { Component } from "react";
import { Button } from "../ui";

// 500 sınırı (v3 Account Y7): route çıktısını sarar. Sayfa ağacında fırlayan hata kabuğu (kenar çubuğu,
// başlık) ayakta tutar, yalnız içerik alanında bu sayfa görünür. Başarısız lazy chunk için ayrı mesaj ve
// yeniden yükle düğmesi. `ref` satırı yalnız hatanın üzerinde bir istek kimliği varsa yazılır (uydurmuyoruz).

export const isChunkError = (err) =>
  /Loading chunk|dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(String(err?.message || err || ""));

export function ServerErrorPage({ error, onRetry, onHome }) {
  const chunk = isChunkError(error);
  const at = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const ref = error?.requestId || error?.ref;
  return (
    <div className="pa-sys-center left">
      <div className="pa-sys bare" role="alert">
        <p className="pa-eyebrow">{chunk ? "Update · New version" : "500 · Server error"}</p>
        <p className="pa-error-code">{chunk ? "NEW" : "500"}</p>
        <h1 className="pa-sys-title">{chunk ? "A new version is out" : "Something broke on our side"}</h1>
        <p className="pa-sys-body">
          {chunk
            ? "This page was updated while you were using it. Reload to get the latest version. Nothing you saved was lost."
            : "The page hit an error. It isn't your connection and nothing you saved was lost. Try again in a moment."}
        </p>
        <div className="pa-sys-actions">
          <Button variant="primary" onClick={chunk ? () => window.location.reload() : onRetry}>{chunk ? "Reload" : "Try again"}</Button>
          {!chunk && <Button variant="outline" onClick={onHome}>Go home</Button>}
        </div>
        <p className="pa-eyebrow">{chunk ? "" : `Error 500 · ${at}${ref ? ` · Ref ${String(ref).toUpperCase()}` : ""}`}</p>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  state = { error: null, key: this.props.resetKey };
  static getDerivedStateFromError(error) { return { error }; }
  static getDerivedStateFromProps(props, state) {
    // Başka sayfaya gidilince hata temizlenir.
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  componentDidCatch(error, info) { console.error("Route error:", error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ServerErrorPage error={this.state.error}
        onRetry={() => this.setState({ error: null })}
        onHome={() => { this.setState({ error: null }); window.location.assign("/"); }} />
    );
  }
}
