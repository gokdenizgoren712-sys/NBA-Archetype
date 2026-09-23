# Web geçiş planı — `web/cards.jsx` ve `web/rankit-web.css`

**Yazan:** Claude · **Tarih:** 2026-09-22 · **Eş belgeler:** `API_UI_MATRIX.md`, `MOBILE_ACCEPTANCE.md`, `frontend_code.md`
**Kapı:** Mobil Faz 5–12 kabulü kapanmadan bu plandaki hiçbir madde uygulanmaz (BUILD Part IV: "do not start web until mobile is done"). Bu belge yalnız hazırlık: ölçülmüş mevcut durum + iş sırası.
**Sahiplik (kapı açılınca):** `frontend/src/rankit/web/**` ve web testleri Claude'da. `redesign/MatchCard.jsx`, `rankit.css`, `rankitApi.js` Codex'te kalır — oradaki her ihtiyaç `frontend_code.md` üzerinden istenir, doğrudan yazılmaz.

---

## 1. Ölçülen mevcut durum (kanıtla)

**Doğru olan ve korunacak:**
- `web/cards.jsx:78` — arma alanı `crest_url` (API'nin adı). `web/cards.jsx:84` — `has-logo` sınıfı ters-döndürmeyi taşıyor. **İkisi de daha önce kırılmıştı; regresyon yasak** (BUILD Phase 13 notu).
- `web/cards.jsx:5` — `formatWhen` telefonla ortak tek tarih biçimleyici.
- `web/cards.jsx:4,97-103` — ısı ve topluluk hükmü kapısı ortak `redesign/heat.js`'ten (20 eşiği, `REVEAL ANYWAY`).
- `rankit-web.css:11` — ray 232 px; `:135` — duvar `repeat(auto-fill, minmax(320px, 1fr))` (§18).
- `RankItWeb.jsx:111-140` — rayda marka kilidi (`RANKIT` + `BY PRIMARY ARCH`), dört bölüm + Rank düğmesi; `riw-rail-foot`'ta hesap satırı.
- `rankit-web.css:500,669` — `prefers-reduced-motion` blokları var.

**Sapmalar (iş listesi buradan çıkıyor):**

| # | Ölçüm | Kaynak | Sapma |
| --- | --- | --- | --- |
| S1 | `web/cards.jsx:93` kendi `MatchCard`'ını çiziyor (`ri-match-card`, eski v0.3 iskeleti) | BUILD Phase 13 "`web/cards.jsx`'i yeni geometriye taşı", §27 tek kart | Telefon yeni karta geçti (`redesign/MatchCard.jsx`: `data-match-card`, `crestSize`/`artHeight`/`scoreSize` ön ayarları, çentik, ısı çubukları). Web ikinci bir kart dilini sürdürüyor. |
| S2 | `rankit-web.css:103` `--riw-filter: 216px` ayrı filtre sütunu | §23.1 "filters live in the rail" (`8a`) | Filtreler rayın içinde olmalı; ikinci sütun duvarı daraltıyor. |
| S3 | `RankItWeb.jsx:394,595` Inspector mobil `ri-sheet` sınıflarıyla | §19 "Inspector 468 docked", header 56 (etiket, küçült, kapat) | Docked 468 panel yok; alt sayfa web'e taşınmış. Küçült düğmesi var (`:600`) — korunacak. |
| S4 | `rankit-web.css:604` 1080'de `.riw-main` tek sütuna iniyor | §25 "1080: rail collapses to a 64px icon column" | Yanlış eşik davranışı: ray daralmalı, içerik sütunu değil. |
| S5 | `rankit-web.css:610-658` 820'de ray alt navigasyona dönüyor (5 sütun) | §25 "820: rail behind a menu; Inspector full-width bottom sheet" | Alt nav telefon kalıbı — kabul edilebilir yön, ama Inspector'ın tam genişlik alt sayfaya dönmesi ve rayın menüye girmesi ayrıca kurulmalı. |
| S6 | `web/cards.jsx:161` kart ayağı `match.broadcaster` | Faz 12 | Alan canlıda `null`; doğrulanmış `broadcast` (ülkeye göre) kullanılmalı. |
| S7 | Duvar dışındaki ızgaralar (`:578` 3 sütun, `:787` oyuncu satırı) | §18 "wall is 320 in **every** web grid" | Kart taşıyan her ızgara 320 olmalı; kart taşımayanlar kapsam dışı — tek tek doğrulanacak. |
| S9 | Üst header **yok**: nav rayda dikey (`RankItWeb.jsx:127`), her sayfa kendi `riw-head` başlığını çiziyor (`rankit-web.css:93`, sabit yükseklik yok) | §17 "header 78 sticky — lockup, nav, search, shield, streak, avatar" | Kabuk 78 px'lik üst header'a taşınmalı; nav yatay dört öğe, altın aktif, 38 px yüksek. `riw-filters`'ın `top: 78px` değeri bu header'ı varsayıyor ama header yok. |
| S10 | Arama rayda modal açan düğme (`RankItWeb.jsx:123`) | §17 "Search is a real field in the header with a `/` hint, **not an icon that opens a modal**" | Header'da gerçek alan + `/` kısayolu; sonuçlar `11c`. |
| S11 | Rayda üç bölüm yok (marka + arama + nav + hesap var) | §17 "The rail holds the three things the phone buries one tap deep" (`7a`: STANDING, THE HUNT, FOLLOWING) | Ray içeriği standing (`/rank`), aktif koleksiyonlar (`/collections`), takip edilen kulüpler (`/onboarding.followed_clubs`) ile kurulur; nav header'a taşınır. |
| S8 | Web hiçbir yeni ucu okumuyor (`API_UI_MATRIX.md` §2) | Faz 13–16 | `facets`, `sort`, `avg_heat`, `heatmap`, `shelf`, `top_tags`/`spread`, `scope=following`, arama `counts`, `12a` sezon bloğu, `lists/mine`, `account`, bildirim `channel` bağlanmamış. |

---

## 2. İş sırası

### P0 — regresyon kalkanı (ilk iş, kod değiştirmeden önce)
- [ ] `frontend/tests/web/` altında (kapı açılınca benim alanım) izole testler: `crest_url` okunuyor mu, `has-logo` sınıfı basılıyor mu, `formatWhen` ortak mı, spoiler kapısı 20 eşiğinde mi. Kaynak: `tests/fixtures/web/dolu/*.json` (üretimi: `pytest tests/test_web_contracts.py`).
- [ ] `src/audit_rankit_surfaces.py` koşulur: web'in kullandığı `.ri-*` sınıfları yüklediği CSS'te tanımlı mı (sessiz kırık taraması).

### Faz 13 — temel (`7a`)
- [ ] **S1:** `web/cards.jsx` içindeki `MatchCard` kaldırılır; duvar ortak `redesign/MatchCard`'ı web ön ayarlarıyla çizer (`--crest`, `artHeight`, `scoreSize` §2.6 tablosundan; duvar kartı 320 genişlikte). `RankItMark`, `Stars`, `TeamMark` kalır (marka ve seçici parçaları).
- [ ] Ortak bileşene web'e özgü bir davranış gerekiyorsa (kart tıklayınca Inspector'a yazma) prop ile geçilir; `MatchCard.jsx` içinde web dalı açılmaz — gerekirse Codex'ten istenir.
- [ ] **S6:** kart ayağı `broadcast` (ülke + `confidence`), `broadcaster` okunmaz.
- [ ] **S9:** 78 px yapışkan üst header kurulur: marka kilidi, yatay dört öğeli nav (aktif altın, 8 px yarıçap, 38 px), arama, kalkan, seri halkası, avatar. Nav raydan header'a taşınır; sayfa başlıkları (`riw-head`) header'ın altında kalır ve `riw-filters`'ın `top: 78px` varsayımı gerçek olur.
- [ ] **S10:** arama header'da gerçek alan + `/` kısayolu (modal tetikleyici kalkar); sonuç yüzeyi `11c` Faz 16'da.
- [ ] **S11:** ray üç bölüm: standing (`/rank`), aktif koleksiyonlar (`/collections`), takip edilen kulüpler (`/onboarding.followed_clubs`).
- [ ] **Kabul:** 1440'ta yedi kart yan yana taşmadan; `crest_url` + `has-logo` testleri yeşil; `formatWhen` tek kaynak; ölçü: header 78, ray 232, duvar `minmax(320px,1fr)`; altın bütçesi bölge başına bir (nav elması muaf).

### Faz 14 — Inspector (`16c`, `15w`, `7b`, `15x`, `7c`, `16a`, `7d`, `16b`, `7e`, `11a`, `15y`, `15z`)
- [ ] **S3:** docked 468 panel (header 56: etiket / küçült / kapat), mobil `ri-sheet` yerine web sınıfları; küçült–gez–geri davranışı korunur.
- [ ] Beş evre tek maç nesnesinden: sekmeler sabit, içerik `status`'a göre (`API_UI_MATRIX` Faz 5 satırları; `events` yalnız bitmişte, canlıda Companion).
- [ ] `7e` tam ekran katman (scrim, glow, kart 452/`--crest` 76, kopya 400 sağda) — Inspector'ın içinde değil.
- [ ] `11a` quick-rate diyaloğu: duvarda karta odaklanıp `R`; `/quick-rate` verisi.
- [ ] `15y` oyuncu seçici diyalog (`played` olanlar, `player_id` ile oy); `15z` composer **panelde**, yazdıkça kaydeder — `PUT /diary/{id}` gövdesinde `rating` alanı **gönderilmez** (tuzak 1).
- [ ] **Kabul:** Escape, odak tuzağı, odağın geri dönmesi; beş evrede ekran kabulü; composer puansızken kapalı (`422`).

### Faz 15 — masaüstünün kazandığı üç ekran
- [ ] `7f` raf: `GET /shelf?sort=&limit=100`; sıralar görünür (dropdown değil); 1440'ta yedi sütun, `--crest: 34`, 174 px kompakt; `counts.cards`/`classic_cards`; `next_offset` ile devam.
- [ ] `7g` ısı haritası: `GET /competitions/{id}/heatmap`; 132 px etiket sütunu + `repeat(38, minmax(0,1fr))`, 20 px hücre, 3 px boşluk; `state` → rampa / kesikli / sönük; `logged` altın elmas; lejant zorunlu; `available:false` ise sekme yok.
- [ ] `7h` iki sütunlu okuma: sol 392 px (maç, `top_tags`, `spread`), sağ `column-count: 2` + `break-inside: avoid`; `scope=following` sekmesi.
- [ ] **Kabul:** ısı asla sayısız; 20 altı kesikli/boş; uzun inceleme kırpılmıyor.

### Faz 16 — kalan web yüzeyleri
- [ ] **S2:** filtreler raya taşınır, `--riw-filter` sütunu kalkar; seçenek sayıları `catalog?facets=true`, sıralar `sort=`.
- [ ] `8c` tablo + hafta yan yana, `avg_heat` sütunu; `8b` profil + `10a` kişiler tek ekran (uyum çubuğu + sayı); `11c` arama (`counts`, kulüp ısısı, ilişki, liste yazarı, `match_sort=hottest`); `12a` kulüp Inspector'da (`season`, `logged`, `hottest`, `next.collections`); `12b` listeler (`/lists/mine`); `12c` The Hunt ızgarası; `14a` tek ekran ilk kurulum (`account.email`); `14b` bildirim açılır menüsü (`channel`, `entry_id` ile derin bağlantı); `11b` skin + iki oranlı önizleme; `8d` durumlar.
- [ ] **Kabul:** her satır tam yüzeyi açıyor; boş hallerde `tests/fixtures/web/bos/*.json` davranışı.

### Faz 17 — responsive
- [ ] **S4:** 1080 → ray 64 px ikon sütunu (içerik sütunu değil).
- [ ] **S5:** 820 → ray menü arkasında, Inspector tam genişlik alt sayfa, kartlar tam genişlik; davranış uygulamayla aynı.
- [ ] **Kabul:** üç eşikte ölçülü ekran görüntüsü; API tarafında fark yok (Faz 17 backend kaydı).

---

## 3. Codex'ten istenecekler (doğrudan yazılmayacak)
- `redesign/MatchCard.jsx`: web ön ayarları prop'la yeterli mi, yoksa yeni bir preset mi gerekiyor (7f raf kartı `--crest 34`, 174 px).
- `rankit.css`: web'in kullandığı ortak `.ri-*` sınıflarından hangileri telefonla paylaşımlı kalacak; web'e özgü olanlar `rankit-web.css`'e taşınacak (§27 beş katman kuralı).
- `rankitApi.js`: yeni web parametreleri (`facets`, `sort`, `match_sort`, `scope`, `member_id`, `before_id`) — ortak istemciye eklenmesi.

## 4. Test ve ölçüm
- **Sözleşme:** `tests/test_web_contracts.py` (dolu + boş) — ben koruyorum; ekran alan okumaları buna dayanacak.
- **İzole görünüm:** `tests/fixtures/web/**` altın örnekleriyle Node testleri (sunucu gerekmez).
- **Geometri:** ölçüm testleri (duvar 320, ray 232, header 78, Inspector 468, raf 7 sütun) + `src/audit_rankit_surfaces.py` sınıf taraması.
- **Görsel:** kapı açılınca tarayıcı panelinde 1440 / 1080 / 820 / 375 ölçülü kontrol; yalnız gerçek veriyle (fixture ya da yerel API).

## 5. Riskler
1. **Çift kart dili:** S1 çözülene kadar web ve telefon iki ayrı kart sürdürüyor; `rankit.css` içindeki `ri-match-card` kuralları hangi yüzeye ait, taşımadan önce sınıf taramasıyla doğrulanmalı.
2. **Paylaşılan CSS:** web'e özgü düzeltme telefonu bozabilir; her taşımadan sonra mobil regresyon Codex'te.
3. **Kapı sırası:** mobil kabul gecikirse web işi beklemeli; bu plan hazır durur, uygulanmaz.
4. **Inspector geçişi:** mobil `ri-sheet` sınıflarından ayrılırken erişilebilirlik (Escape, odak) yeniden kurulmalı — §26 maddesi.
