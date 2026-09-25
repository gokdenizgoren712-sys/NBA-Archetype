/* Sonuc, gonderilen snapshot'a aittir; arka planda yenilenen mac verisine degil. */
export function createCollectible(match, entry, result = {}) {
  const queued = result.queued === true;
  const receipt = queued ? null : result.receipt || null;
  const delta = key => typeof receipt?.[key] === 'number' && Number.isFinite(receipt[key]) ? receipt[key] : null;
  return {
    match, entry: { ...entry, tags: [...(entry.tags || [])], respect: [...(entry.respect || [])] }, queued, receipt,
    /* §4.1: "one line of what happened ('That's card 143.'), three deltas
       (streak, points, any collection advanced)". Uc bunlarin hepsini zaten
       doneriyordu (`card_number`, `collection`, `season_award`); ekran yalniz
       ucunu okuyordu ve ucuncu delta olarak "Diary entries"i gosteriyordu —
       o sayi zaten cumlede ("card 143") ve durum satirinda ("SAVED TO YOUR
       DIARY" / "ENTRY UPDATED") var. Ilerleyen koleksiyon ise hicbir yerde
       yoktu. Cevrimdisi kuyrukta receipt olmadigi icin hepsi null kalir;
       sayi uydurulmaz. */
    cardNumber: typeof receipt?.card_number === 'number' && Number.isFinite(receipt.card_number)
      ? receipt.card_number : null,
    // "8/12 London Derby +1" — bu kaydin ilerlettigi en dolu koleksiyon.
    // Yoksa karo hic cizilmez (uydurma ilerleme yok).
    collection: receipt?.collection || null,
    seasonAward: receipt?.season_award || null,
    // 6a dorduncu satir: BU puanlamanin actigi skinler (uctan; kuyrukta bos).
    skinsUnlocked: Array.isArray(receipt?.skins_unlocked) ? receipt.skins_unlocked : [],
    deltas: [
      { label: 'Rank points', value: delta('points_awarded') },
      { label: 'Streak nights', value: delta('streak_delta') },
    ],
    // Yeni rewatch POST'u atmak duzenleme degildir. Kimlik gelmeden Edit acilmaz.
    canEdit: !entry.rewatch || !!receipt?.entry_id || !!entry.entryId,
  };
}

export function collectibleEditMatch(result) {
  return { ...result.match, __entryPending:result.queued, __entry: { ...result.entry, entryId: result.receipt?.entry_id || result.entry.entryId || null } };
}

export function collectibleShareText(result) {
  const { match, entry } = result;
  // Kullanicinin acik paylasma eylemi; skor, review ve oyuncu oylari disari cikmaz.
  return `${match.home.name} vs ${match.away.name} · ${match.competition}\n${entry.rating ? `My rating: ${entry.rating}/5` : 'In my diary'}${entry.classic ? ' · My Classic' : ''}\nRankIt by Primary Arch`;
}

/* 7e web katmanının cümlesi. */
const WORDS = ["", "One star", "Two stars", "Three stars", "Four stars", "Five stars"];

/* "Five stars, stamped a Classic. It's on your shelf and in tonight's
   streak." — yalnız gerçekten olan kısımlar. Seri ancak uç seriyi
   ilerlettiğini söylediyse cümleye girer. */
export function collectibleSentence(entry, streakDelta) {
  const r = Number(entry?.rating) || 0;
  const stars = r ? (Number.isInteger(r) ? WORDS[r] : `${r} stars`) : "Logged without stars";
  const classic = entry?.classic ? ", stamped a Classic" : "";
  const tail = streakDelta > 0 ? "It's on your shelf and in tonight's streak." : "It's on your shelf.";
  return `${stars}${classic}. ${tail}`;
}
