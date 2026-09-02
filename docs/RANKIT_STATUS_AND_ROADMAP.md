# RankIt by Primary Arch — Güncel Durum, Eksikler ve Yayın Yol Haritası

**Belge tarihi:** 26 Ağustos 2026  
**Ürün aşaması:** Çalışan alpha / production hazırlığı  
**Öncelikli platform:** Android mobil uygulama  
**Ana marka:** Primary Arch  
**Ürün adı:** RankIt by Primary Arch

## 1. Belgenin amacı

Bu belge RankIt'in güncel teknik ve ürün durumunu, tamamlanan işleri, gerçek eksikleri ve APK'nın genel kullanıcıya açılmasından önce izlenecek sırayı tek kaynak altında toplar.

Önemli düzeltme: RankIt'in maç verisi temeli eksik değildir. Yerel katalogda NBA ile Avrupa'nın beş büyük futbol ligine ait geçmiş sonuçlar ve güncel fikstürler bulunmaktadır. Kalan problem, bu katalogun production ortamında otomatik, güncel ve gözlemlenebilir biçimde çalıştırılmasıdır.

## 2. Ürün amacı

RankIt; futbol ve basketbol maçlarını puanlama, yorumlama, günlükte saklama, listeler oluşturma ve arkadaş etkinliklerini takip etme odaklı sosyal bir spor günlüğüdür. Ürün, Letterboxd'ın koleksiyon ve topluluk hissini spor karşılaşmalarına uyarlarken SofaScore veya FotMob gibi yoğun istatistik odaklı bir uygulama olmayı hedeflemez.

Temel ürün ilkeleri:

- Genel spor izleyicisine anlaşılır ve sade bir deneyim sunmak.
- Kullanıcı etkileşimini, kişisel kütüphaneyi ve maç hatıralarını öne çıkarmak.
- Primary Arch'ın kart, aura, 12-gen ve renk sistemini korumak.
- Maç tarihi, skor, turnuva ve yayıncı gibi temel bilgileri kolay erişilebilir tutmak.
- Basketbol ve futbolu aynı sosyal ürün çatısında, spor ve turnuva filtreleriyle sunmak.

## 3. Tamamlanan temel yapı

### 3.1 Mobil tasarım ve navigasyon

- Mobil öncelikli RankIt arayüzü hazırlandı.
- Ana sayfada yatay kaydırılan hero maç kartları oluşturuldu.
- Kartlarda sağ üst ve sol alt kesik köşe dili uygulandı.
- Basketbol skorları çizgi yerine alt alta gösterilecek şekilde düzenlendi.
- Beş ana alan kurgulandı: Home, Discover, Activity, Lists ve Profile.
- Activity içerisinde Friends Activity ve Diary ayrımı planlandı.
- Alt navigasyon üzerinde tek elle erişilebilen, sağ altta yuvarlak başlayan ve dokunulduğunda genişleyen global arama yüzeyi hazırlandı.
- Discover içerisindeki tekrarlı arama alanı kaldırıldı.
- Hide Scores kontrolü ana sayfadan erişilebilir hâle getirildi.
- Spor filtresi Basketball / Football / All mantığıyla tasarlandı.

### 3.2 Maç kartı ve detay deneyimi

- Tek ve koleksiyon kartı karakterindeki maç kartı yaklaşımı benimsendi.
- Kullanıcı rating ortalaması kart üzerinde gösteriliyor.
- Maç sonrası POTM alanı için tasarım zemini hazırlandı.
- Maç detayında skor, rating, review ve topluluk etkileşimleri için arayüz oluşturuldu.
- Yarım yıldızlı 0.5–5.0 rating sistemi uygulandı.
- Normal tekrar puanlama mevcut günlük kaydını güncelliyor.
- Rewatch seçeneği ayrı bir günlük girdisi oluşturuyor.
- Spoiler ve görünürlük seçenekleri eklendi.
- Kullanıcı başına en güncel rating topluluk ortalamasına katılıyor.

### 3.3 Sosyal ve koleksiyon mekanikleri

- Review, review yorumu ve review beğenisi için backend temeli mevcut.
- Watchlist ve favorite birbirinden ayrı tutuldu.
- Oyuncu, takım ve kullanıcı follow ilişkileri için backend mevcut.
- Public/followers/private review görünürlük kontrolleri uygulandı.
- Ranked veya normal kullanıcı listeleri oluşturulabiliyor.
- POTM ve Respect için temel endpoint ve doğrulamalar mevcut.
- POTM seçilen oyuncuya aynı maçta Respect verilememesi kuralı uygulanıyor.
- Kullanıcının yalnızca maçta bulunan oyunculara oy verebilmesi kontrol ediliyor.
- Standard log için en fazla üç tag kısıtı bulunuyor.
- Watchalong için gerçek kullanıcı kimliğini kullanan WebSocket temeli hazırlandı.

### 3.4 Ortak Primary Arch hesabı

- RankIt ayrı bir kullanıcı veritabanı kullanmıyor.
- RankIt tabloları Primary Arch `users` tablosundaki `user_id` değerlerine bağlı.
- Mevcut Primary Arch JWT oturum sistemi yeniden kullanılıyor.
- Web hesabından Android uygulamasına geçiş için tek kullanımlık mobil kod sistemi hazırlandı.
- Mobil kodun yalnızca SHA-256 özeti veritabanında tutuluyor.
- Kod beş dakika geçerli ve yalnızca bir kez kullanılabiliyor.
- Password ve Google girişlerinden sonra güvenli `next` yönlendirmesi destekleniyor.
- Android uygulaması `rankit://auth` deep-link'i üzerinden giriş sonucunu alabiliyor.
- Ortak hesap ve tek kullanımlık kod testleri bütünlük testlerine eklendi.

### 3.5 Android alpha paketi

- Capacitor Android projesi oluşturuldu.
- Paket kimliği `net.primaryarch.rankit` olarak belirlendi.
- Uygulama adı `RankIt by Primary Arch` olarak ayarlandı.
- Minimum Android sürümü API 24, hedef API 36 olarak yapılandırıldı.
- Primary Arch 12-geni içinde RankIt “R” launcher ikonu oluşturuldu.
- Capacitor App ve Browser eklentileri bağlandı.
- Debug alpha APK üretildi ve APK Signature Scheme v2 ile doğrulandı.

## 4. Maç verisinin gerçek durumu

### 4.1 Hazır olan veri

Yerel RankIt veritabanında yaklaşık **5.934 maç** bulunmaktadır. Mevcut senkronizasyon sistemi:

- NBA maçlarını NBA Schedule / NBA Stats kaynaklarından alır.
- Premier League maçlarını FotMob üzerinden alır.
- La Liga maçlarını FotMob üzerinden alır.
- Serie A maçlarını FotMob üzerinden alır.
- Bundesliga maçlarını FotMob üzerinden alır.
- Ligue 1 maçlarını FotMob üzerinden alır.
- 2025–26 tamamlanmış sezon sonuçlarını işler.
- 2026–27 sezon fikstürlerini işler.
- Provider ve provider maç kimliği üzerinden tekrar çalıştırılabilir upsert yapar.
- Maç tarihini, durumunu, skoru, takımları, sezonu ve turnuvayı saklar.
- Primary Arch oyuncu parquet'lerini kullanarak sezonluk kadroları takımlara ve maçlara bağlar.
- Yeni sezon oyuncu parquet'i yoksa son mevcut sezon kadrosuna kontrollü fallback uygular.

Bu nedenle RankIt'in başlangıç maç kataloğunun yeniden kurulmasına ihtiyaç yoktur.

### 4.2 Gerçek eksik: production senkronizasyonu

`src/rankit_sync.py` şu anda elle çalıştırılan bir katalog senkronizasyon script'idir. Katalogun sürdürülebilir olması için aşağıdaki operasyonel katman eksiktir:

- Railway üzerinde zamanlanmış otomatik çalışma.
- Canlı veritabanına ilk katalog yüklemesi.
- NBA cache dosyası için yaş veya zorunlu yenileme kontrolü.
- Upcoming → live → finished durum geçişlerinin düzenli güncellenmesi.
- Skor, saat değişikliği, erteleme ve iptal güncellemeleri.
- Sağlayıcı hatalarının loglanması ve alarm üretmesi.
- Başarısız sync durumunda mevcut geçerli verinin korunması.
- Son başarılı çalışma zamanı ve güncellenen maç sayısı için health/diagnostic bilgisi.

### 4.3 Mevcut kapsamın dışında kalan veri

Gerçek provider senkronizasyonuna daha sonra eklenecek turnuvalar:

- UEFA Champions League
- UEFA Europa League
- UEFA Conference League
- İngiltere, İspanya, İtalya, Almanya ve Fransa'nın öncelikli yerel kupaları
- EuroLeague
- Ürün kararı sonrasında seçilecek diğer basketbol ligleri

Demo seed içerisinde bu turnuvalardan bazılarının adı bulunabilir; bu, gerçek provider senkronizasyonuna dahil oldukları anlamına gelmez.

### 4.4 Yayıncı bilgisi

Kullanıcının bulunduğu ülkeye göre yayıncı kanal gösterme hedefi henüz gerçek bir veri kaynağına bağlı değildir. Production çözümü şunları gerektirir:

- Ülke koduna göre yayıncı eşlemesi.
- Sağlayıcı veya yönetilebilir editoryal yayın tablosu.
- Aynı maç için birden fazla yayıncı desteği.
- Yayıncı bilgisinin doğrulanma ve son güncellenme zamanı.
- Yayıncı bulunamadığında yanlış bilgi göstermek yerine boş durum.

### 4.5 Maç kadrosu hassasiyeti

Mevcut sistem sezonluk takım kadrosunu maça bağlar. Gerçek ilk 11, aktif kadro, oyuna giren oyuncular ve dakika bilgisi henüz alınmaz. MVP için bu yaklaşım yeterlidir; ancak POTM ve Respect mekanikleri genel kullanıma açılmadan önce gerçek maç kadrosuna geçilmesi tavsiye edilir.

## 5. Revize edilmiş öncelik sırası

### P0 — Canlı auth ve temel production aktivasyonu

Genel kullanıcı testinden önce tamamlanmalıdır:

1. Ortak Primary Arch mobil giriş kodunu GitHub ve Railway'e deploy etmek.
2. `/rankit/mobile-auth` rotasının canlıda açıldığını doğrulamak.
3. Password ve Google login sonrası APK'ya dönüşü gerçek Android cihazda test etmek.
4. Ortak `users` kaydının RankIt diary ve sosyal işlemlerinde kullanıldığını doğrulamak.
5. Süresi dolmuş, kullanılmış ve hatalı mobil kod senaryolarını canlıda test etmek.

### P0 — Maç katalogunu production ortamında çalıştırmak

1. `rankit_sync.py` için `--refresh` veya cache-age seçeneği eklemek.
2. NBA güncellemesinin mevcut parquet bulunduğunda da gerektiğinde provider'a gitmesini sağlamak.
3. İlk 2025–26 ve 2026–27 katalog sync'ini Railway volume üzerinde çalıştırmak.
4. Zamanlanmış sync görevi kurmak.
5. Sonuçları `/api/rankit/meta` veya ayrı health endpoint'inden doğrulamak.
6. Sync başarısız olduğunda production veritabanını boşaltmamak veya demo veriye düşürmemek.

Önerilen sıklık:

| Veri | Önerilen sıklık |
|---|---:|
| Yaklaşan fikstürler | 6 saatte bir |
| Maç günü upcoming/live kontrolü | 5–15 dakikada bir |
| Canlı veya yeni bitmiş maçlar | 2–5 dakikada bir |
| Geçmiş sezon düzeltmeleri | Haftada bir |
| Kadro güncellemesi | Günde bir veya transfer sonrası |

Ücretsiz/resmî olmayan sağlayıcıların rate-limit koşullarına göre sıklıklar yapılandırılabilir olmalıdır.

### P1 — Gerçek kullanıcı akışlarını tamamlamak

- API başarısız olduğunda production ortamında mock maç göstermeyi kaldırmak.
- Home, Discover, Activity, Diary, Lists ve Profile ekranlarının tamamını gerçek API verisine bağlamak.
- Loading, empty, offline ve retry durumlarını tamamlamak.
- Review düzenleme ve silme.
- Yorum düzenleme ve silme.
- Kullanıcı takipçi/takip edilen listeleri.
- Liste düzenleme, sıralama ve silme.
- Hide Scores tercihini kullanıcı veya cihaz bazında kalıcılaştırmak.
- Sezon, turnuva, tarih, durum, follow ve favorite filtrelerini gerçek sorgulara bağlamak.

### P1 — Tag, Classic, POTM ve Respect

- Kullanıcının rating yanında seçebileceği tag kataloğunu kesinleştirmek.
- Maç detayında her tag için toplam kullanım sayısını göstermek: örneğin `Chaotic 1,351×`.
- Classic damgasını kullanıcı başına tek oy olarak güvenceye almak.
- Minimum oy ve oran eşiğiyle otomatik `Instant Classic` etiketi üretmek.
- POTM sonuçlarını maç kartı ve detayında göstermek.
- Respect toplamlarını oyuncu profilinde göstermek.
- Oyuncuya genel yorum ile maç performansına özel yorumu ayrı veri türleri olarak modellemek.
- Gerçek maç kadrosu gelmeden POTM/Respect seçiminde yanıltıcı oyuncu göstermemek.

### P1 — Güvenlik ve moderasyon

- Auth, diary, review, comment, follow, mobile-code ve watchalong işlemlerine rate limit.
- Review, yorum, profil ve watchalong mesajı raporlama.
- Kullanıcı engelleme ve sessize alma.
- Admin moderasyon kuyruğu.
- Spam, flood ve tekrar içerik koruması.
- İçerik uzunluğu, XSS ve zararlı bağlantı kontrolleri.
- Hesap silme ve kullanıcı verisi silme akışı.
- SQLite migration ve Railway volume yedekleme prosedürü.
- RankIt kapsamını gizlilik politikası ve kullanım şartlarına eklemek.

### P2 — Watchalong productionlaştırma

- Sohbeti yalnızca gerçek maç zaman aralığında açmak.
- Maç bitince odayı salt okunur arşive dönüştürmek.
- Mesaj silme ve raporlama.
- Kullanıcı engel/mute kurallarını canlı sohbete uygulamak.
- Çoklu backend instance için Redis pub/sub veya eşdeğer ortak yayın katmanı kullanmak.
- Bağlantı kesilmesi ve yeniden bağlanma durumlarını mobilde göstermek.

### P2 — Turnuva kapsamını genişletmek

Önerilen sıra:

1. UEFA Champions League
2. EuroLeague
3. Europa League
4. Conference League
5. Beş büyük ligin öncelikli yerel kupaları
6. Kullanım verisine göre diğer basketbol ve futbol organizasyonları

Yeni turnuva eklenirken competition, season, provider ID, takım eşleme ve fikstür upsert testleri zorunlu olmalıdır.

### P2 — Yayıncı katmanı

- İlk hedef ülke olarak Türkiye'yi desteklemek.
- Maç-yayıncı-ülke ilişkisini ayrı tabloda tutmak.
- Editoryal düzeltme ekranı eklemek.
- Kaynak ve doğrulanma zamanı saklamak.
- Daha sonra yeni ülkeleri yapılandırma üzerinden açmak.

### P3 — Production Android dağıtımı

Mevcut alpha APK genel dağıtım paketi olarak kabul edilmemelidir. Nihai dağıtım için:

- JWT'yi `localStorage` yerine Android secure storage/keystore destekli alanda saklamak.
- Özel `rankit://auth` şeması yerine doğrulanmış Android App Link kullanmak.
- `https://primaryarch.net/.well-known/assetlinks.json` yayınlamak.
- Release signing key oluşturmak ve güvenli, yedekli biçimde saklamak.
- Signed release APK üretmek.
- Play Store için AAB üretmek.
- Sürüm kodu ve güncelleme politikası belirlemek.
- Splash screen, launcher icon ve sistem teması davranışını gerçek cihazlarda test etmek.
- Android geri tuşu, cold-start deep-link ve process recreation senaryolarını test etmek.
- Düşük bağlantı, uçak modu ve API timeout durumlarını test etmek.
- Telefon ve tablet ekranlarında erişilebilirlik kontrolü yapmak.

## 6. Production veri senkronizasyonu için önerilen mimari

### 6.1 İş akışı

1. Scheduler ilgili sezon ve sağlayıcı için sync job başlatır.
2. Provider yanıtı önce geçici belleğe/cache'e alınır.
3. Yanıtın temel şeması ve maç sayısı doğrulanır.
4. Geçersiz veya şüpheli derecede boş cevap production tablolarına uygulanmaz.
5. Maçlar `(provider, provider_match_id)` anahtarıyla upsert edilir.
6. Değişen tarih, durum ve skor alanları güncellenir.
7. Sync sonucu ayrı job tablosuna yazılır.
8. API cache'i kontrollü biçimde temizlenir.

### 6.2 Kaydedilmesi gereken job bilgileri

- Provider
- Spor
- Sezon/turnuva
- Başlangıç ve bitiş zamanı
- Sonuç durumu
- Okunan maç sayısı
- Eklenen maç sayısı
- Güncellenen maç sayısı
- Hata özeti
- Son başarılı çalışma zamanı

### 6.3 Koruma kuralları

- Provider boş cevap verdiğinde mevcut maçları silme.
- Geçici ağ hatasında demo veriyi production'a ekleme.
- Aynı job'ın eşzamanlı iki kez çalışmasını kilitle.
- Geçmiş kullanıcı rating/review kayıtlarına bağlı maçı silme.
- Takım adı değişikliklerinde yeni takım üretmeden önce provider ID veya alias eşlemesi kullan.
- Rate-limit durumunda exponential backoff ve cache kullan.

## 7. Genel kullanıma açılma kriterleri

### Alpha dağıtımı için zorunlu

- [ ] Canlı Primary Arch ortak giriş akışı çalışıyor.
- [ ] RankIt tabloları gerçek Primary Arch `user_id` ile kayıt oluşturuyor.
- [ ] Canlı veritabanında başlangıç maç kataloğu bulunuyor.
- [ ] NBA ve beş büyük lig sync'i production'da tekrar çalışabiliyor.
- [ ] Upcoming maçların tarihleri ve bitmiş maçların skorları güncelleniyor.
- [ ] Production frontend API hatasında sahte demo maç göstermiyor.
- [ ] Rating, review, diary, rewatch ve gizlilik akışları gerçek cihazda test edildi.
- [ ] Rate limit ve temel içerik raporlama mevcut.
- [ ] APK production backend'e bağlanıyor.

### Açık beta için zorunlu

- [ ] Signed release APK/AAB hazır.
- [ ] Secure token storage hazır.
- [ ] Android App Link doğrulandı.
- [ ] Hesap ve içerik silme akışları hazır.
- [ ] Otomatik sync izleniyor ve hata bildiriyor.
- [ ] Moderasyon paneli kullanılabilir.
- [ ] Crash/error izleme mevcut.
- [ ] Gizlilik ve kullanım şartları RankIt'i kapsıyor.

### İlk kararlı sürüm için hedef

- [ ] Champions League ve EuroLeague gerçek verisi mevcut.
- [ ] Türkiye yayıncı bilgisi mevcut.
- [ ] POTM, Respect, Classic ve tag sonuçları tam çalışıyor.
- [ ] Friends Activity, Diary ve profil deneyimi tamamlandı.
- [ ] Watchalong yalnızca canlı maçlarda ve ölçeklenebilir altyapıyla çalışıyor.
- [ ] Performans ve erişilebilirlik testleri tamamlandı.

## 8. Önerilen uygulama sırası

1. Ortak auth değişikliklerini canlıya al ve gerçek APK ile doğrula.
2. `rankit_sync.py` refresh/cache-age düzeltmesini yap.
3. Railway başlangıç sync'i ve scheduled job'u kur.
4. Production mock fallback'ini kaldır ve API hata durumlarını tamamla.
5. Rating/review/diary/list/follow akışlarını uçtan uca denetle.
6. Rate limit, raporlama, engelleme ve moderasyon tabanını ekle.
7. POTM, Respect, Classic ve tag sonuç ekranlarını tamamla.
8. Champions League ve EuroLeague provider entegrasyonunu ekle.
9. Türkiye yayıncı katmanını kur.
10. Secure storage, Android App Link ve release signing ile production APK/AAB üret.

## 9. Sonuç

RankIt artık yalnızca görsel bir prototip değildir. Mobil arayüzü, sosyal maç günlüğü backend'i, ortak Primary Arch kullanıcı mimarisi, gerçek maç kataloğu ve install edilebilir Android alpha paketi bulunan çalışan bir ürün temelidir.

En kritik kalan işler yeni bir katalog oluşturmak değil; mevcut katalogu production ortamında otomatik güncel tutmak, ortak hesabı canlıda doğrulamak, kullanıcı içeriklerini güvenli biçimde yönetmek ve debug alpha paketini imzalı production uygulamasına dönüştürmektir.
