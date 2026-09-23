# RankIt arayüz yenilemesi — eleştirel inceleme

Tarih: 12 Eylül 2026

## Kapsam ve kanıt sınırı

Paylaşılan Claude Design URL'si bu oturumun tarayıcısında giriş sayfasına yönlendi. İnceleme, depoda bulunan `Primary Arch UI Redesign/RankIt Redesign.dc.html` dosyasının tarayıcıda gösterilen yerel kopyası, aynı klasördeki `HANDOFF.md`, RankIt ürün/tasarım belgeleri ve ilgili uygulama kaynakları üzerinden yapıldı. Paylaşımdaki sürüm ile yerel kopyanın eşitliği doğrulanmadı.

Ana ekran, spoiler ekranı, Community, upcoming, Discover/Diary, profil ve quick-rate panoları görsel olarak incelendi. Bulguların kod kısmı kaynak incelemesidir; çalışan APK üzerinde yeniden üretilmiş hata veya tam erişilebilirlik sertifikasyonu olarak okunmamalıdır. Bilgi grafiği araçları oturumda sunulmadığından indeks/generation/kapsam doğrulaması yapılamadı; doğrudan kaynak kullanıldı.

Başlangıç HEAD: `b1b5de9`. Çalışma ağacında RankItPrototype, çeşitli redesign ekranları ve yeni `useDialog.js` üzerinde devam eden değişiklikler vardı; bunlar incelemeye dahil edildi. Uygulama kodu değiştirilmedi.

## Genel değerlendirme

Görsel dil korunmaya değer. Kesik köşeler, kulüp renginden gelen zemin, kontrollü altın kullanımı ve kompakt kartın yalnızca küçülmek yerine yeniden düzenlenmesi, ürünün koleksiyon kimliğini güçlendiriyor. Community'nin üç gruba ayrılması ve Rank düğmesinin doğrudan “What did you watch?” sorusuna açılması doğru ürün tercihleri.

Ancak “39 ekran çizildi” ile “39 ekranın davranış sözleşmesi tamamlandı” aynı şey değil. Plan geometrik ayrıntılarda çok güçlü, veri anlamları, kayıt doğruluğu, geçişler ve başarısızlık durumlarında daha zayıf. Şu noktada yeni ekran sayısını artırmadan önce bu sözleşmeleri kapatmak daha değerli.

## Öncelikli bulgular

### P1 — Kayıt sonrası düzenleme, kaydedilmiş gibi görünmeye devam ediyor

`frontend/src/rankit/RankItPrototype.jsx` içindeki `MatchDetail/saveLog` başarıdan sonra `saveState="saved"` yapıyor. İncelenen akışta rating/review/tag değişiklikleri bu durumu dirty'ye döndürmüyor. Buton “Saved to Diary”, sonuç bölümü ise değişmiş puanı gösterebiliyor; sunucuya ikinci kayıt yapılmış olmuyor. HANDOFF'taki dirty geçişi ile doğrudan çelişiyor.

Öneri: son başarılı kaydın snapshot'ı ile formu karşılaştıran `isDirty`; durumlar `clean / dirty / saving / queued / saved / error`. Kaydedilmemiş mevcut kaydı düzenleyip kapatma senaryosu ayrıca korunmalı. Taslak anahtarı yalnız maç değil hesap kimliğini de taşımalı; mevcut `rankit:draft:${match.id}` hesaplar arasında ortak.

Kabul: kaydet → yıldızı/review'u değiştir → buton Update durumuna dönsün; kapat/aç ve ağ hatası sırasında değişiklik kaybolmasın.

### P1 — Spoiler koruması yüzeyler arasında tutarlı değil

Yeni `MatchCard` skor metnini yalnız CSS blur ile saklıyor; metin DOM'da kalıyor. “TAP TO REVEAL” bir div; onu açan özel eylem yok. Home/Discover wrapper'ı karta dokununca maç detayını açıyor.

`SearchSheet.jsx` sonuç başlığı skoru doğrudan yazıyor ve ortak `hidesScore` kuralını kullanmıyor. `ReviewThread.jsx` ana yorumu doğrudan gösteriyor; AllReviews'taki spoiler kapısı “Read” yolunda aynı korumayı taşımıyor. `rankitPrefs.js/hidesScore` yalnız finished durumunu kapsıyor.

Öneri: tek spoiler sözleşmesi; score, tags, POTM, heat, yorum ve erişilebilir isimler için yüzey bazında uygulanacak kural. Gizliyken sonuç metnini render etme; “Reveal this match” ayrı button ve maç bazlı reveal state olsun. Bir maçın açılması genel tercihi kapatmasın. Canlı skorların da gizlenip gizlenmeyeceği açıkça yazılsın.

Kabul: Home → Search → Match → All reviews → Thread zincirinde gizlenen bilgi izinsiz açılmasın; ekran okuyucu gizli skoru okuyamasın.

### P1 — Çevrimdışı kaydetme vaadi, bazı hata yollarında doğru değil

`rankitOutbox.js/save` localStorage yazma hatasını yutuyor; `queueRating` yine başarı sayısı döndürüyor. UI “Saved on this phone” diyerek taslağı silebiliyor. Depolama dolu/engelli olduğunda kalıcı kayıt olmadan başarı sözü veriliyor.

`flushOutbox` ağ hatası dışındaki hatalarda kaydı kuyruktan kaldırıyor. Bu, yeniden giriş gerektiren 401 ile kalıcı 422'nin aynı şekilde ele alınması demek. Ayrıca diary, POTM ve respect ayrı isteklerle kaydediliyor; birinci adım başarılı, ikinci adım başarısız olabilir.

Öneri: kalıcı yazma doğrulanmadan queued gösterme. Kuyruğu `pending / syncing / auth-required / retryable-error / rejected / synced` olarak modelle. Reddedilen taslaklar kullanıcı kurtarabilene kadar kalsın. Her mutasyon kimlik ve sürüm taşısın; özellikle rewatch tekrarlarında idempotency olsun. Kaydetme akışı ya tek işlem olsun ya da hangi alt adımın tamamlandığı saklansın.

Kabul: depolama hatası, oturum süresi dolması, sunucu hatası, yanıt alınmadan bağlantı kopması ve yükleme sırasında aynı maçın yeniden düzenlenmesi ayrı ayrı doğrulansın.

### P1 — Yeni kartın sözleşmesi canlı durumları ve temel aksiyonları kaybediyor

`redesign/toMatchCardProps.js` yalnız `finished` boolean'ı geçiriyor. Live maç `finished=false` olduğundan geniş kartta UPCOMING varsayılanına düşüyor ve güncel skor taşınmıyor. Compact kart status rozetini zaten çizmiyor. Aynı wrapper'larda eski kartın `onOpenCompetition` yeteneği yeni karta geçmiyor. Shield, crest URL var ama yükleme başarısızsa monogram fallback'i çalıştıran `onError` içermiyor.

Öneri: kart props sözleşmesine `status`, `score`, `scheduledAt`, `competitionId`, `onOpenCompetition`, `onReveal` ekle. Live kırmızı etiketi, ertelenmiş/iptal/TBD, skoru henüz ulaşmamış finished, uzun takım adı ve kırık arma için ayrı örnekler oluştur. Basketball için tek satıra daha küçük puan sıkıştırmak yerine iki takım satırına hizalı skor düzenini karşılaştır.

Kabul: altı boyut preset'i yalnız örnek skorlarla değil bütün durumlarla test edilsin. Lig tıklaması maç açma olayını tetiklemesin.

### P1 — Android geri tuşu ile dialog yığını ayrı çalışıyor

Yeni `useDialog.js` odak, Escape ve iç içe dialog yönetimi ekliyor; bu olumlu ve halen devam eden çalışma. Ancak Android `backButton` zinciri `state.detail` kontrolünde MatchDetail'ı kapatıyor. AllReviews ve ReviewThread bu component'in içinde tutuluyor. Dolayısıyla derin bir yorum ekranında geri hareketi tüm maç detayını kaldırabilir; Escape'in yalnız üst dialogu kapatmasıyla aynı davranış değil.

Öneri: tek katman kaydı; Android Back, Escape, drag, backdrop ve X aynı üst katmana yönlensin. Gerideki arama sorgusu, filtreler, seçili tab, kaydırma konumu ve taslak korunmalı. Dialogları en sona eklenen erişilebilirlik işi olmaktan çıkarıp ortak altyapı yap.

Kabul: Match → AllReviews → ReviewThread → Back sırası tek tek geri yürüsün; Settings → follows editor için de aynı garanti olsun. Fiziksel Android, klavye açıkken ve TalkBack ile kontrol gerekli.

### P1 — “All reviews” gerçekte ilk sayfayı tüm liste sayıyor

`api/rankit.py/rankit_match_reviews`: sorgu `LIMIT 60`, yanıt `total=len(rows)`. Frontend bu sayıyı gerçek toplam sanıp `THAT'S ALL 60` gösterebilir. Offset/cursor akışı yok. Takip edilenler de global limitten sonra ayrılıyor; ilk 60'a giremeyen arkadaş yorumu üstte görünmüyor.

`AllReviews/Row` API'den gelen rating'i göstermiyor ve `given=false` ile başlıyor; önceden respect verilmiş yorum doğru seçili görünmüyor. Tasarımdaki yorum okuma hissinin önemli bir kısmı yazarın yıldızlarıyla birlikte düşüncesini görmekti.

Öneri: gerçek total + cursor/has_more; takip edilenler için ayrı sınırlı bölüm/sorgu. Her yorumda rating ve sunucudan gelen respect durumu. Arkadaş pinlerini ilk birkaç yorumla sınırlandırıp devamını genişletmek genel akışı dengeler.

### P1 — Boş veri, hata ve yükleme birbirine dönüşüyor

Kaynakta doğrulanan örnekler:

- AllReviews: başarısız istek → total=0 → “No reviews yet”.
- SearchSheet: başarısız istek → boş sonuç.
- ReviewThread ve Companion: hata → null → sürekli skeleton.
- CompetitionPlayers: hata/boş available → “This competition does not publish player statistics.” Bu, RankIt'in o veriyi getirememesiyle yarışmanın veri yayımlamamasını karıştırıyor.
- Discover: her fetch hatası `failed` yapıyor; UI bunu offline diye adlandırıyor, alttaki request katmanı HTTP ve ağ hatasını ayırsa da ekran ayrımı korumuyor.

Öneri: ortak ekran durumları `loading / ready / empty / stale / error`; boşluk yalnız başarılı sıfır sonuçta. Geçici hatada mevcut içerik korunsun, Retry görünsün. Kaynak kapsamı mesajı “Season statistics aren't available in RankIt yet” olsun.

### P2 — Filtrelerin görünümü kadar sonuç tutarlılığı da düzeltilmeli

Panodaki 2c drawer; uygulamadaki Discover halen sayfa içi hızlı filtre paneli. Bu farkın hangisinin hedef olduğu açıkça kapatılmalı. Bugünkü competition → latest season kararı iyi; korunmalı.

Discover isteklerinde sonuçların ait olduğu sorguyu doğrulayan anahtar veya eski isteği geçersiz kılan mekanizma yok. Hızlı spor/sezon değişiminde geç dönen eski sonuç yeni filtrelerin altında görünebilir. “Popular this week” başlığı ise geçmiş sezon/Upcoming sorgusunda da sabit kalıyor. Sonuçlar istemcide her yüklenen sayfa grubu üzerinde tekrar sıralanıyor; global sıralama sözleşmesi gerekli.

Öneri: üstte kompakt spor seçimi + aktif filtre özeti; alt sheet'te tarih, yarışma, sezon ve durum; sabit “Show N matches” / reset. Örneğin “2025–26 · Finished · Premier League” başlığı sorguyla eşleşsin. Query key/AbortController, sunucuda sıralama ve stabil sayfalama kullanılsın. Minimum heat henüz rating olmayan Upcoming ile birlikte seçildiğinde ne olacağı ayrıca tasarlansın.

## Tasarımsal ve ürün düzeyinde düzeltmeler

### Aynı gösterge farklı verileri temsil etmesin

Kartta heat topluluk ortalaması. Diary adaptörü ise aynı alana kişisel rating'i veriyor. Aynı adaptör kişisel classic'i instantClassic alanına koyuyor; tek `classic` prop'u hem gold notch hem damga üretiyor. Kullanıcı kendi beğenisiyle topluluk onayını ayıramıyor.

Önerilen ayrım: `Community 4.2 · 318 ratings`, `Your rating 4.5`, `Your Classic`, `Instant Classic`. Görsel dili değiştirmeden ayrı alanlar kullan. Compact kartta küçük avatar/yıldız, kişinin puanını topluluk barından ayırabilir. Upcoming “Expected heat” talep, live “Crowd pulse” anlık tepki, finished rating nihai görüş: aynı 0–5 görünümü bunları eşdeğer hissettirmemeli. Expected heat'i izlemek isteyen kişi sayısıyla vermek daha anlaşılır olabilir.

### Dokuz bloktan üç panele geçmek tek başına iş yükünü azaltmıyor

Üç bölüm görsel olarak iyi. Yine de öncelik bir yıldız puanı verip kaydetmek olmalı. Review, tags, POTM ve respect isteğe bağlı zenginleştirme olarak açılabilir; hepsi ilk kaydın ön şartı gibi görünmemeli. Save, klavye açıldığında da ulaşılabilir olmalı. Uzun yorum yazılan kutu 12px vitrin metni değil, rahat okunan içerik alanı olmalı.

### 9px taban, genel kitle için yeterli bir okunabilirlik hedefi değil

375px panolarda meta metinler ve yoğun büyük harfler küçük kalıyor. Öneri: review/input metnini 15–16px; çoğu yardımcı metni 12–13px; küçük eyebrow'u yalnız ikincil bilgi için kullan. Kullanıcının büyük yazı ayarıyla iki satıra açılabilsin.

Offline durumda bütün kartı %62 opaklığa indirmek, okunması gereken cache içeriğini de solduruyor. Metin tam opak kalsın; yalnız sanat/zemin hafifçe değişsin, Cached + son güncelleme bilgisi gösterilsin. Metin kontrastı düz koyu zeminde değil kulüp gradient'i, tüm skin'ler ve offline hali üzerinde ölçülsün. Normal metin için 4.5:1 hedefi: [WCAG 2.2](https://www.w3.org/TR/WCAG22/#contrast-minimum).

### Rank/streak ve sosyal ödüller günlüğü gölgelememeli

Onaylı oyunlaştırma kararları geriye çevrilmemeli; ancak etkisi sınanmalı. Handoff'ta companion katılımı 20, eski maç kaydı 5 puan. Bu oran “izlediğini dürüstçe kaydetme” yerine açık ekran tutmayı teşvik edebilir. Rank seviyesini görüşün doğruluğu değil katkı/katılım geçmişi olarak anlatmak daha isabetli. Basketbol da ana spor olduğundan Terrace/Home End gibi tier adlarının futbol merkezliliği ayrıca değerlendirilmeli.

Handoff streak'i yerel gece yarısına bağlarken güncel motor `rankit_day` ile 11:00 sınırını kullanıyor. Uygulamanın bu yönde düzelmiş olması olumlu; belge de düzeltilmeli. NBA geceleri, yaz saati, seyahat, ertelenen maç ve offline gecikme örnekleri tek zaman sözleşmesine bağlanmalı.

### Companion bir yaşam döngüsü olarak tamamlanmalı

Before/live/after sabit sekme fikri iyi. Uygulamada yenileme interval'i yalnız mevcut state zaten live iken kuruluyor; maç öncesi ekranda bekleyen kullanıcı kickoff geçişini hemen alamayabilir. Finished durumda da compose alanı çiziliyor; backend mesaj döngüsünde maçın bittiğine ilişkin yazma engeli görünmüyor. Handoff'un “After: chat closes” kuralıyla uyuşmuyor.

Öneri: açık maçta kontrollü durum yenileme; before/live/read-only-after; kopan bağlantıda reconnect + son mesajdan devam. Futbolun KO/HT/60' çizelgesi basketbolda Q1/Q2/HT/Q3/Q4/OT düzenine ayrılmalı. Gecikmeli yayın izleyen kişi için canlı olay/spoiler politikası olmalı. Sosyal kullanıma açılmadan raporla/engelle/sustur kontrolleri de yüzey planına alınmalı.

## Uygulama planını nasıl revize ederdim?

1. **Sözleşmeleri netleştir.** Her ekran için tasarım id'si, güncel component, gerekli veri, boş/hata hali, mevcut durum ve kabul kriteri. Her madde `uygulandı / kısmi / yalnız tasarım / bilinçli ertelendi` taşısın. Görsel kaynak ve davranış kaynağı ayrı yetkili olsun; mockup'ın önceden çalışan davranışı sessizce iptal etmesine izin verme.
2. **Ortak davranışları kapat.** Kayıt/dirty/outbox, spoiler politikası, katman/geri tuşu ve query durumları. Bunlar MatchCard'dan bağımsız gerçek bağımlılıklar; “tek bağımlılık MatchCard” ifadesi düzeltilmeli.
3. **Kartı davranışla kabul et.** Altı preset × durum × spor × veri yok/kırık logo × kişisel/topluluk anlamı. Gold notch/Classic ayrımı ve lig tıklaması dahil. Feature flag'in varsayılanı, kapsamı ve kaldırılacağı aşama yazılsın; şu an yeni kart varsayılan kapalı, diğer ekranlar aynı bayrağa bağlı değil.
4. **Üç temel yolculuğu bitir.** Bul → izle/puanla → diary; arkadaş yorumu → thread → profil → geri; upcoming → companion live → final → diary. Yeni kullanıcı ve düşük topluluk katılımı bunların parçası olsun.
5. **Bütün ekranları bu temele bağla.** Search, filters, reviews, profile, lists ve notifications. Skin/share, Hunt/collections, rank/streak ve native mark/icon teslimleri de envanterde var; sekiz adımlı phase listesindeki yerleri ve kabul ölçütleri açıkça yazılsın. Yoksa çizilmiş oldukları için bitmiş sanılabilirler.
6. **Cihaz kapısı.** 320/360/375/412px; büyük yazı; uzun kulüp isimleri; gerçek PNG/SVG armalar; yüzlerce yorum; sistem geri hareketi; klavye; TalkBack; reduced motion; offline/reconnect. Sadece statik panodaki altı boyuta bakmak yeterli değil.

Web'in bu sırada geride kalması 9 Eylül tarihli bilinçli karar; bunu mevcut mobil işi engelleyen bir hata olarak değerlendirmiyorum. Web borcu listesi korunmalı. Eski mobil belgelerdeki “broadcast country hardcoded” ve “dialog yok” gibi ifadeler güncel kodla tekrar karşılaştırılmalı; bugün ülke tercihi ve dialog çalışması mevcut.

## İlk düzeltme paketi

Önerdiğim ilk paket: kayıt/dirty doğruluğu, outbox güvenilirliği, spoiler bütünlüğü, live kart eşlemesi, Android katman geri dönüşü. İkinci paket: reviews sayfalama/puanlar, hata durumları ve filtre sorgu tutarlılığı. Görsel tipografi/kontrast düzenlemesi bu iki paketle birlikte yapılabilir; skin ve diğer genişlemeler sonrasında.

Tasarımın kimliğini korumayı, üretime geçiş ölçütünü ise “panoya benziyor”dan “kullanıcının kayıt ve geri dönüş beklentisini her durumda karşılıyor”a taşımayı öneriyorum.
