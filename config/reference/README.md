# Yahoo referans verisi (2026-27, sezon öncesi)

Yahoo API onayı gelene kadar (docs/FANTASY_PLAN.md Faz 5) elimizdeki en iyi gerçek-dünya verisi.
Kullanıcı tarafından Yahoo'nun sitesinden elle aktarıldı, 2026-09-29. Yahoo API gelince bu dosyalar
API çıktısıyla değiştirilir; **iki tür veriyi karıştırma:**

| Dosya | Ne | Neye yarar |
|---|---|---|
| `yahoo_adp_2026-27.tsv` | **Gerçek ADP** (Basic ADP: Preseason / All Drafts), %Drafted, sakatlık etiketi (Q/P/O) | "Piyasa": mock draft botları, `market_adp()`, "değer / ADP farkı" |
| `yahoo_rank_9cat_2026-27.tsv` | Yahoo'nun 9-CAT **değer sıralaması** (ADP değil) + pozisyon + takım | Değerleme kıyası, pozisyon uygunluğu, takım doğrulaması |
| `yahoo_rank_points_2026-27.tsv` | Yahoo'nun PUAN ligi değer sıralaması | Puan formatı değerleme kıyası |
| `yahoo_rank_highscore_2026-27.tsv` | Yahoo'nun HIGH SCORE değer sıralaması | High Score değerleme kıyası |
| `yahoo_default_top200_2026-27.txt` | Yahoo "Top 200 Default Rankings - Standard" (pozisyonsuz, daha eski anlık görüntü) | Yalnızca ilk piyasa modeli uydurması için kullanıldı; ADP ile değiştirildi |

## Dikkat edilecekler
- **ADP ≠ sıralama.** ADP insanların gerçekte kaçıncı sırada seçtiği; sıralama Yahoo'nun kendi projeksiyon/değer hesabı.
- **`pct_drafted < 50` olan ADP satırları güvenilmez:** o oyuncu az sayıda draftta seçilmiş, ortalama yalnız seçildiği yerleri gösteriyor (ör. Bronny James %3, ADP 98).
  `src/fantasy/reference.py` bunları ADP olarak kullanmaz.
- Ekran görüntüsü ~190 satır ADP içeriyor; sonrası Yahoo'da da boş ("-").
- Yahoo, sakatlıktan dönen yıldızları iskonto etmiyor (Tatum ADP 9.4, Haliburton 15.8, Trae Young 26.6, Embiid 50.9); bizim maç-sayısı modelimiz ediyor. Kullanıcı Yahoo'nun görüşüne daha yakın.
- Yahoo takım kısaltmaları: NOR→NOP, PHO→PHX, UTH→UTA (loader düzeltir).
