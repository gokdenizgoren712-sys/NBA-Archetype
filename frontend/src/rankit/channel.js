/* Uygulamanın dağıtım kanalı (docs/RANKIT_STORE_BLOCKERS_PLAN.md A2).

   sideload: primaryarch.net'ten indirilen APK — kendi güncellemesini sitede bulur
             ("Update RankIt" satırı, /rankit/download).
   store:    Google Play / App Store — güncelleme mağazanın işi. Play, uygulamanın
             kendini mağaza dışından güncellemesini ya da APK'ya yönlendirmesini
             yasaklıyor (Device and Network Abuse); Apple da kabul etmez.

   Değer derlemede gömülür: `.env.rankit-store` → store; diğer her şey sideload. */
export const RANKIT_CHANNEL = import.meta.env?.VITE_RANKIT_CHANNEL === "store" ? "store" : "sideload";
export const IS_STORE_BUILD = RANKIT_CHANNEL === "store";
