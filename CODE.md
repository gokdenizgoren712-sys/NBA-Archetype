# RankIt ortak çalışma talimatı

Bu dosya, C:/Users/ggore/Documents/Nba-Archetypes klasöründe çalışan Claude Code ve Codex için ortak çalışma sözleşmesidir.

Amaç, RankIt yeniden tasarımını iki paralel hat üzerinden yürütmektir:

- Codex: frontend, mobil/web arayüzü, MatchCard, ekran akışları ve görsel kabul testleri.
- Claude Code: backend, API veri sözleşmeleri, veritabanı sorguları/migrasyonları ve backend testleri.

İki ajan aynı çalışma klasörünü paylaşır. Bu nedenle kaynak önceliği, dosya sahipliği, çakışma ve doğrulama kuralları aşağıdaki gibi uygulanır.

---

## 1. Çalışma klasörü ve temel yollar

Claude Code’un çalışma kökü:

    C:/Users/ggore/Documents/Nba-Archetypes

Tasarımın birincil kaynakları:

    C:/Users/ggore/Documents/Nba-Archetypes/Primary Arch UI Redesign/repair-kit/BUILD.md
    C:/Users/ggore/Documents/Nba-Archetypes/Primary Arch UI Redesign/repair-kit/RankIt Redesign.dc.html
    C:/Users/ggore/Documents/Nba-Archetypes/Primary Arch UI Redesign/repair-kit/RankIt Web.dc.html
    C:/Users/ggore/Documents/Nba-Archetypes/Primary Arch UI Redesign/repair-kit/ONARIM.md
    C:/Users/ggore/Documents/Nba-Archetypes/Primary Arch UI Redesign/repair-kit/HANDOFF.md

Ana uygulama kaynakları:

    C:/Users/ggore/Documents/Nba-Archetypes/frontend/src/rankit/
    C:/Users/ggore/Documents/Nba-Archetypes/frontend/src/rankit/redesign/
    C:/Users/ggore/Documents/Nba-Archetypes/frontend/src/rankit/web/
    C:/Users/ggore/Documents/Nba-Archetypes/api/rankit.py
    C:/Users/ggore/Documents/Nba-Archetypes/api/rankit_notify.py
    C:/Users/ggore/Documents/Nba-Archetypes/api/db.py
    C:/Users/ggore/Documents/Nba-Archetypes/tests/

## 2. Kaynak önceliği

Kaynaklar arasında uyuşmazlık çıkarsa sıra kesinlikle şöyledir:

1. BUILD.md — tasarımın ve kabul kriterlerinin tek doğruluk kaynağıdır.
2. RankIt Redesign.dc.html — mobil görsel yapı ve ekran referansıdır.
3. RankIt Web.dc.html — web ekranlarının görsel referansıdır.
4. ONARIM.md — neyin uygulandığını, neyin doğrulandığını ve neyin kaldığını tutan çalışma günlüğüdür.
5. HANDOFF.md — önceki prompt sırası ve tarihçedir; BUILD.md ile çelişirse uygulanmaz.
6. Mevcut kod — yalnızca çalışan davranışın kanıtıdır; tasarım sözleşmesine aykırıysa doğru kabul edilmez.

DESIGN.md, eski HTML dosyaları, geçmiş promptlar veya model hafızası BUILD.md’nin üstünde değildir.

İşe başlamadan önce BUILD.md’nin tamamı, ilgili HTML ekran kodları ve ONARIM.md’nin aktif aşaması okunmalıdır. Ekran kodları kalıcı referanstır; örnekler 2a, 2h, 2f, 2g, 6a, 6b, 7f, 15a, 15b, 15c ve 15d’dir.

## 3. Şu ana kadarki durum

ONARIM.md içindeki güncel kayda göre:

- Aşama 1 tamamlandı: yedi MatchCard preset’i ve ölçüm düzeneği.
- Aşama 2 tamamlandı: MatchCard kabul kapısı ve temel davranışların ortaklaştırılması.
- Aşama 3 tamamlandı: grid taşmaları, minmax(0, 1fr), min-width: 0 ve elmas footprint geçişi.
- Aşama 4 devam ediyor: spoiler shield, kişisel rating/topluluk verdict ayrımı, 20-rating eşiği ve skor görünürlüğü.

Frontend tarafında son doğrulanan kurallar:

- Spoiler açıkken bitmiş maç sonucu PLAYED ve skor — olur.
- Heat yalnızca veri görselleştirmesidir; sayı her zaman rengin yanında bulunur.
- Community heat en az 20 gerçek rating olmadan gösterilmez.
- İzleme kaydı tek başına rating sayılmaz.
- Kişisel rating yoksa topluluk verdict’i gizlenir; REVEAL ANYWAY açıkça kullanılmalıdır.
- Instant Classic, spoiler veya gizli topluluk verdict’i varken gösterilmez.
- Diary, Search, List Shelf, Competition Matches, Profile ve Member Profile aynı görünürlük kuralını kullanır.

Son frontend doğrulaması 22/22 Node testi, hedefli ESLint, git diff --check ve Vite production build ile başarılıdır. Yeni değişikliklerden sonra bu sonuç yeniden doğrulanmalıdır.

## 4. Dosya sahipliği

### Codex’in aktif alanı

    frontend/src/rankit/
    frontend/tests/

Codex MatchCard, mobil/web RankIt ekranları, CSS, React state akışları, responsive davranış ve tarayıcı doğrulaması üzerinde çalışır.

### Claude Code’un aktif alanı

    api/
    tests/

Claude Code backend endpoint’leri, SQL sorguları, veri görünürlük kuralları, API response shape’leri, migration/schema ve backend testleri üzerinde çalışır. Frontend dosyalarını değiştirmez; frontend’de ihtiyaç görürse ONARIM.md’ye veya backend review notuna yazar.

## 5. Çakışmayı önleme kuralları

- İki ajan aynı dosyaya aynı anda yazmaz.
- BUILD.md, HTML kaynakları ve HANDOFF.md uygulama sırasında değiştirilmez.
- ONARIM.md ortak kayıttır; geçmiş maddeler silinmez ve geriye dönük yeniden yazılmaz.
- Claude Code backend notlarını ONARIM.md’nin sonuna append-only bölüm olarak ekler; Codex’in frontend kayıtlarını yeniden biçimlendirmez.
- Bir dosyada başkasına ait uncommitted değişiklik varsa önce git diff ile okunur, geri alınmaz ve üzerine yazılmaz.
- Her ajan tur başında git status --short ve hedef dosyaların diff’ini kontrol eder.
- git reset --hard, git checkout --, geniş kapsamlı silme ve force-push yasaktır.
- Bu aşamada otomatik commit, push, deploy, APK üretimi veya canlı veritabanı migrasyonu yapılmaz. Bunlar yalnızca kullanıcı açıkça istediğinde yapılır.

## 6. Claude Code’un backend çalışma sırası

### Adım 1 — API envanteri

Önce şu dosyaları okuyarak mevcut sözleşmeyi çıkar:

    api/rankit.py
    api/rankit_notify.py
    api/db.py
    tests/test_rankit_social.py

İlgili route’ları, SQL alanlarını ve frontend adaptörlerinin beklediği alanları birlikte kontrol et. Sadece isim aramasıyla “yok” sonucuna varma; sorgu ve response’un tamamını incele.

### Adım 2 — Aşama 4 backend kabulü

- status, starts_at, home_score, away_score, rating_count, review_count, classic_count, community_rating ve my_rating alanlarının ilgili endpoint’lerde tutarlı olup olmadığını kontrol et.
- Puanlanmamış kullanıcıya sonuç veya topluluk verdict’i sızdıran notification payload’larını kontrol et.
- hot_match ve collection notification’larında skor, community rating veya Classic sonucu gereksiz yere taşıma.
- my_watched_date varlığını rating yerine sayma.
- Görünürlük SQL’de doğru uygulanabiliyorsa SQL’de uygula; yalnız frontend’e güvenip hassas veriyi response’a koyma.
- En az 20 rating olmadan community heat döndürme. Eksik sayaç varsa yeterli veri varmış gibi davranma.

### Adım 3 — expected/planned heat denetimi

BUILD.md §5.5 ve 2h/16c ekran sözleşmelerindeki planned/expected heat alanlarını kontrol et.

- Veritabanında veya güvenilir bir kaynağa bağlı expected_heat yoksa sayı uydurma.
- Alan gerçekten varsa kaynağını, hesaplama zamanını, null davranışını ve endpoint’lerini belgele.
- Alan yoksa rastgele bir expected heat ekleme; eksikliği ONARIM.md’ye yaz ve veri sözleşmesi öner.
- Planned heat ile bitmiş maç community heat’i aynı alan olarak kullanılmamalıdır.

### Adım 4 — review ve notification kabulü

- Spoiler işaretli review metni özet, feed veya notification payload’ında yanlışlıkla görünmemeli.
- Review listesi rating yokken skor veya verdict’i zorunlu olarak açmamalı.
- Respect, yorum ve follow bildirimleri maç sonucunu söylememeli.
- Collection bildirimi yalnızca listenin ilerlemesini anlatmalı; gizli skor eklememeli.
- Broadcaster bildirimi yayıncı bilgisini verebilir, maç sonucunu veremez.
- Private/followers kayıtlar yanlış kullanıcıya dönmemeli.
- Bir kullanıcının kendi rating/diary verisi başka kullanıcının görünür rating’iyle karışmamalı.

### Adım 5 — test ve raporlama

En az şu test ve değişen backend modüllerini kapsayan ilgili testler çalıştırılmalıdır:

    python -m pytest tests/test_rankit_social.py -q

Route response’ları için FastAPI TestClient kullan. Test yoksa küçük, deterministik test ekle; canlı servise veya gerçek kullanıcı verisine yazma.

ONARIM.md’ye şu yapıda kısa bir kayıt ekle:

    #### Backend pass — Aşama 4 / tarih
    - BUILD maddesi ve ekran kodu:
    - İncelenen endpoint / tablo:
    - Bulgu:
    - Yapılan backend değişikliği:
    - Test:
    - Kalan bağımlılık veya veri eksikliği:

## 7. BUILD fazlarına göre backend denetim sırası

Claude Code, backend’i dosya adına göre değil BUILD.md’nin faz sırasına göre denetler. Her fazda önce mevcut API/veri sözleşmesi çıkarılır, sonra eksik backend davranışı düzeltilir, ardından ilgili test ve ONARIM.md kaydı eklenir.

| BUILD fazı | Backend denetimi | İlgili ekran/kapsam |
| --- | --- | --- |
| Phase 0 — Orientation | Veri kaynakları, mevcut route’lar, auth, DB tabloları ve fixture’lar envanterlenir. | Tüm ekran kodları |
| Phase 1 — The card | MatchCard’ın ihtiyaç duyduğu takım, crest, score, status, sport, competition, broadcaster ve rating alanları tutarlı hale getirilir. | 2a, 2b, 2c, 2d, 2e, 2f, 2g |
| Phase 2 — Home | Home/hero maçlarının RankIt günü, timezone, live/upcoming/finished ayrımı ve broadcaster verisi denetlenir. | 2a, 2r |
| Phase 3 — Diary and Discover | Diary kayıtları, watchlist, search, competition filtreleri, tarih/saat ve kişisel rating ayrımı denetlenir. | 2e, 3e, 8a |
| Phase 4 — Collectible | Rating kaydının tekil entry üretmesi, Classic/POTM/Respect/tag/review alanlarının aynı entry’ye yazılması ve retry davranışı denetlenir. | 6a, 7e |
| Phase 5 — Match sheet | Beş match-sheet fazı için aynı match response’un yeterli olup olmadığı denetlenir; score, lineup, community, companion ve broadcaster alanları ayrıştırılır. | 2h, 15d, 15a, 2f, 2g |
| Phase 6 — Companion | Live companion için status, live minute, current score, join count ve full-time geçişleri doğrulanır. | 5a, 5b, 6d |
| Phase 7 — Reviews | Review spoiler, visibility, rating, tags, replies, respect ve author ilişkisi test edilir. | 4a, 5c, 15c |
| Phase 8 — Shell | Auth, profile, settings, preference ve account-scoped verilerin endpoint’lerde karışmadığı kontrol edilir. | 2r, 4g, 6b |
| Phase 9 — Remaining mobile surfaces | Players, competition players, profile shelf, lists ve notifications gerçek response alanlarıyla karşılaştırılır. | 15b, 15c, 6a, 6b, 3f, 3h, 3i |
| Phase 10 — States | Empty, loading, offline, error, stale/cache ve retry response’ları backend kaynaklı olarak test edilir. | Tüm yüzeyler |
| Phase 11 — Accessibility | API’de erişilebilir isimleri bozan gereksiz/eksik team ve competition alanları kontrol edilir; frontend erişilebilirliği bu fazın yerine geçmez. | Tüm kart/listeler |
| Phase 12 — Marks | Brand, crest, league, broadcaster ve Primary Arch co-brand alanlarının kaynağı kontrol edilir; sahte logo veya yayıncı uydurulmaz. | 7a, 7b, 7c, 7d |
| Phase 13 — Web foundation | Web’in mobil ile paylaştığı match, diary, search ve profile response’larının parity’si denetlenir. | 7a–7h |
| Phase 14 — Inspector | Web Inspector’ın scheduled/live/rated/unrated/community/companion durumları için API response’ları ayrı ayrı kabul edilir. | 16c, 15w, 7b, 15x, 7c, 16a, 7d, 16b |
| Phase 15 — Desktop-earned screens | Desktop shelf, heat map ve review reading için pagination, sıralama, aggregate ve visibility sorguları test edilir. | 7f, 7g, 7h |
| Phase 16 — Remaining web surfaces | Web Rank, Lists, Search, Alerts, Profile ve settings response’larının ekran sözleşmeleriyle eşleştiği kontrol edilir. | 14a, 14b, 14c, 14d, 14e, 14f |
| Phase 17 — Responsive | Backend tarafında responsive fark yaratacak farklı payload veya eksik alan olmadığından emin olunur; UI ölçüleri frontend sorumluluğudur. | Mobil/web parity |
| Phase 18 — Close out | Route matrisi, test listesi, migration notları, veri eksikleri ve canlıya çıkış ön koşulları raporlanır. | Definition of done |

Bu tablo bir “hepsini tek seferde değiştir” talimatı değildir. Aktif faz tamamlanmadan sonraki faza geçilmez. BUILD.md özellikle fazların birleştirilmemesini ve MatchCard bağımlılığının yukarıdan aşağı çözülmesini ister.

## 8. Tasarım ve veri kuralları

Her değişiklikte şu altı kritik kural ayrıca kontrol edilir:

1. BUILD.md §2.1: Instant Classic altında dönen şey kart kenarlığı değil, çentik saç çizgisidir.
2. BUILD.md §2.4: Döndürülmüş elmas footprint’i border dahil border-box × 1.414 ölçülür.
3. BUILD.md §2.7: Global box-sizing: border-box korunur.
4. BUILD.md §2.8: Boolean prop coercion “false” string’ini true kabul etmez.
5. BUILD.md §18.1: Izgaralarda minmax(0, 1fr), kart wrapper’larında min-width: 0 kullanılır.
6. BUILD.md §1.3: Heat yalnızca veri görselleştirmesidir; sayı her zaman yanında gösterilir.

Backend’e uyarlaması:

- Heat CTA, sıralama hilesi veya notification rengi olarak üretilmez.
- null, 0, yetersiz rating ve gerçek community rating birbirinden ayrılır.
- Skor gizleme yalnızca CSS hilesi değildir; hassas içerik gereksiz API response’una taşınmaz.
- Frontend’in PLAYED, TOO FEW RATINGS ve REVEAL ANYWAY durumlarını ayırabilmesi için status ve sayaç alanları tutarlı kalır.
- Veri yoksa mock sayı, tahmini puan veya sahte broadcaster üretilmez.

## 9. Her backend aşaması için kontrol listesi

Başlamadan önce:

- [ ] BUILD.md’nin ilgili bölümü okundu.
- [ ] İlgili mobil ve web HTML ekran kodları incelendi.
- [ ] ONARIM.md aktif aşaması okundu.
- [ ] git status --short ve hedef dosyaların diff’i kontrol edildi.
- [ ] Aynı dosyada Codex’in devam eden değişikliği olmadığı doğrulandı.

Değişiklikten sonra:

- [ ] API response alanları frontend adaptörleriyle karşılaştırıldı.
- [ ] Spoiler, rating threshold ve visibility test edildi.
- [ ] İlgili pytest testleri geçti.
- [ ] Yeni veri alanı varsa kaynağı ve null davranışı belgelendi.
- [ ] ONARIM.md append-only notuyla güncellendi.
- [ ] Commit, push ve deploy yapılmadı.

## 10. Claude Code durum mesajı biçimi

Her önemli adımda şu kısa format kullanılmalıdır:

    [BACKEND] Aşama 4 / §3.1
    İncelenen: api/rankit_notify.py, /api/notifications
    Bulgu: ...
    Değişiklik: ...
    Doğrulama: ...
    Kalan: ...

Belirsiz bir tasarım kararı varsa kodu tahminle değiştirme. BUILD.md maddesini, ekran kodunu ve mevcut API verisini göstererek karar noktası aç.

Özellikle expected_heat, broadcaster kaynağı, rating görünürlüğü, notification dili ve private review görünürlüğü veri kaynağı kanıtlanmadan varsayılamaz.

Bu dosyanın amacı Claude Code’u yalnızca backend kodu yazan bir ajan değil, BUILD.md sözleşmesini API response’larına kadar denetleyen ikinci çalışma hattı olarak konumlandırmaktır.
