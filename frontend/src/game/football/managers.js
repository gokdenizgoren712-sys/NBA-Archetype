// ── Menajer draftı ───────────────────────────────────────────────────────────
// Basketboldaki koç draftının futbol karşılığı, ama BİR MEKANİK FARKI VAR:
// futbolda menajer bir dizilişle özdeşleşir. Koçun "off/def notu" pasif bir
// çarpandı; burada menajerin tercih ettiği diziliş senin kurduğun şekille
// eşleşirse bonus, eşleşmezse yok — yani menajer seçimi draft başlamadan
// verilmiş bir karara (şekle) bağlanıyor.
//
// Notlar sübjektif ve dönem itibarına dayalı; ölçülmüş bir şey değil.

export const MANAGERS = [
  { name: "Pep Guardiola",     shape: "4-3-3",   att: "A+", def: "A-", tag: "POSSESSION" },
  { name: "Jürgen Klopp",      shape: "4-3-3",   att: "A",  def: "A-", tag: "PRESSING" },
  { name: "Carlo Ancelotti",   shape: "4-3-3",   att: "A",  def: "B+", tag: "MAN-MANAGER" },
  { name: "Diego Simeone",     shape: "4-4-2",   att: "B-", def: "A+", tag: "LOW BLOCK" },
  { name: "Antonio Conte",     shape: "3-5-2",   att: "A-", def: "A",  tag: "BACK THREE" },
  { name: "José Mourinho",     shape: "4-2-3-1", att: "B+", def: "A",  tag: "COUNTER" },
  { name: "Mikel Arteta",      shape: "4-3-3",   att: "A-", def: "A-", tag: "POSSESSION" },
  { name: "Simone Inzaghi",    shape: "3-5-2",   att: "A",  def: "A-", tag: "BACK THREE" },
  { name: "Xabi Alonso",       shape: "3-4-2-1", att: "A",  def: "A-", tag: "BACK THREE" },
  { name: "Luis Enrique",      shape: "4-3-3",   att: "A",  def: "B+", tag: "POSSESSION" },
  { name: "Hansi Flick",       shape: "4-2-3-1", att: "A+", def: "B",  tag: "HIGH LINE" },
  { name: "Roberto De Zerbi",  shape: "4-2-3-1", att: "A-", def: "B",  tag: "BUILD-UP" },
  { name: "Unai Emery",        shape: "4-4-2",   att: "B+", def: "A-", tag: null },
  { name: "Marcelo Bielsa",    shape: "3-4-2-1", att: "A",  def: "C+", tag: "PRESSING" },
  { name: "Massimiliano Allegri", shape: "3-5-2", att: "B", def: "A",  tag: "PRAGMATIST" },
  { name: "Gian Piero Gasperini", shape: "3-4-2-1", att: "A", def: "B+", tag: "MAN-MARKING" },
  { name: "Arne Slot",         shape: "4-2-3-1", att: "A-", def: "A-", tag: null },
  { name: "Enzo Maresca",      shape: "4-2-3-1", att: "B+", def: "B+", tag: "BUILD-UP" },
  { name: "Thomas Frank",      shape: "4-3-3",   att: "B",  def: "B+", tag: "SET PIECES" },
  { name: "Oliver Glasner",    shape: "3-4-2-1", att: "B+", def: "B+", tag: "BACK THREE" },
  { name: "Diego Pablo Cholo", shape: "5-3-2",   att: "C+", def: "A+", tag: "LOW BLOCK" },
  { name: "Rafa Benítez",      shape: "4-2-3-1", att: "B",  def: "A-", tag: null },
  { name: "Ange Postecoglou",  shape: "4-3-3",   att: "A-", def: "C+", tag: "HIGH LINE" },
  { name: "Vincent Kompany",   shape: "4-2-3-1", att: "A-", def: "B",  tag: null },
];

const GRADE = { "A+": 1.00, "A": 0.92, "A-": 0.85, "B+": 0.78, "B": 0.70,
                "B-": 0.63, "C+": 0.55, "C": 0.48, "C-": 0.40, "D": 0.30, "F": 0.15 };

export const gradeValue = g => GRADE[g] ?? 0.5;

/** Menajerin bu dizilişe katkısı.
 *  Şekil eşleşirse tam bonus, eşleşmezse yok — futbola özgü olan kısım bu. */
export function managerBonus(manager, shape) {
  if (!manager) return { bonus: 0, matched: false };
  const matched = manager.shape === shape;
  // Not ortalaması 0..1; eşleşmede en fazla +0.05, eşleşmezse +0.01'e kadar
  const quality = (gradeValue(manager.att) + gradeValue(manager.def)) / 2;
  return { bonus: (matched ? 0.05 : 0.01) * quality, matched };
}

/** Draft için rastgele n menajer. */
export function drawManagers(n = 3, rng = Math.random) {
  const pool = [...MANAGERS];
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}
