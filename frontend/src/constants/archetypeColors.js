// 12 çekirdek arketipin site-geneli renk kimliği — önceden Compare.jsx/Explore.jsx
// (bir palet), Lineups.jsx/Glossary.jsx (başka bir palet, Glossary'nin kendisi
// "sözlük" kaynağı olduğu için kanonik kabul edildi) ve Affinity.jsx (üçüncü,
// kısmen farklı bir palet) olmak üzere BAĞIMSIZ 3 kopya olarak tanımlıydı — aynı
// arketip sayfaya göre farklı renk gösteriyordu (2026-09 DESIGN.md uyum geçişi).
// Tek kaynak burası; DESIGN.md'de de belgelenecek.
export const ARCHETYPE_COLOR = {
  Engine: "#fb923c",
  Ecosystem: "#4ade80",
  Hub: "#2dd4bf",
  Connector: "#c084fc",
  Creator: "#fb7185",
  Anchor: "#60a5fa",
  Spacer: "#22d3ee",
  Finisher: "#a3e635",
  Force: "#f87171",
  Initiator: "#FFB11B",
  Stopper: "#d1d5db",
  "Rim Runner": "#34d399",
};

// Liste sayfasının hero'sunda (handoff 3b) arketip seçilince çıkan tek satır.
// Uzun tanımlar data/glossary.js'te; bunlar onların kısa özeti.
export const ARCHETYPE_BLURB = {
  Engine: "A ball-dominant scorer and creator who takes over when the clock winds down.",
  Ecosystem: "They don't just put up numbers — they dictate tempo and lift every teammate on the floor.",
  Hub: "The central pivot where sets are run: elbow and high post, high-IQ passing over raw speed.",
  Connector: "The glue that links both ends: the extra pass, the crisp screen, the stitched-together rotation.",
  Creator: "The floor general who probes the paint and turns an advantage into an open look.",
  Anchor: "The last line of defense who erases paint touches and secures the rebound.",
  Spacer: "Gravity from deep — pulls defenders out and opens the lane for everyone else.",
  Finisher: "Converts at the rim at volume — the end point of the possession.",
  Force: "Physical downhill pressure that bends a defense by sheer power.",
  Initiator: "Starts the offense early and gets the team into its actions.",
  Stopper: "The point-of-attack defender who takes the other team's best player.",
  "Rim Runner": "Sprints the floor and dives hard, living on lobs and dump-offs.",
};

export const archetypeArt = (name) => (name ? `/archetypes/${name.toLowerCase().replace(/\s+/g, "-")}.png` : null);
