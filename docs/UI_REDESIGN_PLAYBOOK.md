# UI Redesign Playbook — "Panini Kart" Tarzı

**Durum (güncellendi 2026-07-30):** Faz 1 (kart + filtre drawer) NBA/G-League/NCAA/
EuroLeague'de tamamlandı. Faz 2 ("Aura Everywhere", §0) de artık tamamlandı — TopBar,
SideNav, BottomNav, `AuraSearch` (Finder-tarzı arama), ghost-select/ghost-input/
pill-button sistemi (`frontend/src/aura.css`), ve şu sayfaların HEPSİ de-box edildi:
Players, G-League, NCAA, EuroLeague, PlayerProfile (artık tek bir expanded hero
karta indirgendi), Compare (PlayerCard ön-yüzü + aura-glass paneller), Affinity
(Duos tab gerçek PlayerCard'lara geçti, matrix/best-pairs/drill-down de-box edildi),
Explore (kontrol çubuğu + legend + tooltip de-box edildi, scatter plot'un kendisi
bilinçli olarak dokunulmadı — veri görselleştirmesi). Explore/Compare/Affinity
`ExploreHub`'da, Glossary/About `FundamentalsHub`'da tek route grubu altında
birleştirildi (çoklu path → tek lazy component, `useLocation`/`useNavigate` tab
mantığı, `NAV`'da `extraActive`). Glossary'nin `SplitPane` tabanlı liste+detay
yapısı TAMAMEN kaldırıldı (2026-07-30): Components tab artık her Core/Modifier
bileşeni `PlayerCard.css`'in `pcard-*` sınıflarıyla kendi kartında gösteriyor
(açıklama+eşik karta gömülü, tıklamaya gerek yok); Core kartları tıklanınca
`api.players({arch, sort_by:"overall_score", limit:10})` ile o arketipte GERÇEK
en yüksek overall'lı 10 oyuncuyu çekip `pcard-sim-row` ile listeliyor, Modifier
kartları kendi metrik ağırlık barlarını (`pcard-arch-item`) gösteriyor. NBA Eras
tab da aynı şekilde sidebar'sız, her era kendi `aura-glass` panelinde. SideNav/
BottomNav'daki nav etiketi "Glossary"den "About"a çevrildi (route hâlâ `/glossary`
+ `extraActive:["/about"]`, ilk açılan sekme hâlâ Glossary — `FundamentalsHub`
`TABS[0]`). Hepsi lokalde tek tek doğrulandı (konsol hatası yok, gerçek veri
akışı test edildi).

**2026-07-30 devamı (aynı gün, ikinci yarı):** Lineups sayfasının üç kart tipi
(teorik, gerçek lineup'lar, custom builder) de aynı dile taşındı — `.lineup-card`
kabuğu: pozisyon başına arketip renginde organik `.aura-blob` glow (küre değil,
asimetrik border-radius + blur), köşede yüzen rank/fit rozeti, genişleyince
GERÇEK `PlayerCard` (yeni `compact` prop, `.pcard-stage.compact`), pillar
barları düz gradyandan `.pillar-bar-track/.pillar-bar-fill` (kart holo
dokusundan alınan çizgili doku) tasarımına geçti. Custom Builder'da Defense,
Rim Protection/Perimeter D olarak ikiye ayrıldı (frontend-only, `defense =
max(rim, perimeter)` ile eski skor/grade değişmiyor — backend `score_compat.py`
tarafı kullanıcı kendi yapacak, dokunulmadı). Explore'un scatter plot'una da
artık dokunuldu: arketip filtrelendiğinde kamera önce kümeye uçuyor sonra
sadece o arketip aynı eksen anlamıyla yeniden ölçekleniyor; küme üstü isim
etiketleri kaldırıldı; alt legend artık grafiği değiştirmeyen pasif bir
glossary. Affinity'nin matrix tablosu network graph'a dönüştürülmüştü, bugün
inceltildi: kenar rengi artık iki ucun arketip renginde SVG gradyanı (güç
sadece kalınlıkla), sabit üst glow kaldırılıp hover'da node'un kendi renginde
dinamik glow geldi, ağ büyütüldü (480×440→620×560), drill-down paneli gerçek
oyuncu+arketip çipleriyle zenginleşti (`_load_lineups_with_archs()` artık
`/api/affinity/lineups` VE `/api/real-lineups`'ta kullanılıyor). About sayfası
gerçek pcard kabuğuyla yeniden yapıldı: hero artık logo'yu "photo" olarak
kullanan gerçek bir trading card, Mission/Vision `.info-card` (edge-bevel),
"What We Do" `.era-card` kabuğuyla tek-sütun (5 öğede grid hizalama sorunu
yapısal olarak ortadan kalktı) + her kart kendi gerçek sayfasına giden CTA.
Ayrıca: native `<select>` dropdown'ların açık renk popup sorunu global
`color-scheme:dark` ile düzeltildi; `RoleImpactChart` artık `/api/role-stats`
500 dönerse sessizce boş render ediyor (önceden tüm sayfayı çökertiyordu —
backend'deki BPM_x/BPM_y kolon çakışması kök nedeni hâlâ duruyor, bu oturumun
kapsamı dışında).

**Kapsam dışı (bilinçli, kullanıcı ayrı konuşacak):** Game sayfaları (`GameModeSelect`,
`LineupGame`, `SameScreenGame`, `WithAFriendGame`) — bunlar için ayrı bir tasarım
oturumu yapılacak, bu playbook'un parçası değil.

Referans: `frontend/src/components/PlayerCard.jsx`, `PlayerCard.css`, `frontend/src/pages/Players.jsx`.
Canlı (eski) tasarım: primaryarch.net/players — düz yatay kart + yan panel (`SplitPane`+`DetailPanel`).

---

## 0. FAZ 2 — Komple Site Yenilemesi ("Aura Everywhere")

### Ne kalıyor, ne gidiyor
**Sabit kalır:** dodecagon logo mark (`BrandIcons.jsx` → `Logo`), 12 arketip hex paleti
(§1), `--font-logo: Rajdhani` / `--font-sans: Outfit`, temel koyu zemin tonları
(`--bg-base #0b0b0b` vb. — ton olarak kalır, ama artık DÜZ dolgu değil, aşağıdaki
glow/glass katmanlarıyla zenginleşir).

**Gider:** her yerdeki `border: 1px solid var(--border)` + `background: var(--bg-elevated)`
düz dikdörtgen kutu deseni (bugün SideNav, TopBar, filtre input'ları, Compare'in
`PlayerHeader`'ı, Glossary'nin liste satırları, Game mode kartları — hepsi bu "terminal"
kutucuk diline sahip). Sert dik köşeler, ince gri çizgiler, hover'da sadece renk değişimi
— hepsi kartın "aura" diline devrediyor.

### "Aura" — paylaşılan tasarım sistemi (yeni, global)
Kart'a özel `PlayerCard.css`'teki mekanikler artık TEK bir dosyada genelleştirilip
(`frontend/src/aura.css`, `index.css`'e import edilecek) her bileşenin kullanabileceği
utility class'lara dönüşecek — kartın kendi CSS'i bundan import edip üstüne kuracak,
mantık ikiye bölünmeyecek:

- `.aura-glow` — büyük, bulanık, yavaş-kayan radial-gradient blob (arka plan ambiyansı;
  sayfa arka planına veya panel arkasına konur, sayfanın/panelin `--accent`'ine göre renklenir).
- `.aura-glass` — `background: rgba(19,19,19,.62); backdrop-filter: blur(14px); border: 1px
  solid rgba(255,255,255,.07);` — düz `var(--bg-surface)` kutusunun yerini alır (TopBar,
  filtre drawer'ı, Glossary satırları, Compare header'ı, vb. hepsi buna geçer).
- `.aura-shine` — kartın `.pcard-rating::after` diagonal ışık geçişinin genellenmiş hali;
  herhangi bir buton/rozet/aktif-nav-ikonuna eklenebilir.
- `.aura-holo` — kartın `.pcard-holo` stripe dokusunun genellenmiş hali; büyük panellerde
  ÇOK daha düşük opaklıkla (0.04-0.06) kullanılacak, kartlardaki kadar belirgin değil.
  Küçük yüzeylerde boğucu olmaması için opaklık paneli büyüklüğüne göre ölçeklenir.
- `.aura-tilt` — mousemove ile hafif `rotateX/rotateY` (kart kadar agresif değil, ~4deg
  tavan) — sadece "hero" niteliğindeki büyük etkileşimli öğelerde (Game mode kartları gibi),
  her buton/link'te DEĞİL (performans + baş dönmesi riski).
- Köşe dili: sert `rounded` (4-6px) yerine büyük yuvarlak (14-18px) VEYA kartın kesik-köşe
  `clip-path`'i — hangi bileşenin "kart" hissi taşıması gerektiğine göre seçilir (ör. Game
  mode kartları kesik-köşe alsın, TopBar/SideNav sadece büyük yuvarlak köşe alsın).

### Bileşen bazlı dönüşüm hedefleri
| Bileşen | Bugünkü hal | Hedef |
|---|---|---|
| `TopBar` (`App.jsx`) | Düz `bg-darkBg` + `border-b border-gray-800`, logo+refresh+login düz buton | `.aura-glass` zemin, logo mark'ın arkasında sabit hafif `.aura-glow` (yamabuki), refresh/login butonları `.aura-shine` hover |
| `SideNav`/`BottomNav` | Dik ikon rayı, aktif öğede sert 2px sol çizgi | Aktif ikonun ARKASINDA yumuşak radial glow halo (o sayfanın kendi rengiyle — ör. NBA sayfasında iken yamabuki, G-League'de GLG kırmızısı), ikon hover'da hafif `.aura-tilt` |
| Filtre çubuğu + drawer | Faz 1'de zaten kısmen yenilendi (§ aşağı) | Drawer zemini `.aura-glass`'a geçsin, "Filters" butonu aktifken `.aura-shine` alsın |
| `GameModeSelect.jsx` mod kartları | Düz border + hover'da sadece border rengi değişimi | Tam kart dili: kesik köşe, `.aura-tilt`, mod ikonunun arkasında `.aura-glow`, kilitli (Coming Soon) modlar aura'sız/soluk kalarak canlı/kilitli ayrımı görsel olarak da güçlensin |
| `LineupGame`/`SameScreenGame`/`WithAFriendGame` draft ekranı | Yoğun tablo satırları (`PlayerRow`) — bilinçli olarak kart YAPILMAYACAK (§5) | Draft ızgarası/court alanı `.aura-glass` panel içine alınır, `PlayerRow` satırları sade kalır ama hover'da ince `.aura-shine` çizgisi alır |
| `Compare.jsx` `PlayerHeader` | Bespoke düz kutu | Kartın ön yüzü (zaten §5'te planlı) + `.aura-glass` istatistik tablosu |
| `Glossary.jsx` liste+detay | Düz `SplitPane` liste satırları | Liste satırları `.aura-glass`, seçili satırda arketip renginde `.aura-glow` halo, `CompDetail` başlığına arketip cutout illüstrasyonu (§4, item 5) |
| `Explore.jsx` scatter + `PlayerDetail` | Düz panel | Sadece `PlayerDetail` panelinin zemini `.aura-glass`'a geçer; scatter plot'un kendisi değişmez (veri görselleştirmesi, "artsy" hissin karışmaması gerekir) |
| `PlayerProfile.jsx` | Düz section'lar | Üstte büyük hero kart (kartın expanded hâli, §5'te zaten planlı) + alttaki section'lar `.aura-glass` |

### Sıra
1. `frontend/src/aura.css` oluştur — yukarıdaki 5 utility class, kartın mevcut
   mekaniklerinden (tilt matematiği, foil gradient, holo stripe deseni, shine keyframe)
   BİREBİR türetilerek, tekrar icat edilmeden.
2. `TopBar` + `SideNav` + `BottomNav` — global, her sayfayı etkiler, tek yerde değişir,
   en yüksek "bunu her sayfada göreceğim" etkisi. **İlk somut adım burası.**
3. Filtre drawer'larını (4 sayfa, zaten var) `.aura-glass`'a geçir — küçük, hızlı, mevcut
   yapıyı bozmaz.
4. `GameModeSelect.jsx` — kullanıcı "oyun sayfası" diye özellikle belirtti, ikinci öncelik.
5. Geri kalanlar (§4 sırasına göre) — Compare/Glossary/Explore/PlayerProfile.

Her adımdan sonra lokalde (`npm run dev`) gerçek tarayıcıda kontrol edilecek — bu belge
sadece plan, uygulama sırayla ve test edile edile ilerleyecek.

---

## 1. Tasarım Dili — Token'lar

### Renkler (12 çekirdek arketip — sabit, tüm sitede aynı hex'ler kullanılmalı)

```js
Engine:       "#fb923c"   Ecosystem:    "#4ade80"   Hub:          "#2dd4bf"
Connector:    "#c084fc"   Creator:      "#fb7185"   Anchor:       "#60a5fa"
Spacer:       "#22d3ee"   Finisher:     "#a3e635"   Force:        "#f87171"
Initiator:    "#FFB11B"   Stopper:      "#d1d5db"   "Rim Runner": "#34d399"
```
Kaynak: `PlayerCard.jsx` → `ARCH_COLOR`. Sitenin geri kalanında (Compare, Explore,
Affinity, Glossary) hâlâ eski Tailwind-class tabanlı `ARCH_COLOR` sürümleri
dolaşıyor olabilir (ör. `text-orange-400`) — bunları hex sürümüyle birleştirmek
gerekiyor, bkz. §5.

Marka/nötr tonlar mevcut `index.css` `:root`'tan aynen kullanılıyor, YENİ renk
icat edilmiyor: `--bg-base #0b0b0b`, `--bg-surface #131313`, `--bg-elevated #1a1a1a`,
`--border #262626`, `--accent #FFB11B` (global varsayılan — kart içinde per-player
override edilir), `--text-primary/muted/faint`.

### Tipografi
`--font-logo: "Rajdhani"` (başlık/rating/logo metni), `--font-sans: "Outfit"` (gövde).
İkisi de zaten `index.css`'te tanımlı, yeni font YOK.

### Kart anatomisi (PlayerCard.jsx + .css — değişmeyecek "kusursuz" temel)
1. `.pcard-stage` → `perspective` sarmalayıcı.
2. `.pcard` → 280px, `clip-path` köşe kesimi, `transform-style:preserve-3d`,
   mousemove'da `rotateX/rotateY` + `--mx/--my` (cursor-tracking tilt+foil).
3. Katmanlar (z-index 0, arka plandan öne): `.pcard-holo` (statik Prizm-stripe
   dokusu) → `.pcard-foil` (cursor'a tepki veren ışık + idle shimmer animasyonu)
   → `.pcard-grain` (ince doku) → `.pcard-sparkle` × 3 (twinkle glint).
4. `::before` pseudo → ince accent-renkli bevel çizgisi (kesik köşe hattı boyunca).
5. `.pcard-top` → rank + `.pcard-rating` (skew'lü rozet, shine-sweep animasyonlu).
6. `.pcard-photo` → **cutout PNG** (bkz. §2), `object-fit:contain`, `scale(1.2)`,
   `drop-shadow`, arkasında `.pcard-photo-glow` (accent renkli radial glow).
7. `.pcard-nameband` → hafif döndürülmüş, blur'lu isim şeridi.
8. `.pcard-stats` → PTS/REB/AST.
9. (`expandable` modunda) `.pcard-peek` → tıkla → `.pcard-expand-wrap`
   (`grid-template-rows: 0fr→1fr` trick) → `.pcard-tabbar` (Radar/Archs/Mods/
   Similar/Career) → `.pcard-tabcontent`.

**Değiştirilmeyecekler** (kullanıcı "kusursuz" dedi): tilt+foil mouse mekaniği,
clip-path köşe kesimi, name-band/stat-panel yerleşimi, expand grid-trick'i.

### Hareket kuralları
- Idle: `.pcard-foil` 7s'lik yavaş sweep, `.pcard-rating` 4.5s'lik shine geçişi,
  sparkle'lar 4-6s twinkle (hepsi `prefers-reduced-motion` ile kapanıyor).
  Hover/expanded'da idle foil sweep duruyor, cursor-tracking devralıyor.
- Expand/collapse: 0.45s `cubic-bezier(.2,.8,.3,1)` grid-row animasyonu.
- Tilt: mousemove'da anlık (`transition` yok, doğrudan `style.transform`),
  mouseleave'de 0.35s ease-out'a dönüş.

---

## 2. Asset Pipeline — Arketip Cutout Sanatı

12 arketip için `Silüetler.zip` içindeki tam-sahne illüstrasyonlar (siyah/koyu
fon + krem-beyaz mürekkep figür + arketip renginde glow) **çerçevesiz cutout**'a
çevrildi: `frontend/public/archetypes/{slug}.png` (transparan PNG).

**Yöntem** (ML/rembg YOK, saf luminance flood-fill — script:
`scratchpad/cutout.ps1`, .NET `System.Drawing` ile derlenen C# — tekrar
kullanılabilir, arşivlenmedi, gerekirse yeniden yazılmalı):
1. Kenarlardan (4 sınır) başlayarak, luminance eşiğinin ALTINDAKİ bağlantılı
   pikselleri flood-fill ile "arkaplan" işaretle (BFS, sadece 4-komşuluk).
2. Alfa kanalını buna göre uygula (arkaplan→0, figür→255), 3×3 box-blur ile
   kenarları yumuşat (anti-alias).
3. Küçük gürültü benekleri (orijinal illüstrasyonun tanecik dokusundan kalan
   izole "ada" pikseller) connected-component analiziyle temizlenir
   (`minComponent = w*h*0.00025` altındaki adacıklar silinir).
4. Alfa>10 olan piksellerin bounding-box'ına %4-5 padding ile kırp (bu hem
   "çerçevesiz" hem "biraz büyütülmüş" isteğini otomatik karşılıyor — sabit
   crop değil, her illüstrasyonun kendi kompozisyonuna göre).
5. maxDim=1000px'e resize, PNG olarak kaydet.

**Eşik (threshold) her görselde AYNI DEĞİL** — sanat stili değişkenlik
gösteriyor, sabit bir eşik kullanılamadı:

| Arketip     | Eşik | Not |
|---|---|---|
| Ecosystem, Engine, Force, Anchor, Creator, Hub, Spacer, Finisher | 42 | Düz krem-dolgu figür, koyu fon — standart durum |
| Connector | 14 | Orta tonlu mor glow fon, 42'de figürler yeniyordu |
| Stopper | 12 | İki figürden biri koyu gri (savunmacı) — yüksek eşik onu da siliyordu |
| Rim Runner | 10 | Saf siyah fon ama file/pota detayı ince çizgili |
| Initiator | 3 | Figürün KENDİSİ neredeyse siyah dolgu, sadece ince rim-light kenarlıklı — 5'te bile gövde parçalanıyordu |

**Yeni arketip/modifier illüstrasyonu eklenirse**: önce t=42 dene, figür
"parçalanmış/hayalet" görünüyorsa (Initiator/Rim Runner/Connector/Stopper gibi)
eşiği kademeli düşür (14→10→5→3), her adımda görsel kontrol et. Finisher'daki
yeşil "toz izi" gibi arkaplanın parçası olan hareket-efektleri SİLİNMEMELİ —
orijinali önce göz ile incele, "gürültü" ile "kasıtlı motion-trail" birbirine
karışabiliyor.

**"Geniş sahne" kompozisyonları — otomatik hero-tespiti BAŞARISIZ oldu, elle
kırpma gerekti.** Ecosystem/Hub/Anchor gibi bazı illüstrasyonlar tek kahraman
yerine "kahraman + 2-4 küçük arkaplan figürü" şeklinde kompoze edilmiş —
kartın küçük photo-zone'unda bu, kullanıcının tabiriyle "abuk subuk" (dağınık/
anlamsız) görünüyordu. İki otomatik yaklaşım denendi ve İKİSİ DE başarısız
oldu, bu yüzden TERK EDİLDİ:
  - En-büyük-bileşen (pixel alanına göre) → yanlış bileşeni seçti (zemin-glow
    elipsi figürden daha fazla piksel kaplıyor).
  - En-uzun-bileşen (bounding-box yüksekliğine göre) → figür bilekte/belde
    ince bir boşlukla ikiye bölündüğü için (üst gövde + bacaklar ayrı
    "bileşen" oldu), bazı görsellerde rastgele bir gürültü şeridi figürden
    daha "uzun" çıktı.
  Çözüm: bu 4 görsel (`ecosystem`, `hub`, `creator`, `anchor`) için GÖZLE
  incelenip elle yüzde-bazlı kırpma dikdörtgeni belirlendi (`manualcrop.ps1`
  — sabit L/T/R/B yüzdesi alıp kırpan basit bir yardımcı script, tekrar
  kullanılabilir). Diğer 8 görsel (Engine/Force/Finisher/Spacer/Initiator/
  Rim Runner/Connector/Stopper) TEK figür ya da anlamlı 2-figürlü bir aksiyon
  (savunmacı+topçu, pas veren+alan gibi) olduğu için dokunulmadı.
  **Sonuç**: cutout pipeline'ı tam otomatik DEĞİL — arkaplan silme (flood-fill)
  otomatik, ama "kompozisyonda gerçekten bir tek kahraman mı var" sorusu HÂLÂ
  insan gözü istiyor. Yeni bir illüstrasyon eklenirken bu adımı atlama.

**Kart tarafında kullanım**: `.pcard-photo-img` artık `object-fit:contain` +
`scale(1.2)` + `drop-shadow` — asla `cover` ile kırpılmıyor (cutout'un kendi
sınırı zaten figürün gerçek sınırı, kırpmak siluet keser). Yeni bir görsel
eklerken bu kuralı koru.

---

## 3. Component API — `PlayerCard`

```jsx
<PlayerCard
  player={playerRow}      // PLAYER_NAME, TEAM_ABBREVIATION, POSITION, primary_arch,
                           // overall_score/pct, PTS/REB/AST, GP, league?
  rank={number|null}
  season={string|undefined}   // sadece historical modda verilir (Players.jsx deseni)
  discover={bool}          // yamabuki vurgulu kenarlık (joker/öneri context'i)
  expandable={bool}        // false (varsayılan) = eski dış-onClick davranışı
                           // true = kart kendi expand+tab state'ini + veri
                           //        çekimini yönetir (Radar/Archs/Mods/
                           //        [Similar]/Career), onClick YOK SAYILIR
  onClick={fn}             // sadece expandable=false iken kullanılır
/>
```

`expandable=true` iken kart kendi başına şunları çağırır (lazy, ilk expand'de):
`api.playerScores`/`api.historicalPlayer`, `api.similarPlayers` (sadece
`isCurrent`, yani `season` prop'u boşsa), `api.playerCareer`. **Bu üçü
sadece NBA endpoint'leri** — G-League/NCAA/EuroLeague'de karşılığı yok
(bkz. §5, "Prospect" tab'i bunların yerini alacak).

`expandable=false` iken kart SADECE yeni görsel kabuğu render eder, tıklama
dışarıya (`onClick`) delege edilir — bu yüzden G-League/NCAA/EuroLeague/
PlayerProfile HİÇBİR KOD DEĞİŞİKLİĞİ OLMADAN yeni kart görünümünü otomatik
aldı (zaten aldılar, bkz. §5).

---

## 4. Sıradaki Adımlar — Öncelik Sırası

Kullanıcı onayı sonrası önerilen sıra (kolay→zor, yüksek-etki→düşük-etki):

1. **G-League / NCAA / EuroLeague** — kart görseli zaten otomatik geldi.
   Kalan iş: her sayfanın kendi ~230 satırlık `DetailPanel` kopyasını
   (Prospect/Radar/Scores tab'leri) `expandable` kart deseniyle değiştirmek.
   Üç sayfa neredeyse birebir aynı panели tekrar ediyor — TEK bir paylaşılan
   `expandable`+"Prospect" tab varyantı yazıp üçüne de vermek en verimlisi
   (bkz. §5 "Prospect tab" notu).
2. **PlayerProfile.jsx** — zaten ölü `PlayerCard` import'u var ("Similar
   Players" bölümü kendi bespoke satır listesini kullanıyor, `PlayerCard`'ı
   hiç render etmiyor). Similar listesini gerçek `<PlayerCard expandable={false}>`
   grid'ine çevirmek + sayfa üstündeki hero alanına büyük/expanded-varsayılan
   bir kart koymak düşük riskli, yüksek görsel etkili bir adım.
3. **Compare.jsx** — `PlayerHeader` (bespoke mini kart) → kartın ön-yüzü
   (tilt+foil+photo, TABsız) — yan yana A/B. Grid değil, `expandable`
   uygulanmaz.
4. **Affinity.jsx** — "Duos" tab'indeki oyuncu satırları → kompakt kart
   yüzü. Matrix/Best Pairs/DrillPanel bespoke kalır (kart mantığı yok).
5. **Glossary.jsx** — 12 arketip illüstrasyonu artık var; `CompDetail`
   panelinin başlığına ilgili cutout PNG'i küçük ikon/illüstrasyon olarak
   koymak ucuz ama etkili bir tutarlılık adımı.
6. **Explore.jsx** — sadece kozmetik: `PlayerDetail` panelini yeni renk/
   tipografi diline getir, kart YOK (scatter plot kart'a dönüşmeyecek).
7. **Game sayfaları** (`LineupGame`/`SameScreenGame`/`WithAFriendGame`) —
   draft listesi (`game/PlayerRow.jsx`) YOĞUN/yoğun bir tablo satırı, tam
   Panini kart orada YAVAŞ ve BÜYÜK kalır — **draft listesine kart
   TAŞINMAYACAK**. Tek fırsat: draft sonrası özet/skor ekranı
   (`ScoreReveal`) — orada kartın ön-yüzünü (TABsız) göstermek doğal
   oturur.

---

## 5. Sayfa Bazlı Notlar (kod-hazırlama şablonu)

### G-League / NCAA / EuroLeague — ortak "Prospect" tab
Bu üç lig `active_modifiers` YOK (bkz. proje CLAUDE.md), bu yüzden `Mods`
tab'i onlarda anlamsız — `expandable` kartın tab listesi lig başına
parametrik olmalı:
```
NBA:              Radar, Archs, Mods, Similar, Career
G-League/NCAA/EUR: Radar, Archs, Prospect   (Similar/Career/Mods yok)
```
`Prospect` içeriği: `detail.prospect.{grade,tier,floor,ceiling,strengths,
weaknesses,comparables}` — bugünkü üç sayfanın bespoke Prospect tab'lerinden
aynen taşınabilir, sadece kart'ın `.pcard-tabcontent` diline (bar/chip
stilleri) uyarlanır. NCAA'nın SOS notu, EuroLeague'in U21 etiketi tab
içeriğine küçük bir alt-satır olarak eklenir.

Bu üçünü TEK bir mekanizmayla çözmek için `PlayerCard`'a `tabs` prop'u
(override) eklemek makul: `expandable` + `tabs={["radar","scores","prospect"]}`
gibi — şu an `expandable=true` sabit NBA tab setini varsayıyor, bu genişleme
§4 adım 1'in ön-koşulu.

### PlayerProfile.jsx
```jsx
// "Similar Players" bölümü — mevcut bespoke satır yerine:
<div className="grid gap-5" style={{gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))"}}>
  {similar.map(p => <PlayerCard key={p.name} player={toCardShape(p)} />)}
</div>
```
`toCardShape` küçük bir adapter gerektirir çünkü `similarPlayers` yanıtı
(`name/team/position/primary_arch/similarity`) `PLAYER_NAME/TEAM_ABBREVIATION/
POSITION` alan adlarıyla birebir eşleşmiyor.

### Compare.jsx
`PlayerHeader` bileşenini `<PlayerCard player={...} />` ile değiştir
(`expandable` verilmeden — sadece ön yüz). İki kart yan yana, ortada VS
rozeti; `RadarProfile` (recharts) ve `StatCell` tablosu ALTTA aynen kalır
(kartın kendi mini-radar'ı YOK burada, çünkü Compare zaten kendi büyük
recharts radar'ını iki oyuncu üstüste bindirerek gösteriyor — kartın
`expandable` tab'lerini burada AÇMAYA gerek yok).

---

## 6. Açık Kararlar (kullanıcıdan onay bekliyor)

- G-League/NCAA/EuroLeague'in 3 ayrı `DetailPanel`'ini tek ortak bileşene
  indirmek mi, yoksa her sayfanın kendi `expandable` entegrasyonunu ayrı
  ayrı mı yazalım? (Ortak bileşen önerilir — 3× kod tekrarını önler.)
- Game sayfalarındaki `ScoreReveal`/özet ekranına kart eklensin mi, yoksa
  bu faz sadece "veri sayfaları" ile mi sınırlı kalsın?
- Cutout asset'lerin orijinal yüksek-çözünürlüklü kaynakları
  (`Silüetler.zip`, ~27MB) repo'ya commitlenmeyecek — sadece işlenmiş
  `frontend/public/archetypes/*.png` (toplam ~5MB) commitleniyor. Onay?
