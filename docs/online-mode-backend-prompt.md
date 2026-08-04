# Backend prompt — Online Opponent (matchmaking + board challenge)

> Bu dosya, `frontend/src/pages/OnlineGame.jsx`'in beklediği sunucu tarafını
> yazdırmak için hazırlanmış bir görev tanımıdır. Frontend hazır ve çalışıyor;
> eksik olan tek şey burada tarif edilen endpoint'ler. Kodda bağlanacak
> noktalar `INTEGRATION:` yorumlarıyla işaretli.

---

## Prompt

Primary Arch (NBA arketip sitesi) projesinde **Online Opponent** oyun modunun backend'ini
yaz. Frontend tamamen hazır — `frontend/src/pages/OnlineGame.jsx` içindeki `INTEGRATION:`
yorumlu 5 noktaya bağlanacak. Mevcut mimariye uy, yeni bir paralel sistem kurma.

### Zaten var olan ve DEĞİŞTİRİLMEYECEK altyapı

- `api/main.py` — FastAPI. Auth `Depends(get_current_user)` ile, JWT `sub` = user id.
- `POST /api/game/room` + `GET /api/game/room/{code}` + `POST /api/game/room/{code}/join`
  ve `WS /ws/game/room/{code}` — With a Friend'in tamamı. Snake draft, joker,
  counter-joker, koç seçimi, best-of-7 serisi bu protokolde ÇALIŞIYOR.
- `GET /api/leaderboard?limit&mode=classic|salarycap` → `lineup_games` tablosundan
  `pct, grade, lineup_json, created_at, username, wins, season_result, sim_era, mode`.
- `POST /api/game/score` — biten oyunu `lineup_games`'e yazar.
- Oyun simülasyonu ve skorlama **frontend'de** (`src/game/lineupScore.js`,
  `headToHead.js`, `seasonSim.js`). Sunucu skor HESAPLAMAZ, sadece durum tutar ve
  yayınlar. Bunu bozma.

### Yapılacak 1 — Matchmaking kuyruğu

`OnlineGame.jsx`'te `INTEGRATION: matchmaking-join / -leave / -accept`.

```
POST   /api/game/matchmaking/join      (auth)
       body: { wheel_mode: "round" | "pick" }
       → 200 { queued: true, queue_size: int }
       → 409 { detail: "already in a game" }   (aktif odası varsa)

DELETE /api/game/matchmaking            (auth)
       → 200 { left: true }

WS     /ws/game/matchmaking?token=...
       sunucu → istemci mesajları:
         { type: "queue",   size: int }               # periyodik / değişimde
         { type: "matched", room_code: str,
           opponent: { username, games: int, best: int|null } }
         { type: "error",   message: str }
```

Kurallar:

- Kuyruk **bellekte** tutulabilir (tek process). Kalıcılık gerekmiyor; süreç
  yeniden başlarsa kuyruk boşalır, istemci `Idle`'a döner.
- Eşleşme **FIFO**: iki kişi olur olmaz eşleş. Rating/ELO YOK (henüz rating alanı yok).
- Eşleşince sunucu `mode: "friend"` ile **normal bir oda açar** (mevcut
  `create_room` mantığını yeniden kullan, kopyalama) ve iki tarafa da aynı
  `room_code`'u gönderir. `wheel_mode` kuyruğa ilk giren oyuncununki olsun.
- Bir kullanıcı aynı anda tek kuyrukta olabilir. WS kopunca kuyruktan düşsün.
- `opponent.games` = o kullanıcının `lineup_games` satır sayısı,
  `opponent.best` = `MAX(pct)`. Yoksa `null` dön (istemci "new challenger" yazar).

Frontend tarafında `acceptMatch()` şu an sadece uyarı basıyor; sen bitirince
`navigate('/game/friend?room=' + room_code)` olacak. **Bunun için
`WithAFriendGame`'in `?room=` query param'ıyla doğrudan odaya girmesi gerekiyor**
— şu an sadece elle kod girerek katılıyor. O küçük değişikliği de yap.

### Yapılacak 2 — Board challenge (asıl yeni mekanik)

`OnlineGame.jsx`'te `INTEGRATION: challenge-start` ve `resolve-roster`.

Oyuncu, Salary Cap leaderboard'unun ilk 25'inden bir kadro seçip ona karşı
oynuyor. **Rakip donmuş**: canlı bir insan yok, kadro sabit, seri normal
motorla simüle ediliyor.

**Asıl problem şu:** `lineup_games.lineup_json` yalnızca oyuncu İSİMLERİ tutuyor
(`["Stephen Curry", ...]`). Maçı kurmak için tam oyuncu satırları lazım —
`overall_score`, `score_*` arketip kolonları, `_season`, `_cost`, `primary_arch`.
Frontend bunlarsız `computeLineupFit` / `buildMatchup` çalıştıramaz.

```
GET  /api/game/board?limit=25                    (auth gerekmez)
     → { entries: [ { id, username, pct, grade, wins, season_result,
                      sim_era, created_at, roster: [<tam oyuncu satırı> × 9] } ] }

POST /api/game/challenge                          (auth)
     body: { entry_id: int }
     → { room_code, sim_era, wheel_mode: "round",
         opponent: { username, pct, grade, roster: [...] } }
```

Roster çözümü için iki yol var, **B'yi tercih et**:

- **A (kırılgan):** her istekte isimden arayıp `data/*.parquet` üzerinden eşleştir.
  İsim normalizasyonu tek noktada standart değil (bkz. CLAUDE.md "BİLİNEN
  KISITLAR") — aksanlı isimlerde ve aynı adlı oyuncularda patlar.
- **B (doğru):** `lineup_games`'e `roster_json` diye YENİ bir kolon ekle ve
  `POST /api/game/score` çağrısında frontend'in elindeki **tam oyuncu
  satırlarını** yaz. Eski satırlar için `roster_json` `NULL` kalır; `/api/game/board`
  yalnızca `roster_json IS NOT NULL` olanları döndürsün. Böylece isim eşleştirme
  hiç devreye girmez.
  - Migration'ı `ALTER TABLE ... ADD COLUMN` ile idempotent yaz (mevcut şema
    kurulum mantığına uy).
  - `POST /api/game/score`'a `roster` alanı ekle (opsiyonel — eski istemciler
    kırılmasın), gelirse `roster_json`'a serialize et.
  - Oyuncu satırı büyük; sadece maç için GEREKENLERİ sakla:
    `PLAYER_NAME, primary_arch, overall_score, _season, _cost, _posPenalty` ve
    `score_*` kolonlarının tamamı. Gereksiz box-score alanlarını at.

Challenge odası:

- With a Friend odasının **tek taraflı** hâli. `mode: "challenge"` ile aç.
- `player2_user_id` = board sahibinin id'si ama o kullanıcı odaya **bağlanmaz**;
  kadrosu baştan dolu gelir, `ready_for_coaches` ve koçu da kayıttan (varsa)
  ya da varsayılan olarak set edilir.
- `sim_era` = board kaydının `sim_era`'sı — **meydan okuyan seçemez**.
- Counter-joker'lar bu modda kapalı (donmuş kadro cevap veremez). Sunucu
  `counter_jokers_enabled: false` bayrağı dönsün, frontend ona göre gizlesin.
- Sonuç `lineup_games`'e normal şekilde yazılsın, ayrıca `challenge_results`
  tablosuna `(challenger_id, entry_id, won, series_score, created_at)` düşsün ki
  board bir merdivene dönüşsün.

### Sınırlar ve dikkat

- Rate limit: `matchmaking/join` ve `challenge` spam'lenebilir; kullanıcı başına
  makul bir limit koy.
- `lineup_games` şu an sadece **kendi** oyununu yazıyor; `challenge` sonucunun
  board sahibinin kaydını DEĞİŞTİRMEDİĞİNDEN emin ol — kadro donmuş kalmalı.
- WS bağlantı kopmalarını mevcut oda WS'inin yaptığı gibi ele al (aynı
  reconnect/`opponent_left` semantiği).
- Test: kuyruğa iki sahte kullanıcı sok, eşleştiklerini ve aynı `room_code`'u
  aldıklarını doğrula; board challenge'da `roster_json`'ı olmayan eski kaydın
  listeye HİÇ düşmediğini doğrula.

### Kabul kriterleri

1. İki tarayıcıda iki hesapla `Find Opponent` → ikisi de aynı odaya düşüyor,
   draft normal işliyor.
2. `Challenge the Board` → seçilen kadro kortta gerçek oyuncu verisiyle
   yükleniyor, draft + koç + best-of-7 sonuna kadar çalışıyor.
3. Board listesi yalnızca `roster_json`'ı olan Salary Cap kayıtlarını, `pct`
   sırasıyla, en fazla 25 tane gösteriyor.
4. Meydan okunan kullanıcının leaderboard kaydı değişmiyor.
```

---

## Frontend'de bağlanacak noktalar (referans)

| Yer | Dosya | Ne bekliyor |
|---|---|---|
| `INTEGRATION: matchmaking-join` | `OnlineGame.jsx` `startQueue()` | `POST /api/game/matchmaking/join` + WS aboneliği |
| `INTEGRATION: matchmaking-leave` | `OnlineGame.jsx` `cancelQueue()` | `DELETE /api/game/matchmaking` |
| `INTEGRATION: matchmaking-accept` | `OnlineGame.jsx` `acceptMatch()` | `navigate('/game/friend?room=' + code)` |
| `INTEGRATION: challenge-start` | `OnlineGame.jsx` `challengeBoard()` | `POST /api/game/challenge` |
| `INTEGRATION: resolve-roster` | `OnlineGame.jsx` leaderboard `useEffect` | `GET /api/game/board` (roster dahil) |
