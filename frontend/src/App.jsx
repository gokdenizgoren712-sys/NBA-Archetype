import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import "./components/ui/ui.css";
import { useState, useCallback, lazy, Suspense } from "react";
import Footer from "./components/Footer";
import Sidebar from "./components/shell/Sidebar";
import PageBar from "./components/shell/PageBar";
import MobileDrawer from "./components/shell/MobileDrawer";
import NotFound from "./components/shell/NotFound";
import { shellHidden, sportOf, isAuthRoute } from "./components/shell/nav";
import "./components/shell/shell.css";
import TermsBanner from "./components/TermsBanner";
import ErrorBoundary from "./components/shell/ErrorBoundary";
import { MaintenanceGate, MaintenancePage, installMaintenanceWatch } from "./components/shell/Maintenance";
import { ServerErrorPage } from "./components/shell/ErrorBoundary";

installMaintenanceWatch();   // VITE_MAINTENANCE_GATE=1 değilse hiçbir şey yapmaz

// Route sayfaları LAZY — her biri kendi chunk'ına bölünür. Ağır lib'ler böylece
// initial bundle'dan çıkar: tiptap→ArticleEditor chunk'ı, recharts→paylaşılan radar
// chunk'ı, oyun sim→LineupGame chunk'ı. İlk yükte sadece kabuk + router iner.
const Settings       = lazy(() => import("./pages/Settings"));
const Players        = lazy(() => import("./pages/Players"));
const Lineups        = lazy(() => import("./pages/Lineups"));
const ExploreHub      = lazy(() => import("./pages/ExploreHub"));
const FundamentalsHub = lazy(() => import("./pages/FundamentalsHub"));
const LineupGame     = lazy(() => import("./pages/LineupGame"));
const GameModeSelect = lazy(() => import("./pages/GameModeSelect"));
const SameScreenGame = lazy(() => import("./pages/SameScreenGame"));
const WithAFriendGame = lazy(() => import("./pages/WithAFriendGame"));
const OnlineGame     = lazy(() => import("./pages/OnlineGame"));
const Blog           = lazy(() => import("./pages/Blog"));
const BlogPost       = lazy(() => import("./pages/BlogPost"));
const Login          = lazy(() => import("./pages/Login"));
const Register       = lazy(() => import("./pages/Register"));
const Profile        = lazy(() => import("./pages/Profile"));
const ArticleList    = lazy(() => import("./pages/admin/ArticleList"));
const AdminData      = lazy(() => import("./pages/admin/AdminData"));
const ArticleEditor  = lazy(() => import("./pages/admin/ArticleEditor"));
const UserList       = lazy(() => import("./pages/admin/UserList"));
const RankItBroadcasts = lazy(() => import("./pages/admin/RankItBroadcasts"));
const RankItReleases = lazy(() => import("./pages/admin/RankItReleases"));
const RankItDownload = lazy(() => import("./pages/RankItDownload"));
const PhotoLayout     = lazy(() => import("./pages/admin/PhotoLayout"));
const CorrectionList = lazy(() => import("./pages/admin/CorrectionList"));
const LineupModeration = lazy(() => import("./pages/admin/LineupModeration"));
const AdminReports   = lazy(() => import("./pages/admin/Reports"));
// Basketbol fantezi — /basketball/fantasy/* (plan: docs/FANTASY_PLAN.md)
const FantasyLayout      = lazy(() => import("./pages/fantasy/FantasyLayout"));
const FantasyHome        = lazy(() => import("./pages/fantasy/FantasyHome"));
const FantasyRankings    = lazy(() => import("./pages/fantasy/FantasyRankings"));
const FantasyPlayer      = lazy(() => import("./pages/fantasy/FantasyPlayer"));
const FantasyDraftPlan   = lazy(() => import("./pages/fantasy/FantasyDraftPlan"));
const FantasyMock        = lazy(() => import("./pages/fantasy/FantasyMock"));
const FantasyAssistant   = lazy(() => import("./pages/fantasy/FantasyAssistant"));
const FantasySchedule    = lazy(() => import("./pages/fantasy/FantasySchedule"));
const FantasySimulator   = lazy(() => import("./pages/fantasy/FantasySimulator"));
const FantasyTrade       = lazy(() => import("./pages/fantasy/FantasyTrade"));
const FantasyWeek        = lazy(() => import("./pages/fantasy/FantasyWeek"));
const FantasySaved       = lazy(() => import("./pages/fantasy/FantasySaved"));
const FantasyMethodology = lazy(() => import("./pages/fantasy/FantasyMethodology"));
const GLeague        = lazy(() => import("./pages/GLeague"));
const NCAAPage       = lazy(() => import("./pages/NCAAPage"));
const EuroLeaguePage = lazy(() => import("./pages/EuroLeaguePage"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword  = lazy(() => import("./pages/ResetPassword"));
const AccountDelete  = lazy(() => import("./pages/AccountDelete"));
const PlayerProfile  = lazy(() => import("./pages/PlayerProfile"));
const SportSelect    = lazy(() => import("./pages/SportSelect"));
const FootballPlayers = lazy(() => import("./pages/football/FootballPlayers"));
const FootballPlayerProfile = lazy(() => import("./pages/football/FootballPlayerProfile"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const FootballLineups = lazy(() => import("./pages/football/FootballLineups"));
const FootballGame    = lazy(() => import("./pages/football/FootballGame"));
const FootballMap     = lazy(() => import("./pages/football/FootballMap"));
const FootballCompare = lazy(() => import("./pages/football/FootballCompare"));
const FootballAbout   = lazy(() => import("./pages/football/FootballAbout"));
const FootballGlossary = lazy(() => import("./pages/football/FootballGlossary"));
const FootballVersus  = lazy(() => import("./pages/football/FootballVersus"));
const FootballModeSelect = lazy(() => import("./pages/football/FootballModeSelect"));
const RankItPrototype = lazy(() => import("./rankit/RankItPrototype"));
// Faz 1 tezgahi: MatchCard izole onizlemesi. Urun ekrani DEGIL, hicbir
// mevcut ekran buna bakmiyor; yalnizca preset dogrulamasi icin bir rota.
const MatchCardPreview = lazy(() => import("./rankit/redesign/MatchCardPreview"));
const RankItWeb = lazy(() => import("./rankit/web/RankItWeb"));
const RankItMobileAuth = lazy(() => import("./pages/RankItMobileAuth"));
const PrivacyPolicy      = lazy(() => import("./pages/legal/PrivacyPolicy"));
const TermsOfService     = lazy(() => import("./pages/legal/TermsOfService"));
const CommunityGuidelines = lazy(() => import("./pages/legal/CommunityGuidelines"));
const ContactDisclaimer  = lazy(() => import("./pages/legal/ContactDisclaimer"));
const AffiliateDisclosure = lazy(() => import("./pages/legal/AffiliateDisclosure"));
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";

/* Eski (spor öneki olmayan) URL'ler → /basketball/*. Query ve hash korunur;
   bu adresler sitemap.xml'e girmişti, kırılmamalı. */
function Legacy({ to }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}
function LegacyPlayer() {
  const { name } = useParams();
  return <Navigate to={`/basketball/players/${encodeURIComponent(name)}`} replace />;
}

/* ── Inner app ───────────────────────────────────────────────────── */
// Lazy sayfa chunk'ı inerken gösterilen hafif fallback (Suspense).
function PageLoading() {
  return (
    <div className="h-full w-full flex items-center justify-center"
         style={{ color: "var(--text-muted)" }}>
      <div className="animate-pulse text-[13px]">Loading…</div>
    </div>
  );
}

/* ── Kabuk (handoff v2) ────────────────────────────────────────────
   Masaüstü: [kenar çubuğu | sayfa başlığı + içerik + footer]. Eski 48px üst
   bar ve 64px ikon rayı kalktı; logo, spor anahtarı ve nav kenar çubuğunda,
   hesap sayfa başlığında. Mobil: başlık menü düğmesini taşır, nav drawer'da.
   RankIt uygulaması kendi rayını ve başlığını taşıdığı için orada kabuk çekilir. */
function Shell({ children }) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const hidden = shellHidden(pathname);
  const bare = pathname === "/";           // kök spor seçimi: kenar çubuğu yok (4a)
  const auth = isAuthRoute(pathname);      // giriş/kayıt: kenar çubuğu ve üst bar yok (10c/17d)
  return (
    <div className="flex h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      {!hidden && !bare && !auth && <Sidebar />}
      <div className="flex-1 min-w-0 flex flex-col">
        {!hidden && !auth && <PageBar onMenu={() => setMenuOpen(true)} />}
        {/* data-sport: sayfanın aksanı sporu izler (handoff kural 6) — bkz. shell.css */}
        <main className="flex-1 min-h-0 overflow-hidden pa-grid" data-sport={sportOf(pathname) || undefined}><ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary></main>
        <TermsBanner />
        <Footer />
      </div>
      {!hidden && <MobileDrawer open={menuOpen} onClose={closeMenu} />}
    </div>
  );
}

function AppInner() {
  return (
    <MaintenanceGate>
    <BrowserRouter>
      <Shell>
            <Suspense fallback={<PageLoading />}>
            <Routes>
              {/* Kök: spor seçimi */}
              <Route path="/"                         element={<SportSelect />} />
              <Route path="/rankit"                   element={<RankItWeb section="home" />} />
              <Route path="/rankit/discover"          element={<RankItWeb section="discover" />} />
              <Route path="/rankit/activity"          element={<RankItWeb section="activity" />} />
              <Route path="/rankit/lists"             element={<RankItWeb section="lists" />} />
              <Route path="/rankit/lists/:listId"     element={<RankItWeb section="lists" />} />
              <Route path="/rankit/hunt"              element={<RankItWeb section="hunt" />} />
              <Route path="/rankit/hunt/:collectionId" element={<RankItWeb section="hunt" />} />
              <Route path="/rankit/people"            element={<RankItWeb section="people" />} />
              <Route path="/rankit/welcome"           element={<RankItWeb section="welcome" />} />
              <Route path="/rankit/card/:entryId"     element={<RankItWeb section="card" />} />
              <Route path="/rankit/profile"           element={<RankItWeb section="profile" />} />
              <Route path="/rankit/search"            element={<RankItWeb section="search" />} />
              {/* Aşama 17 — rayı olmayan masaüstü sayfaları (7f · 7g · 7h). */}
              <Route path="/rankit/shelf"             element={<RankItWeb section="shelf" />} />
              <Route path="/rankit/member/:memberId/shelf" element={<RankItWeb section="shelf" />} />
              <Route path="/rankit/competition/:competitionId" element={<RankItWeb section="competition" />} />
              <Route path="/rankit/competition/:competitionId/heat" element={<RankItWeb section="heat" />} />
              <Route path="/rankit/match/:matchId/reviews" element={<RankItWeb section="reviews" />} />
              {/* Telefon arayüzü: APK bunu paketliyor, web'de de açılabilir kalsın. */}
              <Route path="/rankit/app"               element={<RankItPrototype />} />
              <Route path="/rankit/_preview/match-card" element={<MatchCardPreview />} />
              {/* Yalnız geliştirmede: 500 ve bakım sayfalarını gerçek hata beklemeden görmek için. */}
              {import.meta.env.DEV && <Route path="/_preview/500" element={<ServerErrorPage error={{ requestId: "a91f3c" }} onRetry={() => {}} onHome={() => {}} />} />}
              {import.meta.env.DEV && <Route path="/_preview/maintenance" element={<MaintenancePage info={{ started: new Date(Date.now() - 5400e3), back: new Date(Date.now() + 5400e3) }} onCheck={() => {}} />} />}

              {/* ── Basketbol (mevcut ürünün tamamı) ── */}
              <Route path="/basketball"                     element={<Navigate to="/basketball/game" replace />} />
              <Route path="/basketball/game"                element={<GameModeSelect />} />
              <Route path="/basketball/fantasy"             element={<FantasyLayout />}>
                <Route index                                element={<FantasyHome />} />
                <Route path="rankings"                      element={<FantasyRankings />} />
                <Route path="player/:id"                    element={<FantasyPlayer />} />
                <Route path="draft-plan"                    element={<FantasyDraftPlan />} />
                <Route path="mock"                          element={<FantasyMock />} />
                <Route path="assistant"                     element={<FantasyAssistant />} />
                <Route path="schedule"                      element={<FantasySchedule />} />
                <Route path="simulator"                      element={<FantasySimulator />} />
                <Route path="week"                      element={<FantasyWeek />} />
                <Route path="trade"                      element={<FantasyTrade />} />
                <Route path="saved"                         element={<FantasySaved />} />
                <Route path="methodology"                   element={<FantasyMethodology />} />
              </Route>
              <Route path="/basketball/game/single"         element={<LineupGame />} />
              <Route path="/basketball/game/same-screen"    element={<SameScreenGame />} />
              <Route path="/basketball/game/friend"         element={<WithAFriendGame />} />
              <Route path="/basketball/game/online"         element={<OnlineGame />} />
              <Route path="/basketball/players"             element={<Players />} />
              <Route path="/basketball/players/:name"       element={<PlayerProfile />} />
              <Route path="/basketball/lineups"             element={<Lineups />} />
              <Route path="/basketball/explore"             element={<ExploreHub />} />
              <Route path="/basketball/compare"             element={<ExploreHub />} />
              <Route path="/basketball/affinity"            element={<ExploreHub />} />
              <Route path="/basketball/glossary"            element={<FundamentalsHub />} />
              <Route path="/basketball/about"               element={<FundamentalsHub />} />
              <Route path="/basketball/gleague"             element={<GLeague />} />
              <Route path="/basketball/ncaa"                element={<NCAAPage />} />
              <Route path="/basketball/euroleague"          element={<EuroLeaguePage />} />

              {/* ── Futbol (geliştirme aşaması) ── */}
              <Route path="/football"                 element={<Navigate to="/football/game" replace />} />
              <Route path="/football/players"         element={<FootballPlayers />} />
              <Route path="/football/players/:id"     element={<FootballPlayerProfile />} />
              <Route path="/leaderboard"              element={<Leaderboard />} />
              <Route path="/football/lineups"         element={<FootballLineups />} />
              {/* Basketbolla aynı yapı: /football/game mod seçimi, oyun alt
                  rotalarda. Önceden Spin & Build doğrudan buradaydı ve kafa
                  kafaya modları ayrı bir sayfada gizli kalıyordu. */}
              <Route path="/football/game"            element={<FootballModeSelect />} />
              <Route path="/football/game/single"     element={<FootballGame />} />
              <Route path="/football/game/same-screen" element={<FootballVersus mode="same" />} />
              <Route path="/football/game/friend"     element={<FootballVersus mode="friend" />} />
              <Route path="/football/game/online"     element={<FootballVersus mode="online" />} />
              <Route path="/football/map"             element={<FootballMap />} />
              <Route path="/football/compare"         element={<FootballCompare />} />
              <Route path="/football/about"           element={<FootballAbout />} />
              <Route path="/football/glossary"        element={<FootballGlossary />} />
              {/* Eski adres — paylaşılmış olabilir, kırmıyoruz */}
              <Route path="/football/versus"          element={<Navigate to="/football/game/same-screen" replace />} />

              {/* ── Eski spor-öneksiz URL'ler → /basketball/* (301 muadili) ── */}
              <Route path="/game"                     element={<Legacy to="/basketball/game" />} />
              <Route path="/game/single"              element={<Legacy to="/basketball/game/single" />} />
              <Route path="/game/same-screen"         element={<Legacy to="/basketball/game/same-screen" />} />
              <Route path="/game/friend"              element={<Legacy to="/basketball/game/friend" />} />
              <Route path="/game/online"              element={<Legacy to="/basketball/game/online" />} />
              <Route path="/players"                  element={<Legacy to="/basketball/players" />} />
              <Route path="/players/:name"            element={<LegacyPlayer />} />
              <Route path="/lineups"                  element={<Legacy to="/basketball/lineups" />} />
              <Route path="/explore"                  element={<Legacy to="/basketball/explore" />} />
              <Route path="/compare"                  element={<Legacy to="/basketball/compare" />} />
              <Route path="/affinity"                 element={<Legacy to="/basketball/affinity" />} />
              <Route path="/glossary"                 element={<Legacy to="/basketball/glossary" />} />
              <Route path="/about"                    element={<Legacy to="/basketball/about" />} />
              <Route path="/gleague"                  element={<Legacy to="/basketball/gleague" />} />
              <Route path="/ncaa"                     element={<Legacy to="/basketball/ncaa" />} />
              <Route path="/euroleague"               element={<Legacy to="/basketball/euroleague" />} />
              <Route path="/historical"               element={<Legacy to="/basketball/players" />} />
              {/* Auth */}
              <Route path="/login"                    element={<Login />} />
              <Route path="/rankit/mobile-auth"       element={<RankItMobileAuth />} />
              <Route path="/rankit/download"          element={<RankItDownload />} />
              <Route path="/register"                 element={<Register />} />
              <Route path="/profile"                  element={<Profile />} />
              {/* Blog */}
              <Route path="/blog"                     element={<Blog />} />
              <Route path="/blog/:slug"               element={<BlogPost />} />
              {/* Auth extras */}
              <Route path="/forgot-password"          element={<ForgotPassword />} />
              <Route path="/reset-password"           element={<ResetPassword />} />
              <Route path="/settings"                 element={<Settings />} />
              <Route path="/account/delete"           element={<AccountDelete />} />
              {/* Admin */}
              <Route path="/admin"                    element={<Navigate to="/admin/data" replace />} />
              <Route path="/admin/data"               element={<AdminData />} />
              <Route path="/admin/articles"           element={<ArticleList />} />
              <Route path="/admin/articles/new"       element={<ArticleEditor />} />
              <Route path="/admin/articles/:id/edit"  element={<ArticleEditor />} />
              <Route path="/admin/users"              element={<UserList />} />
              <Route path="/admin/corrections"        element={<CorrectionList />} />
              <Route path="/admin/lineups"            element={<LineupModeration />} />
              <Route path="/admin/reports"            element={<AdminReports />} />
              <Route path="/admin/photo-layout"       element={<PhotoLayout />} />
              <Route path="/admin/rankit-broadcasts"  element={<RankItBroadcasts />} />
              <Route path="/admin/rankit-builds"      element={<RankItReleases />} />
              {/* Legal — taslak, bkz. pages/legal/LegalPageLayout.jsx notu */}
              <Route path="/privacy-policy"           element={<PrivacyPolicy />} />
              <Route path="/terms-of-service"         element={<TermsOfService />} />
              <Route path="/community-guidelines"     element={<CommunityGuidelines />} />
              <Route path="/contact"                  element={<ContactDisclaimer />} />
              <Route path="/affiliate-disclosure"     element={<AffiliateDisclosure />} />
              <Route path="*"                         element={<NotFound />} />
            </Routes>
            </Suspense>
      </Shell>
    </BrowserRouter>
    </MaintenanceGate>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
