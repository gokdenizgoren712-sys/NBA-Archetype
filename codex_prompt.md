# Codex'e prompt — API tarafından mobil bağlama sırası (2026-09-22)

Backend tarafı (Claude) 18 fazın denetimini bitirdi. Tüm sözleşmeler geriye dönük uyumlu; eski istemci çalışmaya devam eder. Sana üç yeni belge bıraktım, üçü de depo kökünde:

- `API_UI_MATRIX.md` — her ekran için: hangi uç, hangi alanlar, arayüzde okuyan dosya var mı, hangi kapı açık. Taramayla ölçüldü, iddia değil.
- `MOBILE_ACCEPTANCE.md` — Faz 5–12 kabul listesi, API sözleşmesi + işaretlenecek maddeler.
- `ONARIM.md` — her faz için kanıt/test/eksik sözleşme kaydı (append-only, en sonda benim geçiş kaydım var).

## Önce şunlar (bir kez)

1. **Yerel API'yi yeniden başlat:** `uvicorn api.main:app --reload`. Çalışan süreç eski; `events` alanının görünmemesinin sebebi bu. Yeniden başlatma yalnız `events` için değil — açılışta `init_db` şunları ekliyor: `rankit_diary_entries.skin`, `rankit_review_comments.client_id`, `rankit_moments.side`, koleksiyon tabloları (`rankit_collections`, `rankit_collection_items`, `rankit_collection_completions`).
2. **Dolu olay örneği** (senin açık kalan `2f` görsel kabulün için): `python src/scratch/seed_local_match_events.py` → yerel bir bitmiş maça 23' gol (ev), 58' gol (deplasman), 63' oyuncu değişikliği (ev), 71' kırmızı kart (deplasman) yazar ve `events_checked`'i true yapar. Geri alma: aynı komut `--undo` ile. Prod ortam değişkeni varsa çalışmaz.

## Sözleşmede bilmen gereken dört tuzak

1. **`PUT /diary/{id}` ve puan alanı.** Gövdede `rating` **yoksa** puana dokunulmaz; açık `"rating": null` puanı **siler**. `15z`/`15c` composer yazdıkça kaydediyorsa `rating` alanını hiç gönderme. Web denetçisindeki `rating: rating || null` kalıbı, puanı olmayan bir formda istemeden puanı siler.
2. **Koleksiyon bildirimi alan adları değişti.** `3f`/`13a` kapanış satırı artık `collection_id` / `collection_title` / `collected` / `total` taşıyor; `list_id` yok (navigasyon maça düşer). `Alerts.jsx` hâlâ `list_title` / `rated` okuduğu için satır "undefined is one match from closing" basıyordu — backend şimdilik bu iki eski adı da gönderiyor. **Yeni adlara geçince haber ver, takma adları kaldırayım.**
3. **`broadcaster` canlıda her zaman `null`.** O alan doğrulanmamış eski serbest metindi (demo tohumunun uydurma kanalları). Kart ayağı ülkeye göre doğrulanmış `broadcast` alanını kullanmalı.
4. **Eşik her yerde 20.** Isı, Instant Classic, POTM, beklenen ısı, nabız, tablo ortalaması, ısı haritası, puan dağılımı. Altında sayı yok, sayaç var (`TOO FEW RATINGS` / `TOO FEW VOTES`).

## Sıra (BUILD Part IV, faz atlanmaz)

**Faz 5 — maç sayfası.** `events[]` (+`side`) ve `events_checked` bitmiş maçta; canlıda `events: null`, anlar Companion'da (§9.2). `15b` seçici `played: true` olanları listeler, oy `player_id` ile; puansız oy `403`, oynamayana oy `422`. `2h` beklenen ısı `expected_heat` + okuma sayacı, 1–5 girişi `PUT /matches/{id}/appetite`, kickoff sonrası `409`.

**Faz 6 — Companion.** `6d` tam arşiv artık açık: `GET /matches/{id}/watchalong?before_id=&limit=` → `messages`, `has_more`, `next_before_id`. Geriye doğru yükle, `has_more: false` olunca "arşiv eksik" notunu kaldır. Nabız dakikası sunucudan; istemci `minute` göndermek zorunda değil.

**Faz 7 — yorumlar.** `15c` composer girişe bağlı; puansız `422 Rate the match first` (Classic ve etiket de). Sahiplik artık sunucudan: `4a` `review.is_mine` ve `replies[].is_mine`, `5c` satırlarında `is_mine` — kullanıcı adı eşlemesini bırakabilirsin. Yanıt gönderiminde `client_id`; adres yalnız yazar ya da dizide yanıt yazmış biri (`422`), aynı kimlik başka incelemeye aitse `409`. `6b` "Your reviews" → `GET /diary?view=reviews`.

**Faz 8 — kabuk.** `3j` → `GET /quick-rate`: `tonight` (yıldızsız izleme kaydı olan maç da listede), `catchup`, `tonight_counted`, `at_risk`. Yazmada `401 Sign in again` → yeniden giriş, taslak durur.

**Faz 9 — kalan mobil.** Yeni uçlar: `GET /collections` ve `/collections/{id}` (The Hunt: `summary`, `unscheduled`, `opens_note`, `reward`, `next`), `GET /skins?entry_id=` + `PUT /diary/{id}{skin}` (Turf = bir koleksiyonu bitir, Floodlight = 7 gecelik seri, Gilt = yalnız Classic kart; kart ve paylaşım `my_skin`/`their_skin`), `GET /lists/mine` + `PUT /lists/{id}` + `DELETE /lists/{id}` + `DELETE /lists/{id}/items/{match_id}` + `PUT /lists/{id}/order`, `GET /competitions/{id}/players?stat=potm` (`won`, `share`, `min_votes`), `/onboarding` → `account{username,email}`. `6a` makbuzu artık dolu: `card_number`, `streak_current`/`streak_delta`, `points_total`/`points_awarded`, `points_revoked`, `collection{title,collected,total,delta}`, `season_award`; kuyrukta `client_entry_id` gönderirsen belirsiz rewatch güvenle tekrarlanır.

**Faz 10 — durumlar.** Bütün toggle'lar istenen durumu alabiliyor: `{"on": true|false}` (inceleme/yanıt respect'i, liste kaydet/respect, izleme listesi, favori, takip). Belirsiz istek tekrarı artık işi geri almaz. "That's all" yalnız `has_more` (bildirim), `truncated` (arama bölümleri), `entries_has_more` (`3i`), `next_offset` (`5c`, `9a`) false iken. Canlı kartta `live_updated_at` eskimişse bayat işareti.

**Faz 11–12 — erişilebilirlik ve markalar.** Erişilebilir metinlerde tam takım adı (`match`, `home_name`), dar yerde `match_short`. `live_minute` artık görünmez yön işaretlerinden temizlenmiş ("73'"). Sheet'ler gerçek diyalog olmalı; bu fazın ana işi sende. Markalarda arma yoksa kısaltma, yayıncı yoksa "pending" — sahte logo/yayıncı yok.

## Benden ne istersen

- Eksik ya da tuhaf gelen bir alan varsa söyle; sözleşmeyi ben değiştiririm, sen frontend'de sarmalayıcı yazma.
- `Alerts.jsx` koleksiyon satırını yeni adlara geçirince haber ver, geçici takma adları kaldırayım.
- Mobil Faz 5–12 kapıları kapanınca web'e (Faz 13–17) ben geçiyorum: `web/` dosyaları ve web testleri bende, ortak adaptör ve `redesign/` sende kalıyor.

Kayıtlar: teslim notunu `frontend_code.md` sonuna, kanıtı `ONARIM.md` sonuna ekle (ikisi de append-only, benim kayıtlarımı silme). Commit/push/deploy/APK yalnız kullanıcı isterse.
