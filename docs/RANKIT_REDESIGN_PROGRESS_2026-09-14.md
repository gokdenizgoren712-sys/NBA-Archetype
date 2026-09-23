# RankIt redesign — 14 Eylül devamı

> **Aktif takip:** [Canlı prompt takip çizelgesi](#canlı-prompt-takip-çizelgesi).
> Güncel sıra, 39 özgün prompt, yapılanlar, kalanlar ve kabul kutuları aynı dosyada.

## Kaynak ve sınır

Görsel ana kaynak **`Primary Arch UI Redesign/RankIt Redesign.dc.html`**.
HANDOFF ve kullanıcının gönderdiği genişletilmiş prompt dizisi davranış ve sıra
için kullanılıyor. Repodaki `PROMPTS.md` eski/kısa diziyi içeriyor; genişletilmiş
kullanıcı ekiyle aynı dosya değildir. 14 Eylül'de gelen güncel HTML, ana referansın
yerine alındı; eski sürüm `Primary Arch UI Redesign/source-history/RankIt Redesign.before-2026-09-14.dc.html`
olarak korundu. Kaynağın tasarımı düzenlenmedi; yalnız satır sonları normalize edildi.

Bu paket yeni bir görsel konsept değildir. APK, commit, push ve deploy yapılmadı.
Önceden var olan Claude dosyaları/ayar değişiklikleri korunuyor.

## 14 Eylül — güncel HTML kaynak kabulü

Gelen dosya: `C:/Users/ggore/Downloads/RankIt Redesign.dc.html`.
Orijinal dosyanın SHA256 değeri: `7DB63B7A8F2E4ADE2AB659EE019A63C3B7F2BA16978B9E2B360C347FF72AC16B`.
Eski referans arşivlendi; Downloads dosyası değiştirilmedi.

Ekran-ID blokları **40 → 46**. Bu sayıya spec/anatomi ve superseded panolar da
dahil; 46 bitmiş uygulama ekranı anlamına gelmez. Silinen ekran yok.

| Kaynak farkı | Etkilenen iş / karar |
|---|---|
| Yeni 6a | Prompt 6: kart önce, ardından kişisel kayıt cümlesi; streak ve rank toplamları + artışları, üçüncü alanda collection ilerlemesi. Mevcut diary-delta kutusu nihai tasarım değil. |
| Yeni 6b | 7.01: profil kökü artık çizilmiş; üç sayaç watched/classics/streak, üçlü shelf ve Lists/Hunt/Your reviews. |
| Yeni 6c | 12.5: Discover filtresi ayrı sol drawer; 2c at-rest görünümünden ayrılmış. |
| Yeni 6d | 7.11: full-time Companion ayrı kayıt ekranı; live görünümden yalnız nokta kaldırmak yetmez. |
| Yeni 9a / 9b | Özgün 39 prompt dışında: Following/Followers ve Find people; aşağıdaki HTML-9A/HTML-9B. |
| Değişen 2c | Discover'ın grid öncesi Hunt tile'ı görünür kaynakta da var (prompt 3). |
| Değişen 3j | Quick-rate → 6a bağlantısı açıkça işaretlenmiş. |
| Değişen 4g / 4h / 2r | İlk girişin üç adımı etiketlenmiş; 7.09 sırası değişmiyor. |
| Değişen 2o | 5b/4f tarafından superseded; yeniden yapılmayacak. |
| Değişen 4a | Örnek yorumlar kısalmış, gösterilen yanıt sayısı iki; bu bir API yanıt sınırı değildir. |

6a'daki collection kutusu gerçek uygunluk/ilerleme gerektirir. Veri yoksa örnek
`8/12 London Derby` veya +1 gösterilmeyecek; eksik/uygulanamaz durum ayrıca ele alınacak.
6b'nin Your reviews girişi tüm maçlardaki **kendi** yorumlarını açmalı; mevcut maç
yorumları ekranının aynı kapsamda olduğu varsayılmayacak.

Bu kaynak kabulünde HTML metni/blok farkları incelendi; yeni ekranların tarayıcıda
görsel kabulü yapılmadı. Aşağıdaki test sonuçları önceki uygulama adımına aittir.
Bu güncelleme uygulama ekranlarını tamamlandı yapmaz; yalnız referans ve iş kaydı güncellendi.

### HTML-9A — Following / Followers (özgün prompt değildir)

- [ ] HTML-ek kabulü.
- **Durum:** İşlevsel uygulama ve sentetik UI kontrolleri yapıldı; görsel/entegrasyon kabulü kısmi (15 Eylül).
- **Giriş:** 6b Following/Followers sayaçları; profil geri hedefi korunur.
- **İş:** İki sekme ve gerçek sayıları, seçili ilişkiler içinde arama, closest-taste
  sıralaması; kullanıcıya tıklanınca 3i. Find people kontrolü → 9b.
- **Ortak kontroller:** FOLLOW / FOLLOWING / FOLLOW BACK / MUTUAL; istek beklerken
  çift işlem engeli, hata geri alma, iki listede ve profilde tutarlı sayılar.
- **Kabul:** En az 10 ortak görünür maç olmadan taste yüzdesi yok; satırlarda
  follower sayısı/popülerlik yarışı yok. Gerçek logged/classics verisi; görünürlük,
  boş/hata/offline, sayfalama ve 44px hedef/klavye/Back testi.
- **Veri kapısı:** `GET /people` eklendi: oturum sahibinin ilişkileri, handle araması,
  görünür kayıt istatistikleri ve sayfalama öncesi taste sıralaması. `PUT /people/{id}/follow`
  istenen durumu yazar (tekrar istek tersine çevirmez). Mevcut POST korunur.
- **Kalan:** Find people hâlâ mevcut Search'e gider; 9b bağlantısı sonraki aşama.
  Ekran şu anda odak/Back korumalı tam ekran yüzeydir; HTML'deki görünür ve
  kullanılabilir alt TabBar ile son eşleştirme 9a/9b gezinme entegrasyonunda yapılacak.
  Gerçek Android Back, büyük font/safe-area ve canlı iki hesapla kabul ayrıca açık.

### HTML-9B — Find people (özgün prompt değildir)

- [ ] HTML-ek kabulü.
- **Durum:** Planlandı; güncel HTML #9b ve t9 açıklaması referans.
- **Giriş:** 6b üst kontrolü veya 9a; kullanıcı seçimi → 3i.
- **İş:** İsim/@handle araması, gerçek Primary Arch tanışıklıkları, taste önerileri,
  ortak maç sayısı/bar, Follow back ve follows-you durumları. 9a ile ortak kontrol.
- **Kabul:** 10'dan az ortak görünür maçta yeterli veri yok mesajı; oran uydurma.
  Ortak hesap DB'sindeki herkesi tanıdık sayma veya rehber içe aktarma yapma.
  Gerçek öneri yoksa sahte kişi gösterme. Arama yarışları, takip tutarlılığı,
  boş/hata/offline, erişilebilir hedef ve geri/odak davranışı doğrulanmalı.
- **Kaynak çelişkisi:** Kutudaki eski arch çizimi yerine onaylı Primary Arch
  marka sözleşmesi geçerli. Yeni bir marka tasarımı yapılmayacak.

Bu iki iş **aşama 9 (erişilebilirlik) değildir**. Özgün 39 prompt ve alıntıları
korunur; HTML genişlemeleri ayrı kabul kutularıyla aynı kayıt içinde takip edilir.

## Önceki devamda tamamlanan 6a davranışı

Ortak kaydetme yolu artık inline başarı satırı yerine `CollectibleResult` açıyor.
Kart 52 px crest ile ortak bileşeni kullanıyor; üç delta sunucu onayından geliyor.
Çevrimdışı kayıt onaylanmış puan/streak artışı göstermiyor. Edit, onaylı entry ID
ile aynı kayda dönüyor; kayıtlı rewatch düzenlemesi `PUT /diary/{entry_id}` kullanıyor.
Yeni rewatch'ın yanıtı belirsizse tekrar POST edilerek kopya oluşturulmuyor.

Share şu an **metin paylaşımı**; Skin pasif. Görsel export ve skin picker aşama 10.
Bu, 6a'nın nihai görsel kabulünün tamamlandığı iddiası değildir. Önceki HTML'de
`id="6a"` yoktu; güncel dosyada var. Mevcut davranış korunarak yeni kart-öncelikli
yerleşim ve toplam/değişim/collection gösterimiyle eşleştirilecek.
Gerçek cihazda dört ayrı rating girişinin tamamını dolaşma testi hâlâ gerekiyor.

## Bu devamda uygulanan: Standing `2p`

Kaynak: `RankIt Redesign.dc.html`, `id="2p"` (güncel kaynakta 3999. satır).
Uygulama: `frontend/src/rankit/redesign/Standing.jsx`; stil mevcut `rankit.css`
içinde. Altıncı stylesheet eklenmedi.

Kaynakla eşleşen parçalar: kesik köşeli 22 px rank kartı, 68° sheen, mor kart
gradyanı, 85 px sütun içinde 60 px karşı-döndürülmüş rank rozeti, rank ilerlemesi,
iki sütunlu dört “What counts” kutusu ve ayrı streak paneli. Bu ekrana özgü mor
gradyanlar HTML'den alınmıştır; uygulama geneline yeni palet olarak yayılmadı.

Profil kökü korunuyor. Redesign bayrağı açıkken profildeki rank/chevron girişi
Standing'i ayrı tam ekran açıyor. Geri/Escape ortak dialog altyapısını kullanıyor;
profildeki açıcı korunuyor. Sabit `gokdeniz` yedeği ve herkese gösterilen uydurma
biyografi kaldırıldı. **Bu değişiklik tam `6b` redesign'ı sayılmaz.** Önceki kaynakta
6b yoktu; 14 Eylül güncellemesiyle görsel kaynak engeli kalktı, uygulama işi açık.

### Veriye bağlı, belgelenmiş farklılıklar

- Mockup sayıları üretime taşınmadı. `/rank` tüm hesap defterini gruplayarak
  `breakdown` döndürüyor; son 50 ledger satırından toplam hesaplanmıyor.
- “Likes” HANDOFF §6.1'e göre respect. Kutu yalnız puan kazandırmış respect'leri
  saydığı için etiketi **Rewarded respects**. Bu, tüm sosyal respect sayısı değildir.
- Companion ödülü maç başına tutulduğu için etiket **Matches in Companion**;
  maç sayısı “nights” gibi sunulmuyor.
- Geçmiş ödüller A/B kurallarıyla değişebileceğinden sabit `×15/×2` yerine gerçekten
  kazanılmış toplam puan gösteriliyor. Toplam, dört görünür kategori dışında geç
  rating/collection gibi ödülleri de içerebilir; kutular toplam rank'ın tamamı değildir.
- Rank barı sunucunun mevcut kademe içi `progress` değerini kullanıyor. HTML'deki
  örnek 81% aynen kopyalanmadı; 2840 puan, 1750–3500 kademesinde yaklaşık 62% eder.
- Streak ayrı panelde gerçek current/best değerleriyle görünüyor. HTML'deki sekiz
  renkli gece bloğu **eksik**: API gece bazlı heat/geçmiş vermiyor, rastgele renk/sayı
  eklenmedi. Bu panelin tam görsel eşleşmesi henüz kapanmadı.
- `/rank?tz_offset=` telefonun yerel saat farkını alıyor; önceki sabit UTC kaldırıldı.
- Pushed ekranın geri kontrolü ve odak izolasyonu davranış sözleşmesinden geliyor.
  HTML'deki dekoratif cihaz kasası/status barı native ekrana kopyalanmadı.

## Doğrulama

- 21 Node testi: kayıt snapshot, delta/receipt, hesap izolasyonu, kısmi kuyruk ve rewatch.
- 30 izole Python testi: önceki 28'e ek, 65 ödülün 50 satırlık ledger sınırından
  bağımsız hesaplanması, başka hesabın hariç tutulması ve timezone sınırı/aktarımı.
- Standing hedefli ESLint temiz. Monolitin önceden belgelenen dört lint bulgusu
  bu pakette çözülmüş sayılmıyor.
- Mobil Vite build geçti, 1816 modül. Bu APK/native build değildir.
- Sentetik QA tarayıcı kontrolü: 320 px dış kabuk (iç Standing 316 px), gövde
  scrollWidth/clientWidth 312/312; yatay taşma yok. Geri hedefi 44 px; açılışta
  arka plan inert, kapanınca inert temizleniyor ve odak Open Standing'e dönüyor.
- Hata görünümü gözlemlendi: sunucu hatası sıfır istatistik üretmiyor, Retry sunuyor.
- Gerçek hesap/üretim DB'sine test verisi yazılmadı. `frontend/qa` sentetik veridir.
- Bilgi grafiği `Transport closed`; kaynak incelemesi ve testler kanıt sınırıdır.

## Açık işler / sıradaki karar

1. `6b` kökü uygulandı; tarayıcı/gerçek cihaz görsel kabulü açık. Kişisel Lists ve
   Your reviews bağlı; Hunt ve yeni 9a/9b geçişleri henüz tamamlanmadı.
2. Standing gece şeridi için gerçek gece bazlı veri sözleşmesi eksik.
3. 6a yeni görsel hizalaması, collection verisi, skin/image export ve cihaz kabulü eksik.
4. Diğer HTML ekranları sırayla karşılaştırılacak; yeni aşamalar topluca birleştirilmeyecek.
5. API/frontend sözleşme değişiklikleri birlikte yayınlanmalı. Migration eklenmedi.
6. Tüm aşamalar ve cihaz kabulü bitene kadar APK **üretilmeyecek**.

## 14 Eylül — Prompt 7.01 / 6b uygulama kaydı

- Yeni `redesign/ProfileRoot.jsx`, güncel HTML #6b'yi uygular. Redesign bayrağı
  kapalıyken eski ProfileView korunur. Profilde ikinci marka başlığı görünmez.
- Kaynaktan kimlik düzeni, 64px başlık/avatar, 52/37px rank rozeti, mor materyal,
  watched/classics/streak sayaçları, üç kartlı shelf ve 52px bağlantı satırları alındı.
- Rafta en son üç **farklı maç** gösterilir; rewatch'ın entry ID'si maç ID'si gibi
  açılmaz. Heat kişisel rating olarak etiketli kalır. 320px'te crest, sütunun gerçek
  genişliğine göre 30px altına iner; 375px'te kaynak ölçüsü korunur.
- Belgelenen uyarlama: üçlü rafın 167px yüksekliğinde basketbolun alt alta skorlarını
  korumak için yalnız `profileShelf` preset'inde iç boşluklar kısaldı ve tekrar eden
  status satırı kaldırıldı. Diğer altı preset etkilenmez. All bağlantısı, aynı bölgedeki
  Classic altın vurgusuyla yarışmaması için nötr bırakıldı. Bunlar tarayıcıda onay bekler.
- `/profile` geriye uyumlu olarak following_people, followers, reviews ve owned_lists
  ekler; eski following alanı korunur. Kişiler kulüp/turnuva takibiyle karıştırılmaz.
  Kişisel listeler, yalnız public listeler döndüren `/lists` üzerinden tahmin edilmez.
- Your reviews, tüm kişisel diary yanıtındaki gerçek yazılı yorumları açar;
  private kayıtlar sahibine görünür, spoiler metni açılana kadar render edilmez.
  Review thread mevcut bileşene aynı entry ID ile bağlanır. Bu, 5c'nin maç kapsamına
  yanlış yönlendirme değildir; tam görsel review-list kabulü ayrıca açıktır.
- Shelf All → Activity / Diary / Cards; list/detail ve Standing geçişleri bağlandı.
  Kaydetme/liste oluşturma sonrası profil sorguları yenilenir.
- Mobil eski hesap düğmesi 6b kontrollerinin üstüne binmemesi için yalnız profil
  açıkken gizlenir; aynı Sign in/Log out eylemi Settings içinde erişilebilir tutulur.
  Bu, kaynakta olmayan yeni hesap işlevi değil, mevcut işlevi koruma uyarlamasıdır.
- **Açık hedefler:** 9a/9b henüz yapılmadı; Following/Followers salt sayı, Find people
  mevcut Search'i açıyor. Hunt açıkça Coming soon/devre dışı. Kullanıcıya açıklama var;
  örnek koleksiyon ya da sahte tanıdık üretilmedi.

### Bu adımın doğrulaması

- `node --test tests/rankit-state.test.mjs tests/rankit-collectible.test.mjs tests/profileState.test.js`:
  **25 geçti**. Yeni dört test: rewatch ayırımı, kişisel yorumlar, 320–520px crest
  geometrisi ve geçerli/eksik üyelik tarihi. Geometri testi görsel test değildir.
- `python -m pytest tests/test_rankit_social.py -q -p no:cacheprovider`: **31 geçti**;
  geçici SQLite DB, gerçek hesaba yazma yok. Profilin karma takip sayımı, private
  listeler, yabancı veri izolasyonu, boş profil ve review sayımı kapsandı.
- Yeni ProfileRoot/profileState hedefli ESLint temiz. Monolitin önceki dört
  lint hatası sürüyor (yorum effect'i, arama effect'i, carousel ref'i, ilk refresh).
- Mobil **web** build geçti (1818 modül); Android sync/build ve APK yapılmadı.
- Tarayıcı kontrolü araç izin servisinin kota hatasıyla reddedildi. Başka tarayıcı
  veya dolaylı otomasyonla aşılmadı. 6b ekran görüntüsü, odak/Back, native başlık ve
  320px/büyük font görsel testleri **doğrulanmadı**. QA fixture'ına profil senaryosu eklendi.
- Bilgi grafiği bu adımda erişilebildi (09:01 ve 09:19 nesilleri); değişmiş metadata
  ve RankItPrototype 967. satır parse boşluğu için doğrudan kaynak okundu.

## 15 Eylül — HTML-9A uygulama ve doğrulama kaydı

**Kaynak:** Güncel `RankIt Redesign.dc.html` #t9 ve #9a. Özgün prompt 9 değildir.
Görsel kaynak değiştirilmedi; referanstaki örnek kişi/istatistikler gerçek uygulamaya kopyalanmadı.

**Uygulanan:** `PeopleList.jsx`, `RelationshipButton.jsx`, `relationshipState.js`,
`useRelationshipRevision.js`. ProfileRoot sayaçları seçili sekmeyle açar; liste
içinde arama, Closest taste sırası, Load more ve kişiden MemberProfile'a geçiş var.
Satır ve profil FOLLOW / FOLLOWING / FOLLOW BACK / MUTUAL kontrolünü paylaşır.
Takip onayı listeyi ve profil sayaçlarını yeniler; istek sırasında düğme kilitlenir,
hata sahte onay üretmez. Liste içindeki üyeden geri dönüş listeyi/sayfayı korur.
Üyenin rafından maç açılması mevcut kabuğa devredilir; bu yolun geri hedefi ayrıca
9a/9b gezinme kabulünde test edilecek.

**API:** Oturum gerektiren GET /people ve idempotent PUT /people/{id}/follow.
Liste sahibi istemciden alınmaz. Kulüp/kaynak takipleri, kendisi ve engellenmiş
hesaplar kişi toplamına girmez; profil sayacı aynı kapsama getirildi. Görünür
public/followers kayıtları kullanılır; karşı kişinin private kayıtları dışarıda.
İzleyenin kendi özel puanı, yalnız kendi karşılaştırmasında kullanılabilir.
Maç başına son görünür, puanlı kayıt hesaplanır; rewatch örneklemi çoğaltmaz.
3i'deki mevcut yarım yıldız toleransı korunur; ortak örneklem eşiği 5 → 10.
CTE sıralaması pagination'dan önce; kişi başına profil isteği yok.

**Önbellek kararı:** Kişi listesi ve üye detayı kalıcı offline cache'den okunmaz;
takip bırakınca followers-only verinin eski disk kopyası yeniden sunulmaz. Aynı
oturumda yüklenmiş satırlar sonraki sayfa isteği hata verince kalabilir; ilk
yüklenecek içerik yoksa açık reconnect mesajı gösterilir. Diğer ekranların
önbellek davranışı değişmedi. Üye istekleri hesap/kimlik/ilişki anahtarına bağlı;
eski yanıt yeni üye profilini ezmez.

**Doğrulama:**

- 43/43 `tests/test_rankit_social.py`: hesap/ilişki kapsamı, literal arama,
  geçersiz filtreler, auth/self/missing/banned, idempotent yazma ve tek bildirim,
  pagination öncesi sıralama, 9/10 eşik, gizli rewatch ve unfollow görünürlüğü.
- 27/27 Node: mevcut state/collectible/profile testleri ve yeni ilişki/eşik testleri.
- Değişen sosyal UI/API istemcisi ve QA dosyalarında hedefli ESLint temiz.
  Önceden kaydedilen monolit genel lint açıkları bu sonuçla kapanmış sayılmaz.
- Mobil web Vite build başarılı; Android sync veya APK üretimi yapılmadı.
- Sentetik QA'da 320 ve 390px genişlik: yatay taşma yok, ölçülen düğmeler >=44px.
  30 → 33 satır sayfalaması, dokuz ortak maçta yüzde olmaması, liste→3i→Escape
  ile aynı satıra odak dönüşü, Follow back hata/tekrar deneme, Mutual'ın listede
  ve profilde eşleşmesi, Following 33 → 34 ve ana profil sayacı doğrulandı.
  Boş arama ile offline hata ayrıldı; ikinci Escape profil açan sayaca odak verdi.
- QA kabuğunun root-scroll kaynaklı başlık kayması düzeltildi. HMR sırasında
  QA createRoot tekrar uyarısı görüldü; test girişinde root yeniden kullanımı
  eklendi. Sentetik fixture üretimden import edilmez, gerçek hesaba yazmaz.

**Açık kabul:** #9a alt TabBar farkı ve #9b Find people hedefi; native cihaz,
metin büyütme/safe-area, gerçek iki hesaplı HTTP+UI kabulü. Bu kayıt tam UI onayı
değildir. Tarayıcı erişimi önce kota/izin zaman aşımıyla durdu; 15 Eylül normal
izin denemesi başarılı olduktan sonra yukarıdaki sınırlı kontroller tamamlandı.
Commit, push, deploy, APK yok.

## Canlı prompt takip çizelgesi

Bu bölüm bundan sonraki çalışmanın kontrol noktasıdır. Tarihli üst bölümler geçmişi
korur; buradaki durumlar her iş sonunda güncellenir. **Bir promptun kodunun bulunması,
promptun kapanması değildir.** Tek bir toplam tamamlanma yüzdesi kullanılmaz.

- **Aktif madde:** HTML-9A — Following / Followers, işlevsel kontroller tamam; entegrasyon kabulü açık.
- **Son adım:** 6b sayaçları → 9a → 3i çalışıyor. Ortak dört durumlu takip kontrolü,
  gerçek listeler/sıralama/sayfalama ve on ortak maç eşiği uygulandı.
  43 Python ve 27 Node testi; 320/390px sentetik tarayıcı kontrolleri aşağıda.
- **Sıradaki alt iş:** HTML-9B — Find people; önce güncel #9b veri/görünüm kontrolü,
  sonra 6b/9a girişleri ve ortak alt gezinme bağlantısı. 9A'nın TabBar farkı
  bu ortak entegrasyonda kapanacak; 7.01 ve HTML-9A henüz tamamlandı sayılmayacak.
- **Önceki açıklar:** 1–6'nın kalan kabul kontrolleri açık; 7'de çalışıyor olmak bunları
  geriye dönük tamamlandı yapmaz. 8–9'un altyapısı hata düzeltmeleri için önden yapıldı.
- **Yürütme sırası:** 7.01 profil → HTML-9A → HTML-9B → 6a'nın yeni görsel farkları
  → 7.02 → 7.03 → … → 7.11, sonra 8–9 kapanışı ve 10'dan devam.
  Bir madde kaynak/veri nedeniyle bekletilecekse nedeni ve geçilen madde burada yazılır;
  sessizce atlanmaz, yeni uygulama aşamaları topluca birleştirilmez.
- **Son kapı:** 14 kapanmadan APK yok. Bu çizelge commit/push/deploy yetkisi vermez.

### İşaretleme kuralı

Kullanıcının son çalışma kuralı: **her aşamadan önce** aktif prompt/HTML-ek kimliği,
mevcut durum, yapılacak iş ve doğrulama yöntemi açıklanır. Aşama sonunda yapılan,
test sonucu, kalan ve sonraki madde bildirilir; sessiz aşama geçişi yapılmaz.

Her numaranın altındaki **Prompt kabulü** kutusu yalnız tüm istenen davranış,
görsel kaynak karşılaştırması ve o maddeye ait testler tamamlandığında işaretlenir.
“Yapılan” ve “Kalan / kabul” ayrı tutulur. Kapanışa tarih, ilgili dosyalar, test
komutu/sonucu ve varsa görsel kanıt eklenir. Yeni bulguda kutu yeniden açılabilir.
Aşağıdaki kaynak/kanıt referansları önceki kontrolleri gösterir; bu belge düzenlenirken
uygulama testleri yeniden çalıştırılmadı.

Prompt metinleri kullanıcı ekinden **aynen**, blok alıntı olarak taşındı.
7.xx / 10.x / 13.x.x son ekleri yalnız takip kimliğidir; yeni aşama eklemez.
Kullanıcı eki 39 ayrı prompt bloğu içeriyor; aşağıda 39'unun tamamı yer alır.
Kaynak içindeki eski dosya yolları ve numaralar düzeltilmeden korunmuştur:
gerçek HTML/HANDOFF yolu `Primary Arch UI Redesign/` altındadır.
Örneğin 4. prompttaki reviews→phase6 atfı eski kalmıştır; güncel karşılığı 7.02'dir.

### Kaynak çelişkileri — sessizce yorumlama

- “Seven skins” denmesine rağmen sekiz ad var: sekiz seçenek ve 16 boyut/skin durumu korunur.
- Dört motion süresine karşı livedot 1400ms açık istisnadır.
- Social: replies açık, respects kapalı; genel “only Heat on” ifadesi bu ayrımı silmez.
- 6a–6d görsel kaynak eksiği 14 Eylül dosyasıyla çözüldü; uygulama kabulü hâlâ açık.
- 6b'deki Your reviews→5c işareti görsel aileyi gösterir: kişisel yorumlar mevcut
  maç-özel listeye körlemesine bağlanamaz; hesap kapsamı ayrıca sağlanmalı.
- 9b'deki Primary Arch kutusu eski arch önerisini içeriyor; HANDOFF §8.2'de geri
  çekilen şekil marka yerine taşınmayacak. Mevcut 12-gen ve onaylı rule inset korunur.
- 9a/9b'nin küçük görsel düğmeleri en az 44px dokunma alanıyla uygulanmalı.
- Kilit koşulları, midnight / 11:00 gün sınırı gibi kaynaklarda farklı anlatılan ürün
  kuralları ilgili aşamada açıkça uzlaştırılmalı; bu kayıt yeni kural koymaz.
- HTML'deki örnek sayılar gerçek hesap verisi değildir. Mevcut sistemden sapma
  gerekiyorsa gerekçe kaydedilir; yeni görünüm/ürün kuralı için kullanıcıya dönülür.

### 0 — İnceleme

> Read `HANDOFF.md` top to bottom before writing anything. Then read `frontend/src/rankit/DESIGN.md` and tell me, in a short list, where the two disagree. Do not change any files yet.

**Durum:** Kapandı.

- [x] Prompt kabulü — önceki inceleme kaydı mevcut.
- **Yapılan:** HANDOFF, DESIGN ve HTML karşılaştırıldı; eski/yeni sıra ayrımı belgelendi.
- **Kalan / kabul:** 14 Eylül kaynak fark incelemesi aşağıda yenilendi; yeni ekranların uygulama/görsel kabulü ayrı maddelerdir.
- **Kaynak / kanıt:** docs/RANKIT_REDESIGN_REVIEW_2026-09-12.md; bu kaydın Kaynak bölümü.

### 1 — Ortak MatchCard

> Build `MatchCard` per `HANDOFF.md` §2. Do not touch any screen. Render it in isolation at all six size presets from §2.5 plus compact mode from §2.6, and show me each one. Pay attention to §2.1 (the notch hairline is what turns gold, not the border), §2.7 (crest at 62% of the shield, counter-rotated), and §2.8 (prop coercion — `"false"` must read as false).

**Durum:** Kısmi.

- [ ] Prompt kabulü.
- **Yapılan:** Ortak kart, notch/arma/kompakt düzen ve spoiler düzeltmeleri; altı basketbol preset kontrolü.
- **Kalan / kabul:** Futbol uzun adları, bütün durumlar ve büyük font ile altı preset kabulü.
- **Kaynak / kanıt:** MatchCard.jsx; toMatchCardProps.js; frontend/qa/rankit.jsx.

### 2 — Home, geçiş bayrağı

> Replace the home hero card with `MatchCard` behind a `RANKIT_NEW_CARD` flag. The old path must still work with the flag off. Match screen `2a` on the board — header 64px, nav 73px, streak ring in the header, spoiler shield beside it.

**Durum:** Kısmi.

- [ ] Prompt kabulü.
- **Yapılan:** Home yeni MatchCard yoluna bağlı; flag-off yolu korunuyor.
- **Kalan / kabul:** 2a/2b görsel karşılaştırması; flag açık/kapalı, header/streak/shield cihaz kontrolü.
- **Kaynak / kanıt:** RankItPrototype.jsx HomeView; redesign/flags.js.

### 3 — Diary, Discover ve Hunt girişi

> Move the diary shelf (`2e`) and the discover grid (`2c`) onto `MatchCard` in compact mode. Apply §4.1 exactly: `minmax(0, 1fr)` never bare `1fr`, and `min-width: 0` on every card wrapper *and* every `nowrap` row inside the card. Discover also gets the Hunt tile at the top of the scroll, above the community grid — see §4.9.5.

**Durum:** Kısmi.

- [ ] Prompt kabulü.
- **Yapılan:** Kompakt kartlar, grid taşması ve kişisel rating anlamı düzeltildi.
- **Kalan / kabul:** Discover üst Hunt tile ve 2m/2n akışı; tüm kart sarmalayıcılarının kabulü.
- **Kaynak / kanıt:** RankItPrototype.jsx ActivityView/DiscoverView; diaryToMatchCardProps.

### 4 — Match sheet

> Rebuild the match sheet's three tabs: Match (`2f`), Community (`2g`), Companion (`5a` before kick-off, `5b` live). The third tab was called Watchalong — it is retired; the tab is Companion and its badge is state-driven per §4.9.6. Collapse Community from nine blocks to three per `2g`. The Community tab's "318 reviews ›" must link somewhere — it goes to the list you build in phase 6.

**Durum:** Kısmi.

- [ ] Prompt kabulü.
- **Yapılan:** Match/Community/Companion, reviews ve thread bağlantıları; terminal sohbet koruması mevcut.
- **Kalan / kabul:** 2f/2g/2h ve 5a/5b HTML yerleşim kabulü; açık ekranın durum geçişleri.
- **Kaynak / kanıt:** RankItPrototype.jsx MatchDetail; CompanionPanel.jsx.

### 5 — Shell

> Header 64 / nav 73, gold active state on the nav, and the `RANK` diamond opens the quick-rate sheet (`3j`). Nav diamond is chrome and exempt from the one-gold-per-region budget (§1).

**Durum:** Kısmi.

- [ ] Prompt kabulü.
- **Yapılan:** Alt navigasyon, Rank→quick-rate ve shell mevcut.
- **Kalan / kabul:** 64/73 ölçüleri, safe-area, aktif altın bütçesi ve tüm cihaz navigasyon kabulü.
- **Kaynak / kanıt:** RankItPrototype.jsx; mevcut beş stylesheet.

### 6 — Collectible sonucu 6a

> Build `6a` per §4.9.1. Every path that produces a rating resolves here: the match sheet, quick-rate `3j`, the live companion `5b`, and the first rating in first-run. It is a result screen, not a celebration — no confetti, no sound, no modal to dismiss. Card at `--crest:52px`, one-line statement, three deltas, then Share / Skin / Edit. Gold appears once.

**Durum:** Kısmi.

- [ ] Prompt kabulü.
- **Yapılan:** Ortak sonuç, onaylı deltalar, offline durum, aynı entry ID ile rewatch düzenlemesi uygulandı.
- **Kalan / kabul:** Güncel #6a kart-öncelikli yerleşim; toplam streak/puan ve collection ilerlemesi + gerçek deltalar; dört rating girişini dolaş. Skin/image export 10'a bağlı.
- **Kaynak / kanıt:** CollectibleResult.jsx; collectibleState.js; 21 Node/30 Python testinin ilgili alt kümesi.

### 7.01 — Profile 6b → Standing 2p

> Build `6b`, the Profile tab root, per §4.9.2. Identity, rank block with a chevron, three counters, shelf preview, then rows to Lists / The Hunt / Your reviews. Then make `2p` (Standing) a pushed detail screen reached from that chevron — it is currently acting as the tab root, which is the bug.

**Durum:** AKTİF / Kısmi.

- [ ] Prompt kabulü.
- **Yapılan:** 2p materyali/gerçek toplamlar; 6b You başlığı, kimlik, kişi sayaçları, rank özeti, watched/classics/streak ve üçlü shelf; kendi Lists ve Your reviews geçişleri. Settings/native hesap kontrolü korundu.
- **Kalan / kabul:** 6b tam görsel ve büyük font/safe-area/Android Back kabulü; Standing gece verisi. Hunt etkin değil; 9a/9b ayrı HTML-ek işleridir. Following/Followers artık 9a'yı açar; Find people mevcut Search'e gider.
- **Kaynak / kanıt:** ProfileRoot.jsx; profileState.js; Standing.jsx; api/rankit.py rankit_profile/rankit_rank_view; HTML #6b/#2p; aşağıdaki uygulama kaydı.

### 7.02 — Tüm yorumlar 5c

> Build the all-reviews list per `5c`. Sort defaults to most-respected, people I follow pin above everyone else, and it is what the Community tab's "318 reviews ›" links to.

**Durum:** Uygulama mevcut / Kabul açık.

- [ ] Prompt kabulü.
- **Yapılan:** Most respected, takip edilenler önceliği, 60+6 sayfalama ve thread bağlantısı mevcut.
- **Kalan / kabul:** 5c ile son görsel karşılaştırma; gerçek hesap/follow durumları ve bütün sıralamalar.
- **Kaynak / kanıt:** AllReviews.jsx; tests/test_rankit_social.py.

### 7.03 — Yorum thread 4a

> Build the review thread per `4a` and §6.1. Replies are addressed — each opens with the handle it answers, generated by the reply action not typed. Nesting is one level only. Respect replaces likes: the RankIt diamond, outline when unspent, solid ink when given, never gold, never animated.

**Durum:** Uygulama mevcut / Kabul açık.

- [ ] Prompt kabulü.
- **Yapılan:** Adresli yanıt, respect, spoiler kapısı ve nested dialog düzeltmeleri mevcut.
- **Kalan / kabul:** 4a son görsel kontrolü; bir seviye yanıt ve respect davranışının gerçek hesap kabulü.
- **Kaynak / kanıt:** ReviewThread.jsx; useDialog.js.

### 7.04 — Turnuva Matches ve Players

> Build competition Matches (`3c`) and Players (`3d`).

**Durum:** Uygulama mevcut / Kabul açık.

- [ ] Prompt kabulü.
- **Yapılan:** 3c/3d bileşenleri bağlı; loading/error/empty ayrımı mevcut.
- **Kalan / kabul:** HTML karşılaştırması; uzun isim, tablo ve gerçek sağlayıcı verisi durumları.
- **Kaynak / kanıt:** CompetitionMatches.jsx; CompetitionPlayers.jsx.

### 7.05 — Arama 3e

> Build search (`3e`).

**Durum:** Uygulama mevcut / Kabul açık.

- [ ] Prompt kabulü.
- **Yapılan:** Yeni SearchSheet, spoiler güvenliği ve hata/başarı testleri mevcut.
- **Kalan / kabul:** 3e geometri, klavye/safe-area ve tüm sonuç tiplerinin navigasyon kabulü.
- **Kaynak / kanıt:** SearchSheet.jsx; sentetik tarayıcı QA.

### 7.06 — Bildirim ekranı 3f

> Build notifications (`3f`).

**Durum:** Uygulama mevcut / Kabul açık.

- [ ] Prompt kabulü.
- **Yapılan:** Alerts ekranı ve olay/durum ayrımı mevcut.
- **Kalan / kabul:** 3f görsel kontrolü, bütün bildirim hedefleri; native kanallar 13.3'e bağlı.
- **Kaynak / kanıt:** Alerts.jsx.

### 7.07 — Ayarlar 3g

> Build settings (`3g`).

**Durum:** Uygulama mevcut / Kabul açık.

- [ ] Prompt kabulü.
- **Yapılan:** Gruplu Settings ve hesap/cihaz tercih ayrımı mevcut.
- **Kalan / kabul:** 3g karşılaştırması; tercih kalıcılığı ve gerçek izinler. Kanal entegrasyonu 13.3'te.
- **Kaynak / kanıt:** Settings.jsx; rankitPrefs.js.

### 7.08 — Lists 3h ve üye profili 3i

> Build lists (`3h`) and another user's profile (`3i`).

**Durum:** Uygulama mevcut / Kabul açık.

- [ ] Prompt kabulü.
- **Yapılan:** ListShelf/MemberProfile ve görünürlük testleri mevcut.
- **Kalan / kabul:** İki ekranın görsel kabulü, owner/friend/stranger navigasyonu. Genel listeyi Your Lists diye etiketleme.
- **Kaynak / kanıt:** ListShelf.jsx; MemberProfile.jsx; tests/test_rankit_social.py.

### 7.09 — İlk giriş 4g → 4h → 2r

> Build first run as three steps per §4.9.3: `4g` connect Primary Arch → `4h` pick competitions and clubs → `2r` the one-promise screen. The first rating after that lands in `6a`.

**Durum:** Kısmi.

- [ ] Prompt kabulü.
- **Yapılan:** ConnectScreen ve FollowPicker bağlı.
- **Kalan / kabul:** 2r one-promise adımını bağla; ilk rating→6a; hesap/cihaz tekrar giriş testi.
- **Kaynak / kanıt:** FirstRun.jsx; RankItMobileApp.jsx.

### 7.10 — Genişletilmiş Companion 4e/4f

> Build the expanded companion views `4e` and `4f`, reached by the expand control in the sheet header per §4.9.4. Do not build `2o` — it is superseded.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Sheet içindeki Companion altyapısı var; genişletilmiş yüzey yerine geçmiyor.
- **Kalan / kabul:** HTML 4e/4f ve expand bağlantısı; 2o yapılmayacak.
- **Kaynak / kanıt:** CompanionPanel.jsx; HTML #4e/#4f.

### 7.11 — Maç-sonu Companion 6d

> Build the after-full-time companion per `6d` and §4.9.4. This is a **distinct screen**, not the live one with the pulse dot removed: the chart becomes the record of the night with the peak minute marked, three read-only stats replace the live read, the room closes with the thread left readable, and the primary action becomes "Rate it" pre-seeded with the user's live read. The live read is explicitly **not** a rating — nothing is logged until confirmed. The badge drops.

**Durum:** Kısmi altyapı.

- [ ] Prompt kabulü.
- **Yapılan:** Maç bitince oda sunucuda ve istemcide yazmaya kapanıyor; geçmiş okunuyor.
- **Kalan / kabul:** Güncel #6d ile ayrı kayıt ekranı; gerçek peak/chart, loudest minute/pulse rise/messages kept, okunur thread ve live-read ön seçimli Rate it; basketbol dönem uyarlaması.
- **Kaynak / kanıt:** CompanionPanel.jsx; api/rankit.py; HANDOFF §4.9.4.

### 8 — Loading, empty, offline

> Implement loading, empty, and offline per §5 and screens `3k`/`3l`. Skeletons only — no spinners. The skeleton keeps the notches, both crest columns, the score block and the five heat bars, so nothing shifts when data lands. Empty names one action and stops: no sample fixtures, no suggested friends. Offline dims cached cards to 62% rather than hiding them and promises the local rating will upload.

**Durum:** Kısmi.

- [ ] Prompt kabulü.
- **Yapılan:** Skeleton/hata/boş ayrımı, hesap bazlı kuyruk, kısmi kayıt ve cached içerik korumaları uygulandı.
- **Kalan / kabul:** Bütün yüzeylerde cached/no-cache, offline yeniden açılış ve layout-shift kabul matrisi.
- **Kaynak / kanıt:** States.jsx; useResource.js; ratingQueue.js; rankitOutbox.js.

### 9 — Sheet erişilebilirliği

> Every bottom sheet gets `role="dialog"`, `aria-modal="true"`, Escape to close, focus trapped inside, and focus restored to the opener on close. Keep the drag handle. This is §4.2 and it is not cosmetic — the sheets are currently plain `div`s.

**Durum:** Kısmi.

- [ ] Prompt kabulü.
- **Yapılan:** Ortak dialog, focus trap/restore, nested kapanma, inert ve ortak Back altyapısı düzeltildi.
- **Kalan / kabul:** Bütün sheet'lerde drag/klavye; gerçek Android Back, TalkBack ve büyük font kabulü.
- **Kaynak / kanıt:** useDialog.js; backStack.js; önceki tarayıcı kontrolleri.

### 10.1 — Skin picker 2j

> Build the skin picker per `2j`. Seven skins: Default, Broadsheet, Holofoil, Ember, Ink, Gilt, plus locked Turf and Floodlight. A skin paints **the collectible and its share image only** — app chrome never inherits one, so Broadsheet stays a cream *card*, not a light theme. Locked skins show their unlock condition, not a paywall.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** 6a üzerinde Skin şu an pasif; picker tamamlanmış değil.
- **Kalan / kabul:** Sekiz adın tamamı; Turf/Floodlight gerçek kilit koşulları; chrome tema değiştirmeyecek.
- **Kaynak / kanıt:** HTML #2j; HANDOFF skin sayısı düzeltmesi.

### 10.2 — Ortak skin değişkenleri

> Wire each skin through `MatchCard` as CSS custom properties, not as seven components. Every skin defines the same contract: `--card-bg`, `--card-ink`, `--card-eyebrow`, `--card-notch`, `--card-sheen`. Verify all seven render correctly at shelf size (`--crest:30px`, compact) and at hero size (`--crest:62px`) — that's fourteen states and the shelf ones are where they break.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** MatchCard temeli mevcut; tam sekiz-skin sözleşmesi kabul edilmedi.
- **Kalan / kabul:** Aynı CSS değişkenleriyle sekiz skin × shelf/hero = 16 durum; sekiz ayrı komponent yapma.
- **Kaynak / kanıt:** MatchCard.jsx; HTML #4d.

### 10.3 — Share composer 2k/2l

> Build the share composer per `2k` (portrait 4:5) and `2l` (wide 16:9). Portrait is the default because that's what gets sent; wide exists because the collectible's native geometry is horizontal. Both carry the Classic stamp when stamped, rotated −9°, and the RankIt wordmark. Export at 2× device pixel ratio.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** 6a yalnız metin paylaşabiliyor.
- **Kalan / kabul:** 4:5 varsayılan, 16:9 alternatif; Classic −9°, wordmark, 2×DPR export ve spoiler kontrolü.
- **Kaynak / kanıt:** HTML #2k/#2l; collectibleShareText.

### 11.1 — RankIt işaret/wordmark ve LogoMono

> Add the RankIt mark and wordmark per §8.1 — chamfered card silhouette with the star knocked out via SVG mask, `RANK` in ink and `IT` in gold. Then add `LogoMono` to `BrandIcons.jsx` exactly as written in §8.2. Pass a unique `id` per instance; duplicate mask ids collide.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Eski marka bileşenleri mevcut; yeni prompt karşılığı tamamlanmadı.
- **Kalan / kabul:** HTML 4i / §8.1–8.2; mask knockout, benzersiz ID ve küçük boyut kontrolü.
- **Kaynak / kanıt:** RankItPrototype.jsx RankItMark; components/BrandIcons.jsx.

### 11.2 — Primary Arch rule inset

> Apply the one approved change to the Primary Arch mark in `BrandIcons.jsx`: the rule becomes `<path d="M 6 24 H 42" />`, inset one unit from `M 4 24 H 44`. Nothing else about that logo changes — it is used verbatim.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Mevcut path hâlâ M 4 24 H 44.
- **Kalan / kabul:** Yalnız onaylı path'i M 6 24 H 42 yap; başka logo değişikliği yok.
- **Kaynak / kanıt:** components/BrandIcons.jsx.

### 12 — Android launcher

> `mipmap-anydpi-v26/ic_launcher.xml` points its foreground at `@mipmap/ic_launcher_foreground`, which is the stock Android bugdroid, over a white background — so the app currently installs with the default Android icon. Repoint it at the RankIt mark, change `ic_launcher_background` off `#FFFFFF`, and fix the round variant too. Draw the icon at 108, do not scale from 48. See §8.0.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Adaptive/round XML hâlâ mipmap foreground ve beyaz background referanslıyor.
- **Kalan / kabul:** 108 grid çizimi, doğru foreground/background/round; APK üretimi final kabulden sonra.
- **Kaynak / kanıt:** frontend/android/app/src/main/res.

### 12.5 — Discover filter drawer 6c

> Build the Discover filter drawer per `6c` — 288px wide, max 85%, pushed over the dimmed grid from the left, with 48px filter pills and a minimum-heat slider. It is a **separate surface** from `2c`: `2c` is Discover at rest with the Hunt tile visible, `6c` is the drawer over it. Both need to exist — building only the drawer state is what hid the Hunt tile in the mockups.

**Durum:** Bekliyor / Eski filtre var.

- [ ] Prompt kabulü.
- **Yapılan:** Mevcut filtre altyapısı yeni drawer'ın tamamlandığı anlamına gelmiyor.
- **Kalan / kabul:** 288px/max85%, soldan açılış, 48px pills, tüm katalogda minimum heat; 2c Hunt görünür kalmalı.
- **Kaynak / kanıt:** HTML #2c; yeni prompt 6c; rankit-filter.css.

### 13.1.1 — Motion süreleri ve eğri

> Implement the motion system per `HANDOFF.md` §10.1. Four durations only — 120ms for state changes, 200ms for sheets and nav, 280ms for the collectible reveal, 2600ms for ambient loops. One house curve for entrances: `cubic-bezier(.22, .9, .3, 1)`. Linear only for ambient loops. Do not introduce a fifth duration or a second curve.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Eski hareket stilleri var; yeni sözleşme bütünü uygulanmadı.
- **Kalan / kabul:** 120/200/280/2600ms, tek giriş eğrisi; livedot 1400ms açık istisnasını koru.
- **Kaynak / kanıt:** HANDOFF §10.1; rankit-motion.css.

### 13.1.2 — 6a kart gelişi

> The one hero moment is the card arriving on `6a`: it scales from `0.96` to `1` over 280ms, and the notch hairlines draw *after* the card settles, 120ms later. That's the whole animation — it is a result screen, not a celebration, so no confetti, no bounce, no overshoot.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Collectible sonuç ekranı var; onaylı reveal hareketi henüz yok.
- **Kalan / kabul:** 0.96→1 / 280ms, ardından120ms notch; bounce/confetti/ses yok.
- **Kaynak / kanıt:** CollectibleResult.jsx.

### 13.1.3 — Animasyon yasakları ve ambient

> **Never animate:** the heat bars filling (it misreads as live data arriving), the respect diamond (§6.1 — respect is never animated), anything gold, and the score. The two existing ambient loops stay as they are: `ember` at 2.6s on the top heat bar only, `livedot` at 1.4s on live indicators only.

**Durum:** Kısmi denetim.

- [ ] Prompt kabulü.
- **Yapılan:** Heat/respect/score kuralları kayda geçirildi; tam uygulama taraması kapanmadı.
- **Kalan / kabul:** Heat dolumu, score, respect ve gold animasyonunu tara; ember/livedot dışına ambient ekleme.
- **Kaynak / kanıt:** HANDOFF §10.1; mevcut stiller.

### 13.1.4 — Reduced motion

> Every animation sits behind `prefers-reduced-motion: reduce`. Under reduced motion, ambient loops stop entirely and transform-based transitions become opacity-only — nothing simply gets faster.

**Durum:** Kısmi altyapı.

- [ ] Prompt kabulü.
- **Yapılan:** Bazı mevcut reduced-motion kuralları var.
- **Kalan / kabul:** Tüm loops duracak; transform geçişleri opacity-only olacak. Yalnız hızlandırmak yeterli değil.
- **Kaynak / kanıt:** Mevcut motion/stil dosyaları.

### 13.2 — Haptics

> Add haptics via the Capacitor Haptics plugin. The rule is that **haptics mark commitment, never navigation** — so nothing fires on scroll, tab change, sheet open, or back. Map exactly this and nothing more:
>
> - Star tap and half-star tap → `selection`
> - Respect given → `impact: light`
> - Classic stamp → `impact: medium` (the one weighty act in the app)
> - Log saved → `notification: success`
> - Failed save or offline write queued → `notification: warning`
>
> Haptics are independent of `prefers-reduced-motion` — a user who disables animation has not asked for silence in their hand. They follow the OS haptics setting only.

**Durum:** Kısmi altyapı.

- [ ] Prompt kabulü.
- **Yapılan:** rankitHaptics ve kayıt geri bildirimi var.
- **Kalan / kabul:** Prompttaki beş eşlemeyi birebir doğrula; navigation'da haptic yok; OS ayarına uy.
- **Kaynak / kanıt:** rankitHaptics.js; gerçek cihaz testi.

### 13.3.1 — Android bildirim kanalları

> Build four Android notification channels: **Heat alerts**, **Streak**, **Social**, **Collections**. Only Heat alerts is on at install; Streak and Collections default off, Social defaults on for replies to you and off for respect. `3g` already exposes Heat alerts and Streak — wire those toggles to the real channels.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Bildirim ekranı var; dört native kanal tamamlanmış değil.
- **Kalan / kabul:** Heat/Streak/Social/Collections; replies on/respects off ayrımı, OS izinleri ve Settings bağlantısı.
- **Kaynak / kanıt:** HANDOFF §10.3; Settings.jsx.

### 13.3.2 — Bildirim spoiler kuralı

> **The spoiler rule is absolute and it is the hard part.** A notification about a match the user has not rated must never contain the score, the heat value, or a star count. "Arsenal vs Tottenham is running hot" is correct. "Arsenal 3–1 Tottenham hit 4.6" is a bug, even though the data is right there. If the user has the spoiler shield on, also strip the club names from the lock screen and send "A match on your watchlist is running hot."

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Uygulama içi spoiler korumaları var; tüm notification payload kabulü yok.
- **Kalan / kabul:** Unrated maçta score/heat/star yok; shield açık lockscreen'de takım adları da yok.
- **Kaynak / kanıt:** HANDOFF §10.3; son payload denetimi.

### 13.3.3 — Bildirim koşulu/zamanlaması

> Copy and timing per channel: Heat alerts fire only for a match the user **can still watch** and only when it crosses 4.0. Streak fires once at 22:00 and only if the user actually watched something that day — never a guilt reminder on a day with no football. Collections fire when a collection is one match from closing, not on every increment.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Bazı sunucu olay/durumları mevcut; tam kanal zamanlaması kabul edilmedi.
- **Kalan / kabul:** Watchable 4.0 crossing, 22:00 izlenmiş gün, collection son bir maç; tekilleştirme.
- **Kaynak / kanıt:** HANDOFF §10.3.

### 13.3.4 — Bildirim deep-link

> Every notification deep-links to the exact surface, never to Home: a heat alert opens that match's sheet on the Community tab, a reply opens the review thread scrolled to that reply, a collection alert opens that collection.

**Durum:** Kısmi bağlantılar.

- [ ] Prompt kabulü.
- **Yapılan:** Alerts bazı maç/liste hedeflerini açıyor; tam native sözleşme değil.
- **Kalan / kabul:** Tam Community/reply/collection hedefi; cold-start, oturum açma ve doğru yanıta scroll.
- **Kaynak / kanıt:** Alerts.jsx; mobil deep-link kabulü.

### 14.1 — Tüm ekranların definition-of-done kontrolü

> Run the §9 definition-of-done checklist against every screen you built and report failures only: no hex outside §1, no new font, no bare `1fr`, all targets ≥44px, all type ≥9px except the skin-grid thumbnails, every animation behind `prefers-reduced-motion`, and the six `MatchCard` presets clean.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Seçili ekran testleri, 21 Node/30 Python testi ve build geçti.
- **Kalan / kabul:** Tüm ekranlarda renk/font/44px/9px/grid/motion ve altı preset matrisi; yalnız başarısızlıkları raporla.
- **Kaynak / kanıt:** Bu kaydın Doğrulama bölümü.

### 14.2 — Altı navigasyon sözleşmesi

> Then verify the six navigation contracts in §4.9 by walking them: rate from all four entry points and confirm each lands in `6a`; open Profile and confirm it lands on `6b` with Standing pushed; walk first run 4g → 4h → 2r → rate → 6a; reach The Hunt from both Discover and `6b`; expand the companion from the sheet; and confirm the Companion badge changes with match state.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Bazı ortak yollar doğrulandı; altı sözleşme tümüyle geçmedi.
- **Kalan / kabul:** Dört rating→6a; Profile/Standing; first-run; iki Hunt girişi; expand; durum bazlı Companion badge.
- **Kaynak / kanıt:** HANDOFF §4.9.

### 14.3 — Tüm notification metinlerinin denetimi

> Finally, audit the notification copy against the spoiler rule: write out every notification string the app can produce and confirm none of them contains a score, a heat value, or a star count for a match the user has not rated. This is the one bug class that would make a user delete the app.

**Durum:** Bekliyor.

- [ ] Prompt kabulü.
- **Yapılan:** Kural belgeli; tüm üretilebilir metinlerin dökümü/testi henüz yok.
- **Kalan / kabul:** Her payload metnini listele; unrated spoiler kuralını kontrol et. Sonra kullanıcı onayıyla APK.
- **Kaynak / kanıt:** HANDOFF §10.3; aşama 13.3.

### Kaynağın ortak kuralları (aynen)

- No new colours. If you need a hex that isn't in §1, stop and ask.
- No new fonts. Rajdhani when the product speaks, Outfit when a person does.
- No sixth stylesheet. The cascade is already five deep (§4.3).
- Heat is data visualisation only — never nav, never a CTA, and the numeric value always ships beside the colour.
- Gold marks at most one thing per viewport region; the nav diamond doesn't count.
- Screens marked **superseded** in the §7 map are not to be built: `2o`, and `3a`/`3b` which no longer exist.
- Four durations, one curve. Nothing gold ever animates.
- Haptics mark commitment, not navigation.
- No notification ever spoils a match the user hasn't rated.

### Bir sonraki güncellemede doldurulacak kapanış kaydı

```text
Tarih:
Prompt kimliği:
Yapılan değişiklik:
HTML ekranı / bölüm:
Değişen dosyalar:
Test / görsel kontrol sonucu:
Kalan eksik veya kaynak çelişkisi:
Prompt kabul kutusu kapandı mı? Gerekçe:
Sıradaki prompt / alt iş:
APK / push / deploy: yapılmadı (aksi ancak açık kullanıcı talebiyle)
```
