/** API'nin kökeni — site ile paketlenmiş uygulama arasındaki TEK fark.
 *
 *  Site API ile aynı kökenden konuşur: köken boş, istekler "/api/..." olarak
 *  gider (Vite proxy'si ya da Vercel rewrite'ı karşılar). Paketlenmiş RankIt
 *  uygulaması WebView'da https://localhost'tan çalışır; orada göreli "/api"
 *  hiçbir yere varmaz. `.env.rankit-mobile` bu yüzden VITE_RANKIT_API_URL'i
 *  (https://primaryarch.net) veriyor — rankitApi.js'in API_ROOT'u ile aynı
 *  değişken. Site build'inde tanımsız, yani sitenin davranışı değişmez.
 *
 *  `import.meta.env?.` : node:test altında import.meta.env yok; modüller
 *  testlerde de yüklenebilsin diye opsiyonel.
 */
export const API_ORIGIN = String(import.meta.env?.VITE_RANKIT_API_URL || "").replace(/\/+$/, "");

/** "/api/..." yolunu çalışılan yüzeyin API adresine çevirir. */
export function apiUrl(path, origin = API_ORIGIN) {
  return `${origin}${path}`;
}

/** WebSocket adresi: uygulamada API kökeninin ws(s) karşılığı, sitede sayfanın kendi hostu. */
export function socketUrl(path, origin = API_ORIGIN, loc = globalThis.location) {
  if (origin) return `${origin.replace(/^http/, "ws")}${path}`;
  const proto = loc?.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${loc?.host}${path}`;
}
