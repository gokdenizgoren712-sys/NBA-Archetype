# Web görsel fark raporu — tahta vs çalışan uygulama

**Yazan:** Claude · **Tarih:** 2026-09-22 · **Nasıl:** tarayıcı panelinde çalışan yerel uygulama (`localhost:5173`, API proxy → `:8000`), 1440 / 1080 / 820 / 375 genişliklerinde ölçüm (`getComputedStyle`, `getBoundingClientRect`) + ekran kontrolü.
**Kapsam:** yalnız ölçülen fark. Değerlendirme değil, kanıt. Uygulanacak iş sırası `WEB_MIGRATION_PLAN.md`'de.
**Not:** hiçbir dosya değiştirilmedi.

## 1. Kabuk (§17)

| Ölçüt | BUILD / tahta | Ölçülen | Fark |
| --- | --- | --- | --- |
| Üst header | 78 px yapışkan: marka kilidi, yatay nav, gerçek arama, kalkan, seri, avatar | **yok**; sayfa başlığı `.riw-head` 61 px (sabit yükseklik yok) | ✗ Header kurulacak |
| Nav | dört öğe: Home, Discover, Activity, Lists | rayda **dikey beş** öğe: Home, Discover, **Rank**, Activity, **Profile**; Lists yok | ✗ Sıra ve yer |
| Arama | header'da gerçek alan, `/` ipucu, **modal değil** | rayda `<button>` "Search" (modal açıyor) | ✗ |
| Ray | 232 px, üç bölüm (standing, aktif koleksiyonlar, takip edilenler) | 232 px ✓; içerik: marka + arama düğmesi + nav + hesap satırı | ◐ Genişlik doğru, içerik yanlış |
| Zemin | `ground #090a0b` | `rgb(11,11,11)` (#0b0b0b) | ✗ Palet kayması |

## 2. Duvar ve kartlar (§18, §2)

| Ölçüt | BUILD | Ölçülen (1440) | Fark |
| --- | --- | --- | --- |
| Discover duvarı | `auto-fill minmax(320px, 1fr)` | 3 × 372.7 px (1146 px içerikte doğru sonuç) | ✓ |
| 375'te duvar | tek sütun, kart tam genişlik, yatay kaydırma yok | 1 × 343 px, yatay kaydırma yok | ✓ |
| Kart bileşeni | telefonla aynı yeni geometri (`data-match-card`, ön ayarlar) | web kendi `.ri-match-card` iskeletini çiziyor | ✗ İki kart dili |
| Ana sayfa karosu | — | 300 px (carousel) | ◐ Duvar dışı, ayrı ölçü |
| Kart ayağı | doğrulanmış `broadcast` | "Broadcast details pending" (`match.broadcaster`, canlıda hep `null`) | ✗ |

## 3. Inspector (§19)

| Ölçüt | BUILD | Ölçülen | Fark |
| --- | --- | --- | --- |
| Biçim | sağa yaslı **468 px** panel, header 56 (etiket / küçült / kapat) | ortalanmış modal **760 × 792**, `riw-inspect` | ✗ |
| Sekmeler | Match / Community / Companion, evre değiştirmez | üçü de var ✓ | ✓ |
| Rol | `role="dialog"`, `aria-modal="true"` | ikisi de var ✓ | ✓ |
| Escape | kapatır | kapatıyor ✓ | ✓ |
| Odak | içeride tuzaklanır, kapanınca açana döner | **odak diyaloğa hiç girmiyor** (açıldıktan sonra odak kartta kalıyor) | ✗ |
| Küçült | var | var ✓ | ✓ |

## 4. Kırılma noktaları (§25)

| Genişlik | BUILD | Ölçülen | Fark |
| --- | --- | --- | --- |
| > 1080 | ray 232 + duvar + Inspector 468 docked | ray 232 ✓, Inspector modal ✗ | ◐ |
| 1080 | **ray 64 px ikon sütununa iner** | ray hâlâ 232 px, etiketler görünür; içerik sütunu daralıyor | ✗ Yanlış taraf daralıyor |
| 820 | ray menü arkasına, Inspector tam genişlik alt sayfa | ray 69 px üst şeride dönüyor + alt navigasyon (5 öğe, ortada altın elmas) | ◐ Uygulama davranışına yakın; Inspector hâlâ modal |
| < 820 | tek sütun, 320 kart tam genişlik | 375'te tek sütun, 343 px kart ✓ | ✓ |

## 5. API kullanımı (ağ kaydından)

- `GET /api/rankit/home?sport=All` — **`tz_offset` ve `country` yok**: RankIt günü UTC'ye düşüyor, yayın satırı gelmiyor.
- `GET /api/rankit/catalog?...&limit=24&offset=0` — `facets` ve `sort` yok (ray sayıları ve "Hottest/Soonest/Most reviewed" bağlanmamış).
- `GET /matches/{id}/broadcasts?country=US` — yayın ayrı çağrıyla ve sabit `US` ile alınıyor; kart ayağı yine de `broadcaster` metnini gösteriyor.
- Yeni uçların hiçbiri çağrılmıyor: `/shelf`, `/competitions/{id}/heatmap`, `/collections`, `/activity`, `/lists/mine`, `/skins`, `?scope=following`, `?match_sort=hottest`.

## 6. Çalışan API'nin sürümü (Codex'in sorusu)

Proxy üzerinden ölçüldü: `GET /api/rankit/matches/54609` yanıtında `events`, `events_checked`, `live_updated_at`, `my_skin` **var**; `/shelf`, `/competitions/1/heatmap`, `/collections` **200** dönüyor; `/catalog` yanıtında `sort` var. **Yani `:8000`'de çalışan süreç yeni sürüm.** Panelden doğrudan `:8000`'e gitmek engelli (ağ kaydındaki `ERR_EMPTY_RESPONSE` satırları benim reddedilen denemelerim); uygulama Vite proxy'siyle çalışıyor ve 200 alıyor.
Hatırlatma: `events` **yalnız bitmiş** maçta dizi; canlı/planlı maçta bilerek `null` (§9.2). Yoklanmamış maçta `[]` + `events_checked: false`.

## 7. Özet

Yapısal olarak doğru olanlar: ray genişliği, duvarın 320 tabanı, 375 davranışı, Inspector'ın rol/Escape/küçült davranışı, sekmelerin sabitliği, iki yazı tipi ailesi.
Kurulacaklar: 78 px header + yatay nav + gerçek arama, rayın üç bölümü, docked 468 Inspector + odak tuzağı, 1080 ikon rayı, kartın ortak geometriye taşınması, yayın satırının `broadcast`'a geçmesi, yeni uçların bağlanması, zemin renginin palete dönmesi.
