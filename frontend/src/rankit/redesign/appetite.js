/* BUILD §9 / 2h: beklenti yalnız maç başlamadan önce verilebilir.
   Yerel saat kontrolü yalnız UI içindir; son karar API'nin kickoff kapısındadır. */
export function appetiteOpen(match, nowMs = Date.now()) {
  if (match?.status !== "upcoming") return false;
  const kickoff = Date.parse(match?.starts_at || "");
  return !Number.isFinite(kickoff) || kickoff > nowMs;
}

export function appetiteValue(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" &&
    Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

export function nextAppetite(current, selected) {
  return appetiteValue(current) === selected ? null : selected;
}
