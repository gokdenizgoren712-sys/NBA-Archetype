/* MatchCard izole önizleme — HANDOFF.md §2.5 tablosundaki ALTI preset.
 *
 * Faz 1 kontrolü: altısı da kırpma ve taşma olmadan render olmalı, compact
 * modda iki crest etiketi de okunur kalmalı.
 *
 * Bu bir ÜRÜN ekranı değil, tezgâh. Hiçbir mevcut ekran bu dosyaya bakmıyor.
 */
import MatchCard from "./MatchCard";

/* §2.5 — "Size presets actually in use — verify all six render". */
const PRESETS = [
  { id: "home-hero", label: "Home hero", width: 323, artHeight: 150, crestSize: 62, scoreSize: 52, compact: false },
  { id: "web-wall", label: "Web wall", width: 268, artHeight: 140, crestSize: 62, scoreSize: 46, compact: false },
  { id: "discover-grid", label: "Discover grid", width: 155, artHeight: 104, crestSize: 44, scoreSize: 30, compact: true },
  { id: "diary-shelf", label: "Diary shelf", width: 155, artHeight: 94, crestSize: 40, scoreSize: 28, compact: true },
  { id: "profile-shelf", label: "Profile shelf", width: 155, artHeight: 88, crestSize: 40, scoreSize: 26, compact: true },
  // §2.6: besleme kartlarında çentik 12px'e iner.
  { id: "feed-inline", label: "Feed inline", width: 295, artHeight: 58, crestSize: 38, scoreSize: 26, compact: true, cut: 12 },
];

/* Tottenham kasıtlı: §1'e göre açık formalar crest mürekkebini #101318
   istiyor, yani prop gerçekten kullanılıyor mu burada görülüyor. */
const MATCH = {
  comp: "PREMIER LEAGUE · MW 4",
  homeAbbr: "ARS", awayAbbr: "TOT",
  homeShort: "Arsenal", awayShort: "Tottenham",
  homeScore: "3", awayScore: "1",
  homeColor: "#EF0107", awayColor: "#ffffff",
  homeCrestInk: "#ffffff", awayCrestInk: "#101318",
  heat: 4.6, ratings: "2,481 ratings", kickoff: "20:00",
};

function Frame({ preset, children, note }) {
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <figcaption style={{ font: "700 9px Rajdhani,system-ui,sans-serif", letterSpacing: ".14em", color: "#7f868b", textTransform: "uppercase" }}>
        {preset.label} · {preset.width}w · art {preset.artHeight} · crest {preset.crestSize} · score {preset.scoreSize}
        {note ? ` · ${note}` : ""}
      </figcaption>
      {/* Genişlik preset'ten sabit; YÜKSEKLİK VERİLMİYOR — §2.4'ün "kart havayla
          dolmaz, içerik kısaysa kart kısalır" kuralı ancak böyle sınanır. */}
      <div data-preset={preset.id} style={{ width: preset.width, minWidth: 0 }}>{children}</div>
    </figure>
  );
}

export default function MatchCardPreview() {
  return (
    <div style={{ minHeight: "100vh", background: "#090a0b", padding: 26, boxSizing: "border-box" }}>
      <h1 style={{ font: "700 21px Rajdhani,system-ui,sans-serif", color: "#eceded", margin: "0 0 4px" }}>
        MatchCard — §2.5 presets
      </h1>
      <p style={{ font: "400 12px Outfit,system-ui,sans-serif", color: "#9aa0a6", margin: "0 0 26px" }}>
        Six contexts, one component. Nothing on this page is wired to a screen.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "flex-start" }}>
        {PRESETS.map((p) => (
          <Frame key={p.id} preset={p}>
            <MatchCard {...MATCH} {...p} finished />
          </Frame>
        ))}
      </div>

      <h2 style={{ font: "700 13px Rajdhani,system-ui,sans-serif", letterSpacing: ".14em", color: "#9aa0a6", margin: "34px 0 13px", textTransform: "uppercase" }}>
        State coverage
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "flex-start" }}>
        {/* Classic: altına dönen ÇENTİK SAÇ ÇİZGİSİ, kart kenarı değil (§2.1). */}
        <Frame preset={{ ...PRESETS[0], label: "Home hero · classic" }} note="gold hairline + stamp">
          <MatchCard {...MATCH} {...PRESETS[0]} finished classic />
        </Frame>
        {/* Spoiler: skor bulanık, ısı gizli, şerit görünür, durum PLAYED olur. */}
        <Frame preset={{ ...PRESETS[0], label: "Home hero · spoiler" }} note="score blurred, heat hidden">
          <MatchCard {...MATCH} {...PRESETS[0]} finished spoiler />
        </Frame>
        {/* Oynanmamış: kickoff + VS. */}
        <Frame preset={{ ...PRESETS[0], label: "Home hero · upcoming" }} note='finished="false" coercion'>
          <MatchCard {...MATCH} {...PRESETS[0]} finished="false" heat={0} ratings="" footNote="TONIGHT" />
        </Frame>
        {/* POTM: silüet versus bloğunu alır, skor banda düşer. */}
        <Frame preset={{ ...PRESETS[0], label: "Home hero · POTM" }} note="score drops to band">
          <MatchCard {...MATCH} {...PRESETS[0]} finished potm shirtNo="7" />
        </Frame>
        {/* Uzun kulüp adı + 6 haneli basket skoru: §4.1 ellipsis ve taşma sınavı. */}
        <Frame preset={{ ...PRESETS[2], label: "Discover · long names" }} note="ellipsis test">
          <MatchCard
            {...PRESETS[2]} finished
            comp="UEFA CHAMPIONS LEAGUE · MATCHDAY 6"
            homeAbbr="BVB" awayAbbr="ATM"
            homeShort="Borussia Dortmund" awayShort="Atlético de Madrid"
            homeScore="112" awayScore="108" scoreSize={24}
            homeColor="#FDE100" awayColor="#CB3524"
            homeCrestInk="#101318" awayCrestInk="#ffffff"
            heat={5} ratings="18,904 ratings"
          />
        </Frame>
        <Frame preset={{ ...PRESETS[3], label: "Diary shelf · classic" }} note="gold diamond, not stamp">
          <MatchCard {...MATCH} {...PRESETS[3]} finished classic />
        </Frame>
      </div>
    </div>
  );
}
