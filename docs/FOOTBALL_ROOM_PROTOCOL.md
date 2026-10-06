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

---

## 4. The Board ve meydan okuma

Başkasının kaydettiği 18'lik kadroya karşı draft et. Kaynak: `saved_rosters` (`sport='football'`),
yani leaderboard'un okuduğu tablo.

| | |
|---|---|
| `GET  /api/football/board?limit=25` | Persantil başına **tek temsilci**, yüksekten düşüğe. |
| `GET  /api/football/board/at-score?pct=` | O persantile ulaşmış **tüm** kadrolar, en yeni önce. |
| `POST /api/football/challenge` `{entry_id}` | Odayı kurar; yanıt `{room_code, opponent:{username,name,shape,pct,roster}}`. |

**Skor persantildir, ham değil.** Kaydedilen skor 0–1 arası kimya kesri; Board onu leaderboard'la aynı
referans dağılımına (`_pct_of`, 28.388 gerçek ilk-11) çevirip tam sayı persantile göre gruplar.
Aynı persantilde birden çok kadro varsa temsilci **ilk kaydeden** (o puana ilk ulaşan).
Referans dosyası yoksa persantil hesaplanamaz ve kadro listeye girmez — yerleştirilemeyen birini
sıralamaya sokmak sıralamayı uydurmak olurdu.

**Board kaydı**: `{id, username, name, shape, pct, seasons[], leagues[], created_at, roster[18],
challenges:{attempts, beaten}}`. `id` challenge'a verilecek `entry_id`. `beaten`: meydan okuyanların
kaçı kazandı. `roster` **kırpılmış** (10 alan: `PLAYER_ID, PLAYER_NAME, TEAM, LEAGUE, SEASON, PHASE,
POSITION, primary_arch, overall_score, _slot`) — tam oyuncu satırı 151 alan (~4 KB), 25 giriş ≈ 1,9 MB
eder; kırpılmışı ≈ 107 KB.

**Geçersiz kadro Board'da görünmez**: 18 kişi olmayan, 11'i saha slotunda olmayan, kaleci kuralını ya da
dizilişi bozan, aynı oyuncuyu iki kez içeren kadro. Meydan okunursa 409 `That squad can't be challenged`.

### Meydan okuma odası

- `mode:"challenge"`, `flow:"challenge"`, `challenge_entry_id`. Koltuk 1 = meydan okuyan, koltuk 2 = kadronun
  sahibi (**oyunda yok**, bağlanamaz: `room_not_found`).
- Donmuş durum meydan okunduğu **anda** kurulup diske yazılır: sahibi sonra kadrosunu silse bile oda düşmez.
- Koltuk 2'nin XI'i baştan dolu ve hazır; draft yalnız koltuk 1 için işler, rakibi **beklemez**.
  Rakibin 11 oyuncusu `takenIds`'te — çarktan çekilemez.
- **Rakip kadro draft sırasında görünür.** Basketboldaki "donmuş, draft bitince görürsün" metni futbolda
  yok: Board listesi her 18'liği zaten herkese açıyor, draft sırasında saklamak hiçbir şeyi saklamazdı.
- Rövanş yok (`rematch_ready` → `error`): rakip yok, yeni kadro seçmek için Board'a dönülür.
- `/squad` (kadro-gönder) bu odada 409.
- Sonuç `football_challenge_results`'a yazılır (`won:1` = meydan okuyan kazandı). **H2H rekoruna yazılmaz**:
  sahibi oyunda yoktu, onun rekoruna galibiyet/mağlubiyet yazmak yanlış olurdu.
- Sahibi, bir meydan okuma sürerken eşleştirmeye ya da kendi odasını kurmaya **engellenmez** (o oyunda yok).
- Tam kadro (`length:"squad"`): `POST /api/football/challenge {entry_id, length}`. Rakibin 7 yedeği de
  dondurulur (`takenIds` 18); koltuk 2 review'da **baştan kilitli**; menajer aşaması **yok** (donmuş
  kadronun menajeri yok). Board'a yalnız 18'lik kadrolar girdiği için kısa draft'ta da bu kadro 18'dir —
  `length` yalnızca *meydan okuyanın* ne kadar draft edeceğini belirler.

## 5. Draft uzunluğu ve tam kadro akışı

Her futbol modunda iki uzunluk: **`"xi"`** (varsayılan, ilk 11, eski istemciler aynen çalışır) ve
**`"squad"`** (11 + 7 yedek = 18 seçim). Leaderboard yalnız 18'lik kadrolardan hesaplanır
(`/api/rosters` futbolda 18 ister), bu yüzden kısa draft'ın sonucu Board'a kaydedilemez.

**Seçim:** `POST /api/football/h2h/room {length}` (geçersiz → 400); odayı açan kurulumda soketten de
değiştirebilir: `{"type":"length","length":"squad"}` (yalnız host, yalnız `setup`; aksi `error`).
Online eşleştirmede `POST /api/football/matchmaking/join {length}` — **yalnız aynı uzunluğu isteyenler**
eşleşir (`queue.by_length`, `matched.length`); oda eşleşmenin uzunluğunu alır. Rövanş uzunluğu korur.
Oda nesnesi ve `state` mesajı `length` taşır.

**`squad` akışı:** `setup → drafting → review → hire → done`

- Yedek slotlar `SUB1…SUB7`: pozisyon cezası yok, skor/ceza yalnız saha XI'inden. Slot id'leri `pick.slot`'ta.
- **review** — `{"type":"swap","a":slot,"b":slot}` (kaleci yalnız kalede: `error "A goalkeeper can only stand in goal."`),
  `{"type":"lock","ready":true|false}`. Kilitliyken takas reddedilir (`"Unlock your squad…"`). İkisi de
  kilitleyince `hire`.
- **hire** — `state.manager_options[seat]` = SUNUCUNUN çektiği 4 menajer (iki taraf aynı anda seçer);
  `{"type":"hire","manager":name}` (listede olmayan/ikinci seçim → `error`). İkisi de seçince eleme.
- Menajer bonusu: şekil eşleşirse `0.05·q`, değilse `0.01·q`, `q = (grade(att)+grade(def))/2`.
  `quality = clamp(0.25..0.95, ortalama − pozisyon cezası + bonus)`.
- `state.numbers[seat] = {quality, mean, positionFit, bonus, matched}` — eleme motorunun gördüğü rakamlar;
  iki ekran aynısını göstersin diye sunucudan gelir.
- `state` yeni alanlar: `length`, `locked`, `manager_options`, `managers`, `numbers`.

## 6. Kendi jokerleri

`{"type":"joker","joker":"reTeam"|"reYear"|"reBoth"|"double"|"discover"}` — yalnız **sıra sendeyken** ve
havuz inmişken (`phase:"drafting"`); aksi `error`. Her taraf her jokeri **bir kez** kullanır
(`state.jokers[seat][joker]`: `true` = kullanılabilir). Hak, joker gerçekten işlediyse harcanır.

| Joker | Etki |
|---|---|
| `reTeam` (Club) | Aynı sezon, yeni kulüp. Kilide uyan taze çift yoksa `error`, hak yanmaz. |
| `reYear` (Year) | Aynı kulüp, yeni sezon. Aynı şekilde. |
| `reBoth` | Tamamen yeni kulüp-sezon. |
| `double` (Pick 2) | `state.double:true`; sıradaki seçim sırayı **bırakmaz**, ikincisi normal ilerler. En az 2 boş slot şart. İlk seçimde harcanır. |
| `discover` | `state.discover:true` — bu turda OVR gösterilir. Tur/havuz değişince (seçim ya da yeniden çevirme) kapanır; Pick 2'nin ikinci seçiminde açık kalır. |

`discover` yalnız bir sunum bayrağıdır: puanlar `pool.players`'ta zaten herkese açık (bkz. `_public`),
"??" gizlemesini istemci yapar. Karşı-jokerler için bkz. §7. Rövanş ve yeni oda tüm hakları geri verir.

## 7. Karşı-jokerler ve 15 sn pencere

**Açma:** varsayılan **kapalı** (pencereyi bilmeyen istemci her seçimde 15 sn takılırdı).
`POST /api/football/h2h/room {counters:true}` ya da kurulumda host `{"type":"counters","on":true}`
(yalnız host, yalnız `setup`). Oda nesnesi ve `state` `counters` taşır; rövanş korur.
Online eşleştirme ve Board meydan okuması şimdilik **kapalı** odalar açar.

**Pencere:** her seçim turu başında (çark indiğinde) bekleyen tarafın elinde karşı-joker varsa
`counter_deadline` (UTC ms, `now + COUNTER_SECONDS=15 sn`) yazılır, `counter_pending:true`.
Pencere açıkken aktif taraf **seçemez ve joker kullanamaz** (`error "…deciding on a counter-joker"`).
Pencere kapanır: bekleyen karar verince, ya da süre dolunca (sunucu `counter_dismissed:true` yayınlar —
rakip bağlantısı kopuk olsa da işler; süre geçmişse sunucu yeniden başlasa bile tur kilitli kalmaz).
Pick 2'nin ikinci seçimi yeni pencere açmaz. Bekleyenin karşı-jokeri kalmadıysa pencere hiç açılmaz.

**Mesaj** (yalnız bekleyen taraf, yalnız pencere açıkken): `{"type":"counter","counter":…}`

| `counter` | Etki |
|---|---|
| `pass` | "No thanks" — pencere kapanır. |
| `ban` + `player_id` | O oyuncu bu turda seçilemez (`state.banned`; pick → `error "…banned…"`). Aktif tarafın **herhangi bir kendi jokeri banı kaldırır**. Sonraki tura taşmaz. |
| `forceTeam` | Aktif tarafın havuzunu aynı sezonda başka kulübe çevirir. |
| `forceYear` | Aynı kulüpte başka sezona çevirir. |

Hak, karşı-hamle gerçekten işlediyse harcanır (kilide uyan taze çift yoksa `error`, hak yanmaz).
