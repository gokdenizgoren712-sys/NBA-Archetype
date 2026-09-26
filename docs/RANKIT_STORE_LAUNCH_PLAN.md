# RankIt by Primary Arch — App Store ve Google Play Lansman Planı

**Belge tarihi:** 26 Eylül 2026
**Kapsam:** RankIt mobil uygulamasının Google Play ve Apple App Store'a çıkışı: hazırlık değerlendirmesi, eksikler, mağaza şartları, takvim, lansman süreci
**Dayanak:** repo incelemesi (`main` @ `bc063f3`); ayrıntılar için `docs/RANKIT_STATUS_AND_ROADMAP.md` (26 Ağustos) ve `frontend/src/rankit/product/mobile.md`

> Mağaza kuralları sık değişir. Aşağıdaki şartlar 2026 ortası itibarıyla bilinenlerdir; "⚠︎ teyit" işaretli maddeleri başvuru anında Play Console / App Store Connect'te kontrol et.

---

## 1. Kısa değerlendirme

| Alan | Durum | Not |
|---|---|---|
| Ürün çekirdeği (maç kataloğu, puanlama, günlük, liste, sosyal, Hunt, oyunlar) | 🟢 Güçlü | Alfa gerçek veriyle çalışıyor; 5 büyük lig + kupalar + Şampiyonlar/Avrupa Ligi + NBA |
| Güvenlik ve hesap | 🟢 Hazır | 26 Eylül'de sertleştirildi: hesap silme (uygulama + web), PKCE giriş, yedek kapalı, CI |
| Android teknik hazırlık | 🟡 Yakın | targetSdk 36 ✓, release imzası kodda hazır; anahtar + AAB + birkaç politika düzeltmesi kaldı |
| Mağaza politikası uyumu | 🔴 Eksik | **Kullanıcı içeriği moderasyonu yok** (şikâyet/engelleme), uygulama içi yasal bağlantılar bozuk, uygulama içi "Update" bağlantısı |
| iOS | 🔴 Başlanmadı | iOS projesi yok; Mac ya da bulut Mac, Apple hesabı ve Apple girişi kararı gerekli |
| Hukuk ve içerik lisansı | 🔴 En büyük risk | Maç verisi FotMob'dan kazınıyor; arma/oyuncu fotoğrafları FotMob ve NBA sunucularından çekiliyor; gizlilik/şartlar metninde yer tutucular var |
| Operasyon (izleme, yedek, ölçek) | 🟡 Kısmi | Hata/çökme izleme yok; DB yedeği tanımsız; tek sunucu + SQLite (lansman ölçeği için muhtemelen yeterli, izlenmeli) |

**Sonuç:** Android için yaklaşık **1,5–2 haftalık iş**, ardından Play'in **14 günlük zorunlu kapalı testi** gerekiyor. Gerçekçi en erken Play yayını **Ekim sonu – Kasım başı**. iOS için ek **3–4 hafta**: proje kurulumu, Mac/CI, Apple girişi, iOS'a özgü testler ve Apple incelemesi. Gerçekçi hedef **Kasım ortası–sonu**.

Takvimi en çok **moderasyon özelliği**, **hukuk/lisans kararı** ve **Play'in 14 günlük testi** belirliyor.

---

## 2. Bulunan eksikler

### 2.1 Engelleyiciler (her iki mağaza — bunlar olmadan başvuru reddedilir)

| # | Eksik | Neden engel | İş | Efor |
|---|---|---|---|---|
| **E1** | **Kullanıcı içeriği moderasyonu yok.** İnceleme, yorum, liste ve watchalong sohbeti var; şikâyet etme, engelleme ve moderasyon kuyruğu yok (`api/rankit.py`'de ilgili uç yok). | Apple 1.2 ve Play UGC politikası dördünü istiyor: içerik şikâyeti, kullanıcı engelleme, zararlı içerik filtresi, kullanım şartlarında "sıfır tolerans" maddesi + şikâyetlere 24 saatte yanıt taahhüdü. | Şikâyet uçları (inceleme/yorum/profil/sohbet mesajı) + uygulamada "Report" menüsü; "Block user" (içeriği gizler, etkileşimi keser); admin moderasyon kuyruğu (gizle/sil/banla); basit küfür/bağlantı filtresi; şartlara UGC maddesi + kayıtta onay | 4–6 gün |
| **E2** | **Uygulama içindeki yasal bağlantılar çalışmıyor.** Ayarlar'daki Privacy/Terms düz `href="/privacy-policy"`. Paketlenmiş uygulamada bu, politikayı açmak yerine uygulamayı yeniden yükler. | İnceleyiciler gizlilik politikasına mutlaka tıklar; ulaşılamayan politika doğrudan red sebebi. | `Browser.open("https://primaryarch.net/privacy-policy")`; aynı yere Terms, Contact/Support ve Delete account | 0,5 gün |
| **E3** | **"Update RankIt" bağlantısı** APK indirme sayfasına gidiyor. | Play: uygulama kendini Play dışından güncelleyemez / çalıştırılabilir kod indiremez (Device and Network Abuse). Apple da kabul etmez. | Mağaza derlemesinde bu satırı gizleyen bir derleme bayrağı; APK kanalı için korunur | 0,5 gün |
| **E4** | **Yasal metinler bitmemiş.** Privacy'de yaş sınırı ve GDPR/KVKK dili, Terms'te garanti ve "ücretsiz/bahis yok" maddeleri hâlâ `[PLACEHOLDER]`; RankIt'e özgü UGC şartları ve KVKK aydınlatma metni yok. | İki mağaza da eksiksiz gizlilik politikası istiyor; Apple 1.2 UGC şartlarının kabul edilmesini istiyor. | Metinleri tamamla (hukukçu kontrolü önerilir), kayıtta "şartları kabul ediyorum" | Sahip + 1 gün |
| **E5** | **İçerik ve veri lisansı** (§6'ya bak). | Marka/telif şikâyetinde mağazalar uygulamayı kaldırır; görseller başkasının sunucusundan çekildiği için o sunucu erişimi keserse uygulamada kırık görseller çıkar. | Karar: lisanslı veri sağlayıcı ya da riskleri azaltan ara çözüm | Karar + 1–5 gün |

### 2.2 Platforma özgü engelleyiciler

| # | Platform | Eksik | İş | Efor |
|---|---|---|---|---|
| **A1** | Play | Release anahtarı ve AAB | Anahtarı üret (`mobile.md` → Release signing), `bundleRelease`, Play App Signing'e kaydol | 0,5 gün |
| **A2** | Play | Kişisel geliştirici hesabı için **12+ test kullanıcısı × 14 gün kesintisiz kapalı test** (2023 sonrası açılan kişisel hesaplar) ⚠︎ teyit | Test grubunu şimdiden topla (Primary Arch kitlesi, X takipçileri) | 14 gün takvim |
| **I1** | iOS | **iOS projesi yok** (`frontend/ios` yok) | `@capacitor/ios` + `npx cap add ios`, bundle id, ikonlar, Info.plist (URL şeması `rankit://`, şifreleme beyanı) | 1–2 gün |
| **I2** | iOS | **Mac gerekiyor** (Xcode). Sen Windows kullanıyorsun. | Seçenekler: Mac mini satın al / ödünç al, **ya da** bulut Mac CI (GitHub Actions macOS runner — repo public olduğu sürece ücretsiz; Codemagic ücretsiz katman) + fastlane ile imzalama | Karar + 1–2 gün kurulum |
| **I3** | iOS | **Sign in with Apple** (Apple 4.8): uygulama Google ile girişe izin veriyorsa, gizlilik odaklı eşdeğer bir seçenek (Apple ile giriş) da sunmalı | (a) Apple ile girişi ekle: backend'de Apple token doğrulama, web'de Services ID. **Ya da** (b) iOS'tan açılan giriş sayfasında Google düğmesini gizle; yalnız Primary Arch e-posta/şifre kalır, istisna kapsamına girer | (a) 2–3 gün / (b) 0,5 gün |
| **I4** | iOS | `index.html`'de `viewport-fit=cover` yok. CSS'teki 27 `safe-area-inset` değeri iOS'ta 0 döner; içerik çentik / Dynamic Island altına kayar. | Meta etiketi + gerçek cihazda kontrol | 0,5 gün |
| **I5** | iOS | **Donanım geri tuşu yok.** 16 dosya Android geri tuşuna bağlı. | Her yüzeyin görünür geri/kapat düğmesi olduğunu ve kaydırarak geri gitmenin bir şey bozmadığını doğrula | 1–2 gün QA |

### 2.3 Lansmandan önce yapılması gerekenler (reddedilmezsin ama lansmanda canını yakar)

| # | Eksik | Öneri | Efor |
|---|---|---|---|
| Ö1 | **Hata/çökme izleme yok** | Sentry (ücretsiz katman): Capacitor/JS + FastAPI. Data safety / privacy etiketlerinde "crash logs" beyanı | 1 gün |
| Ö2 | **DB yedeği tanımsız** | Railway volume yedekleri (günlük) + bir kez geri yükleme denemesi | 0,5 gün |
| Ö3 | **Canlılık ve senkron izleme** | UptimeRobot vb. ile `/api/health` izleme; maç senkronu başarısızlığında uyarı (yol haritası 4.2) | 0,5–1 gün |
| Ö4 | **Ölçek** | Tek worker + SQLite + bellek içi watchalong. Lansman günü için Railway kaynaklarını artır, basit yük testi yap. Mobil operatörlerin ortak IP'si (CGNAT) yüzünden 429 artışını izle | 1 gün |
| Ö5 | **Token saklama** | Android'de yedek artık kapalı (risk düştü). iOS'ta WKWebView verisi iCloud yedeğine girebilir → Keychain destekli güvenli depolama eklentisine taşı | 1 gün |
| Ö6 | **Erişilebilirlik backlog'u** (`mobile.md`) | Sheet'ler diyalog değil (odak tuzağı yok), filtre çipleri 38px (48dp altında) | 1–2 gün |
| Ö7 | **Gerçek cihaz testleri** (yol haritası P3) | Soğuk açılış, derin bağlantı, uçak modu, zaman aşımı, süreç yeniden oluşturma; en az 1 düşük seviye Android + 1 iPhone | 1–2 gün |
| Ö8 | **Paylaşım** | Oyun sonucu paylaşımı Android WebView'da yalnız kopyalıyor → `@capacitor/share` | 0,5 gün |
| Ö9 | **PKCE zorunluluğu** | Yeni sürüm yayılınca Railway'de `MOBILE_PKCE_REQUIRED=1` | 5 dk |

### 2.4 Sonraya kalabilir

- **Push bildirimleri** ("maçın bitti, puanla"): tutunmaya en büyük katkı, ama Firebase/APNs + ek gizlilik beyanı gerektirir. v1.1 önerilir.
- **Uygulama içi değerlendirme istemi**: iyi bir andan sonra, ör. 3. maçı puanlayınca.
- **Türkçe arayüz**: şu an İngilizce; mağaza sayfası TR+EN olabilir.
- **Tablet düzeni**: gerekli değil; iPad'de iPhone uygulaması olarak açılır.
- **Doğrulanmış App Link / Universal Link**: PKCE sayesinde acil değil.

---

## 3. Google Play — gereksinimler ve adımlar

**Hesap:** Play Console, tek seferlik $25, kimlik doğrulaması. Kişisel ya da kuruluş hesabı seçilir (§8 karar 1). Kuruluş için D-U-N-S numarası gerekir; kuruluş hesapları 14 günlük test şartından muaf. ⚠︎ teyit

**Teknik:** AAB (`bundleRelease`), Play App Signing, targetSdk 36 ✓ (güncel şartı karşılıyor ⚠︎ teyit), sürüm kodu artışı.

**Politika formları (Play Console → App content):**

| Form | RankIt için önerilen cevap |
|---|---|
| Privacy policy | `https://primaryarch.net/privacy-policy` (E4 tamamlanınca) |
| App access | "Some functionality is restricted" → inceleme için demo hesap + nasıl giriş yapılır notu (giriş sitede biter, uygulamaya döner) |
| Ads | No |
| Content rating (IARC) | Kullanıcılar etkileşebiliyor (yorum, sohbet) → muhtemelen **Teen / 12+** |
| Target audience | 13+ (çocuklara yönelik değil; UGC var). 13 altı seçilirse Families politikası devreye girer, önerilmez |
| Data safety | Toplanan: e-posta, kullanıcı adı/kimlik, kullanıcı içeriği (puan, inceleme, yorum, liste, sohbet), uygulama etkinliği. **Paylaşılmıyor.** İletimde şifreli: evet. Silme: uygulama içi + `https://primaryarch.net/account/delete`. Sentry eklenirse: çökme kayıtları ve teşhis |
| Account deletion | `https://primaryarch.net/account/delete` ✓ (hazır) |
| News / Government / Financial / Health | Hayır |

**Mağaza sayfası:** başlık ≤30 karakter ("RankIt by Primary Arch" = 22 ✓), kısa açıklama ≤80, uzun açıklama ≤4000, ikon 512×512, **öne çıkan görsel 1024×500 (zorunlu)**, 2–8 telefon ekran görüntüsü, kategori Sports, iletişim e-postası.

**Yayın akışı:**
1. **Internal testing:** en fazla 100 kişi, anında. Ekip içi duman testi.
2. **Closed testing:** 12+ test kullanıcısı, 14 gün kesintisiz (kişisel hesap şartı ⚠︎ teyit). Geri bildirim topla.
3. **Production erişim başvurusu:** test özetini doldur, Google birkaç gün inceler.
4. **Kademeli yayın:** %10 → %25 → %50 → %100, yaklaşık bir hafta. Çökme artışında durdur.

**Play kalite eşikleri** (bunları aşan uygulama görünürlük kaybeder ⚠︎ teyit): kullanıcı algılı çökme oranı ~%1,09, ANR ~%0,47.

**Not:** Google 2025'te, sertifikalı Android cihazlarda Play dışından yüklenen uygulamalar için de geliştirici doğrulaması zorunluluğu duyurdu (2026'da bazı ülkeler, 2027'de genel). Bugünkü APK kanalın (`/admin/rankit-builds`) bu yüzden ileride doğrulanmış bir hesaba bağlanmak zorunda kalacak. ⚠︎ teyit

---

## 4. Apple App Store — gereksinimler ve adımlar

**Hesap:** Apple Developer Program, yıllık $99; bireysel ya da kuruluş (kuruluş için D-U-N-S). Ücretsiz uygulama için banka/vergi bilgisi gerekmez; "Free Apps" sözleşmesi yeterli.

**Teknik:** iOS projesi (I1), Xcode ile güncel iOS SDK'sı (Apple her Nisan en yeni SDK'yı zorunlu kılar ⚠︎ teyit), imzalama sertifikası + provisioning, privacy manifest (Capacitor çekirdeğinde var; eklenen eklentilerde kontrol et), `ITSAppUsesNonExemptEncryption = NO` (yalnız HTTPS).

**İncelemede özellikle bakılacaklar:**

| Kural | RankIt durumu |
|---|---|
| 1.2 Kullanıcı içeriği: şikâyet, engelleme, filtre, iletişim bilgisi | ❌ → E1 |
| 2.1 Uygulama tamlığı: yer tutucu içerik, kırık bağlantı, demo veri yok | ❌ E2 (yasal bağlantılar) |
| 4.2 Asgari işlev: "web sitesi paketi" olmamalı | 🟢 Yerel geri/haptik, misafir modu, oyunlar, çevrimdışı puan kuyruğu; iOS'ta cilalamak gerekir (I4, I5) |
| 4.8 Giriş servisleri | ❌ → I3 |
| 5.1.1(v) Hesap açılabiliyorsa uygulama içinden silme | ✅ (26 Eylül) |
| 5.1.1 Zorunlu olmayan özellikler için giriş zorlanmamalı | ✅ Misafir modu var |
| 5.2 Fikri mülkiyet (üçüncü taraf logo, fotoğraf, veri) | ⚠️ → §6 |
| 5.1.2 Takip / ATT | ✅ Takip yok (analitik eklenirse yeniden değerlendir) |

**App Store Connect:**
- **Privacy etiketleri:** "Data Linked to You": iletişim bilgisi (e-posta), kullanıcı içeriği, tanımlayıcılar (kullanıcı kimliği). "Tracking": yok.
- **Yaş derecelendirmesi:** Apple'ın 2025'teki yeni sistemi (4+/9+/13+/16+/18+). UGC ve sohbet var; muhtemelen 13+ ⚠︎ teyit.
- **AB DSA "trader" beyanı:** AB'de dağıtım için gerekli. Trader'sen adres, telefon ve e-posta AB mağazasında görünür. Ticari değilsen "non-trader".
- **Destek URL'si (zorunlu):** `https://primaryarch.net/contact`; gizlilik URL'si.
- **İnceleme notları:** demo hesap, giriş akışının açıklaması (Safari görünümünde giriş → uygulamaya dönüş), moderasyonun nasıl çalıştığı.

**Mağaza sayfası:** ad ≤30, altyazı ≤30, anahtar kelimeler ≤100 karakter, açıklama. **6,9" iPhone ekran görüntüleri** zorunlu (1320×2868 ya da 1290×2796); iPad ekran görüntüsü yalnız iPad desteklenirse. İkon 1024×1024 (asset catalog).

**Yayın akışı:**
1. **TestFlight internal:** 100 kişi, incelemesiz.
2. **TestFlight external:** 10.000'e kadar kişi, hafif beta incelemesi.
3. **App Store incelemesi:** çoğu 24–48 saat. İlk başvuruda bir red ihtimaline karşı 1 hafta pay bırak.
4. **Aşamalı yayın:** 7 gün.

---

## 5. Önerilen takvim

Android önce, iOS arkasından. Hedef: NBA sezon açılışı (Ekim sonu) civarında Android'de olmak, iOS'u Kasım'da tamamlamak.

| Hafta | Tarih | Android | iOS | Sahip (sen) |
|---|---|---|---|---|
| 0 | 28 Eyl – 4 Eki | E1 moderasyon, E2, E3, Ö1 Sentry, Ö2 yedek | — | Play + Apple hesaplarını aç (doğrulama günler sürebilir); §8 kararları; E4 metinler; test grubunu topla |
| 1 | 5 – 11 Eki | A1 imza + AAB → **internal test**; mağaza sayfası taslağı; formlar → **closed test başlar (14 gün sayacı)** | I1 proje, I2 Mac/CI kararı ve kurulumu | Anahtarı üret ve yedekle; ekran görüntüleri ve görsel metinler |
| 2 | 12 – 18 Eki | Closed test (geri bildirim düzeltmeleri) | I3 Apple girişi, I4, I5, Ö5 → **TestFlight internal** | Gizlilik etiketleri, yaş derecelendirmesi, DSA |
| 3 | 19 – 25 Eki | 14 gün dolar → **production başvurusu** → kademeli yayın | TestFlight external (beta) | Lansman duyuruları hazır |
| 4 | 26 Eki – 1 Kas | **Android genel yayın** (%100) | App Store başvurusu | Lansman |
| 5–6 | 2 – 15 Kas | İzleme, 1. güncelleme | İnceleme, olası red düzeltmesi → **iOS yayını** | iOS lansmanı |

Kritik yol: **E1 (moderasyon) → closed test başlangıcı → 14 gün**. Moderasyon Hafta 1'e kayarsa Android yayını da bir hafta kayar.

---

## 6. Hukuk ve içerik lisansı — en büyük risk

**Durum:**
- **Maç verisi:** Futbol FotMob'dan tarayıcı taklidiyle (`impersonate="chrome124"`) çekiliyor. NBA verisi resmi olmayan `stats.nba.com`'dan, EuroLeague resmi olmayan API'den geliyor.
- **Görseller:**
  - kulüp armaları ve oyuncu fotoğrafları `images.fotmob.com`'dan doğrudan gösteriliyor;
  - NBA takım logoları ve oyun modülündeki oyuncu fotoğrafları `cdn.nba.com`'dan geliyor.
- **Markalar:** NBA, kulüp adları ve armaları, oyuncu adları ve yüzleri.

**Riskler:**
- Hak sahibi mağazaya şikâyet ederse uygulama kaldırılabilir (Apple 5.2, Play IP politikası).
- FotMob veya NBA, sunucularından doğrudan gösterimi ya da veri çekmeyi keserse uygulamada boş görseller ve eksik maçlar çıkar. Bu, teknik olarak da bir tek hata noktası.
- Ticari kullanım (reklam, abonelik) başlarsa risk büyür.

**Seçenekler:**

| Seçenek | Açıklama | Maliyet | Risk |
|---|---|---|---|
| A. Lisanslı veri sağlayıcı | Maç, kadro, logo ve fotoğrafları lisanslı bir API'den al (API-Football, Sportmonks, SportsDataIO gibi); görselleri kendi CDN'inde (Cloudinary) barındır | Aylık onlarca–yüzlerce $ (kapsama göre) | En düşük |
| B. Ara çözüm | Veri kaynağı aynı kalır; armalar/fotoğraflar yerine renkli baş harf rozetleri (NBA logosu ve oyuncu yüzü yok); mağaza görsellerinde ve metinlerinde "NBA" ve kulüp markası kullanılmaz; "resmi değildir" ibaresi | Birkaç gün geliştirme | Orta |
| C. Olduğu gibi | Birçok küçük uygulama böyle yayında, ama şikâyet ve kaynak kesintisi riski tamamen sende | 0 | Yüksek |

**Önerim:** Lansman için **B**, gelir modeli netleşince **A**. Hangisini seçersen seç, mağaza sayfasında "Primary Arch; NBA, lig ve kulüplerle bağlantılı değildir" ibaresi olmalı.

**Diğer hukuk konuları:**
- **KVKK:** aydınlatma metni. VERBİS kaydı bazı eşiklerin altında muaf; teyit et. AB kullanıcısı varsa GDPR ifadeleri.
- **İsim:** "RankIt" adının marka müsaitliği (TÜRKPATENT/EUIPO, sınıf 9/41/42) ve mağazalarda aynı adlı uygulama kontrolü.
- **Yaş:** 13 altına yönelik değil; kayıtta yaş beyanı ya da şartlarda açık madde.

---

## 7. Lansman süreci

### 7.1 Lansman öncesi (Hafta 0–3)
- **Bekleme listesi:** `primaryarch.net/rankit`'e "Yakında Google Play / App Store" + e-posta ile haber al.
- **Beta topluluğu:** Play kapalı testinin 12+ kişisi aynı zamanda ilk yorumcular ve ilk içerik üreticileri. Primary Arch ziyaretçileri ve @primary_arch takipçilerinden seç.
- **Mağaza varlıkları:** ekran görüntüsü setleri, EN+TR açıklamalar, öne çıkan görsel, kısa tanıtım videosu (isteğe bağlı), basın kiti (logo, 3 ekran görüntüsü, tek paragraflık hikâye).
- **İçerik takvimi:** lansman haftası için "haftanın en yüksek puanlı maçları" gibi paylaşılabilir içerik (uygulamanın kendi verisinden).

### 7.2 Lansman günü
- Önceki gün **deploy dondurma**; Railway kaynaklarını artır; Sentry ve uptime panoları açık.
- Destek kutusu (`info@primaryarch.net`) ve moderasyon kuyruğu için nöbet: UGC şikâyetlerine 24 saatte dönüş taahhüdü var.
- Duyurular: X, site ana sayfası, beta topluluğu. Uygun bir zamanlama: büyük bir futbol hafta sonu ya da NBA açılış haftası.
- Mağaza yorumlarına ilk hafta her gün yanıt.

### 7.3 Lansman sonrası (ilk 2–4 hafta)
- **Kalite:** çökmesiz oturum ≥ %99,5; Play ANR/çökme eşiklerinin altında kal.
- **Ürün metrikleri** (analitik kararına bağlı): D1/D7 tutunma, kullanıcı başına puanlanan maç, ilk puana kadar geçen süre, inceleme ve yorum oranı.
- **Sürüm ritmi:** 2 haftada bir güncelleme. Her sürümde CI yeşil + kademeli yayın.
- **v1.1 adayları:** push bildirimleri, uygulama içi değerlendirme istemi, TR arayüz, `MOBILE_PKCE_REQUIRED=1`.
- **APK kanalı:** Play yayınından sonra yalnız beta için mi kalsın, kapansın mı? (§8 karar 10)

---

## 8. Senin vermen gereken kararlar

| # | Karar | Seçenekler | Önerim |
|---|---|---|---|
| 1 | Geliştirici hesabı tipi (Play + Apple) | Bireysel (adın görünür; Play'de 14 gün testi) / Kuruluş (şirket gerekir, D-U-N-S; test şartı yok) | Şirket varsa kuruluş |
| 2 | İçerik/veri lisansı | A / B / C (§6) | Lansmanda B, sonra A |
| 3 | iOS derleme yolu | Mac satın al / ödünç al / bulut Mac CI | Günlük iOS testi için Mac mini; değilse GitHub Actions macOS + TestFlight |
| 4 | Apple girişi | Ekle (2–3 gün) / iOS'ta Google'ı gizle (0,5 gün) | Hızlı çıkış için gizle, v1.1'de ekle |
| 5 | Çökme izleme | Sentry / Firebase Crashlytics / yok | Sentry (web + backend tek yerde) |
| 6 | Analitik | Yok / gizlilik dostu (Plausible, PostHog self-host) | Başta yok ya da gizlilik dostu, etiketlere yansıt |
| 7 | Push bildirimleri v1'de mi? | Evet / v1.1 | v1.1 |
| 8 | Pazarlar ve dil | Dünya geneli EN / TR öncelikli / ikisi | Dünya geneli, mağaza sayfası EN+TR |
| 9 | Hedef yaş / derecelendirme | 13+ / 16+ / 18+ | 13+ (UGC moderasyonu hazır olunca) |
| 10 | APK kanalı Play'den sonra | Kapat / beta kanalı olarak kalsın | Beta kanalı (Google doğrulama şartı gelince yeniden değerlendir) |
| 11 | Hedef tarih | NBA açılışı (Ekim sonu) / Kasım | Android Ekim sonu, iOS Kasım |

---

## 9. Tahmini maliyet

| Kalem | Tutar |
|---|---|
| Google Play geliştirici hesabı | $25 (tek sefer) |
| Apple Developer Program | $99 / yıl |
| Mac (opsiyonel) | Mac mini ~$600+ ya da bulut CI (ücretsiz katmanlar mevcut) |
| Sentry / uptime izleme | Ücretsiz katman yeterli |
| Lisanslı veri (seçenek A) | Aylık onlarca–yüzlerce $ |
| Hukuk kontrolü (metinler, KVKK, isim) | Değişken |
| Railway kaynak artışı (lansman) | Kullanıma göre |

---

## 10. Yapılacaklar — tek liste

**Kod (ben yapabilirim):**
- [ ] E1 moderasyon: şikâyet, engelleme, filtre, admin kuyruğu, şartlara UGC maddesi + kayıtta onay
- [ ] E2 uygulama içi yasal bağlantılar + Support/Contact
- [ ] E3 mağaza derlemesinde "Update RankIt"i gizle
- [ ] Ö1 Sentry (web/Capacitor + FastAPI) + gizlilik beyanı metni
- [ ] Ö3 uptime + senkron uyarıları
- [ ] Ö5 token'ı güvenli depolamaya taşı
- [ ] Ö6 erişilebilirlik backlog'u
- [ ] Ö8 `@capacitor/share`
- [ ] I1 iOS projesi, I4 `viewport-fit=cover`, I5 iOS geri/kapat denetimi
- [ ] I3 Apple girişi ya da iOS'ta Google gizleme
- [ ] §6-B arma/fotoğraf yerine rozetler (seçilirse)

**Sen:**
- [ ] Play Console + Apple Developer hesapları (tip kararıyla)
- [ ] §8 kararları
- [ ] Yasal metinler (hukukçu), isim/marka kontrolü
- [ ] Release anahtarı üret + yedekle; Mac/CI erişimi
- [ ] 12+ kişilik test grubu
- [ ] Mağaza varlıkları (ekran görüntüleri ben de üretebilirim), metinler
- [ ] Formlar: Data safety, content rating, privacy etiketleri, yaş, DSA
- [ ] Lansman iletişimi
