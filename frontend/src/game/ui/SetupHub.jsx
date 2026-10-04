import GameStage from "./GameStage";
import BoardPreview from "./BoardPreview";

// Tek oyunculu başlangıç hub'ı (mockup 3a / mobil 12a): başlık, kural seti, START DRAFT,
// 4 adımlı izleyici, kadro önizleme ve liderlik tablosu. Veri ve davranış sayfadan gelir.
export default function SetupHub({
  sport, title, subtitle, rules, ruleKey, onRule, startLabel, onStart, startDisabled,
  steps, total, leaderboard,
}) {
  return (
    <GameStage sport={sport}>
      <header className="sb-hub-head">
        <div className="titles">
          <p className="sb-mono sb-eyebrow">SPIN &amp; BUILD · SINGLE PLAYER</p>
          <h1 className="sb-h1 xl">{title}</h1>
          <p className="sub">{subtitle}</p>
        </div>
        {rules?.length > 0 && (
          <div className="sb-rules" role="radiogroup" aria-label="Rule set">
            {rules.map((r) => (
              <button key={r.key} type="button" role="radio" aria-checked={ruleKey === r.key}
                className="sb-rule" onClick={() => onRule(r.key)}>
                <b>{r.label}</b><i>{r.hint}</i>
              </button>
            ))}
          </div>
        )}
        <button type="button" className="sb-btn solid cta" onClick={onStart} disabled={startDisabled}>
          {startLabel}
        </button>
      </header>

      <div className="sb-panel sb-steps">
        {steps.map((s) => (
          <div key={s.n} className="sb-step">
            <span className="n">{s.n}</span>
            <div><div className="t">{s.t}</div><div className="d">{s.d}</div></div>
          </div>
        ))}
      </div>

      <div className="sb-hub-body">
        <BoardPreview total={total} />
        {leaderboard}
      </div>
    </GameStage>
  );
}
