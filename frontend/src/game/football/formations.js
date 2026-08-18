// ── Futbol dizilişleri: slot listesi + saha koordinatları ────────────────────
// Basketbolda beş slot sabit (PG/SG/SF/PF/C) ve saha diye bir şey yok. Futbolda
// hangi slotların var olduğu dizilişe bağlı VE her slotun sahada bir yeri var.
// Bu yüzden slotları türetmek yerine AÇIKÇA yazıyoruz: hem pozisyon cezası hem
// saha çizimi aynı kaynaktan beslensin, ikisi birbirinden kaymasın.
//
// x/y: sahanın yüzdesi. y=100 kendi kalen, y=0 rakip kale.
// pos: o slotun İSTEDİĞİ pozisyon (pozisyon cezası bunun üzerinden hesaplanır).

export const BENCH_COUNT = 7;   // kullanıcı kararı: 11 + 7 = 18 kişilik kadro

const F = (id, pos, phase, x, y) => ({ id, pos, phase, x, y });

export const FORMATIONS = {
  "4-3-3": {
    label: "4-3-3",
    slots: [
      F("GK",  "GK", "gk",  50, 93),
      F("LB",  "FB", "def", 14, 73), F("LCB", "CB", "def", 37, 79),
      F("RCB", "CB", "def", 63, 79), F("RB",  "FB", "def", 86, 73),
      F("DM",  "DM", "mid", 50, 59), F("LCM", "CM", "mid", 32, 47),
      F("RCM", "CM", "mid", 68, 47),
      F("LW",  "W",  "fwd", 16, 24), F("ST",  "ST", "fwd", 50, 15),
      F("RW",  "W",  "fwd", 84, 24),
    ],
  },
  "4-2-3-1": {
    label: "4-2-3-1",
    slots: [
      F("GK",  "GK", "gk",  50, 93),
      F("LB",  "FB", "def", 14, 73), F("LCB", "CB", "def", 37, 79),
      F("RCB", "CB", "def", 63, 79), F("RB",  "FB", "def", 86, 73),
      F("LDM", "DM", "mid", 38, 60), F("RDM", "DM", "mid", 62, 60),
      F("LAM", "W",  "fwd", 17, 38), F("CAM", "AM", "fwd", 50, 34),
      F("RAM", "W",  "fwd", 83, 38), F("ST",  "ST", "fwd", 50, 14),
    ],
  },
  "4-4-2": {
    label: "4-4-2",
    slots: [
      F("GK",  "GK", "gk",  50, 93),
      F("LB",  "FB", "def", 14, 73), F("LCB", "CB", "def", 37, 79),
      F("RCB", "CB", "def", 63, 79), F("RB",  "FB", "def", 86, 73),
      F("LM",  "W",  "fwd", 15, 48), F("LCM", "CM", "mid", 39, 52),
      F("RCM", "CM", "mid", 61, 52), F("RM",  "W",  "fwd", 85, 48),
      F("LST", "ST", "fwd", 38, 18), F("RST", "ST", "fwd", 62, 18),
    ],
  },
  "3-5-2": {
    label: "3-5-2",
    slots: [
      F("GK",  "GK", "gk",  50, 93),
      F("LCB", "CB", "def", 28, 80), F("CCB", "CB", "def", 50, 82),
      F("RCB", "CB", "def", 72, 80),
      F("LWB", "FB", "def", 10, 56), F("RWB", "FB", "def", 90, 56),
      F("LCM", "CM", "mid", 33, 52), F("CM",  "CM", "mid", 50, 60),
      F("RCM", "CM", "mid", 67, 52),
      F("LST", "ST", "fwd", 38, 18), F("RST", "ST", "fwd", 62, 18),
    ],
  },
  "3-4-2-1": {
    label: "3-4-2-1",
    slots: [
      F("GK",  "GK", "gk",  50, 93),
      F("LCB", "CB", "def", 28, 80), F("CCB", "CB", "def", 50, 82),
      F("RCB", "CB", "def", 72, 80),
      F("LWB", "FB", "def", 10, 56), F("RWB", "FB", "def", 90, 56),
      F("LCM", "CM", "mid", 38, 58), F("RCM", "CM", "mid", 62, 58),
      F("LAM", "W",  "fwd", 30, 33), F("RAM", "W",  "fwd", 70, 33),
      F("ST",  "ST", "fwd", 50, 14),
    ],
  },
  "4-1-4-1": {
    label: "4-1-4-1",
    slots: [
      F("GK",  "GK", "gk",  50, 93),
      F("LB",  "FB", "def", 14, 73), F("LCB", "CB", "def", 37, 79),
      F("RCB", "CB", "def", 63, 79), F("RB",  "FB", "def", 86, 73),
      F("DM",  "DM", "mid", 50, 62),
      F("LM",  "W",  "fwd", 15, 42), F("LCM", "CM", "mid", 39, 45),
      F("RCM", "CM", "mid", 61, 45), F("RM",  "W",  "fwd", 85, 42),
      F("ST",  "ST", "fwd", 50, 15),
    ],
  },
  "5-3-2": {
    label: "5-3-2",
    slots: [
      F("GK",  "GK", "gk",  50, 93),
      F("LWB", "FB", "def", 10, 66), F("LCB", "CB", "def", 30, 81),
      F("CCB", "CB", "def", 50, 84), F("RCB", "CB", "def", 70, 81),
      F("RWB", "FB", "def", 90, 66),
      F("LCM", "CM", "mid", 33, 52), F("DM",  "DM", "mid", 50, 60),
      F("RCM", "CM", "mid", 67, 52),
      F("LST", "ST", "fwd", 38, 19), F("RST", "ST", "fwd", 62, 19),
    ],
  },
};

export const SHAPE_KEYS = Object.keys(FORMATIONS);

export const benchSlots = () =>
  Array.from({ length: BENCH_COUNT }, (_, i) => ({
    id: `SUB${i + 1}`, pos: null, phase: null, bench: true,
  }));

/** Bir dizilişin tüm slotları: 11 ilk + 7 yedek. */
export function allSlots(shape) {
  const f = FORMATIONS[shape];
  if (!f) return [];
  return [...f.slots, ...benchSlots()];
}

/** Dizilişin faz dağılımı — kimya motorundaki VALID_SHAPES ile aynı olmalı. */
export function phaseCounts(shape) {
  const f = FORMATIONS[shape];
  if (!f) return {};
  return f.slots.reduce((a, s) => {
    if (s.phase !== "gk") a[s.phase] = (a[s.phase] || 0) + 1;
    return a;
  }, {});
}
