/**
 * Lineup açıklama jeneratörü — TR/EN destekli, yeni metrikler (Switch + ShotDepth).
 */

const ROLE_KEYS = [
  "Primary Creation", "Secondary Playmaking", "Floor Spacing",
  "Interior Defense", "Perimeter Defense", "Physical Force",
  "Finishing", "Two-Way Defense", "Shot Creation", "Transition", "Versatility",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Pozisyon → Skor_* sütun eşlemesi
const POS_SCORE_KEY = { PG:"Skor_PG", SG:"Skor_SG", SF:"Skor_SF", PF:"Skor_PF", C:"Skor_C" };
const POS_NAMES     = { PG:"Oyuncu_1", SG:"Oyuncu_2", SF:"Oyuncu_3", PF:"Oyuncu_4", C:"Oyuncu_5" };

// lang: "tr" | "en"
export function explainLineup(lineup, lang = "tr") {
  const names = [lineup.Oyuncu_1, lineup.Oyuncu_2, lineup.Oyuncu_3, lineup.Oyuncu_4, lineup.Oyuncu_5]
    .filter(Boolean);
  const archetypes = (lineup.Arketipler || "").split(" | ");

  const players = names.map((name, i) => ({
    name: name.split(" ").slice(-1)[0],
    fullName: name,
    arch: archetypes[i] || "",
  }));

  // Rol skorları
  const roles = {};
  ROLE_KEYS.forEach(k => {
    roles[k] = lineup["rol_" + k.replace(/ /g, "_")] ?? 0;
  });

  const strong = ROLE_KEYS.filter(k => roles[k] >= 0.75).sort((a,b) => roles[b]-roles[a]);
  const weak   = ROLE_KEYS.filter(k => roles[k] <  0.58).sort((a,b) => roles[a]-roles[b]);

  // En yüksek overall_score'a sahip oyuncuyu bul
  // Positional lineup: Skor_PG/SG/SF/PF/C sütunlarından; custom: player_scores dict
  let star = players[0];
  let bestScore = -1;
  const positions = ["PG", "SG", "SF", "PF", "C"];
  positions.forEach((pos, i) => {
    const sc = lineup[POS_SCORE_KEY[pos]] ?? 0;
    if (sc > bestScore) {
      bestScore = sc;
      star = players[i] || players[0];
    }
  });
  // custom lineup için player_scores dict
  if (lineup.player_scores) {
    names.forEach((name, i) => {
      const sc = lineup.player_scores[name] ?? 0;
      if (sc > bestScore) { bestScore = sc; star = players[i]; }
    });
  }

  const creator = star;

  const switchScore = lineup.Switch   ?? 0;
  const shotDepth   = lineup.ShotDepth ?? 0;
  const fitScore    = Math.round((lineup.Uyum_Skoru || 0) * 100);

  const sentences = [];

  if (lang === "tr") {
    // 1. En iyi oyuncu
    if (star) {
      const verbs = ["bu lineup'ın motoru", "sistemin merkezinde", "en kritik parçası", "bu kombinasyonun yıldızı"];
      sentences.push(
        `${star.fullName} ${pick(verbs)} — ${star.arch} kimliğiyle kadronun en dominant oyuncusu (skor: ${Math.round(bestScore * 100)}).`
      );
    }

    // 2. Savunma profili
    if (roles["Two-Way Defense"] >= 0.80 && roles["Interior Defense"] >= 0.80) {
      sentences.push(
        `Savunmada iki taraflı baskı: iç saha (${Math.round(roles["Interior Defense"]*100)}) + perimeter (${Math.round(roles["Perimeter Defense"]*100)}) — bu sezonun kazandıran kombinasyonu.`
      );
    } else if (roles["Interior Defense"] >= 0.80) {
      const anchor = players.find(p => ["Anchor","Force"].includes(p.arch));
      sentences.push(
        `İç saha ${anchor ? anchor.fullName + " sayesinde" : ""} güçlü korunuyor (INT: ${Math.round(roles["Interior Defense"]*100)}).`
      );
    } else if (roles["Perimeter Defense"] >= 0.75) {
      sentences.push(
        `Perimeter savunma (${Math.round(roles["Perimeter Defense"]*100)}) bu lineupın öne çıkan gücü.`
      );
    }

    // 3. Switch ability
    if (switchScore >= 0.65) {
      sentences.push(
        `Switch kabiliyeti yüksek (${Math.round(switchScore*100)}) — lineup farklı boyutlardaki perdelere karşı savunma kaybetmeden rotasyon yapabiliyor.`
      );
    } else if (switchScore < 0.45) {
      sentences.push(
        `Switch kabiliyeti sınırlı (${Math.round(switchScore*100)}) — perde-rol oyunlarına karşı savunma zayıf kalabilir.`
      );
    }

    // 4. Shot creation depth
    if (shotDepth >= 0.70) {
      sentences.push(
        `Hücum derinliği iyi (${Math.round(shotDepth*100)}) — birden fazla oyuncu kendi şutunu yaratabilir, top durduğunda alternatif var.`
      );
    } else if (shotDepth < 0.40) {
      sentences.push(
        `Şut yaratma derinliği düşük (${Math.round(shotDepth*100)}) — hücum büyük ölçüde tek yaratıcıya bağımlı.`
      );
    }

    // 5. Spacing
    if (roles["Floor Spacing"] < 0.60) {
      const note = roles["Floor Spacing"] < 0.50
        ? `Spacing bilinçli feda edilmiş (SPC: ${Math.round(roles["Floor Spacing"]*100)}) — ligin %6'sı bu rolü karşıladığından diğer metrikler telafi ediyor.`
        : `Spacing orta düzeyde (SPC: ${Math.round(roles["Floor Spacing"]*100)}), savunma + fizik avantajıyla dengelenmiş.`;
      sentences.push(note);
    }

    // 6. Zayıf nokta
    if (weak.length > 0) {
      sentences.push(`Asıl açık: ${weak[0]} (${Math.round(roles[weak[0]]*100)}).`);
    }

  } else {
    // English
    if (star) {
      const verbs = ["is the centerpiece of this lineup as", "drives the system as", "anchors everything as"];
      sentences.push(`${star.fullName} ${pick(verbs)} a ${star.arch} (score: ${Math.round(bestScore * 100)}).`);
    }

    if (roles["Two-Way Defense"] >= 0.80 && roles["Interior Defense"] >= 0.80) {
      sentences.push(
        `Strong two-sided defense: interior (${Math.round(roles["Interior Defense"]*100)}) + perimeter (${Math.round(roles["Perimeter Defense"]*100)}).`
      );
    } else if (roles["Interior Defense"] >= 0.80) {
      sentences.push(`Interior protection is a strength (INT: ${Math.round(roles["Interior Defense"]*100)}).`);
    }

    if (switchScore >= 0.65) {
      sentences.push(`High switch ability (${Math.round(switchScore*100)}) — lineup can defend across screens without breakdowns.`);
    } else if (switchScore < 0.45) {
      sentences.push(`Limited switch coverage (${Math.round(switchScore*100)}) — screen-roll actions may expose the defense.`);
    }

    if (shotDepth >= 0.70) {
      sentences.push(`Good shot creation depth (${Math.round(shotDepth*100)}) — multiple players can generate their own shot.`);
    } else if (shotDepth < 0.40) {
      sentences.push(`Thin shot creation depth (${Math.round(shotDepth*100)}) — heavily reliant on a single creator.`);
    }

    if (roles["Floor Spacing"] < 0.60) {
      sentences.push(
        roles["Floor Spacing"] < 0.50
          ? `Spacing sacrificed (SPC: ${Math.round(roles["Floor Spacing"]*100)}) — only 6% of the league qualifies, so other slots compensate.`
          : `Average spacing (SPC: ${Math.round(roles["Floor Spacing"]*100)}), offset by defense and physicality.`
      );
    }

    if (weak.length > 0) {
      sentences.push(`Main weakness: ${weak[0]} (${Math.round(roles[weak[0]]*100)}).`);
    }
  }

  return sentences.join(" ");
}
