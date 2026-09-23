import { expectedHeat, expectedInterestCount, heatSteps, MIN_COMMUNITY_RATINGS } from "./heat";

function Bars({ value, compact = false }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", gap: compact ? 3 : 4, minWidth: 0 }}>
      {heatSteps(value).map((color, index) => (
        <span key={index} style={{ flex: 1, minWidth: 0, height: compact ? 4 : 5, borderRadius: 3, background: color }} />
      ))}
    </div>
  );
}

export default function ExpectedHeat({ match, compact = false }) {
  const value = expectedHeat(match);
  const count = expectedInterestCount(match);
  if (count === null) return null;
  const tooFew = count < MIN_COMMUNITY_RATINGS;
  const countText = value === null
    ? tooFew
      ? `${count.toLocaleString()} members have shared interest. Heat opens at ${MIN_COMMUNITY_RATINGS} readings.`
      : `${count.toLocaleString()} members have shared interest. Expected heat is unavailable.`
    : `From ${count.toLocaleString()} members who want this one. Not a prediction — an appetite reading.`;
  const unavailableLabel = tooFew ? "TOO FEW RATINGS" : "HEAT UNAVAILABLE";

  return (
    <section className={`ri-expected-heat${compact ? " compact" : ""}`} aria-label={value === null ? `Expected heat: ${unavailableLabel.toLowerCase()}` : `Expected heat ${value.toFixed(1)} out of 5`}>
      <div className="ri-expected-heat-head">
        <span>EXPECTED HEAT</span>
        <strong className={value === null ? "is-empty" : undefined}>{value === null ? unavailableLabel : value.toFixed(1)}</strong>
      </div>
      <Bars value={value ?? 0} compact={compact} />
      <p>{countText}</p>
    </section>
  );
}

export { Bars as ExpectedHeatBars };
