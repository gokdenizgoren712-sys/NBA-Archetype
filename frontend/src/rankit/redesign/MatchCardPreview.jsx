/* MatchCard izole önizleme — BUILD.md §2.5 tablosundaki YEDİ preset.
 *
 * Faz 1 kontrolü: yedisi de kırpma ve taşma olmadan render olmalı, compact
 * modda iki crest etiketi de okunur kalmalı.
 *
 * Bu bir ÜRÜN ekranı değil, tezgâh. Hiçbir mevcut ekran bu dosyaya bakmıyor.
 */
import MatchCard from "./MatchCard";
import { MATCH_CARD_PRESETS } from "./matchCardPresets";

const PRESETS = Object.values(MATCH_CARD_PRESETS);

/* Tottenham kasıtlı: §1'e göre açık formalar crest mürekkebini #101318
   istiyor, yani prop gerçekten kullanılıyor mu burada görülüyor. */
const MATCH = {
  comp: "PREMIER LEAGUE · MW 4",
  homeAbbr: "ARS", awayAbbr: "TOT",
  homeShort: "Arsenal", awayShort: "Tottenham",
  homeScore: "3", awayScore: "1",
  homeColor: "#EF0107", awayColor: "#ffffff",
  homeCrestInk: "#ffffff", awayCrestInk: "#101318",
  heat: 4.6, ratingCount: 2481, ratings: "2,481 ratings", kickoff: "20:00", userRated: true,
};

function Frame({ preset, children, note }) {
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
      <figcaption style={{ font: "700 9px var(--font-logo)", letterSpacing: ".14em", color: "#7f868b", textTransform: "uppercase" }}>
        {preset.label} · {preset.wrapper}w · art {preset.artHeight} · crest {preset.crestSize} · score {preset.scoreSize}
        {note ? ` · ${note}` : ""}
      </figcaption>
      {/* Genişlik preset'ten sabit; YÜKSEKLİK VERİLMİYOR — §2.4'ün "kart havayla
          dolmaz, içerik kısaysa kart kısalır" kuralı ancak böyle sınanır. */}
      <div data-preset={preset.id} data-expected-wrapper={preset.wrapper}
        style={{ width: preset.wrapper, minWidth: 0 }}>{children}</div>
    </figure>
  );
}

export default function MatchCardPreview() {
  return (
    <div style={{ height: "100%", overflowY: "auto", background: "#090a0b", padding: 26, boxSizing: "border-box" }}>
      <h1 style={{ font: "700 21px var(--font-logo)", color: "#eceded", margin: "0 0 4px" }}>
        MatchCard — §2.5 presets
      </h1>
      <p style={{ font: "400 12px var(--font-sans)", color: "#9aa0a6", margin: "0 0 26px" }}>
        Seven exact presets, one component. Nothing on this page is wired to a product screen.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "flex-start" }}>
        {PRESETS.map((p) => (
          <Frame key={p.id} preset={p}>
            <MatchCard {...MATCH} {...p} finished />
          </Frame>
        ))}
      </div>

      <h2 style={{ font: "700 13px var(--font-logo)", letterSpacing: ".14em", color: "#9aa0a6", margin: "34px 0 13px", textTransform: "uppercase" }}>
        State coverage
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "flex-start" }}>
        {/* Classic: altına dönen ÇENTİK SAÇ ÇİZGİSİ, kart kenarı değil (§2.1). */}
        <Frame preset={{ ...MATCH_CARD_PRESETS.mobileHero, label: "Mobile hero · classic" }} note="gold hairline + stamp">
          <MatchCard {...MATCH} {...MATCH_CARD_PRESETS.mobileHero} finished classic />
        </Frame>
        {/* Spoiler: skor bulanık, ısı gizli, şerit görünür, durum PLAYED olur. */}
        <Frame preset={{ ...MATCH_CARD_PRESETS.mobileHero, label: "Mobile hero · spoiler" }} note="score hidden, heat and Classic withheld">
          <MatchCard {...MATCH} {...MATCH_CARD_PRESETS.mobileHero} finished spoiler classic />
        </Frame>
        <Frame preset={{ ...MATCH_CARD_PRESETS.mobileHero, label: "Mobile hero · 19 ratings" }} note="empty heat and explicit threshold label">
          <MatchCard {...MATCH} {...MATCH_CARD_PRESETS.mobileHero} finished ratingCount={19} ratings="19 ratings" />
        </Frame>
        <Frame preset={{ ...MATCH_CARD_PRESETS.mobileHero, label: "Mobile hero · unrated" }} note="verdict covered until own rating or explicit reveal">
          <MatchCard {...MATCH} {...MATCH_CARD_PRESETS.mobileHero} finished userRated={false} classic footNote="Classic" />
        </Frame>
        <Frame preset={{ ...MATCH_CARD_PRESETS.mobileShelf, label: "Mobile shelf · unrated" }} note="compact verdict gate without clipping">
          <MatchCard {...MATCH} {...MATCH_CARD_PRESETS.mobileShelf} finished userRated={false} />
        </Frame>
        {/* Oynanmamış: kickoff + VS. */}
        <Frame preset={{ ...MATCH_CARD_PRESETS.mobileSheet, label: "Mobile sheet · upcoming" }} note='finished="false" coercion'>
          <MatchCard {...MATCH} {...MATCH_CARD_PRESETS.mobileSheet} finished="false" heat={0} ratings="" footNote="TONIGHT" />
        </Frame>
        {/* POTM: silüet versus bloğunu alır, skor banda düşer. */}
        <Frame preset={{ ...MATCH_CARD_PRESETS.webWall, label: "Web wall · POTM" }} note="score drops to band">
          <MatchCard {...MATCH} {...MATCH_CARD_PRESETS.webWall} finished potm shirtNo="7" />
        </Frame>
        {/* Uzun kulüp adı + 6 haneli basket skoru: §4.1 ellipsis ve taşma sınavı. */}
        <Frame preset={{ ...MATCH_CARD_PRESETS.webShelf, label: "Web shelf · long names" }} note="ellipsis test">
          <MatchCard
            {...MATCH_CARD_PRESETS.webShelf} finished
            comp="UEFA CHAMPIONS LEAGUE · MATCHDAY 6"
            homeAbbr="BMG" awayAbbr="WOL"
            homeShort="Borussia Mönchengladbach" awayShort="Wolverhampton Wanderers"
            homeScore="3" awayScore="1"
            homeColor="#FDE100" awayColor="#CB3524"
            homeCrestInk="#101318" awayCrestInk="#ffffff"
            heat={5} ratingCount={18904} ratings="18,904 ratings" userRated
          />
        </Frame>
        <Frame preset={{ ...MATCH_CARD_PRESETS.mobileShelf, label: "Mobile shelf · basketball" }} note="three-digit stacked score">
          <MatchCard {...MATCH} {...MATCH_CARD_PRESETS.mobileShelf} sport="Basketball"
            comp="NBA" homeAbbr="OKC" awayAbbr="DEN" homeShort="Oklahoma City Thunder"
            awayShort="Denver Nuggets" homeScore="118" awayScore="115" finished />
        </Frame>
      </div>
    </div>
  );
}
