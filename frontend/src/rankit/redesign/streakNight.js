/* 3j "FROM TONIGHT" grubunun gece durumu.
   §7.2: seri gecede BIR puanlamayla korunur. Ekran bunu eskiden `streak > 0`
   ile tahmin ediyordu; bu, gece zaten sayildiginda "Keeps your streak alive"
   yazdirip yalan soyluyordu. Karar artik ucun iki bayragindan geliyor:
   `at_risk` (seri var + bu gece puanlanmamis mac var + gece sayilmamis) ve
   `tonight_counted` (gece sayildi, kalan maclar seriyi UZATMAZ).
   Dinlenme gecesi (bu gece hic mac yok) ucta zaten at_risk=false uretiyor. */

export function nightStatus(data) {
  const streak = Number(data?.streak);
  const counted = data?.tonight_counted === true;
  // at_risk yalniz seri VARKEN anlamli. Uc bunu garanti ediyor ama savunmaci
  // kaliyoruz: sayisiz bir "risk" satiri okuyucuya hicbir sey soylemez.
  const atRisk = data?.at_risk === true && Number.isFinite(streak) && streak > 0;
  if (atRisk) {
    return { tone: 'at-risk', keepsStreak: true,
             note: `Your ${streak}-night streak needs one rating tonight.` };
  }
  if (counted) {
    return { tone: 'counted', keepsStreak: false,
             note: 'Tonight already counts. Rating these is for the log, not the streak.' };
  }
  return { tone: null, keepsStreak: false, note: null };
}
