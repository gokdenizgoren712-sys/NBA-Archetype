// ── Arketip harita çapaları — FAZ BAŞINA AYRI ────────────────────────────────
// Basketbolun Explore haritası 12 nounu tek bir düzleme koyuyor, çünkü orada
// bütün oyuncular aynı boyutlarla ölçülüyor. Futbolda bu YANLIŞ olur: bir
// kaleciyle bir santraforun ortak ekseni yok. Bu yüzden dört ayrı harita.
//
// Her fazın eksenleri o fazın gerçek gerilimini taşıyor:
//   gk   x: çizgide durmak → kaleden çıkmak      y: kurtarmak → oyun kurmak
//   def  x: savunmak → hücuma katılmak            y: merkez → kanat
//   mid  x: yıkmak → yapmak                       y: derinde → ileride
//   fwd  x: bitirmek → yaratmak                   y: merkez → kanat
//
// Koordinatlar ELLE yerleştirildi (basketbol tarafındaki ARCH_XY ile aynı
// yaklaşım) — ölçülmüş bir gömme değil, okunabilir bir yerleşim. Oyuncu, kendi
// arketip skorlarının ağırlıklı ortalaması olarak konumlanır.

export const MAP_ANCHORS = {
  gk: {
    axes: { x: ["Stays on his line", "Comes off his line"],
            y: ["Shot stopping", "Playing out"] },
    points: {
      "Shot Stopper":    { x: 0.16, y: 0.14 },
      "Command of Area": { x: 0.62, y: 0.24 },
      "Sweeper Keeper":  { x: 0.86, y: 0.58 },
      "Distributor":     { x: 0.36, y: 0.88 },
    },
  },
  def: {
    axes: { x: ["Defends", "Joins the attack"],
            y: ["Central", "Wide"] },
    points: {
      "Stopper":              { x: 0.10, y: 0.16 },
      "Ball-Playing CB":      { x: 0.42, y: 0.10 },
      "Defensive Fullback":   { x: 0.20, y: 0.82 },
      "Inverted Fullback":    { x: 0.55, y: 0.46 },
      "Overlapping Fullback": { x: 0.90, y: 0.88 },
    },
  },
  mid: {
    axes: { x: ["Wins the ball", "Makes the play"],
            y: ["Deep", "Advanced"] },
    points: {
      "Anchor":      { x: 0.14, y: 0.10 },
      "Ball-Winner": { x: 0.20, y: 0.38 },
      "Metronome":   { x: 0.52, y: 0.20 },
      "Regista":     { x: 0.74, y: 0.24 },
      "Box-to-Box":  { x: 0.44, y: 0.60 },
      "Mezzala":     { x: 0.86, y: 0.66 },
      "Late Runner": { x: 0.56, y: 0.92 },
    },
  },
  fwd: {
    axes: { x: ["Finishes", "Creates"],
            y: ["Central", "Wide"] },
    points: {
      "Poacher":          { x: 0.08, y: 0.14 },
      "Target Man":       { x: 0.18, y: 0.06 },
      "Complete Forward": { x: 0.46, y: 0.22 },
      "Inside Forward":   { x: 0.30, y: 0.62 },
      "Pressing Forward": { x: 0.34, y: 0.40 },
      "Creator":          { x: 0.84, y: 0.34 },
      "Take-On Merchant": { x: 0.62, y: 0.80 },
      "Touchline Winger": { x: 0.88, y: 0.92 },
    },
  },
};

/** Oyuncunun haritadaki yeri: arketip skorlarının ağırlıklı ortalaması.
 *  Ağırlık skorun kübü — zayıf uyumlar konumu merkeze sürüklemesin diye
 *  (basketbol haritasındaki aynı sorun: her oyuncu ortada toplanıyordu). */
export function placeOnMap(player, phase) {
  const anchors = MAP_ANCHORS[phase]?.points;
  if (!anchors) return null;
  let wx = 0, wy = 0, tot = 0;
  for (const [name, pt] of Object.entries(anchors)) {
    const v = player[`score_${name}`];
    if (v == null || Number.isNaN(v)) continue;
    const w = Math.pow(Math.max(0, v), 3);
    wx += w * pt.x; wy += w * pt.y; tot += w;
  }
  if (tot <= 0) return null;
  return { x: wx / tot, y: wy / tot };
}
