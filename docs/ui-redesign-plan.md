# Primary Arch — UI Yeniden Tasarım Planı (web + mobil)

> Kaynak: `Terminal interface design planning.zip` (handoff paketi) ve
> `Primary Arch Screens v2 (standalone).html`.
> Hazırlandı 2026-09-27 · dal `game-ui-redesign` · kapsam `frontend/src` (RankIt hariç).

---

## 1. Kaynaklar ve öncelik

İki dosya **aynı tasarımı** taşıyor. Standalone HTML, zip içindeki
`Primary Arch Screens v2.dc.html`'in canvas motoru gömülü hali (10.7 MB'ın
10.2 MB'ı motor). 80 ekran başlığının 80'i ve ölçülen layout değerleri iki
dosyada birebir aynı. Zip ayrıca şunları getiriyor:

| Dosya | Ne işe yarar |
|---|---|
| `README.md` | Spec: global kurallar, token'lar, ekran → repo dosya haritası, önerilen sıra |
| `reference/original-design-brief.md` | Değişmez kurallar (FIXED) ve esnek alanlar |
| `Primary Arch Screens v2.dc.html` | 65 aktif ekran (43 web · 22 mobil) + 4 arşiv — **güncel sürüm** |
| `Primary Arch Redesign.dc.html` | Tur tur tarihçe, her kararın gerekçesi |
| `PaSidebar` / `PaIcon` / `PlayerCard` / `FootballCard` `.dc.html` | Bileşen spec'leri |

**Çatışmada kazanan sıra:**

1. Kullanıcının açık kararları (bu dalda verilmiş olanlar dahil — bkz. §11)
2. Handoff paketi (README + v2 ekranları + brief)
3. `DESIGN.md` — yalnızca handoff'un sustuğu yerde
4. Mevcut kod

---

## 2. Tasarımın özü

"Terminal'den koleksiyona." 7–10px mono etiketler, kutu içinde kutu paneller,
numaralı step panelleri ve ağır büyük harf gidiyor. Oyunun renkleri ve glow'u
**veri sayfalarına da** yayılıyor, ama panel başına değil sayfa başına. Panini
oyuncu kartı **dokunulmaz**. İki spor tek ürün, iki aksan: altın `#FFB11B`,
teal `#3FB08C`.

---

## 3. Ölçülen durum → hedef

| Konu | Şu an (ölçüldü) | Hedef (handoff) |
|---|---|---|
| 12px altı yazı | **~518 bildirim**: JSX'te 369 `text-[<12px]` + 108 inline `fontSize`; CSS'te 41 (game.css 39). Kartın kendi 57'si hariç | Minimum 12px; gövde 14–15 |
| Metin skalası | 3 seviye, nötr gri: `#e5e5e5 / #8a8a8a / #3a3a3a` | 5 seviye, sıcak: `#f2efea / #b4afa8 / #8b857e / #5a5650` + ayırıcı `#3a3a3a` |
| Yüzeyler | Opak `#131313 / #1a1a1a`, kenarlık `#262626` | Şeffaf dolgu `rgba(255,255,255,.04–.06)`, seçili `.08`, çerçeve `#1a1a1a` |
| Paneller | `.g-panel` 87, `.g-dock*` 102 kullanım; CSS'te 50 `border:1px solid` | Kutu içinde kutu yok: boşluk, tek solan çizgi, satır alt çizgisi |
| Etiketler | `.g-label` 71 kullanım: 9.5px, büyük harf, `.14em`, önünde çizgi | 12px meta; bölüm başlığı 20px Rajdhani + 8px parlayan nokta |
| Mono | `.g-mono` 26 kullanım | Yok |
| Glow | `aura-blob` 81 kullanım, neredeyse her panelde | Sayfa başına 1–2 büyük organik blob |
| Kabuk | 48px üst bar + 64px ikon rayı, 9px büyük harf etiket, veri-yenile üst barda | 220px etiketli kenar çubuğu (72px'e katlanır), gruplu nav, spor anahtarı içinde; veri-yenile → Admin › Data |
| Mobil drawer | `min(78vw,300px)`, mor-siyah gradient | 320px, düz `#0e0e0e`, `20px 0 60px` gölge |
| Players | NBA 60 / tarihsel 200 kart; **futbol tek istekte 600 kart**, sayfalama yok | Sol 250px filtre kolonu + "Load more" |
| 404 | `path="*"` rotası **yok** — hatalı URL boş kabuk açıyor | 404 / boş / yükleniyor / hata durumları (18d) |
| Skeleton | Yalnız RankIt'te | `paSkel` shimmer, kademeli gecikme |
| `POS_COLOR` | İki farklı palet: `CourtBoard.jsx` ≠ `Lineups.jsx` | Tek kaynak |

Doğrulanan eşleşmeler: tasarımdaki `ARCH_COLOR` repo'daki
`constants/archetypeColors.js` ile 12/12 aynı. Tasarımdaki `POS_COLOR`
`CourtBoard.jsx`'teki ile aynı; `Lineups.jsx`'teki sapmış.

---

## 4. DESIGN.md ile çatışmalar — handoff kazanır

| # | DESIGN.md | Handoff (geçerli) |
|---|---|---|
| 1 | Label katmanı 8.5–9.5px, büyük harf, `::before` çizgi | Min 12px; mono/büyük-harf mikro etiket yok |
| 2 | Micro ölçeği 7.5–12.5px ("keyfi değil") | Silindi — **tek tip ölçeği** |
| 3 | "Uppercase-Means-Game": iki enerji katmanı | Tek katman. Büyük harf yalnız Rajdhani oyun wordmark'ı ve CTA'da (`LINEUP BUILDER`, `PLAY AGAIN`), `.05em` |
| 4 | 3 seviyeli nötr mürekkep | 5 seviyeli sıcak mürekkep |
| 5 | Opak yüzeyler, `#262626` hairline | Şeffaf beyaz dolgular, `#1a1a1a` çerçeve |
| 6 | Her yüzey kartın düzleştirilmiş hali, kenarlıklı panel | Kutu içinde kutu yasak; v2 kart katmanı: anlamlı birim başına tek kart |
| 7 | İkon rayı, 13px büyük harf etiket | 220/72px kenar çubuğu, 14px/500 cümle düzeni, Play / Scout / Learn grupları |
| 8 | Holo/foil/kesik köşe tüm yüzeylerin atası | Kesik köşe + holo **yalnız oyuncu kartında**; giriş/mod kartlarından kalkıyor |
| 9 | En yüksek yazı `.g-dock-title` 23px/800 | H1 40px; hero 48–72; büyük an 96–112 |
| 10 | `aura-blob` her panelde | Sayfa seviyesinde 1–2 blob; Admin'de hiç |
| 11 | Veri-yenile kabukta | Admin › Data |

**DESIGN.md'den aynen kalanlar:** yalnız koyu tema, `#0b0b0b` zemin · spor
başına bir aksan, altın = kupa/şampiyon her iki sporda · futbol faz renkleri
sabit · Rajdhani + Outfit · kullanıcı metni İngilizce · fotoğraf atfı kartta
(lisans zorunluluğu) · draft sırasında rating gizli · skor = persantil +
belirtilen referans sayısı · arketip/faz renkleri tek kaynak · 96px "büyük an"
istisnası · hayalet input'lar (handoff'un alt çizgili select/search'ü bununla
uyumlu).

Faz 2 sonunda `DESIGN.md` yeni sisteme göre yeniden yazılacak; eski kurallar
bir "superseded" bölümüne taşınacak ki kod ile belge bir daha çelişmesin.

---

## 5. Yeni tasarım sistemi

Kaynak: README + 65 ekrandan çıkarılan gerçek değerler.

### Renk

Mevcut değişken isimleri korunur (39 dosya onları okuyor), değerleri değişir;
yeni isimler eklenir.

```css
--bg-base:        #0b0b0b;
--frame:          #1a1a1a;                  /* eski --border #262626'nın yerine */
--fill-1:         rgba(255,255,255,.035);   /* satır kartı */
--fill-2:         rgba(255,255,255,.05);    /* ikincil buton, yükseltilmiş */
--fill-sel:       rgba(255,255,255,.08);    /* seçili segment / satır */
--text-primary:   #f2efea;                  /* #e5e5e5 idi */
--text-secondary: #b4afa8;                  /* YENİ — gövde metni */
--text-muted:     #8b857e;                  /* #8a8a8a idi */
--text-faint:     #5a5650;                  /* #3a3a3a idi */
--ink-divider:    #3a3a3a;                  /* YENİ — yalnız ayırıcı, "VS", breadcrumb "/" */
--divider-fade:   linear-gradient(90deg,transparent,rgba(255,255,255,.08) 20%,rgba(255,255,255,.08) 80%,transparent);
--row-line:       inset 0 -1px 0 rgba(255,255,255,.05);
--you: #60a5fa;   --opp: #f87171;
```

`--text-faint`'in `#5a5650`'ye taşınması bilinçli: bugün bu değişken
`.g-label` gibi **metinlerde** kullanılıyor ve `#3a3a3a`, `#0b0b0b` zeminde
neredeyse okunmuyor. Handoff `#3a3a3a`'yı yalnız ayırıcıya ayırıyor.

### Tip ölçeği

| Rol | Boyut | Yazı |
|---|---|---|
| Meta, caption | 12 | Outfit 400–500 |
| Gövde | 13 / 14 / 15 | Outfit 400–600 |
| Satır başlığı, stat | 16–18 | Rajdhani 600–700 |
| Bölüm başlığı | 20 | Rajdhani 700 + 8px parlayan nokta |
| Stat değeri | 17–44 | Rajdhani 700 + kendi renginde glow (`0 0 18px <c>66`) |
| Sayfa H1 | 40 | Rajdhani 700, line-height 1 |
| Hero | 48–72 | Rajdhani 700 |
| Büyük an | 96–112 | Rajdhani 700 — not, toplam skor, oda kodu |

### Şekil ve yüzey

- **Radius:** chip/segment 9–15 · buton 11–12 · satır 9–12 (havuz satırı 12) ·
  kart 20 · modal ve büyük an 22 · avatar 50%.
- **Kart (v2):**
  ```css
  border-radius: 20px;
  background: linear-gradient(180deg, <accent>14, rgba(255,255,255,.015) 65%);
  box-shadow: inset 0 1px 0 <accent>55, 0 24px 60px -34px #000;
  padding: 22px 24px;
  /* opsiyonel köşe blob'u: 220×180, blur 50px, opaklık .14 */
  ```
  Satır kartı: r14–18, `rgba(255,255,255,.025–.035)`,
  `inset 0 1px 0 rgba(255,255,255,.05–.06)`. Admin'de aksansız.
- **Seçili satır/kart:** `linear-gradient(100deg,<c>26,<c>08 70%)` +
  `inset 0 0 0 1px <c>77, 0 0 22px -8px <c>`.

### Kontroller

- **Butonlar** 42–56px. Birincil basketbol:
  `linear-gradient(100deg,#ffe9b0,#FFB11B 55%,#ffe9b0)`, mürekkep `#14110a`,
  `0 0 22px rgba(255,177,27,.35)`, 3.2s shine süpürmesi
  (`prefers-reduced-motion`'da kapalı). Birincil futbol: düz `#3FB08C` + teal
  glow. İkincil: `--fill-2`.
- **Sekme:** yalnız metin, 15px/500; aktif `inset 0 -2px 0 <accent>`.
- **Segment:** kap `.04` r12 p4, aktif `.08`.
- **Select / arama:** alt çizgili, `inset 0 -1px 0 rgba(255,255,255,.12)`.

### Glow

Sayfa başına 1–2 blob (oyun idle'da 3), `blur(60–90px)`, opaklık .05–.16,
organik radius `72% 28% 55% 45% / 35% 65% 40% 60%`. Renk sayfanın bağlamından
gelir: seçili arketip, sırası gelen oyuncu, spor. Değişince
`transition: background .5s`.

### Mobil (390×844)

16px yan boşluk · dokunma hedefi ≥ 44px · birincil aksiyon 54px ve alta sabit
(`padding:14px 16px 26px`, zemin `linear-gradient(to top,#0b0b0b 70%,transparent)`)
· drawer 320px.

---

## 6. Mimari karar: primitifleri yeniden giydir, çatallama

Brief'in 9. değişmez kuralı: `g-*`, `aura-*`, `pcard-*` sözlüğü iki sporu
birbirine bağlıyor. Yeni bir görsel dil açılmayacak, bu sınıflar yeniden
giydirilecek. Bu sayede 39 JSX dosyasının çoğu yalnız CSS değişikliğiyle
güncellenir.

İki şey sınıf değiştirmeyle çözülmüyor:

- **Yazı boyutları JSX'te sabit** (477 bildirim). Dosya dosya düzeltilecek.
  En yoğunlar tam da oyun ekranları: `SeasonSimPanel` 56, `WithAFriendGame` 40,
  `SameScreenGame` 28, `LineupGame` 24, `FootballGame` 17,
  `PlayoffBracketView` 17, `SeasonPanel` 16, `CourtBoard` 14.
- **İç içe paneller yapısal.** Dış `.g-panel`'in kenarlığını kaldırmak içteki
  paneli yok etmiyor. Her sayfada `.g-panel .g-panel` sayılıp içtekiler satır
  kartına ya da düz bloğa çevrilecek.

---

## 7. Faz planı

Her faz web ve mobil **birlikte** biter (mock'lar da çift). Her faz ayrı
commit'ler; push yok.

### Faz 0 — Temel: token'lar ve tip ölçeği

- Handoff paketini `docs/design/handoff-v2/` altına kopyala: `support.js`,
  `.dc.html`'ler, README, brief — 1.1 MB. Arketip PNG'leri zaten
  `frontend/public/archetypes`'ta. Downloads'taki kopya kaybolursa referans
  kalsın.
- `index.css :root` → §5'teki token'lar. **Tek commit**, çünkü `--text-faint`
  ve `--border` değişimi her sayfayı aynı anda etkiler.
- `game.css`, `aura.css`, `sport-select.css`: 41 adet 12px-altı bildirimi
  ölçeğe çek. `PlayerCard.css`'in 57'si dokunulmaz.
- `POS_COLOR` → `constants/positionColors.js`; `Lineups.jsx`'teki sapmış palet
  silinir.
- **Bitti ölçütü:** kabuk dışında yapı aynı; renk ve okunabilirlik değişmiş;
  hiçbir rota kırılmamış.

### Faz 1 — Kabuk (PaSidebar, 19a)

- **`components/Sidebar.jsx`** — 220px açık / 72px kapalı. Katlanma durumu
  `localStorage`'da (try/catch ile).
  - Logo satırı; altında **spor anahtarı** (2 kolon segment, `#131313` r10;
    basınca diğer sporun köküne gider).
  - Gruplu nav, 12px `#8b857e` grup başlıkları, 38px satırlar:
    - Basketbol: **Play** (Game, Lineups) · **Scout** (NBA, G League, NCAA,
      EuroLeague) · **Learn** (Explore, Blog, About)
    - Futbol: **Play** (Game, Chemistry) · **Scout** (Players) · **Learn**
      (Explore, Blog, About)
  - Aktif öğe: spor aksanı `1a` zemin + aksan renkli ikon + `#f2efea` metin.
    Lig öğeleri (G League / NCAA / EuroLeague) sağda kendi renginde 6px nokta
    taşır. (Bileşendeki `glow` varyantı 39 kullanımın hiçbirinde açık değil —
    varsayılan varyant uygulanır.)
  - Altta Admin (yetkiliyse) ve Collapse; kapalı halde avatar.
- **1440px altı:** bütün mock'lar 1440 genişlikte. 1280'de açık kenar çubuğu
  draft kortunu 568px'ten 408px'e indiriyor; kapalı halde 556px — tasarlanan
  orana çok yakın. Bu yüzden **oyun rotalarında 1440 altında kenar çubuğu
  kapalı başlar**, kullanıcı açabilir.
- 48px üst bar masaüstünde kalkar. Yerine ortak `PageBar`: breadcrumb (13px,
  `Basketball / Game / Lineup Builder`) + 32px avatar. Layout render eder,
  sayfalar değil.
- Veri-yenile düğmesi kabuktan kalkar (Faz 7'de Admin › Data'ya).
- `PaIcon.dc.html`'deki yeni lig ikonları: NBA, G League, NCAA, EuroLeague.
- RankIt öğesi `rankit/redesign/BrandMark.jsx`'teki `RankItMark` ile kalır.
- **Mobil:** drawer 320px / `#0e0e0e`, aynı gruplu nav + spor anahtarı; üst
  bar yalnız menü tetikleyicisi olarak kalır.
- `path="*"` → `NotFound` sayfası (18d).
- Footer yalnız akan belge sayfalarında (`margin-top:auto`, 12px, üstte iç
  gölge çizgisi). Scroll'suz oyun ekranlarında yok — 3a ve 5a'da da yok.
- **Bitti ölçütü:** her rota yeni kabukta; mobilde 44px altı hedef yok.

### Faz 2 — Ortak primitifler (yeniden giydirme)

| Primitif | Yeni hali |
|---|---|
| `.g-label` | 12px `--text-muted` meta; büyük harf ve `::before` çizgisi yok |
| `.g-section-title` (yeni) | 20px Rajdhani 700 + 8px parlayan aksan noktası. `.g-label`'ın **bölüm başlığı** olan kullanımları buna çevrilir — 71 kullanımın ayrıştırılması gerekiyor, çünkü ikisi artık farklı rol |
| `.g-panel` | v2 kart katmanı, kenarlıksız. `.subtle` → satır kartı |
| `.g-dock` | Kutu değil: `1fr auto 1fr` başlık ızgarası + altında `--divider-fade` |
| `.g-step` | Kutusuz 4 kolon: 40px altıgen ikon + numara, 18px başlık, 13px açıklama, adım renginde blob |
| `.g-tile` | Mod düğmesi (48px r12: nokta + etiket + ipucu) ve seçili-satır deseni |
| `.g-seg` | Segment (kap `.04` r12 p4, aktif `.08`) |
| Sekmeler | Metin 15px/500 + alt çizgi |
| `aura-rating-btn` | Birincil (altın gradient + shine / teal düz); ikincil `--fill-2` |
| `aura-select`, arama | Alt çizgili |
| `aura-blob` (81) | Panel başına blob'lar kalkar → `<PageGlow tint>` sayfa seviyesinde. Oturum başındaki kasma teşhisine göre bu aynı zamanda performans kazancı |
| `.g-mono` (26) | Kalkar |
| Yeni bileşenler | `<Skeleton>` (paSkel), `<EmptyState>` (işe yarar metinle — örn. "No center is a Spacer rated 90+ this season. The closest is…"), `<ErrorState onRetry>`, mobil `<PinnedAction>`, renkli sayı glow yardımcısı |

**Bitti ölçütü:** hiçbir sayfada `.g-panel .g-panel` yok; `#262626`
kenarlıklı panel yok; sayfa başına blur'lu blob ≤ 2 (oyun idle ≤ 3).

### Faz 3 — Oyun

Temel ve primitiflerden sonra, çünkü oyun ekranları onlardan beslenir; önce
yapılsa iki kez yapılırdı.

| Ekran | Web / mobil | Yapısal değişiklik |
|---|---|---|
| Mod seçimi + kurallar | 4b, 18a / 4c · 17c | Kesik köşe/holo kalkar. ⓘ modalı: 560px r22, karartılmış + bulanık perde, anahtar/değer satırları, spor aksanlı CTA |
| Lineup Builder idle | 3a / 2c | Hero `LINEUP BUILDER` 48px + mod düğmeleri + CTA aynı satırda. 4 adım **kutusuz** satır. Altta `1fr \| 340px`: kadro önizleme (kort + 120px bench) ve Leaderboard (64px en iyi persantil, **referans satırı**, 38px satırlar) |
| Draft | 5a / 5b | Başlık `1fr auto 1fr`: başlık + era çipi + ilerleme · Season/Team 44px glow · 58px joker kutuları. Gövde **2 kolon** `540px \| 1fr`: havuz tablosu (58px satır, baş harfli avatar, 6 stat kolonu) · kort + 66px bench şeridi. Draft sırasında leaderboard kolonu yok. Mobil: kadro şeridi üstte, havuz altta |
| Koç seçimi | 12a / 20b | Seçilen koç mor halka ve glow; CTA `SIMULATE 82 WITH <NAME>` |
| Skor + sezon | 12b / 20a | 96px harf notu (tek büyük an), persantil + havuz büyüklüğü, Quality/Coverage/Chemistry ağırlıkları, standings / playoff / ödül kolonları, kaydet + paylaş + Play Again |
| Same Screen draft (Friend/Online da) | 13a / 20c | `260 \| 1fr \| 260`. Glow sırası gelen tarafa kayar (sen `#60a5fa`, rakip `#f87171`; aktif .13, pasif .05); pasif kadro .7 opaklık; BAN sayacı; BANNED etiketi |
| Lobi | 14a / 20d | Friend / Online segmenti; 112px oda kodu + kopyala düğmeleri; `320 \| 80 \| 320` VS ızgarası, rakip katılınca yuvası kırmızı yanar; Online'da arama sayacı |
| Futbol idle | 18b / — | Diziliş seçici (5 şekil, faz renkli önizleme), lig çipleri, haftalık leaderboard |
| Futbol draft | 7a / — | Havuz solda, saha + bench sağda (`formations.js`) |
| Futbol sonuç | 16d / — | 96px not, faz skorları, kadro raporu (Primary / Alt role / Out of role) |
| Futbol sezon | 14b / 21e | Quick Sim / Rewrite History, 38 maçlık form şeridi, kendi kulübü vurgulu tablo |
| Futbol H2H sonucu | 13b / 20f | 96px toplam skor, ayaklar, penaltı noktaları, 400-tekrar olasılık çubuğu, Rematch |

Oyun ekranları scroll'suz kalır (bu dalda kurulan kural; mock'lar da 1000px
sabit çerçeve).

### Faz 4 — Çekirdek veri sayfaları

| Ekran | Web / mobil | Değişiklik |
|---|---|---|
| NBA players | 3b / 19b | Sol 250px filtre kolonu: Season (alt çizgili select), arama, Position hapları, **Arketip listesi** (renk noktası + ad + sayı). Arketip seçince sayfa o renge bürünür (blob geçişi + hero'da 96px arketip görseli). Izgara `minmax(280px,1fr)`, boşluk 28/24. Sayı etiketi + **Load more**. Mobilde filtre alt sayfası |
| Futbol players | 6a / 20e | Aynı kalıp, teal, faz renkli glow, atıf kartta. **600 kartlık tek istek → sayfalı** |
| G League / NCAA / EuroLeague | 11c · 17b / — | Players kalıbı; aksan lige göre değişir (`#A8263F` / `#3D7EC9` / `#FF6900`) |
| Oyuncu profili | 9a / 19c | — |

### Faz 5 — Keşfet ve öğren

8a/19d Map (lejant çipleri filtreler, diğerleri .08'e söner, sayfa glow'u renk
değiştirir) · 8b/19e Compare (VS + benzerlik, üst üste 12 eksenli radar,
kazanan tarafı parlayan H2H satırları, "percentile vs 582 players") · 11a
Affinity · 10a/21a Lineups · 11b Chemistry · 16a/21f Futbol Map · 16b Futbol
Compare · 9b/21b Glossary (mobilde akordeon) · 17a Methodology · 16c Futbol
Glossary/About.

### Faz 6 — Hesap, içerik, legal, sistem

10c/20g Login · 17d Register / Forgot / Reset (ortalı 400px form, kenarlıksız
dolgulu input, satır içi ipucu/hata) · 11d Profile · 10b/21c Blog · 11e/21d
Blog yazısı · 11f Legal (tek kalıp) · 18c Contact (konu çipleri) · 18d sistem
durumları (Faz 2 bileşenleri burada her sayfaya bağlanır).

### Faz 7 — Admin

15a/21g Data (veri-yenile buraya taşınır) · 15b Users & reports · 17e
Articles · 17f Article editor · 17g Corrections. Nötr kartlar, **glow yok**.

**Kapsam dışı:** `/rankit/*` — kendi tasarım sistemi var (brief G grubu).

---

## 8. Mobil planı

22 mobil mock var; 22 web ekranının mobil karşılığı **yok**. Onlar §5'teki
kurallardan ve en yakın kardeş mock'tan türetilecek:

| Mobil mock'u olmayan | Türetileceği yer |
|---|---|
| 18a Futbol mod seçimi | 4c |
| 18b, 7a Futbol idle / draft | 2c, 5b |
| 16d Squad fit | 20a |
| 11c, 17b Lig sayfaları | 19b |
| 16b Futbol Compare | 19e |
| 16c, 17a Glossary / Methodology | 21b akordeonu |
| 11a Affinity, 11b Chemistry | 21a |
| 17c Kurallar modalı | Tam genişlik alt sayfa |
| 17d, 11d, 11f, 18c, 18d | 20g ve 21d'nin form/metin düzeni |
| 15b, 17e–17g Admin | 21g |

Genel: 16px kenar, ≥ 44px hedef, birincil aksiyon 54px ve alta sabit, drawer
navigasyonu, hover'a bağlı bilgi yok (bu dalda zaten kaldırıldı).

---

## 9. Bilinen tuzaklar (bu dalda yaşananlar)

1. **Seçici özgüllüğü.** `.g-panel > *`, `.g-tile > *:not(...)` gibi çok
   sınıflı seçiciler tek sınıflı `position:absolute`'u eziyor; `:not()`
   argümanları özgüllüğe sayılıyor. `.g-panel` yeniden giydirilirken bu
   zincirler de gözden geçirilecek.
2. **Başlık/satır `gap` farkı.** Başlık satırının `gap`'i veri satırınınkinden
   farklıysa kolonlar her adımda 2px kayıyor. 5a'nın havuz tablosu
   (`repeat(6,44px)`, gap 4) başlıkta ve satırda aynı olmalı.
3. **Kesin yükseklikli grid + `min-h-0`** satırları eşitleyip içeriği üst üste
   bindiriyor (mobil Lineups'ta 88px kırpılma). Mobilde flex kolon kullan.
4. **Scroll'suz kural** korunuyor; belge sayfaları (About, Glossary, Blog)
   kendi bölgelerinde kayıyor.
5. **Tarayıcı paneli frame üretmiyor:** transition'lar donuk, rAF 0,
   ResizeObserver ateşlenmiyor, `setInterval` 11× yavaş. Doğrulama
   `transition:none` enjekte edip `getBoundingClientRect` ile yapılır.
6. **Kart dokunulmaz.** `PlayerCard.css`'teki 57 adet 12px-altı bilinçli olarak
   kalıyor; toplu font düzeltme betikleri kart dosyalarını hariç tutmalı.
7. **Global token değişimi** her sayfayı aynı anda etkiliyor → Faz 0 tek
   commit, ardından tüm rotalarda denetim.

---

## 10. Doğrulama kapısı

Her faz sonunda, her rotada, 1440×900 ve 390×844'te bir denetim betiği:

- sayfa taşması 0 (belge sayfaları hariç)
- `.pcard` dışında en küçük hesaplanmış font-size ≥ 12
- `.g-panel .g-panel` sayısı 0
- `#262626` 1px kenarlıklı panel 0
- blur'lu blob ≤ 2 (oyun idle ≤ 3)
- mobilde 44px'ten küçük etkileşimli öğe 0

---

## 11. Açık kararlar (varsayılanla ilerlenir)

| # | Karar | Varsayılan |
|---|---|---|
| 1 | Handoff repoya kopyalansın mı? | Evet — `docs/design/handoff-v2/`, 1.1 MB |
| 2 | Temelden sonra önce oyun mu, Players mı? | **Oyun** (son isteğin konusu). Alternatif: 600 kartlık performans sorunu için Players önce |
| 3 | 16a futbol haritası 24 küme etiketi gösteriyor; sen iki tur önce arketip işaretlerini kaldırttın | **Senin kararın kalır**: etiket yalnız seçili arketipte |
| 4 | Bu dalda kalınlaştırılan "Draft Process" step kartları | 3a'ya göre kutusuz satıra döner; içerik aynen kalır |
| 5 | 15a kaynak başına "Refresh" istiyor; backend'de yalnız `/api/admin/clear-cache` var | Şimdilik yalnız "Refresh all"; kaynak başına yenileme ayrı backend işi |
| 6 | Same Screen idle (tam kort + iki bench) ve Online'daki "salary cap top-25'e karşı" seçeneği mock'ta yok | İkisi de senin açık isteğin → kalır, yeni token'larla giydirilir |
| 7 | 1440 altında kenar çubuğu | Oyun rotalarında kapalı başlar |
| 8 | DESIGN.md | Faz 2 sonunda yeniden yazılır; eski kurallar "superseded" altına |
