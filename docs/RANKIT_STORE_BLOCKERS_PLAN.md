# RankIt — Mağaza Engellerinin Kod Tarafı: Uygulama Planı

**Belge tarihi:** 26 Eylül 2026
**Üst belge:** `docs/RANKIT_STORE_LAUNCH_PLAN.md` (§2 eksikler, §10 yapılacaklar)
**Amaç:** Mağaza lansman planındaki kod tarafı engelleri hangi sırayla, hangi dosyalarda, hangi testlerle kapatacağımız.

> Takvimi belirleyen şey Play'in 14 günlük kapalı testi. O yüzden sıralama **"kapalı teste girebilir miyiz?"** sorusuna göre yapıldı:
> - **Paket A ve B** kapalı testten önce bitmeli.
> - **C** test sırasında yapılabilir.
> - **D** iOS'un önünü açar.
> - **E** bir karara bağlı.

---

## Özet

| Paket | İçerik | Engel | Efor | Kapalı testten önce mi? |
|---|---|---|---|---|
| **A — Hızlı düzeltmeler** | Yasal/destek bağlantıları, "Update" satırı, mağaza derleme kanalı, iOS `viewport-fit` | E2, E3, I4 | 1 gün | ✅ Evet |
| **B — Moderasyon** | Şikâyet, engelleme, gizleme, filtre, admin kuyruğu, topluluk kuralları + şartları kabul | E1 | 4–6 gün | ✅ Evet |
| **C — İşletme** | Sentry, uptime + senkron sağlığı, yerel paylaşım, erişilebilirlik | Ö1, Ö3, Ö6, Ö8 | 2–3 gün | Test sırasında |
| **D — iOS hazırlığı** | iOS projesi, giriş kararı, geri/kapat denetimi, güvenli token deposu | I1, I3, I5, Ö5 | 3–4 gün | iOS için |
| **E — Medya lisansı (ara çözüm)** | Arma/fotoğraf yerine renkli rozet (bayrakla) | §6-B | 1–2 gün | Karar verilirse |

**Toplam:** yaklaşık **11–16 geliştirme günü**. A + B bitince (≈ 1 hafta) Play kapalı testi başlayabilir.

Her paket için aynı teslim kuralı:
- testler (backend pytest + frontend node testleri) ve CI yeşil;
- tarayıcıda uçtan uca deneme;
- kullanıcı akışını değiştiren her şey önce sana sorulur;
- main'e senin onayınla gider.

---

## Paket A — Hızlı düzeltmeler (1 gün)

### A1. Uygulama içi yasal ve destek bağlantıları (E2)
- **Sorun:** `redesign/Settings.jsx` LEGAL grubu `<a href="/privacy-policy">`. Paketlenmiş uygulamada bu, `https://localhost/privacy-policy`'ye gider; mobil pakette o sayfa yok, uygulama kendini yeniden yükler.
- **Çözüm:**
  - `openExternal(path)` yardımcısı: uygulamada `Browser.open({ url: API_ROOT + path })`, web'de normal bağlantı.
  - LEGAL grubu: Privacy policy, Terms of service, **Community guidelines** (B'de eklenecek sayfa), **Contact & support** (`/contact`).
- **Dosyalar:** `frontend/src/rankit/redesign/Settings.jsx`, küçük bir `rankit/openExternal.js`.
- **Test:** sözleşme testi. Uygulama Ayarlar'ında göreli `href="/…"` kalmamalı; dört bağlantı `openExternal` üzerinden açılmalı.

### A2. Mağaza derleme kanalı + "Update RankIt" (E3)
- **Çözüm:** yeni derleme kanalı değişkeni `VITE_RANKIT_CHANNEL`:
  - `sideload`: bugünkü APK. Update satırı ve `/rankit/download` görünür.
  - `store`: Play/App Store. Update satırı yok, uygulama içinde APK'ya işaret eden hiçbir şey yok.
- **Uygulama:**
  - `.env.rankit-store` + `npm run build:rankit-store` betiği (`vite build --mode rankit-store`); `android:sync` mağaza için bu betiği kullanır.
  - `no-secrets-in-bundle` testinin izin listesine `VITE_RANKIT_CHANNEL` eklenir (gerekçesiyle).
- **Test:**
  - store derlemesinde "Update RankIt" metni ve `/rankit/download` bağlantısı pakette yok;
  - sideload derlemesinde var.

### A3. iOS güvenli alanı (I4)
- **Sorun:** `index.html`'de `viewport-fit=cover` yok; iOS'ta `env(safe-area-inset-*)` 0 döner.
- **Çözüm:** Vite eklentisi (`transformIndexHtml`) yalnız mobil modlarda (`rankit-mobile`, `rankit-store`) viewport meta'sına `viewport-fit=cover` ekler. Sitenin kendisi değişmez; mobil Safari'de site sayfaları çentiğe taşmasın.
- **Test:** mobil build'in `index.html`'inde var, site build'inde yok.

---

## Paket B — Kullanıcı içeriği moderasyonu (4–6 gün)

> **Durum (2026-09-26): uygulandı** — backend (`api/rankit.py` moderasyon bölümü,
> `api/moderation_words.py`, `tests/test_rankit_moderation.py`) ve arayüz
> (`ContentActions`, Settings → Blocked accounts, `/admin/reports`,
> `/community-guidelines`, kayıt onayı, "Updated terms" bandı). Canlıda admin
> e-postası için Railway'e `ADMIN_ALERT_EMAIL` eklenmeli; yoksa şikâyetler yalnız
> kuyrukta görünür.

**Mağaza şartı** (Apple 1.2, Play UGC):
1. zararlı içerik filtresi;
2. içerik şikâyeti ve zamanında yanıt;
3. kötüye kullanan kullanıcıyı engelleme;
4. yayınlanmış iletişim bilgisi;
5. kullanım şartlarında "sıfır tolerans" ve kullanıcının bunları kabul etmesi.

**Kapsanacak içerik** (şemadan çıkarıldı):

| Hedef | Tablo | Görünen yer |
|---|---|---|
| İnceleme metni | `rankit_diary_entries.review` | AllReviews, FriendsFeed, ReviewThread, MemberProfile, web Inspector |
| İnceleme yorumu | `rankit_review_comments.content` | ReviewThread |
| Liste başlık/açıklama | `rankit_lists.title/description` | ListShelf, liste sayfası |
| Watchalong mesajı | `rankit_watchalong_messages.content` | CompanionPanel (canlı) |
| Kullanıcı (ad/profil) | `users.username` | MemberProfile, PeopleList, FindPeople |

### B1. Veri modeli (`api/db.py`)
- `rankit_reports`:
  - alanlar: `reporter_id → users CASCADE`, `target_type IN ('review','comment','list','message','user')`, `target_id`, `reason IN ('spam','harassment','hate','sexual','spoiler','other')`, `note` (≤300), `status IN ('open','actioned','dismissed')`, `created_at`, `handled_by`, `handled_at`;
  - `UNIQUE(reporter_id, target_type, target_id)`: aynı kişi aynı şeyi bir kez şikâyet eder.
- `rankit_blocks`:
  - alanlar: `blocker_id`, `blocked_id` (ikisi de `users CASCADE`), `created_at`;
  - `PRIMARY KEY(blocker_id, blocked_id)`.
- Gizleme sütunları: `hidden_at`, `hidden_reason` → `rankit_diary_entries` (yalnız inceleme METNİ gizlenir, puan kalır), `rankit_review_comments`, `rankit_lists`, `rankit_watchalong_messages`.
- `_delete_account` şema bekçisi yeni tabloları otomatik denetler (CASCADE ile tanımlanacak).

### B2. Uçlar (`api/rankit.py`)
- `POST /reports {target_type, target_id, reason, note?}`:
  - giriş gerekli; kendini/kendi içeriğini şikâyet edemez;
  - hedef var mı diye bakılır;
  - hız sınırı: saatte 20.
- **Otomatik gizleme:** bir hedef **3 farklı kişiden** açık şikâyet alırsa inceleme beklemeden gizlenir. 24 saatlik yanıt taahhüdünü korur; admin geri açabilir.
- `PUT /people/{id}/block` / `DELETE /people/{id}/block` / `GET /blocks`:
  - engelleyince iki yöndeki takip de silinir;
  - engellenen kişi engelleyeni takip edemez, onun incelemelerine yorum yazamaz.
- **Admin:**
  - `GET /admin/reports?status=open`: hedefe göre gruplu, içerik anlık görüntüsüyle;
  - `POST /admin/reports/{id}/action {hide | unhide | dismiss | delete | ban}`, `require_admin` + `ADMIN AUDIT` logu.
- **Admin'e haber:** hedefin ilk şikâyetinde e-posta (Brevo, `ADMIN_ALERT_EMAIL`). Günde en çok N e-posta, gerisi özet.

### B3. Filtreleme (en çok dikkat isteyen kısım)
- Merkezi yardımcı: `_not_hidden_sql(alias)` + `_not_blocked_sql(user_col, viewer)`. Engel **iki yönlü**: ben onu ya da o beni engellediyse birbirimizi görmeyiz.
- Uygulanacak yerler:
  - `_visible_entries_sql()` (profil, ortalama, zevk uyumu);
  - maç incelemeleri, "en saygın incelemeler";
  - arkadaş akışı ve etkinlik;
  - yorum listesi;
  - liste sayfaları ve raf;
  - kişi arama ve öneriler;
  - bildirimler (engellenen kişiden bildirim gelmez).
- **Watchalong:** bağlantı listesine kullanıcı kimliği eklenir; mesaj, alıcı ile gönderen arasında engel varsa o alıcıya gönderilmez. Gizlenen mesaj arşivde de görünmez.
- **Toplam sayılar** (ısı ortalaması, puan sayısı) etkilenmez: engel yalnız içeriği ve kişiyi gizler, puan istatistiği ortak kalır. Bu bilinçli bir karar, testle kilitlenir.

### B4. İçerik filtresi (gönderirken)
- Yorum, sohbet, liste başlığı ve inceleme metninde:
  - küçük bir TR+EN küfür/hakaret listesi → gönderim reddedilir: "This contains language that isn't allowed";
  - yorum ve sohbette bağlantı yasak (spam'in ana yolu).
- İnceleme ve yorum için gönderim sınırı: kullanıcı başına dakikada 5 (sohbet zaten 10 sn'de 5).
- Liste `api/moderation_words.py`'de; genişletilebilir, testli.

### B5. Arayüz — uygulama (RankIt redesign)
- **Ortak bileşen `ContentActions`:** "⋯" düğmesi → alt sayfa ("Report", "Block @kullanıcı"); Report → sebep seçimi → gönder → "Thanks — we'll review this within 24 hours".
- **Yerleşim:**
  - inceleme kartları (AllReviews, FriendsFeed);
  - ReviewThread (inceleme başlığı + her yorum);
  - liste sayfası başlığı;
  - CompanionPanel mesajı (uzun basış ya da ⋯);
  - MemberProfile başlığı (Report + Block, takip düğmesinin yanında).
- **Engelledikten sonra:** o kişinin içeriği ekrandan hemen kalkar (yeniden yükleme); profil "You blocked @x · Unblock" gösterir.
- **Settings → PRIVACY → "Blocked accounts"** listesi ve engel kaldırma.
- **Erişilebilirlik:** sheet'ler `useDialog` ile (odak tuzağı, Escape, geri tuşu); dokunma hedefleri ≥44px.

### B6. Arayüz — web
- **RankIt web (Inspector topluluk sekmesi, üye sayfası):** aynı eylemler.
- **Site admin:** yeni `pages/admin/Reports.jsx` (LineupModeration örüntüsü):
  - kuyruk, içerik önizleme, sebep sayıları;
  - hide / unhide / dismiss / ban düğmeleri;
  - Admin menüsüne bağlantı.

### B7. Şartlar ve kabul
- Yeni **Community Guidelines** sayfası (`/community-guidelines`):
  - izin verilmeyen içerik;
  - şikâyetlerin 24 saatte incelendiği;
  - tekrarında hesabın kapatıldığı.
- Terms of Service'e UGC ve sıfır tolerans maddesi.
- **Kabul:**
  - Register sayfasında zorunlu onay kutusu ("I agree to the Terms and Community Guidelines");
  - Google ile ilk girişte aynı metin ("By continuing you agree…").
  - Uygulamada hesap sitede açıldığı için kabul orada kalır.
  - İsteğe bağlı olarak uygulamanın ilk açılışında (FirstRun) kısa bir satır.
- **Mevcut kullanıcılar:** bir sonraki girişte "Updated terms" bilgilendirmesi (engellemeyen bir bant).

### B8. Testler
- **Backend** (`tests/test_rankit_moderation.py`):
  - şikâyet tekrar etmez;
  - kendini şikâyet edemez;
  - 3 şikâyette otomatik gizleme;
  - admin eylemleri + yetki;
  - engelin **her yüzeyde** (her sorgu için ayrı test) içeriği gizlemesi;
  - watchalong'da engellenen kişinin mesajının iletilmemesi;
  - filtre (TR/EN örnekleri, bağlantı);
  - hesap silince şikâyet ve engellerin temizlenmesi.
- **Frontend:**
  - `ContentActions` her yüzeyde var (sözleşme testi);
  - Settings'te engellenenler listesi;
  - Register'da onay kutusu zorunlu.
- **Tarayıcıda:**
  - A kullanıcısı B'nin incelemesini şikâyet eder, üç kişi şikâyet edince inceleme gizlenir, admin geri açar;
  - A B'yi engeller, B'nin incelemesi ve yorumu A'da görünmez, B de A'yı görmez.

---

## Paket C — İşletme hazırlığı (2–3 gün, kapalı test sırasında)

### C1. Hata/çökme izleme (Ö1)
- **Frontend:** `@sentry/capacitor` + `@sentry/react` (uygulama) ve `@sentry/react` (site).
- **Backend:** `sentry-sdk[fastapi]`.
- **Gizlilik:**
  - `send_default_pii=False`;
  - `before_send`'de `Authorization`, `token=`, `code=` temizlenir (Faz 2'deki log maskesiyle aynı kalıp);
  - kullanıcı kimliği yalnız sayısal id.
- **DSN:** Sentry DSN tasarım gereği açıktır; `VITE_SENTRY_DSN` izin listesine gerekçesiyle eklenir.
- **Beyan:** Data safety ve Apple etiketlerine "Crash logs / Diagnostics" eklenir; gizlilik politikasına Sentry satırı.
- **Karar:** Sentry'yi sen onaylarsan (lansman planı §8 karar 5).

### C2. Canlılık ve senkron sağlığı (Ö3)
- `GET /api/rankit/health/sync`: son başarılı katalog/canlı senkron zamanı ve son hata. Eşik aşılırsa 503 döner, izleme aracı bunu alarm sayar.
- UptimeRobot (ücretsiz): `/api/health` ve `/api/rankit/health/sync`.
- Senkron art arda N kez başarısız olursa admin e-postası.

### C3. Yerel paylaşım (Ö8)
- `@capacitor/share` → oyun sonucu ve koleksiyon kartı paylaşımı Android/iOS paylaşım sayfasını açar.
- Bu eklenti yeni APK gerektirir (`cap sync`).
- Büyüme planındaki "bağlantılı paylaşım" (G1) bununla birleşir.

### C4. Erişilebilirlik (Ö6)
- `mobile.md` backlog'u:
  - sheet'ler diyalog değil → `useDialog` (zaten var) tüm sheet'lere;
  - filtre çipleri 38px → 44px;
  - kontrast taraması.

---

## Paket D — iOS hazırlığı (3–4 gün)

### D1. iOS projesi (I1)
- `@capacitor/ios` (Capacitor 8, Swift Package Manager) → `npx cap add ios`.
- **Info.plist:**
  - `CFBundleURLTypes` → `rankit` şeması;
  - `ITSAppUsesNonExemptEncryption = NO`;
  - görünen ad.
- İkon ve açılış ekranı: `@capacitor/assets` ile mevcut `rankit_launcher` kaynaklarından.
- Proje dosyaları repoya girer. İmzalama bilgileri girmez (fastlane match ya da App Store Connect API anahtarı CI gizli değişkeninde).
- **Derleme:** Mac ya da GitHub Actions macOS iş akışı (`ios.yml`): `cap sync ios` → `xcodebuild archive` → TestFlight (fastlane). Ayrıntılar karar 3'e bağlı.

### D2. Giriş seçeneği (I3) — karar 4
- **(b) Hızlı yol:**
  - uygulama giriş sayfasını `?client=ios` ile açar;
  - `RankItMobileAuth` / Login bu parametreyle Google düğmesini gizler, yalnız Primary Arch e-posta/şifre kalır;
  - Apple 4.8'in "yalnız kendi hesap sistemin" istisnasına girer.
- **(a) Tam yol:**
  - Apple ile giriş: Services ID + anahtar;
  - backend `/api/auth/apple` (Apple JWKS ile imza, `aud` ve `iss` doğrulama; e-posta gizleme desteği);
  - web'de düğme.
  - Hesap bağlama kuralları Google'daki önden ele geçirme korumasıyla aynı.

### D3. Geri/kapat denetimi (I5)
- `useBackClose` / `backButton` kullanan 16 dosya tek tek gezilir; iOS'ta donanım geri yok, her yüzeyde görünür "Back/Close" olmalı.
- Denetim bir tarayıcı betiğiyle yapılır: her yüzey açılır, "Escape'siz ve geri tuşsuz, yalnız tıklayarak çıkılabiliyor mu?" diye bakılır.

### D4. Güvenli token deposu (Ö5)
- Keychain (iOS) / Keystore (Android) destekli bir güvenli depolama eklentisi. Token açılışta oradan okunur; `localStorage`'daki eski token bir kez taşınıp silinir.
- Web `localStorage`'da kalır (tarayıcıda keychain yok; XSS korumaları Faz 2'de yapıldı).

---

## Paket E — Medya lisansı ara çözümü (1–2 gün, karar 2 "B" ise)

- Derleme bayrağı `VITE_RANKIT_TEAM_MEDIA=licensed|badges`; mağaza derlemesinde `badges`.
- **`badges` modunda:**
  - takım armaları yerine takım rengi (`api/rankit_colors.py` `club_color`) + kısa ad rozeti;
  - oyuncu fotoğrafları yerine baş harfler;
  - oyun modülünde NBA CDN fotoğrafları kapalı (`arcade/ui.jsx` Avatar zaten baş harfe düşebiliyor).
- **Backend:** `images.fotmob.com` ve `cdn.nba.com` URL'leri API cevabında yalnız `licensed` modunda döner. Mağaza derlemesi bunları hiç istemez.
- **Mağaza metinleri:** "not affiliated with the NBA, leagues or clubs" ibaresi uygulamanın Hakkında satırına ve mağaza açıklamasına.

---

## Sıra ve takvim (lansman planı §5 ile hizalı)

| Gün | İş |
|---|---|
| 1 | A1–A3 → main |
| 2–6 | B1–B8 (önce backend + testler, sonra uygulama arayüzü, sonra web ve admin) → main |
| 6 | Play **internal** test derlemesi (store kanalı, yeni sürüm kodu) → **closed test başlar** |
| 7–9 | C1–C4 (kapalı test geri bildirimiyle birlikte) |
| 9–12 | D1–D4 (Mac/CI hazır olunca) → TestFlight |
| karar gelince | E |

**Senin tarafında paralel yürüyecekler:** hesapların açılması, yasal metinler, test grubu, anahtar üretimi.

---

## Riskler

- **Engel filtresinin her sorguya uygulanması:** Bir yüzey atlanırsa engellenen kişinin içeriği orada görünür. Önlem: her yüzey için ayrı test + tarayıcıda iki hesapla deneme.
- **Otomatik gizlemenin kötüye kullanımı:** Üç sahte hesapla birinin incelemesi gizletilebilir. Önlem: gizleme geçici, admin kuyruğunda üstte; yeni açılmış (24 saatten genç) hesapların şikâyeti eşiğe sayılmaz.
- **Küfür listesinin yanlış pozitifleri:** Kelime sınırıyla eşleşme, test örnekleri ve kolay güncellenebilir liste.
- **Yeni APK gerektiren işler** (A2, C3, D4): Kural 2 — APK senin sözünle ve birikmiş işle alınır. Sıralama bunu gözetir: store kanalı ilk AAB'de hepsini taşır.
