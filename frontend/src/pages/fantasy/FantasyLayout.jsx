// /basketball/fantasy/* ortak düzeni: bağlam + format çubuğu + sayfa + lig ayarları.
// Sayfalar kendi chunk'larında; Suspense burada ki alt sayfa inerken çubuk kalsın.
import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import LeagueSettings from "./LeagueSettings";
import { FantasyBar, SkeletonList } from "./ui";
import { FantasyProvider, useFantasy } from "./useFantasy";
import "./fantasy.css";

function Inner() {
  const f = useFantasy();
  return (
    <div className="fz pa-grid">
      <FantasyBar />
      <Suspense fallback={<div className="fz-page"><SkeletonList rows={6} /></div>}>
        <Outlet />
      </Suspense>
      {f.settingsOpen && <LeagueSettings />}
    </div>
  );
}

export default function FantasyLayout() {
  return <FantasyProvider><Inner /></FantasyProvider>;
}
