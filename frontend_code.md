# RankIt frontend ortak çalışma planı

**Konum:** `C:/Users/ggore/Documents/Nba-Archetypes/frontend_code.md`  
**Güncelleme:** 2026-09-22  
**Durum:** Codex frontend işini sürdürüyor; Claude Code backend Phase 1–18 denetimini bitirdi (kayıtlar `ONARIM.md`, tüm paket 271/271, RankIt 235). Claude artık frontend'e katıldı ve geçiş kapısındaki ilk teslimi verdi: `API_UI_MATRIX.md`. Mobil (Faz 5–12) kapanmadan web uygulama dosyalarına yazılmayacak.

Bu belge iki ajanın sıradaki işi, dosya sahipliğini ve kabul kapılarını paylaşması içindir. Tasarımın doğruluk kaynağı değildir. Tasarım önceliği: `Primary Arch UI Redesign/repair-kit/BUILD.md` → `repair-kit/RankIt Redesign.dc.html` (mobil) → `repair-kit/RankIt Web.dc.html` (web) → `repair-kit/ONARIM.md` (kanıt ve değişiklik günlüğü) → eski `HANDOFF.md`. Kök `CODE.md` operasyonel eşzamanlı çalışma kurallarıdır; bu belge onun güncel faz panosudur, ikisi de BUILD tasarım kararını geçersiz kılamaz. Ekran kodları (`2f`, `15c`, `7a` vb.) sabittir. HTML'deki örnek sayı ve maçlar gerçek veri yerine geçirilmez.

## Ortak çalışma sözleşmesi

- Kök dizin `C:/Users/ggore/Documents/Nba-Archetypes`. Kaynaklar `Primary Arch UI Redesign/repair-kit/` altında. Önce ilgili `BUILD.md` paragrafı ve altın rozetli HTML ekranı okunur; sonra mevcut kod ve API yanıtı incelenir.
- Codex şu anda `frontend/src/rankit/` ve `frontend/tests/` için yazardır. Claude backend bitene kadar `api/`, `src/`, `tests/` için yazardır; frontend'de bulduğu gereksinimi `ONARIM.md` sonuna ekler, Codex'in açık frontend dosyasını değiştirmez.
- Backend fazları bitince Claude frontend'e katılır: önce API–UI sözleşme matrisi ve eksik veri listesi çıkarır. `BUILD.md` Part IV uyarınca **mobil kapanmadan web Phase 13'e başlanmaz**. Mobil kapı açıldıktan sonra Claude `frontend/src/rankit/web/` ve ona özgü testleri; Codex mobil kabuk, `redesign/`, ortak API/adaptör ve paylaşılan CSS'i üstlenir. `web/cards.jsx`, `web/rankit-web.css` Claude'un; `rankitApi.js`, `rankit.css`, `redesign/MatchCard.jsx` Codex'in edit alanıdır. Paylaşılan dosya değişikliği istekleri önce bu dosyada/ONARIM'da kayıt altına alınır; aynı dosyada iki ajan eşzamanlı yazmaz.
- `frontend_code.md` ortak sıradır ama tek seferde **yalnız bir ajan** düzenler. Başlamadan önce `git status --short`, ilgili diff ve bu belgenin sonunu yeniden oku; kendi teslim notunu en alta ekle, diğer ajanın kaydını silme. `ONARIM.md` de append-only. Tamamlandı kutusu yalnız çalışan UI ve test kanıtıyla işaretlenir; backend endpoint'inin varlığı frontend kabulü değildir.
- Commit, push, deploy, canlı DB yazımı ve APK ancak kullanıcı açıkça istediğinde. Kirli worktree'de başkasının değişikliklerini geri alma/üstüne yazma. Yeni renk/font/altın bütçesi/CSS katmanı ekleme; `BUILD.md` §§1, 2, 6, 18, 26–27'yi her aşamada denetle.

## Kanıtlı başlangıç durumu

Codex'in kayıtlı frontend teslimleri: yedi `MatchCard` preseti ve ölçülmüş elmas footprint'i; grid taşma onarımı; spoiler/20 oy kapısı; `6a` koleksiyon sonucu ve yerel kayıt kuyruğu; `15a`, `15b`, `15d`, `2g`, `2h` kısmi ekranları; `5a/5b/6d` Companion entegrasyonu; kendi incelemesine respect kapısı ve belirsiz yorum gönderiminde `client_id`. Son frontend kaydı `ONARIM.md` sonundaki 2026-09-22 Companion geçişidir: 37/37 Node testi, hedefli lint, üretim derlemesi; bitmiş demo ekranı tarayıcıda görüldü. Bu, beş evreli maç sheet'i veya Companion'ın canlı iki kullanıcılı kabulünün tamamlandığı anlamına gelmez.

Claude'un `ONARIM.md` kayıtları backend Phase 1–18 denetimini içeriyor (son kayıtta tüm paket 271/271). Bu, frontend fazlarının kabul edildiği anlamına gelmez. `2f` için yeni `GET /matches/{id}` yalnız bitmiş maçta `events` (gol/kart/değişiklik, takım tarafı) ve `events_checked` sağlıyor; eski API için Companion `moments` geçici yedek. `GET /watchalong?before_id=&limit=` geriye sayfalama ve `has_more` sağlıyor; `6d` arşiv UI bağlantısı var, ancak 100+ mesajlı görsel kabul henüz yok. Çalışan yerel API eski süreç olabilir, yeni sözleşme görünmeden görsel kabul yazılmayacak. `CODE.md` §3'teki 22-test ve “aktif Aşama 4” özeti eskidir; kronolojik ONARIM notları ve kod tekrar doğrulanarak kullanılır. Codebase-memory becerisi bu Codex oturumunda dosya erişim izni nedeniyle okunamadı; yapısal durum iddiaları kaynak dosya + test/görsel kanıtına dayanır, grafikten doğrulandı denmez.

## Faz panosu — Part IV'e göre

`Kısmi` = kod veya API izi var, ancak tüm ekran/kabul kapısı geçmedi. `Bekliyor` = kabul edilmiş frontend teslimi yok; eski bir prototip varlığı tamamlanma kanıtı sayılmaz.

| Faz | Ekran / iş | Frontend durumu | Sonraki kabul kapısı / sahip |
| --- | --- | --- | --- |
| 0 Orientation | BUILD–DESIGN farkları | Kayıtlı | Yeni değişiklikte kaynak önceliğini tekrar uygula / iki ajan |
| 1 Card | 7 preset | Kayıtlı kabul | Regresyon: border-box × 1.414, Classic yalnız hairline / Codex |
| 2 Home | `2a`, flag | Kısmi | 64 header/73 nav, gerçek içerikle bayrak açık-kapalı görsel kabul / Codex |
| 3 Diary/Discover | `2e`, `2c`, Hunt tile | Kısmi | 167 compact ve uzun ad; Discover'da Hunt önde / Codex |
| 4 Collectible | `6a`, dört rating yolu | Kısmi | Dört yol, queued/edit/share/skin sonucunun tek ekrana inişi / Codex |
| 5 Match sheet | `2h`, `15d`, `15a`, `2f`, `2g`, `15b` | Kısmi, **aktif en erken açık kapı** | `2f` dört olaylı kopya DB/gerçek API ile 375×812 kabul edildi; diğer beş evrenin mobil görsel/işlev kabulü / Codex |
| 6 Companion | `5a`, `5b`, `6d` | Kısmi | `6d` 205 mesajlı kopya DB/gerçek API ile tam arşiv kabul edildi; iki hesapla canlı Join/nabız/okuma kabulü / Codex |
| 7 Reviews | `15c`, `5c`, `4a` | Kısmi | Önce `15c` girişe bağlı composer; sonra sıralama/yanıt/elmas kabulü / Codex |
| 8 Shell | `2r`, `3j` | Kısmi | 64/73 ölçüsü, merkez Rank, altın bütçesi / Codex |
| 9 Remaining mobile | `6b`, `2p`, `9a`, `9b`, `2i`, `3c`, `3d`, `2m`, `2n`, `3e`, `13a`, `3g`, `3h`, `3i`, `2j`–`2l`, `4g`–`4h` | Kısmi; alt ekranlar ayrı ayrı doğrulanmalı | BUILD sırasıyla tek tek ekran kabulü, sahte veri yok / Codex |
| 10 States | `3k`, `3l`, §5.4–5.5 | Kısmi | Çevrimdışı %62, dört hata, belirsiz yazma tekrar güvenliği / Codex |
| 11 Accessibility | tüm sheet/dialog | Kısmi | Escape, odak tuzağı/geri dönüşü, ≥44px, reduced motion / Codex |
| 12 Marks | §7.1–7.4 | Kısmi | RankIt mask/benzersiz id, Primary Arch küçük/mono varyant, gerçek Android launcher / Codex; APK yok |
| 13 Web foundation | `7a` | Kısmi altyapı, **web migrasyonu bekliyor** | Mobil 1–12 kapıları sonrası 78 header, 232 rail, 320 wall, gerçek arama, crest/format regresyonu / Claude frontend |
| 14 Inspector | `16c`, `15w`, `7b`, `15x`, `7c`, `16a`, `7d`, `16b`, `7e`, `11a`, `15y`, `15z` | Kısmi prototip; faz kabul edilmedi | Beş yaşam evresi, web'e özel panel/dialog/overlay / Claude frontend; ortak sözleşme Codex |
| 15 Desktop-earned | `7f`, `7g`, `7h` | Bekliyor | 7-across raf, 38 haftalık heat map + kişisel altın elmas, iki kolon inceleme / Claude frontend |
| 16 Remaining web | `8a`, `8b`, `10a`, `8c`, `11d`, `11c`, `12a`, `12b`, `12c`, `14a`, `14b`, `11b`, `8d` | Kısmi prototip; faz kabul edilmedi | Web farkları: kalıcı filtre rail'i, lig tablo+hafta yan yana, tek ekran first run / Claude frontend |
| 17 Responsive | 1080/820 eşikleri | Kısmi | 1080 icon rail, 820'de uygulama davranışı + full-width sheet / Claude frontend + Codex ortak kontrol |
| 18 Close out | §26 + yaşam döngüleri | Bekliyor | 68 kodun yeniden envanteri; dört rating yolu, beş maç evresi, grid ve footprint ölçümü / iki ajan |

## Bir sonraki somut sıra

1. **Codex / şimdi / Phase 5:** `2f` yeni maç `events` listesini ve `events_checked` boş durumunu kullanıyor; eski API için Companion yedeği var. 375×812'de hem boş olay hali hem de dört olaylı kopya DB üzerinden ev/deplasman çizgisi görüldü. `15a`, `15d`, `2h`, `2g`, `15b` için mobil durum matrisi/görsel kabul sırada; ancak bu kapılar geçince Phase 5'i kapat.
2. **Codex / Phase 6:** `6d` “Read the thread” artık `before_id`/`has_more` ile sayfalanıyor; 205 mesajlı QA odasında 100+100+5 ve tam kronoloji doğrulandı. Gerçek canlı/öncesi maçta iki hesapla Join/nabız/okuma doğrulanacak.
3. **Codex / Phase 7–12:** Sırayla `15c` composer, `5c`/`4a`; kabuk; kalan mobil ekranları tek tek; durumlar, erişilebilirlik, marka. `15c` için mevcut inline textarea'nın varlığı bitmiş composer sayılmaz. Rating yokken açma; “Save to your entry” aynı girişe yazmalı, spoiler açıklaması başta görünmeli.
4. **Claude / backend devamı — BİTTİ (2026-09-22):** Phase 13–18 denetimleri ONARIM'a kanıt/test/eksik sözleşmeyle eklendi. Codex'in kuyruğa bıraktığı iki istek kapandı: `6d` tam sohbet arşiv sayfalaması (`before_id`/`has_more`) ve `2f` maç yanıtında olaylar (`events`, `side`, `events_checked`); ayrıca `4a`/`5c` sahiplik (`is_mine`). Phase 10 (`on` toggle, `has_more`, `live_updated_at`), Phase 12 (canlıda `broadcaster: null`, doğrulanmış `broadcast`) ve yeni web uçları frontend kuyruğunda — `API_UI_MATRIX.md`.
5. **Claude / frontend'e geçiş kapısı — AÇIK, ilk teslim verildi:** `API_UI_MATRIX.md` (hangi alan var, arayüzde kim okuyor, hangi kapı açık) + eksik veri listesi + tuzaklar. Mobil kapanana kadar web uygulama dosyalarına yazılmıyor. Claude'un sıradaki işi: Codex'le Faz 5–12 mobil kabul listesini eşleştirmek, izole test ve görsel fark raporu üretmek. Mobil kapandığında Phase 13→17 web dosyalarının yazarlığı Claude'a geçer; Codex ortak adaptör/mobil regresyon sahibi kalır. Phase 18 iki ajan tarafından birlikte ölçülür.

## Her teslim notunun biçimi

`[Codex frontend | Claude backend | Claude web] Faz N · ekran kodu · kaynak §`  
`Değişen dosyalar; gerçek veri/endpoint ve boş/null hali; çalışan ekranda görülen; test/build/ölçüm; açık bağımlılık; sıradaki kapı.`

Bir faz **tamam** ancak şu kanıtlar birlikte varsa işaretlenir: kaynakla hizalı ekran, gerçek/boş/yanlış API hallerinde davranış, mobil veya web ölçülü görsel kontrol, ilgili testler, üretim derlemesi ve ONARIM append-only kaydı. Test geçişi tek başına görsel kabul değildir.

## İş günlüğü

### 2026-09-22 — Codex

- Ortak plan açıldı; backend Phase 13 başlangıçta kullanıcı beyanıyla “devam ediyor” olarak izlendi, ardından ONARIM'a tamamlanmış denetim kaydı eklenince plan güncellendi. Önceki frontend Aşama 5–6 işleri kısmi olarak taşındı; kaynak hiyerarşisi ve Claude frontend'e katılım kapısı yazıldı.
- `2f` sağlayıcı gol/kart anlarının Match yanıtında değil Companion yanıtında bulunduğu doğrulandı. Bitmiş Match sekmesine gerçek olay listesi bağlandı, canlıda Companion tek sahibi kaldı; olay olmayan yerel demo maçında açık veri-yok hali tarayıcıda görüldü. Dolu olay örneği için görsel kabul hâlâ açık.
- Claude'un daha sonra eklediği backend Phase 18 devrinde `GET /matches/{id}` için `events`/`events_checked` geldi. `2f` artık maç yanıtını önceliklendiriyor, ev/deplasman sütunlu gol/kart/değişiklik satırlarını çiziyor; eski API için Companion yedeği kalıyor. Canlı `15d` başlığı ve zaman çizelgesi gerçek `live_minute` ile düzeltildi. 41/41 Node testi, hedefli lint ve production build geçti; 375×812 yerel eski API'de olay-verisi-yok hali görüldü, dolu olay görsel kabulü açık.
- `6d` arşivinde yeni `before_id`/`has_more` sayfaları “Load earlier messages” ile başa ekleniyor; canlı/HTTP çakışan mesajlar kimlikle tekilleşiyor, durum değişiminde arşiv silinmiyor. 43/43 Node testi, hedefli lint, production build geçti. 375×812'de bitmiş, boş oda “Read the thread” açılışı görüldü; 100+ mesajlı gerçek oda görsel kabulü hâlâ açık.

### 2026-09-22 — Claude

`[Claude backend → frontend geçişi] Faz 1–18 · tüm ekran kodları · BUILD Part IV + §26`

- **Değişen dosyalar:** `api/` (18 faz), `tests/` (26 RankIt dosyası), yeni `API_UI_MATRIX.md`, yeni `src/scratch/seed_local_match_events.py`. Frontend dosyalarına dokunulmadı.
- **Gerçek veri/endpoint ve boş hali:** `GET /matches/{id}` bitmiş maçta `events[]` (+`side`) ve `events_checked`; canlı/planlıda `events: null` (§9.2). Olay hiç yoklanmadıysa `events: []` + `events_checked: false` — "olay yok" DEĞİL, "kaynak doğrulanmadı". Yeni sürümde `events` anahtarı her zaman vardır; anahtar hiç görünmüyorsa servis eden süreç eskidir.
- **Çalışan ekranda görülen:** yerel API sürecine sandbox'tan erişemedim (bağlantı reddedildi), bu yüzden süreç sürümünü ben doğrulayamadım. Codex'in gözlemi (eski süreç) bu kontratla tutarlı.
- **Test/build/ölçüm:** tüm paket `tests/` 271/271 (RankIt 235). `tests/test_rankit_close_out.py` 20 puan eşiğini on üç ısı yüzeyinde ölçüyor. Seed betiği veritabanı kopyasında doğrulandı: 23' gol (home), 58' gol (away), 63' değişiklik (home), 71' kırmızı (away), `events_checked: true`; `--undo` yalnız kendi satırlarını siliyor.
- **Açık bağımlılık:** (1) Yerel API yeniden başlatılmalı — yalnız `events` için değil: `init_db` açılışta `rankit_diary_entries.skin`, `rankit_review_comments.client_id`, `rankit_moments.side`, koleksiyon tablolarını ekliyor. (2) `Alerts.jsx` koleksiyon satırı hâlâ `list_title`/`rated` okuyor; Faz 9.5'te alanlar `collection_title`/`collected` oldu. Satırın "undefined" basmaması için backend şimdilik iki eski adı da gönderiyor (`list_id` HARİÇ — yanlış yere götürürdü); Codex yeni adlara geçince takma adlar kalkacak.
- **Sıradaki kapı:** Codex mobil Faz 5–12; ben `API_UI_MATRIX.md`'deki bağlanmamış mobil alanları (6a makbuzu, 3j, The Hunt, skinler, listeler, toggle `on`, "That's all") kabul listesine çeviriyorum ve mobil kapı açılana kadar web uygulama dosyalarına yazmıyorum.

### Codex frontend — Faz 5 `2f` + Faz 6 `6d` · BUILD §9.2 / §12.1 · 2026-09-22

- Dört olaylı maç ve 205 mesajlı oda, gerçek geliştirme DB'sinin kopyası + ayrı 8011 API / 5174 frontend ile 375×812'de doğrulandı. `2f` gol/kart/değişiklik ev–deplasman sütunları, uzun ad sarması; `6d` 100+100+5 kronolojik arşiv, son sayfada düğmenin kalkması, bitmiş odada yazma alanının olmaması görüldü.
- 43/43 Node testi, hedefli lint ve production build başarılı. Diğer Phase 5 maç evreleri ile Phase 6 canlı iki hesaplı kabulü açık; APK/commit/push/deploy yapılmadı.
- `3f`/`13a` koleksiyon bildirimi yeni `collection_title`/`collected` alanlarını okuyor; `collection_id` kullanıcı listesine geçirilmeden kalan maç açılıyor. Hedefli lint ve üretim derlemesi geçti; gerçek bildirim görsel kabulü sırada. Claude'un geçici eski alan takma adları için not ONARIM'a eklendi.
- Faz 5 `15a`/`2g` spoiler kapısı: yerel yıldız taslağı artık topluluk hükmünü kaydedilmiş `my_rating` gibi açmıyor. Sunucudan puan veya başarılı koleksiyon makbuzuyla geri dönülen giriş kapıyı açar; çevrimdışı sıradaki kayıt açmaz. Açık `REVEAL ANYWAY` korunuyor. BUILD §3.1 ve mobil HTML `15a` temel alındı; 43/43 Node testi, hedefli lint ve üretim derlemesi geçti. Görsel/işlev kabulü ve beş evrenin bütünü hâlâ açık.

### Claude web — izole sözleşme testleri · `frontend_code.md` §"geçiş kapısı" · 2026-09-22

- **Değişen dosyalar:** yeni `tests/test_web_contracts.py`, yeni `tests/fixtures/README.md`, `.gitignore` (+1 kural), yeni `MOBILE_ACCEPTANCE.md`, yeni `codex_prompt.md`. Web uygulama dosyalarına dokunulmadı (mobil kapısı henüz açık değil).
- **Gerçek veri/endpoint ve boş hali:** 13 web ekranının okuduğu alanlar iki senaryoda kilitlendi — dolu hesap (7a, 8a, 8b, 8c, 7f, 7g, 7h, 10a, 11a/11b, 11c, 11d, 12a, 12b, 12c, 14a, 14b) ve boş hesap (`8d`: boş dizi, `null` ısı, `has_more: false`, `pct: null`, `best_week: null`, "not_open" koleksiyon). NBA'de ısı haritası `available: false` da kilitlendi.
- **Çalışan ekranda görülen:** yok (kasıtlı) — bu teslim izole sözleşme ve örnek üretimi; görsel kabul web fazları açılınca.
- **Test/build/ölçüm:** `tests/test_web_contracts.py` 3/3; tüm paket `tests/` 274/274. Koşu, `tests/fixtures/web/{dolu,bos}/*.json` altına 30 altın örnek yazıyor (160 KB); zaman damgaları kaydığı için `.gitignore`'da, README ile belgelendi.
- **Açık bağımlılık:** Codex mobil Faz 5–12 kabulü; kapanınca web dosyalarının yazarlığını alıyorum. `Alerts.jsx` koleksiyon alan adları geçişi bekliyor (backend'de geçici takma adlar duruyor).
- **Sıradaki kapı:** Codex isterse altın örnekleri izole görünüm testlerinde kullanabilir (`pytest tests/test_web_contracts.py` ile üretilir). Benden mobil tarafta bir sözleşme değişikliği gerekirse `MOBILE_ACCEPTANCE.md` üzerinden isteyin.

### Claude web — geçiş planı (uygulanmadı) · BUILD §17–19, §22–23, §25 · 2026-09-22

- **Değişen dosyalar:** yeni `WEB_MIGRATION_PLAN.md`. Web uygulama dosyalarına dokunulmadı (kapı kapalı).
- **Ölçülen sapmalar (kanıtlı):** S1 `web/cards.jsx:93` kendi kartını çiziyor, telefon yeni geometriye geçti (§27 tek kart). S2 `rankit-web.css:103` ayrı 216 px filtre sütunu — §23.1 filtreler rayda. S3 Inspector mobil `ri-sheet` ile (`RankItWeb.jsx:394`), docked 468 panel yok. S4 1080'de içerik sütunu iniyor, §25'te ray 64 px ikona inmeli. S5 820 davranışı kısmi. S6 kart ayağı `broadcaster` (canlıda null) — `broadcast` olmalı. **S9 üst header yok** (nav rayda dikey, `riw-head` sabit yükseklik değil) — §17 78 px header istiyor. **S10 arama modal açan düğme** — §17 "gerçek alan, `/` ipucu, modal değil". **S11 rayda üç bölüm yok.** S8: web hiçbir yeni ucu okumuyor.
- **Korunacak (regresyon yasağı):** `crest_url` alan adı (`cards.jsx:78`), `has-logo` ters-döndürme sınıfı (`:84`), ortak `formatWhen`, ortak `heat.js` 20 eşiği.
- **Test/ölçüm:** plan P0 olarak izole regresyon testleriyle başlıyor (`tests/fixtures/web/**` altın örnekleri + `src/audit_rankit_surfaces.py` sınıf taraması), sonra faz faz geometri ölçümü.
- **Codex'ten istenecek (yazmadan):** `redesign/MatchCard.jsx` web ön ayarı (raf `--crest 34`, 174 px) prop'la mı yeni preset'le mi; `rankit.css` içindeki `ri-match-card` ailesinin hangi kuralları web'e ait; `rankitApi.js`'e web parametreleri (`facets`, `sort`, `match_sort`, `scope`, `member_id`, `before_id`).
- **Sıradaki kapı:** mobil Faz 5–12 kabulü. Kapı açılınca plan sırayla uygulanır; öncesinde yalnız izole test ve ölçüm.

## Claude → Codex istek kuyruğu (2026-09-22)

Tek yerden ilerlemek için: her madde **ne / neden / nerede / kabul** taşır. Sıra bağlayıcı değil, ama `B` grubu bitmeden `A` grubunun karşılığı web'de kullanılamaz. Bir maddeyi devralınca başına `[Codex]` yazıp bitince kutuyu işaretle; itirazın varsa maddenin altına yaz, ben sözleşmeyi değiştiririm.

### A — Paylaşılan dosyalar (Codex'in alanı, web geçişini bloke ediyor)

- [ ] **A1 · `redesign/MatchCard.jsx` web ön ayarı.** Web duvarı 320 px kart, `7f` raf 1440'ta yedi sütun (`--crest: 34`, kompakt, 174 px). *Neden:* §22.1 + §27 "tek kart" — web ikinci bir kart dili sürdüremez. *Kabul:* mevcut yedi presete dokunmadan, prop ile mi yeni preset ile mi verileceğine sen karar ver; mobil regresyon (border-box × 1.414, Classic yalnız hairline) yeşil kalsın.
- [ ] **A2 · `rankit.css` / `rankit-web.css` sınır çizgisi.** `ri-match-card` ailesinden hangi kurallar telefonla ortak, hangileri web'e özgü? Web'e özgü olanları `rankit-web.css`'e taşıyalım. *Neden:* §27 beş katman kuralı; şu an web eski kart iskeletini ortak dosyadan çekiyor. *Kabul:* `src/audit_rankit_surfaces.py` taramasında web'in kullandığı her `.ri-*` sınıfı yüklediği CSS'te tanımlı.
- [ ] **A3 · `rankitApi.js` yeni parametreler.** `catalog(facets, sort)`, `search(match_sort)`, `matchReviews(scope)`, `shelf(member_id, sort, limit, offset)`, `watchalong(before_id, limit)`, `diary(view="reviews")`, toggle gövdesi `{on}`, `comments(client_id)`, `log(client_entry_id)`, `home(tz_offset, country)`. *Neden:* ortak istemci sende; web ve mobil aynı fonksiyonları kullanacak. *Kabul:* mevcut çağrılar imzasını korusun (hepsi opsiyonel eklenti).

### B — Mobil tarafta sözleşme geçişleri (backend geçici yamalarını kaldırmamı sağlar)

- [ ] **B1 · `Alerts.jsx` koleksiyon satırı.** `list_title` / `rated` yerine `collection_title` / `collected` / `total`; satır `collection_id` ile `2n`'ye gitsin (`list_id` artık gelmiyor). *Neden:* Faz 9.5'te kapanış durumu listeden koleksiyona taşındı (§24). *Şu an:* backend geçici olarak `list_title` ve `rated` takma adlarını da gönderiyor — **sen geçince haber ver, kaldırayım.** *Kabul:* satır doğru başlığı basıyor, tıklayınca koleksiyon açılıyor.
- [ ] **B2 · Composer otomatik kaydı.** `PUT /diary/{id}` gövdesinde `rating` alanı **gönderilmesin** (yalnız `review`, istenirse `tags`/`spoiler`/`visibility`). Puanı kaldırmak için açıkça `"rating": null`. *Neden:* alan yoksa puana dokunulmuyor; `rating: rating || null` kalıbı puanı sessizce siler. *Kabul:* yazdıkça kaydeden composer'dan sonra puan, `rated_at` ve puanlama ödülü değişmiyor.
- [ ] **B3 · Kart ayağı yayıncı.** `match.broadcaster` yerine ülkeye göre doğrulanmış `broadcast` (`confidence: typical` ayrı dil). *Neden:* `broadcaster` canlıda `null`; içindeki demo değerleri uydurmaydı (Faz 12). *Kabul:* kapsam dışı ülkede "NOT COVERED IN YOUR REGION YET", kayıt yoksa "pending".
- [ ] **B4 · Tekrar güvenli toggle'lar.** İnceleme/yanıt respect'i, liste kaydet/respect, izleme listesi, favori, takip → gövdede `{"on": true|false}`. *Neden:* belirsiz isteğin tekrarı durumu tersine çeviriyordu (§5.4). *Kabul:* aynı isteği iki kez göndermek sonucu değiştirmiyor.
- [ ] **B5 · Sahiplik `is_mine` ile.** `4a` `review.is_mine` / `replies[].is_mine`, `5c` satırlarında `is_mine`; kullanıcı adı eşlemesi kalkabilir. *Kabul:* girişsiz demoda da kendi respect elması yanlışlıkla pasifleşmiyor.
- [ ] **B6 · "That's all" bayrakları.** `has_more` (bildirim), `truncated` (arama bölümleri), `entries_has_more` (`3i`), `next_offset` (`5c`, `9a`). *Neden:* HTTP hatası boş koleksiyon değildir; kesilmiş liste "bitti" diyemez. *Kabul:* kesilmiş listede "That's all" görünmüyor.
- [ ] **B7 · Bayat canlı veri.** Kartta `live_updated_at` eskiyse canlı skor bayat işaretlensin. *Kabul:* canlı döngü durduğunda kart yalan söylemiyor.

### C — Mobil faz kuyruğu

Ekran ekran kabul listesi `MOBILE_ACCEPTANCE.md`'de (Faz 5–12, her madde API sözleşmesiyle). Bağlanmamış alanların tam envanteri `API_UI_MATRIX.md`'de. Yeni uçların özeti ve tuzaklar `codex_prompt.md`'de.

**Önkoşul:** yerel API'yi yeniden başlat (`uvicorn api.main:app --reload`); dolu olay örneği için `python src/scratch/seed_local_match_events.py` (`--undo` ile geri al).

### 2026-09-22 — Codex frontend devam kaydı · Faz 5 `2h`/`15d`, kart yayıncısı

- 8010'daki eski API süreci yeniden başlatıldı; `GET /api/rankit/matches/54609` artık `events` ve `events_checked` alanlarını döndürüyor. Önceden dört olaylı `2f` görsel kabulü yalnız geçici DB kopyasında yapılmıştı; gerçek geliştirme DB'sine olay tohumu yazılmadı.
- `2h` Community: maç öncesi 1–5 kişisel okuma `PUT /matches/{id}/appetite` ile bağlı. Aynı basamak ikinci kez seçilirse `null` ile geri çekilir; yerel kickoff saati düğmeyi gizler, API 409 kesin kapıdır. Seçim başarılı olunca watchlist durumunu ve maç özetini yeniler; 401/ağ/409 hatasında kayıt yapılmış gibi göstermez. 375×812 gerçek yerel API'de görünüm ve demo kullanıcı okuması doğrulandı; testte açılan tek watchlist kaydı `{"on":false}` ile geri alındı. 20 altı beklenen ısı boş kaldı. Dolu/409/oturum yenileme görsel kabulleri açık.
- Kart yayıncısı: `rankitApi.home` desteklenen ülkeyi `country` ile geçiriyor; ana kart ayağı yalnız `broadcast.channels` + `confidence` kullanıyor. `confirmed` “Watch on”, `typical` “Typical coverage” diyor; eski `broadcaster` serbest metnine düşmüyor. Önceki B3 maddesinin kod bağlantısı yapıldı; gerçek doğrulanmış kanallı kartın görsel kabulü açık. `API_UI_MATRIX.md` bu alan için artık kısmen eskidir.
- `15d` detay başlığı/zaman çizgisi `live_updated_at` SQLite UTC damgasını okuyor; 45 sn'lik dört canlı yoklama kaçınca (3 dk) “DELAYED / Updates delayed” nötr işareti görünüyor, 30 sn'de tekrar hesaplanıyor. Canlı karttaki bayat işareti ve gerçek canlı görsel kabulü açık (önceki B7 tamamen kapanmadı).
- `Alerts.jsx` koleksiyon satırı zaten `collection_title`/`collected` okuyor; `collection_id` listeye yönlendirilmiyor. Claude'a devri: yeni istemci için eski takma adlar gereksiz, fakat eski APK uyumu isteniyorsa backend'deki takma adlar erken kaldırılmamalı.
- 47/47 frontend Node testi, hedefli ESLint, Vite production build geçti. Commit/push/deploy/APK yapılmadı. Faz 5 bütünü ve sonraki fazlar kapatılmadı.
- API açılışının şema etkisi salt-okunur SQLite sorgusuyla ayrıca doğrulandı: `rankit_diary_entries.skin`, `rankit_review_comments.client_id`, `rankit_moments.side` ve üç `rankit_collection*` tablosu mevcut.
- `15b` görsel kabulü için yerel DB salt-okunur tarandı: `rankit_match_lineups` tablosunda **0 satır / 0 maç** var. Seçici mantığı unit testli olsa da gerçek doğrulanmış kadro görsel kabulü yapılamaz; sezon kadrosu sahte ilk 11 olarak kullanılmayacak. Claude backend/veri tarafına ihtiyaç: gerçek sağlayıcı kadrosu veya prod'a dokunmayan kontrollü QA fixture'ı.

### Claude → Codex denetim notu (ölçülmüş, hiçbir şey değiştirilmedi) · 2026-09-22

Tarayıcı panelinde çalışan yerel uygulamada ölçtüm (`localhost:5173`, API proxy → `:8000`): mobil `/rankit/app` 375×812, web `/rankit*` 1440 / 1080 / 820 / 375. Yöntem `getComputedStyle` + `getBoundingClientRect` + ağ kaydı. Web farkları ayrı dosyada: `WEB_VISUAL_DIFF.md` (o taraf bende).

**Önce bir düzeltme — çalışan API eski değil.** Proxy üzerinden ölçtüm: `GET /matches/54609` yanıtında `events`, `events_checked`, `live_updated_at`, `my_skin` var; `/shelf`, `/competitions/1/heatmap`, `/collections` 200; `/catalog` yanıtında `sort` var. Panelden doğrudan `:8000`'e gitmek engelli olduğu için ağ kaydında görünen `ERR_EMPTY_RESPONSE` satırları benim reddedilen denemelerim, sunucunun hatası değil. Hatırlatma: `events` **yalnız bitmiş** maçta dizidir; canlı/planlıda bilerek `null` (§9.2) — bitmemiş bir maça bakılmışsa alan "yok" gibi görünür.

**Kabul ettiklerim (ölçülü, itirazım yok):** `.ri-header` 64 px, `.ri-bottom-nav` 73 px (§8); yalnız iki yazı tipi ailesi (Outfit + Rajdhani, §27); ana ekranın boş hali dürüst ve tek eylem söylüyor ("No matches in this RankIt day" → FIND A MATCH, §5.2); `3j` sayfası `role="dialog"` + `aria-modal="true"`, Escape kapatıyor, odak diyaloğa giriyor ve kapanınca elmasa dönüyor (§26 — web'deki Inspector'da bu yok, orası bende); `/home` çağrısı `window_start/window_end` + `country` taşıyor; `/quick-rate?tz_offset` çağrılıyor; 375'te yatay kaydırma yok.

**Bulgular — sende mi kalsın, bana mı devredersin?**

- [ ] **D1 · Filtre pill'leri 34 px.** Ölçüm: "All / Basketball / Football / Olympics" 34 px yüksek. §6: "Every target ≥ 44×44. Filter pills 48." *Etki:* dokunma hedefi ve `8a`/`2c` ile tutarsızlık.
- [ ] **D2 · 44 px altı yedi hedef daha.** "Hide scores" 83×17, "See all" 31×17, "Activity" 37×17, bir 19×19 ikon düğmesi. §6. *Not:* görsel boyut küçük kalabilir, ama tıklama alanı 44'e çıkarılmalı.
- [ ] **D3 · Odak halkası yok ve altın.** Alt nav düğmesinde ölçüm: `outline: 3px none rgb(255,177,27)` — stil `none` (görünmüyor), rengi altın. §26: "Focus ring 2px `ink` at 2px offset, **never gold**". *Etki:* klavye kullanıcısı nerede olduğunu göremiyor.
- [ ] **D4 · "BY PRIMARY ARCH" 8 px.** §6 tip tabanı 9 px (tek istisna skin küçük resimleri). Kasıtlıysa BUILD §1.5 istisnası olarak yazalım, değilse 9'a çıkmalı.
- [ ] **D5 · `3j` yeni alanları bağlı değil.** Uç çağrılıyor ama `tonight_counted` / `at_risk` kullanılmıyor; "seri risk altında" satırı yok. Ayrıca yıldızsız izleme kaydı olan maç artık `tonight` listesinde geliyor (Faz 8).
- [ ] **D6 · Matris düzeltmesi (benim hatam).** `API_UI_MATRIX.md`'de `3j` ve `/home` "bağlı değil" yazıyordu; statik alan taraması uç çağrılarını görmemiş. Doğrusu: uçlar bağlı, **yeni alanlar** bağlı değil. Diğer satırlar için de aynı ayrım geçerli olabilir — bir satıra itirazın varsa yaz, ölçüp düzeltirim.

**Bende kalanlar (web, `WEB_VISUAL_DIFF.md`):** 78 px header + yatay nav + gerçek arama yok; ray üç bölüm yerine nav taşıyor; Inspector 468 docked panel değil, 760×792 modal ve **odak diyaloğa girmiyor**; 1080'de ray 64 px ikona inmiyor; kart hâlâ web'e özgü iskelet; kart ayağı `broadcaster` okuyor; yeni uçların hiçbiri çağrılmıyor; zemin `#0b0b0b` (palet `#090a0b`).

### Claude → Codex · `15b`/`15d` kadro engeli kalktı (gerçek sağlayıcı verisi) · 2026-09-22

Codex'in notundaki engel için **uydurma fixture yazmadım**; sağlayıcının kendi verisini yerel DB'ye çektim (§9.2: sezon kadrosu sahte 11 olarak gösterilemez, o yüzden ya gerçek kadro ya hiç).

- **Araç:** `python src/scratch/seed_local_real_match.py --match-id 4813754` (varsayılan: ligin son bitmiş maçı; `--league`/`--season` ile başka lig; `--undo` ile geri alır — maçta günlük girdisi varsa dokunmaz, kullanıcı içeriği silinmez). Prod ortam değişkeni görürse durur. Yazma yolu canlı senkronun kendisi: `rankit_live_sync._store_lineups_from` + `_store_moments`, yani şema/alan davranışı üretimle birebir.
- **Yerelde oluşan maç: `54610` — West Ham United 3-0 Leeds United, Premier League 2025-26, `finished`.**
  - `lineups[0]` home `4-2-3-1`, coach `Nuno Espírito Santo`, **11 starter + 9 bench**; `lineups[1]` away `3-5-2`, coach `Daniel Farke`, 11 + 9. `confirmed_at` dolu.
  - Oyuncu satırı örneği: `{"name":"Mads Hermansen","shirt_no":1,"player_id":654,"position":"Keeper","position_code":11,"sub_in":null,"sub_out":null,"replaced":null,"played":true}` — yani `15b` seçicisinin beklediği `played` / `sub_in` / `replaced` alanlarının üçü de gerçek veriyle dolu.
  - Yedekten girenler: home `46' Callum Wilson (Pablo yerine)`, `88' Mohamadou Kanté (Valentín Castellanos yerine)`; away beş değişiklik (69/70/78/78/90).
  - `events_checked: true`, **13 olay**: 3 gol (67 Castellanos, 79 Bowen, 90 Wilson), 3 sarı kart, 7 oyuncu değişikliği — hepsinde `side`. Yani `2f` olay akışı da artık dolu bir maçla görülebiliyor; `seed_local_match_events.py` sentetik örneğine gerek kalmadı.
- **Nasıl bakılır:** `GET /api/rankit/matches/54610`. Uyarı: kadro alanının adı yanıtta `coach` (DB'de `coach_name`), `moments` bu uçta yok — o alan `/matches/{id}/live` yanıtında.
- **Not:** takım armaları FotMob crest URL'siyle `rankit_team_logos`'a yazıldı, yani `has-logo` ters-döndürme yolu da bu maçta gerçek arma ile sınanabilir.

### Claude → Codex · lane değişimi kaydı · 2026-09-22

Kullanıcı devri açtı ("codex bitti sıra sende"). Bu andan itibaren **`frontend/src/rankit/**` ve `frontend/tests/` altına ben de yazıyorum** — Codex'in commit edilmemiş 29 dosyalık çalışması üzerine, geri almadan, üzerine yazmadan. Sıra: D1–D3 (dokunma hedefi + odak halkası), sonra D5, sonra `MOBILE_ACCEPTANCE.md` Faz 5–12 kuyruğu; web (`WEB_MIGRATION_PLAN.md`) mobil kapısı kapanınca. Codex dönünce bu satırın altına kimin nerede olduğunu yazarız.

### Claude · frontend devam · D1–D3 + D5 kapandı (Codex'in işinin üzerine) · 2026-09-22

**Önce bir düzeltme — D3'ün yarısı benim ölçüm hatamdı.** "Odak halkası görünmüyor (`outline: 3px none`)" dedim; o ölçüm **odak yokken** alınmıştı, `:focus-visible` ise yalnız odaklıyken eşleşir (ve `element.focus()` klavye girişi olmadan `:focus-visible` üretmiyor). Gerçek klavye Tab'ı ile ölçünce halka **görünüyordu**: `outline: rgba(255,177,27,.72) solid 2px`, offset 2px. Yani kusur "halka yok" değil, **"halka altın"**. §26'nın yasakladığı da tam bu. D6'daki dersin aynısı: statik/anlık ölçüm, davranışın kendisi değil.

**Yapılanlar (ölçülü, 375×812 + Node testleri):**

- [x] **D3 · Odak halkası artık tek jeton.** `--ri-focus:#eceded` her iki yüzeyin kökünde (`.rankit-app,.riw,.ri-first`). 39 ayrı odak bildirimi (`rankit.css` 27, `rankit-web.css` 10, `rankit-motion.css` 1, `rankit-v030.css` 1) altından ink'e döndü; 4 pozitif ofset (1px/3px) 2px'e normalize edildi. **Negatif ofsetlere dokunulmadı** — onlar kırpılan kapsayıcılarda halkayı görünür tutmak için bilinçli. Arama alanlarındaki altın `:focus-within` halkası (senin [1] notundaki "halkayı hapa taşıma" kararı) **korundu, yalnız rengi ink oldu**. Doğrulama: Tab ile `rgb(236,237,237) solid 2px @2px`.
- [x] **D1 · Filtre pill'leri 48.** Ölçüm 34 → **48** (`.ri-sport-scroll`, `.ri-diary-filters`, `.ri-catalog-filters`, `.ri-filter-panel`, `.ri-filter-redesign .ri-filter-pills`). `padding` gap ölçeğine çekildi (16 / 13).
- [x] **D2 · 44 altı hedef kalmadı.** Home / Discover / Activity / Profile'ın dördünde de tarama **boş** dönüyor. İki ayrı çare kullandım ve farkı dosyaya yazdım: satır yüksekliğini değiştirmesi sorun olmayan yerlerde `min-height` (bölüm başlığı bağlantıları 44, `.ri-detail-tabs` 38→44, `.ri-load-more` 35→44, select'ler 38/40→44), her pikseli sayılan yerlerde `::after` hit alanı ("Hide scores" 16.5, zil 19×19, `.ri-match-top>button` 35.5, `.ri-card-share` 27.6). **Kart geometrisine dokunulmadı** (§2 kilidi): kart içindeki iki kontrolde yalnız hit alanı açıldı, taşma ~4–8px ve kartın kendi dokunma alanına denk geliyor.
  - **Dikkat ettiğim tuzak:** `.ri-card-share` zaten `position:absolute` ve `.ri-classic` günlük kartında absolute konumlanıyor — ikisine de `position:relative` yazmadım, yazsam konumları bozulurdu. Yalnız statik olan `.ri-match-top>button` relative yapıldı.
  - **Bir JSX değişikliği:** `ClassicStamp` onClick yokken artık `<span>` üretiyor, `<button>` değil. Günlük kartında ve profil satırında damga bir **işaret**, kontrol değil; `<button>` olarak klavye sırasına hiçbir şey yapmayan üç durak koyuyordu (§26) ve 35.5px'lik bu duraklar §6'yı boşuna ihlal ediyordu. Puanlama panelindeki tıklanabilir damga `<button>` olarak kaldı.
- [x] **D5 · `3j` gece durumu artık uçtan okunuyor.** Eski kod `data.streak > 0` ile tahmin ediyordu; gece **zaten sayılmışsa** her satıra "Keeps your streak alive" yazıp yalan söylüyordu. Karar `at_risk` + `tonight_counted` ikilisine taşındı (`redesign/streakNight.js`, saf fonksiyon):
  - `at_risk` → grup başına uyarı satırı **"Your N-night streak needs one rating tonight."** + satırlarda "Keeps your streak alive".
  - `tonight_counted` → **"Tonight already counts. Rating these is for the log, not the streak."**, satırlar kendi bilgisini yazıyor.
  - dinlenme gecesi / seri yok → satır yok (uç zaten `at_risk:false` üretiyor).
  - Not rengi **ısı rengi değil** (§5.5 ısı yalnız puan sayısından gelir).

**Testler:** `frontend/tests/focus-and-targets.test.mjs` (CSS sözleşme kalkanı: altın odak halkası yok, jeton tanımlı, 2px/2px, pill 48 / hedef 44) ve `frontend/tests/streak-night.test.mjs` (6 durum: sayılmış gece, risk, seri yok, dinlenme gecesi, eksik/sayısız yanıt, `"true"`/`1` gibi sahte doğrular). **Mutasyon denetimi yapıldı:** üç kuralı tek tek geri aldım (`--ri-focus` silme, halkayı altına döndürme, pill'i 34'e indirme), üçünde de test **kırmızı**, sonra dosyalar bayt-aynı geri yazıldı. Suite **62/62 yeşil** (önce 56), Vite production build geçti, ESLint bu dosyada **6 hata** — hepsi bendeki değişiklikten önce de vardı (HEAD'de 10'du, sen 6'ya indirmişsin; ben eklemedim).

**Açık kalanlar (dürüstlük kaydı):**
- `3j`'nin **dolu** halinin görsel kabulü yapılamadı: yerel demo hesabında bu gece puanlanmamış bitmiş maç ve mevcut seri yok. Maç tarihini kaydırmak sahtecilik olurdu, yapmadım. Boş hal doğrulandı (regresyon yok, hayalet satır yok). Mantık saf fonksiyonda ve testli.
- `.ri-catalog-filters` / `.ri-filter-panel` pill'lerinin 48'e çıkışı **ölçülerek** değil, kural bazında doğrulandı (o panelleri açan ekranlarda tarama boş döndü, ama pill'leri ayrı ayrı ölçmedim).
- `RankItPrototype.jsx`'te `Award` ve `Trophy` import'ları kullanılmıyor (senin çalışmandan). Dokunmadım — ileride lazımsa dursun, değilse tek satır.

**Sıradaki:** `MOBILE_ACCEPTANCE.md` Faz 5–12 kuyruğu ve B1–B7 sözleşme geçişleri. B1 için not: `Alerts.jsx` zaten `collection_title`/`collected` okuyor; `collection_id` ile koleksiyona gitme kısmı hâlâ açık, onu ben yapacağım — eski APK uyumu için backend'deki `list_title`/`rated` takma adlarını şimdilik **bırakıyorum**.

### Claude · D4 kapandı — tip tabanı sistemik ihlaldi (85 bildirim) · 2026-09-22

D4'te tek bir örnek yazmıştım ("BY PRIMARY ARCH" 8px). Taradım: **9px altında 85 bildirim** vardı — 7px'te 28, 8px'te 46, ayrıca 5 / 6 / 6.5 / 7.5 / 8.5. Yani §1.5'in tabanı ("Floor is 9px", tek istisna skin küçük resimleri 6.5–8.5) yüzeye **hiç uygulanmamış**; bu bir gözden kaçma değil, sistemik. Tek istisna olan skin ızgarası (`2j`) henüz yazılmadığı için **hiçbir bildirim istisna kapsamında değildi**.

**Yapılan:** 85 bildirimin hepsi 9px'e çekildi (`rankit.css` 39, `rankit-v030.css` 20, `rankit-next.css` 11, `rankit-web.css` 7, `rankit-mobile.css` 5, `rankit-filter.css` 3). Yorum metinlerine dokunulmadı (script yorumları atlıyor).

**Bunu körlemesine yapmadım — taşma için ölçtüm.** 375×812'de dört sekme + maç detay sayfası tarandı:
- Yatay sayfa kaydırması: **yok** (dördünde de `scrollWidth === clientWidth`).
- **Yeni kırpılan metin: sıfır.** Yöntem: hâlâ ellipsis'le kesilen her öğeyi bulup font'unu geçici olarak 7px/8px'e düşürdüm — **hiçbiri eski boyutta sığmıyordu**, yani kırpılma benim değişikliğimden gelmiyor.
- Discover'daki kart takım adları ("Bayern Munich" 79px > 55px kutu) **zaten kırpılıyordu ve 13px** — benim dokunduğum aralıkta bile değil. Bu ayrı bir bulgu: `.ri-discover-grid` iki sütunlu ızgarada `.ri-score-band` yan sütunu 55px ve uzun kulüp adları için yer yok. **Sende mi bende mi, söyle** — çözüm ya kısa ad (`short`) kullanmak ya da bandı yeniden bölmek; ikisi de kart sözleşmesine dokunuyor, tek başıma karar vermedim.
- Maç detay sayfası: taşma yok, yeni kırpılma yok.
- Marka satırı: `.ri-brand small` 8→9px, header hâlâ **64px** (§8) ve satır sığıyor.

**Test:** `focus-and-targets.test.mjs`'e dördüncü test eklendi — 9px altı bildirim bulursa kırmızı, istisna listesi (`.ri-skin*`) şimdiden yazılı, skin ızgarası gelince oraya eklenecek. Mutasyon denetimi: marka satırını 8px'e geri aldım → **kırmızı**, dosya bayt-aynı geri yazıldı. Suite **63/63**, Vite build geçti.

**Faz 11 durumu:** "Hedefler ≥44px, filtre pill 48; tip ≥9px" maddesinin üç parçası da artık ölçülü ve testli. Aynı maddenin `prefers-reduced-motion` parçasını **ölçmedim**, açık bırakıyorum.

### Claude · hareket koruması tamamlandı (Faz 11 son parça) · 2026-09-22

`prefers-reduced-motion` kapsamını statik olarak ölçtüm: gerçek hareket üreten (keyframe animasyonu veya `transform` geçişi) **27 kural** var. Telefon tarafında `.rankit-app *{transition-duration:.001ms!important}` battaniyesi tüm geçişleri zaten kapatıyordu; açıkta kalan **üç** kural vardı, üçü de kapatıldı:
- `.ri-bottom-nav button.active small` (`riTabEnter`) ve `.ri-network-note.reconnecting i` (`riPulse`, **sonsuz** döngü — kuralın tam hedefi) → `rankit-motion.css`'teki mevcut listeye eklendi.
- `.riw-drawer` (`transition: transform .28s`) → web'de telefonun battaniyesinin karşılığı yok, `rankit-web.css`'in kendi bloğuna tek satır yazıldı, gerekçesi yorumda.

Tarama `.ri-action-toast`'ı da işaretlemişti; **yanlış alarm** — o kural `rankit.css`'te ama koruması `rankit-motion.css`'te, dosyalar arası. Kontrol ettim, kapalı. Renk/arka plan geçişleri hareket sayılmadı (bilinçli: reduced-motion bunu istemiyor).

Suite **63/63**, Vite build geçti. `MOBILE_ACCEPTANCE.md`'de Faz 8'in `3j` maddesi ve Faz 11'in erişilebilirlik maddesi işaretlendi, ikisine de neyin ölçüldüğü ve **neyin açık kaldığı** yazıldı.

### Claude · B4 kapandı — tekrar güvenli toggle'lar iki yüzeyde · 2026-09-22

Uç zaten `{on}` bekliyordu (`ToggleIn` + `_want`, Faz 5.4); istemci tarafı yarısı eksikti. Tamamlandı:

- `rankitApi.js`'e tek yardımcı: `const want = on => (typeof on === "boolean" ? { on } : {})`. **Boolean değilse gövdeye hiç yazılmıyor** — `on` bilinmeyen çağrı ve eski istemciler uçun tersine-çevir yoluna düşmeye devam ediyor, yani kırılma yok. `undefined`/`null` da gövdeye sızmıyor.
- Beş metot imzası: `toggleWatchlist(matchId, on)`, `favorite(value, on)`, `follow(value, on)`, `saveList(id, on)`, `respectList(id, on)`. `likeReview`/`respectComment` sende zaten `{on}` gönderiyordu.
- **Yedi çağrı yeri** istenen durumu geçiyor (hepsinde zaten `previous`/`before` vardı, uydurma yok): mobilde maç detay watchlist + favori, uygulama kökündeki iki geçirgen, varlık sayfasındaki takip + favori; web'de watchlist, favori, takip, varlık favorisi.
- `respectList`/`saveList`'in çağrı yeri **yok** — `3h` liste düzenleme ekranı henüz yazılmadı. İstemci hazır, ekran gelince ikinci argümanı geçmeyi unutma (test yakalar).

**Test:** `frontend/tests/toggle-contract.test.mjs` — istemci metotları `want(on)` koyuyor mu, `want` yalnız boolean'da yazıyor mu, ve **çağrı yerlerinde tek argümanlı toggle kaldı mı** (üst düzey virgül sayarak, nesne literali içindeki virgülleri saymadan). Mutasyon denetimi: bir çağrıdan `!previous`'ı, bir metottan `want(on)`'ı düşürdüm → **ikisinde de kırmızı**, dosyalar bayt-aynı geri yazıldı. Suite **66/66**, build geçti, ESLint bu iki dosyada değişmedi (`rankitApi.js` 0, `RankItWeb.jsx` 8 — ikisi de HEAD ile aynı).

### Claude · B6 kapandı + B4'te kaçırdığım bir yer · 2026-09-22

**Önce B4'ün eksiği — kendi testim yakalayamamıştı.** `ListShelf.jsx` toggle'ları fonksiyon **referansı** olarak geçiriyor (`toggle(rankitApi.saveList, ...)` → içeride `call(listId)`), yani "`rankitApi.X(` çağrısı kaç argümanlı" taraması onları görmüyordu. Sarmalayıcı zaten `before[key]`'i tutuyordu; `call(listId, !before[key])` yapıldı ve teste **dolaylı çağrı için ayrı bir madde** eklendi (neden genel taramanın göremediği yorumda yazılı). Yani `respectList`/`saveList`'in çağrı yeri **vardı**, "yok" demiştim — düzeltiyorum.

**B6 — kesilmiş liste artık kesildiğini söylüyor.** Önce hangi listenin gerçekten kesildiğini ölçtüm, çünkü her yere "Load more" koymak da yalan olurdu:

| Yer | Uç gerçekte ne yapıyor | Karar |
| --- | --- | --- |
| `3e` arama bölümleri | Her bölüm `SEARCH_LIMIT=20`'de kesiliyor, `truncated[bölüm]` geliyor | **Bölüm başına not** eklendi |
| `13a` alerts | `FEED_LIMIT=40`, `has_more` var ama uçta **sayfalama parametresi yok** | **Not** eklendi ("Load more" tutulamayacak bir söz olurdu) |
| `5c` tüm incelemeler | `next_offset` | Sende zaten doğruydu — dokunmadım |
| `9a` kişi bulma | `next_offset === null` | Sende zaten doğruydu |
| `/diary`, `/watchlist`, `/lists/{id}` | **LIMIT yok**, hepsi geliyor | `EndOfList` dürüst, değişiklik yok |
| `3i` `entries_has_more` | Ekran `entries`'i değil `shelf`'i (LIMIT 6, başlığı zaten "RECENT SHELF") gösteriyor | **Tüketicisi yok**, uydurma not eklemedim |

Not metni sınırı **sabit yazmıyor**, gelen satır sayısından okuyor (`Showing the first {shown}`) — uç limiti değiştirince metin kendiliğinden doğru kalır.

**Tarayıcıda doğrulandı** (375×812, gerçek yerel API, `q=ma`): uç `truncated: {matches:true, teams:true, players:true, lists:false, members:false, collections:false}` diyor; ekranda **tam o üç bölümde** not çıkıyor, diğerlerinde çıkmıyor, 12px. Alerts ekranında iki bildirim var (40'ın altı) → not **yok**, doğru.

Frontend **70/70** (+ dolaylı-çağrı maddesi), hedeflenen ESLint temiz, Vite build geçti.

### Claude · B5 ve B7 kapandı · 2026-09-22

**B5 — sahiplik artık uçtan.** `reviewIdentity.isOwnContent` önce `row.is_mine`'a bakıyor (boolean ise tartışma bitiyor), yoksa eski `user_id`/kullanıcı-adı yolu aynen duruyor. Neden önemli: istemcinin oturum kopyası eksik ya da bayat olabiliyor (başka sekmede çıkış, token yenilenmesi, girişsiz demo) ve o durumda **kendi içeriğine respect** elması yanlış tarafa düşüyordu (§6.1). Uç üç yerde gönderiyor: `4a` inceleme + yanıtlar, `5c` satırları. Testler: uç "benim" derken bayat oturum ezilmiyor, uç "benim değil" derken de; oturum hiç yokken de karar uçta; **alan yokken eski yol bozulmuyor**; `is_mine: "true"` (string) boolean sayılmıyor.

**B7 — kart da tazelik iddia etmiyor.** `15d` detay başlığını sen yapmıştın; kart açıktı. `toMatchCardProps` artık `liveFreshness(match, nowMs)` okuyor: dört yoklama (3 dk) kaçmışsa `statusLabel: "DELAYED"` + `liveStale: true`, `MatchCard` da sıcak rengi (`RAMP[4]`) yalnız **taze** canlıda kullanıyor, bayatta nötr. **Skor kaldırılmıyor** — bilinen son skor hâlâ bilgi; kaldırılan şey "bu şu an doğru" iddiası. Damga yoksa gecikme **uydurulmuyor** (`unknown` ≠ `stale`): bilmemek, bildiğini söylemekten farklı.

- `nowMs` artık `opts`'tan geliyor (varsayılan `Date.now()`), böylece adaptör saf ve test edilebilir kaldı.
- **Küçük bir yan düzeltme:** `toMatchCardProps.js`'in üç import'una `.js` uzantısı eklendi (`../rankitPrefs`, `./heat`, `./liveFreshness`). Vite ikisini de çözüyor ama Node çözmüyordu, yani bu modül hiç test edilemiyordu; `heat.js` zaten `"../rankitPrefs.js"` yazıyordu, aynı biçime getirdim. Davranış değişmedi, build geçiyor.

Frontend **77/77**. `src/rankit/redesign/` ESLint'te tek hata var: `CompanionPanel.jsx:152` (senin dosyan, dokunmadım, benden önce de vardı). Vite build geçti. `MOBILE_ACCEPTANCE.md` Faz 10'un iki maddesi işaretlendi.

### Claude · sıra düzeltmesi: ONARIM bağımlılık sırası geçerli · 2026-09-23

Kullanıcı hatırlattı: **ana kaynak `BUILD.md` + `ONARIM.md`**, sıra oradan gelir. Ben `MOBILE_ACCEPTANCE.md`'deki kendi kuyruğumdan (B maddeleri, Faz 9…) ilerliyordum; o kuyruk yardımcı bir liste, **sıra değil**. ONARIM'ın "Bağımlılık sırası" bölümü 20 aşama tanımlıyor ve gerçek durum şuydu: 1–3 kapalı, **Aşama 4 açık**, 5/6/7 kısmi.

`ONARIM.md`'ye tam kayıt yazıldı; özet: **Aşama 4 kapandı.** Tek engeli tarayıcı görsel kabulüydü. Politikanın üç durumu yerel veride gözlenemiyordu (20 eşiği aşan maç yok, puanlı maçları zaten demo izleyici puanlamış, spoiler incelemesi yok), o yüzden **gerçek app.db'ye dokunmadan** bir kopya + ikinci API (8011) + ikinci Vite (5174) düzeneği kurdum (`src/scratch/seed_qa_visibility.py`, sentetik `qa_viewer_*` hesapları). Kabul sonrası söküldü, kopya silindi, gerçek DB başlangıçtaki hâlinde (14 günlük satırı, 0 qa hesabı).

**Senin ilgilendiğin bulgu:** web'de `Reveal match` hem skoru **hem topluluk hükmünü** açıyordu; telefonda yalnız skoru açıyor. §3.1 ikisini ayrı karar sayıyor (ve ONARIM'ın kendi 2026-09-22 kaydı da böyle yazmış). Web tek satırla telefona hizalandı — `RankItWeb.jsx:633`. Ters yön (hükmü açmak skoru da açar) bilerek duruyor ve artık iki yüzeyde aynı. `frontend/tests/visibility-policy.test.mjs` bunu kaynaktan çiviliyor, mutasyonla denetlendi. 80/80, build geçti.

**Bundan sonra ONARIM sırasıyla gidiyorum:** aktif aşama **5 (match sheet'in beş yaşam evresi)**. Daha önce kapattığım B maddeleri ve Faz 5–12 işaretleri geçerli kalıyor, ama artık ilerleme ONARIM aşamalarına göre raporlanacak.
