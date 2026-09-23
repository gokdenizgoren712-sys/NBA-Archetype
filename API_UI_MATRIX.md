# RankIt API–UI sözleşme matrisi

**Yazan:** Claude (backend lane, Faz 1–18 denetimi bitti) · **Tarih:** 2026-09-22
**Kaynak önceliği:** `repair-kit/BUILD.md` → mobil/web HTML → `ONARIM.md` → `HANDOFF.md`. Bu dosya yalnız **ölçüm**dür: hangi API alanı var, arayüzde kim okuyor, hangi kapı açık.
**Yöntem:** backend tarafı `api/` kaynağından (18 faz, 235 RankIt testi), frontend tarafı `frontend/src/rankit/` üzerinde alan adı taramasıyla; her "bağlı" satırın yanında okuyan dosya var. Ekran görüntüsüyle kabul edilmiş demek DEĞİLDİR — yalnız kodun o alanı okuduğunu söyler.

## 0. Özet

- Backend 18 fazın tamamı kapandı; **bütün sözleşmeler geriye dönük uyumlu** — eski istemci çalışmaya devam eder.
- Codex'in bağladıkları (kanıtlı): kart ısı politikası, `2f` olayları, kadro/oyuncu seçici, Companion (`record`, `in_room`, `pulse_delta`, `min_reads`), spoiler maskesi, yanıt `client_id`, `next_offset`, `2p` dökümü.
- Bağlanmamış en büyük kümeler: `6a` makbuz alanları (kart numarası, deltalar, koleksiyon karosu), The Hunt (`2m`/`2n`), skinler (`2j`), `3j` seri durumu, listeler düzenleme (`3h`), `3d` POTM cetveli, tekrar güvenli toggle'lar, "That's all" bayrakları, tüm web fazları (13–17).
- **Bir kırık bulundu ve kapatıldı (backend tarafında):** `Alerts.jsx` koleksiyon satırı `list_title` / `rated` okuyor; Faz 9.5'te alanlar `collection_title` / `collected` oldu ve satır "undefined is one match from closing" basıyordu. Backend şimdilik iki eski adı da gönderiyor (`list_id` HARİÇ — yanlış yere götürürdü). Codex yeni adlara geçince takma adlar kalkacak.

## 1. Mobil (Codex lane) — faz faz

| Ekran | Uç | Alanlar | Frontend durumu | Sıradaki kapı |
| --- | --- | --- | --- | --- |
| `2a`–`2g` kart | `GET /home`, `/catalog`, `/matches/{id}` | `community_rating`+`rating_count`, `instant_classic`, `potm`+`potm_votes`, `live_minute` | **Bağlı** (`heat.js`, `toMatchCardProps.js`, `MatchCard.jsx`) | 20 eşiği ekran kabulü |
| `2a` home | `GET /home?tz_offset&country` | `day{start,end,matches}`, `broadcast`, `live_updated_at` | `tz_offset`/`country` **bağlı**; `broadcast` ve `live_updated_at` **bağlı değil** | Kart ayağı `broadcast`, bayat canlı işareti |
| `2h`/`16c` beklenen ısı | `GET /matches/{id}`, `PUT /matches/{id}/appetite` | `expected_heat`, `expected_rating_count`, `watchlist_count`, `my_appetite` | Okuma **bağlı** (`heat.js`); `my_appetite` ve 1–5 girişi **bağlı değil** | İzleme listesinde okuma girişi; kickoff'ta `409` |
| `6a`/`7e` collectible | `POST /diary` yanıtı | `card_number`, `streak_current`/`streak_delta`, `points_total`/`points_awarded`, `points_revoked`, `collection{…,delta}`, `season_award`, `client_entry_id` | **Hiçbiri bağlı değil** (`collectibleState.js` eski alanlarla) | Dört puanlama yolu → tek sonuç ekranı; kuyruğa `client_entry_id` |
| `15d`/`15b` kadro | `GET /matches/{id}` | `lineups[].played/sub_in/replaced/position/player_id` | **Bağlı** (`LiveLineup.jsx`, `playedPlayers.js`, `PlayersPicker.jsx`) | Gerçek kadrolu maçta görsel kabul |
| `2f` olaylar | `GET /matches/{id}` | `events[]` (+`side`), `events_checked` | **Bağlı** (`finishedMatchEvents.js`) | Dolu olay örneğiyle kabul |
| `5a`/`5b`/`6d` Companion | `GET /matches/{id}/companion`, `POST /pulse`, `WS`, `GET /watchalong?before_id` | `joined_following`, `in_room`, `room_open`, `pulse_delta`, `min_reads`, `record` | **Bağlı**; arşiv sayfalaması (`before_id`, `has_more`) **bağlı değil** | İki hesapla canlı kabul; tam arşiv |
| `15c`/`5c`/`4a` yorumlar | `/diary`, `/matches/{id}/reviews`, `/reviews/{id}/thread` | `review_withheld`, `on_the_night`, `reply_to`, `client_id`, `is_mine`, `spoiler` (yanıtlarda) | Çoğu **bağlı**; `is_mine` **bağlı değil** (kullanıcı adıyla eşleniyor), `GET /diary?view=reviews` **bağlı değil** | `15c` composer; `6b` "Your reviews" |
| `3j` quick-rate | `GET /quick-rate` | `tonight`, `catchup`, `tonight_counted`, `at_risk` | **Bağlı değil** | Elmasın açtığı ekran |
| `6b`/`2p` profil | `/profile`, `/rank` | `breakdown` (**bağlı**), `classics`/`avg_rating` düzeltmeleri, `following_sources` | Kısmen bağlı | Sayaç kabulü |
| `9a`/`9b` kişiler | `/people`, `/people/discover` | sıra (yüzde → ortak maç), `pct: null`, `bias` | **Bağlı** | Sıra ve "too few" kabulü |
| `3d` turnuva oyuncular | `/competitions/{id}/players` | `stat=potm`, `won`, `share`, `matches`, `min_votes` | **Bağlı değil** (yalnız gol/asist) | POTM sekmesi önde |
| `2m`/`2n` The Hunt | `GET /collections`, `/collections/{id}` | `summary`, `collected/total`, `unscheduled`, `opens_note`, `reward`, `next` | **Bağlı değil** | The Hunt ekranları |
| `3f`/`13a` bildirimler | `GET /notifications` | `channel`, `entry_id`, `viewer_rated`, `has_more`, koleksiyon satırı | Kısmen bağlı; **koleksiyon satırı eski adlarla** (takma ad şimdilik idare ediyor) | `collection_id`/`collected`e geçiş; kanal grupları |
| `3h` listeler | `PUT/DELETE /lists/{id}`, `/items/{match_id}`, `/order`, `GET /lists/mine` | düzenleme, sıralama, sayılar | **Bağlı değil** | Düzenlenebilir raf |
| `2j`–`2l` skinler | `GET /skins`, `PUT /diary/{id}{skin}` | `locked`, `available`, `my_skin`, `their_skin` | **Bağlı değil** (`CollectibleResult.jsx` "being prepared") | Skin seçici + paylaşım |
| `3k`/`3l` durumlar | tüm uçlar | `{"on": …}` toggle, `has_more`, `truncated`, `entries_has_more`, `live_updated_at` | **Bağlı değil** | Tekrar güvenliği ve "That's all" |
| `4g`/`4h`/`2r` ilk kurulum | `/onboarding` | `account{username,email}`, `followed_clubs`, `done` | `account` **bağlı değil** | Tek akış kabulü |

## 2. Web (Claude lane, mobil kapısı açılınca)

| Ekran | Uç | Alanlar | Durum |
| --- | --- | --- | --- |
| `7a` home | `/home`, `/rank`, `/collections`, `/activity` | ray üç bölüm, "FROM PEOPLE YOU FOLLOW" | `/activity` **bağlı değil** (yalnız import izi) |
| `8a` Discover | `/catalog?facets=true&sort=` | `facets.{sport,status,competition,season}`, `sort` | **Bağlı değil** |
| `8c` turnuva | `/competitions/{id}` | `avg_heat`, `heat_matches` | **Bağlı değil** |
| `7g` ısı haritası | `/competitions/{id}/heatmap` | hücre `state/heat/logged`, `summary` | **Bağlı değil** |
| `7f` raf | `/shelf?sort=&member_id=` | `counts`, `entry`, `next_offset` | **Bağlı değil** |
| `7h` okuma | `/matches/{id}/reviews?scope=following` | `top_tags`, `spread`, `community_rating` | **Bağlı değil** |
| `11c` arama | `/search?match_sort=hottest` | `counts`, kulüp ısısı, kişi ilişkisi, liste yazarı | **Bağlı değil** |
| `12a` kulüp çekmecesi | `/teams/{id}` | `season`, `logged`, `hottest`, `next.collections` | **Bağlı değil** |
| `12b` listeler | `/lists/mine` | `owned`, `saved` | **Bağlı değil** |
| `14a` ilk kurulum | `/onboarding` | `account` | **Bağlı değil** |
| `14b` bildirimler | `/notifications` | `channel`, `entry_id` | **Bağlı değil** |
| `11a`/`15y`/`15z`/`7e` | `/quick-rate`, kadro, `PUT /diary` | dialog/panel/overlay | **Bağlı değil** |

## 3. Backend'de veri olmayanlar (arayüz uydurmamalı)

Stadyum (`12a`) · görünen ad ve avatar (`6b`, `3i`) · Primary Arch tanıdık sayısı (`9b`, `14a`) · editöryal `2f` özeti · yoklanmamış maçların olayları (`events_checked: false`) · girilmemiş yayın eşlemeleri · seçki içeriği (admin girecek) · push bildirimi ve "Streak 22:00" · NBA'de sezon ısı haritası (maç haftası yok) · tarihsel maçlarda kadro/olay.

## 4. Tuzaklar

1. **`PUT /diary` ve puan alanı:** alan gönderilmezse puana dokunulmaz, açık `null` puanı siler. Web denetçisindeki `rating: rating || null` kalıbı, puanı olmayan bir formda istemeden puanı siler — composer otomatik kaydında alanı hiç göndermeyin (Faz 14).
2. **Koleksiyon bildirimi:** `collection_id` / `collection_title` / `collected` yeni adlar; `list_id` artık yok (navigasyon maça düşer).
3. **`broadcaster` canlıda `null`:** kart ayağı doğrulanmış `broadcast` alanını kullanmalı (Faz 12).
4. **Yeni alanlar `init_db` ile geliyor:** yerel API yeniden başlatılmadan `skin`, `client_id`, koleksiyon tabloları, `rankit_moments.side` görünmez.
5. **Eşik her yerde 20:** ısı, Instant Classic, POTM, beklenen ısı, nabız, tablo ortalaması, ısı haritası, dağılım (`tests/test_rankit_close_out.py`).
