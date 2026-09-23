// Sağlayıcı dakikası zaten "73'" biçiminde gelebilir; ikinci apostrof ekleme.
export function companionMinute(value, sport = "Football") {
  if (value == null || value === "") return null;
  const minute = String(value).trim().replace(/[’′]/g, "'");
  if (minute === "HT") return "HT";
  if (sport === "Basketball") return /^\d+$/.test(minute) ? `${minute}m` : minute;
  return /^\d+(?:\+\d+)?$/.test(minute) ? `${minute}'` : minute;
}

export function measuredPulse(value, reads, minimum = 20) {
  const count = Number(reads);
  const score = Number(value);
  return value != null && Number.isFinite(score) && score > 0 && score <= 5 &&
    Number.isFinite(count) && count >= minimum ? score : null;
}

export function measuredRise(value) {
  const score = Number(value);
  return value != null && Number.isFinite(score) ? `${score > 0 ? "+" : ""}${score.toFixed(1)}` : "—";
}
