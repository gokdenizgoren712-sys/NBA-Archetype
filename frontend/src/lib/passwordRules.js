// Yeni belirlenen şifre kuralı: 6–18 karakter (sahibin kararı, 2026-09-26).
// Yalnız kayıt ve sıfırlamada; giriş formu uzunluğa bakmaz, eski hesaplar
// etkilenmez. Sunucudaki karşılığı: api/main.py _check_new_password.
// Alana maxLength KONMAZ: şifre yöneticisinin ürettiği uzun şifre sessizce
// kesilir, kullanıcı sonra kaydettiği şifreyle giremezdi — açık hata gösterilir.
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 18;
export const PASSWORD_HINT = `${PASSWORD_MIN}–${PASSWORD_MAX} characters`;

export function passwordProblem(password) {
  const n = (password || "").length;
  if (n < PASSWORD_MIN || n > PASSWORD_MAX) return `Password must be ${PASSWORD_HINT}`;
  return null;
}
