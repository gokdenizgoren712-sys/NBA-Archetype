import { useNavigate } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { Button } from "../ui";

// 404: v3 düz panel, ama metin ve düğme sırası eski "Airball" sürümü (kullanıcı kararı, QA 1.2).
export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="pa-sys-center">
      <SEO title="Page not found" description="This page doesn't exist." path="/404" noindex />
      <div className="pa-sys">
        <p className="pa-eyebrow">404 · Page not found</p>
        <h1 className="pa-sys-title">Airball.</h1>
        <p className="pa-sys-body">This page doesn't exist, or the player moved teams.</p>
        <div className="pa-sys-actions">
          <Button variant="outline" onClick={() => navigate("/basketball/players")}>Search players</Button>
          <Button variant="primary" onClick={() => navigate("/")}>Go home</Button>
        </div>
      </div>
    </div>
  );
}
