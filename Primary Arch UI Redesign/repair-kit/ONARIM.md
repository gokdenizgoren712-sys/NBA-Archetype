# RankIt Redesign — Onarım Planı ve İlerleme Kaydı

Bu dosya, `BUILD.md` tek doğruluk kaynağı kabul edilerek yürütülen yeniden tasarım onarımının çalışma kaydıdır. Mobil/genel görsel tahta `RankIt Redesign.dc.html`, web görsel tahta `RankIt Web.dc.html` referans olarak kullanılır; kaynaklar çelişirse `BUILD.md` kazanır.

## Kaynak paketi

- `BUILD.md` — ürün dili, mobil/web sözleşmeleri ve 19 fazın tek doğruluk kaynağı.
- `RankIt Redesign.dc.html` — ekran tahtaları ve kalıcı ekran kodlarının görsel referansı.
- `RankIt Web.dc.html` — web ekranlarının görsel referansı (29 kod; ör. `7a`, `15x`, `15y`, `15z`, `16c`). Repo kökündeki `Primary Arch UI Redesign/RankIt Web.dc.html` ile içerikçe özdeştir; 2026-09-21 öncesi kısa kopya `source-history` altında saklanır.
- `support.js` — iki `.dc.html` tahtasının aynı klasörden açılabilmesi için gereken mevcut canvas desteğinin kopyası.
- `ONARIM.md` — bağımlılık sırası, kapılar, doğrulama yöntemi ve ilerleme kaydı.

## Değişmez çalışma kuralları

1. Dosya sırasıyla değil, bağımlılık sırasıyla ilerle.
2. Bir kabul kapısı ölçülerek geçilmeden aşağı akış ekranına geçme.
3. Kaynak yorumundaki “düzeltildi” ifadesini kanıt sayma; çalışan çıktıyı ölç.
4. Kullanıcının mevcut çalışmalarını ve kirli worktree değişikliklerini koru.
5. Kozmetik token, tipografi ve spacing temizliğini yapısal işlerden sonra yap.
6. Her aşamada bu dosyadaki durum, değişen dosyalar, doğrulama ve kalan riskler güncellenir.

## Başlangıç envanteri

`BUILD.md` Bölüm IV toplam 68 ekran koduna atıf yapıyor.

- Var: 17
- Yanlış veya kısmi: 34
- Yok: 17

### Var

`5a`, `5b`, `5c`, `4a`, `3j`, `2p`, `9b`, `2i`, `3c`, `3e`, `3g`, `3h`, `3i`, `4g`, `4h`, `3k`, `3l`

### Yanlış veya kısmi

`2a`, `2e`, `2c`, `6a`, `2f`, `2g`, `15a`, `15d`, `2h`, `15b`, `6d`, `6b`, `9a`, `3d`, `13a`, `7a`, `16c`, `15w`, `7b`, `15x`, `7c`, `16a`, `7d`, `16b`, `11a`, `15z`, `8a`, `8b`, `8c`, `11d`, `11c`, `12a`, `12b`, `8d`

### Yok

`15c`, `2m`, `2n`, `2j`, `2k`, `2l`, `2r`, `7e`, `15y`, `7f`, `7g`, `7h`, `10a`, `12c`, `14a`, `14b`, `11b`

## Bağımlılık sırası

### 1. Ölçüm düzeneği

- Yedi `MatchCard` preset’ini izolasyonda göster.
- Uzun kulüp adı, üç haneli basketbol skoru, Classic, spoiler, upcoming, live ve POTM durumlarını ekle.
- Wrapper, art alanı ve elmas footprint ölçümlerini DOM üzerinden doğrula.
- 390, 820, 1080 ve 1440px görünüm kontrollerini kaydet.

### 2. `MatchCard` çekirdeği

- Tek ortak component API’si.
- Doğru chamfer ve Classic hairline.
- Border-box dahil `crest × 1.414` footprint.
- Boolean ve number coercion.
- Yedi kesin preset.
- Compact overlap geometrisi.
- Spoiler ve 20-rating görünürlük kuralları.
- Ayrı web kartının daha sonraki migrasyonu için uyumlu contract.

**Kabul kapısı:** Yedi preset kırpılmadan ve taşmadan render olur; compact modda iki crest etiketi okunur; ölçülen footprint BUILD formülüyle uyuşur.

### 3. Grid ve taşma geçişi

- Bütün çıplak `1fr` değerlerini `minmax(0, 1fr)` haline getir.
- Her kart wrapperına ve nowrap satırına `min-width: 0` uygula.
- Web wall tabanını bütün gridlerde 320px yap.
- Uzun kulüp adıyla gerçek render ve overflow ölçümü yap.

### 4. Ortak görünürlük politikaları

- 20-rating heat eşiği.
- Spoiler shield: skor, heat, review ve Classic.
- Rated/unrated ayrımı.
- Expected heat / community heat ayrımı.
- Tek tarih/saat formatlayıcısı.
- Heat rengi yanında görünür sayı zorunluluğu.

### 5. Koleksiyon anı `6a`

- Tam ekran sonuç.
- Doğru kart preset’i.
- Tek satırlık statement, üç delta, Share / Skin / Edit.
- Offline/queued ve edit sonucu.
- Dört rating yolunun aynı sonuca inmesi.

### 6. Rating ve entry durum modeli

- Scheduled no-XI, XI announced, live, full-time unrated, full-time rated.
- Dirty, saving, saved, queued ve error.
- POTM, Respect, Classic, tags, review ve spoiler state’i.

### 7. Alt akış bileşenleri

- `15b` tek player picker.
- `15c` mobil review composer.
- Ortak mobil/web state ve API katmanı.

### 8. Match sheet’in beş yaşam evresi

- `2h` scheduled ve XI-announced varyantı.
- `15d` live.
- `15a` full-time unrated.
- `2f` rated Match.
- `2g` rated Community.

### 9. Companion lifecycle

- `5a`, `5b`, `6d`.
- Match ve Companion veri sorumluluklarını ayır.
- Maç sonrası chat’i kapat ve pulse’ı gecenin kaydına dönüştür.

### 10. Mobil kart yüzeyleri

- `2a`, `2e`, `2c`, `3j`.
- Tüm rating girişlerini `6a`ya bağla.

### 11. Reviews ve sosyal çekirdek

- `15c`, `5c`, `4a`, `6b`, `2p`, `9a`, `9b`, `3i`.
- Follower sayılarını kaldır; agreement ve relationship state’ini ortaklaştır.

### 12. Kalan mobil yüzeyler

- Competition, Hunt, Search, Notifications, Settings, Lists.
- Skins/share.
- Üç adımlı first run.

### 13. States ve accessibility

- Loading, empty, offline, error.
- Dialog focus trap/restore, Escape/back.
- 44px hedefler, ink focus ring ve reduced motion.

### 14. Marka ve launcher

- RankIt mask mark ve wordmark.
- Primary Arch rule inset ve küçük varyant.
- Android adaptive launcher.

### 15. Web foundation

- `7a`, 78px header, dört ana navigasyon, gerçek search field.
- Üç bölümlü rail, 320px wall ve ortak `MatchCard`.
- Görsel kabul: `RankIt Web.dc.html#7a`; davranış ve ölçü için `BUILD.md` §§17–18.

### 16. Web Inspector ve rating akışı

- Maç/Community/Companion evreleri: `16c`, `15w`, `7b`, `15x`, `7c`, `16a`, `7d`, `16b`.
- Sonuç/etkileşim yüzeyleri: `7e`, `11a`, `15y`, `15z`.
- Her ekranın görsel karşılığı `RankIt Web.dc.html` içindeki aynı `id` ile açılır; §9 ve §19–20 davranış sözleşmesi `BUILD.md`'den gelir.

### 17. Masaüstüne özel ve kalan web ekranları

- Masaüstüne özel: `7f`, `7g`, `7h`.
- Kalan web yüzeyleri: `8a`, `8b`, `10a`, `8c`, `11d`, `11c`, `12a`, `12b`, `12c`, `14a`, `14b`, `11b`, `8d`.
- Böylece güncel web HTML'indeki 29 ekran kodunun tamamı bu sıraya bağlanır; henüz kodlanmamış bir ekran “var” kabul edilmez.

### 18. Responsive

- 1080px icon rail.
- 820px app davranışı ve full-width bottom sheet.

### 19. Kozmetik normalizasyon

- Token dışı renkler, font fallbackleri, gold budget, tipografi, spacing, border/radius ve gölgeler.

### 20. Kapanış doğrulaması

- 68 ekran kodunun yeniden envanteri.
- Dört rating yolu ve `6a` lifecycle testi.
- Beş maç evresinin mobil/web testi.
- Uzun isim/grid ve elmas footprint ölçümü.
- 20-rating eşiği.
- `BUILD.md` §26: yalnız başarısız maddeleri raporla.

## İlerleme kaydı

### 2026-09-20 — Başlangıç

- [x] `BUILD.md` tamamen okundu.
- [x] 68 ekran kodu çıkarıldı ve var/yanlış/yok olarak sınıflandırıldı.
- [x] Kod grafiğinde üç ayrı kart uygulaması doğrulandı: eski mobil, redesign ve web.
- [x] Kaynak paketi için bu kayıt oluşturuldu.
- [x] Aşama 1: yedi preset’li ölçüm düzeneği kodlandı.
- [x] Aşama 2: `MatchCard` kabul kapısı.
- [x] Aşama 3: grid ve taşma geçişi.
- [x] Aşama 4: ortak görünürlük politikaları. *(görsel kabul 2026-09-23, iki yüzey; bir ayrışma bulundu ve düzeltildi)*
- [x] Aşama 5: koleksiyon anı `6a`. *(2026-09-23: kart numarası, koleksiyon deltası ve altın bütçesi bağlandı)*
- [x] Aşama 6: rating ve entry durum modeli. *(2026-09-23: atıl olması gereken birincil eylem ve `Rate this match` etiketi düzeltildi; beş evre ölçüldü)*
- [x] Aşama 7: alt akış bileşenleri. *(2026-09-23: `15b` tahtayla birebir çıktı; `15c` review composer ekranı kuruldu)*
- [x] Aşama 8: match sheet'in beş yaşam evresi. *(2026-09-23: canlı kadroda ham sağlayıcı kodu sızıntısı düzeltildi; mekân ve `15a` etiketi karar olarak kaydedildi)*
- [x] Aşama 9: Companion lifecycle. *(2026-09-23: `6d` kapanış cümlesi tahtanınkiyle değiştirildi; üç evre tahtaya karşı doğrulandı)*
- [x] Aşama 10: mobil kart yüzeyleri. *(2026-09-23: `2c` Hunt özeti kuruldu + eşzamanlı `/collections` 500'ü düzeltildi; `2a` başlık ve `2e` günlük tahtaya hizalandı)*
- [x] Aşama 11: reviews ve sosyal çekirdek. *(2026-09-23: §13.2 follower sayıları kaldırıldı, `CLOSEST TASTE` eklendi, 401 artık boş Retry sözü vermiyor)*

#### Aşama 1 değişiklikleri

- `MATCH_CARD_PRESETS`, BUILD §2.5’teki yedi kesin ölçünün tek kaynağı olarak eklendi.
- Preset tablosu Fast Refresh sınırını korumak için saf `matchCardPresets.js` veri modülünde tutuluyor.
- İzolasyon önizlemesi eski altı HANDOFF preset’inden yedi BUILD preset’ine geçirildi.
- Uzun kulüp adı, üç haneli basketbol skoru ve durum varyantları ölçüm sayfasına eklendi.
- Elmasın gerçek border-box footprint’ini ölçebilmek için DOM ölçüm işaretleri eklendi.
- QA tezgâhı, uygulama kabuğunun `overflow-hidden` ana alanında alt örnekleri kırpmaması için kendi dikey kaydırma alanına alındı.

#### Aşama 2 kabul ölçümü

- Yedi wrapper ve kart genişliği tam eşleşti: `334`, `291`, `305`, `281`, `440`, `174`, `167` px.
- Aynı ölçüm 390, 820, 1080 ve 1440px viewport’larda tekrarlandı; kartların hiçbirinde iç yatay taşma oluşmadı.
- 26 elmas örneğinde dönmüş border-box genişliği `crest × √2` ile eşleşti; en büyük fark `0.00px`, footprint yuvarlamasında en büyük fark `0.01px` oldu.
- Tüm elmaslarda hesaplanan `box-sizing` değeri `border-box`; `html` ve `body` global değeri de `border-box`.
- Normal ve Classic kartın dört kenarında ölçülen border genişliği `0px`. Classic’te altına dönen iki öğe yalnızca `31.1 × 1px` çentik saç çizgileri; kart çerçevesi altına dönmüyor.
- `Borussia Mönchengladbach` / `Wolverhampton Wanderers` ve `118 / 115` kompakt basketbol örneklerinde kart içi taşma yok; iki crest etiketi görünür.
- Hedefli ESLint temiz, Vite production build başarılı.

#### Aşama 3 ilerlemesi

- Mobil redesign Discover ve Diary gridlerinin mevcut `minmax(0, 1fr)` + `.ri-card-slot { min-width: 0 }` koruması kaynakta doğrulandı.
- Web kabuğu, ana içerik, sonuç ve oyuncu satırı gridlerindeki çıplak `1fr` rayları `minmax(0, 1fr)` biçimine geçirildi.
- Web match wall tabanı BUILD §18’deki `320px` değerine yükseltildi ve her doğrudan kart wrapperına `min-width: 0` verildi.
- Gerçek yerel API verisiyle Discover wall 390 / 820 / 1080 / 1440px genişliklerde ölçüldü: sırasıyla 1 / 2 / 2 / 3 kolon, kart ve belge yatay taşması `false`.
- Eski feature-flag yolu ve ikincil RankIt stylesheet’lerindeki çıplak `1fr` rayları da aynı mekanik geçişte `minmax(0, 1fr)` biçimine alındı. `frontend/src/rankit/**/*.css` kaynak taramasında çıplak `1fr` kalmadı; içerik minimumu gerektiren `minmax(118px, 1fr)` gibi tanımlar korunuyor.
- Mobil kart kökü, Diary sarmalayıcıları ve nowrap satırları için `min-width: 0` / ellipsis korumaları eklendi.
- Çalışan uygulamada 390px mobil Home, Discover ve Diary; web Discover ise 390 / 820 / 1080 / 1440px genişliklerde ölçüldü. Kart/grid ve belge yatay taşması yok. Hero carousel ve yatay liste, tasarlanmış kaydırma alanları olarak ayrı değerlendirildi.
- Hedefli ESLint, Vite production build ve ilgili CSS dosyalarında `git diff --check` başarılı.

#### Aşama 4 ilerlemesi

- `BUILD.md` §5.5’teki en az 20 gerçek oy kuralı `redesign/heat.js` içinde ortaklaştırıldı. Eksik/geçersiz oy sayısı yeterli veri olarak kabul edilmiyor; kişisel yıldız/Diary puanı bu topluluk eşiğine tabi değil.
- Ortak `MatchCard` adaptörü, eski mobil kart, web kartı, turnuva fikstürü, arama ve liste satırları eşik kapısına bağlandı. 20’nin altında renkli topluluk puanı gösterilmiyor; uygun yüzeylerde boş heat ve `TOO FEW RATINGS` etiketi var. Arama/liste ısı göstergelerinin yanına görünür sayı kondu.
- Web ve eski mobil kartta spoiler açıkken Instant Classic damgası ve topluluk puanı bastırılıyor; liste rafında skor ve topluluk ısısı da aynı kural ile gizleniyor. Skor gizleme tercihi ortak `hidesScore` kuralını kullanıyor.
- 19/20 sınırı ile eksik sayacın davranışı Node testlerinde geçti. İzole MatchCard önizlemesindeki 19 oylu varyant 390px’te ölçüldü: `4.6` görünmüyor, `TOO FEW RATINGS` görünüyor, kart ve belge taşmıyor. Yerel API’den gelen gerçek Discover kartlarında da 390px’te etiket kırpılmıyor (etiket sağ kenarı `176.5px`, kart sağ kenarı `190.5px`), kart/belge taşması yok. Tarayıcı konsolunda hata yok; Vite build ve yeni/dokunulan redesign dosyalarında hedefli ESLint temiz.
- `BUILD.md` §3.1 için `hasOwnRating` / `hasCommunityVerdict` / `communityVerdictCovered` ortak politikası eklendi. `my_watched_date` tek başına oy sayılmıyor; puan yoksa ısı/Classic/POTM/dominant tag/review örtülüyor, `REVEAL ANYWAY` kullanıcının açık seçimiyle açıyor. Hiç topluluk verisi yoksa kapı da çıkmıyor. Skor spoiler’ı ayrı ve öncelikli kalıyor.
- Yeni MatchCard’ın geniş/kompakt halleri, eski mobil ve web kartları, mobil/web maç detaylarının topluluk bölümleri, arama/lig fikstürü/liste satırları ve mobil Home/Activity review önizlemeleri aynı kapıya bağlandı. Eski kart yolu özellik bayrağı kapalıyken de korunuyor. Ayrı `CommunityVerdictGate` detay yüzeylerinde ortak metni/eylemi taşıyor.
- Node testleri 19/20, sıfır topluluk, izleme-vs-puanlama ve açık reveal sınırlarında geçti. 390px izole önizlemede unrated hero/compact kartlarda sayı ve Classic görünmüyor; reveal sonrası görünüyor; kompakt 167px kartın kapısı sağ kenarı aşmıyor, belge yatay taşmıyor. Gerçek API’nin sıfır oylu Discover kartları gereksiz kapı ile dolmuyor.
- `hideUntilRated` istisnası daha önce `my_watched_date` alanını da “puanlandı” sayıyordu. Ortak `hasOwnRating` kuralına geçirildi: yalnızca kaydedilmiş gerçek puan istisna; izleme kaydı veya sıfır puan spoiler’ı açmıyor. İlgili state testleri geçti; hedefli lint, üretim derlemesi ve `git diff --check` temiz (Git’in CRLF uyarıları yalnızca satır sonu bildirimi).
- Üye profilinin `RECENT SHELF` kartında başka üyenin yıldız/Classic bilgisi kartın alt satırından sızıyordu. `their_rating` da kapının veri sinyali sayıldı; kendi puanın yokken yıldız satırı ve damga saklanıyor, açık reveal eylemi kartı yanlışlıkla açmıyor.
- Web Inspector’ın skor spoiler tercihi ve tek dokunuşla reveal akışı canlı webde doğrulandı. Hide scores anahtarı Home, Discover, Search, Activity, Profile ve Inspector’da aynı üst durumdan besleniyor; Profile ayarından değişiklik kartlara yansıyor. Gizli web/eski mobil kart skoru artık erişilebilir metinde gerçek sonucu taşımıyor.
- Web Home/Activity yorum önizlemesi, kişisel puan yokken yıldızı ve metni saklıyor; `REVEAL ANYWAY` yalnız seçilen yorumu açıyor. Mobil bildirim yüzeyindeki puanlanmamış “running hot” sayı/etiketi ve Classic sonuç iması kaldırıldı. Bunlar çalışan yerel web akışıyla doğrulandı; bildirim içerik testi ve diğer review alt yüzeyleri ayrıca izlenecek.
- Mobil ve web maç tarihi/saati ortak `formatWhen.js` formatlayıcısından geliyor. Eski mobil başlık/ayar spoiler tercihi `rankit:prefs` üzerinde birleşti; eski tekil `rankit:hide-scores` anahtarı yalnız geçiş okumasında kullanılıyor.
- Bu geçişte görünürlük taraması genişletildi: mobil Diary timeline ve eski kart yolu, redesign Diary kartı, Profile 6b rafı, List Shelf 3h, Competition Matches 3c, Search 3e ve Rank sheet sonuçları artık aynı `hidesScore` sözleşmesini kullanıyor. Puanlanmamış ama izlenmiş Diary kaydı sonucu açmıyor; yalnız gerçek kişisel rating açıyor.
- Search ve List Shelf içinde skor gizliyken tek dokunuşlu `TAP TO REVEAL` var; bu dokunuş topluluk hükmünü otomatik açmıyor. Skor açıldıktan sonra rating yoksa §3.1 cümlesi ve ayrı `REVEAL ANYWAY` kararı korunuyor. Competition Matches canlı maçta topluluk hükmü/`TOO FEW RATINGS` üretmiyor; yalnız bitmiş maç için değerlendiriyor.
- Üye profilinin `RECENT SHELF` kartı da cihazın skor tercihini alıyor; böylece başkasının kartındaki sonuç/Classic sinyali spoiler kuralını delmeden saklanıyor. Bu davranışı sağlayan 3i çağrısı Profile kökünden açıkça besleniyor.
- Web quick-rate `Rank` sheet’i de ortak `hidesScore` politikasına bağlandı; puanlanmamış bitmiş maç seçicisinde skor artık spoiler tercihi açıkken gösterilmiyor. Bu, kartların dışında kalan doğrudan puanlama girişindeki son belirgin skor sızıntısını kapattı.
- Yerel doğrulama bu geçişte 22/22 Node testi, hedefli ESLint ve `git diff --check` ile geçti; 390px çalışan Home akışında Hide scores sonrası bitmiş maçlar `PLAYED` + `—`, topluluk yorum önizlemeleri `CONTAINS SPOILERS · TAP TO SHOW` olarak gözlendi. Vite üretim derlemesi de başarılı.
- Kullanıcının 2026-09-21 tarihli güncel web tahtası pakete eklendi. Web değişiklikleri bundan sonra önce ilgili ekran kodu (`7a`, `15x`, `14b` vb.), sonra `BUILD.md` sözleşmesi ile karşılaştırılacak. Önceki 12 KB web dosyası silinmedi; `source-history` altında saklandı.
- `RankIt Web.dc.html` içindeki 29 kod ONARIM aşama 15–17'ye tek tek bağlandı. `15x` görselinde oy verilmemiş Community kapısı, `16c` görselinde planlanan maç evresi doğrulandı; mevcut uygulamanın bu ekranları geometrik olarak tamamladığı iddia edilmiyor. Şimdilik `expected_heat` olmayan fikstüre topluluk ısısı gösterilmiyor; ileride veri alanı geldiğinde `2h`/`16c` sözleşmesiyle ele alınacak.
- Son doğrulama: 22/22 Node testi, Vite üretim derlemesi ve yeni/dokunulan redesign-politika dosyalarında hedefli ESLint geçti; web kart/Inspector/Home/Profile akışında gizle→aç, yorum reveal ve ayar senkronu canlı yerel tarayıcıda kontrol edildi, mobil Home’da `PLAYED` ve `—` çıktısı ayrıca görüldü, konsolda hata yok. `RankItWeb.jsx` dosyasının genel ESLint taramasında bu geçişten önce var olan 8 bulgu (1 kullanılmayan import, 7 effect-içi senkron state güncellemesi) hâlâ açık; bunlar hedefli onarım veya ilerideki web foundation geçişinde ayrı ele alınacak.
- Aşama 4 **henüz kapanmadı**: planned/expected heat ayrı veri türü olarak `2h`/`16c` ekranlarıyla birlikte değerlendirilmeli; mevcut API’de `expected_heat` alanı yok, sayı uydurulmayacak. Tüm review/notification alt yüzeyleri ve web HTML kodlarının tam kabul taraması kalan işler. Eski `RankItPrototype.jsx` ve `web/cards.jsx` dosyalarında bu geçişten önce var olan React Hooks / Fast Refresh lint bulguları mevcut; hedefli doğrulama sonuçları ayrıca kaydedilecek.

- `2h`/`16c` için frontend planned-heat katmanı hazırlandı: `heat.js` geçerli `expected_heat` ve ayrı `expected_rating_count`/want/watchlist sayacı geldiğinde bunları topluluk ısısından ayırıyor; `ExpectedHeat` mobil Match sheet ve web Inspector’da yalnızca bu alan gerçekten varsa çiziliyor. `MatchCard` da `expectedHeat` prop’unu aldı; genel scheduled kartlarda API alanı yoksa hiçbir heat üretmiyor. `community_rating` veya `rating_count` planned heat yerine kullanılmıyor.
- Bu geçişte backend’e sayı eklenmedi. Mevcut API `expected_heat` göndermediği için yerel ekranda panelin görünmemesi beklenen ve doğru davranış; backend hattının veri kaynağı, hesaplama zamanı, null davranışı ve sayaç adını kesinleştirmesi gerekiyor. `BUILD.md` §1.3 gereği sayı ısı çubuklarının yanında kalıyor.
- Doğrulama: expected/community ayrımı, eksik sayaç ve 0–5 dışı değerler için 23/23 Node testi; hedefli heat/ExpectedHeat/MatchCard adaptör ESLint temiz; Vite production build başarılı.

## Aktif aşama

**Aşama 12: kalan mobil yüzeyler** — The Hunt (`2m`/`2n`) **tamam**; kalan: Competition (`2i`/`3c`/`3d`), Search (`3e`), Notifications (`13a`/`3f`), Settings (`3g`), Lists (`3h`), skins/share (`2j`/`4d`/`2k`/`2l`), first run (`4g`/`4h`/`2r`). (Aşama 4–11 kapandı. Açık: `2a` kişi şeridi ve `9a`/`9b` dolu hâlinin görsel kabulü — ikisi de oturum/ürün kararı bekliyor; web composer `15z` Aşama 16'da.)

> **İki numaralandırma karıştırılmasın — 2026-09-23'te bir kez karıştırıldı.**
> Bu dosyadaki **"Aşama N"** yukarıdaki *Bağımlılık sırası* listesine aittir
> (5 = koleksiyon anı `6a`, 8 = match sheet'in beş evresi, 9 = Companion).
> `BUILD.md` **Part IV**'ün kendi **"Phase N"** listesi ayrıdır ve aynı sayılar
> başka işi gösterir (Phase 4 = collectible, Phase 5 = match sheet,
> Phase 6 = Companion). İlerleme kaydındaki eski "Aşama 5 `2f`", "Aşama 6
> Companion" başlıkları **BUILD Phase** numarasıyla yazılmıştır; ONARIM
> sırasında bunlar 8 ve 9'a denk gelir. Bundan sonra bu dosyada yalnız
> ONARIM numarası kullanılacak, BUILD'e atıf "BUILD Phase N" diye yazılacak.

`BUILD.md` §3 ve §5.5 uyarınca spoiler, unrated/rated ayrımı ve 20-rating eşiği tek görünürlük politikası üzerinden bağlanacak. Sonraki geçişte expected heat ile topluluk heat’i ve tarih/saat sunumu ayrıştırılacak.

#### Backend pass — Aşama 4 / 2026-09-21

- **BUILD maddesi ve ekran kodu:** §3 / §3.1 (spoiler; puanlamadan önce topluluk hükmü), §5.5 (20 puan), §12.1 (seriyi yalnız gecesinde puanlama uzatır), §15 (hiçbir bildirim puanlanmamış maçı bozmaz). Ekranlar: `2a` (akış), `2g`/`5c` (review sayısı), `3f`/`13a` (bildirimler), `3i` (üye kayıtları), `6a` (puan deltası), `2h`/`16c` (expected heat).
- **İncelenen endpoint / tablo:** `_match_dict` (tüm maç kartları: `/home`, `/catalog`, `/matches/{id}`, `/search`, `/competitions/*`, `/lists/{id}`, üye rafı), `GET /home` `activity`, `GET /members/{id}` `entries`, `GET /matches/{id}/reviews`, `POST /diary`, `GET /notifications` (`_hot_match`, `_closing_list`, `_stored`), `rankit_rank.streak_for` / `award_for_rating`. Tablolar: `rankit_diary_entries`, `rankit_notifications`, `rankit_points`.
- **Bulgu:**
  1. `community_rating` 20 puanın altında da (tek puanla bile) yanıttaydı; yalnız arayüz gizliyordu.
  2. `review_count` gizli/takipçi incelemelerini de sayıyordu; bağlandığı `5c` listesi yalnız herkese açıkları gösteriyor. "N reviews ›" linkin açmadığı bir sayı vaat ediyordu.
  3. `/home` `activity` ve `/members/{id}` `entries` inceleme metnini `spoiler` bayrağı olmadan taşıyordu. Yazarın spoiler işaretlediği metin, puanlamamış izleyicide `REVEAL ANYWAY` sonrası görünüyordu.
  4. Yıldızsız izleme kaydı (`rating` NULL) "gecesinde puanladı" ödülü alıyor (15/5 puan) ve seriyi uzatıyordu (`streak_for` her kaydı sayıyordu).
  5. Classic bildirimi maçı defterine almış herkese gidiyordu — yalnız izleyip puanlamayanlar dahil. Damga kendisi bir hüküm (§3).
  6. "Running hot" durumu tek puanla sıcak sayılıyordu (20 eşiği yok) ve payload puanlanmamış maçın topluluk puanını (`rating: 4.6`) taşıyordu.
  - Kontrol edilip sorun bulunmayanlar: respect / reply / follow / list_respect olayları skor, puan veya hüküm taşımıyor; broadcast yalnız `ülke · yayıncı`; collection yalnız ilerleme (`rated`/`total`), maç adı ve saat; `5c` ve thread yalnız görünür kayıtları döndürüyor (`_require_review_access`, `visibility='public'`); üye istatistikleri `_visible_entries_sql` ile.
- **Yapılan backend değişikliği:**
  - `rankit_rank.MIN_COMMUNITY_RATINGS = 20` tek tanım. `_match_dict.community_rating` 20 altında `null`; `rating_count` korunuyor (`TOO FEW RATINGS` onunla).
  - `review_count` = herkese açık, metni olan incelemeler (`5c` `total` ile aynı).
  - `_mask_spoiler_text`: `/home` `activity` ve `/members/{id}` `entries` artık `spoiler` ve `review_withheld` döndürüyor; izleyen yazar değilse ve maçı puanlamamışsa spoiler metni `""`.
  - `POST /diary`: ödül yalnız `rating` varken; yıldızsız kayıt `points_awarded: 0`, `award_kind: null`.
  - `streak_for`: yalnız `rating IS NOT NULL` kayıtlar geceyi sayar.
  - Classic bildirimi yalnız maçı puanlamış kullanıcılara yazılır; `_stored` ayrıca puanlanmamış maça dair classic satırlarını okuma anında gizler (canlıdaki eski satırlar dahil).
  - `_hot_match`: en az 20 puan ve ≥ 4.0; payload'da `rating` yok.
- **Test:** yeni `tests/test_rankit_visibility.py` (8 FastAPI TestClient rota testi). `test_rankit_notify.py` ve `test_rankit_rank.py` fikstürleri eski hatayı kodluyordu (tek puanla sıcak maç; `rating` sütunu olmadan "puanlanmış" gece) — düzeltildi, 3 yeni test eklendi. `python -m pytest tests/test_rankit_social.py -q` 49/49; `tests/test_rankit_*.py` 121/121. On düzeltmenin her biri tek tek geri alındığında ilgili test kırmızıya dönüyor (mutasyon kontrolü; dosyalar bayt bayt geri yüklendi).
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): `activity[].review_withheld === true` iken metin boş gelir. Mobil `FeedVerdict` ve web akışı `CONTAINS SPOILERS · TAP TO SHOW` göstermeli, dokununca maçı/thread'i açmalı (metin `4a`/`5c`'de kendi kapısıyla). `hot_match` artık `rating` taşımıyor (`Alerts.jsx` zaten kullanmıyordu). `collectibleState.js` "Rank points" deltası yıldızsız kayıtta artık 0.
  - Karar noktası: `instant_classic` ≥ 4 oyla hesaplanıyor, 20 eşiğine tabi değil. §5.5 yalnız ısı değerlerini sayıyor; Classic de bir hüküm (§3).
  - Karar noktası: `classic_count` / `instant_classic` paydası yıldızsız izleme kayıtlarını da sayıyor.
  - Karar noktası: puanlanmamış izleyiciye topluluk hükmü alanları (20 ve üzeriyse `community_rating`, `instant_classic`, `potm`, `dominant_tag`, `tags`, `reviews`) yine yanıtta, çünkü `REVEAL ANYWAY` istemcide tek dokunuş. Sunucuda saklamak için Codex ile birlikte ikinci istek sözleşmesi (ör. `?reveal=1`) gerekir.
  - Karar noktası: bir kayıttan puan kaldırılınca (`rating` → null) defterdeki puanlama ödülü geri alınmıyor.
  - Faz 4 (ölçüldü, bu geçişte düzeltilmedi): gecesinde puanlanıp sonra düzenlenen kayıt 15 → 5 puana düşüyor (`award_for_rating` diğer türü siliyor). Ölçüm: aynı gece `rate_same_day` +15 (toplam 15); 3 gün sonra düzenleme `rate_late` +5 (toplam 5). Ayrıca seri `created_at` kullanıyor: gece yıldızsız kaydedilip sonradan puanlanan maç o geceyi sayar; gerçek bir puanlama anı alanı ya da defterden türetilen seri gerekiyor.
  - Adım 3 — expected heat: API ve DB'de yok; uydurulmadı. `2h`/`16c`: "EXPECTED HEAT 3.4 · From 1,204 members who want this one. Not a prediction — an appetite reading." Üye sayısı mevcut veriden (watchlist) dürüstçe verilebilir; 3.4 için kaynak yok (watchlist ikili). Önerilen sözleşme: `appetite: {members: int, expected_heat: float|null, min_members: 20}`. Değer ancak yeni bir girdiyle (ör. listeye eklerken "ne kadar istiyorsun, 1–5") hesaplanabilir — ürün kararı. Planlı ısı, bitmiş maçın `community_rating` alanıyla aynı alan olmayacak.
  - Faz 9: `3d` için POTM `WON` / `SHARE` (20 oy eşiği, `TOO FEW VOTES`) backend'de yok; mevcut uç sağlayıcının sezon cetveli.
- Commit, push, deploy ve canlı migrasyon yapılmadı.

#### Backend pass — Aşama 4 kararları / 2026-09-21

- **BUILD maddesi ve ekran kodu:** §3 (Classic damgası bir hüküm), §5.5 (20 eşiği her ısı değerine), §12.1 (ödül puanlamanın karşılığı), §9 tablosu "Scheduled — expected heat (`2h`)", `2h`/`16c` metni.
- **İncelenen endpoint / tablo:** `_match_dict` (`classic_count`, `instant_classic`, beklenen ısı), `POST /diary`, `PUT /diary/{id}`, `rankit_rank.revoke` / yeni `revoke_rating`, `rankit_watchlist`, `rankit_points`.
- **Bulgu / sahibin kararı (2026-09-21):** (1) Instant Classic 20 puan eşiğine tabi, Classic payının paydası yalnız puanlayanlar. (2) Puan kaldırılınca "optimum çözüm". (3) Beklenen ısı = maçı izleme listesine ekleyenin 1–5 okuması. (4) Faz 4 hatası sırası gelince.
- **Yapılan backend değişikliği:**
  - `classic_count` ve `instant_classic` son **puanlı** kayıtlardan hesaplanıyor; `instant_classic` = `rating_count` ≥ 20 ve Classic payı ≥ %65. Eskiden ≥ 4 kayıt yetiyordu ve payda yıldızsız izleme kayıtlarını da sayıyordu.
  - `rankit_rank.revoke_rating` yalnız `rate_same_day` / `rate_late` satırlarını siler; mevcut `revoke()` aynı maça yazılmış `companion` ödülünü de silerdi. `POST /diary` `rating: null` geldiğinde ve bu maçta kullanıcının başka puanlı kaydı kalmadığında ödülü geri alır; yanıtta yeni `points_revoked`. Yeniden puanlama ân kuralına göre yeniden öder, çiftlenmez (ödül kullanıcı·tür·maç başına tek). Yeniden izleme kaydında puan duruyorsa ödül kalır. Seri zaten puanlı kayıtlardan türediği için kendiliğinden tutarlı.
  - Beklenen ısı: `rankit_watchlist.appetite INTEGER NULL` (1–5; NULL = okuma verilmedi) ve `idx_rankit_watchlist_match`. `init_db` içinde idempotent ALTER; canlı veritabanına yalnız deploy ile gider, mevcut satırlar okuma yok sayılır (değer uydurulmaz).
  - Yeni `PUT /api/rankit/matches/{id}/appetite`, gövde `{appetite: 1..5 | null}`: okuma vermek maçı izleme listesine ekler; `null` okumayı geri çeker, maçı listede bırakır; listeden çıkmak okumayı da siler; yalnız `upcoming` maçta (aksi `409`); idempotent.
  - Maç yanıtında `appetite: {watchers, readings, expected_heat, min_readings: 20}` yalnız `upcoming` maçta, diğerlerinde `null`. `expected_heat` 20 okuma altında `null`; sayaçlar her zaman var. `my_appetite` izleyenin kendi okuması. Bitmiş maçın `community_rating` alanından ayrı alan.
- **Test:** `tests/test_rankit_visibility.py` +6 (toplam 14 TestClient testi). `tests/test_rankit_*.py` 127/127; `tests/test_rankit_social.py` 49/49. Sekiz mutasyonun her biri ilgili testi kırmızıya çeviriyor; dosyalar bayt bayt geri yüklendi.
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): `2h`/`16c`'de `appetite.expected_heat` sayısı rampanın yanında; 20 okuma altında boş rampa ve okuma sayacı. Tahtadaki "From N members who want this one" için dürüst sayı `readings` (okuma veren), `watchers` listedeki herkes. İzleme listesine eklerken 1–5 okuma girişi → `PUT /matches/{id}/appetite`. `instant_classic` artık 20 puan altında `false` — bu maçlarda Classic saç çizgisi yanmaz.
  - Faz 4: düzenlemede 15 → 5 puan düşüşü ve serinin gerçek puanlama anı ihtiyacı (yukarıdaki kayıt) sırası gelince.
  - Commit, push, deploy ve canlı migrasyon yapılmadı.

#### Backend pass — Phase 1 (The card) / 2026-09-21

- **BUILD maddesi ve ekran kodu:** §2 (kart), §2.3 (kulüp rengi CSS değişkeni olarak gelir), §2.9 (POTM varyantı), §1.2 (altın bütçesi), §5.5, CODE.md §8 ("sahte broadcaster üretilmez"). Ekranlar `2a`–`2g`.
- **İncelenen endpoint / tablo:** `_match_dict` ve onu kullanan tüm kart uçları, `_team`, `/diary` (düz satır, `diaryToMatchCardProps`), `/quick-rate`, `/competitions/{id}`; frontend `toMatchCardProps.js`, `heat.js`; `rankit_matches` (`starts_at`, `status`, `broadcaster`), `rankit_teams.color`; FotMob lig / takım / maç yanıtları, EuroLeague oyun yanıtı; canlı `primaryarch.net` (salt okunur).
- **Bulgu:**
  1. Beklenen ısı sözleşmesi uyuşmuyordu: adaptör üst düzey `expected_heat` ve `expected_rating_count` okuyor, yanıt iç içe `appetite` gönderiyordu. Değer ekrana hiç ulaşmazdı.
  2. Kulüp renkleri uydurma: `rankit_sync._color(name)` adın md5'inden 6 renkli bir palet seçiyor. Yerelde 1.025 futbol kulübünün 1.023'ü, EuroLeague'de 53'ün 23'ü bu paletten; 169 futbol ve 5 basketbol kulübü doğrudan altın token (`#FFB11B`), diğerleri `positive` (`#3FB08C`) gibi anlamlı sistem renkleri. Şema `color TEXT NOT NULL DEFAULT '#FFB11B'`; senkron her turda rengi yeniden yazıyor. NBA renkleri gerçek (`NBA_COLORS`).
  3. Canlıda seed kalıntısı: `seed_rankit` koruması eklenmeden önce yazılmış 4 demo maç (`provider` NULL; canlı toplam 9.413, senkronlu 9.409) sahte yayıncı (`S Sport Plus`, `tabii Spor`, `TRT 1`, `NBA League Pass`), uydurma editoryal özet ve Knicks–Celtics 118–114 gibi hiç oynanmamış sonuçlarla duruyor; gerçek NBA 2025-26 ve UCL 2025-26 turnuva satırlarına bağlı. Demo hesaplar `ece` (11), `mert` (12), `deniz` (13) üye aramasında çıkıyor; `rankit_demo` ile birlikte maç 1 ve 3'te 8 demo yorum ve POTM oyu var. Maç 1'de bir gerçek kullanıcı yorumu var (`gokdenzii`).
  4. `broadcaster` alanı yalnız bu demo maçlarda dolu; senkronlu maçlarda her zaman `null`. Gerçek ülke bazlı yayıncı verisi `rankit_broadcasts` / `rankit_broadcast_rules` içinde ama karta hiç girmiyor.
  5. Sonuç türü saklanmıyor: FotMob biten maçta skoru her zaman `N - N` veriyor (penaltıyla biten 270, uzatmalı 69, yarıda kalan 2 maç dahil; kupa ve UEFA ligleri, 2025-26 ve 2026-27). Penaltı sonucu ve `Pen` / `AET` / `Ab` bilgisi yok; yarıda kalan maç `finished` görünüyor.
  6. `status` yalnız `upcoming` / `live` / `finished`. FotMob her maçta `cancelled` bayrağı veriyor; bu sezon incelenen 8 ligde ertelenmiş/iptal maç yok, eşleme şimdilik kanıtsız bırakıldı. Adaptör `POSTPONED` / `CANCELLED` etiketlerini zaten tanıyor.
  - Sorun bulunmayanlar: senkronlu tüm `starts_at` değerleri `Z` son ekli UTC (yalnız 4 demo maç ekler olmadan); `_team` alanları (`id`, `name`, `short`, `color`, `crest_url`) adaptörle ve `web/cards.jsx`'in `crest_url` beklentisiyle eşleşiyor; kart üreten uçların hepsi `_match_dict` kullanıyor, `/diary` düz şekli adaptörde ayrıca karşılanıyor.
- **Yapılan backend değişikliği:** beklenen ısı adaptörün okuduğu düz alanlara taşındı: `expected_heat` (20 okuma altında `null`), `expected_rating_count` (sayının dayandığı okuma sayısı; tahtadaki "N members"), `watchlist_count` (listedeki herkes), `my_appetite`. Hepsi yalnız `upcoming` maçta dolu, diğerlerinde `null`. Aynı günkü "kararlar" kaydındaki iç içe `appetite` nesnesi bu düz alanlarla değiştirildi; onu okuyan istemci yoktu.
- **Test:** `tests/test_rankit_visibility.py` düz alan adlarını doğruluyor; `tests/test_rankit_*.py` 127/127. 20 okuma eşiği geri alındığında test kırmızı.
- **Kalan bağımlılık veya veri eksikliği (karar noktaları):**
  - Kulüp rengi kaynağı: FotMob'un lig ve takım uçlarında renk yok; renk yalnız maç detayında `general.teamColors` olarak, o maçın ev/deplasman bağlamında ve açık/koyu mod için farklı değerlerle geliyor. EuroLeague API'sinde renk alanı hiç yok. Hangi değerin "kulüp rengi" sayılacağı ve renk bilinmediğinde kartın görünümü tasarım kararı. Öneri: gerçek renk ayrı bir tabloda (logo tablosu gibi, kaynaklı) tutulsun ki senkron ezmesin; uydurma renk yanıta hiç girmesin; bilinmeyen renkte adaptörün nötr varsayılanı kullanılsın.
  - Canlı seed temizliği canlı veritabanında silme demek; kullanıcı onayı olmadan yapılmadı. Maç 1'deki gerçek yorum yüzünden körlemesine silinemez.
  - `potm` tek oyla bile kartta. §5.5 "player share below 20 votes reads TOO FEW VOTES"; Instant Classic kararına benzer biçimde POTM'a da uygulanıp uygulanmayacağı sorulacak.
  - Yayıncı: kart için gerçek veri ancak izleyenin ülkesiyle çözülebilir (`rankit_broadcasts`); şimdilik alan dürüstçe `null`.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Backend pass — Phase 1 kararları / 2026-09-21

- **BUILD maddesi ve ekran kodu:** §2.3 (kulüp rengi), §1.2 (altın bütçesi), §2.9 ve §9.4 (POTM, "who took POTM"), §5.5 ("player share below 20 votes reads TOO FEW VOTES"). Ekranlar `2a`–`2g`.
- **İncelenen endpoint / tablo:** `src/rankit_sync._color` (futbol ve EuroLeague kulüp rengi), `rankit_teams.color`; `_match_dict.potm` ve POTM oylarını toplayan diğer uçlar (`/competitions/{id}` popüler oyuncular, `/players/{id}`, `/teams/{id}`).
- **Bulgu / sahibin kararı (2026-09-21):** (1) 6 renkli palet yerine 12 renkli palet, "ilerleyen süreçte düzenleriz". (2) Canlıdaki demo kalıntısı şimdilik kalıyor. (3) POTM için 20 oy eşiği uygulanacak.
- **Yapılan backend değişikliği:**
  - `rankit_sync.CLUB_PALETTE`: 12 yer tutucu renk, tek yerde. Altın ailesi, `positive`, ısı rampası, zemin/yüzey/mürekkep token'ları ve Primary Arch teal'i (`#00A3AF`) bilerek dışarıda; sarı yok, altınla karışmasın. Renk adın md5'inden kararlı seçiliyor; NBA gerçek `NBA_COLORS` kullanmaya devam ediyor.
  - `_match_dict.potm` yalnız toplam 20 POTM oyundan sonra dolu; yeni `potm_votes` (toplam oy) her zaman var, arayüz `TOO FEW VOTES` diyebilsin. Oyuncu/takım/turnuva uçlarındaki POTM **sayıları** değişmedi: §5.5 payı ve ısıyı saklıyor, ham sayıyı değil.
- **Test:** yeni `tests/test_rankit_team_colors.py` (12 farklı renk, hiçbir tasarım token'ı yok, kulüp başına kararlı, paletin tamamı kullanılıyor); `tests/test_rankit_visibility.py` +1 (19 oyda `potm` yok, 20'de var). `tests/test_rankit_*.py` 131/131. İki kural da geri alındığında ilgili test kırmızı.
- **Kalan bağımlılık veya veri eksikliği:**
  - Mevcut renkler bir sonraki katalog senkronunda yeniden yazılır (`_team` upsert rengi günceller): yerelde API çalışınca, canlıda deploy sonrası 6 saatlik turda. O tur yalnız güncel sezonu taradığından, yalnız geçen sezonda kalan kulüpler (ör. küme düşenler) eski rengini korur; hepsini yeniden boyamak için tek seferlik bir canlı veri güncellemesi gerekir — kullanıcı onayı bekliyor.
  - `rankit_teams.color` şema varsayılanı hâlâ `#FFB11B`; senkron her eklemede renk verdiği için bu varsayılana düşülmüyor. SQLite varsayılanı tablo yeniden kurulmadan değiştirilemiyor.
  - Frontend (Codex): `potm` 20 oy altında `null` gelir; kartın POTM varyantı ve Community'deki "COMMUNITY PLAYER OF THE MATCH" bloğu `potm_votes` ile `TOO FEW VOTES` gösterebilir.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Backend pass — Phase 2 (Home) / 2026-09-21

- **BUILD maddesi ve ekran kodu:** `2a` ("TONIGHT · 4 MATCHES", hero "LIVE · 73'"), `2r`; §12.1 / RankIt günü 11:00 → 11:00; CODE.md §8 (sahte yayıncı üretilmez).
- **İncelenen endpoint / tablo:** `GET /home` (pencere, sıralama, takip katmanları), `_match_dict`, `_broadcasts_for` ve `GET /matches/{id}/broadcasts`, `rankit_matches.live_minute`; telefon `rankitDayContext` / `loadRankitHome`, web `rankitApi.home(sport)`; canlı `primaryarch.net` (salt okunur).
- **Bulgu:**
  1. Canlı dakika yanıtta yoktu: `live_minute` sütunu var ve canlı olay döngüsü yazıyor, ama `_match_dict` döndürmüyordu; `2a` kartı "LIVE · 73'" diyemezdi.
  2. "TONIGHT · N MATCHES" için gecenin gerçek maç sayısı yoktu; kartlar 12 ile sınırlı.
  3. Pencere göndermeyen istemci (web) için sunucu RankIt gününü UTC sabitiyle hesaplıyordu; Türkiye'de gün 3 saat kayıyordu (takip katmanı sıralaması).
  4. Kart ayağındaki yayıncı gerçek veriye hiç bağlı değildi (eski `broadcaster` sütunu yalnız demo verisinde dolu).
  - Sorun bulunmayanlar: canlıda başlama saati 4 saatten fazla geçmiş ama hâlâ `upcoming` duran maç yok (upcoming katalog taraması, 0 sonuç) — canlı senkron durumları güncel tutuyor.
- **Yapılan backend değişikliği:**
  - `_match_dict.live_minute`: yalnız `live` maçta dolu; bitmiş maçın son dakikası "canlı" gibi okunmasın diye diğerlerinde `null`.
  - `GET /home` yeni `tz_offset` (dakika, −840…840, aksi 422) ve `country` parametreleri; imzanın sonunda, sırayla çağıran eski çağrılar bozulmadan. Pencere gelmezse RankIt günü `_rankit_day_window(tz_offset)` ile hesaplanıyor (`rankit_notify._hot_match` ile aynı formül).
  - Yanıta `day: {start, end, matches}`: pencerenin UTC sınırları ve o penceredeki gerçek maç sayısı (spor filtresi ve senkronlu-veri kuralı uygulanmış; demo kalıntısı sayılmaz).
  - `country` destekli bir ülkeyse (GB / US / TR) yaklaşan ve canlı kartlara `broadcast: {country, confidence, channels}` (`confirmed` kesin kayıt, `typical` turnuva kuralı, bilinmiyorsa `confidence: null` ve boş liste). Desteklenmeyen ülke ana ekranı düşürmez; alan gelmez. Bitmiş maça eklenmez.
  - Ek (Phase 1 kararı): palet `api/rankit_colors.py`'ye taşındı (tek düzenleme noktası); `init_db` açılışta yalnız rengi eski 6'lı paletin o ada verdiği uydurma renk olan takımları yeni palete boyar — gerçek renkler (NBA) eşleşmez, idempotent. Canlıya yalnız deploy ile gider. `src/rankit_sync.py` içindeki kullanılmayan `hashlib` importu kaldırıldı.
- **Test:** yeni `tests/test_rankit_home.py` (4 TestClient testi); `tests/test_rankit_team_colors.py` +1 (açılışta yeniden boyama, iki kez çalıştırma). `tests/test_rankit_*.py` 136/136, art arda üç koşuda temiz. Bir koşuda tek seferlik bir `error` görüldü ve tekrarlanmadı; nedeni yakalanamadı. Dört Faz 2 kuralı tek tek geri alındığında ilgili test kırmızı (sayaç mutasyonu önce sözdizimini bozduğu için geçersiz sayıldı, doğru biçimde tekrarlandı: `4 == 3`).
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): web `rankitApi.home` → `tz_offset` (ve isteğe bağlı `country`) göndermeli; kart `live_minute`'u, üst şerit `day.matches`'i ("TONIGHT · N MATCHES"), kart ayağı `broadcast`'ı kullanabilir (`confidence: typical` için "genellikle" dili).
  - `broadcast` yalnız Home'da; diğer kart uçları (Discover, Search, Competition) aynı parametreyi ileride alabilir.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Backend pass — Phase 3 (Diary and Discover) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** `2e` (raf, "142 WATCHED · 11 CLASSICS"), `2c` / `6c` (Discover, "MINIMUM HEAT — only matches the community rated Good or better · Show 62 matches", Hunt kutusu), `3e` (arama: "14 Sep · in your diary", "Premier League · 12 rated", "7 of 12 · includes Arsenal"), `8a`; §5.5; HANDOFF §4.9.5 (filtre tüm sunucu sonucuna uygulanır).
- **İncelenen endpoint / tablo:** `GET /diary`, `POST /diary` (tarih), `GET /watchlist` ve izleme listesi anahtarı, `GET /search`, `GET /catalog`; frontend `RankItPrototype.jsx` kayıt yükü (`watched_date`), `SearchSheet.jsx`, `rankitApi.catalog`.
- **Bulgu:**
  1. Arama `%` ve `_` karakterlerini joker olarak işliyordu ("%" her şeyi eşleştiriyordu); kişi aramasında (`/people`) bu daha önce düzeltilmişti, genel aramada kalmıştı.
  2. Arama senkronlu katalog varken demo kalıntısı maçları (`provider` NULL) ve banlı hesapları döndürüyordu; `/home` ve `/catalog` demo kalıntısını zaten gizliyor, `/people` banlıları.
  3. `6c`'nin en düşük ısı filtresi için katalogda parametre yoktu; "Show N matches" sayısı sunucudan alınamıyordu.
  4. Diary kaydında varsayılan izleme tarihi ve "gelecek tarih" kontrolü sunucunun yerel gününden (`date.today()`) geliyordu; kullanıcının saat dilimi (`tz_offset`, istemci zaten gönderiyor) kullanılmıyordu.
  5. Test izolasyonu (ayrıca bulundu): `api.main` import eden testler katalog senkronu, canlı skor ve canlı olay döngüsü thread'lerini başlatıyordu; 12–20 sn sonra gerçek FotMob / EuroLeague'e gidip o an aktif test veritabanına yazıyorlardı. Suite 20 sn'yi geçince rastgele bir fikstür düşüyordu (`UNIQUE constraint failed: rankit_competitions.id`; önceki koşulardaki tek seferlik hata buydu, döküm: "[rankit-catalog] EuroLeague 2025-26: 402 maç").
  - Sorun bulunmayanlar: `/diary` kişisel puanı (`rating`) topluluk alanlarından ayrı taşıyor, adaptör rafı "YOUR RATING" olarak çiziyor; `/watchlist` ortak serializer'ı kullanıyor; `/catalog` filtreleri (spor, turnuvanın adı — sezondan bağımsız, sezon, durum) sunucuda ve `total` filtreli sayı; aramanın kullanıcıya özel satırları (`my_watched_date`, kulüpte `rated`, listede `rated`/`total`/`matched_team`) gerçek veriden.
- **Yapılan backend değişikliği:**
  - `/search`: her `LIKE` artık `ESCAPE '\'` ile ve aranan metinde `\`, `%`, `_` kaçırılıyor — maç, oyuncu, kulüp, üye ve liste sorgularının hepsinde. Senkronlu katalog varken `provider IS NOT NULL`; üye sonuçlarında `is_banned=0`.
  - `/catalog?min_heat=<0..5>`: kartla aynı kural — kullanıcı başına son puan, en az 20 puan, gösterilen değer (`ROUND(AVG,1)`) eşiğe eşit ya da üstünde; filtre tüm katalogda sunucuda, `total` filtreli. "Good or better" için istemci 2.5 gönderir (ısı basamağı `round(value)` ≥ 3).
  - `POST /diary`: `tz_offset` −840…840 ile sınırlı; gönderilmeyen `watched_date` kullanıcının bugünü (`UTC + tz_offset`); gelecek kontrolü UTC+14'ün bugününe göre (sunucu saat diliminden bağımsız).
  - Arka plan işlerine tek anahtar: `RANKIT_BACKGROUND_JOBS=0` katalog senkronunu, canlı skor/olay döngülerini ve logo doldurmayı başlatmaz (`api/rankit_live_sync.background_jobs_enabled`; canlıda tanımsız → açık, davranış aynı). Yeni `tests/conftest.py` testlerde kapatıyor.
- **Test:** yeni `tests/test_rankit_discover.py` (5 TestClient testi; tarih testi UTC+13 ve UTC−12'yi karşılaştırarak her saatte belirleyici); `tests/test_rankit_catalog_refresh.py` +1 (anahtar kapalıyken hiçbir iş başlamaz; açıkken iki canlı döngü başlar), mevcut "worker başlar" testi anahtarı açarak çalışıyor. `tests/test_rankit_*.py` 142/142, art arda üç koşuda temiz ve arka plan işi çıktısı olmadan. Altı kural tek tek geri alındığında ilgili test kırmızı. Gelecek-tarih toleransı (UTC+14) saate bağlı olduğu için mutasyonla her an ölçülemiyor; iki gün ilerisi her zaman reddediliyor.
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): diary kaydı `watched_date`'i `toISOString().slice(0,10)` ile, yani UTC günüyle gönderiyor; kullanıcının yerel günü için yerel tarih gönderilmeli ya da alan hiç gönderilmemeli (sunucu artık `tz_offset` ile doğru günü koyuyor). `6c` "Show N matches" için `GET /catalog?min_heat=…&limit=1` → `total`.
  - The Hunt (`2c` kutusu, `2m`/`2n`): backend'de ürün koleksiyonu kavramı yok (`rankit_lists` kullanıcı listesi; BUILD §24 ikisini birleştirmeyi yasaklıyor). Faz 9'da veri sözleşmesiyle ele alınacak.
  - `8a` web rayı seçeneklerin yanında sayı istiyor (facet sayıları); `/catalog` yalnız toplamı veriyor. Faz 16.
  - `/diary` sayfalanmıyor (tüm kayıtlar); masaüstü raf `7f` (Faz 15) için gerekecek.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Backend pass — Phase 4 (Collectible) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** `6a` / `7e` (§4.1: "That's card 143.", üç delta, Share / Skin / Edit), §5.4 (hiçbir iş kaybolmaz; yeniden deneme), §9.1 / §9.3 (yıldız, POTM, respect ve yorum tam zamanda açılır; oyuncular puandan sonra), §10.1–10.2 (POTM 1, respect en fazla 2), §12.1 (seriyi yalnız gecesinde puanlama uzatır); HANDOFF §4.10 (belirsiz rewatch sunucu idempotensisi olmadan tekrar edilmez).
- **İncelenen endpoint / tablo:** `POST /diary`, `PUT /diary/{id}`, `POST /matches/{id}/potm`, `PUT /matches/{id}/respect`, `rankit_rank.award_for_rating` / `streak_for`; `rankit_diary_entries`, `rankit_points`, `rankit_potm_votes`, `rankit_respect_votes`; frontend `collectibleState.js`, `ratingQueue.js`, `rankitOutbox.js`.
- **Bulgu:**
  1. Gecesinde kazanılan ödül düzenlemede düşüyordu: `award_for_rating` her çağrıda "diğer türü" siliyordu; maç gecesi 15 puan alan kayıt ertesi gün düzenlenince 5'e iniyordu (Aşama 4'te ölçülmüştü: 15 → 5).
  2. Seri kaydın oluşturulma anına (`created_at`) bakıyordu: gece yıldızsız kaydedilip günler sonra puanlanan maç o geceyi seriye sayıyordu.
  3. Sunucuda tekrar koruması yoktu: yanıtı kaybolan yeniden izleme (rewatch) kaydı tekrar gönderilirse ikinci satır doğuyordu; istemci bu yüzden belirsiz rewatch'ı "Check your diary before retrying" ile durduruyordu.
  4. POTM ve respect yalnız izleme kaydıyla (puansız) verilebiliyordu (`_require_watched`); §9.3 oyuncuları puandan sonra açıyor. POTM, respect verilmiş bir oyuncuya taşınınca oyuncu iki listede birden kalıyordu (respect ucu bu durumu reddediyor, POTM ucu temizlemiyordu).
  5. `6a` için yalnız deltalar vardı; kart numarası, güncel seri ve toplam puan yoktu.
  - Sorun bulunmayanlar: gönderilmeyen alanlar kayda dokunmuyor (kısmi güncelleme sözleşmesi); normal (rewatch olmayan) kayıt tekrarında aynı satır güncelleniyor; Classic bildirimi aynı damgayı iki kez yazmıyor; respect üst sınırı 2 ve POTM ile aynı oyuncu reddediliyor; yalnız bitmiş maç deftere girebiliyor.
- **Yapılan backend değişikliği:**
  - `award_for_rating`: **ilk ödül kalır** — maçta `rate_same_day` ya da `rate_late` zaten varsa yeni ödül yazılmaz, eskisi silinmez (0 puan, mevcut tür döner). Geç puanlayan yine 15'e çıkamaz; puan kaldırılırsa `revoke_rating` satırı siler ve sonraki puanlama kendi anına göre öder.
  - Yeni `rankit_diary_entries.rated_at`: yıldız ilk verildiğinde yazılır (çevrimdışı kabul edilmiş an ya da şimdi), puan değişince kalır, kaldırılınca `NULL`. `streak_for` `COALESCE(rated_at, created_at)` kullanıyor — eski satırlara dokunulmadı, onlarda seri önceki gibi hesaplanıyor; kimsenin mevcut serisi değişmez.
  - Yeni `rankit_diary_entries.client_entry_id` (kullanıcı başına tekil, `8–64` karakter `[A-Za-z0-9_-]`) ve `DiaryIn.client_entry_id`: aynı kimlikle gelen tekrar aynı kaydı günceller (`updated: true`, aynı `entry_id`); kimlik başka maça aitse `409`. `POST /diary` artık `BEGIN IMMEDIATE` ile başlıyor, eş zamanlı iki tekrar yarışamaz.
  - `_require_rated`: POTM ve respect puan olmadan `403 Rate this match first`. POTM respect verilmiş bir oyuncuya taşınınca o respect silinir.
  - Kayıt yanıtına `card_number` (kaydın kullanıcının defterindeki sırası; düzenlemede aynı), `streak_current`, `points_total`, `collection: null` (ürün koleksiyonu verisi yok, uydurulmadı). Mevcut deltalar (`diary_entries_delta`, `points_awarded`, `streak_delta`, `points_revoked`) aynen duruyor.
  - Migrasyon: iki sütun ve bir kısmi tekil index, `init_db` içinde idempotent; veri güncellemesi yok. Canlıya yalnız deploy ile gider.
- **Test:** yeni `tests/test_rankit_collectible.py` (5 TestClient testi); `tests/test_rankit_rank.py` +2 (düzenlemede 15 kalır; gece kaydedilip sonra puanlanan maç geceyi saymaz), fikstüre `rated_at`. `tests/test_rankit_*.py` 149/149. Yedi kural tek tek geri alındığında ilgili test kırmızı.
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): yeni kayıtlarda (özellikle rewatch) `client_entry_id` (UUID) gönderilirse belirsiz rewatch artık güvenle tekrar edilebilir, "Check your diary before retrying" durumu kalkabilir. `6a` "That's card N" için `card_number`, karolar için `streak_current` / `points_total` + deltalar; koleksiyon karosu için veri yok (`collection: null`). POTM/respect puansız `403` döner (arayüz §9.3 gereği zaten puandan önce açmamalı). Düzenleme puanı da göndermeli — API'de boş `rating` "puanı kaldır" demek.
  - Faz 5 (players picker `15b`): POTM/respect oyuncu doğrulaması sezon kadrosu bağlarından (`rankit_match_players`) yapılıyor; §10.2 seçici maçta gerçekten oynayanları (ilk 11 + oyuna girenler) listeliyor ve lineup oyuncuları `rankit_players`'a bağlı değil. Sezon kadrosu bağı olmayan maçlarda (ör. canlıda Fiorentina–Pisa, 0 bağ) oy verilemez. Faz 5'te ele alınacak.
  - Puan kaldırılınca kullanıcının o maçtaki POTM/respect oyları siliniyor değil, duruyor; yeni oy puansız verilemiyor.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Backend pass — Phase 5 (Match sheet) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** §9 (beş evre), §9.1–9.2 (canlıda Match sekmesi: canlı skor, ilk 11, dakikalı değişiklikler; anlar ve nabız yalnız Companion'da), §10.2 (seçici maçta gerçekten oynayanları listeler — STARTED / CAME ON — ve kadro yokken kapalı), §2.9 (POTM varyantı oyuncu görseli). Ekranlar `2h`, `15d` ("CAME ON · 63' Neto for Madueke", oyuncu başına mevki), `15a`, `2f`, `2g`, `15b`.
- **İncelenen endpoint / tablo:** `GET /matches/{id}` (skor, `lineups`, `players`, `reviews`), `GET /matches/{id}/broadcasts`, `POST /matches/{id}/potm`, `PUT /matches/{id}/respect`, `rankit_live_sync` (kadro döngüsü, canlı olay döngüsü); `rankit_match_lineup_players`, `rankit_players`, `rankit_match_players`; FotMob `matchDetails` (`lineup`, `substitutionEvents`, `Substitution` olayları, `positionId`) ve oyuncu görsel adresi.
- **Bulgu:**
  1. Kadro yalnız ad, forma numarası ve sıra taşıyordu: `15d`'nin mevkisi, oyuna giriş/çıkış dakikası ve "for Madueke" (kimin yerine) bilgisi yoktu. FotMob hepsini veriyor (`performance.substitutionEvents`, olaylarda `swap = [giren, çıkan]`, `positionId`).
  2. Kadro oyuncuları `rankit_players`'a bağlı değildi: seçici maçta oynayanları listelese bile POTM/respect oyu verilemezdi; oylar yalnız sezon kadrosu bağlarıyla (`rankit_match_players`) doğrulanıyordu. Sezon kadrosu bağı olmayan maçlarda (canlıda Fiorentina–Pisa, 0 bağ) hiç oy verilemiyordu; bağlı maçlarda da hiç oynamamış kadro oyuncusuna oy gidebiliyordu (§10.2'ye aykırı).
  3. Kadro yalnız 15 dakikalık döngüde ve maç bitene kadar yenileniyordu; maçın son dakikalarındaki değişiklikler kaçıyordu.
  - Sorun bulunmayanlar: evreler mevcut alanlarla ayrışıyor (`status`, `lineups` boş/dolu = kadro açıklandı mı, `live_minute`, skorlar); `2h` sezon kadroları `players`, beklenen ısı alanları, "NOT COVERED IN YOUR REGION YET" için `broadcasts` (`confidence: null`); `2g` kalabalık satırı `rating_count`, `classic_count`, `potm` (20 oy eşiği) ile.
- **Yapılan backend değişikliği:**
  - `rankit_match_lineup_players` yeni sütunlar: `player_id`, `position` (ölçülmüş kaba etiket: Keeper / Defender / Midfielder / Winger / Striker — mevcut `POSITION_CODES`), `position_code` (FotMob ham kodu), `sub_in`, `sub_out`, `replaced` (yerine girdiği oyuncunun adı). Migrasyon idempotent; eski satırlar NULL, bir sonraki yenilemede dolar.
  - Kadro yazılırken her oyuncu `rankit_players`'a bağlanıyor (anahtar `(sport, name)`, katalog senkronuyla aynı); görsel yalnız boşsa FotMob'un oyuncu görseliyle dolduruluyor (adres kalıbı doğrulandı: HTTP 200 PNG).
  - Ortak `_store_lineups_from`: kadro döngüsü (15 dk) ve canlı olay döngüsü (45 sn) aynı yolu kullanıyor; canlı döngü artık aynı `matchDetails` yanıtından kadroyu da yazıyor — oyuna girenler maç sırasında ve son düdüğe kadar güncel.
  - `GET /matches/{id}` → `lineups[].starters / bench[]`: `player_id`, `position`, `position_code`, `sub_in`, `sub_out`, `replaced`, `played` (ilk 11 ya da oyuna girdi).
  - `_votable_players`: POTM ve respect yalnız maçta oynayanlara (`422 Player did not play in this match`); kadro oyunculara bağlı değilse (eski satırlar, basketbol) önceki gibi sezon kadrosuna düşüyor.
- **Test:** yeni `tests/test_rankit_match_sheet.py` (5 test; biri canlı olay döngüsünü sahte sağlayıcıyla, ağsız çalıştırıyor). `tests/test_rankit_*.py` 154/154. Altı kural tek tek geri alındığında ilgili test kırmızı.
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): `15b` seçici `match.players` (sezon kadrosu) yerine `lineups[].starters` + `bench[]` içinden `played` olanları listelemeli ve oyu `player_id` ile vermeli; kadrosu olmayan maçta seçici kapalı (§10.2). `15d` "CAME ON" satırı `sub_in` + `replaced`, mevki `position` (ince etiket için `position_code`).
  - İnce mevki etiketleri (`Right back`, `CB`, `AM` gibi) tahtada var ama ölçülmüş bir eşleme yok; yalnız kaba etiket uyduruldu değil ölçüldü. İnce eşleme FotMob `positionDescription` ile ölçülerek eklenebilir.
  - `rankit_players` `(sport, name)` ile tekil: aynı adlı iki farklı oyuncu tek satıra düşer (katalogdaki mevcut sınır).
  - `GET /matches/{id}` `reviews` listesi sınırsız; çok incelemeli maçta yanıt büyür (sayfalı liste `5c`'de var). `2f` "result + events" için maç yanıtında olay listesi yok; anlar Companion ucunda (Faz 6).
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Backend pass — Phase 6 (Companion) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 6 (üç evre `5a` / `5b` / `6d`; rozet katılım sayısı → LIVE → yok; canlı okuma puan değil; tam zamanda sohbet kapanır, nabız gecenin kaydı olur), §12.1 ("A night in the companion" 20 puan), §5.5; HANDOFF §4.9.4 (6d: zirve dakika, devre arasından nabız artışı, saklanan mesajlar; grafik, zirve ya da katılım uydurulmaz), §4.9.6 (basketbol dönemleri). Ekranlar: `5a` ("24 joining · 3 you follow"), `5b` ("CROWD PULSE 4.4", "Red card — Sporting · Pulse +0.9", "148 marked this"), `15d` ("312 in the room"), `6d` ("312 were in the room", "90' loudest", "+1.8 pulse rise from HT", "184 messages kept", "Rate it — your live read was 4.0").
- **İncelenen endpoint / tablo:** `GET /matches/{id}/companion`, `POST /matches/{id}/pulse`, `POST /moments/{id}/mark`, `POST /matches/{id}/presence`, `WS /ws/watchalong/{id}`; `rankit_companion_presence`, `rankit_pulse_reads`, `rankit_moments`, `rankit_moment_marks`, `rankit_watchalong_messages`; frontend `CompanionPanel.jsx`, `rankitApi.pulse`.
- **Bulgu:**
  1. Canlı okuma bozuktu: istemci nabız dakikasını companion yanıtındaki `minute` metninden ("73'" — FotMob'un yön işaretli `15‎’‎` biçimi) aynen geri yolluyordu; tamsayı bekleyen `PulseIn.minute` bunu 422 ile reddediyordu. Canlı dakika gelmediğinde de her okuma 0. dakikaya yazılıyordu (zaman çizelgesi anlamsız).
  2. Katılım ucunu (`/presence`) hiçbir istemci çağırmıyordu (frontend'de çağrı yok): "katılan" sayısı hiç artmıyor, 20 puanlık companion ödülü hiç verilmiyordu.
  3. Uç çağrılsaydı hileye açıktı: istemcinin gönderdiği saniye aynen ekleniyordu (tek istekte 1800 sn) ve maç durumu kontrol edilmiyordu (bitmiş maçta da süre birikiyordu). Kod yorumu "eşik gerçek süreye bakıyor" diyordu, bakmıyordu.
  4. Tek bir `joined` sayısı vardı; "şu an odada" (`15d`), "takip ettiğin katılanlar" (`5a`) ve saklanan mesaj sayısı (`6d`) yoktu. `6d`'nin maç sonu kaydı (zirve, devre arasından artış) hesaplanmıyordu; anlarda nabız farkı ("Pulse +0.9") yoktu.
  5. Tek okumayla bile "CROWD PULSE" sayısı gösteriliyordu (nabız ısı rampasında bir değer).
  - Sorun bulunmayanlar: canlı okuma yalnız canlıyken (`409` aksi), puan değil ayrı tabloda; son okuma `my_read` ile dönüyor ("Rate it — your live read was 4.0" ön seçimi); sohbet maç bitince yazmaya kapalı, geçmiş okunuyor; an işaretleme idempotent; rozet mantığı doğru.
- **Yapılan backend değişikliği:**
  - Nabız dakikası sunucuda: sağlayıcının `live_minute`'u (`_minute_number`: "73'", "45+2'", yön işaretli biçim, "HT" → 45); yoksa istemcinin değeri yedek — tamsayı ya da metin kabul, 0–200'e kırpılır.
  - Katılım soketten, süre sunucu saatinden: soket bağlanınca katılan olarak yazılır (süre eklemeden); ayrılırken bağlantının maçın canlı penceresiyle örtüşen saniyeleri eklenir (başlama anından itibaren, futbolda en fazla 130, basketbolda 180 dk) ve eşik geçildiyse ödül verilir. İstemci sayı gönderemez.
  - `/presence` dürüst: yalnız `live` maçta ve son rapordan bu yana geçen gerçek süre (+5 sn; ilk raporda 60 sn) kadar sayılır; yanıtta `counted`. Maç öncesi çağrı katılan yazar, süre eklemez.
  - Companion yanıtı: `in_room` (şu an bağlı farklı kişiler, süreç içi bellek), `joined_following`, `messages`, `room_open`, `sport`, `pulse.min_reads`; anlarda `pulse_delta` (anın öncesi ve sonrasındaki 5 dakikalık kovaların farkı, iki kova da eşiği geçtiyse); bitmiş maçta `record: {peak: {minute, value, reads}, rise_from_ht, messages, attendance}` — yalnız ölçülmüş kovalardan; devre arası karşılaştırması yalnız futbolda.
  - §5.5 nabıza da uygulandı: güncel nabız ve her kova en az 20 okumayla sayı verir; okuma sayıları her zaman döner.
- **Test:** yeni `tests/test_rankit_companion.py` (6 test; soket bağlantısı TestClient ile gerçek). `tests/test_rankit_*.py` 160/160. On kural tek tek geri alındığında ilgili test kırmızı; nabız dakikası testi, istemci ile sağlayıcının farklı dakika gönderdiği biçime çevrildi (aynı dakikayla koruma ölçülemiyordu).
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): `5a` "N joining · M you follow" → `joined` / `joined_following`; `15d` "N in the room" → `in_room`; `6d` → `record` (zirve dakikası, `rise_from_ht`, `messages`, `attendance`) ve `room_open: false`; anlarda `pulse_delta`. Nabız 20 okuma altında `null` gelir — boş rampa + okuma sayısı. İstemcinin pulse `minute` göndermesine artık gerek yok.
  - `in_room` süreç içi bellek: tek süreçte doğru, çok süreçte her süreç kendi odasını sayar.
  - Companion ödülü artık soket ayrılışında verilir; bağlantısı hiç düzgün kapanmayan istemcide sunucu bağlantının koptuğunu fark ettiğinde yazılır.
  - Basketbolda devre arası kıyası (`rise_from_ht`) ve dönem etiketleri yok: canlı dakika NBA/EuroLeague senkronundan gelmiyor; basketbol okumaları istemcinin dakikasıyla kovalanıyor.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Frontend pass — Aşama 4 görünürlük kapanış taraması / 2026-09-22

- **Kaynak:** `BUILD.md` §3 / §3.1 / §5.5; mobil `2h` ve web `16c` tahtaları. `BUILD.md` tasarım çelişkilerinde üstündür.
- Web `EntityDrawer` içindeki üye review listesi `hideScores` / `ratedMatchIds` taşımıyordu; aynı drawer'ın ilişkili maç `Wall`'ı da cihazın skor tercihinden kopuktu. İki yol da üst kabuğun tek spoiler durumuna bağlandı; review satırındaki yazar profili eylemi korundu.
- Backend `review_withheld: true` olduğunda spoiler metnini özet yanıttan kaldırıyor. Mobil Home/Activity adaptörü bu bayrağı artık taşıyor; mobil `FeedVerdict` ve web Home/Activity/üye drawer `ReviewRow` boş metne yerel reveal uygulamak yerine `OPEN MATCH` ile incelemenin okunabildiği maç yüzeyine götürüyor. Eski mobil üye günlük satırı da sunucunun sakladığı inceleme için tarihi yanlışlıkla metin yerine göstermiyor; skor tercihi ve kişisel oy istisnası aynı üst durumdan geliyor.
- Backend artık yalnız `upcoming` maç için `expected_heat`, `expected_rating_count`, `watchlist_count` ve `my_appetite` alanlarını düz dönüyor. Frontend planned heat'i topluluk ortalamasından ayrı okuyor; sayı yalnız **20 gerçek okuma** ile geçerli. 0–19 okumada Match sheet/Inspector boş rampa + `TOO FEW RATINGS` ve gerçek okuma sayısını; kart boş rampayı gösteriyor. 20+ okumada heat değeri yoksa “too few” yalanını söylemek yerine veri yok durumunda kalıyor. Sahte sayı eklenmedi.
- **Doğrulama:** 23/23 Node testi, Vite production build, yeni/dokunulan politika bileşenlerinde hedefli ESLint ve dokunulan geniş JSX dosyalarında mevcut `set-state-in-effect` / refs / kullanılmayan import kuralları hariç lint geçti. `git diff --check` içerik hatası vermedi; Git'in CRLF dönüşüm bildirimleri var. Genel lint hâlâ geçmişten gelen web/mobil hook bulguları nedeniyle temiz değil. Tarayıcı görsel kabulü bu geçişte yeniden yapılamadı; Aşama 4 bu nedenle görsel olarak kapanmış sayılmıyor.
- **Kalan frontend bağımlılıkları:** `2h`/`16c` için kullanıcının 1–5 appetite okumasını watchlist'e bağlayan girdi HTML tahtasında çizilmemiş; mevcut `PUT /matches/{id}/appetite` sözleşmesine rağmen yeni etkileşim kaynaktan türetilmeden uydurulmayacak. Sonraki adım §9 maç sheet evreleri (`15b` seçici dahil) ve Companion `5a/5b/6d` entegrasyonudur. Commit, push, deploy, APK yapılmadı.

#### Backend pass — Phase 7 (Reviews) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 7 (`15c` composer girişten açılır ve girişe kaydeder, "Save to your entry", spoiler kalkanı baştan söylenir; `5c` en çok respect sırası, takip edilenler üstte; `4a` adreslenmiş yanıtlar, tek seviye, respect elması), §11.1–11.3, §9.3 (etiket, oyuncu ve inceleme puan varken açılır), §3 (Classic damgası bir hüküm), §12.1; HANDOFF §5 ("Spoiler-marked review bodies and replies have their own reveal gate"), §6.1, 6b ("Your reviews → 5c": hesabın kendi incelemeleri, rastgele bir maçın listesi değil). Ekranlar: `15c`, `5c` ("@deniz · on the night · 2h"), `4a` ("@deniz Rank 5 · rated on the night", "41 RESPECT · 2 REPLIES", "Most respected", "AUTHOR").
- **İncelenen endpoint / tablo:** `POST /diary` + `PUT /diary/{id}` (inceleme, etiket, Classic, spoiler alanları), `GET /matches/{id}/reviews`, `GET /reviews/{id}/thread`, `POST /reviews/{id}/like`, `GET|POST /reviews/{id}/comments`, `POST /comments/{id}/respect`, `GET /matches/{id}` (`reviews`, `review_count`), `GET /home` (`activity`), `GET /diary`; `rankit_diary_entries`, `rankit_review_comments` (`reply_to_user_id`), `rankit_review_likes`, `rankit_comment_respect`, `rankit_points`, `users.is_banned`.
- **Bulgu:**
  1. Yanıt adresi (`reply_to`) doğrulanmıyordu: herhangi bir kullanıcı kimliği kabul ediliyor ve o kişiye "reply" bildirimi gidiyordu — diziyle ilgisi olmayan, incelemeyi göremeyen birine bile. §11.2'de adres yanıt eyleminden üretilir.
  2. Yanıt respect'inde hiç kontrol yoktu: göremediğin (gizli / takipçilere açık) incelemenin yanıtına respect verilebiliyordu, kendi yanıtına da; var olmayan yanıt kimliği 500 dönüyordu.
  3. Kendi incelemene respect verilebiliyordu (puan vermiyordu ama sayıyı ve `5c`'nin varsayılan sırasını şişiriyordu).
  4. Spoiler işaretli incelemenin yanıtları işaretsizdi; istemci yanıtları kapının arkasına alamıyordu.
  5. Puansız kayda inceleme metni, etiket ve Classic yazılabiliyordu (§9.3'e aykırı); puansız Classic damgası puanlayanlara "stamped an Instant Classic" bildirimi de yolluyordu.
  6. "On the night" izleyenin saat dilimiyle ve kaydın `created_at`'iyle hesaplanıyordu: aynı inceleme izleyene göre farklı görünüyordu; yıldızsız kaydedilip ertesi gün puanlanan kayıt "gecesinde puanladı" sayılıyordu; puansız kayıt bile "on the night" olabiliyordu.
  7. Banlı hesabın incelemesi ve yanıtları `5c`, `4a`, maç sayfası, ana akış ve sayılarda görünmeye devam ediyordu (kişi listeleri Faz 3'te zaten banlıları dışlıyor).
  8. "Your reviews" için uç yoktu; `/diary`'nin `view` parametresi kullanılmıyordu, kayıtlarda respect/yanıt sayısı yoktu.
  - Sorun bulunmayanlar: inceleme girişin alanı (ayrı nesne yok); `5c` sırası beyaz liste (respected / newest / lowest), takip edilenler ayrı bölümde üstte, yalnız herkese açık; `4a` yanıtları düz liste, `reply_to` kullanıcı adı, `is_author`, en çok respect sırası; respect puanı yazara, inceleme başına 50 tavanı; erişim kontrolü `4a`/like/yorum uçlarında; özet yüzeylerde spoiler metni Faz 2'den beri maskeli.
- **Yapılan backend değişikliği:**
  - `POST /reviews/{id}/comments`: adres yalnız yazar ya da bu dizide yanıt yazmış (banlı olmayan) biri; aksi `422 Reply to the author or someone in this thread`, bildirim yazılmaz.
  - `POST /comments/{id}/respect`: yanıt yoksa ya da yazarı banlıysa `404`; incelemeye erişim kontrolü (`403`); kendi yanıtına `403`.
  - `POST /reviews/{id}/like`: kendi incelemene `403 You cannot respect your own review`.
  - `4a` yanıtları ve `GET /reviews/{id}/comments` her yanıtta `spoiler` (incelemeden miras).
  - `rankit_log`: puansız kayda yeni inceleme metni, yeni etiket ya da Classic `422 Rate the match first`. Puanı kaldırmak mevcut metni/etiketi silmez, istemcinin aynı metni/etiketi geri göndermesi reddedilmez, etiket kaldırmak serbest (POTM/respect ile aynı karar). Classic bildirimi yalnız puanlı kayıttan.
  - `_on_the_night`: ölçü yazarın puanlama ödülü (`rate_same_day`, puanın anında yazarın kendi saat dilimiyle hesaplanmış — serinin kuralı); ödül satırı yoksa (eski kayıt) ya da kayıt yeniden izlemeyse puanın anı (`rated_at`, yoksa `created_at`); puansız kayıt `false`. `5c` ve `4a` aynı yardımcıyı kullanıyor.
  - Banlı yazar: `_require_review_access` banlı yazarın incelemesine `404`; `5c` (`total`, liste, `replies`), maç sayfası (`reviews`, `comments`, `review_count`), `4a` yanıtları, ana akış banlıları dışlıyor.
  - `GET /diary?view=reviews`: hesabın kendi incelemeleri, tüm maçlar (gizli olanlar dahil); tüm kayıtlara `respect` ve `replies` sayıları eklendi.
- **Test:** yeni `tests/test_rankit_reviews.py` (9 test). `tests/test_rankit_*.py` 169/169. 23 kural tek tek geri alındığında ilgili test kırmızı; dosya her seferinde bayt bayt geri yüklendi.
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): `4a` ve `5c`'de kendi incelemende / yanıtında respect elması gösterilmemeli ya da pasif olmalı (API `403` döner). Yanıt eylemi `reply_to` olarak yalnız yazarı ya da dizide görünen bir yanıtçıyı gönderebilir. Yanıtlarda `spoiler: true` ise yanıt gövdeleri de TAP TO SHOW kapısının arkasında. `15c` composer puan yokken kapalı (§9.3; API `422 Rate the match first`). 6b "Your reviews" → `GET /diary?view=reviews` (`respect`, `replies`, `visibility` ile).
  - `4a` inceleme sayısındaki respect'ler banlı kullanıcıların verdiği respect'leri de sayıyor (yalnız içerik gizlendi, oylar değil).
  - "On the night" eski kayıtlarda (ödül satırı olmayan) hâlâ izleyenin ofsetiyle hesaplanıyor; yazarın saat dilimi saklanmıyor.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Frontend pass — Aşama 5 kısmi: 15a, 15b, 15d ve web 15y / 2026-09-22

- **Kaynak ve sıra:** `BUILD.md` §9.2–9.4 / §10.1–10.2, Bölüm IV Aşama 5; mobil `RankIt Redesign.dc.html` `15a`, `15b`, `15d`; web `RankIt Web.dc.html` `15y`. Aşama 5 ve web Aşama 14 **tamamlandı olarak işaretlenmiyor**; bu geçiş onlara bağımlı yüzeyleri hazırlıyor.
- Backend'in yeni `lineups[].starters/bench` alanlarından yalnız `played: true` ve doğrulanmış `player_id` taşıyan oyuncular `playedPlayers()` ile seçiliyor. Sezon kadrosu yedek oy havuzu olamaz. Mobil kayıt isteği, geçersiz/stale POTM ve respect kimliklerini de gönderim öncesi ayıklıyor. Oyun kadrosu yoksa oy seçicisi açılmıyor.
- Mobil `15b` ve web `15y` için ortak `PlayersPicker`: bir kadro listesi, takım sekmeleri, `STARTED`/`CAME ON`, oyuncu başına 48px POTM ve Respect kontrolleri, başlıkta `POTM n / 1` ile `RESPECT n / 2`, tek POTM ve en çok iki Respect; üçüncü seçim uygulanmıyor. Mobilde alttan sheet, webde 560px ortalı diyalog. Var olan iki ayrı seçici kaldırıldı. Alt alta modal yığını `useDialog` ile; webin Inspector animasyonunun `position: fixed` çocuğunu kırpmaması için portal kullanılıyor. Web oyu hâlâ anında API'ye kaydediyor; çift isteği engelleme ve başarısız POTM'de önceki respect'i geri alma eklendi.
- Mobil canlı `15d`: Match sekmesinde bir takımın o anda sahadaki ilk 11'i, oyuna girenler `sub_in` dakikası ve `replaced` bilgisiyle; mevki için yalnız API'nin `position_code`/`position` alanları. Anlar/nabız bu listede yok; `Watch with your Companion` aynı maçın Companion sekmesine gider. Kadro henüz yoksa da Companion CTA'sı erişilebilir.
- Mobil tam zaman puansız `15a`: `YOUR ENTRY / NOT LOGGED`, `How was it?`, 40px yıldızlar ve tek dashed açıklama; Classic, oyuncu ve inceleme kontrolleri puan olmadan hiç gösterilmiyor. Alt CTA pasif. Web Inspector'da da Classic, inceleme ve kaydetme kontrolü puan yokken gizlendi; fakat web `15x` davet yerleşimi ayrıca ele alınacak.
- **Doğrulama:** `playedPlayers` ile heat ve state odaklı 25 Node testi geçti; Vite production build ve yeni bileşenler + geniş JSX için mevcut eski kurallar hariç hedefli ESLint geçti. Son ekrandaki `15a` koşulundan sonra tekrar build/test/diff kontrolü yapılacak. Tarayıcı görsel kabulü bu geçişte erişim sınırı nedeniyle yapılmadı; ölçülmüş mobil/web görünüm olarak kabul edilmedi.
- **Kalan bağımlılıklar:** Mobil rated `2g` hâlâ üç ayrı giriş bloğu ve kaynak §9.4'teki `YOUR ENTRY` + `TAGS & PLAYERS` sırasına tam uymuyor; web `15y` açılış yolları ve `15z` in-panel composer ayrımı tamamlanmadı. `15d` için gerçek canlı veri ve dar ekran ölçümü, XI-announced `2h` varyantı, scheduled `2h`, finished `2f`/`2g`, Companion `5a/5b/6d` ve inceleme `15c` ayrıca doğrulanacak. Mevcut backend Phase 6/7 sözleşmesi ve kullanıcı profil/inceleme görünürlükleri sonraki frontend geçişidir. Commit, push, deploy ve APK yapılmadı.
- **Son kod doğrulaması:** 25/25 Node testi, Vite production build, yeni bileşenler ile geniş JSX dosyalarında eski kurallar hariç hedefli ESLint başarılı; `git diff --check` içerik hatası vermedi (yalnız Git CRLF uyarısı). Üretilen CSS içinde ortak picker kuralları webin de yüklediği `rankit-*.css` paketinde; mobil canlı kadro kuralı ayrı `RankItPrototype-*.css` paketinde. Görsel tarayıcı kabulü hâlâ eksik.

#### Backend pass — Phase 8 (The shell) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 8 (header 64 / nav 73, `RANK` elması quick-rate `3j`'yi açar), CODE.md §7 ("Auth, profile, settings, preference ve account-scoped verilerin endpoint'lerde karışmadığı": `2r`, `4g`, `6b`), CODE.md §8 kural 4 (boolean zorlaması "false" metnini true saymaz), §7.2 (seri, dinlenme gecesi), §12.1, §13.2; HANDOFF §4.9.2 (`6b`: "Counts come from actual account data", watched / classics / streak), §4.9.3 (`4g` → `4h` → `2r`, "Do not silently create a separate RankIt identity"). Ekranlar: `2r`, `4g`, `4h`, `6b` ("184 following · 96 followers" kendi profilinde), `3j`.
- **İncelenen endpoint / tablo:** `get_optional_user` / `_actor_id` (JWT, ban, `IS_PROD`, demo kullanıcı), `WS /ws/watchalong/{id}` kimliği, `GET|POST /onboarding`, `PUT /follows/sources`, `GET|PUT /settings`, `GET /profile`, `GET /members/{id}`, `GET /people`, `GET /people/discover`, `GET /quick-rate`, `GET /rank`, `rankit_rank.streak_for`; `users`, `rankit_user_settings`, `rankit_follows`, `rankit_diary_entries`; kullanıcı silinince RankIt tablolarının `ON DELETE CASCADE` durumu; süreç içi önbellek taraması; frontend `rankitPrefs.js` (okundu, değiştirilmedi).
- **Bulgu:**
  1. İmzası geçerli ama hesabı silinmiş bir token (token süresi boyunca geçerli kalıyor) yazmalarda FK hatasıyla 500, `/profile`'da boş kullanıcıda 500 veriyordu.
  2. `PUT /settings` değeri truthy'liğe göre yazıyordu: `{"alerts_running_hot": "false"}` uyarıyı AÇIK kaydediyordu (CODE.md §8 kural 4).
  3. `6b` / `3i` / `9a` / `9b` Classic sayısı `SUM(classic)`: yeniden izleme aynı maçı iki kez sayıyordu, puansız eski Classic kayıtları da sayılıyordu. Ortalama tüm kayıtlar üzerinden (rewatch puanı iki kez ağırlık); topluluk puanı ve zevk ortaklığındaki "maç başına son puan" kuralıyla ayrışıyordu.
  4. Banlı üyenin profili (`/members/{id}`) açılıyordu; kişi listeleri ve (Faz 7'den beri) inceleme yüzeyleri onu zaten dışlıyor.
  5. `3j` quick-rate herhangi bir kaydı olan maçı listeden düşürüyordu: gece yıldızsız kaydedilen maç bu gece puanlanıp seriyi tutamıyordu. Bu gece zaten gecesinde bir maç puanlanmış olsa da `at_risk: true` dönüyordu. `tz_offset` sınırsızdı (`/rank` sınırlıyor).
  - Sorun bulunmayanlar: RankIt kimliği Primary Arch `users` tablosu ve JWT — ayrı kimlik yok; demo kullanıcı yalnız prod dışında; prod'da anonim yazma `401`; banlı token anonim sayılıyor; soket kullanıcının varlığını doğruluyor; ilk kurulum `done` bayrağı hesapta (başka cihazda yeniden sorulmuyor), Skip de kapatıyor, ilk kurulum takip silmiyor, düzenleyici (`/follows/sources`) tam küme; ayarlarda listede olmayan anahtar yazılmıyor; süreç içi önbellek yok (hesaplar arası sızıntı yolu yok); kullanıcı silinince RankIt tablolarının hepsi `CASCADE`; başka üyenin takipçi sayısı hiçbir uçta yok (§13.2) — kendi `6b` sayıları tahtada var; spoiler/skor tercihleri cihazda tutuluyor (frontend'in bilinçli kararı, `rankitPrefs.js` başlığı).
- **Yapılan backend değişikliği:**
  - `_actor_id`: token'daki hesap yoksa `401 Sign in again`.
  - `PUT /settings`: yalnız gerçek JSON boolean; aksi `422 <anahtar> must be true or false`, önce hepsi doğrulanır (yarım yazılmış ayar kümesi kalmaz).
  - `GET /profile`, `GET /members/{id}` (görünür kayıtlar üzerinden), `GET /people`, `GET /people/discover`: `classics` = puanlı kaydında Classic damgası olan farklı maç sayısı; `avg_rating` = maç başına son puanın ortalaması.
  - `GET /members/{id}`: banlı üye `404`.
  - `GET /quick-rate`: "puanlanmamış" = puanlı kaydı yok (yıldızsız izleme kaydı maçı listeden düşürmez); `tonight_counted` alanı; `at_risk` bu gece zaten sayıldıysa `false`; `tz_offset` −840…840 dışında `422`.
  - `streak_for` (dolayısıyla `/rank`): `tonight_counted`.
- **Test:** yeni `tests/test_rankit_shell.py` (5 test; quick-rate testi RankIt gününün başlangıcına göre kurulduğu için her saatte belirleyici). `tests/test_rankit_*.py` 174/174. 12 kural tek tek geri alındığında ilgili test kırmızı; dosyalar bayt bayt geri yüklendi. (Bir koşuda `test_rankit_diary_merge.py` `frontend/dist/assets` eşzamanlı bir frontend build'i sırasında bulunamadığı için hata verdi; dizin geri gelince 2/2 geçti — değişiklikle ilgisiz.)
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): yazmalarda `401 Sign in again` → giriş ekranı (süresi dolmuş token okumalarda sessizce anonim sayılır, `get_optional_user` paylaşılan auth; değiştirilmedi). `3j` → `tonight_counted` / `at_risk`. `rankitPrefs.js` anahtarı (`rankit:prefs`) hesaba bağlı değil: paylaşılan cihazda hesap değişince tercihler taşınıyor — cihaz tercihi olması bilinçli karar, hesap ayrımı istenirse anahtara hesap eklenmeli.
  - `6b` avatarı ve görünen ad için hesap modelinde veri yok (`users`'da yalnız `username`, `created_at`); arayüz baş harfleri kullanıyor, uydurulmadı.
  - Bildirim kanalı tercihleri (HANDOFF: Heat / Streak / Social / Collections) sunucuda yok ve push teslim altyapısı yok; yalnız `alerts_running_hot` sunucu ayarı. Faz 9 (`3f`).
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Backend pass — Phase 9.1–9.3 (Profile / Standing, People, Competition Players) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 9 alt başlık 1–3: `6b` + `2p` (§14: 2p puan dökümü, pushed detail), `9a` / `9b` (§13.1 uyuma göre sıra, asla alfabetik; §13.2; §13.3 on ortak maç altında yüzde yok; §13.4 dört ilişki durumu), `2i` / `3c` / `3d` (§10.3: Players sekmesi POTM ile açılır — WON, SHARE; paylar `ink`, ısı rampası değil); §12.1 ("A like on your review" 2, inceleme başına 50 tavan), §5.5. Not: hiçbir HTML tahtasında WON / SHARE çizilmemiş (`3d` tahtası Goals / Assists / Minutes gösteriyor); CODE.md kaynak önceliği gereği BUILD §10.3 esas alındı.
- **İncelenen endpoint / tablo:** `GET /rank`, `GET /profile`, `POST /reviews/{id}/like` (respect puanı), `GET /people`, `GET /people/discover`, `PUT /people/{id}/follow`, `GET /competitions/{id}` (tablo), `GET /competitions/{id}/players`; `rankit_points` (`respect` satırı inceleme başına tek), `rankit_point_rules`, `rankit_potm_votes`, `rankit_match_lineup_players`, `rankit_player_stats`.
- **Bulgu:**
  1. Respect puanında hile açığı (Faz 7'de kaçmış): puan bloğu respect GERİ ALINIRKEN de çalışıyordu — geri almak yazara +2 ekliyordu; tek bir kişi ver / geri al tekrarıyla yazara incelemenin 50 puanlık tavanına kadar puan üretebiliyordu. Geri alınan respect'in puanı da hiç düşmüyordu.
  2. `2p` dökümü defterle tutmuyordu: `rate_late` (5 puan) dökümde yoktu; "likes on reviews" adedi satır sayısıydı — defterde inceleme başına tek satır olduğundan respect sayısı değil respect alan inceleme sayısı dönüyordu.
  3. `9a` / `9b`: on ortak maç altındaki herkes alfabetik sıralanıyordu (§13.1 "never alphabetically").
  4. `3d` yalnız sağlayıcının gol/asist cetvelini veriyordu; POTM (WON / SHARE) hiç yoktu.
  - Sorun bulunmayanlar: `6b` kimlik / sayaçlar (Faz 8'de düzeltildi), `2p` kademe ve bir sonraki kademe (`tier_for`: `next_name`, `next_at`, `progress`), seri; `9a` / `9b` başkasının takipçi sayısı yok, on maç altında `pct: null`, ilişki durumu `following` + `follows_you` (dört durum türetilebilir), banlı ve kendini takip reddi; `3c` hafta listesi.
- **Yapılan backend değişikliği:**
  - `_sync_review_respect`: respect defter satırı incelemenin ŞU ANKİ respect'lerinden hesaplanıyor (`min(respect × birim, 50)`, yazar hariç); geri alınan respect puanını da geri alıyor, sıfırsa satır siliniyor. Ver / geri al ile puan üretilemiyor.
  - `GET /rank` → `breakdown`: `rate_late` eklendi (kutular tahtadaki dört tür; arayüz türe göre buluyor, fazlası görünmez), respect adedi = respect puanı / birim. Döküm toplamı `rank.points` ile eşit.
  - `9a` / `9b`: sıra yüzde → ortak maç sayısı (eşik altında da) → ad (yalnız son eşitlik bozucu).
  - `GET /competitions/{id}/players`: yeni `stat=potm` (varsayılan). Yalnız POTM oyu ≥20 olan maçlar; kazanan maç kartındaki kuralla aynı (en çok oy, eşitlikte ad). Satır: `won`, `share` (oyuncunun sayılan maçlarında onu seçenlerin ortalama payı — kadroda oynayıp oy almadığı eşik üstü maç 0 sayılır), `matches` (örneklem), `votes`, `rank`; yanıtta `min_votes: 20`. Hiç oy almamış oyuncu listelenmez. Eşik üstü maç yoksa `potm` `available` listesinde yer almaz, sağlayıcının ilk cetveline düşülür (boş sekme uydurulmaz).
- **Test:** yeni `tests/test_rankit_standing_people.py` (6 test). `tests/test_rankit_*.py` 180/180. 12 kural tek tek geri alındığında ilgili test kırmızı; dosya bayt bayt geri yüklendi.
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): `3d` açılış sekmesi `available[0]` (`potm` varsa o); satırda `won` ve `share` (pay çubuğu `ink`), `matches` örneklem notu için. `2p` kutuları `breakdown` içinde türe göre (`rate_late` görünmez).
  - "A season followed end to end" (300) ödülü hiçbir yerde verilmiyor; `2p` kutusu dürüstçe 0. Ölçütü tanımsız (takip + sezonun her maç haftasında puan mı?) — sahibin kararı gerekiyor.
  - `2i` tablosu kendi maç verimizden türetiliyor: puan silme cezaları ve ikili averaj (La Liga / Serie A) uygulanmıyor, sıralama puan → averaj → atılan gol → ad. Resmi tablo sağlayıcıdan (FotMob tablo ucu) ayrı bir senkronla alınabilir.
  - Respect'i banlı kullanıcıdan gelse de sayılıyor (Faz 7 notu); respect puanı eski birikmiş satırlarda bir sonraki respect / geri almaya kadar eski değerde kalır.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Backend pass — Phase 9.4 (The Hunt) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 9 alt başlık 4: "The Hunt: index (`2m`) and a collection (`2n`), honest about unscheduled fixtures"; §24 (liste kullanıcının, koleksiyon ürünün: ilerleme halkası ve tamamlama ödülü; bileşenler birleştirilmez), §12.1 ("A season followed end to end" 300), §5.5, §29 (kilitli skin açılış anı kapsam dışı); HANDOFF §4.9.5. Ekranlar: `2m` ("38% · 4 collections active · 21 of 55 collected. Two are one night from closing", "Every London Derby 7 of 12", "Classics of 2026 · Community-voted", "The 38 · FINISHING THIS UNLOCKS TURF", "Olympic Finals 2028 · Opens when the schedule is published"), `2n` ("7 OF 12", "COLLECTED Season order", "Next in line", "Three fixtures are unscheduled"), `6a` ("8/12 London Derby +1"), `3e` ("COLLECTIONS · Every London Derby 7 of 12 · includes Arsenal").
- **Sahibin kararı (2026-09-22):** koleksiyonlar kural + admin; sezon ödülü = takip ettiğin kulübün o lig sezonundaki tüm maçlarını puanlamak.
- **İncelenen endpoint / tablo:** koleksiyon için hiçbir tablo, uç ya da veri yoktu; `rankit_log` yanıtında `collection: null` (Faz 4), arama "COLLECTIONS" bölümünü kullanıcı listeleriyle dolduruyordu (§24'e aykırı), `season` ödülü (300) hiçbir yerde verilmiyordu. FotMob lig fikstürü (`fixtures.allMatches`) tüm sezonu veriyor; NBA takvimi NBA Cup eleme maçlarını tarihsiz bırakıyor (yerel veride 2026-27: 1200 / 1230).
- **Yapılan backend değişikliği:**
  - Yeni tablolar: `rankit_collections` (`kind`: `curated` / `club_season` / `classics_year`; `declared_total`, `opens_note`, `reward`, `active`; kural koleksiyonları için kısmi tekil indeksler) ve `rankit_collection_items` (yalnız seçkiler). Katalog temizliği seçki maçlarını silmez (`USER_CONTENT_MATCH_IDS`).
  - Yeni modül `api/rankit_hunt.py`: `club_season` = kulübün bir lig sezonundaki tüm maçları; beklenen sayı çift devreli liglerde 2 × (takım − 1) (senkronun `league` dediği futbol ligleri + EuroLeague normal sezonu), NBA'de 82; bilinen fikstür bundan azsa fark `unscheduled`. `classics_year` = o takvim yılının Instant Classic'leri (maç kartıyla aynı kural; Classic payı artık tek tanım `rankit_rank.CLASSIC_SHARE`). `curated` = sahibin seçkisi, toplam `declared_total` (tarihsiz fikstür sayıya girer, uydurulmaz). Toplanan = puanlanan üye maçlar (yıldızsız kayıt sayılmaz).
  - `GET /collections` (`2m`): seçkiler + takip ettiğin kulüplerin güncel lig sezonları + bu yılın Classic'leri; sıra aktif (kalan azdan çoğa) → tamamlanan → açılmamış; `summary: {collected, total, pct, active, one_left}` (açılmamışlar toplama girmez).
  - `GET /collections/{id}` (`2n`): `collected_matches` (sezon sırası), `open_matches` (oynandı, puanlanmadı), `upcoming_matches`, `unscheduled`, `next`, `status` (`active` / `complete` / `not_open`), `reward` (yalnız metin). Pasif seçki `404`.
  - Admin: `GET|POST /admin/collections`, `DELETE /admin/collections/{id}` (yalnız seçkiler; maç listesi tam küme; `declared_total` maç sayısından küçük olamaz; olmayan maç `404`).
  - `rankit_log`: `collection` karosu — bu maçı içeren, avındaki en dolu koleksiyon; `delta` yalnız maç ilk kez puanlandıysa 1. `season_award: {points}` — takip ettiğin kulübün lig sezonunun her maçı puanlıysa 300; puan kaldırılıp sezon eksik kalırsa ödül geri alınır (`points_revoked`'a eklenir).
  - `GET /search`: yeni `collections` (seçkiler başlıktan ya da içerdiği kulüpten `matched_team`; kulübün lig sezonları). `lists` ayrı kaldı.
- **Test:** yeni `tests/test_rankit_hunt.py` (7 test). `tests/test_rankit_*.py` 187/187. 18 kural tek tek geri alındığında ilgili test kırmızı (takip şartı mutasyonu ilk turda yeşil kaldı — test takip etmeyen kullanıcıya eksik bir sezon veriyordu; test tam sezonla yeniden yazıldı, kırmızı). Yerel NBA / EuroLeague verisinin kopyasında doğrulandı: 2026-27 her NBA takımı "The 82", 80 bilinen + 2 planlanmamış; EuroLeague "The 38".
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): `2m` → `GET /collections` (`summary`, sıra sunucudan), `2n` → `GET /collections/{id}` ("N fixtures are unscheduled" = `unscheduled`), `6a` koleksiyon karosu → `collection` (null ise karo yok), `3e` COLLECTIONS bölümü `collections` (kullanıcı listeleri `lists`). Kural koleksiyonlarının başlık/alt başlığı İngilizce üretiliyor ("The 82", "Every Arsenal match in the Premier League", "Classics of 2026") — yapılandırılmış alanlar (`team`, `competition`, `year`) da dönüyor.
  - Seçki içeriği yok: "Every London Derby" gibi koleksiyonları sahibin admin ucundan eklemesi gerekiyor; admin paneli arayüzü yok (yalnız API).
  - NBA Cup finali oynayan takımlarda 2025-26 sezonu 83 maç ("The 83"): Cup finali normal sezon sayılmaz ama o turnuva-sezonunda oynanmış gerçek bir maç; sayıya giriyor.
  - Koleksiyon bildirimleri ("Collections only when one match from completion", kanal varsayılan kapalı) Faz 9.5 bildirimlerle birlikte.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı; yeni tablolar canlıya yalnız deploy ile (idempotent `CREATE TABLE IF NOT EXISTS`).

#### Backend pass — Phase 9.5 (Search, Notifications, Settings, Lists, Member profile) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 9 alt başlık 5: `3e` arama, `13a` / `3f` bildirimler (§15: dört kanal, puanlamadığın maçı hiçbir bildirim bozmaz, üç spoiler derecesi), `3g` ayarlar, `3h` listeler ("a list is a shelf you curate"), `3i` başkasının profili; §24 (liste ≠ koleksiyon); HANDOFF bildirim kanalları (Heat / Streak / Social / Collections, "Keep preferences truthful if delivery is unavailable"). `3f` tahtası: "Every London Derby is one match from closing. Crystal Palace vs Arsenal, Sunday."
- **İncelenen endpoint / tablo:** `GET /notifications` (`rankit_notify.feed`: `_hot_match`, kapanış durumu, `_stored`), `POST /notifications/read`, `GET|PUT /settings`, `GET /search`, `GET|POST /lists`, `GET /lists/{id}`, `POST /lists/{id}/items|save|respect`, `GET /members/{id}`; `rankit_notifications`, `rankit_lists`, `rankit_list_items` (`UNIQUE(list_id, position)`), `rankit_list_respect`, `rankit_list_saves`.
- **Bulgu:**
  1. `3f`'nin "bir maç kala kapanıyor" durumu kullanıcının LİSTELERİNDEN üretiliyordu (§24'e aykırı: liste bir raf, tamamlanacak bir şey değil; tahtadaki örnek bir The Hunt koleksiyonu).
  2. Bildirim öğelerinde izleyenin o maçı puanlayıp puanlamadığı yoktu; `13a`'nın üç spoiler derecesini istemci seçemiyordu (yükte skor/puan zaten yok — Faz 4).
  3. Listeler oluşturulduktan sonra düzenlenemiyordu: başlık / açıklama / görünürlük / sıralı-sırasız, maç çıkarma, sırayı değiştirme ve listeyi silme uçları yoktu (`3h` "ordered by how much I'd rewatch").
  4. Olmayan maç kimliğiyle liste oluşturmak ya da maç eklemek FK hatasıyla 500 veriyordu.
  5. Banlı sahibin listesi keşifte, aramada ve kendi yüzeyinde görünüyordu; kendi listene respect verilebiliyordu (Faz 7'deki inceleme kuralıyla tutarsız). Maç eklemek listenin `updated_at`'ini güncellemiyordu (keşif sırası bayat).
  - Sorun bulunmayanlar: `3e` bölümleri ve kullanıcıya özel satırlar (Faz 3; koleksiyonlar Faz 9.4'te eklendi); `3g` sunucu ayarı `alerts_running_hot` (tahtadaki tek uyarı anahtarı; diğer satırlar cihaz tercihi — Faz 8), "Competitions & clubs · N followed" = `following_sources`; `3i` (Faz 3 / 8: görünür kayıtlar, on maç altında yüzde yok, kademe, raf); "running hot" puansız yük, 20 puan eşiği; classic olayı puanlamadığın maçta gizli.
- **Yapılan backend değişikliği:**
  - `rankit_notify._closing_collection`: kapanış durumu The Hunt'tan — aktif, bir maç kalmış seçki ya da kulüp sezonu (yılın Classic'leri dinamik, "kapanmaz"); kalan maç bilinmiyorsa (tarihsiz) durum yok. Öğe: `collection_id`, `collection_title`, `match_id`, `match`, `starts_at`, `collected`, `total`. Liste tabanlı durum kaldırıldı.
  - Her maça bağlı bildirim öğesinde `viewer_rated` (maçsız öğede `null`); durumlarda `false`.
  - Yeni uçlar (yalnız sahip): `PUT /lists/{id}` (başlık / açıklama / `ranked` / görünürlük; gönderilmeyen alan değişmez), `DELETE /lists/{id}`, `DELETE /lists/{id}/items/{match_id}` (sıralar 1..n yeniden yazılır), `PUT /lists/{id}/order` (listenin tam kümesi; eksik / fazla / tekrar `422`). Sıralar `UNIQUE(list_id, position)` çakışmasın diye önce negatife alınıp yeniden yazılıyor.
  - Olmayan maç `404 Match not found: N` (oluştur + ekle); `match_ids` en fazla 500.
  - Banlı sahibin listesi keşifte, aramada ve `GET /lists/{id}`'de yok; kendi listene respect `403`; maç eklemek / düzenlemek `updated_at`'i günceller.
- **Test:** yeni `tests/test_rankit_lists.py` (6 test); `tests/test_rankit_notify.py` bellek içi şemaya koleksiyon tabloları eklendi, eski "liste bir maç kala" testleri yeni kurala göre yeniden yazıldı (liste artık uyarmaz; seçki uyarır; iki maç kala / kapanmış / tarihsiz kalan maçta uyarı yok) ve `viewer_rated` testi eklendi. `tests/test_rankit_*.py` 195/195. 11 kural tek tek geri alındığında ilgili test kırmızı.
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): `3f` / `13a` kapanış öğesi artık `collection_title` / `collection_id` taşıyor (`list_title` / `list_id` değil) ve The Hunt `2n`'ye derin bağlanmalı; spoiler derecesi `viewer_rated` ile. `3h` düzenleme / çıkarma / sıralama / silme yeni uçlarla.
  - Push teslim altyapısı yok: HANDOFF'taki dört kanal (Heat / Streak / Social / Collections) Android bildirim kanalları; uygulama içi akış bunlardan bağımsız. "Streak at 22:00 only after actual watching that day" hatırlatması ve kanal tercihleri push gelince; o zamana kadar ayarlar ekranı teslim edilemeyen bir kanalı açık göstermemeli.
  - `3i` görünen ad ("Deniz Yalçın") için hesap modelinde veri yok (Faz 8 notu).
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Backend pass — Phase 9.6–9.7 (Skins / share, First run) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 9 alt başlık 6: skinler (`2j`), paylaşım (`2k` portrait 4:5, `2l` wide 16:9) — §4.2 (skin yalnız koleksiyon kartını ve paylaşım görselini boyar; Gilt yalnız Classic; Turf "finish a collection", Floodlight "a 7-night streak"), §4.3; HANDOFF ("unlock conditions require actual product rules, not fabricated thresholds", "Streaks unlock skins (7 nights → Floodlight)", sekiz adlandırılmış skin; BUILD kod bloğu Stub dahil dokuz sayıyor — BUILD önceliğiyle dokuzu da tutuldu). Alt başlık 7: `4g` → `4h` → `2r`, spoiler kalkanı burada sorulur (§3). `2j` tahtası: "All 7 Earned Locked … FINISH A COLLECTION Turf · 7-NIGHT STREAK Floodlight · A skin paints this card and its share image. It never touches app chrome."
- **İncelenen endpoint / tablo:** skin için hiçbir alan, uç ya da kural yoktu (frontend `CollectibleResult.jsx` skini "being prepared" diye kapalı tutuyor); `rankit_diary_entries`, `rankit_user_settings`, `rankit_rank.streak_for` (`best`), The Hunt (Faz 9.4); ilk kurulum: `GET|POST /onboarding`, `PUT /follows/sources` (Faz 8'de denetlendi).
- **Bulgu:**
  1. Kartın skini sunucuda tutulmuyordu: seçilen skin başka cihazda, rafta ve başkasının rafında (`3i` RECENT SHELF) görünemezdi.
  2. Turf ve Floodlight kilitlerinin kuralı hiçbir yerde uygulanmıyordu; HANDOFF uydurma eşik istemiyor, BUILD'in iki kuralı artık ölçülebilir (koleksiyonlar Faz 9.4'te geldi, seri zaten vardı).
  - Sorun bulunmayanlar: ilk kurulum uçları (Faz 8: hesaba bağlı `done`, Skip kapatır, takip silinmez, ayrı RankIt kimliği yok); spoiler kalkanı cihaz tercihi (frontend'in bilinçli kararı) — ilk kurulumda sorulması arayüz işi; paylaşım görselleri istemcide çiziliyor.
- **Yapılan backend değişikliği:**
  - `rankit_diary_entries.skin` (idempotent ALTER; NULL = Default). `DiaryIn.skin` (None = dokunma, `"default"` = sıfırla); kilitli skin kazanılmadan `403 This skin is locked`, Gilt Classic olmayan kartta `422 Gilt is for Classic cards only`; Classic damgası kalkınca Gilt da kalkar.
  - `GET /skins?entry_id=` (`2j`): dokuz skin, `rule` (`classic` / `collection` / `streak` / null), `locked`, `available` (bu kartta seçilebilir mi), `selected`, `floodlight_nights: 7`.
  - Kilit kuralları: Floodlight = en iyi seri ≥ 7 gece; Turf = avındaki bir seçki ya da kulüp sezonunu tamamlamak (yılın Classic'leri dinamik, sayılmaz). Kazanılan kilit kalıcı (`rankit_user_settings` `skin:<id>`): seri kırılınca ya da puan kaldırılınca geri kilitlenmez. Kilit açılma ANI (kutlama) §29 gereği kapsam dışı.
  - `my_skin` (maç yanıtı), `/diary` kayıtlarında `skin`, `3i` rafında `their_skin`.
- **Test:** yeni `tests/test_rankit_skins.py` (5 test). `tests/test_rankit_*.py` 200/200. 10 kural tek tek geri alındığında ilgili test kırmızı.
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): `2j` → `GET /skins` (kilitli / bu kartta uygun), seçim `PUT /diary/{id}` `{skin}`; kart ve paylaşım görseli `my_skin` / `skin` / `their_skin` ile boyanır; uygulama kabuğu asla. `2k` / `2l` görselleri istemcide.
  - Bağlantı önizlemesi (16:9 "what a link preview needs") için sunucu tarafı paylaşım sayfası / OG görseli yok; paylaşım şu an metin. Ayrı bir iş.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Backend pass — Phase 10 (States) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 10 (§5.1 yükleme iskelet, §5.2 boş, §5.3 çevrimdışı, §5.4 dört hata durumu — "never discard work the user already did", §5.5 20 puan eşiği); HANDOFF §4.10 ("HTTP failure is not an empty collection … Only show 'That's all' when pagination confirms the end", "Never automatically replay an uncertain rewatch without server idempotency"), §5 ("End of list. A ruled THAT'S ALL 142"). Ekranlar: `3k`, `3l` ("OFFLINE — SHOWING YOUR LAST SYNC · Cached 3h ago · Your rating from tonight is saved on this phone").
- **İncelenen endpoint / tablo:** tüm liste uçlarının sayfalama/kesme davranışı (`/catalog`, `/matches/{id}/reviews`, `/people`, `/notifications`, `/search`, `/members/{id}`, `/diary`, `/watchlist`, `/lists`, `/collections`, `/quick-rate`); tüm toggle uçları (`/reviews/{id}/like`, `/comments/{id}/respect`, `/lists/{id}/save|respect`, `/matches/{id}/watchlist`, `/favorite`, `/follow`); `POST /reviews/{id}/comments`; `api/main.py` genel 500 işleyicisi; katalog temizliği (`src/rankit_sync.py`) ve maç silme yolları; frontend `rankitApi.js` ve `rankitOutbox.js` (okundu, değiştirilmedi).
- **Bulgu:**
  1. Toggle uçları tekrar edilince durumu tersine çeviriyordu: sonucu belirsiz bir respect / kaydet / izleme listesi isteğinin tekrarı işi geri alıyordu (§5.4).
  2. Yanıt yazma tekrar güvenli değildi: belirsiz bir gönderimin tekrarı ikinci yanıt ve ikinci bildirim doğuruyordu.
  3. Kesilen listeler "devamı var" demiyordu: bildirim akışı 40'ta, arama bölümleri 20'de, `3i` kayıtları 30'da sessizce kesiliyordu — istemci "That's all" diyemez / yanlış der.
  4. Canlı skorun tazeliği görünmüyordu: canlı döngü durursa "LIVE 73'" bayat kalır ve istemci bunu bilemezdi.
  5. Eski `POST /follow` `user` hedefini kabul ediyor ama `PUT /people/{id}/follow`'un kurallarını uygulamıyordu: kendini takip, banlı ya da olmayan hesabı, olmayan takım/oyuncu/turnuvayı takip (hayalet satır, FK yok).
  6. Canlıda yakalanmamış hatanın 500 mesajı Türkçeydi; RankIt istemcisi `detail`'i aynen gösteriyor (kullanıcıya görünen metin İngilizce olmalı).
  - Sorun bulunmayanlar: 500'ler JSON (`{"detail"}`); puan kuyruğunun yazmaları (diary / POTM / respect) sunucuda tekrar edilebilir (`client_entry_id` Faz 1, POTM upsert, respect tam küme); "Match 404 — the card is gone, the diary entry is not": katalog temizliği kullanıcı içeriği olan maçı silmez (`USER_CONTENT_MATCH_IDS`, Faz 9.4'te seçki maçları eklendi), başka maç silme yolu yok; oturum süresi dolunca yazma `401` (kuyruk `auth-required`); boş durumlar boş dizi döner, uydurma satır yok; `/catalog` `total`, `5c` / `9a` `next_offset`, quick-rate `catchup_total`.
- **Yapılan backend değişikliği:**
  - Toggle'lara isteğe bağlı istenen durum: gövdede `{"on": true|false}` (favori / takipte model alanı `on`) — aynı istek kaç kez gelirse gelsin sonuç aynı; bildirim ve puan yalnız durum gerçekten değişince. Gövdesiz çağrı eski davranış (tersine çevir). İşleyicilerde `body` parametresi `user`'dan sonra (konumsal çağıranlar bozulmaz).
  - `ReviewCommentIn.client_id` (8–64, `[A-Za-z0-9_-]`) + `rankit_review_comments.client_id` ve kullanıcı başına tekil kısmi indeks (idempotent ALTER): aynı kimlikle tekrar ilk yanıtın kimliğini `duplicate: true` ile döner, ikinci satır / bildirim yok; kimlik başka incelemeye aitse `409`.
  - `GET /notifications` → `has_more`; `GET /search` → `truncated: {matches, players, teams, members, lists, collections}` (bölüm sınırı `SEARCH_LIMIT = 20`); `GET /members/{id}` → `entries_has_more`.
  - Maç yanıtı → `live_updated_at` (canlı maçta canlı olay döngüsünün son yoklama damgası; canlı değilse `null`).
  - `POST /follow`: kendini takip `422`, banlı / olmayan hesap `404`, olmayan takım / oyuncu / turnuva `404`.
  - `api/main.py` canlı 500 mesajı İngilizce: "Something went wrong on our side. Try again in a moment."
- **Test:** yeni `tests/test_rankit_states.py` (5 test). `tests/test_rankit_*.py` 205/205. 15 kural tek tek geri alındığında ilgili test kırmızı (favori mutasyonu ilk turda yeşil kaldı — test yalnız yanıta bakıyordu; veritabanı sayımı eklendi, kırmızı). Bir ara durum: yanıt `client_id` indeksi sütunu ekleyen ALTER'dan önce kuruluyordu — mevcut veritabanında `init_db` "no such column" verirdi; indeks ALTER'ın arkasına taşındı (testler bunu yakaladı).
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): toggle'lar ve kuyruk tekrarları `{"on": …}` göndermeli; yanıt gönderimi `client_id` ile; "That's all" yalnız `has_more` / `truncated` / `entries_has_more` / `next_offset` false iken; canlı kartta `live_updated_at` eskiyse bayat işareti. İskelet / boş / 62% sönük çevrimdışı görünümü istemci işi.
  - Hata yanıtlarında makine okunur hata kodu yok (`detail` İngilizce cümle); "upload rejected" gibi durumlar HTTP koduna göre ayrılıyor (4xx kalıcı, 401 yeniden giriş, 5xx/ağ tekrar).
- Commit, push, deploy ve canlı veri değişikliği yapılmadı; yeni sütun/indeks canlıya yalnız deploy ile (idempotent).

#### Frontend pass — Aşama 5 `2g` / `2h` ve Aşama 7 inceleme uyumu (kısmi) / 2026-09-22

- **Kaynak:** `BUILD.md` §9.1–9.4, §10.2, §27; mobil `RankIt Redesign.dc.html` `2g`, `2h`, `15b`, `15d`; web `RankIt Web.dc.html` `15y`. Claude'un bu dosyaya kaydettiği backend Phase 5 (kadro/oy), Phase 7 (kendi respect yasağı, spoiler yanıtları), Phase 10 (`on` ile tekrara dayanıklı toggle) sözleşmeleri. Aşama 5/7/10 tamamlandı sayılmıyor.
- **Mobil `2g`:** bitmiş ve puanlanmış maçın Community sırası `YOUR ENTRY` (yıldızlar, Classic, inceleme ve seçenekleri) → `TAGS & PLAYERS` (etiketler, kadrodan oyuncu seçici ve kaydetme) → sayısal kalabalık hükmü. Isı ve Classic yüzdesi gerçek 20+ puan eşiğine, POTM adı 20+ POTM oyuna bağlı; daha az oyda sayı yerine açık yetersizlik metni. `YOUR ENTRY` yıldızları beyaz; altın yalnız Classic. Var olan inline inceleme akışı korunuyor; tam `15c` composer hâlâ ayrı iş.
- **Mobil `2h`:** yayıncı adı yalnız bölgeye özel yayıncı sorgusundan; kontrol ediliyor / bilgi yok / bölge dışı durumları ayrıldı, maçın eski genel `broadcaster` metni yedek olarak gösterilmiyor. Kadro ilanı yoksa sezon kadrosu ilk 11 gibi sunulmuyor. İlan edilmiş yaklaşan maçta Companion ana CTA, watchlist ikincil. Canlı `15d` kadro/oyuncu CSS'i yeni stil dosyası açmadan mevcut `rankit-v030.css` içine taşındı; ortak `15b` / web `15y` seçici CSS'i zaten her iki girişin yüklediği `rankit.css` içine taşındı. Geçici iki yeni CSS dosyası kaldırıldı (§27 beş katman kuralı).
- **İnceleme uyumu:** oturum sahibi kendi incelemesi/yanıtına respect veremez (`ReviewFeed`, `5c`, `4a`, web makalesi). Kimlik varsa `user_id`, eski yanıt bu alanı taşımıyorsa benzersiz kullanıcı adı eşlenir; oturum bilinmiyorsa sahiplik uydurulmaz. Spoiler inceleme açılmadan inline/web yanıtları açılmaz. İnceleme ve yanıt respect isteklerinde açık `{"on": true|false}` kullanılır; belirsiz yanıt sonrası tekrar tersine çevirmez. `reviewIdentity` için iki Node testi eklendi.
- **Doğrulama:** 375×812 yerel mobil `2g` tarayıcı kontrolünde blok sırası ve yıldız/Classic renk bütçesi görüldü; beş puanlı demo maçında yetersiz oy kapısı göründü. Yerel API süreci mevcut backend kaynak kodundan eski yanıt verdiği için yeni backend ile uçtan uca kabul olarak işaretlenmedi; frontend ayrıca POTM oy sayısını kapılar. Vite production build, 33/33 Node testi ve hedefli ESLint (mevcut eski üç kural istisnasıyla) geçti; `git diff --check` içerik hatası yok (Windows satır sonu uyarıları). Üretilen CSS paketleri ortak picker'ı ve mobil kadroyu içeriyor.
- **Kalan:** `2f` olaylı tam zaman, `15c` inceleme composer, `2h` gerçek XI/canlı veri örneği, web `15x/15z`, Companion `5a/5b/6d`, Phase 8–10'un diğer frontend bağımlılıkları. Kimlik taşımayan girişsiz yerel demo için kendi respect düğmesinin güvenilir sahiplik ayrımı henüz yok; oturumlu Primary Arch kullanıcılarında kontrol çalışır. Backend'in yeni `client_id`, diğer `on` toggle'ları, `has_more` ve `live_updated_at` sözleşmeleri ayrıca bağlanacak. Commit, push, deploy, APK yapılmadı.

#### Backend pass — Phase 11 (Accessibility, API payı) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 11 (sheet'ler gerçek diyalog — frontend işi), §6 ("Heat never as colour alone — the number ships with it, always"); CODE.md §7 ("API'de erişilebilir isimleri bozan gereksiz/eksik team ve competition alanları kontrol edilir; frontend erişilebilirliği bu fazın yerine geçmez"). `3f` tahtası metni tam adlarla kuruyor: "Arsenal vs Tottenham is the highest-rated match…", "Crystal Palace vs Arsenal, Sunday".
- **İncelenen endpoint / tablo:** takım etiketi taşıyan tüm yükler (`_team`, `MATCH_SELECT`, `/home` akışı, `/diary`, `/members/{id}`, `/notifications`, The Hunt `_match_line`, `/competitions/{id}` tablosu, `/competitions/{id}/players`, `/search`, maç yanıtı `players` / `lineups`), canlı dakika (`rankit_live_sync` yazımı, `_match_dict.live_minute`, companion `minute`), ısı alanları (`community_rating` / `rating_count`, `expected_heat` / sayaçlar, nabız değeri / okumalar, POTM `share`); `rankit_teams` verisi (yerel: boş kısa ad yok, boş turnuva adı yok).
- **Bulgu:**
  1. Bildirim metni (`match`) yalnız kısa adlardan kuruluyordu ("ARS vs TOT"): ekran okuyucu harf harf okur, tahta tam ad kullanıyor.
  2. Canlı dakika FotMob'un görünmez yön işaretleriyle ve tipografik tırnakla saklanıp aynen dönüyordu (`73` + U+200E + U+2019 + U+200E): ekran okuyucunun okuduğu ve kopyalanan metne görünmez karakter sızıyor, tırnak "right single quotation mark" diye okunuyor.
  3. `3i` üye kayıtları ve maç yanıtındaki sezon kadrosu (`players[].team`) yalnız kısa takım adı taşıyordu.
  - Sorun bulunmayanlar: `_team` her kartta `name` + `short` + arma (alt metin için ad yanında); kısa adlar sağlayıcının editoryal kısa adı, yoksa kelime sınırında kesilmiş tam ad (Faz 1; yerelde boş kısa ad yok); ısı her yerde ya sayı ya da `null` + sayaç (`TOO FEW RATINGS` için) — renk/kademe kodu tek başına hiçbir yükte yok; oyuncu mevkileri tam kelime (Faz 5); POTM payı sayı. "Running hot" bildiriminin sayısız olması bilinçli (puanlanmamış maç, §15).
- **Yapılan backend değişikliği:**
  - `rankit_live_sync.clean_minute`: yön işaretleri (U+200E/200F, U+202A–202E, U+2066–2069) atılır, tipografik tırnak/prime `'` olur, boşluklar silinir — "73'", "45+2'", "HT". Canlı döngü temiz yazıyor; eski satırlar için `_match_dict.live_minute` ve companion `minute` okurken de temizleniyor.
  - Bildirimlerde `match` artık tam adlar ("Tottenham Hotspur vs Arsenal"), kısa biçim `match_short` (olaylar, "running hot", koleksiyon kapanışı).
  - `/members/{id}` kayıtlarına `home_name` / `away_name`; maç yanıtı `players[]`'a `team_name`.
- **Test:** yeni `tests/test_rankit_a11y.py` (5 test; canlı döngünün temiz yazması sahte sağlayıcıyla); `tests/test_rankit_notify.py` bellek şemasına takım adları, "running hot" ve kapanış öğelerine tam ad / kısa biçim doğrulaması. `tests/test_rankit_*.py` 210/210. 10 kural tek tek geri alındığında ilgili test kırmızı.
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): sheet / diyalog erişilebilirliği (Phase 11'in asıl maddesi: `role="dialog"`, `aria-modal`, Escape, odak tuzağı ve geri dönüşü), dar yerlerde `match_short`, erişilebilir adlarda `match` / `home_name`. Sezon etiketi ("2026-27") ve dakika ("73'") erişilebilir okuması arayüzde biçimlenmeli ("2026–27 season", "73rd minute").
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı; canlıdaki eski dakika satırları okurken temizleniyor, veri güncellemesi gerekmiyor.

#### Frontend pass — Phase 10 yanıt tekrarı (kısmi) / 2026-09-22

- **Kaynak:** `BUILD.md` §6.1 ve §10, mobil `4a`/`5c` ile web inceleme satırı; yukarıdaki backend Phase 10'un `ReviewCommentIn.client_id` sözleşmesi. Önceki frontend notundaki `client_id` bekleyen maddesi bu kapsamda kapandı.
- Mobil inline yorum, `4a` inceleme dizisi ve web yorum gönderimleri aynı metin + inceleme + adres için aynı 32 karakterlik `client_id` kullanır; sunucunun kabulü gelene kadar ağ hatasında kimlik saklanır, başarılı POST sonrasında temizlenir. Adres veya metin değişirse yeni kimlik üretilir. `rankitApi.addComment` artık bu alanı gönderir; backend'in tekrar gelen isteği `duplicate: true` ile tek kayda bağlama kuralıyla uyumlu.
- **Doğrulama:** iki yeni saf Node testiyle kayıp yanıtın tekrarında aynı kimlik, farklı metin/adreste yeni kimlik; tüm frontend testleri 35/35, production build ve hedefli ESLint başarılı. Canlı/yerel API süreciyle uçtan uca ağ-kesintisi senaryosu henüz kabul edilmedi.
- **Kalan:** Phase 10'un diğer toggle'ları, `has_more`/`truncated`/`entries_has_more`, bayat `live_updated_at`, Phase 11 diyalog erişilebilirliği ve Aşama 5'in henüz yapılmamış ekranları. Commit, push, deploy, APK yapılmadı.

#### Backend pass — Phase 12 (The marks, API payı) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 12 (RankIt mark / wordmark §7.2, Primary Arch markası `BrandIcons.jsx`'ten aynen §7.3, launcher ikonu §7.1 — hepsi frontend / Android işi), §7.4 (ortak marka); CODE.md §7 ("Brand, crest, league, broadcaster ve Primary Arch co-brand alanlarının kaynağı kontrol edilir; sahte logo veya yayıncı uydurulmaz", `7a`–`7d`); HANDOFF §1 (kulüp rengi API'den, arma mürekkebi açık formalarda `#101318`).
- **İncelenen endpoint / tablo:** `rankit_team_logos` (kaynak sütunu), `rankit_teams.crest_url`, `backfill_rankit_team_logos` (NBA CDN kimliği / FotMob takım kimliği), maç yanıtı `home` / `away` (`crest_url` = logo ya da arma, `color`), `rankit_broadcasters` tohumu (`src/rankit_broadcasters_seed.py`), `rankit_broadcast_rules` / `rankit_broadcasts`, maç yanıtı `broadcaster` / `broadcast`, `rankit_competitions` (logo alanı yok); frontend arma mürekkebi türetimi (`toMatchCardProps.js crestInk`, okundu).
- **Bulgu:**
  1. Maç yanıtındaki `broadcaster`, `rankit_matches.broadcaster` serbest metin sütunundan geliyordu: hiçbir senkron bu sütunu yazmıyor, yalnız demo tohumunun uydurma kanalları duruyor ("TRT 1", "S Sport Plus", "tabii Spor", "NBA League Pass") ve kart bunu "Watch on …" diye gösteriyordu — canlıda bırakılan demo maçlarında da (sahte yayıncı).
  2. NBA arma eşleştirmesi tüm basketbol takımlarını kısa ada göre NBA kısaltmalarıyla eşliyordu: kısa adı bir NBA kısaltmasıyla çakışan bir EuroLeague takımı (ör. "MIL") başka bir kulübün armasını alırdı. Yerel veride çakışma yok (23 EuroLeague takımının armaları `euroleague` kaynaklı) — gizli risk.
  - Sorun bulunmayanlar: tüm armalar gerçek sağlayıcı kaynaklı (`nba` CDN, `fotmob`, `euroleague`; yerelde kaynak dışı arma yok), ad tahminiyle üretilmiş adres yok; yayıncı tohumu yalnız kanal adları, turnuva–ülke eşlemesi editöryal (kaynak + doğrulanma tarihi), kapsam dışı ülkede `broadcast` dürüstçe boş (Faz 2); lig logosu alanı yok, uydurulmuyor (kart metin kullanıyor); arma mürekkebi istemcide renk parlaklığından; kulüp renkleri sahibin kararıyla 12'li paletten (Faz 1).
- **Yapılan backend değişikliği:**
  - `_match_dict.broadcaster`: canlıda (`IS_PROD`) her zaman `null`; doğrulanmış yayın bilgisi ülkeye göre `broadcast` alanında. Yerel demo görünümü değişmedi.
  - `backfill_rankit_team_logos`: NBA eşleştirmesi yalnız NBA turnuvasında oynayan takımlar için.
- **Test:** yeni `tests/test_rankit_marks.py` (2 test; NBA eşleştirmesi `nba_api` statik listesiyle, ağsız). `tests/test_rankit_*.py` 212/212. İki kural geri alındığında ilgili test kırmızı.
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend / Android (Codex): Phase 12'nin asıl maddeleri — RankIt mark + wordmark (benzersiz mask id), Primary Arch markası aynen ve `< 32px` varyantı, ortak markada ikisi de mono, launcher ikonu (bugdroid). Kartın "Watch on …" satırı `broadcast` (ülkeye göre, doğrulanmış) kullanmalı; `broadcaster` canlıda boş.
  - Canlıdaki demo maçları (sahibin kararıyla duruyor) uydurma `summary` metinlerini hâlâ taşıyor; yayıncı gibi marka değil ama editöryal içerik — demo temizliği sahibin kararına bağlı.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.

#### Frontend pass — Aşama 6 Companion `5a` / `5b` / `6d` (kısmi) / 2026-09-22

- **Kaynak ve sıra:** `BUILD.md` §9.2–9.4 ve Bölüm IV Aşama 6; mobil `RankIt Redesign.dc.html` altın ekran kodları `5a`, `5b`, `6d`. Aşama 5 `2f` olay akışı maç yanıtında olmadığı için sahte olay yazılmadı; Companion verisi gerçek `GET /matches/{id}/companion` ve mevcut oda WebSocket sözleşmesine bağlandı. Aşama 5 ve Aşama 6 bütünüyle bitmiş sayılmaz.
- **`5a` / `5b`:** Maç öncesi katılım ve takip edilen katılımcı sayısı, açık Join eylemi, başlama sayacı; canlıda oda sayısı, ölçülmüş crowd pulse, beş dakikalık eğri, sağlayıcı anları ve canlı okuma. Odaya girme yalnız kullanıcının Join tıklamasıyla WebSocket açar; okuma isteği sunucunun sağlayıcı dakikasını kullanması için yalnız `{value}` taşır. Çift kesme işaretli dakika düzeltilmiştir. Companion sekmesi rozeti paneldeki yeni durumla güncellenir; yaklaşan/canlı maçta 30 saniyede yenilenir.
- **`6d`:** Biten maçta gerçek gece kaydı (zirve dakika, futbolda devre arasından yükseliş, mesaj/katılım), kapalı ve salt okunur sohbet, canlı okumayı yalnız puanlama taslağına taşıyan CTA. Yeterli okuma yoksa değer ve grafik uydurulmaz. Çizgi grafiği yalnız en az sunucunun `min_reads` eşiğini geçen bitişik beş dakikalık kovaları bağlar; boş aralıkların üstünden çizgi geçmez. Basketbolda futbolun devre arası yükseliş kutusu gösterilmez.
- **Sınır:** `GET /watchalong` yalnız son 100 mesajı veriyor. `6d` tasarımı tüm gece konuşmasını okuyabilmeyi öngörüyor; frontend arşiv eksikliğini dürüstçe belirtir. Tam arşiv için backend sayfalama gerekiyor (Claude alanı). Yerel API işlemi kaynakta mevcut son backend sürümünden eski olabildiği için `5a`/`5b` canlı oda ve 20+ okuma uçtan uca kabul edilmedi; bitmiş demo maçının `6d` ekranı tarayıcıda açıldı, arşiv aç/kapat kontrolü görüldü. 37/37 frontend Node testi, hedefli ESLint ve Vite production build geçti.
- **Sonraki frontend bağımlılığı:** Aşama 5 `2f` gerçek olay kaynağı geldiğinde; Aşama 6 için canlı/maç öncesi iki hesaplı kabul testi ve tam sohbet arşivi sözleşmesi. Commit, push, deploy, APK yapılmadı.

#### Backend pass — Phase 13 (Web foundation) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 13 (§17 kabuk: header, dört öğeli nav, gerçek arama alanı, rayın üç bölümü — standing, aktif koleksiyonlar, takip edilenler; §18 320 duvar; `web/cards.jsx` `crest_url` / `has-logo`), §16, §23 (web'in telefondan ayrıldığı üç yer: filtreler rayda sayılarıyla — `8a`; tablo ve maç haftası yan yana, tabloda **avg heat** sütunu — `8c`; tek ekran ilk kurulum — `14a`), §5.5 ("table average, club average" dahil). Ekranlar: `7a` ("YOUR STANDING 04 · THE HUNT London Derbies 8/12 · FOLLOWING Arsenal Thunder +4 more · TONIGHT · FROM PEOPLE YOU FOLLOW … @mara closed a collection"), `8a` ("SPORT Football 148 Basketball 62 · STAGE Live 6 Upcoming 44 Finished 98 · MINIMUM HEAT · Hottest / Soonest / Most reviewed"), `8c` ("# CLUB P GD PTS AVG HEAT"), `11d` ("Everyone you follow / Mutuals only").
- **İncelenen endpoint / tablo:** web'in çağırdığı uçlar (`RankItWeb.jsx`: `home`, `catalog`, `log`, `favorite`, `follow`, `addListItem`, `createList`) ve mobil karşılıkları; `/catalog` (filtreler, `total`, sıra), `/competitions/{id}` (`standings`), `/home` akışı, `/rank`, `/collections`, `/onboarding` (`followed_clubs`).
- **Bulgu:**
  1. `8a`: katalog tek sıra biliyordu (şimdiye en yakın); "Hottest / Soonest / Most reviewed" yoktu. Raydaki seçeneklerin yanındaki sayılar (facet) hesaplanamıyordu — yalnız filtreli toplam vardı.
  2. `8c`: tablo satırlarında ısı yoktu ("AVG HEAT … the reason a league table belongs in this product at all").
  3. `7a` / `11d` / `2q`: takip ettiklerinin akışı için uç yoktu — `/home` akışı herkesin son 8 incelemesi. "Closed a collection" olayı kaydedilmiyordu.
  - Parite (sorun yok): web ve mobil aynı uçları ve aynı `_match_dict` şeklini kullanıyor; `crest_url` alan adı, `formatWhen` istemcide; rayın standing (`/rank`), koleksiyonlar (`/collections`) ve takip edilen kulüpler (`/onboarding` `followed_clubs`) verisi var.
- **Yapılan backend değişikliği:**
  - `GET /catalog`: `sort` = `nearest` (varsayılan, eski sıra) | `hottest` (kart ısısı, 20 puan altı en sonda) | `soonest` (canlı → yaklaşan yakın önce → bitmiş yeni önce) | `reviewed` (herkese açık, banlı olmayan inceleme sayısı); geçersiz değer `422`. `facets=true` → `facets: {sport, status, competition, season}` her seçenek `{value, count}`; dışlayıcı: bir boyutun sayıları o boyutun kendi filtresi dışındaki tüm filtrelerle (sport seçiliyken iki spor da sayılır). Yanıtta `sort`.
  - `GET /competitions/{id}` → her tablo satırında `avg_heat` (kulübün tablo kapsamındaki bitmiş maçlarından yalnız en az 20 puanlı olanların topluluk ısısı ortalaması, 1 hane; hiç yoksa `null`) ve `heat_matches`.
  - Yeni `GET /activity?scope=following|mutuals&limit&offset&tz_offset`: takip ettiklerinin (ya da karşılıklı takiplerin) puanlı kayıtları ve incelemeleri — herkese açık + takipçilere açık, gizli yok, banlı yok; spoiler işaretli metin maçı puanlamadıysan taşınmaz (`review_withheld`), `viewer_rated`, maç özeti tam ve kısa adlarla, `respect`, `replies`, `on_the_night` — ve kapattıkları koleksiyonlar (`kind: "collection"`, başlık, `collected` / `total`); zamana göre birleşik, `has_more`.
  - Yeni tablo `rankit_collection_completions` + `rankit_hunt.sync_completions`: bir puan bir seçkiyi ya da kulüp sezonunu tamamlarsa olay yazılır (ilk an kalır), puan kaldırılıp eksik kalırsa silinir.
- **Test:** yeni `tests/test_rankit_web.py` (5 test). `tests/test_rankit_*.py` 217/217. 12 kural tek tek geri alındığında ilgili test kırmızı.
- **Kalan bağımlılık veya veri eksikliği:**
  - Frontend (Codex): web `home` çağrısı `tz_offset` / `country` göndermiyor (RankIt günü UTC'ye düşer, yayın satırı gelmez) — parametreler var; `8a` rayı `catalog(..., facets=true, sort=…)`; `8c` `avg_heat` / `heat_matches` ("TOO FEW RATINGS" için); `7a` "FROM PEOPLE YOU FOLLOW" ve `11d` → `GET /activity`; web `follow` / `favorite` tekrar güvenli `on` göndermeli (Faz 10). Web denetçisi puansız yorum gönderirse `422 Rate the match first` (Faz 7, §9.3).
  - Rayın "FOLLOWING Arsenal Thunder +4 more" satırı için ayrı bir uç yok; `/onboarding` `followed_clubs` (+ turnuvalar) kullanılabilir.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı; yeni tablo canlıya yalnız deploy ile (idempotent).

#### Frontend devir listesi (Codex için) — Backend Faz 1–13 / 2026-09-22

Backend frontend'in önünde ilerliyor; bu liste Faz 1–13 backend kayıtlarındaki frontend işlerini tek yerde toplar. Her madde: uç / alan → arayüz kuralı. Bundan sonraki her backend kaydı "Frontend için (Codex)" bölümüyle biter. Kaynak kayıtlar yukarıda, bu dosyada.

**Önce:** yerel API süreci yeniden başlatılmalı (`uvicorn api.main:app --reload` açılışta `init_db` koşar): yeni tablolar (`rankit_collections`, `rankit_collection_items`, `rankit_collection_completions`) ve sütunlar (`rankit_diary_entries.rated_at / client_entry_id / skin`, `rankit_review_comments.client_id`, `rankit_watchlist.appetite`, `rankit_match_lineup_players.player_id / position / sub_in / sub_out / replaced`) ancak o zaman var. Frontend kayıtlarındaki "yerel API kaynak koddan eski yanıt veriyor" notu bundan.

**Faz 1 — Kart (`2a`–`2g`)**
- [ ] `potm` 20 oy altında `null`; `potm_votes` ile `TOO FEW VOTES`.
- [ ] `community_rating` 20 puan altında `null`, `rating_count` ile `TOO FEW RATINGS`; `instant_classic` 20 puan altında `false` (Classic saç çizgisi yanmaz).
- [ ] Beklenen ısı (`2h` / `16c`): `expected_heat`, `expected_rating_count` (okuma veren), `watchlist_count`, `my_appetite`; 20 okuma altında boş rampa + sayaç. İzleme listesinde 1–5 okuma → `PUT /matches/{id}/appetite` (yalnız başlamamış maç, aksi `409`).
- [ ] `broadcaster` canlıda her zaman `null` (Faz 12) — kart ayağı "Watch on …" için `broadcast` (Faz 2) kullanılmalı.

**Faz 2 — Home**
- [ ] Web ve mobil `rankitApi.home` → `tz_offset` ve `country` göndermeli: RankIt günü, `day: {start, end, matches}` ("TONIGHT · N MATCHES"), `broadcast` (`confidence: typical` = "genellikle" dili).
- [ ] Kart `live_minute` (temiz "73'"), `live_updated_at` eskiyse bayat işareti (Faz 10).
- [ ] Akış: `activity[].review_withheld === true` → metin boş; `CONTAINS SPOILERS · TAP TO SHOW`, dokununca `4a`.

**Faz 3 — Diary / Discover**
- [ ] Diary kaydında `watched_date`'i UTC günüyle (`toISOString().slice(0,10)`) göndermeyin; yerel gün gönderin ya da hiç göndermeyin (sunucu `tz_offset` ile koyar); her kayıtta `tz_offset`.
- [ ] `6c` "Show N matches" → `GET /catalog?min_heat=…&limit=1` → `total`.

**Faz 4 — Collectible (`6a` / `7e`)**
- [ ] Yeni kayıtlarda (özellikle rewatch) `client_entry_id` (UUID) → belirsiz tekrar güvenli; "Check your diary before retrying" durumu kalkabilir.
- [ ] `6a`: `card_number`, `streak_current` + `streak_delta`, `points_total` + `points_awarded`, `points_revoked`; koleksiyon karosu `collection` (null ise karo yok; `delta` yalnız ilk puanda 1), varsa `season_award` (300).
- [ ] Düzenleme `rating`'i de göndermeli (boş `rating` = puanı kaldır). POTM / respect puansız `403`.

**Faz 5 — Match sheet**
- [ ] `15b` seçici `lineups[].starters` + `bench[]` içinden `played` olanları listeler, oy `player_id` ile; kadro yoksa seçici kapalı. Oynamayana oy `422`.
- [ ] `15d` "CAME ON · 63' Neto for Madueke" → `sub_in` + `replaced`; mevki `position` (ince etiket `position_code`).
- [ ] Sezon kadrosu `players[]` artık `team_name` de taşıyor.

**Faz 6 — Companion**
- [ ] `5a` "N joining · M you follow" → `joined` / `joined_following`; `15d` "N in the room" → `in_room`; `6d` → `record` + `room_open: false`; anlarda `pulse_delta`; nabız 20 okuma altında `null` (`pulse.min_reads`). Pulse `minute` göndermeye gerek yok; `minute` temiz ("73'").
- [ ] Katılım süresi soket bağlantısından sayılıyor (companion ödülü sokette); `/presence` isteğe bağlı.

**Faz 7 — Reviews**
- [ ] Kendi inceleme / yanıtında respect elması yok (API `403`); `4a` inceleme nesnesinde artık `user_id` ve `is_mine` var (bu listeden sonraki backend geçişi) — kullanıcı adı eşlemesine gerek kalmaz.
- [ ] Yanıt `reply_to` yalnız yazar ya da dizide yanıt yazmış biri (aksi `422`); yanıt gönderimi `client_id` ile (Faz 10).
- [ ] `spoiler: true` yanıtlar da TAP TO SHOW arkasında (`4a` ve `GET /reviews/{id}/comments`).
- [ ] `15c` composer puan yokken kapalı (`422 Rate the match first`); Classic de puansız verilemez.
- [ ] `6b` "Your reviews" → `GET /diary?view=reviews` (`respect`, `replies`, `visibility`).
- [ ] "On the night" yazarın gecesi (`on_the_night`), istemci hesaplamasın.

**Faz 8 — Shell**
- [ ] Yazmada `401 Sign in again` → giriş ekranı, taslak korunur.
- [ ] `3j` quick-rate → `tonight_counted` / `at_risk`; yıldızsız izleme kaydı olan maç da listede.
- [ ] `PUT /settings` yalnız gerçek boolean (`"false"` metni `422`).

**Faz 9 — Kalan mobil yüzeyler**
- [ ] `2p` kutuları `breakdown` içinde türe göre (`rate_same_day`, `respect` — adet = respect sayısı, `companion`, `season`); `rate_late` görünmez ama toplamda.
- [ ] `9a` / `9b` sıra sunucudan (yüzde → ortak maç sayısı → ad); on maç altında `pct: null` = "Too few to compare".
- [ ] `3d` açılış sekmesi `available[0]` (`potm` varsa); satırda `won`, `share` (pay çubuğu `ink`, ısı rampası değil), `matches` örneklem; `min_votes: 20`.
- [ ] The Hunt: `2m` → `GET /collections` (`summary`: collected / total / pct / active / one_left; sıra sunucudan), `2n` → `GET /collections/{id}` (`collected_matches`, `open_matches`, `upcoming_matches`, `unscheduled` = "N fixtures are unscheduled", `reward` metin); durum `active` / `complete` / `not_open` (`opens_note`).
- [ ] `3e` COLLECTIONS bölümü `collections` (kullanıcı listeleri `lists` — §24, bileşenler ayrı).
- [ ] `3f` / `13a`: kapanış öğesi `collection_id` / `collection_title` (liste değil) → `2n`'ye bağlanır; `match` tam adlar, `match_short` kısa; spoiler derecesi `viewer_rated`.
- [ ] `3h`: `PUT /lists/{id}`, `DELETE /lists/{id}`, `DELETE /lists/{id}/items/{match_id}`, `PUT /lists/{id}/order` (tam küme); kendi listene respect yok (`403`).
- [ ] `2j` skinler → `GET /skins?entry_id=` (`locked`, `available`); seçim `PUT /diary/{id}` `{skin}`; kart / paylaşım `my_skin`, `skin`, `their_skin` ile boyanır, uygulama kabuğu asla. `CollectibleResult.jsx`'teki "being prepared" notu kaldırılabilir.

**Faz 10 — States**
- [ ] Tüm toggle'lar (inceleme / yanıt respect'i, liste kaydet / respect, izleme listesi, favori, takip) ve kuyruk tekrarları `{"on": true|false}` göndermeli.
- [ ] "That's all" yalnız `has_more` (bildirimler), `truncated` (arama bölümleri), `entries_has_more` (`3i`), `next_offset` (`5c`, `9a`) false iken.
- [ ] 500 mesajı artık İngilizce ve aynen gösterilebilir.

**Faz 11 — Accessibility**
- [ ] Sheet'ler gerçek diyalog (`role="dialog"`, `aria-modal`, Escape, odak tuzağı, odağın geri dönüşü) — fazın asıl maddesi.
- [ ] Erişilebilir adlarda tam takım adı (`match`, `home_name`, `name`); dar yerde `match_short` / `short`. "2026-27" → "2026–27 season", "73'" → "73rd minute".

**Faz 12 — Marks**
- [ ] RankIt mark + wordmark (benzersiz mask id), Primary Arch markası `BrandIcons.jsx`'ten aynen + `< 32px` varyantı, ortak markada ikisi de mono, launcher ikonu (bugdroid).

**Faz 13 — Web foundation**
- [ ] `8a` rayı `GET /catalog?facets=true&sort=nearest|hottest|soonest|reviewed` — seçenek sayıları `facets.{sport,status,competition,season}`.
- [ ] `8c` tabloda `avg_heat` (null → TOO FEW RATINGS) ve `heat_matches`.
- [ ] `7a` "FROM PEOPLE YOU FOLLOW" ve `11d` → `GET /activity?scope=following|mutuals` (`kind: entry | collection`, `review_withheld`, `viewer_rated`, `has_more`).
- [ ] Rayın "FOLLOWING" satırı `/onboarding` `followed_clubs` ile.

#### Frontend pass — Ortak plan ve Aşama 5 `2f` olay kaynağı (kısmi) / 2026-09-22

- **Kaynak:** `BUILD.md` Part IV Phase 5 / §9.2, mobil HTML `2f` ve `15d`; mevcut backend `GET /matches/{id}` ile `GET /matches/{id}/companion`. Önceki “`2f` olay verisi yok” notu dar anlamda maç yanıtı için doğru: olaylar maç yanıtında yok, fakat Companion `moments` alanında sağlayıcıdan yazılmış gol/kartlar mevcut. `BUILD.md` canlı Match sekmesinde olay göstermeyi yasaklar; bu ayrım korundu.
- **Yapılan frontend:** `finishedMatchEvents` yalnız Match ve Companion durumlarının ikisi de `finished` ise geçerli dakikalı/etiketli anları dakika sırasına sokar. `MatchEvents` bitmiş maçın Match sekmesinde olayları listeler; kaynak boşsa “Verified match events are not available” der, gol/kart icat etmez. Sezon kadrosu artık canlı/bitmiş maçta, açıklanmamış ilk 11'in alternatifiymiş gibi gösterilmez; yalnız yaklaşan maça özgü not olarak kalır. Ortak sıra, sahiplik, faz kapıları ve Claude'un backend sonrası frontend katılımı repo kökündeki `frontend_code.md` dosyasında toplandı.
- **Doğrulama:** 2 yeni saf olay testi dahil 39/39 frontend Node testi, hedefli ESLint, Vite production build ve `git diff --check` geçti. Yerel Barcelona–Inter bitmiş demo maçında Match sekmesi ve olay-verisi-yok hali tarayıcıda görüldü; bu yerel örnekte `moments` boş olduğu için **dolu olay listesinin görsel kabulü yapılmadı**. Gerçek dolu örnek ve beş maç evresi kabulü hâlâ açık; Phase 5 tamamlandı sayılmıyor.
- **Koordinasyon:** Claude'un Phase 13 backend notu bu geçiş sırasında eklendi; `frontend_code.md` güncel duruma göre revize edildi. Claude mevcut `moments` kapsamının geçmiş/bitmiş maçları ne ölçüde doldurduğunu backend hattında doğrulayabilir; tüm gece sohbet arşivi hâlâ son 100 mesaj sınırında. Commit, push, deploy, APK yapılmadı.

#### Backend pass — Codex istekleri (6d arşiv, 2f olaylar, 4a / 5c sahiplik) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** §9 tablosu ("Full time, rated — result + events (`2f`)"), §9.2 (canlıyken anlar yalnız Companion'da), HANDOFF §4.9.4 (`6d` "Read the thread", kapalı ama okunabilir oda); Codex frontend kayıtları: "Aşama 6 Companion" (`GET /watchalong` yalnız son 100 mesaj — "Tam arşiv için backend sayfalama gerekiyor (Claude alanı)"), "Aşama 5 2g / 2h" (`2f` olay akışı maç yanıtında yok; 4a sahipliği kullanıcı adından eşleniyor).
- **İncelenen endpoint / tablo:** `GET /matches/{id}/watchalong`, `GET /matches/{id}`, `GET /reviews/{id}/thread`, `GET /matches/{id}/reviews`; `rankit_watchalong_messages`, `rankit_moments` (taraf bilgisi yoktu), `rankit_match_lineup_players` (`sub_in`, `replaced`), `rankit_live_sync._store_moments`.
- **Bulgu:**
  1. Oda geçmişi yalnız son 100 mesaj; `6d`'nin "gecenin tamamı okunabilir" sözü tutulamıyordu.
  2. Maç yanıtında olay listesi yoktu; `2f` "result + events" çizilemiyordu. Anlar tablosu golün/kartın hangi takıma ait olduğunu tutmuyordu (sağlayıcı `isHome` veriyor).
  3. `4a` inceleme nesnesinde `user_id` yoktu; istemci sahipliği kullanıcı adından eşlemek zorundaydı (kendi incelemene respect yok, Faz 7).
- **Yapılan backend değişikliği:**
  - `GET /matches/{id}/watchalong?before_id=&limit=` (1–200, varsayılan 100): geriye doğru sayfalama; her sayfa eskiden yeniye, `has_more`, `next_before_id`. Parametresiz çağrı eskisi gibi son 100.
  - `rankit_moments.side` (idempotent ALTER); `_store_moments` sağlayıcının `isHome`'unu yazıyor, aynı olay tekrar gelince eski satırın tarafı tamamlanıyor.
  - `GET /matches/{id}` → `events`: YALNIZ bitmiş maçta `[{minute, kind: goal | own_goal | card | substitution, label, player, side}]` dakika sırasıyla (gol / kart anlardan, değişiklik doğrulanmış kadrodan "Trossard for Martinelli"); canlı / yaklaşan maçta `null` (§9.2). `events_checked`: bu maç için sağlayıcıdan olay ya da kadro okundu mu — boş liste "golsüz" mü "bilinmiyor" mu ayrılsın.
  - `4a`: `review.user_id`, `review.is_mine`, her yanıtta `is_mine`; `5c` satırlarında `is_mine`.
- **Test:** yeni `tests/test_rankit_codex_requests.py` (4 test). `tests/test_rankit_*.py` 221/221. 11 kural tek tek geri alındığında ilgili test kırmızı.
- **Kalan bağımlılık veya veri eksikliği:**
  - Olay listesi yalnız canlı / kadro döngüsünün yokladığı maçlarda dolu (döngüler maç sırasında ve sonrasında kısa süre çalışır); geçmiş maçlar için geriye dönük olay çekimi yok — `events_checked: false` dürüstçe "bilinmiyor" der. Eski anların `side`'ı bir sonraki yoklamaya kadar `null`.
  - `2f`'nin editöryal özet cümlesi ("Two red cards, a disallowed goal…") için veri yok (yalnız demo `summary`); uydurulmaz.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.
- **Frontend için (Codex):**
  - [ ] `6d` "Read the thread": `GET /matches/{id}/watchalong?before_id={next_before_id}` ile geriye doğru yükle, `has_more` false olunca "arşiv eksik" notu kalkar.
  - [ ] `2f` Match sekmesi (bitmiş maç): `events` listesi — taraf `side` ile ev / deplasman sütunu, `kind` ile ikon; `events_checked === false` ise "Match events unavailable" (olay yok ≠ golsüz). Canlıyken bu sekmede olay akışı gösterme (§9.2) — `events` zaten `null`.
  - [ ] `4a` / `5c` kendi inceleme / yanıt kontrolü `is_mine` ile; kullanıcı adı eşlemesi kaldırılabilir.
  - [ ] Yerel API'yi yeniden başlatın (yeni `rankit_moments.side` sütunu `init_db`'de).

#### Backend pass — Phase 14 (The Inspector, all five phases) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 14 (Inspector kabuğu, üç sekme, küçült; beş evre: `16c` planlı, `15w` canlı Match, `7b` puanlı Match, `15x` puansız Community, `7c` puanlı Community, `16a` / `7d` / `16b` Companion önce / canlı / sonra; `7e` koleksiyon katmanı; `11a` quick-rate diyaloğu; `15y` oyuncu seçici diyaloğu; `15z` panelde composer), §19 / §19.1 ("saves as you type" masaüstü sözü), §19.2, §20, §9 / §9.1 / §9.2 (sekmeler değişmez, yıldızlar tam zamanda açılır, Match ve Companion birleşmez); CODE.md §7 ("her durum için API yanıtları ayrı ayrı kabul edilir").
- **İncelenen endpoint / tablo:** Inspector'ın kullandığı tüm uçlar evre evre: `GET /matches/{id}` (skor, `lineups`, `events`, `live_minute`, `live_updated_at`, beklenen ısı, topluluk ısısı, `my_*`), `GET /matches/{id}/companion` (`badge`, `room_open`, `record`), `PUT /matches/{id}/appetite`, `POST /matches/{id}/pulse`, `POST /diary` / `PUT /diary/{id}`, `POST /matches/{id}/potm`, `PUT /matches/{id}/respect`, `/quick-rate`, `/skins`.
- **Bulgu:**
  1. `15z` "saves as you type" ile çelişen sözleşme: `DiaryIn`'de GÖNDERİLMEYEN `rating` "puanı kaldır" sayılıyordu. Yalnız inceleme metnini gönderen bir otomatik kayıt her tuş vuruşunda puanı siler, puanlama ödülünü geri alır, seriyi bozardı.
  2. Beklenen ısı yalnız durum alanıyla kapanıyordu: sağlayıcı "live" demekte gecikirse (canlı döngü dakikada bir) maç başladıktan sonra da okuma yazılabiliyordu.
  - Sorun bulunmayanlar (evre evre kabul edildi): planlı — skor yok, kadro yok, `events: null`, beklenen ısı 20 okumayla, günlük `409`, canlı okuma `409`, oda açık; kadro açıklandı — `lineups` dolu, diğerleri aynı; canlı — temiz `live_minute`, `live_updated_at`, skor, `events: null` (§9.2), beklenen ısı kapalı, günlük `409`, canlı okuma `200`, rozet LIVE; tam zaman puansız — `events` (ve `events_checked`), oda kapalı, kayıt var, canlı okuma `409`, puansız POTM `403`; tam zaman puanlı — `my_rating`, POTM yalnız oynayana, topluluk ısısı 20 puanla.
- **Yapılan backend değişikliği:**
  - `rankit_log`: puan ALANI gönderilmediyse (`model_fields_set`) puana, `rated_at`'e ve puanlama ödülüne dokunulmaz; açık `"rating": null` hâlâ "puanı kaldır". Yeni kayıtta alan yoksa puansız kayıt (önceki gibi). §9.3 kuralı ve Classic bildirimi sonuçtaki puana (`final_rating`) bakıyor.
  - `PUT /matches/{id}/appetite`: başlama SAATİ geçtiyse de `409 Expected heat closes at kick-off`.
- **Test:** yeni `tests/test_rankit_inspector.py` (2 test: tek maç beş evreden geçirilip her evrede yanıtlar ve izinler kabul ediliyor; composer otomatik kaydı puana dokunmuyor). `tests/test_rankit_*.py` 223/223. Dört kural tek tek geri alındığında ilgili test kırmızı.
- **Kalan bağımlılık veya veri eksikliği:**
  - Topluluk hükmü kapısı (§3.1 "Rate it first — then see whether the room agreed", REVEAL ANYWAY hep var) istemci kapısı: değer yanıtta geliyor, istemci gizliyor.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.
- **Frontend için (Codex):**
  - [ ] Inspector sekmeleri evreden bağımsız sabit (Match / Community / Companion); içerik yukarıdaki evre tablosundaki alanlarla. Canlıda Match sekmesinde olay akışı yok (`events` null), anlar Companion'da.
  - [ ] `15z` composer yazdıkça kaydedebilir: `PUT /diary/{id}` gövdesinde YALNIZ `{match_id, review}` (ve istenirse `tags`, `spoiler`, `visibility`) — `rating` alanını HİÇ göndermeyin; puanı kaldırmak için açıkça `"rating": null`. Web denetçisindeki `rating: rating || null` kalıbı puanı olmayan formda istemeden puanı kaldırır — gerçekten kaldırmak istenmedikçe alanı çıkarın.
  - [ ] `11a` quick-rate diyaloğu → `GET /quick-rate` (`tonight`, `catchup`, `tonight_counted`, `at_risk`) ve arama `status=finished`; `R` kısayolu istemcide.
  - [ ] `15y` seçici diyaloğu → `lineups[].starters / bench[]` `played` (Faz 5); `7e` katman → `rankit_log` yanıtı (`card_number`, deltalar, `collection`, `season_award`).
  - [ ] Beklenen ısı girişi başlama saatinde kapanır (`409`); arayüz kickoff geçince okuma kontrolünü gizlemeli.
  - [ ] §3.1 topluluk hükmü kapısı: puanlanmamış bitmiş maçta `community_rating` bulanık + "Rate it first — then see whether the room agreed with you." + REVEAL ANYWAY.

#### Backend pass — Phase 15 (The three desktop-earned screens) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 15, §22.1 (`7f` raf: 1440'ta yedi sütun, yüz kart birden, sıralar görünür — dropdown değil), §22.2 (`7g` sezon ısı haritası: kulüp satırı × 38 hafta, hücre = kulübün o haftaki maçının topluluk ısısı, altın elmas = izleyenin kaydettiği gece, oynanmamış hafta sönük, 20 puan altı kesikli hücre — uydurma renk yok, lejant zorunlu), §22.3 (`7h` iki sütunlu okuma: sol sütunda maç, en çok etiketler, puan dağılımı), §5.5. Web tahtası: `7f` ("@SELIN · 143 CARDS · 12 CLASSICS · Newest / Highest rated / Classics only / By competition"), `7g` ("9 weeks that ran hot league-wide · MW 14 best weekend of the season · 31 of these you logged"), `7h` ("WHAT PEOPLE SAID MOST Atmosphere 184 … RATING SPREAD 4.6 1 2 3 4 5 · 318 REVIEWS · Most respected / Newest / Following").
- **İncelenen endpoint / tablo:** `/diary` (sırasız, sayfasız, yalnız kendi), `/members/{id}` rafı (6 kart), `/competitions/{id}` (tablo), `/matches/{id}/reviews` (`5c`); `rankit_diary_entries`, `rankit_entry_tags`, maç haftası `stage`.
- **Bulgu:**
  1. `7f`: rafın sıralaması, sayfalaması ve "N cards · N classics" sayıları yoktu; başkasının rafı yalnız 6 kart.
  2. `7g`: ısı haritası için uç yoktu.
  3. `7h`: "Following" sekmesi, "what people said most" etiket sayıları ve puan dağılımı yoktu.
- **Yapılan backend değişikliği:**
  - Yeni `GET /shelf?member_id=&sort=newest|rating|classics|competition&limit=1..200&offset=`: her kayıt bir kart (rewatch ayrı kart, `card_number` ile aynı küme); kart = maç kartı + `entry {id, rating, classic, skin, watched_date, rewatch}` + `competition`; `counts {cards, classic_cards}`, `total`, `next_offset`. Kendi rafın tamamı (giriş gerekli); başkasınınki yalnız görebildiklerin (herkese açık / takipteysen takipçilere açık), banlı sahip `404`.
  - Puan durumu hesabı `_standings` yardımcısına taşındı (turnuva sayfası ve ısı haritası aynı hesabı kullanıyor), maç ısıları `_competition_heats`.
  - Yeni `GET /competitions/{id}/heatmap`: `weeks` (aşama adındaki sayıdan; sayısız aşama — play-in, final — girmez; hiç yoksa `available: false`), `clubs[]` tablo sırasıyla, her hücre `{week, match_id, state: heat | too_few | unplayed | none, heat, ratings, logged}`; `summary {hot_weeks (haftanın eşik üstü maç ortalaması ≥ 4.0 "running hot" tabanı), best_week {week, heat}, logged (kaydettiğin farklı maç), week_heat}`, `min_ratings: 20`.
  - `GET /matches/{id}/reviews`: `scope=all|following` (Following sekmesi — `total` da filtreli), `top_tags` (ilk üç, sayıyla; banlı hariç), `spread {"1".."5"}` (kullanıcı başına son puan, yukarı yuvarlanmış yıldız; 20 puan altında `null`), `rating_count`, `community_rating` (20 puanla).
- **Test:** yeni `tests/test_rankit_desktop.py` (3 test). `tests/test_rankit_*.py` 226/226. 12 kural tek tek geri alındığında ilgili test kırmızı (tablo sırası mutasyonu için fikstür, tablo sırası alfabetikten farklı olacak şekilde kuruldu).
- **Kalan bağımlılık veya veri eksikliği:**
  - Isı haritası maç haftasını aşama adından okuyor: NBA'de aşama yok (`available: false`), EuroLeague "Round N" haftaları giriyor. Aynı haftada iki maçı olan kulüpte (ertelenmiş maç) hücre ilk maçı gösterir.
  - Raf kartı başına `_match_dict` çağırıyor (yüz kart ≈ bin küçük sorgu); SQLite'ta hızlı ama canlıda büyük raflar için toplu sorguya çevrilebilir.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.
- **Frontend için (Codex):**
  - [ ] `7f` → `GET /shelf?sort=…&limit=100` (başkasının rafı `member_id` ile); sıra düğmeleri görünür (dropdown değil): Newest `newest`, Highest rated `rating`, Classics only `classics`, By competition `competition` (kartlar `competition` sırasıyla gelir, başlıkları istemci koyar); üst satır `counts.cards` · `counts.classic_cards`; `next_offset` ile devam, `null` = son.
  - [ ] Kart skin'i `entry.skin` (başkasının rafında da onun skini).
  - [ ] `7g` → `GET /competitions/{id}/heatmap`: `state` → `heat` renk rampası + sayı (renk tek başına değil, §6), `too_few` kesikli hücre, `unplayed` `rgba(255,255,255,.04)`, `logged` altın elmas; lejant (rampa, elmas, kesikli) zorunlu; alt özet `summary.hot_weeks` / `best_week` / `logged`. `available: false` ise sekme gizli.
  - [ ] `7h` → `GET /matches/{id}/reviews?sort=respected|newest&scope=all|following`; sol sütun `top_tags`, `spread` (null → TOO FEW RATINGS), `community_rating`, `rating_count`; sağ sütun `column-count: 2`, uzun metin kesilmez.
  - [ ] "Following" sekmesi girişsiz kullanıcıda boş (kimse takip edilmiyor) — sekme giriş istemeli.

#### Backend pass — Phase 16 (The remaining web surfaces) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 16 (`8a` Discover rayı — Faz 13; `8b` profil + `10a` kişiler tek ekranda, uyum çubuğu ve sayı; `8c` — Faz 13; `11d` — Faz 13; `11c` arama sonuçları, `12a` kulüp çekmecesi (Inspector'da), `12b` listeler §24, `12c` The Hunt — Faz 9.4, `14a` tek ekran ilk kurulum §23.3, `14b` bildirim açılır menüsü, `11b` skin ve paylaşım — Faz 9.6; `8d` durumlar — Faz 10); CODE.md §7 ("Web Rank, Lists, Search, Alerts, Profile ve settings response'larının ekran sözleşmeleriyle eşleştiği kontrol edilir"). Tahta: `11c` ("318 RESULTS · All / Matches 284 / Clubs 2 / People 24 / Lists 8 · Arsenal Premier League · 4.3 avg heat · FOLLOWING · MATCHES · HOTTEST FIRST · Deniz Yalçın 31 Arsenal matches logged MUTUAL · Every London Derby 12 matches · by @selin"), `12a` ("FOLLOWING · you've logged 31 · AVG HEAT THIS SEASON 4.3 · 4 played · 2 classics · 1st in table · HOTTEST ARSENAL MATCHES · NEXT … in a London Derby collection"), `12b` ("YOUR LISTS · 4 … 8 rated … private … 34 respects · SAVED FROM OTHERS The 38 by @deniz"), `14a` ("Primary Arch connected DONE selin@primaryarch.com · 14 people you know are already here"), `14b` ("HEAT ALERTS · SOCIAL replies on · COLLECTIONS · Streak is off · Every row opens the exact surface, never Home").
- **İncelenen endpoint / tablo:** `/search`, `/teams/{id}`, `/profile`, `/people`, `/people/discover`, `/lists`, `/lists/{id}`, `/onboarding`, `/notifications`, `/skins`, `/collections`.
- **Bulgu:**
  1. `11c`: bölüm sayıları ilk 20 ile sınırlıydı (gerçek toplam yok); kulüp satırında sezon ısısı ve takip durumu, kişi satırında ilişki durumu ve "N {kulüp} matches logged", liste satırında yazar yoktu; maçlar "hottest first" sıralanamıyordu.
  2. `12a`: `/teams/{id}` sezon özeti (lig, oynanan, ısı, Classic sayısı, tablo sırası), izleyenin o kulüpten kaydettiği maç sayısı, en sıcak maçlar, sıradaki maç ve içinde olduğu koleksiyon vermiyordu.
  3. `12b`: kendi listelerinin sayıları (puanlanan, respect, kayıt) ve başkalarından kaydettiğin listeler için uç yoktu.
  4. `14a`: bağlı Primary Arch hesabı (kullanıcı adı / e-posta) dönmüyordu.
  5. `14b`: bildirim öğelerinde kanal yoktu (grup başlıkları kurulamıyor); yanıt / respect olayı dizideki incelemeye bağlanamıyordu — `entry_id` yanıtta yoktu ("Every row opens the exact surface").
  - Sorun bulunmayanlar: `8b` profil sayaçları ve rank bloğu (Faz 8 / 9), `10a` kişi satırları (`matches`, `classics`, `overlap` — on maç altında `pct: null`, `bias` "runs a full star hotter"), "14 people you already know" için veri yok (`primary_arch_connections: null`, uydurulmuyor); `11b` `/skins`; `12c` `/collections/{id}`.
- **Yapılan backend değişikliği:**
  - Ortak `MATCH_HEAT_SQL` (kartın ısısı, 20 puan eşiği) — katalog `hottest` ve arama bunu kullanıyor.
  - `GET /search`: `counts {matches, teams, players, members, lists, collections}` gerçek toplamlar (koleksiyonlarda kesilmişse `null`); `match_sort=relevance|hottest`; kulüp satırında `season_competition`, `season_avg_heat`, `season_heat_matches` (güncel lig sezonu, yalnız 20 puanlı maçlar), `following`; kişi satırında `following`, `follows_you` ve sorgu bir kulübe uyduysa `club` + `club_logged` (yalnız izleyenin görebildiği kayıtlardan); liste satırında `username`.
  - `GET /teams/{id}`: `season {season_competition, season_avg_heat, season_heat_matches, played, classics (Instant Classic kuralıyla), position}`, `logged`, `hottest[]` (en fazla 5, ısılı), `next` (+ `collections`: izleyenin avındaki koleksiyon başlıkları), `venue: null` (veri yok).
  - Yeni `GET /lists/mine`: `owned[]` (gizliler dahil; `match_count`, `rated`, `respect`, `saves`) ve `saved[]` (başkalarının kaydettiğin, hâlâ görebildiğin listeleri; `username`; banlı yazar yok). Rota `/lists/{id}`'den önce.
  - `GET /onboarding`: giriş yapılmışsa `account {username, email}` (yalnız kendi hesabın), `primary_arch_connections: null`.
  - Bildirimler: her öğede `channel` (`heat` — running hot, yayıncı eklendi; `social` — yanıt, respect, takip, liste respect'i, Classic; `collections`) ve olaylarda `entry_id`.
- **Test:** yeni `tests/test_rankit_web_surfaces.py` (6 test). `tests/test_rankit_*.py` 232/232. 14 kural tek tek geri alındığında ilgili test kırmızı (kulüp çekmecesi testi eşik altı bir maçla güçlendirildi; kaydedilen listeler aynı saniyede kaydedilince sırasız kalıyordu — ikincil sıra anahtarı eklendi).
- **Kalan bağımlılık veya veri eksikliği:**
  - Stadyum (`12a` "Emirates Stadium") ve Primary Arch'ta tanıdık sayısı için veri yok.
  - Kulüp çekmecesi ve arama kulüp satırları kulüp başına turnuva ısısı hesaplıyor; çok kulüplü aramada yavaşlayabilir (arama en fazla 20 kulüp).
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.
- **Frontend için (Codex):**
  - [ ] `11c` sekme sayıları `counts.*` (toplam = toplamları), maç listesi `match_sort=hottest`, kulüp satırı "{season_competition.name} · {season_avg_heat} avg heat" (null → TOO FEW RATINGS) + `following`, kişi satırı ilişki durumu (`following` / `follows_you` → FOLLOW / FOLLOW BACK / FOLLOWING / MUTUAL, §13.4) + "{club_logged} {club} matches logged", liste satırı "by @{username}".
  - [ ] `12a` kulüp Inspector'da (sayfa değil): `season.*`, `logged`, `hottest`, `next` + `next.collections` ("in a London Derby collection"); `venue` null ise satır yok.
  - [ ] `12b` → `GET /lists/mine` (`owned` / `saved`); liste ≠ koleksiyon (§24): listede yazar ve paylaş, koleksiyonda halka ve ödül.
  - [ ] `14a` "Primary Arch connected" satırı `account.email`; "N people you know" `primary_arch_connections` null iken gösterilmez.
  - [ ] `14b` grupları `channel` ile (HEAT ALERTS / SOCIAL / COLLECTIONS; Streak kanalı push gelene kadar "off"); her satır tam yüzeyi açar: `entry_id` → `4a`, `collection_id` → `2n` / `12c`, `list_id` → liste, `match_id` → maç Community sekmesi; spoiler derecesi `viewer_rated` (puanlanmamış → skorsuz), kalkan açıksa kulüp adları gizlenir.

#### Backend pass — Phase 17 (Responsive, API payı) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 17 / §25 (1080'de ray ikon sütununa iner; 820'de ray menüye girer, Inspector tam genişlik alt sayfa olur; 820 altında tek sütun — "At 820 and below, web should be indistinguishable in behaviour from the app"); CODE.md §7 ("Backend tarafında responsive fark yaratacak farklı payload veya eksik alan olmadığından emin olunur; UI ölçüleri frontend sorumluluğudur"). Ekran: mobil / web paritesi.
- **İncelenen endpoint / tablo:** tüm RankIt uçlarında cihaz / tarayıcıya göre dallanma (User-Agent, platform başlığı — yok); `api/main.py` middleware'leri (`GZipMiddleware minimum_size=1000` açık); yerel verinin kopyasında ana uçların yanıt ağırlığı ve süresi: `/home` 16.5 KB (gzip 2.2), `/catalog?limit=60` 71 KB (2.8), `facets+hottest` 68 KB (4.8), `/competitions/{id}` 70–81 KB (3.0–3.9), `/competitions/{id}/heatmap` (EuroLeague, 20 kulüp × 38 hafta) 69 KB (3.7), `/search` 27 KB (2.5); yerelde 5–85 ms. Arma kaynakları: NBA SVG (vektör), FotMob / EuroLeague PNG — 7e'deki en büyük arma (76 px) 2x yoğunlukta da yeterli.
- **Bulgu:** Responsive fark yaratacak farklı yük ya da eksik alan yok: mobil ve web aynı uçları, aynı `_match_dict` şeklini kullanıyor; kompakt kart ayrı alan istemiyor (aynı alanlar, farklı yerleşim). Yanıtlar telefon ağı için sıkıştırılıyor.
- **Yapılan backend değişikliği:** yok (kod değişikliği gerekmedi). Garanti teste bağlandı.
- **Test:** yeni `tests/test_rankit_responsive.py` (2 test: sekiz uç telefon ve masaüstü User-Agent'ına aynı JSON'u dönüyor; ana uygulamada `Accept-Encoding: gzip` ile yanıt `content-encoding: gzip`). GZip satırı geçici olarak kaldırıldığında sıkıştırma testi kırmızı; dosya bayt bayt geri yüklendi. `tests/test_rankit_*.py` 234/234.
- **Kalan bağımlılık veya veri eksikliği:**
  - Isı haritası hücre başına anahtar tekrarladığı için ham yük büyük (69 KB) ama gzip'le 3.7 KB; canlıda sorun değil. Raf kart başına sorgu (Faz 15 notu) büyük raflarda süreyi uzatabilir.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.
- **Frontend için (Codex):**
  - [ ] §25 kırılma noktaları tamamen istemcide: >1080 ray 232 + duvar `minmax(320px,1fr)` + Inspector 468; 1080'de ray 64 px ikon sütunu; 820'de ray menüde, Inspector tam genişlik alt sayfa (telefonun kalıbı); <820 tek sütun, 320 kartlar tam genişlik.
  - [ ] 820 altında web, uygulamanın uçlarını ve akışlarını kullanmalı (quick-rate `3j` → `GET /quick-rate`, The Hunt satırları, kişi listeleri); ayrı bir "dar web" yükü yok ve gerekmiyor.
  - [ ] Kompakt kart ve 7f raf (`--crest: 34`) aynı alanlarla çizilir; arma yoksa kısaltma (`short`), arma URL'si her boyutta aynı.

#### Backend pass — Phase 18 (Close out) / 2026-09-22

- **BUILD maddesi ve ekran kodu:** Phase 18 (§26 "Definition of done" listesi her ekrana karşı koşulur, yalnız başarısızlıklar raporlanır; sonra yaşam döngüsü sözleşmeleri), §26; CODE.md §7 ("Route matrisi, test listesi, migration notları, veri eksikleri ve canlıya çıkış ön koşulları raporlanır").
- **§26'nın backend'e düşen maddeleri:**
  - "Heat never without its number" — her ısı alanı ya sayı ya `null` + sayaç; renk/kademe kodu hiçbir yükte yok (Faz 11).
  - "20-rating threshold respected everywhere heat appears" — yeni `tests/test_rankit_close_out.py` tek testte ISI GÖSTEREN HER YÜZEYİ 19 ve 20 puanla dolaşıyor: kart topluluk puanı, Instant Classic, POTM, beklenen ısı, tablo `avg_heat`, ısı haritası hücresi (19'da `too_few`), `5c`/`7h` topluluk puanı ve dağılımı, arama kulüp satırı, kulüp çekmecesi, Companion nabzı, `catalog?min_heat`, "running hot" bildirimi. 19'da hepsi boş, 20'de hepsi dolu. Yeni bir ısı yüzeyi eklenirse bu teste de eklenmeli.
  - "Spoiler shield…" backend payı: özet akışlarda spoiler metni taşınmıyor (`review_withheld`), puanlanmamış maçta bildirimlerde puan/skor yok, `instant_classic` 20 altında `false`, `viewer_rated` ile derece seçimi (Faz 2 / 4 / 7 / 9.5).
  - "At 820px web behaves like the app" — cihaza göre farklı yük yok, gzip açık (Faz 17).
  - Kalan §26 maddeleri (renk, font, ızgara, hedef boyutu, odak halkası, diyalog, çentik, arma kutusu, yedi kart ön ayarı) tamamen frontend.
- **Route matrisi (72 rota; `WS` hariç hepsi `/api/rankit` altında):**
  - **Herkese açık (4):** `GET /sync-health`, `GET /broadcasters`, `GET /meta`, `GET /matches/{id}/broadcasts`, `GET /competitions/{id}/players`, `GET /lists`, `GET /matches/{id}/watchalong`, `WS /ws/watchalong/{id}` (soket token ister, prod'da girişsiz kapalı).
  - **Kimlik isteğe bağlı (18):** `GET /home`, `/catalog`, `/collections`, `/collections/{id}`, `/competitions/{id}`, `/competitions/{id}/heatmap`, `/competitions/{id}/matches`, `/matches/{id}`, `/search`, `/notifications`, `/onboarding`, `/settings`, `/players/{id}`, `/teams/{id}`, `/members/{id}`, `/lists/{id}`, `/reviews/{id}/comments`, `/reviews/{id}/thread`, `/matches/{id}/reviews`, `/matches/{id}/companion`.
  - **Giriş gerekli (42):** günlük (`POST /diary`, `PUT /diary/{id}`, `GET /diary`, `GET /shelf`, `GET /quick-rate`, `GET /rank`, `GET /profile`, `GET /skins`), oylar (`POST /matches/{id}/potm`, `PUT /matches/{id}/respect`), sosyal (`POST /reviews/{id}/like`, `POST /reviews/{id}/comments`, `POST /comments/{id}/respect`, `GET /activity`, `GET /people`, `/people/discover`, `PUT /people/{id}/follow`, `POST /follow`), listeler (`POST /lists`, `PUT|DELETE /lists/{id}`, `DELETE /lists/{id}/items/{match_id}`, `PUT /lists/{id}/order`, `GET /lists/mine`, `POST /lists/{id}/save|respect|items`), izleme (`POST /matches/{id}/watchlist`, `GET /watchlist`, `PUT /matches/{id}/appetite`, `POST /favorite`), companion (`POST /matches/{id}/pulse`, `POST /moments/{id}/mark`, `POST /matches/{id}/presence`), kurulum/ayar (`POST /onboarding`, `PUT /follows/sources`, `PUT /settings`, `POST /notifications/read`).
  - **Admin (6):** `GET|POST /admin/collections`, `DELETE /admin/collections/{id}`, `GET|POST|DELETE /admin/broadcasts`.
  - Not: `GET /lists/mine` rotası `GET /lists/{list_id}`'den ÖNCE tanımlı olmalı (sıra bozulursa "mine" sayı doğrulamasına takılır).
- **Test listesi (tüm paket 271/271; RankIt 235):** `test_rankit_social` 49, `rank` 27, `notify` 23, `visibility` 15, `reviews` 9, `catalog_refresh` 9, `hunt` 7, `web_surfaces` 6, `standing_people` 6, `lists` 6, `companion` 6, `web` 5, `states` 5, `skins` 5, `shell` 5, `match_sheet` 5, `discover` 5, `collectible` 5, `a11y` 5, `team_colors` 4, `sync_safety` 4, `short_label` 4, `home` 4, `codex_requests` 4, `desktop` 3, `responsive` 2, `marks` 2, `inspector` 2, `diary_merge` 2, `close_out` 1. RankIt dışı: `football_ws_draft` 14, `h2h_room` 11, `draft_parity` 11. `tests/conftest.py` arka plan işlerini testlerde kapatıyor (`RANKIT_BACKGROUND_JOBS=0`).
- **Migrasyon notları (hepsi `init_db` içinde, idempotent; canlıya YALNIZ deploy ile gider, elle SQL yok):**
  - Yeni tablolar: `rankit_collections`, `rankit_collection_items`, `rankit_collection_completions` (+ kısmi tekil indeksler `idx_rankit_collection_club`, `idx_rankit_collection_year`, `idx_rankit_collection_match`).
  - Yeni sütunlar: `rankit_watchlist.appetite`; `rankit_diary_entries.rated_at`, `.client_entry_id`, `.skin`; `rankit_review_comments.client_id`; `rankit_match_lineup_players.player_id`, `.position`, `.position_code`, `.sub_in`, `.sub_out`, `.replaced`; `rankit_moments.side`.
  - Yeni indeksler: `idx_rankit_watchlist_match`, `idx_rankit_diary_client`, `idx_rankit_comment_client`.
  - Tek seferlik veri dokunuşu: `init_db` açılışta yalnız rengi eski 6'lı hash paletinden gelen kulüpleri 12'li palete boyar (gerçek renkler eşleşmez, idempotent).
  - Eski satırlarda yeni alanlar `NULL`: seri `COALESCE(rated_at, created_at)` ile eski davranışa düşer; kadro alanları bir sonraki yenilemede dolar; `rankit_moments.side` bir sonraki yoklamada dolar. Kimsenin mevcut verisi değişmez.
- **Veri eksikleri (uydurulmayan, dürüstçe boş dönen alanlar):**
  - Stadyum (`12a`), görünen ad ve avatar (`6b` / `3i`), Primary Arch'ta tanıdık sayısı (`9b` / `14a`).
  - Editöryal `2f` özeti; canlı/kadro döngüsü yoklamadıysa maç olayları (`events_checked: false`).
  - Yayın eşlemeleri: kanal listesi var, turnuva–ülke kuralını sahibi admin ucundan giriyor; girilmeyende `broadcast` boş.
  - The Hunt seçki içeriği (ör. "Every London Derby") admin ucundan eklenmeli; kural koleksiyonları (kulüp sezonu, yılın Classic'leri) kendiliğinden çalışıyor.
  - Push teslimi yok: HANDOFF'un dört bildirim kanalı uygulama içi akışta kanal etiketi olarak var, telefon bildirimi olarak yok; "Streak at 22:00" hatırlatması yok.
  - NBA'de maç haftası olmadığı için sezon ısı haritası kapalı (`available: false`).
  - "A season followed end to end" ödülü kulüp sezonu tamamlamayla veriliyor (sahibin kararı); tarihsel maçlarda olay/kadro verisi yok.
- **Canlıya çıkış ön koşulları:**
  1. Bu denetimin hiçbir değişikliği commit/push/deploy edilmedi; canlı hâlâ `9a30706` üzerinde. Sıra: commit → deploy → `init_db` migrasyonları açılışta koşar.
  2. Deploy sonrası `POST /api/rankit/admin/clear-cache` (katalog `lru_cache`) ve `/api/rankit/sync-health` kontrolü.
  3. Canlı olay döngüsü (`rankit_live_sync.refresh_live_events`) deploy edilmeden `live_minute`, `live_updated_at`, maç olayları ve kadro güncellemeleri gelmez (Faz 5 notu: canlıda henüz yok).
  4. Arka plan işleri `RANKIT_BACKGROUND_JOBS` ile kapatılabilir; canlıda açık olmalı.
  5. Seçkiler admin ucundan girilmeli, yayın eşlemeleri admin panelinden.
  6. Canlıdaki demo maçları ve demo kullanıcıları sahibin kararıyla duruyor; uydurma `summary` metinleri onlarla birlikte kalır (yayıncı metni artık canlıda dönmüyor).
  7. Frontend bu sözleşmelerin çoğunu henüz bağlamadı (aşağıdaki devir listesi); backend değişiklikleri geriye dönük uyumlu — eski istemci çalışmaya devam eder.
- **Test:** yeni `tests/test_rankit_close_out.py` (1 test, on üç ısı yüzeyi). Tüm paket `tests/` 271/271.
- **Frontend için (Codex):**
  - [ ] Faz 1–17 devir listesi bu dosyada ("Frontend devir listesi") ve her backend kaydının sonundaki "Frontend için" bölümlerinde; §26'nın kalan maddeleri (renk, font, ızgara, 44 px hedefler, odak halkası, diyaloglar, çentik saç çizgisi, arma kutusu, yedi kart ön ayarı) frontend'in.
  - [ ] Yaşam döngüsü yürüyüşü (Phase 18): dört puanlama girişi de `6a`'ya çıkmalı; `6b` kök, `2p` pushed; ilk kurulum baştan sona; The Hunt hem Discover'dan hem Profile'dan; canlı / bitmiş-puansız / planlı maç iki yüzeyde de.
  - [ ] Yerel API'yi yeniden başlatmadan yeni alanlar görünmez (yeni tablolar ve sütunlar `init_db`'de).

#### Frontend pass — Aşama 5 `2f` olay sözleşmesi ve `15d` canlı dakika (kısmi) / 2026-09-22

- **Kaynak:** `BUILD.md` §9.2 ve Part IV Phase 5; mobil HTML `2f`/`15d`; Claude'un yukarıdaki backend devri (`GET /matches/{id}`: `events`, `events_checked`, `live_minute`). Aşama 5 hâlâ açık.
- **Yapılan:** Bitmiş maçın Match sekmesi önce maç yanıtındaki gol/kart/değişiklik listesini alıyor; ev/deplasman tarafı ve türüyle gösteriyor. Kontrol edilmiş boş liste “No match events were recorded”, sorgulanmamış maç “Match events are not available for this fixture” diyor. Eski API için Companion `moments` yedeği var. Canlı maç başlığı ve Match zaman çizgisi `live_minute` varsa onu gösteriyor; canlı durumda “Scheduled” yazmıyor. `15d` taslağının “ON THE PITCH” ve “CAME ON” iki ayrı bloğu korunuyor.
- **Doğrulama:** 41/41 frontend Node testi, hedefli ESLint ve Vite üretim derlemesi geçti. 375×812 yerel tarayıcıda bitmiş, olay yanıtı olmayan maçın boş hali görüldü. Çalışan API eski süreç olduğu için yeni olay dolu görsel kabulü yapılmadı; `GET /matches/54609` yanıtında `events`/`events_checked` hâlâ yok. Dolu olay, gerçek canlı dakika ve tüm beş maç evresi kabulü sırada. Commit, push, deploy, APK yapılmadı.

#### Backend pass — Frontend geçişi: sözleşme matrisi, bildirim uyumu, yerel olay örneği / 2026-09-22

- **BUILD maddesi ve ekran kodu:** `frontend_code.md` §"Claude / frontend'e geçiş kapısı" (mobil kapanmadan web'e yazma yok; önce API–UI sözleşme matrisi ve eksik veri listesi); `3f` / `13a` koleksiyon satırı (§24), `2f` (§9 "result + events").
- **İncelenen endpoint / tablo:** `frontend/src/rankit/` alan taraması (hangi API alanını hangi dosya okuyor), `rankit_notify._closing_collection`, `GET /matches/{id}` `events`.
- **Bulgu:**
  1. Faz 9.5'te koleksiyon kapanış öğesinin alanları `list_title` / `rated` → `collection_title` / `collected` oldu; `Alerts.jsx` hâlâ eski adları okuyor ve satır "**undefined** is one match from closing" basıyor. Bu, backend değişikliğinin frontend'de kırdığı tek yer (tarama sonucu).
  2. Frontend'in bağlamadığı alan kümeleri ölçüldü: `6a` makbuzu (kart numarası, deltalar, koleksiyon karosu, `season_award`, `client_entry_id`), `3j` (`tonight_counted` / `at_risk`), The Hunt uçları, skinler, listeler düzenleme, `3d` POTM cetveli, tekrar güvenli toggle (`on`), "That's all" bayrakları, `is_mine`, `match_short`, `live_updated_at`, `broadcast`, tüm web fazları.
  3. Yerelde hiç yoklanmamış maçta `events: []` + `events_checked: false` doğru davranış; ama frontend'in "dolu olay" görsel kabulü için örnek yok.
- **Yapılan backend değişikliği:**
  - `rankit_notify._closing_collection`: geçiş uyumu için `list_title` ve `rated` takma adları da gönderiliyor (`list_id` bilerek YOK — mevcut arayüzü yanlış listeye götürürdü; satır maça düşer). Codex `collection_id` / `collected`e geçince kaldırılacak.
  - Yeni `src/scratch/seed_local_match_events.py`: yerel bir bitmiş maça 2 gol + 1 kırmızı kart + 63' oyuncu değişikliği yazar, `events_polled_at` damgalar; `--undo` yalnız kendi satırlarını siler; prod ortam değişkeni varsa çalışmaz.
  - Yeni `API_UI_MATRIX.md` (depo kökü): ekran / uç / alan / frontend durumu (okuyan dosyayla) / sıradaki kapı; eksik veri listesi ve tuzaklar (puan alanı gönderilmezse dokunulmaz, koleksiyon alan adları, canlıda `broadcaster: null`, `init_db` yeniden başlatma, 20 eşiği).
- **Test:** `tests/test_rankit_notify.py` + `tests/test_rankit_web_surfaces.py` 29/29 (takma adlar mevcut testleri bozmuyor). Seed betiği veritabanının kopyasında uçtan uca doğrulandı (4 olay, taraflarıyla; geri alma temiz). Tüm paket 271/271 (takma ad değişikliğinden önce ölçüldü; bu değişiklik yalnız alan ekliyor).
- **Kalan bağımlılık veya veri eksikliği:**
  - Yerel API sürecini sandbox'tan yoklayamıyorum (bağlantı reddedildi); "eski süreç" tespiti Codex'in gözlemine ve sözleşmeye dayanıyor.
  - Takma adlar geçici: Codex `collection_id` / `collection_title` / `collected`e geçince kaldırılacak.
  - Commit, push, deploy ve canlı veri değişikliği yapılmadı.
- **Frontend için (Codex):**
  - [ ] Yerel API'yi yeniden başlat (`uvicorn api.main:app --reload`): `events` dışında `skin`, `client_id`, `rankit_moments.side` ve koleksiyon tabloları da açılışta geliyor.
  - [ ] Dolu olay görsel kabulü için: `python src/scratch/seed_local_match_events.py` (geri al: `--undo`).
  - [ ] `3f` / `13a` koleksiyon satırını `collection_title` / `collection_id` / `collected` ile yeniden bağla; hazır olunca haber ver, takma adları kaldırayım.

#### Frontend pass — Aşama 5 `2f` dolu olay ve Aşama 6 `6d` arşiv kabulü (kısmi) / 2026-09-22

- **Kaynak:** `BUILD.md` §9.2/Part IV Phase 5 ve §12.1/Phase 6; mobil HTML `2f`, `6d`; yeni backend `GET /matches/{id}` `events`/`events_checked` ve `GET /matches/{id}/watchalong?before_id=` `has_more`/`next_before_id`.
- **Yapılan:** `2f` ev/deplasman olay satırları tür simgesiyle çizildi; uzun oyuncu değişikliği etiketi dar ekranda sarılıyor, alt eylem düğmeleri tek satırda kalıyor. `6d` “Read the thread” ilk son-100 sayfasından önceki mesajları “Load earlier messages” ile başa ekliyor; WebSocket ile gelen yeni mesajlar korunuyor, aynı `id` iki kez gösterilmiyor. Son sayfada yükleme düğmesi kalkıyor; oda maçtan sonra salt okunur.
- **Görsel/işlev kanıtı:** Gerçek geliştirme DB'sine dokunulmadı. SQLite yedek kopyası geçici dizinde açılıp Claude'un yerel olay betiği yalnız bu kopyaya uygulandı; yeni API 8011 ve Vite 5174 üzerinden 375×812 test yapıldı. `54609` test maçında 23' ev golü, 58' deplasman golü, 63' ev değişikliği, 71' deplasman kartı doğru sütunda görüldü. Aynı kopya DB'de 205 QA mesajı 100+100+5 olarak yüklendi: ilk `001`, son `205`, tekrar yok, sonrasında eski sayfa düğmesi yok, yazma alanı yok. Bu kontrollü QA verisi, sağlayıcının geçmiş maçlarında olay kapsamının tamam olduğu iddiası değildir.
- **Doğrulama:** 43/43 frontend Node testi, hedefli ESLint ve Vite production build geçti; 375×812 olaylı ve 205 mesajlı mobil ekranlar görüldü. Phase 5'in diğer evreleri ve Phase 6 iki hesaplı canlı kabulü açık. Commit, push, deploy, APK yapılmadı.

#### Frontend pass — `3f`/`13a` koleksiyon bildirimi alan uyumu (kısmi) / 2026-09-22

- **Kaynak:** `BUILD.md` bildirim sözleşmesi, mobil HTML `3f`/`13a`; Claude'un `API_UI_MATRIX.md` ve backend geçiş notu. Bu, bildirim ekranının bütünüyle kabulü değil, kırık alan adının onarımıdır.
- `Alerts.jsx` yeni `collection_title` ve `collected` alanlarını okuyor; eski API için `list_title`/`rated` yedeği var. `collection_id` bir kullanıcı listesi kimliği sayılmıyor; The Hunt koleksiyon ekranı bağlanana kadar satır, backend'in verdiği kalan `match_id` maçına açılıyor.
- Hedefli ESLint, `git diff --check` ve Vite production build geçti. Gerçek koleksiyon bildirimi yerel tarayıcıda bulunmadığından görsel kabul açık. Backend'in geçici `list_title`/`rated` takma adları yeni istemci için artık gerekli değil; eski sürüm istemciler desteklenecekse kaldırma zamanı ayrıca değerlendirilmeli. Commit, push, deploy, APK yapılmadı.

#### Frontend pass — Aşama 5 `15a`/`2g` topluluk hükmü kapısı (kısmi) / 2026-09-22

- **Kaynak:** `BUILD.md` §3.1 ve §9.3–9.4; mobil HTML `15a`/`2g`. Kullanıcının kendi kararı kesinleşmeden kalabalığın sonucu puanı çapalamasın; `REVEAL ANYWAY` açık kalır.
- **Bulgu ve düzeltme:** `MatchDetail` yerelde dokunulmuş yıldızı `my_rating` olarak topluluk kapısına geçiriyordu. Kaydetmeden yıldız seçmek ısı/yorum kapısını açıyordu. Kapı artık yalnız gerçek maçtaki kayıtlı puanı veya başarılı kayıt sonrası `6a`dan “Edit” ile gelen onaylı girişi sayıyor; çevrimdışı kuyruğa alınmış giriş hükmü açmıyor. Yıldız taslağındaki edit alanları korunuyor, sadece kalabalık hükmü saklı kalıyor.
- **Doğrulama:** `heat-policy.test.mjs` taslak/kuyruk/onaylı-makbuz ayrımını test ediyor; 43/43 frontend Node testi, hedefli ESLint, `git diff --check`, Vite production build geçti. Bu kod kanıtı, `15a`/`2g` mobil görsel kabulünün yerine geçmez. Faz 5'in planlı/canlı/bitmiş beş evresi ve `15b` seçici uçtan uca kabulü açık. Commit, push, deploy, APK yapılmadı.

#### Frontend pass — Faz 5 `2h`/`15d` ve kart yayıncısı (kısmi) / 2026-09-22

- **Kaynak:** `BUILD.md` §9 / Phase 5, mobil HTML `2h`/`15d`, `MOBILE_ACCEPTANCE.md` Faz 5, `API_UI_MATRIX.md` yayıncı ve bayat canlı veri satırları.
- **API yeniden başlatma:** 8010'u dinleyen eski Python süreci belirlenip yeniden başlatıldı; `GET /api/rankit/matches/54609` artık `events` anahtarı ve `events_checked: false` döndürüyor. Dolu `2f` örneği daha önce yalnız geçici DB kopyasında kabul edildiği için canlı geliştirme DB'sine seed uygulanmadı.
- **2h yapılan:** Community'de kişisel 1–5 maç öncesi okuması `PUT /matches/{id}/appetite` üzerinden kaydoluyor; seçili rakama tekrar dokunma `null` gönderiyor. Yerel kickoff kapısı ve sunucu 409 sonucu seçeneği kapatıyor. 401 ve ağ reddinde seçim geri alınıp açık hata veriliyor. Başarılı yanıt izleme listesi durumuna ve taze maç GET'ine bağlandı. Beklenen ısı `ExpectedHeat` üzerinden 20 eşikle ayrı kalıyor.
- **2h görsel/işlev kanıtı:** 375×812 yerel gerçek API'de 24 Eylül Hapoel–Bayern planlı maçında `0` okuma için `TOO FEW RATINGS`, Community'de 1–5 kontrolü ve 48px dokunma hedefleri görüldü. Yerel API oturumsuz istekleri demo hesaba yönlendirdiği için 3/5 seçimi başarıyla kaydedildi; testte oluşan maç `17049` watchlist satırı `{on:false}` ile kaldırıldı ve `my_appetite:null`, `watchlisted:false` doğrulandı. Görsel kapsam dolu beklenen ısı ve gerçek 409 halini kapsamaz.
- **Yayıncı tuzağı:** Ana ekran `country` parametresini gönderiyor; kart ayağı eski demo `broadcaster` değerini değil ülkeye göre `broadcast.channels`/`confidence` alanını kullanıyor. `confirmed` ve `typical` dili farklı, veri yoksa yalnız “Broadcast details pending”. Gerçek yayın eşlemeli kart görsel kabulü açık.
- **15d:** SQLite UTC `live_updated_at` damgası yerel saat sanılmıyor. 45 saniyelik dört yoklama kaçırıldığında (3 dakika) detay başlığı ve zaman çizelgesi “DELAYED / Updates delayed” gösteriyor; kırmızı tazelik vurgusu nötrleşiyor. Gerçek canlı maçta görsel kabul ve canlı kartın bayat işareti açık.
- **Doğrulama:** 47/47 frontend Node testi, hedefli ESLint, `git diff --check`, Vite production build geçti. Faz 5 tamam sayılmadı; commit/push/deploy/APK yapılmadı.
- **Şema:** yeniden başlatma sonrası yerel `data/app.db` salt-okunur sorgulandı; `skin`, `client_id`, `side` sütunları ile `rankit_collections`, `rankit_collection_items`, `rankit_collection_completions` tabloları mevcut.
- **15b veri kapısı:** yerel `rankit_match_lineups` tablosu salt-okunur sorguda 0 satır / 0 maç. Oyuncu seçici için doğrulanmış kadrolu gerçek maç görsel kabulü bu veriyle yapılamıyor; sezon kadrosu ilk 11 gibi gösterilmeyecek. Bir sağlayıcı kadrosu veya yalnız QA veritabanında kontrollü fixture gerekiyor.

#### Frontend pass — Aşama 4 görsel kabulü TAMAMLANDI (iki yüzey) / 2026-09-23

- **Kaynak ve sıra:** `BUILD.md` §3 / §3.1 / §5.5 / §1.3 / §9.3; Bağımlılık sırası Aşama 4. Aşama 4'ü açık tutan tek gerekçe kendi kaydındaki cümleydi: *"Tarayıcı görsel kabulü bu geçişte yeniden yapılamadı."* Bu geçiş onu kapatıyor.
- **Neden gecikmişti — ölçüm düzeneği eksikti:** politikanın üç durumu geliştirme veritabanında **gözlenemiyordu**. Ölçtüm: puanlı yalnız 2 maç var (en çok 5 puan, yani 20 eşiği hiç aşılmıyor), ikisini de yerel anonim izleyici `rankit_demo` puanlamış (yani §3.1 "puanlamamış izleyici" kapısı hiç açılmıyor) ve spoiler işaretli tek bir inceleme yok.
- **Düzenek (gerçek app.db'ye DOKUNULMADI):** `src/scratch/seed_qa_visibility.py` — veritabanının bir **kopyasına** yazıyor (gerçek yola yazmayı reddediyor), hesaplar açıkça sentetik (`qa_viewer_01…22`), incelemeler "QA fixture" diyor, prod ortam değişkeni görürse başlamıyor. Kopya `DB_PATH` ile ikinci API'ye (8011) ve `API_PORT` ile ikinci Vite'a (5174) bağlandı. Senaryo: bitmiş ve **hiç puanlanmamış** bir maça 22 puan + 1 spoiler incelemesi; ayrı bir başlamamış maça 22 appetite okuması. **Kabul sonrası iki sunucu durduruldu, kopya silindi; gerçek DB doğrulandı: 14 günlük satırı, 0 `qa_viewer`, 0 appetite — başlangıçtaki hâli.**

**Ölçülen davranış — telefon (375×812):**

| Kural | Beklenen | Gözlenen |
| --- | --- | --- |
| §5.5 eşik altı | ısı yok, sayı dürüst | `TOO FEW RATINGS` (3 ayrı maçta) |
| §5.5 eşik üstü (22) | ısı + **sayı** (§1.3) | rampa + `4.5`, `22 ratings` |
| §3 skor gizli | sonuç saklı, tek dokunuş | `Valencia vs Real Sociedad` + `TAP TO REVEAL`; açılan satır **yalnız kendisi**, diğerleri kapalı kaldı |
| §3.1 iki ayrı karar | skor açılsa da hüküm kapalı | skor `2 – 3` göründü, hüküm hâlâ `REVEAL ANYWAY` + *"Rate it first…"* |
| §3 yazar spoiler'ı | kendi kapısı | `Spoiler review / Tap to reveal` |
| §9.3 | puan olmadan açılmaz | *"Tags, players and a review open once there is a rating."* |
| Expected vs community | ayrı sinyal, ayrı dil | `EXPECTED HEAT 4.1` + *"From 22 members who want this one. Not a prediction — an appetite reading."*; 0 okumada `TOO FEW RATINGS` + *"Heat opens at 20 readings."* |
| Akış (review alt yüzeyi) | sunucu sakladıysa yerel reveal yok | spoiler'sız satır `CONTAINS SPOILERS · TAP TO SHOW` + `REVEAL ANYWAY`; **sunucunun sakladığı** satır `OPEN MATCH` (açılacak metin yok) — ikisi doğru ayrışıyor |
| Bildirim alt yüzeyi | hüküm/skor sızmaz | `/notifications` yanıtında `rating`/`community_rating`/`score` **yok**; `has_more:false`, 2 satır |

**Ölçülen davranış — web (aynı düzenek):** cihaz tercihi (`hideScores`) iki yüzeyde ortak; duvar kartı `PLAYED` + `—`; Inspector `PLAYED` + `Reveal match`, Community sekmesi `CONTAINS SPOILERS · TAP TO SHOW` + `REVEAL ANYWAY`; açıldığında `FULL TIME 2 – 3`, `4.5 COMMUNITY`, `5 REVIEWS`, `0 CLASSICS` ve spoiler incelemesi hâlâ kapalı (`Contains spoilers — tap to read`).

- **BULUNAN VE DÜZELTİLEN AYRIŞMA (bu aşamanın asıl konusu):** web'de `Reveal match` **hem skoru hem topluluk hükmünü** açıyordu (`RankItWeb.jsx:633`, `setScoreRevealed(true); setCommunityRevealed(true)`), telefonda ise yalnız skoru açıyor. §3.1 ikisini iki ayrı karar sayıyor ve bu dosyanın kendi 2026-09-22 kaydı da bunu yazmış: *"bu dokunuş topluluk hükmünü otomatik açmıyor"*. Web tek satırla telefona hizalandı; tarayıcıda doğrulandı (skor açıldı, hüküm `REVEAL ANYWAY` olarak kaldı). Ters yön (hükmü açmak skoru da açar) **bilerek** korundu ve artık iki yüzeyde de aynı: hüküm kapısının kendi metni zaten spoiler uyarısı veriyor.
- **Test:** yeni `frontend/tests/visibility-policy.test.mjs` (3 test) bu kuralı kaynaktan çiviliyor — iki yüzeyde de skor-açma işleyicisi `setCommunityRevealed` çağıramaz, ve hüküm kapısının iki durumu birden açması ikisinde de aynı kalmalı. **Mutasyon:** web'i eski hâline döndürdüm → **kırmızı**; dosya bayt-aynı geri yazıldı. Frontend **80/80**, Vite production build geçti.
- **Kalan (Aşama 4 kapsamı DIŞINDA, bilerek):** `RankIt Web.dc.html` içindeki 29 ekran kodunun tam kabul taraması bu dosyanın kendi eşlemesiyle **Aşama 15–17'ye** bağlı; Aşama 4 burada kapanırken o iş oraya kalıyor. Ayrıca kabul sırasında görülen ve Aşama 4'e ait olmayan bir bulgu: arama `Tromso` yazınca `Tromsø` maçlarını bulmuyor (aksan normalizasyonu yok — `CLAUDE.md`'de zaten bilinen kısıt). Commit, push, deploy, APK yapılmadı.

#### Frontend pass — Aşama 5 (koleksiyon anı `6a`) kapandı / 2026-09-23

- **Kaynak:** `BUILD.md` §4 / §4.1 / §1.2; ONARIM bağımlılık sırası Aşama 5. (Numaralandırma uyarısı için "Aktif aşama" bölümüne bakın — buradaki 5, BUILD Part IV'ün Phase 5'i değil, Phase 4'üdür.)
- **Başlangıç durumu:** ekran vardı ve iyi kurulmuştu (tam ekran sonuç, kart `crestSize={52}`, Share / Skin / Edit, kuyruk ve edit durumları, kutlama değil sonuç). Eksik olan şey ölçülünce çıktı: **uç zaten `card_number`, `collection` ve `season_award` döndürüyordu, ekran üçünü de okumuyordu.**
- **§4.1 ile farklar ve düzeltmeleri:**
  1. *"one line of what happened ('That's card 143.')"* — cümle kaçıncı kart olduğunu söylemiyordu. Artık `card_number`'dan: **"That's card 12. Lyon vs Auxerre."** Çevrimdışı kuyrukta receipt yok, o zaman **sayı söylenmiyor** (istemci kaçıncı kart olduğunu sayamaz: başka cihazdan eklenen kayıtları bilmez).
  2. *"three deltas (streak, points, **any collection advanced**)"* — üçüncü delta "Diary entries" idi; o bilgi zaten cümlede ve durum satırında (`SAVED TO YOUR DIARY` / `ENTRY UPDATED`) var, ilerleyen koleksiyon ise hiçbir yerde yoktu. Artık **`3/34 +1 · The 34`** karosu; koleksiyon yoksa karo **hiç çizilmiyor** (boş bir `0/0` uydurulmuyor).
  3. *"Gold appears once: the Classic hairline if stamped, otherwise the primary action. Never both."* — ekranda **hiç** altın yoktu. Artık Classic damgasızken birincil eylem (Share) altın; Classic damgalıyken Share nötr, altın kartın hairline'ında. İki durum da tarayıcıda ölçüldü: damgasızda `background: rgb(255,177,27)`, damgalıda `rgb(21,22,24)` ve kartta gold hairline + CLASSIC.
  4. `season_award` da bağlandı (nadir ve büyük olduğu için delta değil, kendi satırı).
- **Dört rating yolu (§4.1 "all four resolve into the same screen"):** ölçüldü — maç sheet'i **doğrudan** `6a`'ya iniyor; mobil quick-rate (`3j`) bir bulucu, seçilen maçı sheet'te açıyor ve oradan `6a`'ya iniyor; Companion canlı okuması **puanlama değil** (§9.2) ama `onRate` ile sheet'in Community sekmesine tohumlayıp oradan `6a`'ya iniyor. Kalan ikisi **henüz yok ve bu aşamanın işi değil**: üç adımlı first run'da puanlama adımı yok (ONARIM Aşama 12) ve web'in `R` quick-rate diyaloğu (§20, BUILD Phase 16–17 / ONARIM Aşama 16–17) hiç kodlanmamış. BUILD Phase 4'ün kendi talimatı da bu sırayı söylüyor: *"Build it before the surfaces that navigate to it."* İki yüzey kodlandığında buraya inmeleri o aşamaların kabul şartıdır.
- **Ölçüm düzeneği:** yine gerçek `app.db`'ye dokunulmadan kopya + ikinci API (8011) + ikinci Vite (5174). Kopyada bir kulüp takip edilip (`club_season` koleksiyonu böyle doğuyor) o kulübün üç maçı arayüzden gerçekten puanlandı; `6a` üç kez görüldü (koleksiyonsuz, koleksiyonlu, Classic damgalı). Sonra iki sunucu durduruldu ve kopya silindi; gerçek DB'de günlük satırı sayısı başlangıçtaki **14**.
- **Test:** `frontend/tests/rankit-collectible.test.mjs` 11 test (4 yeni: kart numarası + koleksiyon + sezon ödülü uçtan geliyor; çevrimdışı kuyrukta hiçbiri uydurulmuyor; koleksiyon yoksa karo yok; bozuk `card_number` sayı sayılmıyor; ayrıca altın bütçesi kaynaktan denetleniyor). **Mevcut üç test eski üç-delta davranışını kodluyordu; sözleşme BUILD'e göre değiştiği için onlar da güncellendi** (davranış değişikliği bilerek, testler ona uyduruldu — tersi değil). **Mutasyon:** altın sınıf geçişi ve `card_number` okuması tek tek bozuldu → ikisinde de **kırmızı**, dosyalar bayt-aynı geri yazıldı. Frontend **85/85**, hedefli ESLint temiz, Vite production build geçti.
- **Bilerek ertelenen:** Skin düğmesi hâlâ pasif ve dürüst bir not taşıyor (*"Card skins and image export are being prepared"*) — yedi skin ve paylaşım görseli (§4.2 / §4.3) ONARIM **Aşama 12**'nin işi. Commit, push, deploy, APK yapılmadı.

#### Frontend pass — Aşama 6 (rating ve entry durum modeli) kapandı / 2026-09-23

- **Kaynak:** `BUILD.md` §9 tablosu / §9.1 / §9.3 / §5.4; ONARIM bağımlılık sırası Aşama 6.

**Bulunan iki kusur (ikisi de durum modelinin JSX içinde tek satıra sıkışmasından):**

1. **Puanlanmış maç açıldığında birincil eylem ETKİNDİ.** `saveState` o oturumda kayıt yapılmadığı için `"idle"`, `dirty` de `false` — yani koşul `!dirty && ["saved","queued"].includes(saveState)` tutmuyordu ve düğme **"Update Diary Entry" yazıp tıklanabilir** duruyordu. Değiştirilecek hiçbir şey yokken tıklanan bir birincil eylem, §9 tablosunun `Full time, rated → —` satırına aykırı. Artık sunucuda karşılığı olan bir kayıt varsa (kimlik **veya** izlenme tarihi **veya** yüklenmiş puan) ve değişiklik yoksa **atıl**; ilk dokunuşta geri açılıyor.
2. **Puansız evrenin atıl düğmesi "Log this match" diyordu.** BUILD bu evre için tek bir etiket veriyor: **"Rate this match"** (§9 tablosu). Düzeltildi.

- **Yapılan:** etiket + etkinlik mantığı `redesign/saveCta.js`'e saf fonksiyon olarak çıkarıldı (idle / dirty / saving / saved / queued / error). §5.4 gereği **hata durumunda tekrar denemek her zaman açık** — iş kaybolmuyor.
- **Tarayıcıda doğrulandı (gerçek geliştirme verisi, salt okuma):** puanlanmamış bitmiş maçta alt kat `Rate this match` + `disabled:true`; puanlanmış maç (Barcelona–Inter) açılışta `Update Diary Entry` + `disabled:true`, bir yıldıza dokununca `disabled:false` + `UNSAVED CHANGES`. **Kaydedilmedi**; DB'de günlük satırı 14, maç 3'ün puanı 5.0 — değişmedi. Bırakılan yerel taslak da temizlendi.

**Beş yaşam evresi — hepsi ölçüldü.** Üçü yerel veride hiç gözlenemiyordu (canlı maç yok, XI açıklanmış başlamamış maç yok), o yüzden yine **kopya** üzerinde: 54610 (West Ham–Leeds) zaten **gerçek sağlayıcı kadrosu** taşıyor, yalnız `status`/`starts_at` değiştirildi.

| Evre | §9 beklentisi | Gözlenen |
| --- | --- | --- |
| Scheduled, no XI | sezon kadrosu notu, expected heat, birincil **Add to watchlist** | `SEASON SQUADS` + *"a season squad is not a starting eleven"*; birincil Add to watchlist |
| XI announced | kadro notun YERİNE geçer, birincil **Watch with your Companion** | `CONFIRMED LINEUP · Can change until kick-off`, 4-2-3-1 + MANAGER; birincil `Watch with your Companion`, watchlist `secondary`'ye düştü |
| Live | canlı skor, XI, dakikalı değişiklikler; **moments/pulse YOK** | `LIVE · 63'`, `ON THE PITCH`, `CAME ON 46' … 88' …`; *"Stars and players open at full time. Moments and the crowd pulse live in the Companion."* |
| Full time, unrated | davet (`15a`), atıl birincil eylem | `YOUR ENTRY / NOT LOGGED`, *"How was it?"*, tek kesikli satır, atıl `Rate this match` |
| Full time, rated | entry + kalabalık, birincil eylem **yok** | `YOUR ENTRY / SAVED`, `Update Diary Entry` atıl |

- **§9.1 tek kural:** üç maç-öncesi/canlı evrenin **üçünde de ölçülen yıldız sayısı 0**. Companion'daki canlı okuma yıldız değil, beş kademe (`COLD/FLAT/GOOD/GREAT/HOT`) — *"deliberately not a rating"*.
- **§9.2 ayrışma:** Match sekmesi kimin sahada olduğunu, Companion `CROWD PULSE` / `MOMENTS` / `LIVE CHAT`'i gösteriyor; ikisi birbirinin kopyası değil. Companion sekmesi kaybolmuyor, yalnız rozeti `LIVE` oluyor.
- **Fikstür dersi (kayda geçsin):** ilk denemede maçı canlı yapmak için `provider=NULL` yazdım; maç **katalogdan ve aramadan kayboldu**. Sebep ürün kusuru değil: katalog `m.provider IS NOT NULL` istiyor (sağlayıcı kaynaklı olmayan maç listelenmiyor). Ayrıca `provider='fotmob'` bırakılırsa canlı senkron maçı gerçek sağlayıcıdan okuyup saniyeler içinde `finished`a geri çeviriyor — **doğru davranış**. Çözüm: `provider='qa'` (null değil ama poll edilen üç sağlayıcıdan da değil).
- **Test:** yeni `frontend/tests/save-cta.test.mjs` (7 test: puanlanmış maçta atıl, düzenlemede açık, ilk kayıtta açık, beş durumun cümlesi/etkinliği, hata durumunda tekrar hep açık, rewatch "Update" demez, atıl etiket BUILD'in verdiği etiket). **Mutasyon:** `disabled: !dirty && hasEntry` ve `RATE_CTA` tek tek bozuldu → ikisinde de **kırmızı**, dosyalar bayt-aynı geri yazıldı. Frontend **92/92**, Vite production build geçti.
- **Kalan:** `POTM / Respect / Classic / tags / review / spoiler` alan durumları bu geçişte ayrı ayrı ölçülmedi — §9.3'ün "dört ölü kontrol yerine tek kesikli satır" kuralı ve §9.4'ün `2g` blok sırası Aşama 8'in (match sheet evreleri) kabulünde ele alınacak. Commit, push, deploy, APK yapılmadı.

#### Frontend pass — Aşama 7 (alt akış bileşenleri) / 2026-09-23

- **Kaynak:** `CODE.md` §2 kaynak önceliği; **`RankIt Redesign.dc.html#15b` ve `#15c`** (görsel yapı), `BUILD.md` §10.2 ve §11.1 (davranış).
- **Önce bir itiraf:** bu oturumda Aşama 4–6'yı BUILD metnine ve çalışan uygulamaya karşı denetledim; **`.dc.html` tahtalarını açmadım.** `CODE.md` §2 tahtaları BUILD'den hemen sonra, ONARIM'ın üstünde tutuyor ve "işe başlamadan önce ilgili HTML ekran kodları okunmalı" diyor. Kullanıcı hatırlattı; bu geçiş tahtadan yürüdü ve bundan sonraki aşamalarda ekran kodu önce açılacak.

**`15b` — oyuncu seçici: tahtayla birebir, değişiklik gerekmedi.** Tahta `POTM 1 / 1`, `RESPECT 1 / 2` bütçe satırını, takım sekmelerini ve `# | STARTED | POTM | RESP` sütunlarını istiyor; `PlayersPicker.jsx` üçünü de aynen taşıyor (ayrıca `CAME ON` grubu).

**`15c` — inceleme yazma ekranı: YOKTU, kuruldu.** Yerine maç sayfasına gömülü bir `<textarea>` vardı. §11.1 bunu ayrı bir ekran olarak tanımlıyor: *"reached from the entry and saves back into it. The button reads **Save to your entry**, never Post."*

- Yeni `redesign/ReviewComposer.jsx` + `rankit-v030.css` bloğu. Tipografi **tahtadan ölçülerek** alındı: başlık Rajdhani 700 13px/1, maç satırı Outfit 400 12px/1, puan 11.5px/1, CLASSIC Rajdhani 700 9px/1, metin **Outfit 400 13px/1.65**, etiketler 9px/1, sayaç 11.5px/1, düğme 13px/1. Tarayıcıda ölçülen metin fontu: `13px / 21.45px Outfit` (= 13 × 1.65). ✔
- Tahtanın kopyası birebir: `Write about the night`, `OUTFIT · WHAT YOU SAY, NOT WHAT THE PRODUCT SAYS`, `88 / 4,000` biçimli sayaç, `THIS WILL BE SPOILER-SHIELDED` + *"Anyone with the shield on sees CONTAINS SPOILERS · TAP TO SHOW instead of your words. Write as if they will read it anyway."*
- Girdide artık oyuncu satırıyla aynı dilde bir satır var (`YOUR REVIEW · … · WRITE/EDIT`), ekranı o açıyor. **Tur tarayıcıda doğrulandı:** açılışta imleç metnin sonunda, sayaç canlı (`28 / 4,000`), `Save to your entry` → ekran kapanıyor, metin **girdiye** düşüyor ve girdi `UNSAVED CHANGES` oluyor. Composer **sunucuya hiçbir şey yazmıyor** — kaydetmek girdinin işi. DB'de günlük satırı 14, deneme metni DB'de yok.
- Bu ekranın tek altını birincil eylem (§1.2 bölge başına bir altın).
- **Uydurulmayan şey:** tahtada `5.0 · All-timer` yazıyor. `All-timer` tahtada yalnız bu bir kelime olarak geçiyor ve **BUILD beş kademeli bir kişisel-puan sözlüğü tanımlamıyor**; ısı adları (`COLD…HOT`) da buraya konamaz, çünkü §5.5 *"a user's own stars are not heat"* diyor. Kalan dördünü uydurmak yerine sayı gösteriliyor. **Karar noktası (kullanıcı/Codex):** beş kademelik kişisel puan sözlüğü istenirse tanımlanmalı, yoksa tahtadaki kelime tekil bir örnek olarak kalır.
- **Test:** yeni `frontend/tests/review-composer.test.mjs` (6 test: tahta kopyası birebir, düğme `Save to your entry` ve asla `Post`, ekran girdiye geri yazıyor ve `rankitApi` çağırmıyor, 4.000 sınırı + binlik ayıraç, eski satır içi textarea kalmadı, puan sözlüğü uydurulmadı). **Mutasyon:** düğme etiketi ve girdideki tetikleyici tek tek bozuldu → ikisinde de **kırmızı**, dosyalar bayt-aynı geri yazıldı. Frontend **98/98**, Vite production build geçti, ESLint `RankItPrototype.jsx`'te **6** (geçiş öncesiyle aynı; bu geçişte bıraktığım kullanılmayan `displaySaveState` temizlendi), `ReviewComposer.jsx` temiz.
- **Kalan:** web composer **`15z`** (§11.1 "15c mobile, 15z web") hâlâ Inspector içinde satır içi bir textarea; ONARIM **Aşama 16**'nın işi ve orada bu bileşenin web varyantıyla karşılanmalı. Ortak state/API katmanı (`entryState.js`, `saveCta.js`, `ratingField.js`, `rankitApi.js`) yerinde. Commit, push, deploy, APK yapılmadı.

#### Frontend pass — Aşama 8 (match sheet'in beş yaşam evresi) / 2026-09-23

- **Kaynak sırası bu kez doğru işletildi:** önce ekran kodları (`RankIt Redesign.dc.html#2h`, `#15d`, `#15a`, `#2f`, `#2g`), sonra `BUILD.md` §9–§9.4, en son kod.
- **Kullanıcı kararı (2026-09-23):** `15c`/`2g` tahtasındaki `5.0 · All-timer` için beş kademeli kişisel puan sözlüğü **yazılmayacak, sayı kalacak**. Aşama 7'de açılan karar noktası böylece kapandı.

**Bulunan ve düzeltilen kusur — ham sağlayıcı kodu ekranda (`15d`).**
Canlı kadro satırı mevki yerine FotMob'un **ham sayısal `position_code`'unu** basıyordu: `1 Mads Hermansen 11`, `2 Kyle Walker-Peters 32`, `28 Tomás Soucek 64`. Sebep `LiveLineup.jsx`'teki `p.position_code || p.position` sırası — ham kod okunabilir etiketin önüne geçiyordu. Ekrandaki "32" bir mevki değil, sızmış bir iç kimlik.
- Yeni `redesign/positionAbbr.js`: arka ucun beş kaba mevkisini kısaltıyor (`Keeper→GK`, `Defender→DF`, `Midfielder→MF`, `Winger→WG`, `Striker→ST`). Bilinmeyen etikette sütun **boş** kalıyor; ham koda asla düşmüyor.
- **Tahtanın `CB`/`AM` ayrımı bizde YOK ve uydurulmadı:** `rankit_live_sync.POSITION_CODES` sağlayıcının kodlarını bilerek beş kaba mevkiye indiriyor. Ham koddan `CB` türetmek sahip olmadığımız bir kesinliği uydurmak olurdu. Daha ince mevki istenirse bu bir **arka uç veri derinliği** kararıdır.
- Seçici (`15b`) uzun biçimi kullanmaya devam ediyor — tahtada orada da uzun yazıyor ("Goalkeeper", "Centre back"); dar olan canlı satır.
- Tarayıcıda doğrulandı (canlı fikstür): `GK / DF / DF / DF / DF / MF`.

**Beş evrenin tahtaya karşı durumu**

| Ekran | Tahtanın istediği | Durum |
| --- | --- | --- |
| `2h` | expected heat + "Not a prediction — an appetite reading", SEASON SQUADS notu, birincil Add to watchlist | ✔ (Aşama 6'da ölçüldü) |
| `15d` | ON THE PITCH + kısa mevki + CAME ON dakikalı + "Moments and the crowd pulse live in the Companion" | ✔ kusur düzeltildi |
| `15a` | YOUR ENTRY/NOT LOGGED, "How was it?", tek kesikli satır, atıl birincil eylem | ✔ |
| `2f` | özet cümlesi, yayın bloğu, CONFIRMED LINEUP + "Can change until kick-off" | ✔ (`match.summary` `ri-summary` ile ve **skor gizliyken çizilmiyor** — özet sonucu ele verir) |
| `2g` | tek `TAGS & PLAYERS` bloğu: 3 etiket bir satır, sonra 1 POTM + 2 respect | ✔ §9.4 sırası doğru |

**Kayda geçen iki uyuşmazlık (düzeltme değil, karar):**
1. **`15a` tahtası `Log this match` diyor, `BUILD.md` §9 tablosu `Rate this match`.** `CODE.md` §2 BUILD'i tahtanın üstünde tutuyor, o yüzden **BUILD'in etiketi uygulandı** (Aşama 6'da değiştirilmişti). Tahtanın güncellenmesi istenirse bu satır oradan düzeltilmeli.
2. **Mekân adı (`Emirates Stadium`, `Stamford Bridge`) üç tahtada da var, üründe yok.** Sebep UI değil veri: `GET /competitions/{id}` yanıtında alan `"venue": None` ve maç yanıtında mekân hiç yok. Uydurulmadı. Sağlayıcıdan çekilmesi bir **arka uç işi**.

- **Test:** yeni `frontend/tests/position-abbr.test.mjs` (4 test: beş mevkinin kısaltması, ham kod asla gösterilmez, bilinmeyen etikette boş kalır, bileşen `position_code`'a artık hiç dokunmuyor). **Mutasyon:** eski `position_code || position` sırası geri kondu → **kırmızı**, dosya bayt-aynı geri yazıldı. Frontend **102/102**, Vite production build geçti, `redesign/` ESLint'te yalnız eskiden gelen `CompanionPanel.jsx:152` var.
- **Ölçüm düzeneği:** canlı evre yine kopya üzerinde (`provider='qa'`, gerçek sağlayıcı kadrosu korunarak). Kabul sonrası söküldü, kopya silindi; gerçek DB'de 54610 yine `finished`/`fotmob`. Commit, push, deploy, APK yapılmadı.

#### Frontend pass — Aşama 9 (Companion lifecycle) / 2026-09-23

- **Kaynak:** ekran kodları `RankIt Redesign.dc.html#5a`, `#5b`, `#6d`; `BUILD.md` Part IV Phase 6 ve §9.2.
- **Genel durum:** üç evre de kurulmuş ve tahtaya sadık. `5a`: `KICKS OFF IN` + dakika:saniye geri sayım, `N joining`, `M you follow`, `Join`, ve *"Live rating opens at kick-off. Your stars still wait for full time."* `5b`: `CROWD PULSE` + zaman çizelgesi + okuma sayısı, `Live chat` + odadaki kişi + `Open`, `YOUR LIVE READ` beş kademe, `MOMENTS` satırlarında `Pulse +0.9` ve `N marked this`. `6d`: `THE NIGHT, IN FULL`, kayıt kutuları (`Loudest` / `Pulse rise from HT` / `Messages kept`), `ROOM CLOSED AT FULL TIME`, `Read the thread · N`, ve canlı okuma varsa `Rate it — your live read was X`.

**Düzeltilen — `6d` kapanış cümlesi.** Tahta şunu yazıyor: *"The thread stays. You can read every message from tonight, but nobody can add to it — **a watchalong is the match, not a group chat that outlives it.**"* Üründe yerine düz bir tekrar vardı: *"The thread stays read-only after full time. Nobody can add to it."* Neden'i söyleyen cümle ürünün sesi; tahtanınki birebir geri kondu ve tarayıcıda görüldü.

**Uydurulmayan (veri yok):**
- `5b` tahtasında `Live chat · 18 new since the red card` var — bir ana göre okunmamış mesaj sayısı. `GET /matches/{id}/companion` yanıtında böyle bir alan **yok** (`room_open`, `pulse`, `my_read`, `moments`, `live_read_open`, `record`). Uydurulmadı; istenirse arka uçta okunmamış-ana-göre sayacı gerekir.
- Mekân adı (`Stamford Bridge · 20:00 BST`) `5a` tahtasında da var — Aşama 8'de kaydedilen aynı veri boşluğu.

- **§9.2 sorumluluk ayrımı** Aşama 8'de ölçülmüştü ve burada da geçerli: Match sekmesi sahayı, Companion nabzı/anları/sohbeti anlatıyor. **Maç sonrası oda kapanıyor** (`room_open` yalnız `upcoming`/`live`) ve nabız gecenin kaydına dönüşüyor — `6d` ekranında doğrulandı.
- **Tarayıcıda görülen `6d` (gerçek veri, boş hâl):** `THE NIGHT, IN FULL —`, `0 live reads · Too few readings for a crowd pulse.`, `— Loudest`, `— Pulse rise from HT`, `0 Messages kept`, `0 were in the room`, `Read the thread · 0`. Veri yokken hiçbir sayı uydurulmuyor.
- **Test:** `frontend/tests/companion-view.test.mjs`'e üçüncü test (tahta cümlesi birebir duruyor, düz tekrar geri gelmemiş). **Mutasyon:** cümle eski hâline döndürüldü → **kırmızı**, dosya bayt-aynı geri yazıldı. Frontend **103/103**, Vite production build geçti. Commit, push, deploy, APK yapılmadı.

#### Frontend + backend pass — Aşama 10 (mobil kart yüzeyleri) kısmi / 2026-09-23

- **Kaynak:** ekran kodları `RankIt Redesign.dc.html#2a`, `#2e`, `#2c`, `#3j`.
- **`3j` tahtayla örtüşüyor**, değişiklik gerekmedi: `RATE A MATCH` / *"What did you watch?"* / `Search any match` / `FROM TONIGHT · NOT YET LOGGED` / streak satırı / `OR CATCH UP` / `Last 7 days` / `N unrated`. Tahtadaki `RESOLVES INTO 6a` notu da doğrulanmış durumda (Aşama 5): `3j` bir **bulucu**, seçilen maç sheet'te açılıyor ve puanlama oradan `6a`'ya iniyor.

**Kurulan — `2c` Discover'da The Hunt özeti.** Tahta Discover'ın üstünde `38%` + `The Hunt` + *"4 collections · two are one night from closing"* istiyor; üründe **hiç yoktu** ve `rankitApi`'de `/collections` metodu bile yoktu.
- Yeni `redesign/huntSummary.js` + `rankitApi.collections()`. Cümle uçtan geliyor (`index_summary` docstring'i tahtanın örneğini birebir yazıyor); istemci hiçbir sayı türetmiyor.
- **Yüzde bilinmiyorsa (`pct: null`, hiç açılmış koleksiyon yok) blok çizilmiyor** — `0%` ile "bilinmiyor" ayrı şeyler. `pct: 0` ise geçerli bir ölçümdür ve `0%` yazılır.
- **Şimdilik tıklanamaz:** açılacak dizin ekranı (`2m`) henüz yok; hiçbir yere gitmeyen bir düğme boş bir söz olur. `2m` Aşama 12'de gelince bu blok onun girişi olacak.
- Tarayıcıda iki hâlde de görüldü: aktif koleksiyon yokken **blok yok**; üç kulüp takip edilince `0% · THE HUNT · 3 collections`.

**BULUNAN GERÇEK ARKA UÇ KUSURU — eşzamanlı `GET /collections` 500 veriyordu.**
Blok bir türlü çizilmeyince ağ kaydına baktım: `/collections` çağrılarından biri **500** dönüyordu. Sebep: bu GET koleksiyonları **tembel oluşturuyor** (`rankit_hunt.classics_year` ve `club_season` içinde `INSERT OR IGNORE`). Rollback-journal modunda **okuyan bir bağlantı yazanı blokluyor** ve SQLite kilitlenme ihtimalinde beklemeden `SQLITE_BUSY` atıyor → `database is locked` → 500. İki isteğin üst üste gelmesi yetiyor; **React StrictMode'un çift çağrısı bile tetikliyor**, yani bu geliştirmeye özgü değil: iki sekme, bir yeniden deneme ya da iki kullanıcı aynı anda girdiğinde canlıda da olur. Hata istemcide sessizce yutulduğu için ekran sadece "boş" görünüyordu.
- **Düzeltme (`api/db.py`):** `PRAGMA journal_mode = WAL` (bir kez, dosya ayarı) + her bağlantıda `busy_timeout = 15000` ve `sqlite3.connect(timeout=15)`. WAL'da okuyanlar yazanı bloklamıyor; çakışan yazıcı hata vermek yerine bekliyor.
- **Test:** yeni `tests/test_rankit_concurrency.py` — WAL açık mı, ve **sekiz eşzamanlı `/collections` isteğinin hepsi 200 mü** (ayrıca hepsi aynı özeti dönüyor mu: tembel oluşturma tekrar tekrar koleksiyon üretmemeli). **Mutasyon:** WAL satırı kaldırıldı → **kırmızı**, dosya bayt-aynı geri yazıldı.
- Not: gerçek geliştirme veritabanı bir sonraki API başlangıcında (ilk `init_db`) WAL'a geçer; ölçüm sırasında hâlâ `delete` modundaydı.

- **Aşama 10'da AÇIK KALANLAR (kapatılmadı):**
  - `2a` tahtasında başlıkta seri sayacı var (`12 NIGHTS`) ve takip edilen üye avatarları + `find`; üründe başlık marka + bildirim zili.
  - `2e` tahtasında günlük sekmeleri **metin** (`TIMELINE` | `SHELF`), üstünde `142 WATCHED · 11 CLASSICS` ve `Newest` sıralaması; üründe sekme ikon-only (liste/ızgara) ve stat satırı `LAST 28 DAYS · N watched`.
- **Doğrulama:** backend **277/277**, frontend **108/108** (5 yeni Hunt testi + 2 eşzamanlılık testi), Vite production build geçti. Commit, push, deploy, APK yapılmadı.

#### Frontend pass — Aşama 10 tamamlandı (`2a`, `2e`) / 2026-09-23

**`2a` başlık — tahtadan üç düzeltme.** `StreakRing` ve kalkan **zaten kurulmuştu**; sapma sunumdaydı.
1. **Seri hapı.** Tahta 44px yüksek bir hap istiyor: 26px halka + YANINDA `NIGHTS`. Üründe hap yoktu, sayı ve etiket alt alta bir 44×44 kutudaydı.
2. **Halka altındı.** Tahta ısı renkleri kullanıyor (`#f5402e → #d43a63`). Altın olması başlıkta ikinci bir altın demekti (marka alt satırı zaten altındı) ve §1.2 bölge başına bir altına izin veriyor. Şimdi: marka alt satırı `#7f868b` (ink-4), okunmamış noktası `#f5402e` (heat-5), halka ısı renginde — **başlıkta altın kalmadı**, bütçe alt navigasyondaki elmasta.
3. **Etiket 7px'ti.** §1.5 tabanı 9px. Bu değer **satır içi JSX stilindeydi**, yani Aşama 4'te yazdığım CSS tarayan tip-tabanı testi onu **göremiyordu**. Test genişletildi: artık `redesign/*.jsx` içindeki `style={{ font: "... 7px ..." }}` ve `fontSize: 8` yazımlarını da tarıyor. Mutasyon: 7px geri kondu → **kırmızı**.
   - Halkanın paydası uydurma değil: §4.2'ye göre Floodlight skini **yedi gecelik seri** ile açılıyor. Sayı gerçek (`GET /rank` → `streak.current`); bileşenin "arka uçta streak yok" diyen eski notu güncellendi.

**`2e` günlük — metin sekmeleri ve sayım.** Tahta `TIMELINE | SHELF` sekmelerini ve üstünde `142 WATCHED · 11 CLASSICS` istiyor; üründe sekmeler ikon-only (liste/ızgara) ve sayım yoktu.
- Sayım günlükten türetiliyor (`/diary` sayfalanmıyor), yeni uç gerekmedi.
- **Kendi yarattığım kusuru ölçüp düzelttim:** metin etiketleri ilk denemede filtre pill'lerinin yanına sıkıştı; taban kural düğmeleri `28×26` sabitliyordu, metin kırpıldı ve satır **377px**'e taşıdı (375 ekranda). İki adım: düğme genişliği metne bırakıldı, sonra **sıra tahtaya göre düzeltildi** — `TIMELINE|SHELF` kendi satırında, altında sayım, altında filtre pill'leri. Ölçüm: taşma yok, yatay kaydırma yok, `Lists` pill'i artık kesilmiyor.

**AÇIK BIRAKILAN — `2a` kişi şeridi ve bir bayrak kararı.**
- Tahtada başlığın altında takip edilen üyelerin 56px avatar şeridi (`deniz · mara · arda · find`) var. Kimlerin görüneceği, hangi sırayla ve `find`in neyi açacağı **ürün kararı**; `/people` verisi var ama kural yok. Uydurulmadı — Aşama 11 (`9a`/`9b` People) ile birlikte ele alınmalı.
- **`RANKIT_NEW_CARD` bayrağı varsayılan KAPALI** (`redesign/flags.js`). Seri hapı, kalkan, yeni hero/discover kartları ve yeni Profile kökü (`ProfileRoot`) bu bayrağın arkasında. Bu geçişteki `2a` ölçümleri bayrak **yerelde açılarak** yapıldı (`localStorage`, kod değişmedi). Aşama 1–3 kapalı olduğuna göre yeni kart kabul edilmiş demektir; **varsayılanı açmak bir kullanıcı kararıdır** ve tek satırlık bir değişiklik (`flags.js` fallback `false` → `true`).
- **Doğrulama:** frontend **109/109**, Vite production build geçti. Commit, push, deploy, APK yapılmadı.

#### `RANKIT_NEW_CARD` varsayılanı AÇILDI (kullanıcı kararı) / 2026-09-23

- **Ne değişti:** `redesign/flags.js` içindeki fallback `false` → `true`. Böylece yeni kart yolu ve onunla gelen yüzeyler varsayılan olarak açık: `2a` başlığındaki seri hapı + kalkan, yeni hero ve Discover kartları, yeni Profile kökü (`ProfileRoot`). Kapatma yolu duruyor: `localStorage.setItem("rankit:flag:newCard","0")` ya da `VITE_RANKIT_NEW_CARD=false`.
- **Gerekçe:** Aşama 1–3 (ölçüm düzeneği, MatchCard kabul kapısı, grid/taşma) kapanmıştı ve Aşama 4–10 boyunca bu yolun ekranları tahtalara karşı tek tek doğrulandı. Bayrağı kapalı tutmak artık "eski davranışı koru" değil, yapılmış işi gizlemek anlamına geliyordu.
- **Açılış denetimi (375×812, bayrak varsayılanıyla, `localStorage` temizlenerek):** dört sekmenin tamamında **konsol hatası yok**, **yatay sayfa kaydırması yok**, **9px altı tip yok**. Kalan ellipsis kırpmaları meşru (dar kart yuvasında turnuva adı — ellipsis'in işi). Profile'da ölçülen `>377px` değerler sekme geçiş animasyonunun `translate(18px)` transformu; `scrollWidth === clientWidth`, gerçek taşma değil.
- **Not:** bayrak açıkken Profile artık `ProfileRoot`'u kullanıyor, eski `ProfileView` bu yoldan düşüyor. `2e` günlüğü `ActivityView` içinde ve **bayraktan bağımsız**, yani bu geçişteki `2e` işi canlı yolda.
- **Doğrulama:** backend **277/277**, frontend **109/109**, Vite production build geçti, `redesign/` ESLint'te yalnız eskiden gelen `CompanionPanel.jsx:152`. Commit, push, deploy, APK yapılmadı.

#### Frontend pass — Aşama 11 (reviews ve sosyal çekirdek) / 2026-09-23

- **Kaynak:** ekran kodları `6b`, `9a`, `3i`; `BUILD.md` §13.1–§13.4, §14, §5.4.
- **Zaten doğru olanlar (ölçüldü, değiştirilmedi):** `15c` (Aşama 7'de kuruldu), `5c` ve `4a` (Aşama 4–9'da doğrulandı), `2p` Standing itilen ekran olarak §14'e uygun, `6b` yapısı §14'ün saydığı sırada (kimlik → rütbe bloğu + chevron → üç sayaç → raf önizleme → Lists / The Hunt / Your reviews), `3i` tahtanın iki parçalı cümlesini birebir taşıyor ("You agree on N of the M matches you've both rated." + yarım yıldız karşılaştırması), §13.3 on altı maçın altında yüzde yok ve "comparison opens at 10" diyor, §13.4 dört ilişki durumu doğru renklendirilmiş (**altın yalnız hâlâ eylem olan ikisinde**: `Follow`, `Follow back`; `Following` nötr, `Mutual` yeşil kenarlık).

**1. §13.2 ihlali düzeltildi — "No follower counts. Anywhere."**
Profil kimlik satırı `0 following · 1 followers` yazıyordu; `9a` sekmeleri de `Followers 96` biçiminde sayı taşıyordu. **Tahtalar (`6b`, `9a`) bu sayıyı çiziyor** ama `CODE.md` §2 BUILD'i tahtanın üstünde tutuyor ve bu aşamanın kendi maddesi de "follower sayılarını kaldır" diyor. Sayı kaldırıldı, **listeye erişim duruyor**. Takip ETTİĞİN sayı popülerlik değil, kendi listenin boyu — §13.2 kapsamında değil, bırakıldı. Tarayıcıda: `0 following | followers` ve sekmelerde `Following 0 | Followers`.

**2. `9a` başlığı eklendi.** Tahtada satırların üstünde `CLOSEST TASTE` var; üründe yoktu. **Yalnız takip listesinde** çiziliyor: §13.1 "the list you follow is ordered by how often you and they land on the same verdict" diyor, takipçi listesinin sırası için böyle bir kural yok — oraya "en yakın tat" demek yanlış olurdu. Ayrıca liste yüklenemediğinde başlık **çizilmiyor** (hata üstünde başlık gürültüdür); DOM'da doğrulandı.

**3. BULUNAN VE DÜZELTİLEN — 401 boş bir "Retry" sözü veriyordu.**
`/people` bilerek oturum istiyor (kişi listesi özeldir, diğer uçların demo kullanıcıya düşmesinden ayrı). Ama ortak `ErrorState` yalnız *çevrimdışı* ile *diğer* ayrımını yapıyordu: 401'de ekran **"Could not load this view · Your data has not been removed. Please try again." + RETRY** gösteriyordu. Aynı istek aynı sonucu verir — düğme kullanıcıyı kandırıyordu. §5.4'ün üçlü ayrımı (`4xx kalıcı / 401 yeniden giriş / 5xx-ağ tekrar`) artık bileşende: 401'de başlık **"Sign in to see this"**, gövde nereye gideceğini söylüyor ve **eylem yok**; diğer iki dal aynen duruyor. Bu ortak bileşen olduğu için düzeltme her ekranı kapsıyor. Tarayıcıda doğrulandı: retry düğmesi sayısı **0**.

- **Test:** yeni `frontend/tests/no-follower-counts.test.mjs` (3) ve `frontend/tests/error-states.test.mjs` (3). İlk testin ilk hâli düz metindeki "followers" kelimesini de yakalıyordu ("No followers yet", "Search your followers") — kural **sayıya götüren erişime** daraltıldı (`?.followers`, `followers:`), çünkü yasak olan sayı, kelime değil. **Mutasyon:** profil sayacı geri kondu → **kırmızı**, dosya bayt-aynı geri yazıldı.
- **Açık:** `9a`/`9b`'nin **dolu** hâli yerelde görsel olarak kabul edilemiyor — demo kullanıcı oturumsuz ve uç bilerek 401 veriyor. `2a` kişi şeridi de bu yüzden hâlâ açık (kimlerin görüneceği kuralı ayrıca ürün kararı).
- **Doğrulama:** frontend **115/115**, Vite production build geçti, `redesign/` ESLint'te yalnız eskiden gelen `CompanionPanel.jsx:152`. Commit, push, deploy, APK yapılmadı.

#### Frontend + backend pass — Aşama 12, kısım 1: The Hunt (`2m`, `2n`) / 2026-09-23

- **Kaynak:** ekran kodları `RankIt Redesign.dc.html#2m` ("collections index") ve `#2n` ("honest about gaps"); `BUILD.md` §24 (lists vs collections). Aşama 12'nin 16 ekranından envanter çıkarıldı: `2m`/`2n` ve skin/share (`2j`, `4d`, `2k`, `2l`) **yoktu**; diğerlerinin bileşeni var ve bu aşamanın sonraki kısımlarında tahtaya karşı denetlenecek. The Hunt önce yapıldı çünkü üç yer onu bekliyordu: Discover bloğu (tıklanamaz bırakılmıştı), Profile satırı (`Coming soon`), alerts koleksiyon satırı (B1).

**Kurulan.** Yeni `redesign/Hunt.jsx` (`HuntIndex` + `CollectionScreen`), `huntSummary.js`'e saf yardımcılar (`numberWord`, `collectionPercent`, `collectionExtra`, `collectionSentence`, `dayLabel`, `timeLabel`, `unscheduledNote`), `rankitApi.collection(id)`. Tipografi tahtadan ölçüldü (göz 9px, başlık 31px, özet halkası 70px/18px, satır halkası 48px/13px, satır başlığı 13px, alt satır Outfit 12px). Halkalar tahtadaki gibi ısı rampasıyla ilerleme çiziyor.
- **`2m`:** `MATCHES WORTH CHASING` / `The Hunt` / özet kartı (yüzde halkası, `N collections active`, `X of Y collected. One is one night from closing.`) / koleksiyon satırları (başlık, `alt başlık · X of Y`, yüzde halkası, altta sıradaki maç / ödül / açılış notu). Açılmamış koleksiyon soluk ve tıklanamaz, notunu gösteriyor.
- **`2n`:** `X OF Y` / `COLLECTION` / başlık / tahtanın kalıbındaki cümle ("Rate all twelve this season. Five left, and one of them is Sunday." — gün adı yalnız sıradaki maç bir hafta içindeyse), `COLLECTED` (skor gizleme tercihine uyarak), **`PLAYED · NOT YET LOGGED`** (uçtaki `open_matches`: şu an kapatılabilecek boşluklar; ifade `3j`'deki "NOT YET LOGGED"dan alındı, uydurulmadı), öne çıkan sıradaki maç, `Next in line`, ve planlanmamış fikstür sayısı ("Three fixtures are unscheduled…") — fikstür uydurulmaz, yalnız sayısı söylenir.
- **Bilerek yapılmayan:** `2m` satırlarındaki kulüp renkli elmas şeridi (`+7` taşmalı). Dizin yanıtı üyeleri taşımıyor; renksiz bir şerit veri gibi görünen süs olurdu. İstenirse `GET /collections` satırlarına ilk N üyenin kulüp renkleri eklenmeli.

**Giriş noktaları:** Discover özeti artık düğme; Profile satırı `The Hunt · N active` (tahta `6b`: "4 active") — sayı uçtan, gelmezse boş; alerts koleksiyon satırı `collection_id` ile doğrudan `2n`'yi açıyor (**B1 kapandı**; prop'u vermeyen eski istemci kalan maça düşer). Satır, yalnız `collection_id` varken de artık etkin.

**Ölçülerek bulunan ve düzeltilen dört kusur:**
1. **Geri düğmesi uygulama başlığının altında kalıyordu.** İlk sürüm `MemberProfile` kalıbıyla `z-index:1` idi; ekran görüntüsünde Hunt'ın kendi başlığı yerine uygulamanın başlığı görünüyordu. `z-index:10`: başlık (5) ve navigasyonun (7) üstünde, maç sayfasının (`fixed z:20`) altında. Gerçek tıklamayla sınandı: geri `2n`→`2m`; koleksiyondan açılan maç Hunt'ın **üstünde** açılıyor (`elementFromPoint` sayfayı veriyor), Hunt altında bekliyor.
2. **Puanladıktan sonra koleksiyona değil dizine dönülüyordu.** `6a` kabuğu değiştirince bileşen yeniden kuruluyor ve içerde tutulan açık koleksiyon kayboluyordu. Açık koleksiyon uygulama düzeyine taşındı. **Tam döngü tarayıcıda:** `The 34`, `1 OF 34`, 4 boşluk → boşluklardan biri açılıp puanlandı → `6a` (`The 34 · 1/34 +1` karosu) → geri → **aynı koleksiyonda `2 OF 34`, 3 boşluk**.
3. **Eşzamanlı `GET /collections` HÂLÂ 500 veriyordu — Aşama 10'daki düzeltmem yetmemişti.** Aşama 10'da WAL + `busy_timeout` eklemiş ve testi yeşil görmüştüm; ama test **kulüp takibi olmadan** koşuyordu, yani uç tek bir INSERT'le yarışıyordu ve kusuru hiç yeniden üretmiyordu. Altı kulüp takip eden izleyicide `database is locked` geri geldi. **Kök neden:** `hunt_for` takip listesini **canlı bir SELECT imleci üzerinde dolaşırken** döngü içinde `club_season` INSERT yapıyordu; açık imleç eski okuma görüntüsünü sabitliyor, yazma o görüntüden yükseltilmeye çalışıyor ve başka bir istek arada commit ettiyse SQLite `SQLITE_BUSY_SNAPSHOT` dönüyor — **bu hata `busy_timeout`'u beklemeden atlıyor**. Düzeltme: takip listesi `fetchall()` ile önce tüketiliyor; `club_season`/`classics_year` önce okuyor, **yalnız yoksa** yazıyor (kararlı durumda GET hiç yazmıyor). Test gerçek senaryoya çekildi (altı kulüp, 16 eşzamanlı istek) ve önce **kırmızı** görüldü. **Hangi katmanın gerekli olduğu ölçüldü** (her biri 4 koşu): canlı-imleç düzeltmesi geri alınınca `RRRR`, WAL kaldırılınca `RRRR`, `isolation_level="IMMEDIATE"` kaldırılınca `GGGG` → IMMEDIATE **gereksizdi, geri alındı** (kanıtla gerekçelendirilemeyen global davranış değişikliği bırakılmadı).
4. **Özet ile bildirim aynı gerçeği farklı kuralla söylüyordu.** `index_summary.one_left` kalan tek maçın planlanmamış olup olmadığına bakmıyordu; Discover "one is one night from closing" derken alerts aynı koleksiyon için sessizdi — çünkü `_closing_collection` docstring'i "tarihi açıklanmamış fikstür kaldıysa 'bir maç kala' denmez" diyor ve uyguluyor. Özet bildirime hizalandı (`and not unscheduled`); `tests/test_rankit_hunt.py`'ye test, mutasyonla kırmızı.

- **Kopya düzeltmesi:** hiç toplanmamış koleksiyonda "Rate all 34 this season. 34 left." tekrarlıydı → "Nothing collected yet."
- **Kayda geçen iki veri notu (düzeltilmedi):** (a) yerel DB'de "**The 2 — Every West Ham United match in the Premier League**" görünüyor: sebep benim `seed_local_real_match.py` ile tek maçlık bir "Premier League 2025-26" yarışması oluşturmam; round-robin iki takımdan iki maç hesaplıyor. Ürün kusuru değil. (b) Arka uç alt başlığı `f"Every {team} match in the {comp}"` "in **the** Ligue 1" üretiyor; artikel almayan lig adları için (Ligue 1, Serie A, La Liga) doğru değil — bir kopya işi.
- **Açık:** alerts→`2n` derin bağlantısının **görsel** kabulü yapılmadı (tarihli tek maçı kalan bir koleksiyon gerekiyor); yönlendirme kaynaktan test ediliyor.
- **Test:** yeni `frontend/tests/hunt-screens.test.mjs` (9 test), `tests/test_rankit_concurrency.py` güçlendirildi, `tests/test_rankit_hunt.py` +1. Backend **278/278**, frontend **123/123**, Vite production build geçti, hedefli ESLint temiz. Ölçümler kopya DB + ikinci sunucu üzerinde yapıldı; söküldü, gerçek DB değişmedi (14 günlük satırı). Commit, push, deploy, APK yapılmadı.

#### DÜZELTME — Aşama 10 `2c` eksik kapatılmıştı: filtre çekmecesi (`6c`) kuruldu / 2026-09-23

- **Kullanıcı yakaladı:** "Filtreler soldan açılan bir drawer'dan gelecekti; ekran görüntüsünde hâlâ en üstteler." Haklı. `2c`'nin tahtadaki başlığı zaten **"Discover · filter drawer, 48px pills"**, ve `6c` **"Discover · filter drawer, pushed over"**. Aşama 10'da `2c`'yi yalnız Hunt bloğu ve pill yüksekliği üzerinden kapattım; çekmeceyi **hiç kontrol etmedim**. `BUILD.md` §23 tablosu da açık: **"Filter drawer (`6c`)"** mobilde, web'de ray (`8a`). Aşama 10 kaydındaki "`2c` tamam" ifadesi bu düzeltmeyle birlikte okunmalı.
- **Arka uç zaten hazırdı:** `/catalog` `min_heat` alıyordu ve yorumu `6c`'yi birebir alıntılıyordu ("Show 62 matches: filtre tüm katalogda sunucuda uygulanır, `total` doğru sayıyı verir"). Ön yüz hiç bağlamamıştı.

**Kurulan.** `redesign/FilterDrawer.jsx` + saf mantık `redesign/discoverFilters.js`; Discover'ın sayfa üstündeki satır içi filtre paneli **kaldırıldı**, başlık satırına 44px filtre tetikleyicisi geldi, toplam sayı bölüm başlığına taşındı (`5,888 MATCHES`). Tahtadan ölçülen değerler: çekmece **sol 0, 288px (en fazla %85)**, `#1a1b1e`, sağ hairline, gölge `18px 0 44px -16px`; perde `rgba(0,0,0,.55)`; başlık 64px `Filters`; göz 9px `.14em`; pill 48px `0 16px` Rajdhani 700 12px; alt düğme 48px radius **10** altın.
- **SPORT / STAGE** pill'leri: tahtada "All" pill'i yok — seçili pill'e ikinci dokunuş filtreyi kaldırıyor.
- **MINIMUM HEAT:** tahtada pill değil, **ısı rampası üzerinde kaydırıcı** (8px iz, 28px `#eceded` başparmak) ve altında seçilen seviyenin adı **kendi ısı renginde** ("Good" `#9a3f96` — rampanın GOOD basamağı). Yerel `<input type="range">` ile kuruldu (klavyeyle ok tuşları çalışıyor, `aria-valuetext`). **Eşik kararı:** kart ısı adını `NAMES[Math.round(heat) - 1]` ile veriyor, yani 2.5 "GOOD" yazıyor; "Good or better" **2.5**'ten başlıyor (Flat 1.5 / Good 2.5 / Great 3.5 / Hot 4.5). Başka bir eşik, ekranda GOOD yazan bir kartı "Good or better" filtresinden düşürürdü.
- **"Show N matches"** sayısı uçtan: taslak her değiştiğinde 220ms beklemeyle `/catalog?…&limit=1`'in `total`'ı. Seçimler **onaya kadar bekliyor**. Sonuç sıfırsa düğme `No matches` ve pasif; sayma sırasında `Counting…`; hata olursa sayı uydurulmaz (`Show matches`).
- **Tahtada olmayan ama korunan:** "Season & competition" seçimleri (çalışan bir filtre; kaldırmak geri adım olurdu) çekmecenin en altında.
- **Tetikleyici:** filtre aktifken ikon altın (tahtada öyle) + etkin filtre sayısı rozeti, `aria-label="Filters, 2 active"`.

**Tarayıcıda ölçüldü (375×812, gerçek geliştirme verisi, salt okuma):** satır içi panel yok; çekmece `left 0 / width 288 / rgb(26,27,30)`, `role="dialog"`, `aria-modal`, odak içeride. Canlı sayı: hepsi **5,888** → Football **2,676** → + Finished **777** → ısı "Good" **No matches** (yerelde 20+ puanlı maç yok; §5.5, dürüst) → eşik kaldırılınca yine **777**. "Show 777 matches" → ızgara yalnız bitmiş futbol maçları, başlık `Finished matches`, ikon altın + rozet `2`. **Escape** kapatıyor ve **odak tetikleyiciye dönüyor**. "Clear all" → `Show 5,888 matches` → filtresiz; kalıcı spor tercihi `All`'a döndü (uygulama filtreli bırakılmadı).

- **Kendi sözleşme testlerimin yakaladığı iki şey:** (1) kaydırıcının odak halkasına `outline-offset:6px` vermiştim — `focus-and-targets.test.mjs` (§26: "2px ink at 2px offset") kırmızıya döndü, 2px'e çekildi. (2) Satır içi panel gidince `RankItPrototype.jsx` ESLint'i 6'dan 11'e çıktı — beşi benim bıraktığım ölü kod (`LayoutGrid` — `2e`'de ikonu metne çevirmiştim —, `ChevronDown`, `RotateCcw`, `seasonOptions`, `pickCompetition`); temizlendi, yine 6 (hepsi önceden vardı).
- **Test:** yeni `frontend/tests/discover-filters.test.mjs` (7 test: pill'e ikinci dokunuş filtreyi kaldırır; ısı eşiği kartın adlandırma kuralıyla aynı; kaydırıcı gidiş-dönüş kayıpsız; katalog sorgusu `min_heat`'i yalnız seçildiyse gönderir; "Show N" sayısı uydurulmaz; etkin sayı ısıyı da sayar; ve **satır içi panel Discover'a geri gelirse ya da çekmece soldan/288px değilse kırmızı**). Frontend **131/131**, Vite production build geçti.
- **Kalan:** web tarafı §23'e göre çekmece değil **ray** (`8a`) — Aşama 15–17'nin işi, dokunulmadı. Eski `.ri-filter-redesign` CSS'i Discover'da artık kullanılmıyor; web'in kullanıp kullanmadığı Aşama 15'te kontrol edilip temizlenecek.
- **Duraklatılan iş:** skin/share (Aşama 12) bu düzeltme için durduruldu. Şu an yalnız kullanılmayan yeni bir `redesign/skins.js` var (dokuz skin'in jetonları, `4d`/`2j` tahtalarından birebir); MatchCard'a henüz dokunulmadı. Commit, push, deploy, APK yapılmadı.

#### Frontend + backend pass — Aşama 12, kısım 2: skinler (`2j`, `4d`, `6a` kilit satırı) + lig skinleri / 2026-09-23

- **Sahibin kararı (bu oturum, sohbette):** (1) The Hunt'ta bir ligin listesini bitiren **o ligin skinini** açar — La Liga'yı bitiren La Liga'yı; bütün Hunt ligleri için, **kilitli başlar**. (2) Yeni kayıt olan birinin elinde, liste bitirmeden **10 farklı skin** olur; **Gilt bunlardan biri değil** (maçı yorumlayana maça göre açılır); on'a tamamlamak için yeni skinler eklenir. Bu, `BUILD.md` §4.2'deki "Seven" sayısını **genişletiyor** — §4.2'nin kuralları (skin yalnız koleksiyon kartını ve paylaşım görselini boyar; parıltı 68°; Broadsheet'te altın `#8a6a12`; kilitli karo koşulu gösterir, önizleme değil) aynen uygulandı. §29'daki "the moment a locked skin unlocks" kesintisi tahtanın sonraki hâliyle aşılmış: `6a` tahtası dördüncü satırı çiziyor ("TURF UNLOCKED · You closed a collection. It's in your skins. · USE IT") ve `4i` notu "THE UNLOCK IS A ROW, NOT A MODAL" diyor — o satır kuruldu, ayrı ekran/modal yok.
- **Kaynak:** `RankIt Redesign.dc.html#2j` (seçici: kapat / SELECT SKIN, All · Earned · Locked, 3 sütun 126px karo, açıklama kutusu, altın "Apply {Name}"), `#4d` (skin = aynı kart üzerinde değişken seti: base, sheen, wash, ink, eyebrow, score, notch; kilitli karo = soluk zemin .3 + perde + kilit + koşul), `#6a` (kilit satırı), `#2m` ("FINISHING THIS UNLOCKS TURF" dili).

**Katalog (arka uç, `api/rankit.py`).** 20 skin, sunucu tek kaynak:
- **Serbest 10:** Default, Broadsheet, Holofoil, Ember, Ink, Stub (tahtadan) + **Chalk** (taktik tahtası: arduvaz, tebeşir tozu, yarısı silinmiş daire), **Scarf** (iki kulübün rengi beş örme bant — yüzdeyle, her boyda aynı), **Scoreboard** (siyah zemin, nokta vuruşlu ışık), **Rain** (yağmurlu gece maçı: projektör pusu, parıltı 68°'de düşen yağmur).
- **Kural skinleri:** Gilt (`classic`, yalnız Classic kart), Turf (`collection`), Floodlight (`streak`).
- **Lig skinleri (7, kural `league:<Lig>`):** Premier League, La Liga, Serie A, Bundesliga, Ligue 1, EuroLeague, NBA — `rankit_hunt.ROUND_ROBIN_LEAGUES ∪ FIXED_SEASON_GAMES` ile birebir (test bunu kilitliyor). **Logo/marka işareti yok**, yalnız çağrışım: mor + camgöbeği/pembe köşe ışığı; kiremit + geç saat güneşi; azzurro; siyah kart + köşeden kırmızı kesik; gece mavisi + alt kenarda ince üç renk; turuncu + üç sayı yayı; parke + iki boya alanı çizgisi.
- **Açılma kuralı:** o ligde **bir kulüp sezonunu** (`club_season`, "The 38") bitirmek. İki kaynak: avdaki tamamlanmış kulüp sezonları **ve** `rankit_collection_completions` (kulüp sonradan takipten çıkarılsa da bitirilmiş sayılır). Turf/Floodlight gibi **bir kez açılan kalır** (`rankit_user_settings` `skin:<id>`). `DiaryIn.skin` artık `SKINS`'ten türetiliyor (yeni skin iki yerde tanımlanmıyor); `PUT /diary` kilitli lig skinine 403.
- **`6a` için:** puanlama yanıtında `skins_unlocked` — **bu puanlamanın** açtığı skinler (önceden kazanılıp yazılmış olan sayılmaz; aynı kilit ikinci kez "açılmaz").
- **`2n` için:** `GET /collections/{id}` `skin_reward: {id, name, unlocked}` — yalnız lig kulüp sezonunda; zaten açıksa "unlocks" denmez.

**Ön yüz.**
- `redesign/skins.js` yeniden yazıldı: `4d`'nin değişken sözleşmesiyle jetonlar (base, sheen, wash, ink, eyebrow, score, footer/rule, pill, rest, gap, notch/classicNotch, gold; Broadsheet'te kalkanlar kâğıt tonu, mürekkep `#17120a`, altın `#8a6a12`). **`default` bugünkü kartın değerlerini birebir döndürüyor** — skin'siz her kart değişmeden çiziliyor (test string eşitliğiyle kilitliyor).
- `MatchCard`: `skin` prop'u; 16 sabit metin rengi jetona bağlandı (açık Broadsheet'te okunabilirlik için şarttı), yıkama katmanı, Stub'da çentik yerine yırtma çizgisi + **maskeyle açılan** zımba delikleri (arka plan rengiyle boyanmıyor — kart her yüzeyde durur). `default`'ta DOM'a `data-skin` bile eklenmiyor.
- **`2j` — yeni `redesign/SkinPicker.jsx`:** sekmeler (Earned = bu kartta şimdi seçilebilen; Gilt Classic olmayan kartta "CLASSIC / CARDS ONLY" ile Locked'ta), kilitli karo tahtadaki gibi koşul ("FINISH A / LA LIGA / SEASON", "7-NIGHT / STREAK"), kilitli karoya dokunmak açıklamayı gösterir, seçmez; `radiogroup`; §6 için sekmeler 44px (tahta 40). Uygulama `PUT /diary/{id}` `{match_id, skin}`; başarısızlıkta kart değişmez ve sebebi söylenir (çevrimdışı / hâlâ kilitli / diğer). Izgara küçük resimlerinde BUILD §1.5 istisnası (6.5–8.5px) — `focus-and-targets` testindeki istisna yalnız karo sınıflarına daraltıldı (eskisi `.ri-skin` idi ve seçicinin kendi metnini de muaf tutardı).
- **`6a`:** "Skin · {Ad}" düğmesi açıldı (kayıt kimliği yoksa / kuyruktaysa kapalı ve nedenini söylüyor), sonuç kartı seçilen skinle çiziliyor, **kilit satırları** (küçük skin karosu + altın çentik, "LA LIGA UNLOCKED", koşulu söyleyen tek cümle, "Use it" → seçici o skin seçili açılır). Uygulanan skin defterdeki aynı kaydı yerelde günceller.
- **`2n`:** "FINISHING THIS UNLOCKS THE LA LIGA SKIN" / açıldıktan sonra "THE LA LIGA SKIN IS IN YOUR SKINS", ligin soluk karosuyla.
- Defter rafı (`diaryToMatchCardProps`) kaydın skinini taşıyor.

**Tarayıcıda (375×812, kopya DB + ikinci sunucu, QA fikstürü `src/scratch/seed_qa_skins.py`: iki kulüplük sentetik "La Liga 2019-20", demo izleyici birini puanlamış):** `2n` "FINISHING THIS UNLOCKS THE LA LIGA SKIN" → kalan maç puanlandı → `6a`'da **iki** satır: TURF UNLOCKED (herhangi bir koleksiyonu bitirmek) + LA LIGA UNLOCKED → "Use it" → `2j` La Liga seçili, "Apply La Liga" → kart La Liga, düğme "Skin · La Liga", sunucuda `my_skin=laliga` → `2n` "…IS IN YOUR SKINS". İkinci düzenlemede kilit satırı **yok** (doğru). Rafta 20 skinin hepsi kart boyunda görüldü.
- **Ölçülerek bulunan ve düzeltilen üç kusur:** (1) karolardaki 2px saydam kenarlık katmanları içeri itiyor, parıltısız zemin her karoda renkli bir çerçeve gibi görünüyordu → kenar bir üst katman (`::after`: normalde hairline, seçilince 2px altın). (2) **Ink karosu görünmüyordu** — zemini `#0c0d0f`, seçici ekranıyla aynı renk; aynı hairline çözdü. (3) `6a`'da uygulanan skin rafa geçmiyordu: uygulamanın defter listesi skin'den önce yüklenmişti ve kimse yenilemiyordu → `onSkinApplied` aynı kaydı yerelde güncelliyor + profil revizyonu artıyor; rafta `data-skin="scarf"` doğrulandı.
- **Kontrast:** her skinde ana metin zemin tonunda ≥ 4.5 (test). Broadsheet altını `#8a6a12` kremde **3.99:1** — tahtanın/§4.2'nin değeri, damga bir işaret: WCAG 1.4.11 grafik eşiği 3:1 ile test ediliyor, değer değiştirilmedi. Kartın ısı etiketinin (`#d43a63`, ~3.9:1) düşük kontrastı skin'den bağımsız, `default` kartta da aynı — kayda geçti, dokunulmadı.
- **Web:** web yüzeyi hâlâ eski `web/cards.jsx` kartını kullanıyor; skin'ler orada görünmüyor. Eski karta ikinci bir skin çizicisi yazmak BUILD'in "half-migration" uyarısına aykırı — web yeni `MatchCard`'a geçtiğinde (Aşama 15–17) skinler gelir; web seçicisi `11b` (canlı önizleme yanında) o aşamanın işi.
- **Kalan (Aşama 12):** paylaşım kompozitörü `2k` (4:5) / `2l` (16:9) ve görsel dışa aktarma (kulüp armalarının çapraz köken tuval kirlenmesi riski); `6a`'daki "Image export is being prepared" notu o zamana kadar duruyor. Ardından Competition / Search / Notifications / Settings / Lists / First run denetimleri.
- **Test:** `tests/test_rankit_skins.py` +7 (yeni üye 10 serbest skinle, Gilt hariç, hepsi gerçekten seçilebilir; her Hunt liginin kilitli skini; La Liga'yı bitirmek yalnız La Liga'yı açar + `skins_unlocked` satırı bir kez; puanlar silinse de açık kalır; takipten çıkınca da sayılır; `2n` `skin_reward`; yalnız-skin güncellemesi puanı/yorumu/damgayı/etiketi/görünürlüğü değiştirmez). Yeni `frontend/tests/skins.test.mjs` (9: katalog sunucuyla aynı sıra/kimlik; 10 serbest; default değişmedi; 68°; altın yalnız Gilt'te; kontrast; sekmeler/koşul; `6a` satırı uçtan, kuyrukta yok; kaynak bağlantıları). **Mutasyon:** arka uçta 7 kural (lig açılımı yok / tek lig hepsini açar / tamamlanma kaynağı yok / lig kilitli sayılmaz / satır yok / satır tekrar eder / ödül açık durumu) → hepsi **kırmızı**; ön yüzde 9 kural, **yeşil kontrol koşusuna karşı** hepsi **kırmızı**; dosyalar bayt-aynı geri yazıldı. Backend **285/285**, frontend **134/134**, Vite production build geçti, `redesign/` ESLint'te yalnız eskiden gelen `CompanionPanel.jsx:152`; `RankItPrototype.jsx` yine 6 (hepsi önceden vardı).
- **Ortam:** QA için `.claude/launch.json`'a geçici iki giriş eklendi, sökümde **bayt-aynı** geri yazıldı; kopya DB silindi. Gerçek `data/app.db`'de QA verisi yok (14 günlük satırı, QA yarışması/takımı/skin ayarı 0). Dosyanın özeti oturum içinde değişti: sebep port 8010'da sabah 11:28'den beri çalışan, `data/app.db`'ye bağlı uvicorn'un canlı senkronu (bu oturumun başlattığı bir süreç değil; dokunulmadı). Commit, push, deploy, APK yapılmadı.

#### DÜZELTME — `2d` / `2e` günlük tahtaya oturtuldu, filtreler "Newest" barına taşındı (+ `3h` satır dili) / 2026-09-23

- **Kullanıcı yakaladı:** "Son ekran görüntüsü 2e, 2d ve 3h'a tam uygun değil. Üstteki filtreleme seçeneklerini 2e'de sağ üstte görünen **Newest** yazısına tıklayınca açılan bir filtre barı gibi kullanalım; doğrudan filtre blobları görüntüyü bozuyor." Aşama 10 kaydındaki "`2e` tamam" ifadesi bu düzeltmeyle birlikte okunmalı: o geçişte pill satırını **yerinde bırakıp** toggle'ı ayrı satıra almıştım; tahtada o satır hiç yok.
- **Sahibin kararı (sohbette):** 2e'deki sağ üst "Newest" bir sıralama yazısı değil, günlüğün **filtre barını açan tetikleyici**. Watched / Classics / Watchlist / Lists ve sıralama o barın içinde.

**Tahtaya karşı ölçülen sapmalar ve düzeltmeleri.**
1. **Rafta çift çerçeve.** Eski `.ri-diary-cards>div` kuralı (gradyan, kenarlık, 68° çizgi dokusu, kesik) yeni `MatchCard`'ın **yuvasına** da uygulanıyor ve kartın etrafına ikinci bir kart çiziyordu. `.ri-diary-cards.is-redesign>div` sıfırlandı; yuva yalnız dokunma alanı. Kart 2e ölçüsünde: crest 34, skor 26 (basketbol 21), **en az** 200px. Sabit 200px ilk denemede basketbolda ısı satırını kesiyordu (skor iki satır) — ölçüldü, taban yapıldı: NBA kartları 245px, satırdaki komşu grid ile birlikte uzuyor, kesilme yok.
2. **Filtre pill'leri → "Newest" barı.** Sayım satırı 2e'deki gibi: solda `7 WATCHED · 4 CLASSICS`, sağda `Newest ▾` (`aria-expanded`, `aria-controls`). Dokununca açılan bar: **SHOW** (Watched · Classics · Watchlist · Lists) ve **SORT** (günlükte Newest · Oldest · Top rated; Watchlist'te Match date · Added · Competition; Lists'te sıralama yok). Sessiz segment — altın ve parıltı yok, seçili `rgba(255,255,255,.1)`; her seçenek yine **48px** (§6 "filter pills 48"). Tetikleyici yazısı varsayılanda yalnız `Newest` (tahta), başka görünümde onu da söylüyor (`Classics · Top rated`, `Watchlist · Match date`, `Lists`). Sayım satırı görünüme göre: `4 CLASSICS`, `2 ON YOUR WATCHLIST`, `1 LIST`.
3. **Başlık ve sekmeler (2d/2e).** Eyebrow kalktı (tahtada yok); `Activity` 31px, sağında **TIMELINE | SHELF** (2e: `#121315` hap, 32px görünür / 44px dokunma, seçili nötr — altın değil). Friends / Diary sekmeleri 2d gibi sola yaslı, 26px aralık, 13px `.06em`, seçili altın + 2px iç alt çizgi (eski ortalanmış iki sütun + parıltı gitti).
   - **Bilinçli tek sapma:** 2d toggle'ı ilk ay satırına, 2e başlık satırına koyuyor. İkisini birden uygulamak, **basınca yer değiştiren** bir düğme demekti; yer 2e'deki gibi başlık satırında sabitlendi.
4. **2d ısı şeridi.** Eski hâl `LAST 28 DAYS` + iki sıra kare. Şimdi tahtadaki gibi: `#121315` kart, 18px yarıçap; `LAST 28 NIGHTS` / `N logged`; 28 çubuk (36px, 2px aralık), **boy senin yıldızın, renk topluluk ısısı**, boş gece %22 `.07`; altında "Height is your stars, colour is community heat." Topluluk ısısı yoksa (§5.5, 20 puanın altı) çubuk **nötr** — renk uydurulmaz. Gün **yerel** takvimden (eski kod `toISOString` ile UTC'ye kayıyordu). Şerit yalnız Watched'ta (Classics'te bütün defterin gecelerini göstermek yanıltıcıydı).
5. **2d satırları.** 72px; gün 21px + hafta günü 9px, elmas çifti (`CrestPair`, 52px blok), başlık `Arsenal 3–1 Tottenham` (skor gizliyse `vs`), 11px **mürekkep** yıldızlar + Classic altın elması, sağda 4×36 topluluk ısısı. Ay satırı `SEPTEMBER 2026` + hairline — eski satırın solunda ilk kaydın **yarışma adı** yazıyordu, gitti. Puana göre sıralıyken ay başlığı çizilmiyor (aynı ay tekrar tekrar başlık açardı).
6. **`3h` dili.** Günlükteki Lists görünümü 3h'in satırlarıyla: 68px, `#151618`, 14px yarıçap, başlık 13px + `2 matches · Ranked` 12px, chevron. Liste ayrıntısı (`ListShelf`, 3h) zaten tahtaya kurulu, iki gerekçeli sapmasıyla (respect elması, ısı rengi olmayan sayaç) — dokunulmadı. Watchlist de eski kart yerine raf ızgarasında yeni kartla çiziliyor.

- **Arka uç:** `GET /diary` her kayda maçın **topluluk ısısını** ekliyor (`community_rating`, `rating_count`) — kart kuralıyla aynı: kullanıcı başına son puanlı kayıt (rewatch ortalamayı şişirmez), 20 puanın altında `null`, sayaç kalıyor. Kişisel puan ayrı alanda (`rating`), karışmıyor.
- **Tarayıcıda (375×812, gerçek DB'nin kopyası; kopyada 7 kaydın tarihi son 28 geceye çekildi ve bir maça 20 sentetik puan eklendi):** timeline, bar açık/kapalı, dört görünüm × sıralamalar (her durumda sayım + tetikleyici + şerit + satır/kart sayısı DOM'dan okundu), raf, Watchlist, Lists. Hiçbir durumda yatay taşma yok. Söküldü: `launch.json` bayt-aynı, kopya silindi, gerçek DB'de QA verisi yok (14 günlük satırı).
- **Test:** yeni `tests/test_rankit_diary_heat.py` (2: 20 eşiği; rewatch bir kez), yeni `frontend/tests/diary-view.test.mjs` (6: sayım kalıbı; tetikleyici yazısı; üç sıralama + Watchlist sıralamaları; ısı şeridi — boy/renk/eşik/yerel gün; satır başlığı ve gün sütunu; **pill satırı geri gelirse, raf yeniden çerçevelenirse, bar seçenekleri 48px'in altına inerse kırmızı**). **Mutasyon:** 7 kural bozuldu (eşik yok, rewatch iki kez sayılır, ısısız geceye renk, raf çerçevesi, tetikleyici yazısı, pill satırı geri, bar 40px) → **yeşil kontrol koşusuna karşı** hepsi **kırmızı**; dosyalar bayt-aynı geri yazıldı. Backend **287/287**, frontend **140/140**, Vite production build geçti; `RankItPrototype.jsx` ESLint yine 6 (hepsi önceden vardı), `redesign/`'da yalnız eskiden gelen `CompanionPanel.jsx:152`. Commit, push, deploy, APK yapılmadı.
- **Kalan:** web günlüğü (Aşama 15–17) bu değişiklikten etkilenmedi; web'in eski `.ri-list-stack` / `.ri-diary-toolbar` stilleri orada kullanılmaya devam ediyor.

#### Tahta denetimi — tüm telefon ekranları, yan yana görüntüyle / 2026-09-24

- **İstek (kullanıcı, sohbette):** "HTML dosyasında kartlara uymayan var mı incele, aralardaki boşlukları düzgün doldurmuş muyuz incele; sonra APK, commit + push."
- **Yöntem:** `RankIt Redesign.dc.html` (repair-kit sürümü) + bileşenleri scratchpad'e kopyalanıp yerel bir HTTP sunucusundan açıldı; tek tahtayı telefon boyutunda gösteren küçük bir görüntüleyiciyle her ekran uygulamanın aynı ekranıyla (375×812, gerçek DB'nin kopyası) **yan yana** karşılaştırıldı. Kapsam dışı bırakılanlar gerekçeli: 18a–c / 19a–b (BUILD §29 kesilmiş), 2o (tahtanın kendisi "superseded"), 4e/4f (Watchalong kaldırıldı), 4c/4i (tasarım sistemi sayfaları), 2k/2l (paylaşım, bilinen açık iş).

**Tahtaya uymayan ve düzeltilen (hepsi tarayıcıda doğrulandı):**
1. **2a Home — gün listesi yoktu.** Tahtada hero'nun ALTINDA `TONIGHT · 4 MATCHES / See all` ve 64px satırlar (canlıda solda 3px ısı-5 çizgisi, nabız noktası, `LIVE · 73'`, sağda `Join`). Uygulamada liste hiç yoktu, hero'nun ÜSTÜNDE tahtada olmayan "YOUR NIGHT / Tonight on RankIt" başlığı vardı. Başlık kalktı, liste kuruldu (`redesign/homeTonight.js`: canlı önce, sonra saat, sonra bitenler; bayat canlı kaynak `DELAYED`; bitmiş ve puanlanmamışta `Rate`). Topluluk bölümü 2b'deki gibi etiket satırı (`POPULAR ACROSS RANKIT · Activity`). Karusel noktası altın değil, 18×4 beyaz çubuk (tahta).
2. **2a/2b spoiler kalkanı — aynı ayar iki yerdeydi.** Başlıktaki kalkan + pill'lerin altında ayrıca "Hide scores" düğmesi (tahtada yok). Kalkan açıkken tahtada **yeşil** halka (`rgba(63,176,140,.14)` / `.45` / `#3fb08c`) ve altında 56px "Spoiler shield · Scores, heat and reviews hidden" satırı + 46×28 yeşil anahtar; uygulamada kalkan altın dolguydu. Hepsi tahtaya çekildi; eski düğme yalnız bayrak kapalıyken (başlıkta kalkan çizilmeyince) duruyor.
3. **2q Friends — ekran hiç bağlanmamıştı.** Uçta 2q için `/activity` (takip ettiklerinin kayıtları + kapattıkları koleksiyonlar) vardı; telefon onu hiç çağırmıyor, Home'un "herkesin son incelemeleri" akışını düz satırlarla gösteriyordu. Yeni `redesign/FriendsFeed.jsx` + `feedItems.js`: her kayıt bir kart (avatar · @kullanıcı · "on the night · 2h ago" · 11px yıldızlar, altında kompakt kart **arkadaşın kendi skin'i ve damgasıyla**, yorum, respect elması + yanıt sayısı), kapanan koleksiyon kartı (40px ısı halkası + "Finished X — 6 of 6 rated this season."). §3.1: maçı puanlamadıysan arkadaşın yıldızı, yorumu, damgası ve kartın topluluk ısısı kapalı — tek kapı kartın altında. `/activity` kart için yarışma / spor / renk / arma / skin ve topluluk ısısını (20 eşiği) dönüyor. Bölgesiz SQLite zamanı UTC okunuyor (tarayıcı yerel okuyup saat dilimi kadar kaydırıyordu).
4. **2i yarışma sayfası — 0.3.0 stili duruyordu.** Ortalanmış hero, altın eyebrow, 9px sekmeler, 25px arma halkaları, altın PTS. Şimdi tahta: sola yaslı `ITALY · 2026-27` / 31px ad / `Football · 20 clubs · Matchday 5` (kulüp sayısı tablodan, hafta oynanmış son haftadan — `redesign/competitionHead.js`), sola yaslı 26px aralıklı sekmeler, 52px satır + 31px kulüp elması, PTS 15px beyaz.
5. **3d Players — eski bir tahta revizyonuna göre kurulmuştu.** Güncel 3d "Player of the Match" ile açılıyor (WON + SHARE OF VOTES, çubuk; 20 oyun altında `TOO FEW VOTES`) ve kapanış cümlesi değişti ("Goals and assists come from the feed — every app has them. Player of the Match is ours…"). Uç bunu (`_potm_leaders`, §10.3) zaten dönüyordu; ön yüz "goals" isteyip POTM'u hiç göstermiyordu. Varsayılan artık sunucunun ilk cetveli.
6. **2f / 2g / 15a maç sayfasının başı.** Uygulama her sekmede çizgili, kulüp renkli kart-hero ve ortalanmış sekmeler çiziyordu; kapat sağdaydı. Tahta: **Match** sekmesinde sade hero (düz `#1a1b1e`, gri ortalı eyebrow, iki elmas, durum hapı + 46px skor, "Deportivo A Coruña vs Real Betis", tarih satırı), **Community/Companion**'da kompakt satır ("Deportivo A Coruña 1–1 Real Betis / Full time · 23 Sept 2026" ya da "Community · 318 reviews"), kapat solda, sekmeler sola yaslı, Companion rozeti yazının YANINDA ("Companion [LIVE]"; eskiden yazının üstüne biniyordu). Kompakt satır ile X merkezleri hizalandı (ölçüldü 270/270).
7. **3j hızlı puanlama.** Eyebrow altındı (gri), satırlar hairline listeydi (64px kart), seriyi koruyan satır altın kenar + altın "Keeps your streak alive" (yeşildi), "Last 7 days" 7 günün TÜM maçlarını açık listeliyordu — tahtada kapalı tek kart, dokununca açılıyor; sayaç gri.
8. **4g ilk açılış.** Üstte yalnız "R" ikonu vardı; tahtada yatay kilit: işaret + "RANK" / altın "IT" + "BY PRIMARY ARCH". Aynı kelime markası uygulama başlığında da (2a) "RANK" + altın "IT" oldu.
9. **Küçük kusurlar (boşluk / hiza):** 3e arama sayfasında yuvarlak hapın İÇİNDE köşeli beyaz odak kutusu (halka hapa taşındı); 3f bildirim avatarlarında baş harfler dairenin sol üstüne diziliyordu (`.ri-alert-body>span` avatar kuralını eziyordu); `useDialog`'un programatik odakladığı panellerde tarayıcının `outline:auto`'su ekranın altında beyaz bir çizgi çiziyordu (tüm diyaloglar); günlük sayımı Profile'dan farklı tanımla sayıyordu (aynı hesap Profile'da 2, günlükte 7 — artık ikisi de farklı maç, Classic = puanlı damga).

**Uyan (değiştirilmedi):** 2c/6c, 2d/2e/3h (dünkü düzeltme), 2m/2n, 6a, 2j, 6b, 3g (iki bilinçli sapma: "Heat as numbers too" = Always; mağaza için LEGAL grubu), 3c, 3e düzeni (maç grubu uzun — sunucu sınırında kesilip söyleniyor, veri hacmi), 3f düzeni.
**Bu turda yeniden görsel olarak açılmayan:** 2h, 15b, 15d, 5a/5b/6d, 5c, 4a, 15c, 9a/9b, 2p, 3i, 3k/3l, 4b — Aşama 4–11'de tahtaya karşı kabul edilmişlerdi. 4h/2r ve 9a/9b oturum istiyor; bu ortamda hesaba giriş yapılamadığı için görsel kabul edilemedi.
**Açık — marka kararı:** 4i "Both marks, from scratch" yeni işaretleri (altın rozet) tanımlıyor; uygulama başlığı, 4g ve uygulama ikonu hâlâ sekizgen "R". Logo/ikon değişikliği bir marka kararı ve APK ikonunu da değiştirir — kullanıcıya bırakıldı.
- **Vite kusuru (bulundu, düzeltildi):** `FriendsFeed.jsx` ile `friendsFeed.js` aynı klasörde — Windows'ta büyük/küçük harf ayrımsız dosya sistemi uzantısız importu `.js`'e çözüp "default export yok" hatasıyla uygulamayı boş bıraktı. Saf modül `feedItems.js` oldu.
- **Test:** yeni `frontend/tests/board-audit.test.mjs` (7), `tests/test_rankit_friends_feed.py` (2), `diary-view.test.mjs` +1 (sayım Profile ile aynı). **Mutasyon:** 7 kural (kalkan altına dönmesi, Friends'in Home akışına dönmesi, yanlış hafta, UTC yerine yerel okuma, canlı-önce sırası, `/activity` skin'i, `/activity` 20 eşiği) → yeşil kontrole karşı hepsi **kırmızı**, dosyalar bayt-aynı geri yazıldı. Backend **289/289**, frontend **148/148**, Vite production build geçti; ESLint tabanı aynı (6 + `CompanionPanel.jsx:152`).
- **Ortam:** QA kopyasına sentetik veri (bugüne üç maç, `provider='qa'`; 5 takip; 22 POTM oyu) yalnız kopyada; `launch.json` bayt-aynı geri yazıldı, kopya ve tahta klasörü silindi; gerçek DB'de QA verisi yok (14 günlük satırı, `qa_%` kullanıcı 0).

#### Aşama 13 — durumlar ve erişilebilirlik (iki yüzey) / 2026-09-24

- **Kaynak:** `BUILD.md` §5 (durumlar), §6 (erişilebilirlik); ONARIM sırası 13 → 14 → 15 (kullanıcı: "web 15'te başlıyor ama 13 ve 14 iki yüzeyli, önce onlar").
- **Tarayıcıda ölçülen (375×812, gerçek DB'nin kopyası), düzeltilen:**
  1. **44px altı hedefler** (görsel boyut aynı, dokunma alanı `::after` / `::before` ile — dosyanın [b] kalıbı): hüküm kapısının metin düğmesi 92×14 (iki yüzeyde ortak `ri-gate-action`; web'de `.riw` kuralı), kısa sekmeler 32–36px genişlik, maç başlığındaki yarışma bağlantısı 106×12, "Community ›" 64×15, 34px kapat düğmeleri. Isı kaydırıcısının **girdisi** 8px'ti (izin üstüne/altına dokunmak kaydırıcıya gitmiyordu): girdi 44px, 8px iz yalnız çizimde (`::-webkit-slider-runnable-track` / `::-moz-range-track`). Sonuç: telefonun bütün ekranlarında 44 altı hedef **0**.
  2. **Çevrimdışı (§5.3 / 3l):** önbellekteki kartın **tamamı** `.62`; içteki görsel ikinci kez solmuyor (eskiden yalnız görsel soluyordu).
  3. **Günlük satırında ısı yalnız renkti (§6 "never as colour alone"):** 4×36 çubuğun yanında sayı (`b`, 11px `#9aa0a6`). Puanlamadığın kayıtta topluluk hükmü görünmüyor (§3.1) — `rowVerdict` puanın yoksa `null`; şerit rengi de aynı kuraldan.
- **Doğrulandı, değişiklik gerekmedi:** bütün telefon diyalogları `role=dialog` + `aria-modal`, odak içeride, Tab sarıyor, Escape kapatıyor, odak geri dönüyor; telefon JSX'inde dönen çark yok (yalnız iskelet); odak halkası 2px mürekkep.
- **Bilinçli ertelenen:** web'in eski kabuğundaki küçük hedefler (nav 36px, pill 32px, karusel okları ve noktaları) — o kabuk Aşama 15'te (7a) baştan kuruluyor; yamamak yerine orada.
- **Test:** yeni `frontend/tests/stage13-states-a11y.test.mjs` (5), `diary-view.test.mjs` +1 (puanlanmamış kayıtta hüküm yok). **Mutasyon:** kapı alanı 14px, çevrimdışı 1, kaydırıcı 8px, hükmün puansız görünmesi → yeşil kontrole karşı hepsi **kırmızı**, dosyalar bayt-aynı geri yazıldı.
- **Ortam:** QA kopyası silindi, `launch.json` bayt-aynı (sha `5d564097…`), gerçek DB'de QA verisi yok (14 günlük satırı, `qa_%` kullanıcı 0, `provider='qa'` maç 0).

#### Canlı hata — dizilim varken POTM / respect verilemiyor / 2026-09-24

- **Kullanıcı yakaladı:** "Maç sayfasında confirmed lineup varken community kısmında POTM ve respect atayamıyoruz; ilk 11'ler ve yedekler görünüyor."
- **Kök neden (canlıda ölçüldü):** son 9 bitmiş maçın **hepsinde** kadrodaki herkesin `player_id`'si boş, "oynayan" sayısı tam 22 (oyuna girenler işaretsiz). Seçici yalnız kimliği olan oynayanları listeliyor (§10.2). Bağlayan kod (`_lineup_player_id`, `substitutionEvents`) 80b6fa0 ile bu sabah canlıya çıktı; kadrolar 2026-09-20'de eski kodla yazılmıştı ve kadro döngüsü bitmiş + kadrosu olan maçı bir daha sormuyordu → hiç onarılmıyordu.
- **Düzeltme (0ddb53e, main'e push, kullanıcı onayıyla):** `_lineup_targets` canlı/yaklaşan pencereden artan yeri, bağsız satırı olan bitmiş maçlarla dolduruyor (yeniden eskiye, 45 gün sınırı — kadro toplama 2026-09-05'te başladı; kalıcı hata sonsuza dek sorulmuyor). Tek `matchDetails` çağrısı oyuncuları bağlıyor ve oyuna girenleri işaretliyor. Telefon notu kadro görünürken "confirmed lineup gelince" demiyor.
- **Canlıda doğrulandı:** deploy sonrası ilk turda 9/9 maç onarıldı; oynayan 22 → 30–32, hepsi bağlı.
- **Test:** `tests/test_rankit_match_sheet.py` +2 (eski yazımlı kadro yeniden çekilir, oy açılır, bir daha sorulmaz; pencere dışı sorulmaz ve canlı pencere önce). Onarım bloğu kapatılınca 2 kırmızı. Backend **291/291**.

#### Aşama 14 — marka ve launcher / 2026-09-24

- **Kaynak:** `BUILD.md` §7, ekran `4i` "Both marks, from scratch" (onaylı notlarıyla), `2a` başlık, `4g` ilk açılış. Kullanıcı: "tabi geçir abi, yeni logo o."
- **RankIt işareti (§7.2):** tek bileşen `redesign/BrandMark.jsx` — kart silueti `M0 0H16.5L24 7.5V24H7.5L0 16.5Z`, puan yıldızı maskeyle oyulmuş (.6, optik merkez 12/12.6; 16px'te .62), maske kimliği `useId` ile örnek başına. Eski 12-gen + R madalyonunun **üç kopyası** (telefon başlığı, mobil kabuk 4g + hesap kontrolü, web `cards.jsx`) emekli; üçü de bu bileşeni kullanıyor.
- **Kilit:** 2a başlık — işaret 24, aralık 10, kelime 21 Rajdhani 700 `.03em` (RANK mürekkep, IT altın), `BY PRIMARY ARCH` 9px `.14em` `#7f868b` 5px; eski işaretin altın parlaması kalktı (tahtada yok). Tarayıcıda ölçüldü, hepsi birebir. 4g: [işaret + kelime] satırı 9px, eyebrow altında ortalı 7px (önceki geçişteki yatay kilit tahtaya uymuyordu). Web ray: işaret + RANK/altın IT; ray kilidinin ölçüleri 7a ile Aşama 15'te.
- **Primary Arch (§7.3 / 4i onaylı notlar):** işaret yeniden çizilmedi; kural bir birim içeride `M 6 24 H 42` (tam genişlikte uçlar halkanın köşelerine oturuyordu). 24px altında dolu inşa: altın 12-gen, dikişler ve kural boşluk olarak oyulur (16px'te 3), teal kural üstüne geri çizilir. **Not:** BUILD §7.3'ün "32px altı daire r 6.6" ve §7.4'ün "iki işaret mono" metinleri 4i'nin sonradan onaylanan notlarıyla çelişiyor (4i: taban 24, dolu inşa; eş-marka ikisi de altın, 0.72× ve boşlukla) — kullanıcının onayladığı 4i uygulandı. Şu an 24 altı `Logo` kullanan yer yok; varyant hazır.
- **Android launcher (§7.1):** `drawable-anydpi-v26/rankit_launcher.xml` uyarlanabilir ikon (arka plan + ön plan + `monochrome` → Android 13 temalı ikon); ön plan aynı geometri vektörde `evenOdd` ile (maske yok), görünen 72dp'nin %62.5'i (4i: 96'da 60), 66dp güvenli dairenin içinde; arka plan `150deg #ffe9b0 → #ffb11b 52% → #e08f00`, eğim görünen kareye göre. API 24–25 için `drawable/rankit_launcher.xml` düz ikon (altın kare, yarıçap 21/96). `mipmap-anydpi-v26/ic_launcher(_round)` stok robot yerine aynı katmanlara, `ic_launcher_background` `#FFFFFF` → `#FFB11B`. Manifest değişmedi (zaten `@drawable/rankit_launcher`). Vektörler SVG'ye çevrilip daire / squircle / kare maskelerle görüldü; `:app:processDebugResources` geçti, bağlı tabloda `rankit_launcher` hem varsayılan hem `anydpi-v26`. APK üretilmedi.
- **Test:** yeni `frontend/tests/stage14-marks.test.mjs` (5). **Mutasyon:** başlık işareti 29, kural `M 4 24 H 44`, launcher zemini `#FFFFFF` → yeşil kontrole karşı hepsi **kırmızı**, dosyalar bayt-aynı. Frontend **159/159**, Vite production build geçti.
- **Açık:** açılış ekranı (`drawable*/splash.png`) Capacitor'ün stok logosu, beyaz zemin; `Theme.SplashScreen` zemin rengi verilmemiş (Android 12+'da yeni ikon beyazın üstünde). Tahtası yok — kullanıcıya soruldu. Yeni ikon ancak yeni bir APK ile cihaza gider (kullanıcı istediğinde).

#### Aşama 15 — web temeli / 2026-09-25

- **Kaynak:** `BUILD.md` §§16–18, §20, §23, §25; `RankIt Web.dc.html#7a` (tahta tek başına bir sayfaya çıkarılıp 1440×900'de açıldı, satır içi stilleri ölçü kaynağı); arama sonuçları için `#11c`'ye bakıldı.
- **Başlık (7a, §17):** 78px, yapışkan. Kilit (işaret 26, kelime 19 Rajdhani .03em, RANK mürekkep / IT altın, `BY PRIMARY ARCH`); dört gezinme — Home · Discover · Activity · Lists, 38px, aktif altın `rgba(255,255,255,.06)` üstünde; **gerçek arama alanı** (340×40, `/` ipucu, `/` odaklar, Esc önce temizler sonra bırakır, Enter `/rankit/search?q=`); kalkan (40, açıkken yeşil — altın değil, §1.2); seri hapı (40, halka 24, `/rank` → `streak.current`); avatar 36 → Profile; oturum yoksa "Sign in". Sitenin 48px üst barı RankIt web rotalarında çekiliyor (7a'da yok, üst üste iki başlık olurdu); Primary Arch'a dönüş rayın dibinde. `/rankit/app` (telefon prototipi) kapsam dışı.
- **Ray (§17, 232):** YOUR STANDING (kademe amblemi + ad + puan → Profile), THE HUNT (açık koleksiyonlar, en çok ilerleyen önce, telefonun halka dolgusuyla — `ringFill` artık `huntSummary.js`'te ortak; kulüp sezonları "Arsenal · The 38", üç kez "The 38" yazmasın), FOLLOWING (takip edilen kulüpler, `/onboarding.followed_clubs`, "+N more"; satır kulübü **Inspector'da** açar, §23/12a). Veri hesaba bağlı (`useShellData`): çıkış ya da hesap değişince önceki kişinin kademesi görünmez. Oturum yoksa ray bir giriş kartı. Arka uç değişikliği yok.
- **Duvar ve kart (§18):** ızgaralar zaten `minmax(320px, 1fr)`idi; carousel 300px sabit sütundan `max(320px, (100% − 36px)/3)`e. **Web kartı artık telefonla AYNI bileşen** (`redesign/MatchCard.jsx`, web yuvası `WallCard`: crest 56, sanat 132, skor 46) — skin, ısı eşiği, kalkan ve hüküm kapısı iki yüzeyde ayrı yazılıp ayrışıyordu; eski web kartı silindi. Telefonun `fromApiMatch` eşlemesi `matchModel.js`'e, RankIt günü (`rankitDayContext`, 11:00–11:00) `homeTonight.js`'e taşındı: web ana sayfası da artık aynı pencereyi soruyor (ölçüldü: iki yüzey de "TONIGHT · 7 MATCHES").
- **Home (7a):** `TONIGHT · N MATCHES` + 30px iki ok (son üçlü görününce ileri kapanır), yan yana üç kart; `FROM PEOPLE YOU FOLLOW` satırları (`/activity`, telefonun 2q kuralları `feedItems.js`'ten: §3.1 puanlamadıysan arkadaşın yıldızı ve yorumu kapalı, kalkan skoru satırdan da düşürür) + "All activity ›". Oturum yoksa telefonun 2a'sındaki gibi `POPULAR ACROSS RANKIT`. Spor çipleri ve "Hide scores" düğmesi 7a'da yok — kalkan başlıkta; Discover'daki ikinci "Hide scores" da kaldırıldı (aynı ayar iki yerde, 2a düzeltmesiyle aynı).
- **Arama:** 11c'nin tam sayfası (sekmeler, sayılar, "hottest first") Aşama 17'de. O zamana kadar `/rankit/search` telefonla ortak 3e bileşenini (`SearchSheet`, yeni `embedded` modu: dialog, kendi alanı ve odak tuzağı kapalı) duvarın içinde çiziyor; başlıktaki alan tek giriş.
- **Karar uzlaştırması:** 2026-09-02'deki sahip kararı (Rank ortada, Lists Discover'ın içinde, `7832f27`) web'in **alt barı** içindi; 7a/§20 masaüstü başlığını tarif ediyor (dört gezinme, elmas yok). İkisi birlikte: masaüstünde 7a, **≤820'de telefonun beşlisi** (Home · Discover · Rank · Activity · Profile) — §25 "820 ve altında web uygulamadan ayırt edilemez". Discover'daki Lists sekmesi dar ekran için duruyor.
- **BUILD tahtanın üstünde (iki yer):** 7a eyebrow / NIGHTS / ray etiketleri 8.5px — §1.5 tabanı 9px, üçü 9px (mevcut `focus-and-targets` sözleşmesi yakaladı). Odak ofseti 2px (§26).
- **Tarayıcıda (1440 / 1000 / 390, gerçek DB'nin kopyası; kopyada `rankit_demo` 3 kişi + 5 kulüp takip ediyor):** 7a ölçüleri birebir (başlık 78, gezinme 38, arama 340×40, kalkan/seri 40, avatar 36, ray 232 + 22/18, Hunt 38, kulüp 34, kartlar 370 ≥ 320, 18 aralık); görünür web hedeflerinde 44 altı **0** (kısa kullanıcı adları 27–34px genişlikteydi → dokunma alanı en az 44); arama alanında iç içe iki halka vardı (`.riw :focus-visible` input'a da çiziyordu) → tek halka; kalkan açıkken 7 kart spoiler, akış satırları kurala göre (izleyen puanladıysa skor açık); `/rankit/search?q=arsenal` sonuçları, Esc alanı ve adresi temizliyor; kulüp satırı çekmeceyi açıyor (`aria-modal`), Escape kapatıyor; oturumsuz ray + "POPULAR ACROSS RANKIT"; 1000'de ray çekili, taşma yok; 390'da alt bar + elmas. Telefon prototipi (`/rankit/app`) taşınan iki fonksiyonla hatasız.
- **Bulunan eski kusur:** günlük duvarında kart anahtarı MAÇ kimliğiydi — yeniden izleme aynı maçı iki kez koyunca React "same key" hatası (konsolda ölçüldü). Anahtar artık kayıt (`entry-<id>`); yeniden çizimde hata 0.
- **Test:** yeni `frontend/tests/stage15-web-foundation.test.mjs` (9). **Mutasyon:** masaüstü gezinmesine Rank eklemek, duvarı 268'e döndürmek, site barını geri getirmek, günlük anahtarını maça döndürmek, gömülü aramada dialog'u açık bırakmak → yeşil kontrole karşı hepsi **kırmızı**, dosyalar bayt-aynı geri yazıldı. Frontend **168/168**, Vite production build geçti; ESLint: yeni dosyalar temiz, `RankItWeb.jsx` HEAD'den bir `set-state-in-effect` eksik (ana sayfa yeniden yazıldı), kalan `useParams` önceden vardı.
- **Ertelenen (sırası gelince):** ≤1080'de ray şimdilik tamamen çekiliyor — §25'in 64px ikon sütunu Aşama 18'de. Masaüstünde puanlama duvardan (`R`, 11a) Aşama 16'da; o zamana kadar kart → Inspector. Web Inspector'ın odak geri verme davranışı Aşama 16'da (çekmece kapanınca odak `body`'ye düşüyor — eski davranış). 11c tam sonuç sayfası Aşama 17. Commit / push / deploy yapılmadı.
- **Ortam:** kopya DB, tahta klasörü ve test token'ı silindi; `launch.json` bayt-aynı (sha `5d564097…`); gerçek DB'de QA verisi yok (14 günlük satırı).

#### Aşama 16 — web Inspector ve puanlama akışı / 2026-09-25

- **Kaynak:** `BUILD.md` §9 (beş evre, §9.1–9.4), §10.2, §11, §19 / §19.1 / §19.2, §20, §21; `RankIt Web.dc.html` `16c`, `15w`, `7b`, `15x`, `7c`, `16a`, `7d`, `16b`, `7e`, `11a`, `15y`, `15z` (her tahta tek başına bir sayfaya çıkarıldı, satır içi stilleri ölçü kaynağı); backend Phase 14 kaydının frontend listesi. Aşama 15 önce `82b6f5f` ile main'e gitti (kullanıcı: "şimdiye kadarki kısmı pushlayalım"), canlıda doğrulandı.
- **Kabuk (§19):** eski web "Inspector"ı ortada/altta açılan 760px bir MODAL sheet'ti. Yerine `web/Inspector.jsx`: sağa sabit 468, başlık 56 (`INSPECTOR · ARS 3–1 TOT` — skor yalnız oynanmışsa ve kalkan kapatmıyorsa), küçült / kapat. Açıkken ray çekilir, duvar .4'e söner ama dokunulabilir kalır (başka kart = Inspector o karta döner); fare ya da odak duvara girince okunur. Küçültünce panel DOM'da kalır (taslak yaşar), köşede çip. Açılışta odak panele, kapanınca açan karta.
- **Sekmeler değişmez (§9):** Match · Community · Companion; evre ve birincil eylem tek yerde (`web/inspectorView.js`, saf ve testli): planlı / kadro açıklandı → "Add to watchlist" (+ favori ve listeye ekle menüsü); canlı → "Watch with your Companion"; bitmiş puansız → Match'te "Rate this match", Community'de "Log this match" yıldız gelene kadar pasif (§9.3); puanlı → yalnız bir şey değişince "Update your entry". Companion rozeti (gelen sayısı / LIVE) sekme açılmadan görünür.
- **Match:** planlı (16c) kart + beklenen ısı + yayıncı (`WATCH IN <ÜLKE>` · CONFIRMED / TYPICAL / NOT LISTED) + dürüst "SEASON SQUADS" notu; canlı (15w) kendi hero'su (iki elmas, `LIVE · 73'` hapı — bayat kaynakta `DELAYED`, 38px skor), takım seçici, ON THE PITCH (ilk 11'den çıkmayanlar + girenler), CAME ON (dakika, "for X"), Match'te olay akışı YOK (§9.2); bitmiş (7b) kart + özet + olaylar (kalkan açıkken ikisi de gizli) + yayıncı + iki takımın kadro kartı (teknik direktör, diziliş, yedekler açılır) + "KEEP IT" (favori, liste). 15w'nin ince mevkisi (CB/AM/ST) sağlayıcıda yok; kaba etiketin kısaltması (GK/DF/MF/FW) — uydurulmadı.
- **Community:** puansız (15x) "How was it?", 42px yıldızlar, klavye `1–5` / `.` yarım / `C` Classic (ipucu ekranda); puan gelince DRAFT: Classic damgası, **TAGS & PLAYERS** (en fazla 3 etiket — telefonla ortak `redesign/entryTags.js`; POTM + respect satırı → 15y), "Write about the night" → 15z. Puanlı (7c + §9.4): YOUR ENTRY · SAVED (yıldız, Classic, **inceleme metni kaydın içinde**), TAGS & PLAYERS, kalabalık (ısı adı rampanın rengiyle, 20 altında TOO FEW RATINGS; inceleme / Classic yüzdesi / puan sayısı; POTM ≥20 oy), en çok respect alan üç inceleme. **BUILD tahtanın üstünde:** 7c'nin YOUR ENTRY'sinde inceleme metni ve TAGS & PLAYERS bloğu yoktu — §9.4 ikisini istiyor, eklendi. Kişisel puanın yanındaki "All-timer" gibi adlar BUILD'de tanımlı değil (§5.5 "own stars are not heat") — telefon gibi yalnız sayı.
- **Companion:** telefonla AYNI `CompanionPanel` (16a / 7d / 16b) — nabız 20 okuma eşiği, live read, anlar, sohbet; eski web `WatchalongPanel`'i silindi (Watchalong telefonda da emekli).
- **15y** oyuncu seçici DİYALOG (`PlayersPicker` web varyantı); oylar taslağa, kayıtla birlikte gider. **15z** yazıcı PANELİN içinde; kayıt varken yazdıkça kaydeder — `PUT /diary/{id}` gövdesinde YALNIZ `{match_id, entry_id, review, tz_offset}`, `rating` alanı hiç gitmez (backend Phase 14: gönderilmeyen puan korunur). Kayıt yoksa metin taslakta kalır, "Log" ile gider.
- **Kayıt yolu telefonla aynı:** `saveRating` (günlük + POTM + respect tek kuyrukta, kopunca bekler) → `createCollectible` → **7e** katmanı (`web/CollectibleOverlay.jsx`): perde .88 + ısı-5 ışıma, kart 452 (crest 76, sanat 196, skor 66), metin 400, 60 aralık, 44'lük kapat + Escape; "That's card N." (uçtan; kuyrukta uydurulmaz), cümle yalnız olanı söyler (seri ancak uç ilerlettiyse), karolar seri / puan (+delta, toplamlar /rank'ten) / ilerleyen koleksiyon; Share · Skin · Edit. **Skin pasif:** telefonun `SkinPicker`'ı yalnız `.rankit-app` kabuğunda stilli, web'in skin seçicisi `11b` Aşama 17'de — açıklamalı pasif.
- **11a hızlı puanlama (§20):** kartın üstündeyken (fare) ya da odaktayken (klavye) `R` → 560'lık diyalog; 1–5, `.`, `C`, ⏎, Esc; kısayollar altta görünür. Tam zamandan önce `R` yalnız "Ratings open at full time." der (§9.1). **Tahtadan bilinçli sapma:** 11a puanlamadan ÖNCE "4.6 CROWD" gösteriyor — §3.1 hükmü puanlamadan önce açmaz; o sütun yok.
- **Backend:** `GET /matches/{id}` yanıtına `my_entry_id` (15z doğru kaydı hedeflesin; yeniden izleme varken "maçın son kaydı" yanlış olabilirdi). Eklemeli, `tests/test_rankit_inspector.py` genişledi. Backend **291/291**.
- **Bulunan ve düzeltilen eski kusurlar:** web inceleme respect'i **kalp** ikonuyla "Like" diyordu (§11.3 "never a heart") → RankIt elması, `web/ReviewArticle.jsx`'e taşındı; yanıt düğmesinin erişilebilir adı yoktu; 7c'de "%80 called Classic" beş puandan hesaplanıyordu → 20 altında "—" (§5.5).
- **Tarayıcıda (gerçek DB'nin kopyası, 1440 / 1000 / 390):** puansız maç → 15x, klavyeyle 4 → 3.5 → Classic, etiket, seçici (bütçe 1/1 · 1/2, Escape yalnız seçiciyi kapatır), yazıcı (taslak), "Log" → 7e ("That's card 8.", +5 geç puan, seri yok) → Edit → 7c (sunucudan: 3.5, Classic, etiket, POTM, respect, inceleme) → yazıcı otomatik kaydı tek `PUT` (rating yok), sunucuda puan 3.5 korundu, dönüşte gereksiz "Update" yok. Canlı (kopyada maç geçici "live"): 15w, rozet LIVE, Companion 7d. Planlı: 16c. Küçült / çip / geri aç, Escape. `R` → 11a → ⏎ → 7e ("That's card 9.") → Escape → odak karta döner. Ölçüler: panel 468 @ x=972, başlık 56, 7e kart 452 + metin 400 + 60 aralık. Görünür hedeflerde 44 altı **0** ("Match" sekmesi 37px'ti → düzeltildi). 1000'de panel duvarın üstüne biner, 390'da tam genişlik (Aşama 18'de alt sayfa). Konsol hatası 0.
- **Test:** yeni `frontend/tests/stage16-web-inspector.test.mjs` (11); `visibility-policy.test.mjs` web kuralı yeni dosyaya yönlendirildi (sözleşme aynı: skoru açmak hükmü açmaz, kapı ikisini açar). **Mutasyon:** otomatik kayda `rating` eklemek, canlı hero'nun hükmü de açması, Classic yüzdesi eşiğini kaldırmak, respect'i kalbe döndürmek, 11a'ya kalabalık puanı koymak, davet düğmesini yıldızsız etkin bırakmak → yeşil kontrole karşı hepsi **kırmızı**, dosyalar bayt-aynı. Frontend **179/179**, Vite build geçti; ESLint: yeni dosyalar temiz, `RankItWeb.jsx` HEAD'in 7'sinden 5'e.
- **Ertelenen:** 7e Skin → 11b (Aşama 17); 7c "All N ›" → 7h (Aşama 17); ≤1080 panel davranışı Aşama 18; Discover duvarı kayıttan sonra kendi kendine tazelenmiyor (eski davranış, kartta kişisel puan zaten yok). Commit / push yapılmadı.
- **Ortam:** kopya DB, tahta klasörü, token silindi; `launch.json` bayt-aynı (sha `5d564097…`); gerçek DB'de QA verisi yok (14 günlük satırı).
