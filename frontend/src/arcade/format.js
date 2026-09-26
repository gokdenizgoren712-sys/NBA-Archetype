// Games modülünün küçük biçim yardımcıları (bileşen dosyaları yalnız bileşen dışa aktarsın).
export const GRADE_HEX = { S: "#c4b5fd", A: "#4ade80", B: "#60a5fa", C: "#FFB11B", D: "#f87171" };
export const MODE_LABEL = { classic: "Classic", salarycap: "Salary Cap" };
export const lastName = (name = "") => name.split(" ").slice(-1)[0];
export const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
