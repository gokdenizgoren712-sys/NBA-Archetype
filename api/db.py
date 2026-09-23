"""SQLite veritabanı kurulumu."""
import sqlite3, os
from pathlib import Path

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "data" / "app.db")))

def get_conn():
    # timeout + busy_timeout: bir yazici baskasini beklerken HEMEN hata vermesin.
    # Varsayilan 5sn yeterli gorunuyordu ama rollback-journal modunda OKUYAN bir
    # baglanti YAZANI blokluyor ve SQLite kilitlenme ihtimalinde beklemeden
    # SQLITE_BUSY donuyor -- bu yuzden WAL de sart (init_db).
    conn = sqlite3.connect(str(DB_PATH), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 15000")
    return conn

def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        # WAL: okuyanlar yazani bloklamiyor. Bu bir DOSYA ayari, bir kez
        # yazilir ve kalir. Gerekcesi olculdu (2026-09-23): `GET /collections`
        # koleksiyonlari TEMBEL olusturuyor (INSERT OR IGNORE) ve iki istek
        # ust uste gelince -- React StrictMode'un cift cagrisi bile yetiyor --
        # "database is locked" ile **500** donuyordu. Ekran o yuzden bos kaldi.
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            email            TEXT UNIQUE NOT NULL,
            username         TEXT UNIQUE NOT NULL,
            hashed_password  TEXT NOT NULL,
            role             TEXT NOT NULL DEFAULT 'user',
            is_banned        INTEGER NOT NULL DEFAULT 0,
            reset_token      TEXT,
            reset_expires    TEXT,
            created_at       TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS articles (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            title            TEXT NOT NULL,
            slug             TEXT UNIQUE NOT NULL,
            content          TEXT NOT NULL DEFAULT '',
            cover_image_url  TEXT,
            author_id        INTEGER REFERENCES users(id),
            status           TEXT NOT NULL DEFAULT 'draft',
            created_at       TEXT DEFAULT (datetime('now')),
            updated_at       TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id  INTEGER REFERENCES articles(id) ON DELETE CASCADE,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            content     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS saved_players (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
            player_name  TEXT NOT NULL,
            season       TEXT NOT NULL DEFAULT '2025-26',
            created_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, player_name, season)
        );

        CREATE TABLE IF NOT EXISTS saved_lineups (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            players     TEXT NOT NULL,
            score       REAL,
            grade       TEXT,
            pct         REAL,
            label       TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS lineup_games (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            pct         INTEGER NOT NULL,
            grade       TEXT NOT NULL,
            lineup_json TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        -- "Kadro Kaydetme" (bkz. docs/online-architecture-review-and-roadmap.md Faz 1).
        -- roster_json BİLEREK lineup_json (sadece isim) ile AYNI ŞEKİL DEĞİL — Board
        -- Challenge'da (lineup_games.roster_json) yaşanan "sadece isimle headToHead.js
        -- çalışmaz" hatasına tekrar düşmemek için tam oyuncu satırı (PLAYER_NAME,
        -- primary_arch, overall_score, score_*, _season, _cost, _posPenalty) taşır —
        -- aynı şekli _backfill_roster_json_once() (api/main.py) zaten üretiyor.
        CREATE TABLE IF NOT EXISTS saved_rosters (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name         TEXT NOT NULL,
            source_mode  TEXT NOT NULL DEFAULT 'single',   -- 'single' | 'same_screen' | 'with_a_friend'
            mode         TEXT NOT NULL DEFAULT 'classic',  -- 'classic' | 'salarycap'
            sim_era      TEXT,
            roster_json  TEXT NOT NULL,
            overall_pct  REAL,
            grade        TEXT,
            -- Futbol kadrolari 18 kisi ve dizilis kodlu ('4-3-3'); basketbol
            -- 9 kisi ve 'classic'/'salarycap'. Tek tabloyu ikisi paylasiyor,
            -- ayrimi bu kolon tutuyor. Eski satirlar basketbol.
            sport        TEXT NOT NULL DEFAULT 'basketball',
            created_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, name)
        );

        CREATE TABLE IF NOT EXISTS challenge_results (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            challenger_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
            entry_id       INTEGER REFERENCES lineup_games(id) ON DELETE CASCADE,
            won            INTEGER NOT NULL,
            series_score   TEXT,
            created_at     TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tag_corrections (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
            player_name     TEXT NOT NULL,
            season          TEXT NOT NULL DEFAULT '2025-26',
            current_arch    TEXT NOT NULL,
            suggested_arch  TEXT NOT NULL,
            note            TEXT,
            status          TEXT NOT NULL DEFAULT 'pending',
            created_at      TEXT DEFAULT (datetime('now'))
        );

        -- Futbol arketip sözlüğü geri bildirimi (2026-08). Basketboldaki
        -- tag_corrections'tan AYRI ve farklı şekilli: orada bir OYUNCUnun
        -- etiketi düzeltiliyor, burada henüz oyuncu yok — sözlüğün KENDİSİ
        -- (isim değişikliği ya da eksik arketip) tartışılıyor.
        -- phase: gk | def | mid | fwd   ·   kind: rename | add | other
        -- Oyuncu fotografinin kartta nasil oturdugu. Cutout'lar farkli en/boy
        -- oranlarinda cikiyor (kimi omuzdan, kimi belden); tek bir CSS kurali
        -- hepsine uymuyor. Admin bunlari tek tek duzeltebilsin diye kalici
        -- olarak burada. Kayit YOKSA kart varsayilan yerlesimi kullanir.
        -- Futbol kafa kafaya odalari. Basketbolun game_rooms'undan AYRI:
        -- orada iki NBA takimindan canli sirayla draft ediliyor, burada her
        -- oyuncu kendi XI'ini kurup GONDERIYOR ve iki taraf da gonderince
        -- eslesme SUNUCUDA cozuluyor. Sonucu istemciye birakmak, oyuncunun
        -- kendi skorunu bildirmesi demek olurdu.
        CREATE TABLE IF NOT EXISTS football_h2h_rooms (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code     TEXT UNIQUE NOT NULL,
            mode          TEXT NOT NULL DEFAULT 'friend',   -- friend | online
            status        TEXT NOT NULL DEFAULT 'waiting',  -- waiting|building|resolved|abandoned
            season        TEXT,
            p1_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
            p2_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
            p1_squad_json TEXT,      -- [{PLAYER_ID, SEASON}] — 11 ilk 11
            p2_squad_json TEXT,
            p1_name       TEXT,
            p2_name       TEXT,
            result_json   TEXT,      -- sunucuda cozulen eslesme
            created_at    TEXT DEFAULT (datetime('now')),
            updated_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS football_photo_layout (
            player_id  INTEGER PRIMARY KEY,
            scale      REAL NOT NULL DEFAULT 1.0,   -- 0.6 .. 2.0
            offset_x   REAL NOT NULL DEFAULT 50.0,  -- object-position %
            offset_y   REAL NOT NULL DEFAULT 100.0, -- 100 = alta hizali
            updated_at TEXT DEFAULT (datetime('now')),
            updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS football_archetype_feedback (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
            phase        TEXT NOT NULL,
            kind         TEXT NOT NULL DEFAULT 'other',
            archetype    TEXT,
            suggestion   TEXT NOT NULL,
            note         TEXT,
            status       TEXT NOT NULL DEFAULT 'pending',
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS game_rooms (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code        TEXT UNIQUE NOT NULL,
            mode             TEXT NOT NULL,                     -- 'friend' | 'online'
            status           TEXT NOT NULL DEFAULT 'waiting',   -- waiting|drafting|complete|abandoned
            season           TEXT NOT NULL,
            team_a           TEXT NOT NULL,
            team_b           TEXT NOT NULL,
            pool_json        TEXT,
            player1_user_id  INTEGER REFERENCES users(id),
            player2_user_id  INTEGER REFERENCES users(id),
            turn_user_id     INTEGER,
            pick_number      INTEGER NOT NULL DEFAULT 0,
            created_at       TEXT DEFAULT (datetime('now')),
            updated_at       TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS game_room_picks (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id      INTEGER REFERENCES game_rooms(id) ON DELETE CASCADE,
            user_id      INTEGER REFERENCES users(id),
            player_id    TEXT NOT NULL,
            slot_index   INTEGER NOT NULL,
            pick_number  INTEGER NOT NULL,
            created_at   TEXT DEFAULT (datetime('now'))
        );

        -- RankIt by Primary Arch: scouting verisinden tamamen bagimsiz sosyal
        -- mac gunlugu. Tum tablolar rankit_ prefix'iyle izole tutulur.
        CREATE TABLE IF NOT EXISTS rankit_competitions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            sport       TEXT NOT NULL CHECK(sport IN ('Basketball','Football','Olympics')),
            name        TEXT NOT NULL,
            country     TEXT,
            season      TEXT NOT NULL,
            UNIQUE(sport, name, season)
        );

        CREATE TABLE IF NOT EXISTS rankit_teams (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            sport       TEXT NOT NULL,
            name        TEXT NOT NULL,
            short_name  TEXT NOT NULL,
            color       TEXT NOT NULL DEFAULT '#FFB11B',
            crest_url   TEXT,
            country     TEXT,
            UNIQUE(sport, name)
        );

        -- Kulup armaları maç/kullanıcı verisinden bağımsız yönetilir. Aynı
        -- takım için kaynak ve güncelleme zamanı ayrıca izlenebilir.
        CREATE TABLE IF NOT EXISTS rankit_team_logos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id     INTEGER NOT NULL UNIQUE REFERENCES rankit_teams(id) ON DELETE CASCADE,
            logo_url    TEXT NOT NULL,
            source      TEXT NOT NULL DEFAULT 'provider',
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rankit_sync_state (
            job_name         TEXT PRIMARY KEY,
            last_attempt     TEXT,
            last_success     TEXT,
            last_error       TEXT,
            updated_matches  INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS rankit_players (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            sport       TEXT NOT NULL,
            team_id     INTEGER REFERENCES rankit_teams(id) ON DELETE SET NULL,
            name        TEXT NOT NULL,
            shirt_no    TEXT,
            image_url   TEXT,
            UNIQUE(sport, name)
        );

        CREATE TABLE IF NOT EXISTS rankit_matches (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            sport           TEXT NOT NULL,
            competition_id  INTEGER REFERENCES rankit_competitions(id),
            season          TEXT NOT NULL,
            starts_at       TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'upcoming',
            home_team_id    INTEGER REFERENCES rankit_teams(id),
            away_team_id    INTEGER REFERENCES rankit_teams(id),
            home_score      INTEGER,
            away_score      INTEGER,
            broadcaster     TEXT,
            editorial       INTEGER NOT NULL DEFAULT 0,
            summary         TEXT,
            cover_variant   TEXT,
            provider        TEXT,
            provider_match_id TEXT,
            stage           TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            UNIQUE(competition_id, starts_at, home_team_id, away_team_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_match_players (
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            player_id   INTEGER REFERENCES rankit_players(id) ON DELETE CASCADE,
            team_id     INTEGER REFERENCES rankit_teams(id),
            starter     INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY(match_id, player_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_diary_entries (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
            match_id      INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            watched_date  TEXT NOT NULL,
            rating        REAL CHECK(rating IS NULL OR (rating >= 0.5 AND rating <= 5.0)),
            review        TEXT,
            is_rewatch    INTEGER NOT NULL DEFAULT 0,
            visibility    TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','followers','private')),
            classic       INTEGER NOT NULL DEFAULT 0,
            spoiler       INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rankit_entry_tags (
            entry_id    INTEGER REFERENCES rankit_diary_entries(id) ON DELETE CASCADE,
            tag         TEXT NOT NULL,
            PRIMARY KEY(entry_id, tag)
        );

        CREATE TABLE IF NOT EXISTS rankit_potm_votes (
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            player_id   INTEGER REFERENCES rankit_players(id) ON DELETE CASCADE,
            updated_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, match_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_respect_votes (
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            player_id   INTEGER REFERENCES rankit_players(id) ON DELETE CASCADE,
            created_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, match_id, player_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_review_likes (
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            entry_id    INTEGER REFERENCES rankit_diary_entries(id) ON DELETE CASCADE,
            created_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, entry_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_review_comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            entry_id    INTEGER REFERENCES rankit_diary_entries(id) ON DELETE CASCADE,
            content     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rankit_follows (
            user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
            target_type  TEXT NOT NULL CHECK(target_type IN ('user','team','player','competition')),
            target_id    INTEGER NOT NULL,
            notify       INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, target_type, target_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_lists (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            description TEXT,
            ranked      INTEGER NOT NULL DEFAULT 0,
            visibility  TEXT NOT NULL DEFAULT 'public',
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rankit_list_items (
            list_id     INTEGER REFERENCES rankit_lists(id) ON DELETE CASCADE,
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            position    INTEGER NOT NULL,
            note        TEXT,
            PRIMARY KEY(list_id, match_id),
            UNIQUE(list_id, position)
        );

        CREATE TABLE IF NOT EXISTS rankit_watchlist (
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            created_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, match_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_favorites (
            user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
            target_type  TEXT NOT NULL CHECK(target_type IN ('match','team','player','competition')),
            target_id    INTEGER NOT NULL,
            created_at   TEXT DEFAULT (datetime('now')),
            PRIMARY KEY(user_id, target_type, target_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_watchalong_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id    INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            room        TEXT NOT NULL DEFAULT 'community',
            content     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        -- ── Yayıncı katmanı (TASLAK) ────────────────────────────────────────
        -- "Bu maçı bende hangi kanaldan izlerim?" — İLK KAPSAM: GB, US, TR.
        --
        -- İKİ KATMAN, bilinçli. Maç başına elle kayıt girmek 3000 maç × 3 ülke
        -- demek, kimse sürdüremez. Bu yüzden turnuva+ülke düzeyinde bir KURAL
        -- ("Premier League, GB, Sky Sports") ve onu ezen maç başına KESİN kayıt
        -- var. Ayrımı gizlemiyoruz: kural 'typical', maç kaydı 'confirmed'
        -- olarak işaretleniyor ve arayüz ikisini aynı dille sunmamalı —
        -- yanlış kanal göstermek, hiç göstermemekten kötü.
        --
        -- Hiçbiri yoksa cevap BOŞ. Tahmin üretmiyoruz.
        CREATE TABLE IF NOT EXISTS rankit_broadcasters (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            country  TEXT NOT NULL,              -- ISO 3166-1 alpha-2: GB, US, TR
            name     TEXT NOT NULL,              -- "Sky Sports", "beIN SPORTS"
            kind     TEXT NOT NULL DEFAULT 'tv'  -- tv | streaming
                     CHECK(kind IN ('tv','streaming')),
            url      TEXT,
            UNIQUE(country, name)
        );

        -- Turnuva+ülke varsayılanı. Aynı turnuvada birden fazla yayıncı olabilir
        -- (GB'de Premier League hem Sky hem TNT), o yüzden satır başına bir
        -- yayıncı ve UNIQUE üçlü.
        CREATE TABLE IF NOT EXISTS rankit_broadcast_rules (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            competition_id INTEGER NOT NULL REFERENCES rankit_competitions(id) ON DELETE CASCADE,
            country        TEXT NOT NULL,
            broadcaster_id INTEGER NOT NULL REFERENCES rankit_broadcasters(id) ON DELETE CASCADE,
            note           TEXT,                 -- "seçili maçlar" gibi kısıt
            updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
            updated_at     TEXT DEFAULT (datetime('now')),
            UNIQUE(competition_id, country, broadcaster_id)
        );

        -- Maç başına kesin kayıt. Kuralı EZER.
        CREATE TABLE IF NOT EXISTS rankit_broadcasts (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id       INTEGER NOT NULL REFERENCES rankit_matches(id) ON DELETE CASCADE,
            country        TEXT NOT NULL,
            broadcaster_id INTEGER NOT NULL REFERENCES rankit_broadcasters(id) ON DELETE CASCADE,
            -- Nereden geldiği ve NE ZAMAN doğrulandığı: yayın hakları sezon
            -- içinde değişiyor, tarihsiz bir kayıt bir süre sonra yalan olur.
            source         TEXT NOT NULL DEFAULT 'editorial'
                           CHECK(source IN ('editorial','provider')),
            verified_at    TEXT,
            updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
            updated_at     TEXT DEFAULT (datetime('now')),
            UNIQUE(match_id, country, broadcaster_id)
        );

        -- RankIt Android yayinlari. Dagitim su an sideload: derleme tek
        -- makinede birikiyordu (8 APK, kayit yok, sagalama yok, "guncel olan
        -- hangisi" sorusunun cevabi yok). Dosya Railway volume'unda durur,
        -- burada yalnizca kaydi tutulur.
        -- version_code Android'in tamsayisi: guncelleme icin artmak ZORUNDA,
        -- o yuzden benzersiz.
        -- Katalog senkronizasyon gunlugu. Sync elle calistirilan bir script'ti
        -- ve zamanlanmis hale gelince tek soru onemli oluyor: "en son ne zaman
        -- basariyla calisti ve kac mac guncellendi?" Bunu disaridan gormenin
        -- hicbir yolu yoktu; sessizce bozulan bir job ile hic kurulmamis bir
        -- job ayirt edilemiyordu. Her calisma -- basarili ya da degil -- buraya
        -- bir satir birakir; /api/rankit/sync-health bunu okur.
        CREATE TABLE IF NOT EXISTS rankit_sync_runs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            provider     TEXT NOT NULL,          -- nba | euroleague | football
            season       TEXT NOT NULL,
            ok           INTEGER NOT NULL,       -- 0/1
            matches      INTEGER NOT NULL DEFAULT 0,
            players      INTEGER NOT NULL DEFAULT 0,
            links        INTEGER NOT NULL DEFAULT 0,
            pruned       INTEGER NOT NULL DEFAULT 0,
            stale        INTEGER NOT NULL DEFAULT 0,   -- saglayici bos dondu, cache kullanildi
            error        TEXT NOT NULL DEFAULT '',
            duration_ms  INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_rankit_sync_runs_lookup
            ON rankit_sync_runs(provider, created_at DESC);

        CREATE TABLE IF NOT EXISTS rankit_app_releases (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            version_name  TEXT NOT NULL,
            version_code  INTEGER NOT NULL UNIQUE,
            channel       TEXT NOT NULL DEFAULT 'alpha',
            notes         TEXT NOT NULL DEFAULT '',
            file_name     TEXT NOT NULL,
            size_bytes    INTEGER NOT NULL,
            sha256        TEXT NOT NULL,
            uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS mobile_auth_codes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            code_hash   TEXT UNIQUE NOT NULL,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at  TEXT NOT NULL,
            used_at     TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_rankit_matches_start ON rankit_matches(starts_at);
        CREATE INDEX IF NOT EXISTS idx_rankit_matches_comp_status_start
            ON rankit_matches(competition_id,status,starts_at);
        CREATE INDEX IF NOT EXISTS idx_rankit_matches_provider_status_start
            ON rankit_matches(provider,status,starts_at);
        CREATE INDEX IF NOT EXISTS idx_rankit_diary_user ON rankit_diary_entries(user_id, watched_date DESC);
        CREATE INDEX IF NOT EXISTS idx_rankit_diary_match ON rankit_diary_entries(match_id);
        -- ── Doğrulanmış maç kadrosu ──────────────────────────────────────────
        -- rankit_match_players SEZON kadrosunu tutuyor (243k satırın hepsinde
        -- starter=1, yani o bayrak anlamsız). Bunlar AYRI: sağlayıcının o maça
        -- özel açıkladığı 11 + yedekler, diziliş ve teknik direktörle birlikte.
        -- Ayrı durmalarının sebebi arayüzün "sezon kadrosu mu, gerçek 11 mi"
        -- sorusunu dürüstçe cevaplayabilmesi — kullanıcının şikayeti buydu.
        CREATE TABLE IF NOT EXISTS rankit_match_lineups (
            match_id     INTEGER NOT NULL REFERENCES rankit_matches(id) ON DELETE CASCADE,
            team_id      INTEGER NOT NULL REFERENCES rankit_teams(id) ON DELETE CASCADE,
            side         TEXT NOT NULL CHECK(side IN ('home','away')),
            formation    TEXT,                 -- "4-2-3-1"
            coach_name   TEXT,
            source       TEXT NOT NULL DEFAULT 'provider',
            confirmed_at TEXT,                 -- ne zaman doğrulandı: kadro maç
                                               -- saatine kadar değişebilir
            PRIMARY KEY (match_id, team_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_match_lineup_players (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id           INTEGER NOT NULL REFERENCES rankit_matches(id) ON DELETE CASCADE,
            team_id            INTEGER NOT NULL REFERENCES rankit_teams(id) ON DELETE CASCADE,
            provider_player_id INTEGER,
            name               TEXT NOT NULL,
            shirt_no           INTEGER,
            role               TEXT NOT NULL CHECK(role IN ('start','bench')),
            -- Diziliş sırası: FotMob 11'i formasyon düzeninde veriyor (0=kaleci),
            -- yani sıra bilgi taşıyor, korunuyor.
            ord                INTEGER NOT NULL DEFAULT 0,
            UNIQUE(match_id, team_id, role, ord)
        );

        -- ── Rank: kazanilmis konum (HANDOFF §7.1) ────────────────────────────
        -- DEFTER, toplam degil. Her odul bir satir; kullanicinin puani her zaman
        -- SUM() ile turetilir. Sebep: §7.1 "puan mac basina BIR KEZ odenir,
        -- kayit silinirse geri alinir" diyor. Tek bir toplam sutunu bunu
        -- denetlenebilir kilmiyor -- yanlis giden bir odulu geri almak icin
        -- hangi odulun ne zaman verildigini bilmek gerekiyor.
        --
        -- UNIQUE(user, kind, subject) idempotensi ZORLAR: puani duzenlemek
        -- ikinci kez odeme yapamaz, cunku ayni satir iki kez yazilamaz.
        CREATE TABLE IF NOT EXISTS rankit_points (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind         TEXT NOT NULL,
            points       INTEGER NOT NULL,
            subject_type TEXT NOT NULL,
            subject_id   INTEGER NOT NULL,
            variant      TEXT NOT NULL DEFAULT 'A',
            created_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, kind, subject_type, subject_id)
        );

        -- Puan degerleri KODDA SABIT DEGIL: sahibi "uygun puani A/B testing ile
        -- belirleriz" dedi. Kol basina bir satir; kullanici id'sinden deterministik
        -- olarak kola atanir, yani ayni kullanici hep ayni kolu gorur.
        CREATE TABLE IF NOT EXISTS rankit_point_rules (
            kind    TEXT NOT NULL,
            variant TEXT NOT NULL DEFAULT 'A',
            points  INTEGER NOT NULL,
            note    TEXT,
            PRIMARY KEY (kind, variant)
        );

        -- Companion varliği (§7.1'in en yuksek tek odulu, o yuzden istismara
        -- en acik olani). Sahibin kurali: futbolda 45 dakika, baskette iki
        -- ceyrek. Sure BIRIKIR; esik gecilince bir kez odenir.
        CREATE TABLE IF NOT EXISTS rankit_companion_presence (
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            match_id   INTEGER NOT NULL REFERENCES rankit_matches(id) ON DELETE CASCADE,
            seconds    INTEGER NOT NULL DEFAULT 0,
            awarded_at TEXT,
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, match_id)
        );

        -- ── Companion: canli nabiz (ekran 5b "CROWD PULSE") ──────────────────
        -- Bu SAGLAYICININ momentum verisi DEGIL. Sahibin tanimi: "companion
        -- uzerindeki pulse mac canliyken verilen spektrum" — yani izleyenlerin
        -- o an verdigi COLD..HOT okumasi. FotMob'un momentum'u ayri bir sey
        -- ve karistirilirsa "kalabaligin nabzi" saglayicinin istatistigine
        -- donusur.
        --
        -- Her ORNEK saklanir, kullanici basina tek satir degil: 73'te verilen
        -- okuma 30'un ortalamasina girmemeli, yoksa zaman cizelgesi duzlesir.
        CREATE TABLE IF NOT EXISTS rankit_pulse_reads (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id   INTEGER NOT NULL REFERENCES rankit_matches(id) ON DELETE CASCADE,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            value      REAL NOT NULL,      -- 0..5, ısı rampasıyla ayni olcek
            minute     INTEGER NOT NULL,   -- mac dakikasi
            created_at TEXT DEFAULT (datetime('now'))
        );

        -- Anlar (ekran 5b "MOMENTS"). Saglayicidan geliyor; kadro icin zaten
        -- cagrilan matchDetails ayni yanitta tasiyor, ek istek yok.
        CREATE TABLE IF NOT EXISTS rankit_moments (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL REFERENCES rankit_matches(id) ON DELETE CASCADE,
            minute   INTEGER NOT NULL,
            kind     TEXT NOT NULL,        -- goal | card | own_goal
            label    TEXT NOT NULL,
            detail   TEXT,
            UNIQUE(match_id, minute, kind, label)
        );

        -- "148 marked this" — bir ani isaretleyenler.
        CREATE TABLE IF NOT EXISTS rankit_moment_marks (
            moment_id INTEGER NOT NULL REFERENCES rankit_moments(id) ON DELETE CASCADE,
            user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (moment_id, user_id)
        );

        -- Yanitlara respect (§6.1: "Respect replaces likes"). Incelemenin
        -- kendi respect'i rankit_review_likes'ta; yanitlarinki ayri, cunku
        -- ikisi ayri nesne ve §7.1'in 50 puanlik tavani yalnizca INCELEME
        -- icin gecerli.
        CREATE TABLE IF NOT EXISTS rankit_comment_respect (
            comment_id INTEGER NOT NULL REFERENCES rankit_review_comments(id) ON DELETE CASCADE,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (comment_id, user_id)
        );

        -- Sezon siralamalari (ekran 3d). Bunlar BIZIM verimiz DEGIL: saglayicinin
        -- yayimladigi lig cetveli. rankit_match_players sezon kadrosu, oradan
        -- gol/asist cikmiyor; rankit_moments'ta gol var ama yalnizca olay
        -- yoklamasi yapilmis maclar icin ve oyuncuya bagli degil, isim olarak.
        -- Bu yuzden ayri bir tablo: cetvel dogrudan kaynaktan aliniyor.
        --
        -- Tazeleme SIL-VE-YAZ: bir oyuncu ilk 40'tan dusebilir ve UPSERT onu
        -- listede birakirdi.
        CREATE TABLE IF NOT EXISTS rankit_player_stats (
            competition_id     INTEGER NOT NULL REFERENCES rankit_competitions(id) ON DELETE CASCADE,
            season             TEXT NOT NULL,
            stat               TEXT NOT NULL,   -- goals | assists | minutes
            rank               INTEGER NOT NULL,
            name               TEXT NOT NULL,
            provider_player_id INTEGER,
            team_name          TEXT,
            team_id            INTEGER REFERENCES rankit_teams(id) ON DELETE SET NULL,
            position           TEXT,
            value              REAL NOT NULL,
            matches            INTEGER,
            minutes            INTEGER,
            updated_at         TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (competition_id, season, stat, name)
        );

        -- Bildirimler (ekran 3f). Burada YALNIZCA OLAYLAR duruyor: biri
        -- respect verdi, biri yanitladi, biri takip etti. DURUMLAR (bu gece
        -- puanlanmamis sicak mac, bir mac kala kapanacak koleksiyon)
        -- yazilmiyor, okuma aninda turetiliyor -- cunku dogruluklari zamana
        -- bagli: "gece yarisindan once puanla" yarin yalan olur.
        --
        -- Metin de yazilmiyor, yalnizca REFERANS. Cumleyi arayuz kuruyor;
        -- kayitli ingilizce cumleler ifadeyi dondurur ve veri degisince
        -- (kulup adi, puan) sessizce eskir.
        CREATE TABLE IF NOT EXISTS rankit_notifications (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind       TEXT NOT NULL,   -- respect|reply|classic|follow|broadcast
            actor_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
            match_id   INTEGER REFERENCES rankit_matches(id) ON DELETE CASCADE,
            entry_id   INTEGER REFERENCES rankit_diary_entries(id) ON DELETE CASCADE,
            list_id    INTEGER REFERENCES rankit_lists(id) ON DELETE CASCADE,
            detail     TEXT,            -- yayinci adi gibi tek parca veri
            created_at TEXT DEFAULT (datetime('now')),
            read_at    TEXT
        );

        -- Ayni olay iki kez bildirilmez: respect geri alinip tekrar verilirse
        -- yeni bir satir dogmamali.
        --
        -- Sutun UNIQUE'i BU ISI YAPMIYOR: SQLite'ta NULL'lar birbirinden
        -- FARKLI sayilir, ve bir respect bildiriminin match_id/list_id'si
        -- NULL. Iki ayni satir sorunsuz giriyordu (test yakaladi). COALESCE'li
        -- ifade indeksi NULL'lari tek bir degere indiriyor.
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rankit_notify_once ON rankit_notifications(
            user_id, kind, COALESCE(actor_id,-1), COALESCE(entry_id,-1),
            COALESCE(match_id,-1), COALESCE(list_id,-1));
        -- Hesaba bagli ayarlar (ekran 3g). Burada YALNIZCA sunucunun
        -- davrandigi ayarlar duruyor. Cihaza bagli olanlar (skor gizleme,
        -- hareket azaltma, yayin ulkesi) localStorage'da kaliyor ve orada
        -- kalmalari kasitli: ayni hesapla telefonda skorlari gizleyip webde
        -- gostermek mesru bir istek (bkz. rankitPrefs.js).
        --
        -- Anahtar/deger, sabit sutunlar degil: her yeni ayar bir migration
        -- getirseydi 3g'yi genisletmek pahali olurdu.
        CREATE TABLE IF NOT EXISTS rankit_user_settings (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            key     TEXT NOT NULL,
            value   TEXT NOT NULL,
            PRIMARY KEY (user_id, key)
        );

        -- Listeye respect (ekran 3h). Tasarim burada kalp ve isi rengi ciziyor;
        -- ikisi de kendi kurallarini ciğniyor: §6.1 "Respect replaces likes"
        -- ve §1 "isi asla bir CTA degil". Bir liste de bir GORUS -- fiil
        -- respect, kontrol RankIt elmasi. Inceleme respect'inin tablosuyla
        -- ayni sekil.
        -- Listeyi kaydetmek (3h "38 saved"). rankit_follows DEGIL: onun CHECK
        -- kisiti hedefi user/team/player/competition ile sinirliyor ve SQLite
        -- CHECK'i ALTER edemiyor -- gercek takipleri tasiyan tabloyu yeniden
        -- kurmak yerine ayri tablo.
        CREATE TABLE IF NOT EXISTS rankit_list_saves (
            list_id    INTEGER NOT NULL REFERENCES rankit_lists(id) ON DELETE CASCADE,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (list_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS rankit_list_respect (
            list_id    INTEGER NOT NULL REFERENCES rankit_lists(id) ON DELETE CASCADE,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (list_id, user_id)
        );

        -- The Hunt (2m / 2n): koleksiyonlar URUNUN (§24), listeler kullanicinin.
        -- curated: sahibin admin ucundan kurdugu secki (maclar elle,
        -- declared_total tarihi aciklanmamis fiksturu de sayar). club_season /
        -- classics_year: veriden kurulan kural koleksiyonlari, satir yalnizca
        -- kimlik icin (uyeleri sorgudan). Bkz. api/rankit_hunt.py.
        CREATE TABLE IF NOT EXISTS rankit_collections (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            kind           TEXT NOT NULL CHECK(kind IN ('curated','club_season','classics_year')),
            title          TEXT,
            subtitle       TEXT,
            sport          TEXT,
            season         TEXT,
            competition_id INTEGER REFERENCES rankit_competitions(id) ON DELETE CASCADE,
            team_id        INTEGER REFERENCES rankit_teams(id) ON DELETE CASCADE,
            year           INTEGER,
            declared_total INTEGER,
            opens_note     TEXT,
            reward         TEXT,
            active         INTEGER NOT NULL DEFAULT 1,
            updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at     TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rankit_collection_items (
            collection_id INTEGER NOT NULL REFERENCES rankit_collections(id) ON DELETE CASCADE,
            match_id      INTEGER NOT NULL REFERENCES rankit_matches(id) ON DELETE CASCADE,
            PRIMARY KEY (collection_id, match_id)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_rankit_collection_club
            ON rankit_collections(competition_id, team_id) WHERE kind='club_season';
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rankit_collection_year
            ON rankit_collections(year) WHERE kind='classics_year';
        CREATE INDEX IF NOT EXISTS idx_rankit_collection_match ON rankit_collection_items(match_id);

        -- "@mara closed a collection" (7a / 2q): bir kullanicinin bir
        -- koleksiyonu tamamladigi an. Puan kaldirilip koleksiyon eksik kalirsa
        -- satir silinir (bkz. rankit_hunt.sync_completions).
        CREATE TABLE IF NOT EXISTS rankit_collection_completions (
            user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            collection_id INTEGER NOT NULL REFERENCES rankit_collections(id) ON DELETE CASCADE,
            completed_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, collection_id)
        );

        CREATE INDEX IF NOT EXISTS idx_rankit_notify ON rankit_notifications(user_id, read_at, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_rankit_player_stats ON rankit_player_stats(competition_id, season, stat, rank);
        CREATE INDEX IF NOT EXISTS idx_rankit_comments_entry ON rankit_review_comments(entry_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_rankit_watchalong_match ON rankit_watchalong_messages(match_id, room, id);
        CREATE INDEX IF NOT EXISTS idx_mobile_auth_code ON mobile_auth_codes(code_hash, expires_at);
        CREATE INDEX IF NOT EXISTS idx_rankit_release_code ON rankit_app_releases(version_code DESC);
        CREATE INDEX IF NOT EXISTS idx_rankit_bcast_match ON rankit_broadcasts(match_id, country);
        CREATE INDEX IF NOT EXISTS idx_rankit_bcast_rule ON rankit_broadcast_rules(competition_id, country);
        CREATE INDEX IF NOT EXISTS idx_rankit_lineup_match ON rankit_match_lineup_players(match_id, team_id, role, ord);
        CREATE INDEX IF NOT EXISTS idx_rankit_points_user ON rankit_points(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_rankit_pulse ON rankit_pulse_reads(match_id, minute);
        CREATE INDEX IF NOT EXISTS idx_rankit_team_logo ON rankit_team_logos(team_id);
        """)
        # Puan kollarini tohumla. INSERT OR IGNORE, yani A/B testi sirasinda
        # elle degistirilmis bir deger her acilista geri alinmaz.
        from .rankit_rank import seed_rules
        seed_rules(conn)
        # RankIt katalog senkronizasyonu: dis veri kaynagindaki mac kimligi
        # tekrar calistirmalarda ayni maci gunceller, kopya uretmez.
        # events_polled_at: canli olay yoklamasinda SIRA icin. En eski
        # yoklanan once gelir, boylece cok sayida canli macta hicbiri ac
        # kalmaz (bkz. rankit_live_sync.refresh_live_events).
        for col, dfn in [("provider", "TEXT"), ("provider_match_id", "TEXT"),
                         ("events_polled_at", "TEXT"), ("live_minute", "TEXT")]:
            try:
                conn.execute(f"ALTER TABLE rankit_matches ADD COLUMN {col} {dfn}")
            except Exception:
                pass
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_rankit_provider_match ON rankit_matches(provider, provider_match_id)")
        # 2f "result + events": golun / kartin hangi takima ait oldugu. Eski
        # satirlarda NULL; bir sonraki yoklamada saglayicinin isHome'uyla dolar.
        try:
            conn.execute("ALTER TABLE rankit_moments ADD COLUMN side TEXT")
        except Exception:
            pass
        # Beklenen isi (2h/16c): izleme listesine ekleyenin "bunu ne kadar
        # istiyorsun" okumasi, 1-5 isi basamagi. NULL = okuma vermedi; listede
        # olmak tek basina okuma degil. Bkz. rankit.set_appetite. Ekleme
        # idempotent: sutun varsa ALTER sessizce atlanir.
        try:
            conn.execute("ALTER TABLE rankit_watchlist ADD COLUMN appetite INTEGER")
        except Exception:
            pass
        # Kart basina toplam (izleyen/okuma) mac uzerinden sayiliyor; birincil
        # anahtar (user_id, match_id) bu sorguya yaramaz.
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rankit_watchlist_match ON rankit_watchlist(match_id)")
        # Uydurma kulup renklerini yeni palete tasi (sahibin karari, 2026-09-21).
        # Katalog senkronu yalnizca guncel sezonu taradigi icin, yalniz gecen
        # sezonda kalan kulupler (kume dusenler) eski -- bazilari altin --
        # rengini koruyordu. YALNIZCA rengi eski hash paletinin o ada verdigi
        # renk olan takimlar: gercek renkler (NBA_COLORS, elle girilenler)
        # eslesmez, dokunulmaz. Idempotent: tasindiktan sonra eslesme kalmaz.
        # Puanlamanin ANI ve istemcinin kayit kimligi. rated_at: yildiz ilk
        # verildiginde yazilir, kaldirilinca NULL; seri buna bakar (bkz.
        # rankit_rank.streak_for). Eski satirlara dokunulmaz -- NULL iken seri
        # onceki gibi created_at'i kullanir, kimsenin serisi degismez.
        # client_entry_id: cevrimdisi kuyrugun tekrar gonderdigi kayit ikinci
        # satir dogurmasin (HANDOFF §4.10). Kullanici basina tekil.
        # skin: kaydin koleksiyon kartini ve paylasim gorselini boyayan skin
        # (BUILD §4.2); NULL = Default.
        for col in ("rated_at", "client_entry_id", "skin"):
            try:
                conn.execute(f"ALTER TABLE rankit_diary_entries ADD COLUMN {col} TEXT")
            except Exception:
                pass
        conn.execute("""CREATE UNIQUE INDEX IF NOT EXISTS idx_rankit_diary_client
            ON rankit_diary_entries(user_id, client_entry_id) WHERE client_entry_id IS NOT NULL""")
        # Kadro satirlari (15d / 15b): oyuncu kimligi (POTM/respect oyu),
        # mevki, oyuna giris/cikis dakikasi, kimin yerine girdigi. Eski
        # satirlarda NULL; bir sonraki kadro yenilemesinde dolar.
        for col, dfn in [("player_id", "INTEGER"), ("position", "TEXT"),
                         ("position_code", "INTEGER"), ("sub_in", "INTEGER"),
                         ("sub_out", "INTEGER"), ("replaced", "TEXT")]:
            try:
                conn.execute(f"ALTER TABLE rankit_match_lineup_players ADD COLUMN {col} {dfn}")
            except Exception:
                pass
        from .rankit_colors import club_color, legacy_club_color
        for team_id, team_name, team_color in conn.execute(
                "SELECT id,name,color FROM rankit_teams").fetchall():
            if team_color and team_color.upper() == legacy_club_color(team_name):
                conn.execute("UPDATE rankit_teams SET color=? WHERE id=?",
                             (club_color(team_name), team_id))
        # Eski crest_url verisini yeni bağımsız logo tablosuna bir kez taşı.
        conn.execute("""INSERT OR IGNORE INTO rankit_team_logos(team_id,logo_url,source)
            SELECT id,crest_url,'legacy' FROM rankit_teams
            WHERE crest_url IS NOT NULL AND trim(crest_url)<>''""")
        # Migration: add columns to existing DBs that predate these fields
        # §6.1: bir yanit BIR KISIYE yoneliktir ve o handle yaziyla degil
        # yanit EYLEMIYLE uretilir. Yuvalama tek seviye, o yuzden agac
        # degil duz liste + "kime" sutunu.
        # client_id: istemcinin yanita verdigi kimlik -- sonucu belirsiz bir
        # gonderimin tekrari ikinci yanit dogurmasin (§5.4, HANDOFF §4.10).
        for col, dfn in [("reply_to_user_id", "INTEGER"), ("client_id", "TEXT")]:
            try:
                conn.execute(f"ALTER TABLE rankit_review_comments ADD COLUMN {col} {dfn}")
            except Exception:
                pass
        conn.execute("""CREATE UNIQUE INDEX IF NOT EXISTS idx_rankit_comment_client
            ON rankit_review_comments(user_id, client_id) WHERE client_id IS NOT NULL""")
        # SIRA ONEMLI: bu doldurma ALTER'DAN SONRA. Once yazilmisti ve TEMIZ
        # bir veritabaninda init_db "no such column: reply_to_user_id" ile
        # patliyordu -- gelistirme veritabaninda sutun zaten vardi, o yuzden
        # gorunmedi; testler yakaladi.
        #
        # §6.1 geriye donuk: sutun eklenmeden once yazilmis yorumlarin adresi
        # yok. Anlamca hepsi INCELEMENIN YAZARINA yazilmisti (bir incelemenin
        # altina yorum birakmak buydu), o yuzden oraya baglaniyorlar.
        # Adressiz bir yanit arayuzde yarim gorunur.
        conn.execute("""UPDATE rankit_review_comments
                        SET reply_to_user_id=(SELECT e.user_id FROM rankit_diary_entries e
                                              WHERE e.id=rankit_review_comments.entry_id)
                        WHERE reply_to_user_id IS NULL""")
        for col, dfn in [
            ("is_banned",     "INTEGER NOT NULL DEFAULT 0"),
            ("reset_token",   "TEXT"),
            ("reset_expires", "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} {dfn}")
            except Exception:
                pass
        # v3.5: sezon simülasyonu sonuçları + oyun modu
        for col, dfn in [
            ("wins",          "INTEGER"),
            ("season_result", "TEXT"),
            ("sim_era",       "TEXT"),
            ("mode",          "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE lineup_games ADD COLUMN {col} {dfn}")
            except Exception:
                pass
        # Faz 3: With a Friend — round-bazlı/pick-bazlı çark alt-modu odaya kayıtlı
        try:
            conn.execute("ALTER TABLE game_rooms ADD COLUMN wheel_mode TEXT NOT NULL DEFAULT 'round'")
        except Exception:
            pass
        # RankIt 0.4: Avrupa kupalarında ön eleme, play-off ve ana aşama
        # maçlarını aynı turnuva altında ayrıştırır.
        try:
            conn.execute("ALTER TABLE rankit_matches ADD COLUMN stage TEXT")
        except Exception:
            pass
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rankit_matches_comp_stage ON rankit_matches(competition_id,stage)")
        # 2026-07 dayanıklılık: canlı oyun state'i (ROOM_STATES, önceden sadece
        # bellekte) her değişiklikte buraya JSON olarak yazılır — sunucu restart
        # olursa (deploy/crash) aktif maçlar artık kaybolmuyor, DB'den geri
        # yükleniyor (bkz. api/game_ws.py _save_state/_restore_state).
        try:
            conn.execute("ALTER TABLE game_rooms ADD COLUMN state_json TEXT")
        except Exception:
            pass
        # Faz 4 (Online Opponent — Board Challenge): tam oyuncu satırlarını
        # (arketip skorları dahil) tutar, lineup_json (sadece isim) yetersiz
        # kalıyordu — bkz. docs/online-mode-backend-prompt.md "Yapılacak 2".
        # NULL = eski kayıt, board listesine hiç girmez (isim eşleştirmeye
        # düşmeden sessizce dışlanır).
        try:
            conn.execute("ALTER TABLE lineup_games ADD COLUMN roster_json TEXT")
        except Exception:
            pass
        # Rewrite History → Board Challenge: bir Single Player koşusu gerçek
        # bir sezon/takımın yerine geçtiyse burada saklanır (NULL = Quick Sim,
        # normal davranış). Board Challenge'da bu bilgi meydan okuyana taşınır
        # — o da AYNI sezondan FARKLI bir takımı kendi bonus koşusu için seçer.
        for col, dfn in [
            ("real_season", "TEXT"),
            ("real_team",   "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE lineup_games ADD COLUMN {col} {dfn}")
            except Exception:
                pass

        # saved_rosters.sport — futbol kadrolari (18 kisi, dizilis kodu) ile
        # basketbol kadrolari (9 kisi, classic/salarycap) ayni tabloyu
        # paylasiyor. Mevcut satirlarin hepsi basketbol.
        try:
            conn.execute("ALTER TABLE saved_rosters ADD COLUMN "
                         "sport TEXT NOT NULL DEFAULT 'basketball'")
        except Exception:
            pass

        # football_h2h_rooms.draft_state_json — oda içi canlı draft durumu
        # (sıra, havuz, iki kadro). Basketbolun game_rooms.state_json'ıyla aynı
        # gerekçe: durum yalnız bellekte dururken deploy/çökme aktif draftı
        # siliyordu. Her seçimde buraya yazılıyor, bağlantı yeniden kurulunca
        # buradan geri yükleniyor (bkz. api/football_ws.py).
        try:
            conn.execute("ALTER TABLE football_h2h_rooms ADD COLUMN draft_state_json TEXT")
        except Exception:
            pass
        # Oda hangi akışta: 'submit' = bitmiş XI gönder (eski yol),
        # 'draft' = odada sırayla draft. Eski satırlar submit.
        try:
            conn.execute("ALTER TABLE football_h2h_rooms ADD COLUMN "
                         "flow TEXT NOT NULL DEFAULT 'submit'")
        except Exception:
            pass
