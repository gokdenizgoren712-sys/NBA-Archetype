import { useNavigate } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";

// 404 (handoff 18d). Önceden `path="*"` rotası yoktu; hatalı bir adres boş
// bir kabuk açıyordu.
export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="pa-state">
      <SEO title="Page not found" description="This page doesn't exist." path="/404" noindex />
      <span className="pa-state-glow" />
      <span className="pa-state-code">404</span>
      <span className="pa-state-title">Airball.</span>
      <span className="pa-state-body">This page doesn't exist, or the player moved teams.</span>
      <div className="pa-state-actions">
        <button className="pa-btn-secondary" onClick={() => navigate("/basketball/players")}>Search players</button>
        <button className="pa-btn-primary" onClick={() => navigate("/")}>Go home</button>
      </div>
    </div>
  );
}
