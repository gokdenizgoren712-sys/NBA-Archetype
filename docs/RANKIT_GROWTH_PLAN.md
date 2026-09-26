# RankIt — Maksimum Kullanıcıya Ulaşma Planı

**Belge tarihi:** 26 Eylül 2026
**Önceki belgeler:** `RANKIT_STORE_LAUNCH_PLAN.md` (mağazaya çıkış), `RANKIT_STORE_BLOCKERS_PLAN.md` (kod engelleri)
**Soru:** Mağazaya çıktıktan sonra RankIt en çok kişiye nasıl ulaşır, ve ulaştığı kişiyi nasıl tutar?

---

## 1. Hedef ve kuzey yıldızı

RankIt'in fikri "izlediğin maçı puanla, günlüğün ve rafın kendiliğinden oluşsun": spor için Letterboxd. Büyümenin yakıtı, her puanın yeni birini getirebilmesi.

| | |
|---|---|
| **Kuzey yıldızı metriği** | **Haftalık aktif puanlayıcı (WAR):** o hafta en az 1 maç puanlayan kullanıcı sayısı |
| Neden bu | İndirme sayısı boş kalabilir; puan ürünün kalbi. Her puan ısı haritasını, incelemeleri ve sosyal akışı besler |
| Destek metrikleri | indirme → hesap açma; hesap → ilk puan (hedef: ilk oturumda); D1/D7/D30 tutunma; kullanıcı başına haftalık puan; paylaşım oranı ve paylaşımdan gelen kurulum (viral katsayı); push izin oranı |

> Aşağıdaki hedef rakamlar örnek. Lansmandan sonraki ilk 2 haftanın gerçek verisiyle ayarlanmalı. Ayrıca bugün analitik yok (G25): ölçemediğimizi büyütemeyiz.

---

## 2. Bugünkü durum: büyüme açısından

**Elimizdeki güçlü varlıklar:**
- Gerçek maç kataloğu (5 büyük lig, kupalar, Şampiyonlar/Avrupa Ligi, NBA) ve Türkiye yayıncı verisi.
- Alışkanlık mekanikleri: seri (streak), Hunt koleksiyonları, raf, Classic, POTM/Respect.
- Sosyal katman: takip, arkadaş akışı, zevk uyumu ("57 maçta 41 uyum"), watchalong.
- **Oyunlar:** Lineup Builder uygulamada; motor rastgeleliği dışarıdan alıyor, "Günün Draft'ı"na hazır.
- RankIt'in web sürümü (masaüstü + SEO potansiyeli) ve Primary Arch sitesinin mevcut trafiği.
- Misafir modu: kayıtsız deneme.

**Büyümeyi bugün tıkayan boşluklar** (koddan doğrulandı):

| # | Boşluk | Etkisi |
|---|---|---|
| 1 | **Paylaşım metninde bağlantı yok** (`collectibleShareText`): "X vs Y · My rating 4/5 · RankIt by Primary Arch" | Paylaşım kimseyi uygulamaya getirmiyor; viral döngü kopuk |
| 2 | **Bağlantı önizlemeleri yanlış:** site tek sayfalık React uygulaması; X/WhatsApp/Telegram botları JavaScript çalıştırmaz ve `index.html`'deki **"NBA Archetype"** başlığını ve **eski `onrender` alan adını** görür | Paylaşılan her RankIt bağlantısı yanlış marka ve yanlış görselle görünüyor |
| 3 | RankIt sayfaları **sitemap'te yok**, sunucu tarafında içerik yok | Google'dan "Galatasaray Fenerbahçe maç puanı" gibi aramalarda sıfır trafik |
| 4 | **Push bildirimi yok** | En güçlü geri çağırma anı olan "maç bitti, puanla" kullanılamıyor |
| 5 | RankIt **yalnız İngilizce** (sitede TR/EN altyapısı var, RankIt'i kapsamıyor) | Ana pazar Türkiye'de sürtünme |
| 6 | **Süper Lig, EuroLeague ve Türkiye basketbol ligi yok** | Türk kullanıcının en çok izlediği maçlar katalogda yok |
| 7 | Davet/referans sistemi yok | Arkadaş getirmenin ödülü ve ölçümü yok |
| 8 | Giriş tarayıcıya gidip dönüyor | Kayıt ve girişte kayıp |
| 9 | Analitik yok | Hangi kanalın işe yaradığını bilemeyiz |

---

## 3. Plan: huninin her aşaması için

Her madde: **ne**, **neden**, **efor** (geliştirme günü, tahmini) ve **beklenen etki** (Yüksek/Orta/Düşük).

### 3.1 Edinme — yeni kişileri getirmek

| # | Ne | Neden | Efor | Etki |
|---|---|---|---|---|
| **G1** | **Bağlantılı, görselli paylaşım kartları:** puan kartı, "haftanın maçlarım", raf, Hunt tamamlama, oyun sonucu. Her paylaşım bir görsel (1080×1350 ve Story için 1080×1920) + `primaryarch.net/r/...` bağlantısı taşır; bağlantı web'de içeriği açar, uygulama yüklüyse uygulamayı | Her puan bir reklam olur; bugün kopuk olan viral döngüyü bağlar | 3–4 | **Yüksek** |
| **G2** | **Sunucu tarafı önizleme (OG) etiketleri ve dinamik OG görselleri:** backend, `/rankit/match/:id`, `/rankit/card/:id`, liste, profil ve oyun sonucu için `index.html`'e doğru başlık/açıklama/görseli yazar; görsel sunucuda üretilir (maç adı, ortalama puan, ısı rengi). Eski `onrender` adresleri `primaryarch.net`'e taşınır | G1'in paylaştığı bağlantılar X/WhatsApp'ta doğru ve çekici görünür | 2–3 | **Yüksek** |
| **G3** | **SEO:** herkese açık, indekslenebilir maç sayfaları ("Galatasaray–Fenerbahçe · RankIt puanı 4,3 · 1.240 taraftar"), turnuva ve "sezonun en iyi maçları" sayfaları; sitemap; yapılandırılmış veri (`SportsEvent` + `AggregateRating`) | Uzun kuyruk aramalardan sürekli, bedava trafik; her yeni puan sayfayı zenginleştirir | 3–5 | Yüksek (yavaş başlar, birikir) |
| **G4** | **Mağaza optimizasyonu (ASO):** EN+TR başlık, altyazı ve anahtar kelimeler ("maç puanla", "maç günlüğü", "futbol maç değerlendirme", "rate football matches"); hikâye anlatan ekran görüntüleri; 15 sn tanıtım videosu; puan ortalamasını ≥4,5 tutma (G14) | Mağaza içi aramalar ücretsiz kurulumun ana kaynağı | 1–2 + görseller | Yüksek |
| **G5** | **Primary Arch → RankIt hunisi:** sitenin mevcut ziyaretçilerine RankIt tanıtımı (ana sayfa kartı, oyun sonrası CTA), mobil web'de akıllı uygulama bandı (Apple Smart App Banner + Android için basit bant), masaüstünde QR | Zaten gelen trafiği dönüştürmek en ucuz edinme | 1 | Orta |
| **G6** | **İçerik motoru:** uygulamanın kendi verisinden otomatik haftalık içerik: "Hafta sonunun en yüksek puanlı 5 maçı", "Derbinin taraftar puanı", "En çok tartışılan maç" (puan dağılımı en geniş olan). X, Instagram ve TikTok için hazır görsel üretimi (G2'nin görsel motoru) | Düzenli, paylaşılabilir, "RankIt puanı" kavramını tanıtan içerik | 2 + haftalık 1 saat | Orta–Yüksek |
| **G7** | **Topluluk ve üreticiler:** TR futbol/basketbol YouTuber'ları, podcast'ler, taraftar hesapları; gazeteci ve bloglar için gömülebilir **"RankIt puanı" widget'ı** | Güvenilir seslerin kitlesi; widget her gömüldüğü yerden trafik getirir | 2 (widget) | Orta |
| **G8** | **An takvimi:** büyük maç haftalarında hazır içerik ve bildirim. Derbiler (GS–FB, FB–BJK, GS–BJK), El Clásico, Kuzey Londra, Şampiyonlar Ligi geceleri, NBA açılışı, Noel maçları, All-Star, playofflar, final gecesi | Kullanıcıların en çok "puan vermek istediği" anlar | Süreç | Yüksek |
| **G9** | **Ücretli edinme** (tutunma kanıtlandıktan sonra): Apple Search Ads, Google App Campaigns; küçük bütçeli testler, kurulum başına maliyet vs. D30 değer | Organik tabanı büyütmek; tutunma zayıfken para yakar, o yüzden sonra | Süreç | Orta |
| **G10** | **Mağaza öne çıkarma başvuruları:** App Store Connect'te "featuring nomination", Play'de öne çıkarma için kalite ve an uyumu (ör. sezon açılışı) | Tek bir öne çıkma binlerce kurulum getirebilir | 0,5 | Orta (şansa bağlı) |

### 3.2 Aktivasyon — ilk oturumda değer

| # | Ne | Neden | Efor | Etki |
|---|---|---|---|---|
| **G11** | **"Hafta sonunu puanla" açılışı:** takım/lig seçildikten hemen sonra, takip edilen takımların son 7 gündeki maçları; 60 saniyede 3 puan → raf ve seri hemen dolar | Boş uygulama terk edilir; ilk puan en güçlü tutunma sinyali | 2 | **Yüksek** |
| **G12** | **Misafirden hesaba yumuşak geçiş:** değer anlarında (3. puan, ilk Classic, oyun skoru) "kaydet" daveti; misafirin puanları hesaba taşınır (oyundaki bekleyen skor örüntüsü) | Kayıt duvarı yok, kayıp veri yok | 2 | Yüksek |
| **G13** | **Uygulama içi giriş:** e-posta/şifre ve Google ile girişi tarayıcıya gitmeden uygulamada yapmak (iOS'ta Apple ile giriş) | Bugünkü "tarayıcıya git, gir, geri dön" adımı ciddi kayıp üretir | 3–4 | Yüksek |

### 3.3 Tutunma — geri gelme alışkanlığı

| # | Ne | Neden | Efor | Etki |
|---|---|---|---|---|
| **G14** | **Push bildirimleri (FCM + APNs):** "Maç bitti, puanla" (takip edilen takım ya da izleme listesi); "arkadaşın bu maçı 5 verdi"; haftalık özet; seri hatırlatma. Kanal başına aç/kapat (Ayarlar'da uyarı anahtarları zaten var), günlük sıklık tavanı. Mutlu anda uygulama içi değerlendirme istemi | Maç sonu, puan vermenin en doğal anı; tutunmanın bir numaralı kolu | 3–4 + APK | **Yüksek** |
| **G15** | **Haftalık özet** (uygulama içi + e-posta, Brevo): "Bu hafta 6 maç, en yüksek puanın…, arkadaşlarınla uyumun…" | Pasif kullanıcıyı geri çağırır | 1–2 | Orta |
| **G16** | **Günün Draft'ı (oyun):** herkese aynı tohumlu tur; sonuç emoji ızgarası olarak paylaşılır ("Primary Arch Daily #142 · A 87 🟩🟩🟨"); günlük seri ve günlük sıralama. Motor rastgeleliği dışarıdan aldığı için web ve uygulamada aynı tur | Wordle tipi günlük alışkanlık + her gün paylaşılan içerik; maç olmayan günlerde de uygulamayı açtırır | 3 | **Yüksek** |
| **G17** | **Sezon "Wrapped":** sezon sonunda kişisel özet (en çok puanladığın takım, en yüksek puanın, Classic'lerin, arkadaşlarınla uyum, "sen X tipi izleyicisin"). Story formatında paylaşılır | Yılda bir büyük viral an (Spotify Wrapped etkisi) | 4–5 | Yüksek (mevsimlik) |
| **G18** | **Hedefler ve koleksiyonlar:** haftalık görevler ("3 farklı ligden maç puanla"), sezon hedefleri, Hunt genişletme; ödül olarak kozmetik kart görünümleri (SkinPicker mevcut) | Mevcut oyunlaştırmayı derinleştirmek | 2–3 | Orta |
| **G19** | **Sosyal keşif:** zevk uyumuna göre takip önerileri, "X taraftarlarının puanları" kulüp toplulukları, maç bazlı tartışma | Sosyal bağ kuran kullanıcı çok daha uzun kalır | 3 | Orta–Yüksek |

### 3.4 Tavsiye — kullanıcının kullanıcı getirmesi

| # | Ne | Neden | Efor | Etki |
|---|---|---|---|---|
| **G20** | **Davet bağlantıları:** kişiye özel bağlantı; gelen kişi davet edenle otomatik bağlanır (karşılıklı takip önerisi); ödül olarak iki tarafa özel kart görünümü, ilk N kullanıcıya "Kurucu üye" rozeti; kurulum kaynağı ölçülür (Play install referrer / Apple kampanya bağlantısı) | Arkadaşla kullanılan uygulama tutunur; ölçülebilir viral katsayı | 2–3 | Yüksek |
| **G21** | **Birlikte izle daveti:** canlı maçtan önce watchalong odasına bağlantıyla arkadaş çağırma | Canlı an + sosyal bağ; derbi gecelerinde çok güçlü | 1–2 | Orta |

### 3.5 Erişimi genişletmek — daha çok insanın işine yaramak

| # | Ne | Neden | Efor | Etki |
|---|---|---|---|---|
| **G22** | **Kapsam:** önce **Süper Lig, EuroLeague, Türkiye Basketbol Süper Ligi** (ana pazar); sonra Liga Portugal, Eredivisie, MLS, Brasileirão + Libertadores (Güney Amerika dev pazar), milli takım turnuvaları, kadın futbolu (az hizmet verilen bir niş). **Lisanslı veriyle birlikte** (lansman planı §6) | Her lig yeni bir taraftar topluluğu açar; TR'de Süper Lig'siz büyüme zor | Lig başına 1–2 | **Yüksek** |
| **G23** | **Yerelleştirme:** RankIt arayüzü için i18n; önce **Türkçe** (sitenin LanguageContext altyapısı genişletilir), sonra İspanyolca ve Portekizce (G22 ile birlikte), ardından DE/IT/FR. Mağaza sayfaları her dilde | Dil engeli kurulumu ve tutunmayı doğrudan düşürür | TR: 3–4; sonraki diller çeviri başına 1 | Yüksek |
| **G24** | **Düşük donanım ve zayıf bağlantı:** düşük seviye Android'de performans ölçümü, küçük paket, çevrimdışı puan kuyruğu (var), görsel optimizasyonu | Büyüyen pazarlarda (TR, Latin Amerika) cihazların çoğu orta-alt seviye | 2 | Orta |
| **G25** | **Erişilebilirlik:** ekran okuyucu, kontrast, dinamik yazı boyutu | Daha geniş kitle + mağaza öne çıkarmada artı | Blockers C4 + 1–2 | Orta |

### 3.6 Ölçüm — neyin işe yaradığını bilmek

| # | Ne | Neden | Efor | Etki |
|---|---|---|---|---|
| **G26** | **Gizlilik dostu analitik** (PostHog AB bölgesi ya da Plausible; reklam takibi yok): olay şeması (`app_open`, `first_rating`, `share`, `invite_sent`, `push_opt_in`…), huni ve kohort panoları; UTM, Play install referrer ve Apple kampanya bağlantılarıyla kaynak ölçümü. Gizlilik etiketlerine yansıtılır | Büyümenin pusulası | 2 | **Yüksek (her şeyin ön şartı)** |
| **G27** | **Deney ritmi:** haftalık 1–2 deney, ICE puanlaması (etki × güven × kolaylık), sonuçların kaydı | Tahmini değil, veriyle büyümek | Süreç | Orta |

---

## 4. Öncelik ve sıra

**İlk 30 gün (lansman + hemen sonrası)** — viral döngüyü bağla, ölçmeye başla, ilk oturumu güçlendir:
1. **G26 analitik:** bu olmadan geri kalanı ölçülemez.
2. **G1 + G2:** bağlantılı paylaşım kartları + doğru önizlemeler; eski alan adı düzeltmesi.
3. **G11:** "hafta sonunu puanla" açılışı.
4. **G4 + G10:** ASO ve öne çıkarma başvuruları (lansmanla).
5. **G5:** Primary Arch sitesinden RankIt'e huni.
6. **G6 + G8:** haftalık içerik ve derbi takvimi.

**30–90 gün** — alışkanlık ve ana pazar:
7. **G14:** push bildirimleri (yeni APK/iOS sürümüyle).
8. **G16:** Günün Draft'ı.
9. **G22 (TR):** Süper Lig + EuroLeague + TBSL (lisans kararına bağlı).
10. **G23 (TR):** Türkçe arayüz.
11. **G12 + G13:** misafirden hesaba geçiş ve uygulama içi giriş.
12. **G20:** davet bağlantıları.

**90 gün sonrası** — ölçek ve yeni pazarlar:
13. **G3:** SEO sayfaları (etkisi birikerek büyür, erken başlamak iyi olur; kaynak elverirse 30–90'a çekilebilir).
14. **G22/G23 genişleme:** İspanyolca/Portekizce + Güney Amerika ligleri.
15. **G19 sosyal keşif, G18 hedefler, G21 birlikte izle.**
16. **G9:** ücretli edinme testleri (D30 tutunma hedefi tuttuktan sonra).
17. **G17:** sezon Wrapped (Mayıs–Haziran sezon sonuna hazır).

---

## 5. Örnek hedefler (ilk verilerle kalibre edilecek)

| Metrik | Lansman +30 gün | +90 gün | +180 gün |
|---|---|---|---|
| Toplam kurulum | 2.000 | 15.000 | 60.000 |
| Haftalık aktif puanlayıcı (WAR) | 400 | 3.000 | 12.000 |
| Kurulum → ilk puan (ilk gün) | %40 | %55 | %60 |
| D7 / D30 tutunma | %25 / %10 | %30 / %15 | %35 / %18 |
| Paylaşım yapan kullanıcı oranı (haftalık) | %5 | %10 | %12 |
| Mağaza puanı | ≥4,5 | ≥4,6 | ≥4,6 |

Bu rakamlar yön vermek için. Gerçek taban ilk iki haftanın verisiyle belirlenir, hedefler ona göre güncellenir.

---

## 6. Maliyet — düşük bütçe yolu

Planın çoğu **geliştirme emeği** ve **düzenli içerik** ile yürür; para gerektiren kalemler az:

| Kalem | Tahmin |
|---|---|
| Analitik (PostHog/Plausible) | Ücretsiz katman → aylık küçük tutar |
| Push (FCM/APNs) | Ücretsiz |
| E-posta özetleri (Brevo) | Mevcut hesap; hacme göre |
| Lisanslı veri (G22 ile) | Aylık onlarca–yüzlerce $ (en önemli maliyet) |
| Üretici iş birlikleri | Takas / küçük ücret / ücretsiz erken erişim |
| Ücretli edinme (G9) | Test için aylık küçük bütçe, tutunma kanıtlanınca artırılır |
| Sunucu | Kullanıcı arttıkça Railway kaynakları; belirli bir DAU'dan sonra SQLite → Postgres |

---

## 7. Riskler ve ön koşullar

- **Lisans:** Büyüme görünürlüğü artırır, görünürlük de şikâyet riskini. Büyük itmelerden (G9, G10, büyük üretici iş birlikleri) önce lansman planı §6'daki lisans kararı netleşmeli.
- **Moderasyon ölçeği:** Kullanıcı arttıkça şikâyet de artar. Blockers planındaki kuyruk + otomatik gizleme yeterli başlangıç; günlük bakım süresi planlanmalı.
- **Sunucu ölçeği:** Tek sunucu + SQLite belirli bir yükün üstünde yetmez; watchalong ve push patlamaları (derbi geceleri) en riskli anlar. Ölç, eşiğe gelmeden Postgres ve çoklu instance'a geç (watchalong için Redis pub/sub; yol haritası P2).
- **Bildirim yorgunluğu:** Sıklık tavanı ve kanal seçimi baştan olmalı; aksi hâlde kullanıcı bildirimi, hatta uygulamayı kapatır.
- **Marka netliği:** "Primary Arch" (NBA analiz sitesi) ve "RankIt" (maç günlüğü) iki ayrı vaat. Mağazada RankIt öne, Primary Arch "yapan" olarak kalmalı.

---

## 8. Karar bekleyenler

| # | Karar | Önerim |
|---|---|---|
| 1 | Analitik aracı ve kapsamı | PostHog (AB) ya da Plausible; reklam takibi yok |
| 2 | Push'u ilk mağaza sürümüne mi, v1.1'e mi? | v1.1 (lansmandan 2–4 hafta sonra), ama izin istemi tasarımı şimdi |
| 3 | Kapsam genişletmede ilk ligler | Süper Lig + EuroLeague + TBSL (lisanslı veriyle) |
| 4 | Arayüz dili sırası | TR → ES/PT → DE/IT/FR |
| 5 | Davet ödülleri | Kozmetik (kart görünümü, rozet); para/puan yok |
| 6 | Günün Draft'ı | Evet; web + uygulama, ortak sıralama |
| 7 | İçerik üretimi kimde? | Haftalık 1 saat senden + otomatik görsel üretimi benden |
