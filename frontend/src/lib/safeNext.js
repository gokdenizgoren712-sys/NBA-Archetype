/** Giriş sonrası dönülecek yol — SADECE site içi.
 *
 *  `startsWith("/")` tek başına yetmiyor: "//evil.com" ve "/\evil.com" de "/"
 *  ile başlıyor ve tarayıcı ikisini de protokol-göreli DIŞ adres sayıyor.
 *  React Router bunları bugün istemci içi yol gibi ele alıyor, yani açık bir
 *  yönlendirme oluşmuyor; ama bu davranışa güvenmek, güvenliği router'ın bir
 *  uygulama ayrıntısına bağlamak olur. Kural burada duruyor.
 *
 *  Kontrol karakterleri de reddedilir: tarayıcı URL'deki sekme ve satır
 *  sonlarını sessizce siler, yani "/\t/evil.com" gezinirken "//evil.com" olur. */
export function safeNextPath(raw) {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}
