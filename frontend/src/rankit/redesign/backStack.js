/* Donanım geri tuşu için yüzey yığını.
 *
 * Kabuk (RankItPrototype) geri tuşunu kendi bildiği state'lere göre
 * kapatıyor: detail, competitionDetail, rankOpen… Ama bir bileşenin
 * İÇİNDE açılan tam ekran bir yüzeyi (Profil > Settings gibi) bilemez;
 * o durumda geri tuşu "tab !== Home" dalına düşüyor ve kullanıcıyı Profil'i
 * de atlayarak Home'a fırlatıyordu.
 *
 * Çözüm yüzeyin kendini KAYDETMESİ: açılınca yığına girer, kapanınca çıkar;
 * kabuk kendi zincirinden önce en üsttekini kapatır. Yüzeyler birbirinin
 * üstüne açılabildiği için sıra korunuyor — kayıt yalnızca bağlanırken
 * yapılıyor, yeniden render yüzeyi yığının tepesine taşımıyor.
 */
import { useEffect, useRef } from "react";

const stack = [];

export function useBackClose(close) {
  const latest = useRef(close);
  // En güncel kapatıcı her render'da güncellenir ama yığındaki GİRİŞ sabit:
  // kapatıcıyı bağımlılık yapmak her render'da çıkar-gir yapar ve alttaki
  // bir yüzeyi üsttekinin üstüne çıkarırdı.
  useEffect(() => { latest.current = close; });
  useEffect(() => {
    const entry = () => latest.current?.();
    stack.push(entry);
    return () => {
      const at = stack.indexOf(entry);
      if (at >= 0) stack.splice(at, 1);
    };
  }, []);
}

/* Kabuk geri tuşunda önce bunu çağırır. Kapatacak bir şey varsa true. */
export function closeTopmost() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}
