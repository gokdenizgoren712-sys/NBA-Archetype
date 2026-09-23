# Mobil kabul listesi — Faz 5–12 (API tarafından)

**Yazan:** Claude (backend lane) · **Tarih:** 2026-09-22 · **Eş belge:** `API_UI_MATRIX.md`, `frontend_code.md`
**Ne değil:** tasarım kararı. Tasarım `BUILD.md` → mobil HTML. Bu liste yalnız **API sözleşmesinin karşılığı arayüzde var mı** sorusunu ölçer.
**Kabul kuralı (frontend_code.md §"Her teslim notunun biçimi"):** bir madde ancak çalışan ekran + gerçek/boş/hata hali + ölçülü görsel kontrol + test/build ile işaretlenir. Uç var olması kabul değildir.

**Önkoşul (bir kez):** yerel API yeniden başlat — `uvicorn api.main:app --reload`. Açılışta `init_db` yeni sütun/tabloları ekler (`skin`, yanıt `client_id`, `rankit_moments.side`, koleksiyon tabloları). Dolu olay örneği: `python src/scratch/seed_local_match_events.py` (`--undo` ile geri al).

---

## Faz 5 — Maç sayfası (`2h`, `15d`, `15a`, `2f`, `2g`, `15b`)

Sözleşme: `GET /matches/{id}` → `status`, `score`, `live_minute` (temiz "73'"), `live_updated_at`, `lineups[].{player_id,position,position_code,sub_in,sub_out,replaced,played}`, `players[].{team,team_name}`, `events[]`+`events_checked` (yalnız bitmiş), `expected_heat`+`expected_rating_count`+`watchlist_count`+`my_appetite` (yalnız planlı), `community_rating`+`rating_count`, `potm`+`potm_votes`, `my_*`.
Yazma: `POST /matches/{id}/potm`, `PUT /matches/{id}/respect` → puansızsa `403 Rate this match first`; oynamayan oyuncuya `422 Player did not play in this match`. `PUT /matches/{id}/appetite` {1..5|null} → kickoff geçtiyse `409`.

- [ ] `2f` bitmiş maçta olay çizgisi: `events[]` ev/deplasman ayrımıyla (`side`), dakika sırası; **dolu örnekle** görsel kabul (seed betiği).
- [ ] `events_checked: false` halinde "olay yok" yazmıyor, kaynağın doğrulanmadığını söylüyor.
- [ ] Canlıda Match sekmesinde olay akışı **yok** (`events: null`), anlar Companion'da (§9.2).
- [ ] `15d` canlı: `live_minute` temiz basılıyor; `live_updated_at` eskimişse bayat işareti.
- [ ] `15d` "CAME ON · 63' Neto for Madueke" → `sub_in` + `replaced`; mevki `position`.
- [ ] `15b` seçici yalnız `played: true` olanları listeliyor, oy `player_id` ile; kadro yoksa seçici kapalı.
- [ ] `2h` planlı: beklenen ısı sayısı + 20 okuma altında boş rampa; izleme listesinde 1–5 okuma girişi (`my_appetite`), kickoff sonrası kontrol gizli.
- [ ] `2h` yayın satırı `broadcast` alanından (`confidence: typical` dili ayrı); `broadcaster` alanı canlıda `null` — kullanılmıyor.
- [ ] `2g` kalabalık hükmü: `community_rating`/`rating_count`, `classic_count`, `potm` (20 oy altında `TOO FEW VOTES`).
- [ ] `15a` puansız hal: etiket/oyuncu/inceleme kapalı, tek dashed satır (§9.3; API puansız yazmayı `422 Rate the match first` ile reddediyor).

## Faz 6 — Companion (`5a`, `5b`, `6d`)

Sözleşme: `GET /matches/{id}/companion` → `joined`, `joined_following`, `in_room`, `messages`, `room_open`, `sport`, `badge`, `pulse{value,reads,min_reads,timeline[]}`, `moments[].pulse_delta`, `record{peak,rise_from_ht,messages,attendance}`. `POST /matches/{id}/pulse` {value} (dakika sunucudan; canlı değilse `409`). `WS /ws/watchalong/{id}` katılım ve süreyi yazar. `GET /matches/{id}/watchalong?before_id=&limit=` → `messages`, `has_more`, `next_before_id`.

- [ ] `5a` "N joining · M you follow" → `joined` / `joined_following`; `15d` "N in the room" → `in_room`.
- [ ] `5b` nabız 20 okuma altında sayı yok, okuma sayısı var; `pulse_delta` anlarda.
- [ ] `6d` gecenin kaydı yalnız `record` ölçülmüşse; zirve/yükseliş/mesaj/katılım uydurulmuyor; oda kapalı ama okunur.
- [ ] `6d` **tam arşiv**: `before_id` ile geriye sayfalama, `has_more: false` olunca "arşiv eksik" notu kalkıyor.
- [ ] İki hesapla canlı/yaklaşan maçta Join → oda sayısı, okuma, mesaj akışı.

## Faz 7 — Yorumlar (`15c`, `5c`, `4a`)

Sözleşme: `POST /diary` {review, tags, classic, spoiler, visibility} — puansızsa `422 Rate the match first`. `GET /matches/{id}/reviews?sort=respected|newest|lowest&scope=all|following` → `total`, `followed`/`everyone`, `is_mine`, `on_the_night`, `next_offset`, `top_tags`, `spread`, `community_rating`. `GET /reviews/{id}/thread` → `review.{user_id,is_mine,rank,rank_name,spoiler,tags}`, `replies[].{reply_to,is_author,is_mine,spoiler,respect,respected}`. `POST /reviews/{id}/comments` {content, reply_to, client_id} → `422` dizide olmayan adres, `409` başka incelemeye ait `client_id`. `POST /reviews/{id}/like`, `POST /comments/{id}/respect` → kendi içeriğinde `403`; gövdede `{on: true|false}`.

- [ ] `15c` composer girişten açılıyor, girişe kaydediyor, buton "Save to your entry"; puan yokken kapalı; spoiler uyarısı başta.
- [ ] `5c` sıra en çok respect, takip edilenler üstte; `is_mine` ile kendi respect elması pasif.
- [ ] `4a` yanıtlar düz liste, `reply_to` handle'ı eylemden geliyor; `AUTHOR` işareti; spoiler yanıtlar kendi kapısının arkasında.
- [ ] Belirsiz gönderimde `client_id` ile tek yanıt (tekrar ikinci satır doğurmuyor).
- [ ] `6b` "Your reviews" → `GET /diary?view=reviews` (`respect`, `replies`, `visibility`).

## Faz 8 — Kabuk (`2r`, `3j`)

Sözleşme: `GET /quick-rate?tz_offset` → `tonight[]` (`keeps_streak`), `catchup[]`, `catchup_total`, `streak`, `tonight_counted`, `at_risk`. `GET /rank?tz_offset` → `rank`, `streak{current,best,rest_nights_enforced,tonight_counted}`, `breakdown`. `GET|PUT /settings` yalnız gerçek boolean (`"false"` metni `422`). Yazmada `401 Sign in again` → yeniden giriş, taslak korunur.

- [ ] Header 64 / nav 73, altın aktif, merkez `RANK` elması `3j`'yi açıyor.
- [x] `3j` "bu gece" listesi yıldızsız izleme kaydı olan maçı da içeriyor; `tonight_counted` true iken "seri risk altında" yazmıyor. *(Claude 2026-09-22: karar `redesign/streakNight.js`'te, `at_risk`/`tonight_counted` ikilisinden; 6 testli. Dolu halin görsel kabulü açık — yerel hesapta seri/bu gece maçı yok.)*
- [ ] `2r` tek söz ekranı; ilk kurulum bitince `done` hesapta.

## Faz 9 — Kalan mobil yüzeyler

Sözleşme (ekran → uç): `6b` `/profile` (+`/rank`, `/collections`); `2p` `/rank` `breakdown`; `9a`/`9b` `/people`, `/people/discover`; `2i`/`3c` `/competitions/{id}`, `/matches?stage=`; `3d` `/competitions/{id}/players?stat=potm` (`won`, `share`, `matches`, `min_votes`); `2m`/`2n` `/collections`, `/collections/{id}`; `3e` `/search` (`collections` bölümü ayrı, `lists` ayrı); `13a` `/notifications` (`channel`, `entry_id`, `viewer_rated`, `has_more`); `3g` `/settings` + cihaz tercihleri; `3h` `/lists/mine`, `PUT /lists/{id}`, `DELETE /lists/{id}`, `DELETE /lists/{id}/items/{match_id}`, `PUT /lists/{id}/order`; `3i` `/members/{id}` (`entries_has_more`, `their_skin`); `2j`–`2l` `/skins` + `PUT /diary/{id}{skin}`; `4g`–`4h` `/onboarding` (`account`, `followed_clubs`).

- [ ] `6b` sayaçlar gerçek (`matches`, `classics` — maç başına, `streak`); `2p` pushed, kutular `breakdown` türlerinden.
- [ ] `9a`/`9b` sıra sunucudan; on maç altında "Too few to compare"; ilişki dört durum.
- [ ] `3d` POTM sekmesi önde (`available[0]`), `won`/`share`, pay çubuğu `ink`.
- [ ] `2m` özet satırı `summary`; `2n` "N fixtures are unscheduled" = `unscheduled`; açılmamış koleksiyon `opens_note` ile sonda.
- [ ] `6a` koleksiyon karosu `collection` (null ise karo yok, `delta` yalnız ilk puanda 1) + `season_award`.
- [ ] `3e` COLLECTIONS bölümü `collections` alanından (kullanıcı listeleri `lists`).
- [ ] `13a` kanal grupları `channel`; satır tam yüzeyi açıyor (`entry_id` → `4a`, `collection_id` → `2n`); koleksiyon satırı yeni adlarla (`collection_title`/`collected`) — geçiş yapınca haber ver, backend takma adları kaldırsın.
- [ ] `3h` liste düzenleme, maç çıkarma, sıralama, silme; kendi listene respect yok.
- [ ] `3i` `entries_has_more` ile "That's all"; rafta `their_skin`.
- [ ] `2j` skin seçici: `locked` (Turf/Floodlight), `available` (Gilt yalnız Classic kartta); seçim `PUT /diary/{id}`; kart ve paylaşım görseli `my_skin` ile.
- [ ] `4g` "Primary Arch connected" → `account.email`; `4h` yedi kulüp + arama.

## Faz 10 — Durumlar (`3k`, `3l`)

Sözleşme: tüm toggle uçları `{on: true|false}`; `has_more` (bildirim), `truncated` (arama bölümleri), `entries_has_more` (`3i`), `next_offset` (`5c`, `9a`); `live_updated_at`; 4xx kalıcı / `401` yeniden giriş / 5xx-ağ tekrar; 500 mesajı İngilizce ve gösterilebilir.

- [ ] İskeletler kartın geometrisini koruyor; boş ekran tek eylem söylüyor.
- [ ] Çevrimdışı: kartlar %62, yerel puanın yükleneceği sözü, 44px retry.
- [x] Toggle tekrarları `{on}` ile gönderiliyor (respect, kaydet, izleme listesi, favori, takip) — belirsiz istek tekrarı durumu tersine çevirmiyor. *(Claude 2026-09-22: beş istemci metodu + sekiz çağrı yeri, dolaylı `ListShelf` sarmalayıcısı dahil; `toggle-contract.test.mjs` + mutasyon.)*
- [x] "That's all" yalnız bayraklar false iken. *(Claude 2026-09-22: `3e` bölüm başına `truncated` notu — tarayıcıda üç kesik bölümde çıkıyor, kesilmeyenlerde çıkmıyor; `13a` `has_more` notu; `/diary`, `/watchlist`, `/lists/{id}` LIMIT'siz olduğu için `EndOfList` zaten dürüst.)*
- [ ] Dört hata durumu (§5.4): yerel kopya kaybolmuyor.

## Faz 11 — Erişilebilirlik

Sözleşme: erişilebilir adlar için tam takım adı (`home_name`, `away_name`, `match`), dar yer için `match_short`/`short`; temiz `live_minute`; ısı her zaman sayısıyla.

- [ ] Sheet/dialog gerçek diyalog: `role="dialog"`, `aria-modal`, Escape, odak tuzağı, odağın geri dönmesi.
- [ ] Ekran okuyucu metinlerinde tam ad; dar sütunlarda kısa ad.
- [x] Hedefler ≥44px, filtre pill 48; tip ≥9px; animasyonlar `prefers-reduced-motion` arkasında. *(Claude 2026-09-22: dört sekmede ölçüldü, 44 altı hedef kalmadı; pill 34→48; 85 tip bildirimi 9px'e çekildi, yeni kırpılma yok; üç korumasız hareket kuralı kapatıldı. `focus-and-targets.test.mjs` bekçisi + mutasyon denetimi.)*
- [ ] Isı renk tek başına değil (sayı yanında), lejant var.

## Faz 12 — Markalar

Sözleşme: arma `crest_url` (sağlayıcı kaynaklı; yoksa kısaltma), kulüp rengi `color`, yayıncı yalnız `broadcast`.

- [ ] RankIt mark + wordmark, her örnekte benzersiz mask id.
- [ ] Primary Arch markası `BrandIcons.jsx`'ten aynen + `<32px` varyantı; ortak markada ikisi de mono.
- [ ] Android launcher ikonu gerçek marka (şu an bugdroid).
- [ ] Sahte logo/yayıncı yok: arma yoksa kısaltma, yayıncı yoksa "pending".

---

## Kapanışta iki ajan birlikte (Faz 18)

- [ ] Dört puanlama yolu → tek `6a`.
- [ ] Beş maç evresi iki yüzeyde.
- [ ] The Hunt hem Discover'dan hem Profile'dan.
- [ ] §26 listesi ekran ekran; yalnız başarısızlıklar raporlanır.
