/* §20 "hover a card, press R": duvarın hangi kartının üstünde olunduğunu
   kök bilir. Klavye kullanıcısı için odak da aynı sayılır — fare ile gelenin
   üstünde durduğu kart neyse, Tab ile gelenin üstünde durduğu kart o. Kart
   bileşenleri (WallCard) bu bağlamı okur; bağlam yoksa hiçbir şey yapmaz. */
import { createContext, useRef, useState } from "react";

export const CardHoverContext = createContext(null);

/* Kökün tuttuğu iz: [ref, ayarla]. Ayarlayıcı ilk çizimde bir kez kurulur
   (kararlı kimlik), ref'e yalnız olay anında yazar — çizim sırasında değil. */
export function useCardHover() {
  const ref = useRef(null);
  const [set] = useState(() => (card) => { ref.current = card; });
  return [ref, set];
}
