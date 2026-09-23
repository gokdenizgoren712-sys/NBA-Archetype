import { useLayoutEffect, useRef } from 'react';

/* TabBar'i acik birakan tam ekranlar modal degildir. Yine de acilista geri
   tusuna, kapanista da acan kontrole odak veririz. */
export function usePushedScreen() {
  const screen = useRef(null);
  useLayoutEffect(() => {
    const opener = document.activeElement;
    const first = screen.current?.querySelector('[data-autofocus],button,input,[tabindex="0"]');
    first?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return screen;
}
