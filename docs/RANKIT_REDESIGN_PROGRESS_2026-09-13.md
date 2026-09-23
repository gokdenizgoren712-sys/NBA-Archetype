# RankIt redesign — uygulama denetimi ve devam planı

Tarih: 13 Eylül 2026. İnceleme 12 Eylül'de başladı.

**14 Eylül devamı:** Bu belgedeki test sayıları ve “inline result” notu 13 Eylül
anlık durumudur. 6a kayıt sonucu ve HTML `2p` Standing uygulamasının güncel durumu,
kaynak eşlemesi ve kalan eksikleri `RANKIT_REDESIGN_PROGRESS_2026-09-14.md` içindedir.
APK yalnız bütün çalışma bittikten sonra hazırlanacak.

## Kapsam

Kullanıcının ilettiği prompt sırası ve yerel `Primary Arch UI Redesign/HANDOFF.md` esas alındı. Mevcut çalışma ağacındaki Claude değişiklikleri korunarak, önceki aşamalardaki davranış hataları ve yeni sıranın 8–9. aşamaları üzerinde düzeltme yapıldı. Bu belge tüm redesign'ın veya APK'nın tamamlandığı anlamına gelmez. Commit, push, deploy veya APK üretimi yapılmadı.

Önceki eleştiri: `docs/RANKIT_REDESIGN_REVIEW_2026-09-12.md`. Oradaki “uygulama kodu değiştirilmedi” cümlesi yalnız ilk incelemenin tarihsel durumudur; bu pakette uygulama kodu değiştirildi.

## Planın düzeltilen tarafı

Eski HANDOFF'ta 8 erişilebilirlikti; yeni promptlarda 8 durumlar, 9 erişilebilirlik. Ayrıca promptların başvurduğu §4.9 ve §10 eski belgede yoktu. HANDOFF'a yeni sıra, altı navigasyon sözleşmesi ve motion/haptic/notification kuralları eklendi. Eski sıra tarihsel olarak etiketlendi.

“Mobile complete” kaldırıldı. Yerel board, yeni 6a–6d ekranlarının son görsel sürümünün doğrulandığı şeklinde sunulmuyor. Promptun “seven skins” deyip sekiz ad sayması, dört süre kuralına rağmen livedot için 1.4 saniyeyi koruması ve bildirim varsayılanlarındaki Social istisnası açıkça belgelendi.

## Uygulanan düzeltmeler

### Kayıt, taslak ve çevrimdışı güvenlik

- Formun bütün anlamlı alanlarını kapsayan snapshot karşılaştırması: kaydetme sonrası değişiklik yeniden dirty/Update olur. Kapatıp açarken hesap ve maç bazındaki taslak korunur.
- Her kayıt ağ isteğinden önce kalıcı kuyruğa yazılır. Depolama hatası başarı sayılmaz. Hesap değişiminde kalan adımlar başka kullanıcının oturumuyla gönderilmez.
- Diary, POTM ve respect adımları ayrı onaylanır. Kısmi işlem tamamlanan diary adımını tekrar etmez. Yeni revizyon eski ağ yanıtıyla silinmez.
- 401/403/422/429/500 kayıtları silmez; otomatik sonsuz tekrar yerine yeniden giriş veya açık yeniden deneme gerekir.
- Yanıtı belirsiz rewatch otomatik tekrar gönderilmez. Bu bir koruma mekanizmasıdır, tam sunucu idempotency çözümü değildir.

İlgili kaynaklar: `entryState.js`, `ratingQueue.js`, `rankitOutbox.js`, `RankItPrototype.jsx`.

### Kartlar, veri anlamı ve spoiler

- Live maç durumu, kırmızı metinli etiket ve skor aktarımı; basketbolda dikey skorlar; eksik arma için monogram fallback.
- Home/Discover yeni kartlarında lig açma eylemi geri bağlandı, maç açma eylemiyle çakışması engellendi.
- Gizli skoru yalnız blur ile saklamak yerine metni render etmeme; ayrı Reveal düğmesi. Arama, detay, yeni kart ve turnuva fikstüründe ortak gizleme kuralı; canlı maçlar da kapsamda.
- Spoiler işaretli yorum detayı ve yanıtları açık onay ister. Match Community bilgileri de reveal kapısından geçer.
- Diary kartında kişisel rating/Classic açıkça etiketlendi; topluluk Instant Classic değerlendirmesi gibi sunulmaz.

### Durumlar, listeler ve Companion

- Ortak hata görünümü ve veri yükleme yardımcısı: HTTP hatası “kimse yorum yapmamış” veya “oyuncu yok” sayılmaz. Arama, yorum, bildirim, ayar, liste/profil ve turnuva ekranlarında uygun retry/önceki veri davranışı eklendi.
- Discover eski istek yanıtlarını eler; sayfaları tekilleştirir; filtre değişiminde eski veri kalırsa güncellenmekte/önceki sonuç olduğu belirtilir. Yalnız yüklenen sayfaları popülerliğe göre yeniden sıralama kaldırıldı.
- Tüm yorumlarda gerçek toplam, offset ve next_offset; takip edilenler sayfalama öncesinde öncelikli; mevcut respect bilgisi taşınır. “That's all” yalnız gerçek listenin sonunda görünür.
- Companion yaklaşan/canlı durumdayken yenilenir; mesaj taslağı sunucu onayına kadar tutulur. Maç bitince oda yazmaya kapanır; sunucu da bunu uygular. Basketbolda football KO/HT zaman etiketleri kaldırıldı.
- Çevrimdışı solukluk görsele uygulanır, metin ve etkileşimlere değil.

### Erişilebilirlik

- Mevcut `useDialog` içindeki değişken gölgelemesinin ürettiği açılış çökmesi düzeltildi. Derleme bu runtime hatasını yakalamıyordu; tarayıcıda bulundu.
- İç içe pencerelerde en üst pencere kapanır, odak doğru açıcıya döner. Arka plan dalları inert yapılır; odak dışarı kaçamaz. Escape ile Android Back aynı pencere yığınını kullanır.
- Yorum okuma ve spoiler açma eylemleri gerçek klavye erişimli düğmelerdir.

## Doğrulama

- Node: `node --test tests/rankit-state.test.mjs` — **15 test geçti**. Hesap değişimi, kısmi kayıt, eski/yeni revizyon yarışı, kota, HTTP durumları, bozuk kuyruk, belirsiz ve kısmi rewatch dahil.
- Python: yalnız geçici SQLite kullanan `tests/test_rankit_social.py` — **26 test geçti**. 66 yorumun 60+6 sayfalanması, gizli yorumların hariç tutulması, takip/respect dahil. Eski saate bağlı test sabit sabah/öğleden sonra saatleriyle düzeltildi; üretimdeki 24 saat sınırı değiştirilmedi.
- Mobil Vite build son değişikliklerden sonra yeniden çalıştırıldı ve geçti (1813 modül). Bu, APK kurulumu veya native davranış testi değildir. `git diff --check` de geçti.
- Düzeltilen bağımsız bileşenler ve kuyruk yardımcıları için hedefli ESLint temiz. Monolit `RankItPrototype.jsx` içinde kalan dört hook/ref lint bulgusu var (bu sürümde 607, 705, 857, 1222. satırlar); genel lint temizliği iddia edilmiyor. Bu pakette değişen Discover yükleme akışının lint bulguları kapatıldı.
- İzole tarayıcı testi: altı basketbol kart boyutu; başarısız arma; kaydet → düzenle → kapat/aç taslak; yorumların 60+6 tamamlanması; thread spoiler kapısı; Search hata/başarı ve gizli skor; üç katmanlı Escape/focus/inert temizliği doğrulandı.
- `frontend/qa/rankit.html` sentetik veri ve taklit API kullanır; gerçek hesaba/üretim veritabanına yazmaz ve üretim girişinden import edilmez. Native Back, TalkBack, büyük font ve gerçek telefon/çevrimdışı yaşam döngüsü ayrıca sınanmalıdır.
- Bilgi grafiği başlangıçta mevcut değildi; devamda araçlar listelendi ancak `list_projects`/coverage bağlantısı “Transport closed” döndü. Generation veya kapsam doğruluğu iddia edilmiyor; bulgular doğrudan kaynak ve belirtilen testlerle sınırlı.

## Sonraki çalışma sırası — tek seferde tek aşama

| Öncelik / aşama | Durum ve yapılacak iş | Kabul ölçütü |
|---|---|---|
| 6a sonucu | Mevcut inline kaydetme sonucu tam ortak collectible ekranı değil. Önce burayı tamamla. | Match / quick-rate / Companion / ilk rating aynı sonuca gider; çevrimdışı sonuç reward uydurmaz; Edit aynı kaydı açar. |
| 7: Profile / Standing / Hunt | Yeni navigasyon sözleşmesini tek tek uygula ve doğrula. | Profile 6b root; Standing pushed; Hunt iki girişten erişilir. |
| 7: First run ve Companion | Tam akış ve expanded 4e/4f; mevcut kapalı oda tam 6d görseli sayılmaz. | 4g→4h→2r→rate→6a; full-time chart gerçek peak ile; kapanan room okunur. |
| 8–9 kapanış | Bu paketin kayıt/hata/dialog düzeltmeleri mevcut. Tüm yüzeylerin cihaz matrisi henüz tamamlanmadı. | Flag açık/kapalı; telefon font ölçeği; bütün sheet'ler; cached/no-cache; gerçek soket kopması. |
| 10 | Sekiz skin, paylaşılan CSS değişken sözleşmesi ve share composer. | 16 hero/shelf skin durumu; 4:5 ve16:9 export; spoiler dışarı sızmaz; kilit şartı gerçek. |
| 11–12 | Markalar ve Android adaptive/round ikon. | Benzersiz SVG mask id; gerçek launcher maskelerinde kontrol. |
| 12.5 | Sade Discover + ayrı drawer. | Hunt görünür; 288px/max85%;48px pills; tüm katalogda çalışan minimum heat. |
| 13 | Motion/haptic/notification entegrasyonu. | Reduced motion; yalnız taahhütte haptic; gerçek izin/kanallar; spoiler-safe payload ve cold-start deeplink. |
| 14 | Tam uygulama kabulü. | Altı navigasyon sözleşmesi, erişilebilirlik/renk/overflow matrisi, sonra APK ve yayın kararı. |

## Açık teknik borç / yayın engelleri

1. **Rewatch idempotency ve kurtarma:** sonuç belirsizken manuel diary kontrolü gerekir. Sunucuda mutation-id veya işlem sorgulama olmadan güvenli otomatik yeniden deneme yapılamaz. Kaydedilmiş rewatch düzenlemesini doğru entry ID'ye bağlayan sözleşme ayrıca tamamlanmalı.
2. **Tam spoiler taraması:** yeni ana akışlar test edildi; eski flag-off kart, paylaşım, bildirimler ve tüm ikincil yüzeyler henüz tam kapatılmış sayılmaz.
3. **Native/gerçek ağ kabulü:** Android Back/klavye/safe-area, TalkBack, yeniden açılışta cached içerik, oturum yenileme ve gerçek WebSocket kopma/terminal durum testi gerekiyor.
4. **Geometri ve performans:** altı boyutun ilk görsel kontrolü basketbol örneğiyle yapıldı. Uzun futbol kulüp adları, 320px, büyük font, bütün durum/skin kombinasyonları ve skeleton-layout-shift ölçümü tamamlanmalı.
5. **Yayın eşleşmesi:** yorum sayfalama ve mesaj onayı için `api/rankit.py` + frontend birlikte yayınlanmalı. Bu pakette tablo/migration eklenmedi; yine de backend değişikliği yayınlanmadan yeni sözleşme canlı sayılmaz.
6. **Çalışma ağacı sahipliği:** önceden var olan Claude ayarları/tasarım dosyaları korunuyor. Bu paketin commit'i hazırlanırken bunlar körlemesine topluca sahnelenmemeli.
