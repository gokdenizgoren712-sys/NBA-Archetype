/* Primary Arch sitesindeki bir sayfayı (gizlilik, şartlar, iletişim…) açar.

   Paketlenmiş uygulamada göreli bir bağlantı (`/privacy-policy`) WebView'ı
   https://localhost/privacy-policy'ye götürür: mobil pakette o sayfa yok,
   uygulama kendini yeniden yükler. Mağaza incelemesinde gizlilik politikasına
   ulaşılamaması doğrudan red sebebi (docs/RANKIT_STORE_BLOCKERS_PLAN.md A1).
   Uygulamada sayfa uygulama içi tarayıcıda, sitenin tam adresiyle açılır;
   web'de normal bağlantıdır. */
import { Browser } from "@capacitor/browser";
// rankitApi'nin API_ROOT'u ile aynı değişken (VITE_RANKIT_API_URL); buradan
// alınıyor çünkü apiOrigin Node testlerinde de yüklenebiliyor.
import { API_ORIGIN as API_ROOT } from "../lib/apiOrigin.js";

export const IS_APP = import.meta.env?.VITE_RANKIT_MOBILE === "true";

// Uygulamada kök sitenin kendisi (https://primaryarch.net); web'de boş.
export function externalHref(path, { app = IS_APP, root = API_ROOT } = {}) {
  return app ? `${root}${path}` : path;
}

/* <a> için props: anlam ve erişilebilirlik bağlantı olarak kalır, uygulamada
   tıklama uygulama içi tarayıcıya yönlenir. */
export function externalLinkProps(path, { app = IS_APP, root = API_ROOT, browser = Browser } = {}) {
  const href = externalHref(path, { app, root });
  if (!app) return { href };
  return {
    href,
    onClick: (event) => {
      event.preventDefault();
      browser.open({ url: href }).catch(() => {});
    },
  };
}

// Sitenin uygulamadan açılan sayfaları — tek liste, testler de buradan okur.
export const LEGAL_PAGES = [
  ["/privacy-policy", "Privacy policy"],
  ["/terms-of-service", "Terms of service"],
  ["/contact", "Contact & support"],
];
