/* Ekran 15c — inceleme yazma.
   Görsel kaynak: `RankIt Redesign.dc.html#15c`. Davranış: BUILD §11.1.

   "A review is never a separate object you create — it is a field on your
   entry." Bu yüzden ekran girdiden açılıyor, girdiye geri yazıyor ve düğme
   **Save to your entry** diyor, asla Post. Kalkan uyarısı BAŞTA duruyor:
   yazar kimlerin ne göreceğini kelimeleri seçmeden önce bilmeli. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { useDialog } from './useDialog';

export default function ReviewComposer({ value = '', matchLabel, rating, classic = false,
                                         onChange, onClose }) {
  const [text, setText] = useState(value);
  const field = useRef(null);
  const dialog = useDialog({ onClose, label: `Review · ${matchLabel}` });
  /* Yazma ekrani acilir acilmaz imlec metinde olmali; `autoFocus` yetmiyor,
     cunku useDialog panelin kendisine odak veriyor. Imlec metnin SONUNA
     gidiyor: mevcut bir incelemeyi duzenlerken bastan yazmak istenmez. */
  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);
  const save = () => { onChange(text); onClose(); };

  const screen = <section {...dialog} className="ri-composer">
    <header className="ri-composer-head">
      <button type="button" onClick={onClose} aria-label="Back to your entry"><ArrowLeft size={18} /></button>
      <h1>Write about the night</h1>
    </header>

    <div className="ri-composer-body">
      <p className="ri-composer-match">{matchLabel}</p>
      {/* Tahtada "5.0 · All-timer" yaziyor ama BUILD bes kademelik bir kisisel
          puan sozlugu TANIMLAMIYOR ve tahtada da yalniz bu tek kelime geciyor.
          Kalan dordunu uydurmak yerine sayi gosteriliyor; isi adlari (COLD…HOT)
          buraya konamaz, cunku §5.5 "a user's own stars are not heat" diyor. */}
      {rating > 0 && <p className="ri-composer-rating">{Number(rating).toFixed(1)}
        {classic && <b className="ri-composer-classic">CLASSIC</b>}</p>}

      <textarea className="ri-composer-input" maxLength={4000} value={text} ref={field}
        onChange={(event) => setText(event.target.value)}
        placeholder="What happened, and why it stayed with you." aria-label="Your review" />

      <div className="ri-composer-meter">
        <span>OUTFIT · WHAT YOU SAY, NOT WHAT THE PRODUCT SAYS</span>
        <b>{text.length.toLocaleString('en-GB')} / {(4000).toLocaleString('en-GB')}</b>
      </div>

      <div className="ri-composer-shield">
        <span>THIS WILL BE SPOILER-SHIELDED</span>
        <p>Anyone with the shield on sees <b>CONTAINS SPOILERS · TAP TO SHOW</b> instead of
          your words. Write as if they will read it anyway.</p>
      </div>
    </div>

    <div className="ri-composer-foot">
      <button type="button" className="ri-composer-save" onClick={save}>Save to your entry</button>
    </div>
  </section>;

  const host = document.querySelector('.rankit-app');
  return host ? createPortal(screen, host) : screen;
}
