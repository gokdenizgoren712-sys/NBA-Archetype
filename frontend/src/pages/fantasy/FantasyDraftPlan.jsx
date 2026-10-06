// Tasarım 5 — Draft sırasına göre plan: pick numaraların ve üç alternatif kurgu.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "../../hooks/useSEO";
import { fz } from "./fantasyApi";
import { ArchChip, ErrorNote, GOOD, BAD, Meter, PROJECTION_INFO, ProbBar, ProjectionTag, ValidationNotice, ordinal, pct } from "./ui";
import { useAsync, useFantasy, useIsPhone } from "./useFantasy";

const NOTES = {
  balanced: "No punt. Stay average-plus everywhere and take five or six categories a week.",
  punt_ft: "Give up free throws to stack bigs who win FG%, rebounds and blocks.",
  punt_fg: "Give up field-goal percentage for high-volume guards and wings.",
  punt_to: "Ignore turnovers and draft usage-heavy creators.",
  punt_ast: "Skip assists and load up on bigs and scoring wings.",
  punt_3pm: "Skip threes for paint scorers and rim protectors.",
  best_value: "Take the highest projected value available at every pick.",
  low_risk: "Same value, but steer away from injury-prone and 33+ players.",
  upside: "Lean on players with the widest upside in their projection band.",
};
const SHOWN_ROUNDS = 6;

function risk(plan, teams) {
  const [a, b] = plan.rank_p10_p90 || [0, 0];
  const spread = (b - a) / teams;
  const l = spread < 0.3 ? "Low" : spread < 0.45 ? "Medium" : "High";
  return { l, c: l === "Low" ? GOOD : l === "High" ? BAD : "#e5e5e5" };
}

function RoundRow({ r, players, compact }) {
  const [t, ...backups] = r.targets;
  const pl = players[String(t?.player_id)];
  return (
    <div className="fz-row" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, ...(compact ? { flexDirection: "column", gap: 2 } : {}) }}>
          <span className="fz-meta" style={{ whiteSpace: "nowrap" }}>R{r.round} · {compact ? "pick " : ""}{r.pick}</span>
          <span style={{ fontSize: compact ? 15 : 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pl?.name || "—"}</span>
        </div>
        <Meter p={t?.available} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {!compact && <ArchChip arch={pl?.archetype} />}
        <span className="fz-meta" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {backups.length ? `Backups ${backups.map((b) => players[String(b.player_id)]?.name).filter(Boolean).join(", ")}` : "No backup needed"}
        </span>
      </div>
    </div>
  );
}

function planSummary(pl, data) {
  const n = pl.category_win_prob ? Object.keys(pl.category_win_prob).length : 0;
  return n
    ? `${pl.expected_category_wins.toFixed(1)} of ${n} cats a week · top half ${pct(pl.top_half_prob)}`
    : `${ordinal(Math.round(pl.expected_rank))} of ${data.teams} · top half ${pct(pl.top_half_prob)}`;
}

function PlanList({ plans, sel, onPick, data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="fz-sub" style={{ fontSize: 13, paddingBottom: 2 }}>{plans.length} builds · best to worst</span>
      {plans.map((pl, i) => (
        <button key={pl.key} className={`fz-planrow${sel.key === pl.key ? " on" : ""}`} onClick={() => onPick(pl.key)}>
          <span className="fz-num rank">{i + 1}</span>
          <span className="body">
            <span className="t">{pl.label}</span>
            <span className="fz-meta">{planSummary(pl, data)}</span>
          </span>
          <span className="fz-meta">{i === 0 ? "Best" : pl.tied_with_best ? "Close call" : ""}</span>
        </button>
      ))}
    </div>
  );
}

function PlanBody({ plan, data, compact }) {
  const [all, setAll] = useState(false);
  const rk = risk(plan, data.teams);
  const cats = plan.category_win_prob ? Object.entries(plan.category_win_prob) : [];
  const rounds = all ? plan.rounds : plan.rounds.slice(0, SHOWN_ROUNDS);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "repeat(3, auto)" : "1fr 1fr", gap: compact ? 24 : 10, justifyContent: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="fz-meta">{cats.length ? "Expected cats won / week" : "Expected finish"}</span>
          <span className="fz-num" style={{ fontSize: compact ? 26 : 28, lineHeight: 1.1 }}>
            {cats.length ? <>{plan.expected_category_wins.toFixed(1)}<span style={{ fontSize: 15, color: "#8a8a8a" }}> / {cats.length}</span></>
              : <>{ordinal(Math.round(plan.expected_rank))}<span style={{ fontSize: 15, color: "#8a8a8a" }}> of {data.teams}</span></>}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="fz-meta">Risk</span>
          <span className="fz-num" style={{ fontSize: compact ? 26 : 28, lineHeight: 1.1, color: rk.c }}>{rk.l}</span>
        </div>
        {compact && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="fz-meta">Top half</span>
            <span className="fz-num" style={{ fontSize: 26, lineHeight: 1.1 }}>{pct(plan.top_half_prob)}</span>
          </div>
        )}
      </div>
      {!compact && (
        <span className="fz-meta">
          Finishes {ordinal(Math.round(plan.rank_p10_p90[0]))}–{ordinal(Math.round(plan.rank_p10_p90[1]))} in 8 of 10 simulated seasons · top half {pct(plan.top_half_prob)}
        </span>
      )}
      {cats.length > 0 && !compact && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {cats.map(([c, p]) => <ProbBar key={c} cat={c} p={p} sm dim={plan.punt.includes(c)} />)}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rounds.map((r) => <RoundRow key={r.round} r={r} players={data.players} compact={compact} />)}
        {plan.rounds.length > SHOWN_ROUNDS && (
          <button className="fz-link" style={{ alignSelf: "flex-start", marginTop: 12, fontSize: 12, color: "#8a8a8a" }} onClick={() => setAll((a) => !a)}>
            {all ? "Show fewer rounds" : `Rounds ${SHOWN_ROUNDS + 1}–${plan.rounds.length}: best available for this build — show all`}
          </button>
        )}
      </div>
      {cats.length > 0 && compact && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="fz-h3" style={{ marginBottom: 4 }}>Category win odds</span>
          {cats.map(([c, p]) => <ProbBar key={c} cat={c} p={p} sm dim={plan.punt.includes(c)} />)}
        </div>
      )}
    </>
  );
}

export default function FantasyDraftPlan() {
  const f = useFantasy();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const [selKey, setSelKey] = useState(null);
  const { data, error, loading, reload } = useAsync(
    () => fz.plans(f.apiFormat, f.apiTeams, f.s, f.projection), JSON.stringify([f.apiFormat, f.apiTeams, f.s, f.projection]));
  const plans = data?.plans || [];
  const sel = plans.find((p) => p.key === selKey) || plans[0];

  // Seçilen planı mock'a taşı: mock o planın önerilerini verir; süren mock varsa sıfırlanır.
  const mockPlan = (key) => {
    const tag = JSON.stringify([f.apiFormat, f.t, f.s]);
    try {
      sessionStorage.setItem(`fz_mockplan_${tag}`, key);
      sessionStorage.removeItem(`fz_mock_${tag}`);
    } catch { /* özel mod */ }
    navigate(`/basketball/fantasy/mock${f.query}`);
  };

  const head = (
    <div className="fz-head">
      <div className="fz-head-l">
        <h1 className="fz-h1">Draft plan · slot {f.s} of {f.t}</h1>
        <span className="fz-sub">Every build we simulated for your picks, ranked best to worst. Pick one to mock it. Availability = chance the target is still there when you pick.</span>
        <ProjectionTag />
      </div>
      <button className="fz-btn fz-desk-only" disabled={!sel} onClick={() => mockPlan(sel.key)}>{sel ? `Mock ${sel.label}` : "Mock this plan"}</button>
    </div>
  );

  if (error && !data) return <div className="fz-page">{head}<ErrorNote error={error} onRetry={reload} what="the draft plan" /></div>;

  return (
    <>
      <SEO title="Fantasy draft plan" description="Your snake draft pick numbers and three simulated builds for your slot." path="/basketball/fantasy/draft-plan" />
      <div className="fz-page" style={{ gap: 26 }}>
        {head}
        <ValidationNotice v={data?.validation} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="fz-sub" style={{ fontSize: 13 }}>Your picks · snake</span>
          <div style={{ display: phone ? "flex" : "grid", gridTemplateColumns: `repeat(${f.picks.length}, minmax(0,1fr))`, gap: 4, overflowX: phone ? "auto" : "visible" }}>
            {f.picks.map((n, i) => (
              <div key={n} className="fz-card" style={{ padding: "8px 0", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, width: phone ? 44 : "auto" }}>
                <span className="fz-meta">R{i + 1}</span><span className="fz-num" style={{ fontSize: phone ? 17 : 20 }}>{n}</span>
              </div>
            ))}
          </div>
        </div>

        {loading && !data && (
          <div className="fz-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 14 }}>Building plans for slot {f.s}{f.simAvailable ? ` on the ${PROJECTION_INFO[f.projection].l.toLowerCase()} projection` : ""}…</span>
            <div style={{ height: 6, borderRadius: 3, background: "#1f1f1f", overflow: "hidden" }}><div className="fz-skel" style={{ height: "100%" }} /></div>
            <span className="fz-meta">{f.projection !== "model" ? "These plans are computed on request, about 3 seconds the first time, then cached." : "Custom leagues run a fresh set of simulated drafts; this takes a few seconds."}</span>
          </div>
        )}

        {data && sel && !phone && (
          <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0,1fr)", gap: 20, alignItems: "start", opacity: loading ? 0.55 : 1 }}>
            <PlanList plans={plans} sel={sel} onPick={setSelKey} data={data} />
            <div className="fz-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span className="fz-d" style={{ fontSize: 24 }}>{sel.label}</span>
                    <span className="fz-meta">{plans[0].key === sel.key ? "Best by simulation" : sel.tied_with_best ? "Close call" : `Ranked ${plans.indexOf(sel) + 1} of ${plans.length}`}</span>
                  </div>
                  <span className="fz-sub" style={{ fontSize: 13, lineHeight: 1.45 }}>{NOTES[sel.key] || ""}</span>
                </div>
                <button className="fz-gold" onClick={() => mockPlan(sel.key)}>Mock this plan</button>
              </div>
              <PlanBody key={sel.key} plan={sel} data={data} />
            </div>
          </div>
        )}

        {data && sel && phone && (
          <>
            <div className="fz-seg scroll" style={{ alignSelf: "stretch" }}>
              {plans.map((pl, i) => (
                <button key={pl.key} style={{ flexShrink: 0, height: 40 }} className={sel.key === pl.key ? "on" : ""} onClick={() => setSelKey(pl.key)}>{i + 1} · {pl.label}</button>
              ))}
            </div>
            <span className="fz-sub" style={{ lineHeight: 1.45 }}>{NOTES[sel.key]}</span>
            <PlanBody key={sel.key} plan={sel} data={data} compact />
            <button className="fz-gold" style={{ height: 54, borderRadius: 12, fontSize: 18 }} onClick={() => mockPlan(sel.key)}>Mock {sel.label}</button>
          </>
        )}

        {data && (
          <span className="fz-meta" style={{ lineHeight: 1.6 }}>
            Each build is drafted {data.sims_per_plan} times against rivals who draft by ADP or by our values, then every season is replayed with
            our measured projection error. {plans.every((p) => p.tied_with_best)
              ? `All ${plans.length} builds finish within simulation noise of each other — pick the one that fits how you like to draft.`
              : "Builds marked “Close call” finish within simulation noise of the best one."}
          </span>
        )}
      </div>
    </>
  );
}
