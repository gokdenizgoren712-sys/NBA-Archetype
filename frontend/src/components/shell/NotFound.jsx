import { useNavigate } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { Button } from "../ui";

// 404 (v3 Learn L7 "Off the court"): düz panel, mono etiket, iki düğme.
export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="pa-sys-center">
      <SEO title="Page not found" description="This page doesn't exist." path="/404" noindex />
      <div className="pa-sys">
        <p className="pa-eyebrow">404 · Page not found</p>
        <h1 className="pa-sys-title">Off the court</h1>
        <p className="pa-sys-body">That page doesn't exist or has moved. Try search, or head back to the lineup builder.</p>
        <div className="pa-sys-actions">
          <Button variant="primary" onClick={() => navigate("/")}>Back to home</Button>
          <Button variant="outline" onClick={() => navigate("/basketball/players")}>Search players</Button>
        </div>
      </div>
    </div>
  );
}
