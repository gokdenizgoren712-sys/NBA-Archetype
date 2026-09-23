// Primary Arch oturumunu kullan; kullanıcı adı yalnız id taşımayan eski yanıtlarda yedek.
export function reviewerFromStorage(storage) {
  try {
    const user = JSON.parse(storage.getItem("nba_arch_user"));
    return user && typeof user === "object" ? { id: user.id ?? null, username: user.username ?? null } : null;
  } catch { return null; }
}

export function isOwnContent(row, reviewer) {
  if (!row) return false;
  /* `is_mine` ucun kendi cevabi: istegi YAPAN kullaniciya gore hesapliyor.
     Istemcinin oturum kopyasi eksik ya da bayat olabilir (baska sekmede cikis,
     token yenilenmesi, demo kullanici) — o durumda kullanici adi eslemesi
     kendi respect elmasini yanlislikla acik ya da kapali gosteriyordu (§6.1:
     kendi icerigine respect yok). Uc soyluyorsa tartisma bitmistir. */
  if (typeof row.is_mine === "boolean") return row.is_mine;
  if (!reviewer) return false;
  if (row.user_id != null && reviewer.id != null) return String(row.user_id) === String(reviewer.id);
  return !!(row.username && reviewer.username && row.username === reviewer.username);
}
