# Backend görevleri: oyun arayüzü yeniden yapımının (Faz 0–5) açığa çıkardıkları

Bu belge, `docs/GAME_UI_REBUILD_PLAN.md` kapsamındaki arayüz çalışması sırasında bulunan ve **yalnız backend tarafında çözülebilen** işleri toplar. Frontend bunları beklerken şu an zarif biçimde düşüyor (aşağıda "Şimdiki davranış"). Her madde bağımsızdır; öncelik sırası yukarıdan aşağıya.

Kurallar: Türkçe yorum, kısa ve öz. Mevcut sunucu-otoriter yaklaşımı koru (sonucu istemci hesaplamasın). Yeni alanlar geriye dönük uyumlu olsun (eski istemci bozulmasın). Her madde için test ekle (`tests/`).

---

## 1. Futbol With a Friend / Online odası arayüzden hiç açılmıyor (hata)

**Belirti:** İki hesapla oda kurup katılınca iki taraf da "Open seat / Waiting to join" lobisinde kalıyor; `RoomDraft` (canlı draft) hiç açılmıyor.

**Kök neden:** `frontend/src/pages/football/FootballVersus.jsx` `RoomPanel`, `bothIn = Boolean(room.p2_name || room.p2_ready)` koşuluyla `RoomDraft`'a geçiyor. Ama:
- `api/main.py` `join_h2h_room` (≈5136) yalnız `p2_user_id` ve `status='building'` yazıyor, **`p2_name` yazmıyor**.
- `create` yalnız `p1_name`'i yazıyor; `football_ws._make_room` hiçbirini yazmıyor.
- `p2_ready` ancak kadro (`/squad`) gönderilince doğru oluyor; kadro gönderme ise `RoomDraft` içinde olduğundan ona hiç ulaşılamıyor.
- Host'un 4 sn'lik REST yoklaması (`GET /api/football/h2h/room/{code}`, `_h2h_public` ≈5101) `p2_name` boş döndürdüğü için host ikinci oyuncuyu hiç görmüyor.

**İstenen:**
1. `join_h2h_room` katılan kullanıcının kullanıcı adını `p2_name`'e yazsın (create `p1_name` için ne yapıyorsa aynısı); `football_ws._make_room` ve WS tarafındaki katılım yolu da aynısını yapsın.
2. `_h2h_public` yanıtına açık bir `p2_user_id`/`opponent_joined: bool` alanı eklensin (isim boş olabilir; frontend adı ya da bu bayrağı kullanabilsin). Frontend koşulu `bothIn` buna bağlanacak.
3. Misafir "Leave room" derse (frontend `room` state'ini sıfırlıyor, sunucu satırı `building` kalıyor): `DELETE`/`POST .../leave` ile `p2_user_id`'yi boşalt ya da odayı `abandoned` yap; host'a bildir. `sweep_stale_football_rooms` yalnız bayat satırları temizliyor, bu durumu kapsamıyor.
4. WS tarafı sağlam görünüyor (`room_not_found`, `waiting`, `invalid_token`, `banned` hataları temiz); sorun istemcinin bağlanma koşuluydu. Yine de oda ile WS durumunun aynı kaynaktan (DB) beslendiğini doğrula.

**Test:** iki kullanıcıyla create → join → host'un GET'i `opponent_joined=true` ve `p2_name` dolu; join sonrası leave → satır tekrar `waiting`/`abandoned`.

**Şimdiki davranış:** Arayüz hâlâ eski koşulu kullanıyor; hata düzeltilmeden futbol oda draftı (Room Flows 5b–5d, 5t, 5u) çizilemiyor/doğrulanamıyor.

---

## 2. Rövanş (rematch): "ikisi de dokunmalı" (Room Flows 5f/6e, 5i/6h)

**Durum:** `api/game_ws.py` ve `football_ws.py`'de rövanş mesajı yok. Seri/eleme bitince oda `complete`/`resolved`; yeni oyun için yeni oda kurmak gerekiyor.

**İstenen (basketbol WS `/ws/game/room/{code}` ve futbol WS):**
- Yeni istemci mesajı `{type: "rematch_ready"}`; sunucu `game.rematch_ready: {<user_id>: bool}` tutup state'e koysun.
- İki taraf da hazır olunca **aynı odada** yeni bir oyun başlasın: lineups/jokers/coaches/series sıfırlanır, `phase` `era`'ya (basketbol) ya da kuruluma (futbol) döner, host ve guest rolleri **yer değiştirir** (ya da kullanıcı seçimine bırak: `swap_sides` bayrağı), `round`/`spin_seq` sıfırlanır. Eski sonuç leaderboard'a bir kez yazılsın (çift yazma yok).
- Biri ayrılırsa `opponent_left` mevcut yolu; hazır işareti düşsün.
- Rövanş sayacı: bir odada en fazla N (örn. 5) rövanş.

**Test:** iki WS istemcisi; yalnız biri hazırken faz değişmez; ikisi hazır → faz `era`, `series_wins` sıfır, geçmiş kayıt tek.

**Şimdiki davranış:** Final ekranı yalnız "Back to modes" veriyor.

---

## 3. Karşı-joker 15 sn otomatik pas (Room Flows 5t/6s) — doğrulama + eksikse ekleme

Mockup, bekleyen tarafın karşı-joker kararını 15 sn sonunda otomatik "pas"a bağlıyor. `api/game_ws.py` içinde sayaç/zaman aşımı **bulunamadı** (grep: yok); şu an karşı taraf `dismiss_counter` demeden (ya da joker kullanmadan) aktif oyuncu bekliyor olabilir.

**İstenen:** Her `drafting` turu başında sunucu `counter_deadline` (UTC ms) yazsın; süre dolunca (bekleyen taraf cevap vermediyse) sunucu `counter_dismissed=true` yapıp state yayınlasın. İstemciler `counter_deadline`'dan geri sayım çizebilsin. Bağlantısı kopmuş rakip için de süre işlesin. Futbol odasında da aynısı.

**Test:** sahte saatle 15 sn sonra tur kendiliğinden açılır; süre içinde joker kullanılırsa sayaç iptal.

---

## 4. Futbol Online eşleştirme (Room Flows 5k–5n, 5w–5x)

Sunucu hazır: `/ws/football/matchmaking`, `POST /api/football/matchmaking/join`, `DELETE /api/football/matchmaking` (`api/football_ws.py` ≈492–530). **Arayüz eksik** (Faz 6'da yapılacak), ama şunlar netleşmeli:
- `matched` WS mesajına rakip adı + oda kodu + kabul penceresi süresi (`accept_deadline`) ekle (mockup 5m: "match found, accept window").
- Her iki taraf `accept` demeden oda açılmasın; biri reddederse/süre dolarsa diğeri kuyruğa geri dönsün. Kabul sonrası "draft countdown" (5n) için `starts_at` zamanı.
- Basketbol `/ws/game/matchmaking` (≈854–952) için de aynı alanlar (6k–6m).
- "The Board" (5w/5x/6v/6w): ilk 25 liderlik satırı + skora göre arama + seçili önizleme uç noktası var mı doğrula (`/api/game/leaderboard`, futbol karşılığı); yoksa `GET .../board?query_score=` ekle.

---

## 5. Quick Sim ve futbol sezon sonrası verisi (Faz 3 artığı)

- **Quick Sim** sonucunda puan durumu/playoff ağacı verisi üretilmiyor; basketbol sezon sonucu ekranı (mockup 3f) bunları yalnız Rewrite History'de gösterebiliyor. Quick Sim yanıtına (istemci simülasyonuysa `useSeasonSim` içine) en azından `standings` (30 takım, W-L) eklenirse 3f tam doldurulur.
- **Futbol sezon sonrası** (mockup 4f, 40 maç akışı) karesi tasarımda yok; sezon paneli (`football/SeasonPanel`) yalnız yeni dile boyandı. Gerekirse maç akışı için sunucudan `fixtures[]` (rakip, skor, goller, asistler) dönmesi yeterli.

---

## 6. Küçük API temizlikleri

- `p2_name` ve benzeri kullanıcı adı alanları odada tutarlı dönmeli (basketbol oda `usernames` haritası dönüyor, futbol `p1_name/p2_name` ile; ortak bir `players: [{user_id, username, seat}]` biçimi istemciyi sadeleştirir).
- Futbol Same Screen tamamen istemci tarafında; oyuncu istatistiği (gol/asist) dağılımı istemcide simüle ediliyor. İleride sunucu-otoriter istenirse `POST /api/football/h2h/simulate` (iki kadro + menajer → iki ayak, uzatma, penaltı, oyuncu bazlı olaylar) eklenebilir. **Şimdilik gerekli değil**, not olarak duruyor.

---

## Kabul ölçütü

- Madde 1: iki hesapla futbol odası açılıp katılınca iki taraf da draft ekranına geçiyor (frontend `bothIn` koşulu `opponent_joined`'a bağlandığında).
- Madde 2 ve 3: WS testleri geçiyor; frontend tarafında alanlar (`rematch_ready`, `counter_deadline`) okunmaya hazır, ayrı bir iş olarak bağlanacak.
- Madde 4: eşleşme akışı için `matched` mesaj şeması belgelendi (docs/ veya docstring).
