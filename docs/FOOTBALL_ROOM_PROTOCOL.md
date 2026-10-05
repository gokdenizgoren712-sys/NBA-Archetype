# Futbol odaları ve eşleştirme — mesaj sözleşmesi

Kaynak: `api/football_ws.py`, `api/main.py` (`/api/football/h2h/*`).
Karşılığı olan iş listesi: `docs/BACKEND_PROMPT_GAME_UI.md` madde 1, 2, 4.
Kural motoru: `src/football/draft_rules.py` (istemci kopyası `frontend/src/game/football/draft.js`).

Tüm soket hataları iki biçimden biri:
- `{type:"error", message}` — bu mesaj reddedildi, bağlantı açık, tekrar denenebilir.
- `{type:"fatal", reason, message}` — bu bağlantı kalıcı olarak reddedildi, **yeniden deneme**.
  `reason`: `invalid_token`, `banned`, `room_not_found`, `waiting`, `room_closed`.
  Reddi close code'la değil, `accept()` SONRASI gerçek bir mesajla yapıyoruz: tarayıcı
  close code'unu güvenilir iletmiyor, istemci aksi hâlde sonsuza dek yeniden dener.

---

## 1. Oda yaşam döngüsü (REST)

| | |
|---|---|
| `POST /api/football/h2h/room` `{mode, season?, name?}` | Oda kur. `p1_name` yoksa hesabın kullanıcı adı. |
| `POST /api/football/h2h/room/{code}/join` | Katıl. Kapanmış (`abandoned`/`resolved`) oda → 409 `This room is closed`. Dolu → 409. |
| `GET  /api/football/h2h/room/{code}` | Odanın dışa açık hâli. |
| `POST /api/football/h2h/room/{code}/leave` | Ayrıl (aşağıda). |

### Oda nesnesi (`GET` / `join`)

```
room_code, mode ("friend"|"online"), status, season, you ("p1"|"p2"|null),
p1_name, p2_name,                 # satırdaki ad, yoksa hesabın kullanıcı adı
p1_ready, p2_ready,               # kadro-gönder akışında kadro geldi mi
opponent_joined: bool,            # İKİ koltuk da dolu (host için "misafir geldi",
                                  # misafir için her zaman true). Lobiden draft'a geçiş buna bağlı.
players: [{seat, user_id, username}],   # dolu koltuklar
your_squad, result                # (kadro-gönder akışı)
```

`status`: `waiting` (misafir yok) → `building` (iki koltuk dolu) → `resolved` (eleme bitti)
ya da `abandoned`.

### Ayrılma — `POST .../leave`

Yanıt: `{ok, status, reopened}`.

| Kim ayrılıyor | Oda türü | Sonuç |
|---|---|---|
| misafir | `friend` | koltuk boşalır, oda `waiting`'e döner (kod hâlâ paylaşılabilir), `reopened:true` |
| misafir | `online` (eşleştirmeyle kurulmuş) | `abandoned` — bekleyecek kimse yok |
| host | herhangi | `abandoned` |
| herkes | `resolved` / `abandoned` | dokunulmaz, mevcut durum döner |

Koltuklar değiştiği için draft durumu (bellek + `draft_state_json`) silinir ve misafirin kadrosu
temizlenir. Kalan oyuncuya `{type:"opponent_left", user_id, room_status}` gider.
Eşleştirme kontrolü `status IN ('waiting','building')` baktığı için, ayrılan oyuncu artık
"zaten bir odadasın" diye engellenmez.

---

## 2. Oda soketi — `/ws/football/room/{code}?token=…`

Sunucu otoriter: sıra, çark ve seçim geçerliliğini sunucu belirler. İstemci yalnız niyet yollar.

**İstemci → sunucu**

| type | alanlar | not |
|---|---|---|
| `ping` | | `pong` döner |
| `shape` | `shape` | yalnız `setup` aşamasında; diziliş değişince hazır işareti düşer |
| `wheel` | `wheelMode` (`round`\|`pick`) | yalnız koltuk 1 (odayı açan) |
| `ready` | `ready` | ikisi de hazırsa draft başlar, sunucu çarkı çevirir |
| `pick` | `player_id`, `slot` | sırası olmayan / havuzda olmayan / sığmayan → `error` |
| `rematch_ready` | `ready?` (varsayılan true) | yalnız `stage:"done"`; aşağıda |

**Sunucu → istemci**

- `state` — tam görünüm (`stage`, `phase`, `round`, `activeSeat`, `seats`, `names`, `shapes`,
  `squads`, `pool`, `takenIds`, `result`, `rematch_ready`, `rematches`, `rematch_limit`, `history`, …)
- `peer` — karşı taraf bağlandı
- `opponent_left` — karşı taraf ayrıldı/koptu (`room_status` yalnız `leave` endpoint'inden gelir)
- `error`, `fatal`, `pong`

Her yanıtlanan eylem = her sokete bir `state`. Bağlanırken tam durum yalnız bağlanana gider,
diğerine hafif `peer`.

### Rövanş

`stage:"done"` iken her oyuncu `{type:"rematch_ready"}` yollar. `state.rematch_ready` bir
`{"<user_id>": bool}` haritasıdır. **İkisi de hazır olunca** aynı odada yeni oyun başlar:

- Koltuklar **yer değiştirir**: önceki misafir host olur (ilk ayağı o oynar, wheel'i o seçer).
  Değişiklik `football_h2h_rooms` satırında da yapılır (`p1_*` ↔ `p2_*`).
- Önceki turda **ilk seçmeyen** şimdi ilk seçer.
- Kadrolar, `result`, `takenIds`, çark havuzu sıfırlanır; `stage:"setup"`, `wheelMode` korunur.
- Önceki sonuçlar `history[]`'de tutulur (oda satırındaki `result_json` yeni elemede üzerine yazılır).
- `rematches` artar. Bir odada en fazla `rematch_limit` (5) rövanş; aşılırsa `error`.
- Biri hazır deyip ayrılırsa işareti düşer ve kalan oyuncuya güncel `state` gider.
- `ready:false` ile geri alınabilir. Yalnız biri hazırken hiçbir şey değişmez.

**Basketbol karşılığı henüz yok** (`game_ws.py`); bu belge yalnız futbolu kapsar.

---

## 3. Online eşleştirme

| | |
|---|---|
| `POST   /api/football/matchmaking/join` | Kuyruğa gir. 409: zaten odada ya da bekleyen eşleşmen var. |
| `DELETE /api/football/matchmaking` | Kuyruktan çık. Eşleşme beklerken çıkmak = **reddetmek**. |
| `WS     /ws/football/matchmaking?token=…` | Eşleşme olayları. |

### Akış

```
kuyruk → matched ─┬─ iki taraf accept ──→ starting {room_code, starts_at}  (oda ŞİMDİ açılır)
                  ├─ biri decline ──────→ diğeri requeued, reddeden declined
                  ├─ süre dolar ────────→ kabul eden requeued, cevap vermeyen timed_out
                  └─ biri kopar ────────→ diğeri requeued (opponent_disconnected)
```

Oda **iki kabulden önce açılmaz.**

**Sunucu → istemci**

```
queue       {size, avg_wait_s|null}              # skill_band YOK (futbolda puan sistemi yok)
matched     {match_id, accept_deadline, accept_seconds, opponent, opponent_user_id}
              opponent = {user_id, username, record:{wins,losses,played}, ping_ms|null}
opponent_accepted {match_id}
starting    {room_code, starts_at, opponent_user_id}   # starts_at: UTC ms, ≈ +3 sn
requeued    {reason, match_id?, size}            # reason: opponent_declined | opponent_timed_out
                                                 #         | opponent_disconnected | room_error
declined    {match_id}                           # sana: reddettin
timed_out   {match_id}                           # sana: süre doldu, düştün
probe       {t}                                  # ping ölçümü, istemci probe_ack ile cevaplar
```

**İstemci → sunucu**: `accept`, `decline`, `probe_ack {t}` (probdaki `t`'yi aynen geri yolla), `ping`.

- **Süre**: `ACCEPT_SECONDS = 10`. İki taraf bu sürede kabul etmeli.
- **Geri dönen oyuncu kuyruğun BAŞINA** döner, özgün bekleme süresiyle; reddeden/cevap vermeyen dönmez.
  Sırada başka biri varsa hemen yeni eşleşme kurulur.
- **`starts_at`**: iki istemci aynı anda draft'a girsin diye ortak bir UTC ms. İstemci saatiyle
  değil, aldığı değerle karşılaştırır.
- **`opponent.record`**: `football_h2h_results` tablosundan (her biten eleme bir satır; oda satırındaki
  `result_json` rövanşta üzerine yazıldığı için oradan sayılamaz).
- **`opponent.ping_ms`**: istemci `probe`'u `probe_ack` ile geri yolladıysa ölçülmüş gidiş-dönüş;
  yoksa `null`. Uydurulmaz.
- **`queue.avg_wait_s`**: son 20 eşleşmenin ortalama bekleme süresi; veri yoksa `null`.

### Kuyruktan düşme

| Durum | Sonuç |
|---|---|
| Soket kapanır | kuyruktan **düşer** (sayfadan çıkınca arama biter) |
| Eşleşme beklerken soket kapanır | reddetmiş sayılır; rakip kuyruğa döner |
| Yalnız REST ile girip soketi hiç açmayan | `QUEUE_STALE_S = 120` sn sonra bir sonraki `join`'de atılır |
| Yeni girmiş, soketi biraz sonra açacak | atılmaz (yarış payı) |

Tek süreç, bellekte. Birden çok instance'a ölçeklenirse ortak bir kuyruk (Redis vb.) gerekir —
basketboldaki kuyrukla aynı sınır.
