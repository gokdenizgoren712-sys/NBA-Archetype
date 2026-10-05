// Saha/kort geometrisi (mockup: In Site / Football Single Player — viewBox 0 0 100 70).
// Slot koordinatları kutunun yüzdesi. Futbolda slotlar game/football/formations.js'ten
// gelir (portre x/y); yatay sahaya çevirme tek yerde: footballSlotPos().

export const COURT_LINES = [
  "M1 1H99V69H1Z", "M38 1V26H62V1", "M41 26a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
  "M48.4 6a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0", "M8 1V14A42 42 0 0 0 92 14V1", "M44 1H56",
];

export const PITCH_LINES = [
  "M1 1H99V69H1Z", "M50 1V69", "M43 35a7 7 0 1 0 14 0a7 7 0 1 0 -14 0",
  "M1 17H15V53H1", "M99 17H85V53H99",
];

// Basketbol: 5 ilk beş slotu (kortun yüzdesi) + 4 yedek.
export const COURT_SLOTS = [
  { pos: "C", x: 70, y: 30 }, { pos: "PF", x: 30, y: 30 }, { pos: "SF", x: 80, y: 58 },
  { pos: "SG", x: 20, y: 58 }, { pos: "PG", x: 50, y: 82 },
];
export const COURT_BENCH = ["B1", "B2", "B3", "B4"];

// Yatay saha: kendi kalen solda. formations.js portre (x = genişlik, y = derinlik;
// y=100 kendi kalen) → left = 100 - y, top = x. Pozisyon cezası ve çizim aynı kaynaktan.
export const footballSlotPos = (slot) => ({ left: 100 - slot.y, top: slot.x });

// Slot etiketi: mockup 11a pozisyon kodunu gösterir (FB, W, CB…), slot kimliğini değil.
export const slotLabel = (slot) => slot.pos;
