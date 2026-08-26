/** Giriş sonrası dönülecek yol — SADECE site içi.
 *
 *  `startsWith("/")` tek başına yetmiyor: "//evil.com" ve "/\evil.com" de "/"
 *  ile başlıyor ve tarayıcı ikisini de protokol-göreli DIŞ adres sayıyor.
 *  React Router bunları bugün istemci içi yol gibi ele alıyor, yani açık bir
 *  yönlendirme oluşmuyor; ama bu davranışa güvenmek, güvenliği router'ın bir
 *  uygulama ayrıntısına bağlamak olur. Kural burada duruyor. */
export function safeNextPath(raw) {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}
