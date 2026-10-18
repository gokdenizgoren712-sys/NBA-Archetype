# RankIt — Müsabaka Genişletme ve Mağaza Çıkışını Hızlandırma

**Belge tarihi:** 18 Ekim 2026
**Önceki belgeler:**
- `RANKIT_STORE_LAUNCH_PLAN.md`: mağaza şartları, §6 lisans riski;
- `RANKIT_STORE_BLOCKERS_PLAN.md`: kod paketleri A–E (A ve B canlıda);
- `RANKIT_GROWTH_PLAN.md`: büyüme planı; G22 kapsam, G23 dil.

> Fiyatlar üçüncü taraf karşılaştırmalarından ve satıcı sayfalarından derlendi (Ekim 2026). Bu ortamın ağı sağlayıcı sitelerine doğrudan erişemedi. Satın almadan önce resmi fiyat sayfasında teyit et.

---

## 1. Bugünkü kapsam

| Spor | Müsabakalar | Kaynak | Senkron |
|---|---|---|---|
| Futbol | Premier League, La Liga, Serie A, Bundesliga, Ligue 1; FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France; Şampiyonlar Ligi, Avrupa Ligi, Konferans Ligi (eleme turları dahil) | FotMob, resmi olmayan uç, tarayıcı taklidiyle | Fikstür 6 saatte bir, canlı skor, olaylar, kadro |
| Basketbol | EuroLeague | `api-live.euroleague.net` (resmi uygulama API'si, belgelenmemiş) | Fikstür + canlı skor |
| Basketbol | NBA | `nba_api` (stats.nba.com, resmi değil) | Yalnız canlı skor; **fikstür otomatik değil** (aşağıda) |

**Kodda bulunan üç sorun** (genişlemeden önce düzeltilmeli):

1. **NBA fikstürü otomatik taramada yok.**
   - `api/rankit_catalog_sync.py` yalnız EuroLeague ve futbolu tarıyor.
   - `sync_nba` yalnız elle çalıştırılan `src/rankit_sync.py` betiğinde.
   - Canlı güncelleyici var olan NBA maçlarını günceller ama yeni fikstür eklemez. NBA sezonu açıldığında takvim elle doldurulmadıysa eksik kalır.
   - Canlıda `/api/rankit/sync-health` ile doğrulanmalı.
2. **Lig listesi üç yerde tekrar ediyor:**
   - `src/rankit_sync.py` `FOOTBALL_LEAGUES`;
   - `api/rankit_live_sync.py` `FOTMOB_LEAGUES`;
   - `api/rankit.py` `FOTMOB_LEAGUE_IDS`.
   Yeni lig eklerken birini unutmak sessiz hata üretir (fikstür gelir, canlı skor gelmez). Tek bir kayıt dosyasına (`api/rankit_competitions.py`) toplanmalı.
3. **Veritabanı yalnız üç spora izin veriyor.** `rankit_competitions.sport` sütununda `CHECK(sport IN ('Basketball','Football','Olympics'))` var ve SQLite bu kısıtı değiştiremiyor. Yeni bir spor için tabloyu yeniden kuran bir göç gerekir (veri korunarak, testle).

---

## 2. Neler eklenebilir: uyum ve değer

RankIt'in veri modeli iki tarafın karşılaştığı tek maç üzerine kurulu:
- ev sahibi ve deplasman;
- skor;
- maçın oyuncusu (POTM) ve respect;
- kadro;
- yayıncı.

Bu modele uyan sporlar hızlı eklenir. Uymayanlar yeni bir "etkinlik" modeli ister.

| Aday | Modele uyum | TR/küresel değer | Not |
|---|---|---|---|
| **Süper Lig** (+ Türkiye Kupası) | ✅ Birebir (futbol) | **Çok yüksek**, ana pazar | Büyüme planının 1 numaralı boşluğu |
| Diğer futbol ligleri: Championship, Eredivisie, Liga Portugal, Suudi Pro Lig, MLS, Brasileirão, Libertadores | ✅ Birebir | Orta–yüksek; Güney Amerika dev pazar | Lig başına yarım gün |
| Milli takımlar: Uluslar Ligi, Dünya Kupası 2030 elemeleri, EURO 2028 elemeleri | ✅ | Yüksek (an değeri) | Kulüp yerine ülke |
| Kadın futbolu: WSL, Kadınlar Şampiyonlar Ligi | ✅ | Niş ama az hizmet alan bir kitle | |
| **EuroCup** | ✅ Birebir (basketbol) | Orta (TR takımları oynuyor) | Aynı EuroLeague API'si, yarışma kodu `U`; **en ucuz ekleme** |
| **Basketbol Süper Ligi (BSL)** | ✅ | **Yüksek** (TR) | EuroLeague API'sinde yok; ücretli sağlayıcı gerekir |
| Basketbol Şampiyonlar Ligi (FIBA), WNBA | ✅ | Orta | |
| **Voleybol:** Sultanlar Ligi, Efeler Ligi, CEV Şampiyonlar Ligi, VNL, milli takım | ✅ (set skoru: 3–1; skor gösterimi uyarlanır) | **TR'de çok yüksek** (kadın voleybolu) | Yeni spor: göç + arayüz uyarlaması |
| Hentbol, buz hokeyi (NHL), NFL, MLB | ✅ | Küresel orta; TR düşük | Yeni spor |
| **Tenis:** Grand Slam'ler, ATP/WTA 1000 | 🟡 Oyuncu ve oyuncu; "kulüp" yerine oyuncu, skor setler | Küresel yüksek | Bireysel spor uyarlaması |
| UFC / boks | 🟡 1'e 1, ama tek maç değil "kart" | Orta | Etkinlik modeli |
| **F1, MotoGP** | ❌ 20 sürücülük yarış; ev/deplasman yok | Küresel çok yüksek | Ayrı **"yarış" modeli** gerekir (yarışı puanla, günün sürücüsü = POTM). En pahalı uyarlama |

---

## 3. Veri nereden alınır

### 3.1 Üç yol

| Yol | Ne | Maliyet | Risk |
|---|---|---|---|
| **1. Bugünkü kaynakları genişletmek** | FotMob'a lig kimliği eklemek; EuroLeague API'sine EuroCup | ~0 | Kazıma, kullanım şartlarına aykırı. Lig arttıkça trafik ve görünürlük artar, engellenme ve şikâyet riski büyür; tek hata noktası |
| **2. Ucuz ticari API** | API-Sports ailesi: API-Football, API-Basketball, API-Volleyball… | Spor başına ~$19–39/ay | Düşük–orta. Veri lisanslı; **arma/logo marka hakkı dahil değil** |
| **3. Kaliteli futbol sağlayıcısı** | Sportmonks, ileride Sportradar | €29–249/ay | En düşük; daha iyi canlı veri ve destek |

### 3.2 Sağlayıcılar

| Sağlayıcı | Kapsam | Fiyat (teyit et) | RankIt için |
|---|---|---|---|
| **API-Sports** ([api-football.com](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)) | Futbol 1000+ lig; basketbol 400+ lig; voleybol, hentbol, hokey, NFL, MLB, tenis, F1, MMA dahil 35+ API | Ücretsiz katman 100 istek/gün. **Futbol:** Pro $19/ay (7.500 istek/gün), Ultra $29/ay (75.000/gün), Mega $39/ay (150.000/gün). **Basketbol ve voleybol (her biri):** Pro $15/ay (7.500/gün), orta plan $25/ay (75.000/gün). Fiyatlar sahibin api-sports.io'dan aktardığı (18 Ekim 2026) | **Önerilen ana yol:** tek satıcı, tek şema, düşük fiyat. BSL ve Sultanlar Ligi kapsamı satın almadan önce lig listesinden doğrulanmalı (aramada teyit edilemedi) |
| **Sportmonks** ([fiyatlar](https://www.sportmonks.com/football-api/plans-pricing)) | Futbol 2.300+ lig | Starter €29/ay (5 lig), Growth €99 (30 lig), Pro €249 (120 lig); ek lig €4/ay | Futbolda daha zengin veri; yalnız futbol |
| **football-data.org** ([karşılaştırma](https://www.thestatsapi.com/blog/football-data-org-free-tier-limits-2026)) | Ücretsiz 12 yarışma (Süper Lig yok); ücretli ~€12–199 | Ücretsiz katman | Yedek ya da çapraz doğrulama; Süper Lig yok |
| **EuroLeague API** (bugün kullanılıyor) | EuroLeague + EuroCup | Ücretsiz, resmi değil | EuroCup için hemen |
| **Jolpica** (Ergast'ın yerine) / OpenF1 ([kaynak](https://docsearch.algolia.com/mcp/docs/repo/jolpica/jolpica-f1)) | F1 sonuçları ve tarihçe / canlı telemetri | Ücretsiz katman **yalnız ticari olmayan** kullanım; ticari kullanım destekçi katmanıyla | F1'de API-Sports F1 ya da Jolpica destekçi katmanı |
| Tenis: api-tennis, Goalserve, Sportradar ([inceleme](https://sportsapis.dev/apis/live-tennis-api)) | ATP, WTA, Challenger | api-tennis ~$40/ay'dan; Goalserve $150/ay; Sportradar kurumsal | Tenis gelirse API-Sports tenis önce denenir |

**Not: veri lisansı ile marka hakkı ayrı şeyler.** Ücretli API skor ve fikstür verisini lisanslar. Kulüp armaları, lig logoları ve oyuncu fotoğrafları ise kulüplerin ve ligin markasıdır; API'nin logo bağlantısı vermesi kullanım hakkı vermez. Bu yüzden Paket E (arma yerine takım rengi + kısa ad rozeti) lisanslı veriye geçilse de geçerli kalır.

### 3.3 Karar (18 Ekim 2026): Türkiye lansman paketi

Sahibin kararı: lansman Türkiye'de güçlü bir kapsamla yapılacak. Voleybol ve Basketbol Süper Ligi **şimdilik SofaScore'dan** çekilecek (resmi olmayan uç, FotMob'la aynı risk sınıfı). Lisanslı sağlayıcıya geçiş lansman sonrasına kaldı.

| Eklenecek | Spor | Kaynak | Not |
|---|---|---|---|
| **Sultanlar Ligi** (kadın), **Efeler Ligi** (erkek) | Voleybol | SofaScore | "Türkiye ligi" |
| **Kupa Voley** (kadın + erkek), **Türkiye Süper Kupası** (kadın + erkek) | Voleybol | SofaScore | Ulusal kupalar |
| **CEV Şampiyonlar Ligi** (erkek + kadın) | Voleybol | SofaScore | |
| **Basketbol Süper Ligi** | Basketbol | SofaScore | |
| **Türkiye Kupası**, **Cumhurbaşkanlığı (Süper) Kupası** | Basketbol | SofaScore | Ulusal kupalar |
| **EuroCup** | Basketbol | EuroLeague API (kod `U`) | |
| **EFL Cup**, **Community Shield**, **Supercopa de España**, **Supercoppa Italiana**, **DFL-Supercup**, **Trophée des Champions** | Futbol | FotMob | Mevcut liglerin eksik ulusal kupaları (FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France zaten var) |
| **NBA eksikleri** | Basketbol | nba_api | Fikstür otomatik taramaya girer; aşama (NBA Cup, Play-In, playoff) yazılır |

**Açık soru:** futbolda Süper Lig + Türkiye Kupası (FotMob'da var, yarım gün) bu pakete girsin mi? Türkiye lansmanında en çok sorulacak lig bu.

**Güvenlik önlemleri** (kazınan kaynak için):
- **Ad doğrulaması:** her yarışmanın sağlayıcıdaki adı kayıtta tutulan beklentiyle karşılaştırılır. Kimlik yanlışsa yanlış lig içeri alınmaz, tur günlüğe hata olarak yazılır.
- **Kimlik çözümü:** SofaScore yarışma kimlikleri sabit yazılmadı. Ülke kategorisinden adla bulunur; tek aday yoksa hata verir. `SOFASCORE_TOURNAMENT_IDS` ortam değişkeniyle elle sabitlenebilir.
- **Bağımsızlık:** sağlayıcılar birbirinden bağımsız çalışır; SofaScore düşerse futbol ve EuroLeague etkilenmez.
- **Armalar:** SofaScore armaları kullanılmaz (Paket E: takım rengi + kısa ad).
- **Kadın takımları:** Fenerbahçe gibi hem erkek hem kadın takımı olan kulüpler karışmasın diye kadın yarışmalarındaki takımlar "(W)" ekiyle ayrı tutulur.

**Lansman sonrası:**
- voleybol ve BSL için lisanslı sağlayıcıya geçiş: API-Sports ([basketbol kapsamı](https://api-sports.io/sports/basketball)).
  - **Maliyet:** basketbol + voleybol Pro planla ayda $30 (2 × $15, günde 7.500 istek); futbol da eklenirse ayda $49.
  - **Canlı skor sıklığı:** 15 dakikalık turda günde 7.500 istek yeter; canlı maçlarda 45 saniyelik yoklamaya geçilirse orta plan gerekir (basketbol/voleybol $25, futbol $29).
  - Geçiş için tek iş sağlayıcı katmanını yazmak; yarışma kaydına yeni bir `provider` olarak girer.
- milli takım maçları;
- Güney Amerika ligleri;
- tenis;
- F1.

### 3.4 Teknik iş listesi

| İş | Durum |
|---|---|
| `api/rankit_competitions.py`: tek kayıt (yarışma, spor, sağlayıcı, kimlik, mod, ad beklentisi); üç tekrar listesi bundan türetilir | Bu turda |
| Veritabanı göçü: `rankit_competitions.sport` kısıtına `Volleyball` (tablo veri korunarak yeniden kurulur) | Bu turda |
| `src/rankit_sofascore.py`: kimlik çözümü, sezon seçimi, sayfalı fikstür, durum/skor/aşama eşleme, takım adı eşleme (EuroLeague'deki "Fenerbahçe Beko" ile BSL'deki aynı takım tek satır), istek sınırı ve geri çekilme | Bu turda |
| EuroCup (EuroLeague senkronunun kod parametresiyle) | Bu turda |
| Futbol kupaları (FotMob, ad doğrulamalı) | Bu turda |
| NBA: otomatik fikstür taraması, aşama | Bu turda |
| Canlı skor: SofaScore ve EuroCup maçları 15 dakikalık turda | Bu turda |
| Hunt / sezon kuralları: yeni ligler çift devreli lig sayılır, playoff hariç | Bu turda |
| Arayüz: voleybol filtresi, set skoru gösterimi, voleybol etiketleri, POTM metni, companion dakika yerine set | Sonraki tur |
| Yayıncı kuralları (TRT Spor, S Sport, beIN, Tivibu) | Sonraki tur |
| İlk canlı çalıştırma: `sync-health` ve `rankit_sync_runs` ile kimlik çözümünün doğrulanması | Deploy sonrası |

## 4. Mağaza çıkışını hızlandırma

### 4.1 Kritik yol neden uzun

Android için tek gerçek bekleme süresi Play'in **kişisel hesaplarda zorunlu kapalı testi**: en az 12 test kullanıcısı, 14 gün kesintisiz. 13 Kasım 2023'ten sonra açılan kişisel hesaplar bu şarta tabi, kuruluş hesapları muaf ([Google Play yardım](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB)).

Sayaç başlamadan geçen her gün yayını bir gün geciktirir. Kodda kapalı teste girmeye engel kalmadı: moderasyon (B) ve yasal bağlantılar (A) canlıda.

### 4.2 Hızlandırıcılar

1. **Kapalı testi bu hafta başlat, geri kalan her şeyi 14 günün içine sığdır.**
   - Kapalı test için kesinleşmiş hukuk metni, Sentry ya da iOS gerekmiyor. Gereken: hesap, AAB, gizlilik URL'si, temel formlar.
   - Paket C (Sentry, sağlık izleme, paylaşım, erişilebilirlik), Paket E, metinlerin hukuk kontrolü ve mağaza görselleri test sürerken yapılır.
2. **12 kişiyi şimdiden hazırla, 15–20 kişi topla.** Biri düşerse 14 gün baştan başlayabilir; yedek kişi bu riski alır. Test kullanıcılarından uygulamayı gerçekten açmalarını iste.
3. **Kuruluş hesabı yalnız şirket ve D-U-N-S hazırsa hızlandırır.** D-U-N-S almak günler ile haftalar sürebilir. Hazır değilse kişisel hesap + kapalı test daha hızlı.
4. **iOS'u paralel başlat. Hızlı seçenekleri seç:**
   - **Apple ile giriş yerine:** iOS'ta Google düğmesini gizle (yarım gün, 2–3 gün yerine). Kural 4.8 yalnız üçüncü taraf girişte "eşdeğer seçenek" istiyor; yalnız kendi hesap sistemin kalırsa kapsam dışı ([özet](https://vp0.com/blogs/apple-sign-in-required-rejection-fix-swiftui)).
   - **Derleme:** Mac yoksa GitHub Actions macOS + TestFlight. Repo herkese açıkken ücretsiz.
   - **Hesap:** Apple Developer kaydı bireyselde genelde 1–2 gün.
5. **Kapsamı dondur.** Lansmana kadar yeni spor ve push bildirimi yok. Lansman öncesi yalnız §3.3'teki ucuz işler, en fazla Süper Lig. Mağaza incelemesine giren her yeni özellik yeni bir red ihtimali demek.
6. **Mağaza malzemesini ben hazırlayayım.** Sen kontrol edip yapıştırırsın:
   - EN/TR mağaza metinleri;
   - ekran görüntüleri (Play telefon, Apple 6,9");
   - 1024×500 öne çıkan görsel;
   - Data safety ve Apple gizlilik etiketi cevapları;
   - inceleme notu (giriş akışı + moderasyon);
   - demo hesap içeriği.

### 4.3 Gerçekçi takvim (bugün 18 Ekim)

| Tarih | Android | iOS |
|---|---|---|
| 19–23 Eki | Hesap → AAB → internal test → **kapalı test başlar**. Backend: Türkiye paketi (voleybol, BSL, EuroCup, kupalar, NBA) | Apple hesabı; Mac/CI kararı |
| 23 Eki – 6 Kas (14 gün) | Kapalı test. Paralelde: voleybol arayüzü, yayıncılar, Paket C, Paket E, hukuk metinleri, mağaza görselleri. Test kullanıcıları Sultanlar Ligi ve BSL maçlarıyla dener | iOS projesi, Google'ı gizleme, geri/kapat denetimi → TestFlight internal |
| 7–12 Kas | Production erişim başvurusu → kademeli yayın | TestFlight external |
| ~13–20 Kas | **Android yayında** | App Store başvurusu (inceleme genelde 24–48 saat; red payı 1 hafta) |
| ~20–30 Kas | | **iOS yayında** |

Kapalı test 23 Ekim'e kadar başlamazsa Android tarihi gün gün kayar. Hedef an: Aralık başında Süper Lig ve Şampiyonlar Ligi yoğunluğu, sonra NBA Noel maçları.

---

## 5. Senin yapman gerekenler (öncelik sırasıyla)

**Bu hafta (kritik yol):**
- [ ] **Google Play Console** hesabı ($25). Bireysel ya da kuruluş: kuruluşu yalnız D-U-N-S hazırsa seç.
- [ ] **Release anahtarı:** üret ve iki yere yedekle (`frontend/src/rankit/product/mobile.md` → Release signing).
- [ ] **AAB'yi derle:** `npm run android:sync:store`, sonra `gradlew.bat bundleRelease`. Play'e internal test olarak yükle.
- [ ] **Kapalı test için asgari formlar:**
  - gizlilik URL'si: `https://primaryarch.net/privacy-policy`
  - hesap silme URL'si: `https://primaryarch.net/account/delete`
  - App access: demo hesap + not
  - Ads: No
  - content rating
  - target audience: 13+
  - Data safety
  Cevapları ben yazarım.
- [ ] **15–20 kişilik test grubu:** e-posta listesi ya da Google Grubu. Kapalı testi başlat.
- [ ] **Apple Developer** hesabı ($99/yıl).
- [ ] **Kararlar:** aşağıdaki tablo.

**Kapalı test sürerken (23 Eki – 6 Kas):**
- [ ] Gizlilik politikası ve şartlardaki `[PLACEHOLDER]` bölümleri; hukukçu kontrolü (Community Guidelines dahil). Onay gelince taslak bandını ve `noindex`'i kaldırırım.
- [ ] Railway değişkenleri:
  - `ADMIN_ALERT_EMAIL`;
  - Cloudinary anahtarları;
  - lisanslı yol seçilirse `API_SPORTS_KEY`.
- [ ] Test kullanıcılarından geri bildirim topla; `/admin/reports` sayfasına her gün bak.
- [ ] Mağaza görsellerini ve metinlerini onayla (ben üretirim).
- [ ] KVKK aydınlatma metni; "RankIt" adının marka müsaitliği kontrolü.

**Yayın haftası:**
- [ ] Production başvurusu (Play), App Store başvurusu.
- [ ] Lansman duyurusu, ilk hafta mağaza yorumlarına her gün yanıt.
- [ ] Yeni sürüm yayılınca Railway'e `MOBILE_PKCE_REQUIRED=1`.

### Karar bekleyenler

| # | Karar | Önerim |
|---|---|---|
| 1 | Veri yolu | ✅ **Karar verildi:** lansmanda SofaScore (voleybol, BSL, Türk kupaları) + FotMob + EuroLeague API; lisanslı sağlayıcıya geçiş lansman sonrası |
| 2 | Futbolda Süper Lig + Türkiye Kupası lansmana girsin mi? | Evet; FotMob'dan yarım gün. **Senin onayını bekliyor** |
| 3 | Arma ve fotoğraflar (Paket E) | Lansmanda rozet; marka izni olmadan logo yok |
| 4 | Hesap tipi | D-U-N-S hazır değilse bireysel |
| 5 | iOS girişi | iOS'ta Google'ı gizle, Apple ile giriş v1.1'de |
| 6 | iOS derleme | Mac yoksa GitHub Actions macOS + TestFlight |
| 7 | Sporların sırası | ✅ Voleybol ve BSL lansmanda; sonra milli takımlar → Güney Amerika → tenis → F1 |

---

## 6. Benim tarafımda sıradakiler

1. **Başladı (18 Ekim):** tek lig kaydı, voleybol şema göçü, SofaScore sağlayıcısı (voleybol + BSL + Türk kupaları), EuroCup, futbol kupaları, NBA otomatik fikstür. Ardından voleybol arayüzü.
2. **Kapalı test sırasında:**
   - Paket C: Sentry, sync sağlığı, paylaşım, erişilebilirlik;
   - sağlayıcı katmanı + Süper Lig (karar 1–2'ye göre);
   - Paket E;
   - mağaza metinleri, görselleri, form cevapları.
3. **Paralelde:** Paket D (iOS projesi, Google gizleme, geri/kapat denetimi, güvenli token deposu).
